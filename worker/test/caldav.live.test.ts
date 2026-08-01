import { env } from "cloudflare:workers";
import { afterAll, beforeAll, expect, it } from "vitest";
import { reportEvents } from "../src/caldav";
import { at, clear, futureWindow, paint, writable } from "./fixture";

const availability = writable(env.AVAILABILITY_CALENDAR_URL);
const { start, end } = futureWindow();

beforeAll(() => clear(availability, start, end));
afterAll(() => clear(availability, start, end));

it("round-trips an OPEN event through a real CalDAV backend", async () => {
  await paint(availability, "OPEN", at(start, 60), at(start, 180));

  const events = await reportEvents(availability, at(start, 60), at(start, 180));

  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    summary: "OPEN",
    start: at(start, 60),
    end: at(start, 180),
  });
});

it("escapes attendee text rather than letting it alter the ICS", async () => {
  await paint(availability, "Doe, John\nX-INJECTED:yes", at(start, 300), at(start, 330));

  const events = await reportEvents(availability, at(start, 300), at(start, 330));

  expect(events).toHaveLength(1);
  expect(events[0]?.summary).toBe("Doe, John\nX-INJECTED:yes");
});
