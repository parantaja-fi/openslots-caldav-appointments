import { describe, expect, it } from "vitest";
import { eventsIn } from "../src/caldav";

const FROM = new Date("2026-09-07T00:00:00Z");
const TO = new Date("2026-09-14T00:00:00Z");
const HELSINKI = "Europe/Helsinki";
const NEW_YORK = "America/New_York";

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
    ]), FROM, TO, HELSINKI);

    expect(events).toEqual([{
      uid: "plain",
      summary: "OPEN",
      start: "2026-09-08T09:00:00.000Z",
      end: "2026-09-08T10:00:00.000Z",
      transparent: false,
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

    // September is EEST, +3, so noon local is 09:00Z. Read as floating, in the
    // New York zone given, it would come back as 16:00Z.
    expect(starts(eventsIn(withZone, FROM, TO, NEW_YORK))).toEqual(["2026-09-08T09:00:00.000Z"]);
  });

  it("reads an event marked Free as transparent", () => {
    const events = eventsIn(ics([
      "UID:free",
      "DTSTART:20260908T090000Z",
      "DTEND:20260908T100000Z",
      "SUMMARY:Reminder",
      "TRANSP:TRANSPARENT",
    ]), FROM, TO, HELSINKI);

    expect(events.map(event => event.transparent)).toEqual([true]);
  });

  it("drops a cancelled event", () => {
    const events = eventsIn(ics([
      "UID:cancelled",
      "DTSTART:20260908T090000Z",
      "DTEND:20260908T100000Z",
      "SUMMARY:OPEN",
      "STATUS:CANCELLED",
    ]), FROM, TO, HELSINKI);

    expect(events).toEqual([]);
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
    const events = eventsIn(weekly(), FROM, TO, HELSINKI);

    // 2026-09-07 is the Monday inside the window.
    expect(events).toEqual([{
      uid: "weekly",
      summary: "OPEN",
      start: "2026-09-07T09:00:00.000Z",
      end: "2026-09-07T10:30:00.000Z",
      transparent: false,
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

    expect(starts(eventsIn(tuesday, FROM, TO, HELSINKI))).toEqual(["2026-09-08T09:00:00.000Z"]);
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
    expect(starts(eventsIn(straddling, FROM, TO, HELSINKI)))
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

    expect(eventsIn(daily, FROM, TO, HELSINKI)).toHaveLength(7);
  });

  it("honours EXDATE", () => {
    expect(eventsIn(weekly("EXDATE:20260907T090000Z"), FROM, TO, HELSINKI)).toEqual([]);
  });

  it("refuses a rule it cannot expand within the iteration bound", () => {
    const minutely = ics([
      "UID:minutely",
      "DTSTART:20200101T000000Z",
      "DTEND:20200101T000100Z",
      "SUMMARY:OPEN",
      "RRULE:FREQ=MINUTELY",
    ]);

    expect(() => eventsIn(minutely, FROM, TO, HELSINKI)).toThrow(/exceeds 10000 occurrences/);
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
    ]), FROM, TO, HELSINKI);

    expect(events).toEqual([{
      uid: "weekly",
      summary: "Supervision",
      start: "2026-09-07T14:00:00.000Z",
      end: "2026-09-07T15:00:00.000Z",
      transparent: false,
    }]);
  });

  it("takes transparency from the override, not from its master", () => {
    const override = [
      "UID:weekly",
      "RECURRENCE-ID:20260907T090000Z",
      "DTSTART:20260907T090000Z",
      "DTEND:20260907T103000Z",
      "SUMMARY:OPEN",
    ];
    const busyInFree =
      eventsIn(ics([...master, "TRANSP:TRANSPARENT"], override), FROM, TO, HELSINKI);
    const freeInBusy =
      eventsIn(ics(master, [...override, "TRANSP:TRANSPARENT"]), FROM, TO, HELSINKI);

    expect(busyInFree.map(event => event.transparent)).toEqual([false]);
    expect(freeInBusy.map(event => event.transparent)).toEqual([true]);
  });

  it("drops an occurrence cancelled through an override", () => {
    const events = eventsIn(ics(master, [
      "UID:weekly",
      "RECURRENCE-ID:20260907T090000Z",
      "DTSTART:20260907T090000Z",
      "DTEND:20260907T103000Z",
      "SUMMARY:OPEN",
      "STATUS:CANCELLED",
    ]), FROM, TO, HELSINKI);

    expect(events).toEqual([]);
  });

  it("keeps the window's later occurrences when an earlier one is moved past its end", () => {
    const daily = [
      "UID:daily",
      "DTSTART:20260907T090000Z",
      "DTEND:20260907T100000Z",
      "SUMMARY:OPEN",
      "RRULE:FREQ=DAILY",
    ];
    const events = eventsIn(ics(daily, [
      "UID:daily",
      "RECURRENCE-ID:20260908T090000Z",
      "DTSTART:20261008T090000Z",
      "DTEND:20261008T100000Z",
      "SUMMARY:OPEN",
    ]), FROM, TO, HELSINKI);

    expect(starts(events)).toEqual([
      "2026-09-07T09:00:00.000Z",
      "2026-09-09T09:00:00.000Z",
      "2026-09-10T09:00:00.000Z",
      "2026-09-11T09:00:00.000Z",
      "2026-09-12T09:00:00.000Z",
      "2026-09-13T09:00:00.000Z",
    ]);
  });

  it("finds an occurrence moved into the window from beyond its end", () => {
    const events = eventsIn(ics(master, [
      "UID:weekly",
      "RECURRENCE-ID:20260921T090000Z",
      "DTSTART:20260910T090000Z",
      "DTEND:20260910T100000Z",
      "SUMMARY:Supervision",
    ]), FROM, TO, HELSINKI);

    expect(events).toEqual([{
      uid: "weekly",
      summary: "OPEN",
      start: "2026-09-07T09:00:00.000Z",
      end: "2026-09-07T10:30:00.000Z",
      transparent: false,
    }, {
      uid: "weekly",
      summary: "Supervision",
      start: "2026-09-10T09:00:00.000Z",
      end: "2026-09-10T10:00:00.000Z",
      transparent: false,
    }]);
  });

  // What Google returns for a series whose only overlap with the window is a
  // moved occurrence: the override alone, its master pruned.
  it("reads an override arriving without its master as the event it describes", () => {
    const events = eventsIn(ics([
      "UID:weekly",
      "RECURRENCE-ID:20260921T090000Z",
      "DTSTART:20260910T090000Z",
      "DTEND:20260910T100000Z",
      "SUMMARY:Supervision",
    ]), FROM, TO, HELSINKI);

    expect(events).toEqual([{
      uid: "weekly",
      summary: "Supervision",
      start: "2026-09-10T09:00:00.000Z",
      end: "2026-09-10T10:00:00.000Z",
      transparent: false,
    }]);
  });

  it("drops a cancelled override whose recurrence-id lies beyond the window's end", () => {
    const events = eventsIn(ics(master, [
      "UID:weekly",
      "RECURRENCE-ID:20260921T090000Z",
      "DTSTART:20260910T090000Z",
      "DTEND:20260910T100000Z",
      "SUMMARY:OPEN",
      "STATUS:CANCELLED",
    ]), FROM, TO, HELSINKI);

    expect(starts(events)).toEqual(["2026-09-07T09:00:00.000Z"]);
  });
});

