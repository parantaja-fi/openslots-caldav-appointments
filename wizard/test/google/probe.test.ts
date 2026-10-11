import { afterEach, describe, expect, it, vi } from "vitest";
import { probeCalendar } from "../../src/google/probe";

const TOKEN = "test-access-token";
const ID = "c_0a1b2c3d4e5f@group.calendar.google.com";
const OWNER = "anna@gmail.com";
const CALENDARS = "https://www.googleapis.com/calendar/v3/calendars";
const OFFLINE = "Google could not be reached — no network, or Google is down.";

// Google's bodies from plan §10 and the spike's RESULTS.md, verbatim
// apart from their masking.

/** events.list?maxResults=1&fields=summary,timeZone,accessRole. */
const EVENTS = `{
 "summary": "booking-calendar",
 "timeZone": "Europe/Helsinki",
 "accessRole": "owner"
}`;

/** calendars.get, cut down to what fields=dataOwner asks for. */
const CALENDAR = `{
 "dataOwner": "${OWNER}"
}`;

/** Calendar's 404, legacy shape only: an unknown calendar. */
const NOT_FOUND = `{
 "error": {
  "errors": [
   {
    "domain": "global",
    "reason": "notFound",
    "message": "Not Found"
   }
  ],
  "code": 404,
  "message": "Not Found"
 }
}`;

/** Calendar's 403 for a token without the scope, hybrid shape. */
const SCOPE =
  '{"error":{"code":403,"message":"Request had insufficient authentication scopes.",' +
  '"errors":[{"message":"Insufficient Permission","domain":"global",' +
  '"reason":"insufficientPermissions"}],"status":"PERMISSION_DENIED",' +
  '"details":[{"@type":"type.googleapis.com/google.rpc.ErrorInfo",' +
  '"reason":"ACCESS_TOKEN_SCOPE_INSUFFICIENT","domain":"googleapis.com",' +
  '"metadata":{"service":"calendar-json.googleapis.com",' +
  '"method":"calendar.v3.CalendarList.Insert"}}]}}';

const ACTIVATE =
  "https://console.developers.google.com/apis/api/calendar-json.googleapis.com/overview" +
  "?project=123456789012";

/** Inferred, not seen: §10's Drive body with the Calendar API in its
 * place and a made-up project number. */
const DISABLED = `{
  "error": {
    "code": 403,
    "message": "Google Calendar API has not been used in project 123456789012 before or it is disabled. Enable it by visiting ${ACTIVATE} then retry. If you enabled this API recently, wait a few minutes for the action to propagate to our systems and retry.",
    "errors": [
      {
        "message": "…",
        "domain": "usageLimits",
        "reason": "accessNotConfigured",
        "extendedHelp": "https://console.developers.google.com"
      }
    ],
    "status": "PERMISSION_DENIED",
    "details": [
      {
        "@type": "type.googleapis.com/google.rpc.ErrorInfo",
        "reason": "SERVICE_DISABLED",
        "domain": "googleapis.com",
        "metadata": {
          "activationUrl": "${ACTIVATE}",
          "serviceTitle": "Google Calendar API",
          "containerInfo": "123456789012",
          "service": "calendar-json.googleapis.com",
          "consumer": "projects/123456789012"
        }
      },
      {
        "@type": "type.googleapis.com/google.rpc.LocalizedMessage",
        "locale": "en-US",
        "message": "…"
      },
      {
        "@type": "type.googleapis.com/google.rpc.Help",
        "links": [
          {
            "description": "Google developers console API activation",
            "url": "${ACTIVATE}"
          }
        ]
      }
    ]
  }
}`;

/** What Google answers on each read; null for a network that is down. */
interface Replies {
  events: [number, string] | null;
  calendar: [number, string] | null;
}

