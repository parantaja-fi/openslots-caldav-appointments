import { env, exports } from "cloudflare:workers";
import { decodeJwt } from "jose";
import { afterAll, beforeAll, expect, it } from "vitest";
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

// Recurrence is the backend's job (ARCHITECTURE §2), so this is the check that
// this backend honours <c:expand>: without it neither event exists in the
// window, and the answer would be an empty list rather than a wrong one.
it("sees the occurrences of weekly events inside the window", async () => {
  await reset();
  const lastWeek = (minutes: number) => at(start, minutes - 7 * 24 * 60);
  await paint(availability, "OPEN", lastWeek(60), lastWeek(180), "FREQ=WEEKLY");
  await paint(availability, "Supervision", lastWeek(90), lastWeek(120), "FREQ=WEEKLY");

  expect(await listSlots()).toEqual([at(start, 60), at(start, 120), at(start, 150)]);
});