describe("the window", () => {
  it("drops a single event the window does not reach, whatever the server sent", () => {
    const before = ics([
      "UID:before",
      "DTSTART:20260906T090000Z",
      "DTEND:20260907T000000Z",
      "SUMMARY:OPEN",
    ]);
    const after = ics([
      "UID:after",
      "DTSTART:20260914T000000Z",
      "DTEND:20260914T100000Z",
      "SUMMARY:OPEN",
    ]);

    expect(eventsIn(before, FROM, TO, HELSINKI)).toEqual([]);
    expect(eventsIn(after, FROM, TO, HELSINKI)).toEqual([]);
  });
});

describe("floating and all-day values", () => {
  it("reads an all-day event as that day in the zone given", () => {
    const allDay = ics([
      "UID:all-day",
      "DTSTART;VALUE=DATE:20260908",
      "DTEND;VALUE=DATE:20260909",
      "SUMMARY:Away",
    ]);

    expect(eventsIn(allDay, FROM, TO, HELSINKI)).toEqual([{
      uid: "all-day",
      summary: "Away",
      start: "2026-09-07T21:00:00.000Z",
      end: "2026-09-08T21:00:00.000Z",
      transparent: false,
    }]);
    expect(eventsIn(allDay, FROM, TO, NEW_YORK)).toEqual([{
      uid: "all-day",
      summary: "Away",
      start: "2026-09-08T04:00:00.000Z",
      end: "2026-09-09T04:00:00.000Z",
      transparent: false,
    }]);
  });

  it("reads a floating time as wall-clock time in the zone given", () => {
    const floating = ics([
      "UID:floating",
      "DTSTART:20260908T090000",
      "DTEND:20260908T100000",
      "SUMMARY:OPEN",
    ]);

    expect(eventsIn(floating, FROM, TO, HELSINKI)).toEqual([{
      uid: "floating",
      summary: "OPEN",
      start: "2026-09-08T06:00:00.000Z",
      end: "2026-09-08T07:00:00.000Z",
      transparent: false,
    }]);
    expect(eventsIn(floating, FROM, TO, NEW_YORK)).toEqual([{
      uid: "floating",
      summary: "OPEN",
      start: "2026-09-08T13:00:00.000Z",
      end: "2026-09-08T14:00:00.000Z",
      transparent: false,
    }]);
  });

  it("follows the end of summer time through a floating series", () => {
    const daily = ics([
      "UID:daily",
      "DTSTART:20260901T090000",
      "DTEND:20260901T100000",
      "SUMMARY:OPEN",
      "RRULE:FREQ=DAILY",
    ]);
    // Summer time ends on 25 October in Helsinki, on 1 November in New York.
    const helsinki = eventsIn(daily,
      new Date("2026-10-23T00:00:00Z"), new Date("2026-10-27T00:00:00Z"), HELSINKI);
    const newYork = eventsIn(daily,
      new Date("2026-10-30T00:00:00Z"), new Date("2026-11-03T00:00:00Z"), NEW_YORK);

    expect(starts(helsinki)).toEqual([
      "2026-10-23T06:00:00.000Z",
      "2026-10-24T06:00:00.000Z",
      "2026-10-25T07:00:00.000Z",
      "2026-10-26T07:00:00.000Z",
    ]);
    expect(starts(newYork)).toEqual([
      "2026-10-30T13:00:00.000Z",
      "2026-10-31T13:00:00.000Z",
      "2026-11-01T14:00:00.000Z",
      "2026-11-02T14:00:00.000Z",
    ]);
  });

  it("takes the offset in force at the instant, not at the wall-clock time read as UTC", () => {
    // 02:30 on the night summer time ends is still EEST, so 23:30Z the evening
    // before; 02:30Z itself falls after the change, and the offset found there
    // alone would put the event an hour late.
    const early = ics([
      "UID:early",
      "DTSTART:20261025T023000",
      "DTEND:20261025T024500",
      "SUMMARY:OPEN",
    ]);
    const events = eventsIn(early,
      new Date("2026-10-24T00:00:00Z"), new Date("2026-10-26T00:00:00Z"), HELSINKI);

    expect(starts(events)).toEqual(["2026-10-24T23:30:00.000Z"]);
  });
});

