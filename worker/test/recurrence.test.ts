import { describe, expect, it } from "vitest";
import { eventsIn } from "../src/caldav";

const FROM = new Date("2026-09-07T00:00:00Z");
const TO = new Date("2026-09-14T00:00:00Z");

/** A VCALENDAR around the given lines, which are the body of one VEVENT. */
function ics(...vevents: string[][]): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//test//EN",
    ...vevents.flatMap(lines => ["BEGIN:VEVENT", ...lines, "END:VEVENT"]),
    "END:VCALENDAR",
  ].join("\r\n");
}

function starts(events: { start: string }[]): string[] {
  return events.map(event => event.start);
}

describe("non-recurring events", () => {
  it("passes one through unchanged", () => {
    const events = eventsIn(ics([
      "UID:plain",
      "DTSTART:20260908T090000Z",
      "DTEND:20260908T100000Z",
      "SUMMARY:OPEN",
    ]), FROM, TO);

    expect(events).toEqual([{
      uid: "plain",
      summary: "OPEN",
      start: "2026-09-08T09:00:00.000Z",
      end: "2026-09-08T10:00:00.000Z",
    }]);
  });

  // Under <c:expand> the server was obliged to return UTC, so this is the case
  // that only arises now that the raw event is what comes back.
  it("resolves a TZID against the VTIMEZONE it arrives with", () => {
    const withZone = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//test//EN",
      "BEGIN:VTIMEZONE",
      "TZID:Europe/Helsinki",
      "BEGIN:DAYLIGHT",
      "TZOFFSETFROM:+0200",
      "TZOFFSETTO:+0300",
      "TZNAME:EEST",
      "DTSTART:19700329T030000",
      "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
      "END:DAYLIGHT",
      "BEGIN:STANDARD",
      "TZOFFSETFROM:+0300",
      "TZOFFSETTO:+0200",
      "TZNAME:EET",
      "DTSTART:19701025T040000",
      "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
      "END:STANDARD",
      "END:VTIMEZONE",
      "BEGIN:VEVENT",
      "UID:zoned",
      "DTSTART;TZID=Europe/Helsinki:20260908T120000",
      "DTEND;TZID=Europe/Helsinki:20260908T130000",
      "SUMMARY:OPEN",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    // September is EEST, +3, so noon local is 09:00Z. Read as floating it
    // would come back as 12:00Z.
    expect(starts(eventsIn(withZone, FROM, TO))).toEqual(["2026-09-08T09:00:00.000Z"]);
  });
});

describe("expansion", () => {
  const weekly = (...extra: string[]) => ics([
    "UID:weekly",
    // A Monday, eight weeks before the window.
    "DTSTART:20260713T090000Z",
    "DTEND:20260713T103000Z",
    "SUMMARY:OPEN",
    "RRULE:FREQ=WEEKLY",
    ...extra,
  ]);

  it("finds the occurrence of a master that starts long before the window", () => {
    const events = eventsIn(weekly(), FROM, TO);

    // 2026-09-07 is the Monday inside the window.
    expect(events).toEqual([{
      uid: "weekly",
      summary: "OPEN",
      start: "2026-09-07T09:00:00.000Z",
      end: "2026-09-07T10:30:00.000Z",
    }]);
  });

  it("keeps the rule anchored on the master's weekday, not on the window", () => {
    // The window opens on a Monday; a Tuesday series must stay on Tuesdays.
    const tuesday = ics([
      "UID:tuesday",
      "DTSTART:20260714T090000Z",
      "DTEND:20260714T100000Z",
      "SUMMARY:OPEN",
      "RRULE:FREQ=WEEKLY",
    ]);

    expect(starts(eventsIn(tuesday, FROM, TO))).toEqual(["2026-09-08T09:00:00.000Z"]);
  });

  it("keeps an occurrence that straddles the start of the window", () => {
    // A Sunday series running into Monday: the occurrence starts an hour
    // before the window opens and ends an hour after.
    const straddling = ics([
      "UID:straddling",
      "DTSTART:20260712T230000Z",
      "DTEND:20260713T010000Z",
      "SUMMARY:OPEN",
      "RRULE:FREQ=WEEKLY",
    ]);

    // The second occurrence starts an hour before the window closes, and so
    // is caught by the same overlap rule at the other end.
    expect(starts(eventsIn(straddling, FROM, TO)))
      .toEqual(["2026-09-06T23:00:00.000Z", "2026-09-13T23:00:00.000Z"]);
  });

  it("stops at the end of the window rather than following an endless rule", () => {
    const daily = ics([
      "UID:daily",
      "DTSTART:20260907T090000Z",
      "DTEND:20260907T100000Z",
      "SUMMARY:OPEN",
      "RRULE:FREQ=DAILY",
    ]);

    expect(eventsIn(daily, FROM, TO)).toHaveLength(7);
  });

  it("honours EXDATE", () => {
    expect(eventsIn(weekly("EXDATE:20260907T090000Z"), FROM, TO)).toEqual([]);
  });

  it("refuses a rule it cannot expand within the iteration bound", () => {
    const minutely = ics([
      "UID:minutely",
      "DTSTART:20200101T000000Z",
      "DTEND:20200101T000100Z",
      "SUMMARY:OPEN",
      "RRULE:FREQ=MINUTELY",
    ]);

    expect(() => eventsIn(minutely, FROM, TO)).toThrow(/exceeds 10000 occurrences/);
  });
});

describe("overrides", () => {
  const master = [
    "UID:weekly",
    "DTSTART:20260713T090000Z",
    "DTEND:20260713T103000Z",
    "SUMMARY:OPEN",
    "RRULE:FREQ=WEEKLY",
  ];

  it("takes the moved time and the changed summary from the override", () => {
    const events = eventsIn(ics(master, [
      "UID:weekly",
      "RECURRENCE-ID:20260907T090000Z",
      "DTSTART:20260907T140000Z",
      "DTEND:20260907T150000Z",
      "SUMMARY:Supervision",
    ]), FROM, TO);

    expect(events).toEqual([{
      uid: "weekly",
      summary: "Supervision",
      start: "2026-09-07T14:00:00.000Z",
      end: "2026-09-07T15:00:00.000Z",
    }]);
  });

  it("drops an occurrence cancelled through an override", () => {
    const events = eventsIn(ics(master, [
      "UID:weekly",
      "RECURRENCE-ID:20260907T090000Z",
      "DTSTART:20260907T090000Z",
      "DTEND:20260907T103000Z",
      "SUMMARY:OPEN",
      "STATUS:CANCELLED",
    ]), FROM, TO);

    expect(events).toEqual([]);
  });
});
