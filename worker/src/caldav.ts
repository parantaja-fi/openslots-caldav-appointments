import ICAL from "ical.js";
import type { Calendar } from "./config";

export interface CalendarEvent {
  uid: string;
  summary: string;
  start: string; // ISO 8601, UTC
  end: string;   // ISO 8601, UTC
  transparent: boolean;
}

export function toCalDAVDate(iso: string): string {
  return iso.replace(/-/g, "").replace(/:/g, "").replace(/\.\d+/, "");
}

function resourceUrl(cal: Calendar, uid: string): string {
  return `${cal.url.replace(/\/$/, "")}/${encodeURIComponent(uid)}.ics`;
}

/** RFC 5545 §3.3.11. Also what keeps attendee input out of the ICS structure. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

function utf8Length(codePoint: number): number {
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

/**
 * RFC 5545 §3.1: no content line may exceed 75 octets, and a continuation
 * begins with one space. Measured in octets over code points, so a multi-byte
 * character is never split across the fold.
 */
function fold(line: string): string {
  const parts: string[] = [];
  let current = "";
  let octets = 0;

  for (const char of line) {
    const size = utf8Length(char.codePointAt(0)!);
    // The continuation's leading space is one of its 75 octets.
    if (octets + size > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = "";
      octets = 0;
    }
    current += char;
    octets += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function buildVEvent(
  uid: string,
  start: string,
  end: string,
  summary: string,
  description: string,
): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//parantaja//booking-calendar//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${toCalDAVDate(new Date().toISOString())}`,
    `DTSTART:${toCalDAVDate(new Date(start).toISOString())}`,
    `DTEND:${toCalDAVDate(new Date(end).toISOString())}`,
    `SUMMARY:${escapeText(summary)}`,
  ];
  if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(fold).join("\r\n");
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'",
};

/**
 * The calendar data is XML text, and some backends return its CRLFs as `&#13;`,
 * so nothing can be parsed as ICS until this has run.
 */
function unescapeXml(text: string): string {
  return text.replace(/&(#\d+|#x[0-9a-fA-F]+|[a-z]+);/g, (whole, ref: string) => {
    if (ref.startsWith("#x")) return String.fromCodePoint(parseInt(ref.slice(2), 16));
    if (ref.startsWith("#")) return String.fromCodePoint(Number(ref.slice(1)));
    return ENTITIES[ref] ?? whole;
  });
}

/**
 * A rule the walk cannot begin near the window runs from its `DTSTART`, which
 * may be years before it, so the bound is on iterations rather than on
 * results. Failing loudly beats quietly returning a truncated availability —
 * the very failure this expansion exists to avoid.
 */
export const MAX_ITERATIONS = 10_000;

/**
 * A series the walk gave up on. The message names its uid for the log alone:
 * a uid may embed a hostname or an address, so callers name the cap instead.
 */
export class RecurrenceTooLongError extends Error {
  constructor(uid: string) {
    super(`Recurrence of ${uid} exceeds ${MAX_ITERATIONS} occurrences`);
    this.name = "RecurrenceTooLongError";
  }
}

function toEvent(
  uid: string,
  summary: string,
  start: Date,
  end: Date,
  transparent: boolean,
): CalendarEvent {
  return {
    uid,
    summary,
    start: start.toISOString(),
    end: end.toISOString(),
    transparent,
  };
}

/**
 * The instant an `ICAL.Time` names. A floating value — a DATE, or a DATE-TIME
 * with neither `Z` nor `TZID` — is wall-clock time, read here in `timezone`;
 * `toJSDate()` would read it in the runtime's zone, which in a Worker is UTC.
 */
function instantIn(timezone: string): (time: ICAL.Time) => Date {
  let format: Intl.DateTimeFormat | undefined;
  const offset = (ms: number): number => {
    format ??= new Intl.DateTimeFormat("en", {
      timeZone: timezone, hourCycle: "h23",
      year: "numeric", month: "numeric", day: "numeric",
      hour: "numeric", minute: "numeric", second: "numeric",
    });
    const parts = format.formatToParts(ms);
    const field = (type: Intl.DateTimeFormatPartTypes): number =>
      Number(parts.find(part => part.type === type)?.value);
    return Date.UTC(field("year"), field("month") - 1, field("day"),
      field("hour"), field("minute"), field("second")) - ms;
  };
  return time => {
    if (time.zone !== ICAL.Timezone.localTimezone) return time.toJSDate();
    const wall = Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute, time.second);
    // Read as UTC, the wall-clock time can fall on the other side of a change
    // of offset from the instant it names; a second look, from the first
    // estimate, finds the offset in force.
    return new Date(wall - offset(wall - offset(wall)));
  };
}

