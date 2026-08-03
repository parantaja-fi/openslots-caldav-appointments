import ICAL from "ical.js";
import type { Calendar } from "./config";

export interface CalendarEvent {
  uid: string;
  summary: string;
  start: string; // ISO 8601, UTC
  end: string;   // ISO 8601, UTC
}

function toCalDAVDate(iso: string): string {
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
 * Occurrences are iterated from the event's own `DTSTART`, which may be years
 * before the window, so the bound is on iterations rather than on results.
 * Ten thousand covers a daily recurrence running for twenty-seven years; a
 * rule needing more is malformed, and failing loudly beats quietly returning a
 * truncated availability — the very failure this expansion exists to avoid.
 */
const MAX_ITERATIONS = 10_000;

function toEvent(uid: string, summary: string, start: ICAL.Time, end: ICAL.Time): CalendarEvent {
  return {
    uid,
    summary,
    start: start.toJSDate().toISOString(),
    end: end.toJSDate().toISOString(),
  };
}

/**
 * A `TZID` resolves only against a registered zone; unregistered, `ICAL.Time`
 * treats the value as floating, which in a Worker means UTC and puts a
 * Helsinki event three hours out. The registry is isolate-global and outlives
 * the request, which is harmless: a `TZID` names one zone.
 */
function registerTimezones(calendar: ICAL.Component): void {
  for (const vtimezone of calendar.getAllSubcomponents("vtimezone")) {
    const tzid = vtimezone.getFirstPropertyValue("tzid");
    if (typeof tzid === "string" && !ICAL.TimezoneService.has(tzid)) {
      ICAL.TimezoneService.register(vtimezone);
    }
  }
}

/** The events of one VCALENDAR that overlap `[from, to)`, recurrences expanded. */
export function eventsIn(ics: string, from: Date, to: Date): CalendarEvent[] {
  const calendar = new ICAL.Component(ICAL.parse(ics));
  registerTimezones(calendar);

  const events: CalendarEvent[] = [];
  for (const vevent of calendar.getAllSubcomponents("vevent")) {
    // Overrides are reached through their master, which ICAL.Event relates by
    // walking the VCALENDAR itself.
    if (vevent.hasProperty("recurrence-id")) continue;

    const event = new ICAL.Event(vevent);
    if (!event.isRecurring()) {
      events.push(toEvent(event.uid, event.summary, event.startDate, event.endDate));
      continue;
    }

    // Iteration starts at DTSTART, never at the window: ICAL.Event.iterator()
    // re-anchors the rule on whatever time it is given, which would move a
    // weekly event onto a different weekday.
    const iterator = event.iterator();
    let iterations = 0;
    for (let next = iterator.next(); next; next = iterator.next()) {
      if (++iterations > MAX_ITERATIONS) {
        throw new Error(`Recurrence of ${event.uid} exceeds ${MAX_ITERATIONS} occurrences`);
      }
      const { item, startDate, endDate } = event.getOccurrenceDetails(next);
      if (startDate.toJSDate() >= to) break;
      if (endDate.toJSDate() <= from) continue;
      // How an occurrence deleted through an override, rather than through
      // EXDATE, is recorded. EXDATE the expansion already honours.
      if (item.component.getFirstPropertyValue("status") === "CANCELLED") continue;
      events.push(toEvent(event.uid, item.summary, startDate, endDate));
    }
  }
  return events;
}

export async function reportEvents(
  cal: Calendar,
  start: string,
  end: string,
): Promise<CalendarEvent[]> {
  const from = new Date(start);
  const to = new Date(end);
  const range = `start="${toCalDAVDate(from.toISOString())}" ` +
    `end="${toCalDAVDate(to.toISOString())}"`;
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
    if (ics) events.push(...eventsIn(unescapeXml(ics), from, to));
  }
  return events;
}

/**
 * One event by uid, or null when the resource is gone — which is what a
 * cancelled booking looks like. No recurrence handling: the only resources
 * fetched this way are the single VEVENTs the system wrote itself.
 */
export async function getEvent(cal: Calendar, uid: string): Promise<CalendarEvent | null> {
  const response = await fetch(resourceUrl(cal, uid), {
    headers: { Authorization: await cal.authHeader() },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`CalDAV GET failed: ${response.status}`);

  const calendar = new ICAL.Component(ICAL.parse(await response.text()));
  registerTimezones(calendar);
  const vevent = calendar.getFirstSubcomponent("vevent");
  if (!vevent) return null;

  const event = new ICAL.Event(vevent);
  return toEvent(event.uid, event.summary, event.startDate, event.endDate);
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