function google({ events, calendar }: Replies) {
  const fetch = vi.fn(async (url: string, _init: RequestInit) => {
    const reply = url.includes("/events?") ? events : calendar;
    if (!reply) throw new TypeError("fetch failed");
    return new Response(reply[1], {
      status: reply[0],
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => vi.unstubAllGlobals());

describe("probeCalendar", () => {
  it("asks both reads as the service account, the ID encoded", async () => {
    const fetch = google({ events: [200, EVENTS], calendar: [200, CALENDAR] });
    await probeCalendar(TOKEN, ID);
    const calendar = `${CALENDARS}/c_0a1b2c3d4e5f%40group.calendar.google.com`;
    expect(fetch.mock.calls.map(([url]) => url).sort()).toEqual([
      `${calendar}/events?maxResults=1&fields=summary,timeZone,accessRole`,
      `${calendar}?fields=dataOwner`,
    ]);
    for (const [, init] of fetch.mock.calls) {
      expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${TOKEN}`);
    }
  });

  it("is present, the owner from calendars.get and the rest from events.list", async () => {
    google({ events: [200, EVENTS], calendar: [200, CALENDAR] });
    expect(await probeCalendar(TOKEN, ID)).toEqual({
      state: "present",
      summary: "booking-calendar",
      timeZone: "Europe/Helsinki",
      accessRole: "owner",
      owner: OWNER,
    });
  });

  it("takes a main calendar's ID for its owner, Google naming none", async () => {
    google({ events: [200, EVENTS], calendar: [200, "{}"] });
    expect(await probeCalendar(TOKEN, OWNER)).toMatchObject({ state: "present", owner: OWNER });
  });

  it("is absent on Google's 404", async () => {
    google({ events: [404, NOT_FOUND], calendar: [404, NOT_FOUND] });
    expect(await probeCalendar(TOKEN, ID)).toEqual({ state: "absent" });
  });

  // Constructed: the level Google gives a calendar the account has no access to.
  it("is absent on an access level of none", async () => {
    google({ events: [200, '{"accessRole":"none"}'], calendar: [200, CALENDAR] });
    expect(await probeCalendar(TOKEN, ID)).toEqual({ state: "absent" });
  });

  it("is disabled on SERVICE_DISABLED, with the body's activation link", async () => {
    google({ events: [403, DISABLED], calendar: [403, DISABLED] });
    expect(await probeCalendar(TOKEN, ID)).toEqual({
      state: "disabled",
      activationUrl: ACTIVATE,
    });
  });

  // Constructed: the legacy half of the body above, alone.
  it("is disabled on the legacy accessNotConfigured alone, with no link to give", async () => {
    const legacy =
      '{"error":{"code":403,"message":"…","errors":[{"message":"…","domain":"usageLimits",' +
      '"reason":"accessNotConfigured","extendedHelp":"https://console.developers.google.com"}]}}';
    google({ events: [403, legacy], calendar: [403, legacy] });
    expect(await probeCalendar(TOKEN, ID)).toEqual({ state: "disabled", activationUrl: "" });
  });

  it("is blind on any other refusal, quoting Google", async () => {
    google({ events: [403, SCOPE], calendar: [403, SCOPE] });
    expect(await probeCalendar(TOKEN, ID)).toEqual({
      state: "blind",
      reason: "Google answered 403 — “Request had insufficient authentication scopes.”",
    });
  });

  it("is blind on an answer without Google's error, naming the status", async () => {
    const html = "<html><body>Service Unavailable</body></html>";
    google({ events: [503, html], calendar: [503, html] });
    expect(await probeCalendar(TOKEN, ID)).toEqual({
      state: "blind",
      reason: "Google answered 503 — the wizard cannot see the calendar right now.",
    });
  });

  it("is blind on an access level it does not know, naming it", async () => {
    const events = EVENTS.replace('"owner"', '"coOwner"');
    google({ events: [200, events], calendar: [200, CALENDAR] });
    expect(await probeCalendar(TOKEN, ID)).toEqual({
      state: "blind",
      reason: "Google reports the access level “coOwner”, which the wizard does not know.",
    });
  });

  it("is blind without a network, saying so", async () => {
    google({ events: null, calendar: null });
    expect(await probeCalendar(TOKEN, ID)).toEqual({ state: "blind", reason: OFFLINE });
  });

  it("wears the worse of two disagreeing answers", async () => {
    const cases: [Replies, unknown][] = [
      [{ events: [200, EVENTS], calendar: [404, NOT_FOUND] }, { state: "absent" }],
      [{ events: [404, NOT_FOUND], calendar: null }, { state: "absent" }],
      [{ events: null, calendar: [403, DISABLED] }, { state: "disabled", activationUrl: ACTIVATE }],
      [{ events: [200, EVENTS], calendar: null }, { state: "blind", reason: OFFLINE }],
      [{ events: null, calendar: [200, CALENDAR] }, { state: "blind", reason: OFFLINE }],
    ];
    for (const [i, [replies, probe]] of cases.entries()) {
      google(replies);
      expect(await probeCalendar(TOKEN, ID), `case ${i}`).toEqual(probe);
    }
  });
});
