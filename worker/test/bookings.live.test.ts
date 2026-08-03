import { env, exports } from "cloudflare:workers";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { reportEvents } from "../src/caldav";
import { config } from "../src/config";
import { issueCreateGrant } from "../src/grants";
import { at, clear, futureWindow, paint, writable } from "./fixture";
import { newSession, type Session } from "./session";

const worker = exports.default;
const cfg = config(env);
const availability = writable(env.AVAILABILITY_CALENDAR_URL);
const store = writable(env.BOOKING_STORE_URL);
const { start, end } = futureWindow();
const SLOT = at(start, 60);
const SLOT_END = new Date(Date.parse(SLOT) + cfg.slotMs).toISOString();

let session: Session;

async function book(
  grant: string,
  proof: string,
  slotStart = SLOT,
): Promise<Response> {
  return worker.fetch(new Request("https://api.test/v1/bookings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${grant}`,
      "X-Session-Proof": proof,
    },
    body: JSON.stringify({
      slot_start: slotStart,
      attendee: { name: "Alice", email: "e2e@parantaja.fi" },
    }),
  }));
}

async function reset(): Promise<void> {
  await clear(availability, start, end);
  await clear(store, start, end);
}

beforeAll(reset);
afterAll(reset);

beforeEach(async () => {
  await clear(store, start, end);
  session = await newSession();
});

it("writes the booking into the store and returns a cancellation token", async () => {
  const grant = await issueCreateGrant(cfg, session.thumbprint, [SLOT]);
  const response = await book(grant, await session.proof());

  expect(response.status).toBe(200);
  const body = await response.json() as {
    uid: string; slot_start: string; slot_end: string;
    cancellation_token: string; confirmation_email: string;
  };
  expect(body.slot_start).toBe(SLOT);
  expect(body.slot_end).toBe(SLOT_END);
  expect(body.cancellation_token).toBeTruthy();
  // No test run configures a mail transport, and the response says so rather
  // than implying a confirmation nobody sent.
  expect(body.confirmation_email).toBe("disabled");

  const stored = await reportEvents(store, SLOT, body.slot_end);
  expect(stored.map(event => event.uid)).toEqual([body.uid]);
  expect(stored[0]?.summary).toBe("Alice");
});

it("reports a conflict and leaves no remnant when the slot was taken meanwhile", async () => {
  await paint(store, "Bob", SLOT, at(SLOT, 15));
  const grant = await issueCreateGrant(cfg, session.thumbprint, [SLOT]);

  const response = await book(grant, await session.proof());
  expect(response.status).toBe(409);

  // Only Bob's event survives: the rollback removed ours.
  const stored = await reportEvents(store, SLOT, SLOT_END);
  expect(stored.map(event => event.summary)).toEqual(["Bob"]);
});

it("refuses a slot the grant does not cover", async () => {
  const grant = await issueCreateGrant(cfg, session.thumbprint, [at(SLOT, 120)]);

  expect((await book(grant, await session.proof())).status).toBe(403);
  expect(await reportEvents(store, start, end)).toEqual([]);
});

it("refuses another session's grant", async () => {
  const other = await newSession();
  const grant = await issueCreateGrant(cfg, other.thumbprint, [SLOT]);

  expect((await book(grant, await session.proof())).status).toBe(401);
  expect(await reportEvents(store, start, end)).toEqual([]);
});

it("refuses a stale proof", async () => {
  const grant = await issueCreateGrant(cfg, session.thumbprint, [SLOT]);
  const stale = await session.proof(cfg.proofMaxAgeSecs + 60);

  expect((await book(grant, stale)).status).toBe(401);
  expect(await reportEvents(store, start, end)).toEqual([]);
});

it("refuses a request with no credentials at all", async () => {
  const response = await worker.fetch(new Request("https://api.test/v1/bookings", {
    method: "POST",
    body: JSON.stringify({
      slot_start: SLOT,
      attendee: { name: "Alice", email: "e2e@parantaja.fi" },
    }),
  }));

  expect(response.status).toBe(401);
});
