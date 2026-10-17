import { env } from "cloudflare:workers";
import { afterAll, beforeAll, expect, it } from "vitest";
import { putEvent, reportEvents, toCalDAVDate } from "../src/caldav";
import { at, clear, futureWindow, paint, writable } from "./fixture";

const availability = writable(env.AVAILABILITY_CALENDAR_URL);
const { start, end } = futureWindow();

beforeAll(() => clear(availability, start, end));
afterAll(() => clear(availability, start, end));

it("round-trips an OPEN event through a real CalDAV backend", async () => {
  await paint(availability, "OPEN", at(start, 60), at(start, 180));

  const events =
    await reportEvents(availability, at(start, 60), at(start, 180), env.DISPLAY_TIMEZONE);

  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    summary: "OPEN",
    start: at(start, 60),
    end: at(start, 180),
  });
});

// The ampersand also exercises the XML entities the calendar data comes back in.
it("escapes attendee text rather than letting it alter the ICS", async () => {
  const summary = "Doe, John & Co <b>\nX-INJECTED:yes";
  await paint(availability, summary, at(start, 300), at(start, 330));

  const events =
    await reportEvents(availability, at(start, 300), at(start, 330), env.DISPLAY_TIMEZONE);

  expect(events).toHaveLength(1);
  expect(events[0]?.summary).toBe(summary);
});

// The server evaluates a DATE by its own clock, UTC on Radicale and Nextcloud,
// so to it this day begins hours after it does in Helsinki, and a window on
// the Helsinki evening before lies outside its filter.
it("reads an all-day entry on the evening before, where the server's clock has not reached it", async () => {
  const day = at(start, 4 * 24 * 60).slice(0, 10);
  const next = at(`${day}T00:00:00Z`, 24 * 60).slice(0, 10);
  const uid = crypto.randomUUID();
  await putEvent(availability, uid, [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//test//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${toCalDAVDate(new Date().toISOString())}`,
    `DTSTART;VALUE=DATE:${day.replaceAll("-", "")}`,
    `DTEND;VALUE=DATE:${next.replaceAll("-", "")}`,
    "SUMMARY:Away",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n"));

  const midnight = `${day}T00:00:00Z`;
  const events =
    await reportEvents(availability, at(midnight, -90), at(midnight, -30), env.DISPLAY_TIMEZONE);

  expect(events.map(event => event.uid)).toEqual([uid]);
});
