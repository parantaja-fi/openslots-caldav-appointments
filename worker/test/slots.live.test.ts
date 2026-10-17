import { env, exports } from "cloudflare:workers";
import { decodeJwt } from "jose";
import { afterAll, beforeAll, expect, it } from "vitest";
import { deleteEvent } from "../src/caldav";
import { at, clear, futureWindow, paint, writable } from "./fixture";
import { newSession } from "./session";

const worker = exports.default;
const availability = writable(env.AVAILABILITY_CALENDAR_URL);
const store = writable(env.BOOKING_STORE_URL);
const { start, end } = futureWindow();

async function listSlots(from = start, to = end): Promise<string[]> {
  const response = await worker.fetch(new Request(
    `https://api.test/v1/slots?window_start=${from}&window_end=${to}`,
  ));
  expect(response.status).toBe(200);
  const body = await response.json() as { slots: { slot_start: string }[] };
  return body.slots.map(slot => slot.slot_start);
}

async function reset(): Promise<void> {
  await clear(availability, start, end);
  await clear(store, start, end);
}

beforeAll(reset);
afterAll(reset);

it("computes slots from a real backend, blocked by a booking in the store", async () => {
  await paint(availability, "OPEN", at(start, 60), at(start, 180));
  await paint(store, "Alice", at(start, 90), at(start, 120));

  expect(await listSlots()).toEqual([at(start, 60), at(start, 120), at(start, 150)]);
});

it("honours the minimum notice", async () => {
  const soon = new Date().toISOString();
  expect(await listSlots(soon, at(soon, 60))).toEqual([]);
});

it("grants exactly the slots it listed, to the session that asked", async () => {
  const session = await newSession();
  const response = await worker.fetch(new Request(
    `https://api.test/v1/slots?window_start=${start}&window_end=${end}`,
    { headers: { "X-Session-Thumbprint": session.thumbprint } },
  ));
  expect(response.status).toBe(200);

  const body = await response.json() as { slots: { slot_start: string }[]; grant: string };
  const claims = decodeJwt(body.grant);
  expect(claims.slots).toEqual(body.slots.map(slot => slot.slot_start));
  expect(claims.aud).toBe(session.thumbprint);
  expect(claims.cap).toBe("booking/create");
});

// Expansion itself is unit-tested (recurrence.test.ts). What only a real
// backend can show is that its time-range filter selects a recurring master
// whose DTSTART precedes the window — without that neither event ever reaches
// the expansion, and the answer is an empty list rather than a wrong one.
it("sees the occurrences of weekly events inside the window", async () => {
  await reset();
  const lastWeek = (minutes: number) => at(start, minutes - 7 * 24 * 60);
  await paint(availability, "OPEN", lastWeek(60), lastWeek(180), "FREQ=WEEKLY");
  await paint(availability, "Supervision", lastWeek(90), lastWeek(120), "FREQ=WEEKLY");

  expect(await listSlots()).toEqual([at(start, 60), at(start, 120), at(start, 150)]);
});

// These two delete their series by uid: clear() sees only what the window's
// REPORT yields, which a series with an occurrence moved across the window's
// end can escape.
it("sees an occurrence moved in from later in a series the window already sees", async () => {
  await reset();
  const day = 24 * 60;
  await paint(availability, "OPEN", at(start, 60), at(start, 180));
  // The third occurrence moves in, so that the second, unmoved and past the
  // window's end, lies between it and the window.
  const uid = await paint(
    availability, "Supervision", at(start, day + 90), at(start, day + 120), "FREQ=WEEKLY",
    { occurrence: at(start, 15 * day + 90), start: at(start, 90), end: at(start, 120) },
  );

  try {
    expect(await listSlots()).toEqual([at(start, 60), at(start, 120), at(start, 150)]);
  } finally {
    await deleteEvent(availability, uid);
  }
});

// What only the backend can show: that its time-range filter selects a
// resource whose only overlap with the window is an overridden occurrence, as
// RFC 4791 §9.9 requires. Every nominal occurrence of this series lies past
// the window's end.
it("sees an occurrence moved in from a series the window does not otherwise see", async () => {
  await reset();
  const nextWeek = at(start, 7 * 24 * 60 + 90);
  await paint(availability, "OPEN", at(start, 60), at(start, 180));
  const uid = await paint(
    availability, "Supervision", nextWeek, at(nextWeek, 30), "FREQ=WEEKLY",
    { occurrence: nextWeek, start: at(start, 90), end: at(start, 120) },
  );

  try {
    expect(await listSlots()).toEqual([at(start, 60), at(start, 120), at(start, 150)]);
  } finally {
    await deleteEvent(availability, uid);
  }
});

it("phases slots from an overlapping OPEN event that ends before the window", async () => {
  await reset();
  await paint(availability, "OPEN", at(start, 60), at(start, 140));
  await paint(availability, "OPEN", at(start, 130), at(start, 240));

  expect(await listSlots()).toEqual([60, 90, 120, 150, 180, 210].map(m => at(start, m)));
  expect(await listSlots(at(start, 145))).toEqual([150, 180, 210].map(m => at(start, m)));
});
