import { env, exports } from "cloudflare:workers";
import { afterAll, beforeAll, expect, it } from "vitest";
import { at, clear, futureWindow, paint, writable } from "./fixture";

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
