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
  return lines.join("\r\n");
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'",
};

/**
 * The calendar data is XML text, and expanded occurrences come back with their
 * CRLFs as `&#13;`, so nothing can be parsed as ICS until this has run.
 */
function unescapeXml(text: string): string {
  return text.replace(/&(#\d+|#x[0-9a-fA-F]+|[a-z]+);/g, (whole, ref: string) => {
    if (ref.startsWith("#x")) return String.fromCodePoint(parseInt(ref.slice(2), 16));
    if (ref.startsWith("#")) return String.fromCodePoint(Number(ref.slice(1)));
    return ENTITIES[ref] ?? whole;
  });
}

function parseIcs(ics: string): CalendarEvent[] {
  return new ICAL.Component(ICAL.parse(ics))
    .getAllSubcomponents("vevent")
    .map(vevent => {
      const event = new ICAL.Event(vevent);
      return {
        uid: event.uid,
        summary: event.summary,
        start: event.startDate.toJSDate().toISOString(),
        end: event.endDate.toJSDate().toISOString(),
      };
    });
}

export async function reportEvents(
  cal: Calendar,
  start: string,
  end: string,
): Promise<CalendarEvent[]> {
  const range = `start="${toCalDAVDate(new Date(start).toISOString())}" ` +
    `end="${toCalDAVDate(new Date(end).toISOString())}"`;
  // The server must already expand recurrences to evaluate the time-range
  // filter, so <c:expand> asks it to return what it computed: every occurrence
  // arrives as its own VEVENT with a real DTSTART (RFC 4791 §9.6.5).
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\r\n` +
    `<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">\r\n` +
    `  <d:prop><d:getetag/><c:calendar-data><c:expand ${range}/></c:calendar-data></d:prop>\r\n` +
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
    if (ics) events.push(...parseIcs(unescapeXml(ics)));
  }
  return events;
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
