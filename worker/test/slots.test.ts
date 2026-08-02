import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "../src/caldav";
import { bookingUid, computeSlots, lostRace } from "../src/slots";

const DAY = "2026-09-01";

function t(time: string): string {
  return `${DAY}T${time}:00.000Z`;
}

function event(summary: string, start: string, end: string): CalendarEvent {
  return { uid: crypto.randomUUID(), summary, start: t(start), end: t(end) };
}

const open = (start: string, end: string) => event("OPEN", start, end);

/** Slot starts, which is all these cases turn on. */
function starts(
  availability: CalendarEvent[],
  store: CalendarEvent[] = [],
  from = t("00:00"),
  to = "2026-09-02T00:00:00.000Z",
): string[] {
  return computeSlots(availability, store, 30 * 60_000, new Date(from), new Date(to))
    .map(s => s.slot_start.slice(11, 16));
}

describe("emission", () => {
  it("subdivides an OPEN event", () => {
    expect(starts([open("09:00", "10:00")])).toEqual(["09:00", "09:30"]);
  });

  it("discards a trailing remainder shorter than a slot", () => {
    expect(starts([open("09:00", "09:45")])).toEqual(["09:00"]);
  });

  it("ignores OPEN events in the booking store", () => {
    expect(starts([], [open("09:00", "10:00")])).toEqual([]);
  });
});

describe("overlapping and abutting OPEN events", () => {
  it("merges overlapping OPEN events into one phase", () => {
    expect(starts([open("09:00", "10:00"), open("09:30", "11:00")]))
      .toEqual(["09:00", "09:30", "10:00", "10:30"]);
  });

  it("refuses the slot that would span the seam between abutting OPEN events", () => {
    // Union is 09:00-10:30; the phantom at 09:45 removes 09:30-10:00.
    expect(starts([open("09:00", "09:45"), open("09:45", "10:30")]))
      .toEqual(["09:00", "10:00"]);
  });

  it("lets a seam falling on a slot boundary through untouched", () => {
    expect(starts([open("09:00", "10:00"), open("10:00", "11:00")]))
      .toEqual(["09:00", "09:30", "10:00", "10:30"]);
  });

  it("raises no seam where a third OPEN event covers the join", () => {
    expect(starts([open("09:00", "09:45"), open("09:45", "10:30"), open("09:30", "10:00")]))
      .toEqual(["09:00", "09:30", "10:00"]);
  });
});

describe("blocking", () => {
  it("blocks only the sub-slots a partial overlap touches", () => {
    expect(starts([open("09:00", "11:00"), event("Dentist", "09:40", "09:50")]))
      .toEqual(["09:00", "10:00", "10:30"]);
  });

  it("does not block where an event merely touches a boundary", () => {
    expect(starts([open("09:00", "10:00"), event("Dentist", "08:00", "09:00")]))
      .toEqual(["09:00", "09:30"]);
  });

  it("blocks on a booking in a separate store", () => {
    expect(starts([open("09:00", "10:00")], [event("Alice", "09:30", "10:00")]))
      .toEqual(["09:00"]);
  });

  it("blocks on an event titled OPEN in the store, which is not availability", () => {
    expect(starts([open("09:00", "10:00")], [open("09:00", "09:30")]))
      .toEqual(["09:30"]);
  });

  it("blocks on our own booking titled OPEN, whichever calendar it is read from", () => {
    const attendeeCalledOpen: CalendarEvent = { ...open("09:00", "09:30"), uid: bookingUid() };
    expect(starts([open("09:00", "10:00"), attendeeCalledOpen])).toEqual(["09:30"]);
  });
});

describe("race arbitration", () => {
  const ours = "booking-20260901T085959000Z-ours";
  const slot = { start: t("09:00"), end: t("09:30") };

  function booking(uid: string, start: string, end: string): CalendarEvent {
    return { ...event("Alice", start, end), uid };
  }

  const lost = (events: CalendarEvent[]) => lostRace(ours, events, slot.start, slot.end);

  it("keeps our booking when the competing one was created later", () => {
    expect(lost([booking("booking-20260901T090000000Z-theirs", "09:00", "09:30")])).toBe(false);
  });

  it("rolls our booking back when the competing one was created earlier", () => {
    expect(lost([booking("booking-20260901T085958000Z-theirs", "09:00", "09:30")])).toBe(true);
  });

  it("yields to an event we did not write, whatever its uid sorts as", () => {
    expect(lost([booking("aardvark", "09:15", "10:00")])).toBe(true);
  });

  it("ignores our own event, availability, and events outside the slot", () => {
    expect(lost([
      booking(ours, "09:00", "09:30"),
      open("09:00", "10:00"),
      booking("booking-20260901T000000000Z-theirs", "09:30", "10:00"),
    ])).toBe(false);
  });
});

describe("window", () => {
  it("drops slots before the window without shifting the phase", () => {
    expect(starts([open("09:00", "11:00")], [], t("09:07")))
      .toEqual(["09:30", "10:00", "10:30"]);
  });

  it("drops a slot that would run past the window", () => {
    expect(starts([open("09:00", "11:00")], [], t("00:00"), t("10:15")))
      .toEqual(["09:00", "09:30"]);
  });

  it("skips a long-past OPEN start cheaply and in phase", () => {
    const longOpen: CalendarEvent = {
      uid: "long",
      summary: "OPEN",
      start: "2020-01-01T09:00:00.000Z",
      end: t("11:00"),
    };
    expect(starts([longOpen], [], t("09:07"))).toEqual(["09:30", "10:00", "10:30"]);
  });
});
