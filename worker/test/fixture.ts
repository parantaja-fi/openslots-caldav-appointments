import { env } from "cloudflare:workers";
import { calendar, type Calendar } from "../src/config";
import { buildVEvent, deleteEvent, putEvent, reportEvents, toCalDAVDate } from "../src/caldav";

/**
 * A calendar handle with the fixture's own write credentials, so tests can
 * paint OPEN events into the availability calendar the Worker only reads.
 */
export function writable(url: string): Calendar {
  return calendar(
    "test-fixture",
    url,
    env.TEST_WRITE_USERNAME,
    env.TEST_WRITE_PASSWORD,
    env.GOOGLE_SERVICE_ACCOUNT_JSON,
  );
}

/**
 * Creates an event and returns its uid. `rrule` and `override` are test-only
 * affordances — production never writes recurrences, but it must read them.
 * `override` moves the occurrence due at `occurrence` to its own `start` and
 * `end`.
 */
export async function paint(
  cal: Calendar,
  summary: string,
  start: string,
  end: string,
  rrule?: string,
  override?: { occurrence: string; start: string; end: string },
): Promise<string> {
  const uid = crypto.randomUUID();
  let ics = buildVEvent(uid, start, end, summary, "");
  if (rrule) ics = ics.replace("END:VEVENT", `RRULE:${rrule}\r\nEND:VEVENT`);
  if (override) {
    ics = ics.replace("END:VCALENDAR", [
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${toCalDAVDate(new Date().toISOString())}`,
      `RECURRENCE-ID:${toCalDAVDate(override.occurrence)}`,
      `DTSTART:${toCalDAVDate(override.start)}`,
      `DTEND:${toCalDAVDate(override.end)}`,
      `SUMMARY:${summary}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n"));
  }
  await putEvent(cal, uid, ics);
  return uid;
}

/**
 * Empties the window. The test calendars are dedicated, and every event in
 * them was written by this fixture, so href == uid.ics holds.
 */
export async function clear(cal: Calendar, start: string, end: string): Promise<void> {
  for (const event of await reportEvents(cal, start, end, env.DISPLAY_TIMEZONE)) {
    await deleteEvent(cal, event.uid);
  }
}

/** A window starting tomorrow on the hour, well clear of the minimum notice. */
export function futureWindow(days = 7): { start: string; end: string } {
  const start = new Date(Date.now() + 24 * 3600_000);
  start.setUTCMinutes(0, 0, 0);
  return {
    start: start.toISOString(),
    end: new Date(start.getTime() + days * 24 * 3600_000).toISOString(),
  };
}

/** `base` offset by whole minutes, as an ISO string. */
export function at(base: string, minutes: number): string {
  return new Date(new Date(base).getTime() + minutes * 60_000).toISOString();
}
