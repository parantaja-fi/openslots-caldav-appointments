import type { CalendarEvent } from "./caldav";

const OPEN = "OPEN";
const BOOKING = "booking-";

/** Marks our own writes, and orders them by creation time to the millisecond. */
export function bookingUid(): string {
  return BOOKING + new Date().toISOString().replace(/[-:.]/g, "") + "-" + crypto.randomUUID();
}

export function isBooking(uid: string): boolean {
  return uid.startsWith(BOOKING);
}

/**
 * Availability is an OPEN event we did not write. The attendee's name is a
 * booking's SUMMARY, so without the uid an attendee called `OPEN` would
 * synthesise availability wherever the two roles resolve to one calendar.
 */
export function isOpen(event: CalendarEvent): boolean {
  return event.summary === OPEN && !isBooking(event.uid);
}

function blocks(event: CalendarEvent): boolean {
  return isBooking(event.uid) || !event.transparent;
}

export interface Slot {
  slot_start: string; // ISO 8601, UTC
  slot_end: string;   // ISO 8601, UTC
}

/**
 * Whether the event we just inserted must be rolled back. The slot belongs to
 * the earliest booking in it, and outright to any event we did not write that
 * is not marked Free; two simultaneous bookings therefore yield one winner
 * rather than two losers.
 */
export function lostRace(
  uid: string,
  events: CalendarEvent[],
  start: string,
  end: string,
): boolean {
  return events.some(e =>
    e.uid !== uid && !isOpen(e) && blocks(e) && e.start < end && e.end > start &&
    (!isBooking(e.uid) || e.uid < uid));
}

interface Interval {
  start: number;
  end: number;
}

function intervals(events: CalendarEvent[]): Interval[] {
  return events.map(e => ({ start: Date.parse(e.start), end: Date.parse(e.end) }));
}

/**
 * The union of the OPEN events, plus a zero-length seam wherever two of them
 * merely abut. Overlap is evidence of intended continuous availability; mere
 * abutment is two separately-painted sessions, and no booking may span it.
 */
function union(open: CalendarEvent[]): { open: Interval[]; seams: Interval[] } {
  const sorted = intervals(open).sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  const seams: Interval[] = [];

  for (const next of sorted) {
    const current = merged[merged.length - 1];
    if (!current || next.start > current.end) {
      merged.push({ ...next });
      continue;
    }
    if (next.start === current.end) seams.push({ start: next.start, end: next.start });
    current.end = Math.max(current.end, next.end);
  }
  return { open: merged, seams };
}

/**
 * Whether the availability calendar still offers the slot: the union of its
 * OPEN events contains it, with no seam inside. Phase is not checked; the
 * grant attested it.
 */
export function covered(availability: CalendarEvent[], start: string, end: string): boolean {
  const { open, seams } = union(availability.filter(isOpen));
  const from = Date.parse(start);
  const to = Date.parse(end);
  return open.some(i => i.start <= from && i.end >= to) &&
    !seams.some(s => s.start > from && s.start < to);
}

/**
 * `ARCHITECTURE.md` §4. OPEN counts only from the availability calendar;
 * everything else in either calendar blocks, save events marked Free that we
 * did not write. When the two roles coincide, pass the single query's events
 * as `availability` and nothing as `store`.
 */
export function computeSlots(
  availability: CalendarEvent[],
  store: CalendarEvent[],
  slotMs: number,
  from: Date,
  to: Date,
): Slot[] {
  const { open, seams } = union(availability.filter(isOpen));
  const blocking = [
    ...intervals(availability.filter(e => !isOpen(e) && blocks(e))),
    ...intervals(store.filter(blocks)),
    ...seams,
  ];

  const windowStart = from.getTime();
  const windowEnd = to.getTime();
  const slots: Slot[] = [];

  for (const interval of open) {
    const limit = Math.min(interval.end, windowEnd);
    // Phase is anchored to the interval's own start, not to the window, so
    // that slot boundaries do not drift as the window moves with the clock.
    let cursor = interval.start;
    if (cursor < windowStart) cursor += Math.ceil((windowStart - cursor) / slotMs) * slotMs;

    for (; cursor + slotMs <= limit; cursor += slotMs) {
      const slotEnd = cursor + slotMs;
      if (blocking.some(b => b.start < slotEnd && b.end > cursor)) continue;
      slots.push({
        slot_start: new Date(cursor).toISOString(),
        slot_end: new Date(slotEnd).toISOString(),
      });
    }
  }
  return slots;
}
