import { env, exports } from "cloudflare:workers";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { reportEvents } from "../src/caldav";
import { issueCancellationToken } from "../src/grants";
import { at, clear, futureWindow, paint, writable } from "./fixture";

const worker = exports.default;
const store = writable(env.BOOKING_STORE_URL);
const { start, end } = futureWindow();
const SLOT = at(start, 60);

function cancel(uid: string, token: string): Promise<Response> {
  return worker.fetch(new Request(`https://api.test/v1/bookings/${uid}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  }));
}

beforeAll(() => clear(store, start, end));
afterAll(() => clear(store, start, end));
beforeEach(() => clear(store, start, end));

it("removes the booking, and says so again on replay", async () => {
  const uid = await paint(store, "Alice", SLOT, at(SLOT, 30));
  const token = await issueCancellationToken(env, uid, SLOT);

  expect((await cancel(uid, token)).status).toBe(204);
  expect(await reportEvents(store, start, end)).toEqual([]);

  // The event is already gone; cancelling again is still a success.
  expect((await cancel(uid, token)).status).toBe(204);
});

it("refuses a token issued for another booking", async () => {
  const uid = await paint(store, "Alice", SLOT, at(SLOT, 30));
  const token = await issueCancellationToken(env, crypto.randomUUID(), SLOT);

  expect((await cancel(uid, token)).status).toBe(403);
  expect((await reportEvents(store, start, end)).map(e => e.uid)).toEqual([uid]);
});

it("refuses a token that expired at slot start", async () => {
  const uid = await paint(store, "Alice", SLOT, at(SLOT, 30));
  const token = await issueCancellationToken(env, uid, at(new Date().toISOString(), -60));

  expect((await cancel(uid, token)).status).toBe(401);
  expect((await reportEvents(store, start, end)).map(e => e.uid)).toEqual([uid]);
});

it("refuses a request with no token", async () => {
  const uid = await paint(store, "Alice", SLOT, at(SLOT, 30));

  const response = await worker.fetch(new Request(
    `https://api.test/v1/bookings/${uid}`, { method: "DELETE" },
  ));

  expect(response.status).toBe(401);
  expect((await reportEvents(store, start, end)).map(e => e.uid)).toEqual([uid]);
});