describe("a series begun long before the window", () => {
  // A series as written, and with a COUNT: a counted rule is walked from
  // DTSTART, and five thousand occurrences outlast every window below, so the
  // second is the first walked in full. Sorted by start: an override the walk
  // reaches is listed in its place, one the walk began after is listed last.
  const walked = (from: Date, to: Date, master: string[], ...overrides: string[][]) => {
    const counted = master.map(line => line.startsWith("RRULE:") ? `${line};COUNT=5000` : line);
    const sorted = (lines: string[]) => eventsIn(ics(lines, ...overrides), from, to, HELSINKI)
      .sort((a, b) => a.start.localeCompare(b.start));
    return { near: sorted(master), full: sorted(counted) };
  };

  it("finds this week's occurrences of a daily series begun in 1990", () => {
    // Some thirteen thousand occurrences precede the window, beyond the bound.
    const since1990 = ics([
      "UID:since-1990",
      "DTSTART:19900101T090000Z",
      "DTEND:19900101T100000Z",
      "SUMMARY:OPEN",
      "RRULE:FREQ=DAILY",
    ]);

    expect(starts(eventsIn(since1990, FROM, TO, HELSINKI))).toEqual([
      "2026-09-07T09:00:00.000Z",
      "2026-09-08T09:00:00.000Z",
      "2026-09-09T09:00:00.000Z",
      "2026-09-10T09:00:00.000Z",
      "2026-09-11T09:00:00.000Z",
      "2026-09-12T09:00:00.000Z",
      "2026-09-13T09:00:00.000Z",
    ]);
  });

  it("keeps a fortnightly series on its weekdays and its weeks", () => {
    const { near, full } = walked(
      new Date("2026-09-09T00:00:00Z"), new Date("2026-09-23T00:00:00Z"), [
        "UID:fortnightly",
        // A Tuesday; Tuesday 8 September 2026 is a whole number of fortnights on.
        "DTSTART:20000104T090000Z",
        "DTEND:20000104T100000Z",
        "SUMMARY:OPEN",
        "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH",
      ]);

    // The window opens on that week's Wednesday.
    expect(starts(near)).toEqual(["2026-09-10T09:00:00.000Z", "2026-09-22T09:00:00.000Z"]);
    expect(near).toEqual(full);
  });

  it("honours an early and a late EXDATE, and an early occurrence moved into the window", () => {
    // The window opens half an hour into Monday's occurrence.
    const { near, full } = walked(
      new Date("2026-11-09T07:30:00Z"), new Date("2026-11-12T00:00:00Z"), [
        "UID:daily",
        // Floating, begun in summer time; the window is in winter time.
        "DTSTART:20240701T090000",
        "DTEND:20240701T100000",
        "SUMMARY:OPEN",
        "RRULE:FREQ=DAILY",
        "EXDATE:20240703T090000",
        "EXDATE:20261111T090000",
      ], [
        "UID:daily",
        "RECURRENCE-ID:20240702T090000",
        "DTSTART:20261110T140000",
        "DTEND:20261110T150000",
        "SUMMARY:Supervision",
      ]);

    expect(near.map(event => [event.start, event.summary])).toEqual([
      ["2026-11-09T07:00:00.000Z", "OPEN"],
      ["2026-11-10T07:00:00.000Z", "OPEN"],
      ["2026-11-10T12:00:00.000Z", "Supervision"],
    ]);
    expect(near).toEqual(full);
  });

  it("finds the window's days of an all-day series begun years before", () => {
    const { near, full } = walked(FROM, TO, [
      "UID:all-day",
      "DTSTART;VALUE=DATE:20200101",
      "DTEND;VALUE=DATE:20200102",
      "SUMMARY:Away",
      "RRULE:FREQ=DAILY",
    ]);

    // Helsinki's days from 7 to 14 September: the window opens three hours
    // into the first and closes three hours into the last.
    expect(starts(near)).toEqual([
      "2026-09-06T21:00:00.000Z",
      "2026-09-07T21:00:00.000Z",
      "2026-09-08T21:00:00.000Z",
      "2026-09-09T21:00:00.000Z",
      "2026-09-10T21:00:00.000Z",
      "2026-09-11T21:00:00.000Z",
      "2026-09-12T21:00:00.000Z",
      "2026-09-13T21:00:00.000Z",
    ]);
    expect(near).toEqual(full);
  });

  it("honours EXDATE in a series that also has an RDATE", () => {
    const { near, full } = walked(FROM, TO, [
      "UID:daily",
      "DTSTART:20240101T090000Z",
      "DTEND:20240101T100000Z",
      "SUMMARY:OPEN",
      "RRULE:FREQ=DAILY",
      "RDATE:20240115T150000Z",
      "EXDATE:20240201T090000Z,20240301T090000Z,20240401T090000Z",
      "EXDATE:20260908T090000Z,20260909T090000Z",
    ]);

    expect(starts(near)).toEqual([
      "2026-09-07T09:00:00.000Z",
      "2026-09-10T09:00:00.000Z",
      "2026-09-11T09:00:00.000Z",
      "2026-09-12T09:00:00.000Z",
      "2026-09-13T09:00:00.000Z",
    ]);
    expect(near).toEqual(full);
  });

  it("finds occurrences a THISANDFUTURE override moved into the window from before it", () => {
    const { near, full } = walked(FROM, TO, [
      "UID:daily",
      "DTSTART:20240101T090000Z",
      "DTEND:20240101T100000Z",
      "SUMMARY:OPEN",
      "RRULE:FREQ=DAILY",
    ], [
      "UID:daily",
      // Three days later, from February 2024 on.
      "RECURRENCE-ID;RANGE=THISANDFUTURE:20240201T090000Z",
      "DTSTART:20240204T090000Z",
      "DTEND:20240204T100000Z",
      "SUMMARY:OPEN",
    ]);

    // Nominally the 4th to the 10th, moved onto the window's days.
    expect(starts(near)).toEqual([
      "2026-09-07T09:00:00.000Z",
      "2026-09-08T09:00:00.000Z",
      "2026-09-09T09:00:00.000Z",
      "2026-09-10T09:00:00.000Z",
      "2026-09-11T09:00:00.000Z",
      "2026-09-12T09:00:00.000Z",
      "2026-09-13T09:00:00.000Z",
    ]);
    expect(near).toEqual(full);
  });

  it("lists no Saturday for a weekday series when the window opens in Saturday's hour", () => {
    const { near, full } = walked(
      new Date("2026-11-07T07:30:00Z"), new Date("2026-11-10T00:00:00Z"), [
        "UID:weekdays",
        // Floating, from a Monday in summer time. In winter time 09:00 is
        // 07:00Z, so the window opens half an hour into Saturday's 09:00.
        "DTSTART:20250707T090000",
        "DTEND:20250707T100000",
        "SUMMARY:OPEN",
        "RRULE:FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR",
      ]);

    expect(starts(near)).toEqual(["2026-11-09T07:00:00.000Z"]);
    expect(near).toEqual(full);
  });

  it("lists no Sunday for an all-day weekday series on the day summer time ends", () => {
    // Sunday 25 October lasts twenty-five hours; the window opens half an hour
    // before it ends.
    const { near, full } = walked(
      new Date("2026-10-25T21:30:00Z"), new Date("2026-10-27T00:00:00Z"), [
        "UID:weekdays",
        "DTSTART;VALUE=DATE:20250707",
        "DTEND;VALUE=DATE:20250708",
        "SUMMARY:Away",
        "RRULE:FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR",
      ]);

    expect(starts(near)).toEqual(["2026-10-25T22:00:00.000Z", "2026-10-26T22:00:00.000Z"]);
    expect(near).toEqual(full);
  });
});
