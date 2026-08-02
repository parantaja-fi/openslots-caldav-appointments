import { readFileSync } from "node:fs";

/**
 * Just enough CalDAV to paint an OPEN event and inspect the store from Node.
 * The Worker's own client lives in `worker/src/caldav.ts`; duplicating a few
 * verbs here is cheaper than making that module importable from two packages.
 */

// wrangler's own precedence, and one regex serves both files: each states its
// settings as `KEY = "value"`. The calendar URLs live in wrangler.toml unless
// .dev.vars overrides them, so looking only at .dev.vars found nothing on a
// checkout that had not been pointed at another backend.
const sources = ["../../worker/.dev.vars", "../../worker/wrangler.toml"]
  .map(path => readFileSync(new URL(path, import.meta.url), "utf8"));

export function devVar(name: string): string {
  for (const source of sources) {
    const match = source.match(new RegExp(`^${name}\\s*=\\s*["'](.*)["']\\s*$`, "m"));
    if (match?.[1]) return match[1];
  }
  throw new Error(`${name} is set in neither worker/.dev.vars nor worker/wrangler.toml`);
}

const auth = "Basic " + Buffer.from(
  `${devVar("TEST_WRITE_USERNAME")}:${devVar("TEST_WRITE_PASSWORD")}`,
).toString("base64");

function stamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
}

export async function paint(
  calendarUrl: string,
  summary: string,
  start: Date,
  end: Date,
): Promise<void> {
  const uid = crypto.randomUUID();
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//parantaja//e2e//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${summary}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");

  const response = await fetch(`${calendarUrl.replace(/\/$/, "")}/${uid}.ics`, {
    method: "PUT",
    headers: { Authorization: auth, "Content-Type": "text/calendar; charset=utf-8" },
    body: ics,
  });
  if (response.status !== 201 && response.status !== 204) {
    throw new Error(`PUT failed: ${response.status}`);
  }
}

/** The `href`/`calendar-data` pairs in the window, hrefs made absolute. */
export async function report(
  calendarUrl: string,
  start: Date,
  end: Date,
): Promise<{ href: string; ics: string }[]> {
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">` +
    `<d:prop><d:getetag/><c:calendar-data/></d:prop><c:filter>` +
    `<c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">` +
    `<c:time-range start="${stamp(start)}" end="${stamp(end)}"/>` +
    `</c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`;

  const response = await fetch(calendarUrl, {
    method: "REPORT",
    headers: { Authorization: auth, "Content-Type": "application/xml; charset=utf-8", Depth: "1" },
    body,
  });
  if (response.status !== 207) throw new Error(`REPORT failed: ${response.status}`);

  const xml = await response.text();
  const origin = new URL(calendarUrl).origin;
  const responses = xml.matchAll(/<[^:>\s]+:response[\s>][\s\S]*?<\/[^:>\s]+:response>/g);
  const found: { href: string; ics: string }[] = [];
  for (const [block] of responses) {
    const href = block.match(/<[^:>\s]+:href[^>]*>([\s\S]*?)<\//)?.[1]?.trim();
    const ics = block.match(/<[^:>\s]+:calendar-data[^>]*>([\s\S]*?)<\//)?.[1]?.trim();
    if (href && ics) found.push({ href: new URL(href, origin).toString(), ics });
  }
  return found;
}

export async function clear(calendarUrl: string, start: Date, end: Date): Promise<void> {
  for (const { href } of await report(calendarUrl, start, end)) {
    await fetch(href, { method: "DELETE", headers: { Authorization: auth } });
  }
}