function walkStart(event: ICAL.Event, from: Date, instant: (time: ICAL.Time) => Date): ICAL.Time {
  const rules = event.component.getAllProperties("rrule");
  const rule = rules[0]?.getFirstValue();
  // An RDATE keeps the walk at DTSTART: ical.js walks from one that precedes
  // the start it is given, and its EXDATE cursor then lags, so excluded
  // occurrences come back. So does a RANGE=THISANDFUTURE override, which moves
  // every occurrence after it by its own shift, so one from before the anchor
  // may land in the window.
  if (rules.length !== 1 || !(rule instanceof ICAL.Recur) || rule.count ||
    (rule.freq !== "DAILY" && rule.freq !== "WEEKLY") || event.component.hasProperty("rdate") ||
    event.rangeExceptions.length > 0) {
    return event.startDate;
  }
  const days = rule.freq === "DAILY" ? rule.interval : 7 * rule.interval;
  const periods =
    Math.floor((from.getTime() - instant(event.endDate).getTime()) / (days * 86_400_000));
  if (periods <= 0) return event.startDate;
  const anchor = event.startDate.clone().adjust(periods * days, 0, 0, 0);
  // The iterator emits its start unchecked against the BY parts, so the anchor
  // must end before the window opens.
  if (instant(event.getOccurrenceDetails(anchor).endDate) > from) anchor.adjust(-days, 0, 0, 0);
  return anchor;
}

/** The events of one VCALENDAR that overlap `[from, to)`, recurrences expanded. */
export function eventsIn(ics: string, from: Date, to: Date, timezone: string): CalendarEvent[] {
  const calendar = new ICAL.Component(ICAL.parse(ics));
  const instant = instantIn(timezone);

  const events: CalendarEvent[] = [];
  const vevents = calendar.getAllSubcomponents("vevent");
  // Overrides are reached through their master, which ICAL.Event relates by
  // walking the VCALENDAR itself. Google's time-range filter returns a series
  // whose only overlap with the window is a moved occurrence as that override
  // alone, master pruned; without its master an override is the single event
  // it describes.
  const masters = new Set(vevents
    .filter(vevent => !vevent.hasProperty("recurrence-id"))
    .map(vevent => vevent.getFirstPropertyValue("uid")));
  for (const vevent of vevents) {
    if (vevent.hasProperty("recurrence-id") && masters.has(vevent.getFirstPropertyValue("uid"))) {
      continue;
    }

    const event = new ICAL.Event(vevent);
    if (!event.isRecurring()) {
      const start = instant(event.startDate);
      const end = instant(event.endDate);
      if (start >= to || end <= from) continue;
      if (vevent.getFirstPropertyValue("status") === "CANCELLED") continue;
      const transparent = vevent.getFirstPropertyValue("transp") === "TRANSPARENT";
      events.push(toEvent(event.uid, event.summary, start, end, transparent));
      continue;
    }

    // ICAL.Event.iterator() re-anchors the rule on the time it is given, so the
    // walk starts at DTSTART or, for a DAILY or WEEKLY rule, at DTSTART plus
    // whole periods, which keeps the weekday and the week. A COUNT counts from
    // DTSTART, so a counted rule starts there.
    const iterator = event.iterator(walkStart(event, from, instant));
    const reached = new Set<ICAL.Event>();
    let iterations = 0;
    for (let next = iterator.next(); next; next = iterator.next()) {
      if (++iterations > MAX_ITERATIONS) throw new RecurrenceTooLongError(event.uid);
      // The nominal time, not an override's: an occurrence moved past the
      // window must not end the walk before the window's later ones.
      if (instant(next) >= to) break;
      const { item, startDate, endDate } = event.getOccurrenceDetails(next);
      reached.add(item);
      const start = instant(startDate);
      const end = instant(endDate);
      if (start >= to || end <= from) continue;
      // How an occurrence deleted through an override, rather than through
      // EXDATE, is recorded. EXDATE the expansion already honours.
      if (item.component.getFirstPropertyValue("status") === "CANCELLED") continue;
      const transparent = item.component.getFirstPropertyValue("transp") === "TRANSPARENT";
      events.push(toEvent(event.uid, item.summary, start, end, transparent));
    }

    // An override the walk did not reach, such as one moved into the window
    // from beyond its end, counts by its own times.
    for (const override of Object.values(event.exceptions)) {
      if (reached.has(override)) continue;
      const start = instant(override.startDate);
      const end = instant(override.endDate);
      if (start >= to || end <= from) continue;
      if (override.component.getFirstPropertyValue("status") === "CANCELLED") continue;
      const transparent = override.component.getFirstPropertyValue("transp") === "TRANSPARENT";
      events.push(toEvent(event.uid, override.summary, start, end, transparent));
    }
  }
  return events;
}

