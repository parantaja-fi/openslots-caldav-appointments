import { env } from "cloudflare:workers";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { deleteEvent, reportEvents } from "../src/caldav";
import type { Env } from "../src/config";
import worker from "../src/index";
import { isBooking } from "../src/slots";
import { at, clear, futureWindow, paint, writable } from "./fixture";
import { newSession } from "./session";

const { start, end } = futureWindow();

// The whole point of the two logical roles: the same code must work whether
// they resolve to two calendars or to one. The handler is called directly
// rather than through the entrypoint so the configuration can be varied.
const configurations: Record<string, Env> = {
  "separate calendars": env,
  "one calendar in both roles": { ...env, BOOKING_STORE_URL: env.AVAILABILITY_CALENDAR_URL },
};

describe.each(Object.entries(configurations))("%s", (_name, config) => {
  const availability = writable(config.AVAILABILITY_CALENDAR_URL);
  const store = writable(config.BOOKING_STORE_URL);

  async function reset(): Promise<void> {
    await clear(availability, start, end);
    await clear(store, start, end);
  }

  beforeEach(reset);
  afterAll(reset);

  async function list(thumbprint: string): Promise<{ slots: string[]; grant: string }> {
    const response = await worker.fetch(new Request(
      `https://api.test/v1/slots?window_start=${start}&window_end=${end}`,
      { headers: { "X-Session-Thumbprint": thumbprint } },
    ), config);
    expect(response.status).toBe(200);
    const body = await response.json() as { slots: { slot_start: string }[]; grant: string };
    return { slots: body.slots.map(slot => slot.slot_start), grant: body.grant };
  }

  function book(
    grant: string,
    proof: string,
    slotStart: string,
    name = "Alice",
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
        attendee: { name, email: "e2e@parantaja.fi" },
      }),
    }), config);
  }

  it("lists, books, refuses the second taker, and cancels", async () => {
    await paint(availability, "OPEN", at(start, 60), at(start, 180));
    const session = await newSession();

    const listed = await list(session.thumbprint);
    expect(listed.slots).toEqual([at(start, 60), at(start, 90), at(start, 120), at(start, 150)]);

    const slot = listed.slots[0]!;
    const response = await book(listed.grant, await session.proof(), slot);
    expect(response.status).toBe(200);
    const booking = await response.json() as { uid: string; cancellation_token: string };

    // The booking blocks its slot for everyone, and only that slot.
    expect((await list(session.thumbprint)).slots).toEqual(listed.slots.slice(1));

    // A second session still holding a grant from before the booking loses.
    const rival = await newSession();
    const rivalGrant = (await list(rival.thumbprint)).grant;
    const collision = await book(rivalGrant, await rival.proof(), listed.slots[1]!);
    expect(collision.status).toBe(200);
    const second = await collision.json() as { uid: string };

    const stale = await book(listed.grant, await session.proof(), listed.slots[1]!);
    expect(stale.status).toBe(409);

    // The 409 rolled its own event back: the rival's booking stands alone.
    const inSlot =
      await reportEvents(store, listed.slots[1]!, listed.slots[2]!, env.DISPLAY_TIMEZONE);
    expect(inSlot.filter(e => e.summary !== "OPEN").map(e => e.uid)).toEqual([second.uid]);

    const cancelled = await worker.fetch(new Request(
      `https://api.test/v1/bookings/${booking.uid}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${booking.cancellation_token}` } },
    ), config);
    expect(cancelled.status).toBe(204);

    // The cancelled slot is offered again; the rival's is still taken.
    expect((await list(session.thumbprint)).slots)
      .toEqual([listed.slots[0]!, listed.slots[2]!, listed.slots[3]!]);
  });

  // The attendee's name is the event SUMMARY, so an attendee called OPEN would
  // read back as availability were the sentinel not qualified by the uid.
  it("keeps a booking made by an attendee called OPEN out of availability", async () => {
    await paint(availability, "OPEN", at(start, 60), at(start, 120));
    const session = await newSession();

    const listed = await list(session.thumbprint);
    const response = await book(listed.grant, await session.proof(), listed.slots[0]!, "OPEN");
    expect(response.status).toBe(200);

    expect((await list(session.thumbprint)).slots).toEqual(listed.slots.slice(1));
  });

  it("refuses a booking over an appointment added to the availability calendar after the listing", async () => {
    await paint(availability, "OPEN", at(start, 60), at(start, 180));
    const session = await newSession();

    const listed = await list(session.thumbprint);
    const slot = listed.slots[0]!;
    await paint(availability, "Dentist", slot, at(slot, 30));

    expect((await book(listed.grant, await session.proof(), slot)).status).toBe(409);
    const stored = await reportEvents(store, start, end, env.DISPLAY_TIMEZONE);
    expect(stored.filter(e => isBooking(e.uid))).toEqual([]);
  });

  it("refuses a booking whose OPEN event was deleted after the listing", async () => {
    const uid = await paint(availability, "OPEN", at(start, 60), at(start, 180));
    const session = await newSession();

    const listed = await list(session.thumbprint);
    await deleteEvent(availability, uid);

    expect((await book(listed.grant, await session.proof(), listed.slots[0]!)).status).toBe(409);
    expect(await reportEvents(store, start, end, env.DISPLAY_TIMEZONE)).toEqual([]);
  });
});