export async function reportEvents(
  cal: Calendar,
  start: string,
  end: string,
  timezone: string,
): Promise<CalendarEvent[]> {
  const from = new Date(start);
  const to = new Date(end);
  // A day beyond the window on each side: the backend evaluates a floating
  // value by its own clock, not the practitioner's, so an all-day entry can
  // lie outside its filter and inside the window. eventsIn() applies the
  // window itself.
  const margin = 86_400_000;
  const range = `start="${toCalDAVDate(new Date(from.getTime() - margin).toISOString())}" ` +
    `end="${toCalDAVDate(new Date(to.getTime() + margin).toISOString())}"`;
  // The filter alone: every backend evaluates the time-range against
  // occurrences, so a recurring master starting before the window still
  // arrives. Asking for <c:expand> as well would be pointless — google-caldav
  // ignores it and returns the unexpanded master anyway, without saying so —
  // and eventsIn() expands regardless.
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\r\n` +
    `<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">\r\n` +
    `  <d:prop><d:getetag/><c:calendar-data/></d:prop>\r\n` +
    `  <c:filter>\r\n` +
    `    <c:comp-filter name="VCALENDAR">\r\n` +
    `      <c:comp-filter name="VEVENT">\r\n` +
    `        <c:time-range ${range}/>\r\n` +
    `      </c:comp-filter>\r\n` +
    `    </c:comp-filter>\r\n` +
    `  </c:filter>\r\n` +
    `</c:calendar-query>`;

  const response = await fetch(cal.url, {
    method: "REPORT",
    headers: {
      Authorization: await cal.authHeader(),
      "Content-Type": "application/xml; charset=utf-8",
      // google-caldav: Depth is mandatory; omitting it returns 400.
      Depth: "1",
    },
    body,
  });
  if (response.status !== 207) throw new Error(`CalDAV REPORT failed: ${response.status}`);

  // Workers have no DOMParser; extract the calendar-data payloads by regex.
  const xml = await response.text();
  const events: CalendarEvent[] = [];
  const re = /<[^:>\s]+:calendar-data[^>]*>([\s\S]*?)<\/[^:>\s]+:calendar-data>/g;
  for (const match of xml.matchAll(re)) {
    const ics = match[1]?.trim();
    if (ics) events.push(...eventsIn(unescapeXml(ics), from, to, timezone));
  }
  return events;
}

/**
 * One event by uid, or null when the resource is gone — which is what a
 * cancelled booking looks like. No recurrence handling: the only resources
 * fetched this way are the single VEVENTs the system wrote itself.
 */
export async function getEvent(
  cal: Calendar,
  uid: string,
  timezone: string,
): Promise<CalendarEvent | null> {
  const response = await fetch(resourceUrl(cal, uid), {
    headers: { Authorization: await cal.authHeader() },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`CalDAV GET failed: ${response.status}`);

  const calendar = new ICAL.Component(ICAL.parse(await response.text()));
  const vevent = calendar.getFirstSubcomponent("vevent");
  if (!vevent) return null;

  const event = new ICAL.Event(vevent);
  const transparent = vevent.getFirstPropertyValue("transp") === "TRANSPARENT";
  const instant = instantIn(timezone);
  return toEvent(
    event.uid, event.summary, instant(event.startDate), instant(event.endDate), transparent,
  );
}

export async function putEvent(cal: Calendar, uid: string, ics: string): Promise<void> {
  const response = await fetch(resourceUrl(cal, uid), {
    method: "PUT",
    headers: {
      Authorization: await cal.authHeader(),
      "Content-Type": "text/calendar; charset=utf-8",
    },
    body: ics,
  });
  // google-caldav: 201 on create, 204 on overwrite.
  if (response.status !== 201 && response.status !== 204) {
    throw new Error(`CalDAV PUT failed: ${response.status}`);
  }
}

/** Returns false when the resource was already gone. */
export async function deleteEvent(cal: Calendar, uid: string): Promise<boolean> {
  const response = await fetch(resourceUrl(cal, uid), {
    method: "DELETE",
    headers: { Authorization: await cal.authHeader() },
  });
  if (response.status === 404) return false;
  if (response.status !== 204 && response.status !== 200) {
    throw new Error(`CalDAV DELETE failed: ${response.status}`);
  }
  return true;
}
