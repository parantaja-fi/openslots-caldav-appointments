import { buildVEvent, deleteEvent, getEvent, putEvent, reportEvents } from "./caldav";
import { type Calendar, config, type Config, type Env } from "./config";
import { sendBookingEmails } from "./email";
import {
  GrantError,
  issueCancellationToken,
  issueCreateGrant,
  verifyCancellationToken,
  verifyCreateGrant,
  verifySessionProof,
} from "./grants";
import { problem } from "./problem";
import { bookingUid, computeSlots, lostRace } from "./slots";

const UTC_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
/** Base64url SHA-256, per RFC 7638. */
const THUMBPRINT = /^[A-Za-z0-9_-]{43}$/;
/** Deliberately loose: enough to catch a typo, not an attempt at RFC 5322. */
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function corsHeaders(request: Request, origins: string[]): Record<string, string> {
  const origin = request.headers.get("Origin") ?? "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Session-Thumbprint, X-Session-Proof",
  };
  if (origins.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json", ...cors },
  });
}

function parseUtcIso(value: string | null): Date | null {
  if (!value || !UTC_ISO.test(value)) return null;
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

async function getSlots(
  request: Request,
  cfg: Config,
  cors: Record<string, string>,
): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const requestedStart = parseUtcIso(params.get("window_start"));
  const requestedEnd = parseUtcIso(params.get("window_end"));
  if (!requestedStart || !requestedEnd) {
    return problem(400, "Bad Request",
      "window_start and window_end must be UTC ISO 8601 datetimes.", cors);
  }

  const now = Date.now();
  const from = new Date(Math.max(requestedStart.getTime(), now + cfg.noticeMs));
  const to = new Date(Math.min(requestedEnd.getTime(), now + cfg.horizonMs));
  if (from >= to) return json({ slots: [] }, cors);

  const { availability, store, coincide } = cfg.calendars;
  const from_ = from.toISOString();
  const to_ = to.toISOString();
  let availabilityEvents, storeEvents;
  try {
    [availabilityEvents, storeEvents] = await Promise.all([
      reportEvents(availability, from_, to_),
      coincide ? Promise.resolve([]) : reportEvents(store, from_, to_),
    ]);
  } catch (e) {
    console.error("CalDAV REPORT failed:", e);
    return problem(502, "Bad Gateway", "The calendar backend could not be read.", cors);
  }

  const slots = computeSlots(availabilityEvents, storeEvents, cfg.slotMs, from, to);
  if (slots.length > cfg.maxSlots) {
    return problem(400, "Bad Request",
      `The window holds more than ${cfg.maxSlots} slots; request a narrower one.`, cors);
  }

  // A caller that identifies its session gets the grant that lets it book;
  // one that just wants to see the calendar need not have a session at all.
  const thumbprint = request.headers.get("X-Session-Thumbprint");
  if (!thumbprint) return json({ slots }, cors);
  if (!THUMBPRINT.test(thumbprint)) {
    return problem(400, "Bad Request", "X-Session-Thumbprint is not a JWK thumbprint.", cors);
  }
  const grant = await issueCreateGrant(cfg, thumbprint, slots.map(s => s.slot_start));
  return json({ slots, grant }, cors);
}

function rejected(e: unknown, cors: Record<string, string>): Response {
  if (!(e instanceof GrantError)) throw e;
  return problem(e.status, e.status === 401 ? "Unauthorized" : "Forbidden", e.message, cors);
}

function bearer(request: Request): string | undefined {
  return request.headers.get("Authorization")?.match(/^Bearer (.+)$/)?.[1];
}

interface BookingRequest {
  slot_start?: unknown;
  attendee?: { name?: unknown; email?: unknown };
  notes?: unknown;
}

async function postBooking(
  request: Request,
  cfg: Config,
  cors: Record<string, string>,
): Promise<Response> {
  let body: BookingRequest;
  try {
    body = await request.json() as BookingRequest;
  } catch {
    return problem(400, "Bad Request", "The request body is not valid JSON.", cors);
  }

  const slotStart = body.slot_start;
  if (typeof slotStart !== "string" || !parseUtcIso(slotStart)) {
    return problem(400, "Bad Request", "slot_start must be a UTC ISO 8601 datetime.", cors);
  }
  const name = typeof body.attendee?.name === "string" ? body.attendee.name.trim() : "";
  if (!name || name.length > 200) {
    return problem(400, "Bad Request", "attendee.name must be 1–200 characters.", cors);
  }
  const email = typeof body.attendee?.email === "string" ? body.attendee.email.trim() : "";
  if (!email || email.length > 320 || !EMAIL.test(email)) {
    return problem(400, "Bad Request", "attendee.email must be an email address.", cors);
  }
  const notes = body.notes ?? "";
  if (typeof notes !== "string" || notes.length > 1000) {
    return problem(400, "Bad Request", "notes must be a string of at most 1000 characters.", cors);
  }

  const grant = bearer(request);
  const proof = request.headers.get("X-Session-Proof");
  if (!grant || !proof) {
    return problem(401, "Unauthorized",
      "A create-grant and a session proof are required to book.", cors);
  }
  try {
    // The proof says which session is calling; the grant says that session was
    // offered this slot. Together they replace re-reading the OPEN events.
    await verifyCreateGrant(cfg, grant, slotStart, await verifySessionProof(cfg, proof));
  } catch (e) {
    return rejected(e, cors);
  }

  const start = new Date(slotStart).toISOString();
  const end = new Date(Date.parse(start) + cfg.slotMs).toISOString();
  const uid = bookingUid();
  const { store } = cfg.calendars;

  // The practitioner reads their customer's address in their own calendar
  // client; a DESCRIPTION line is inert on every backend, where an ATTENDEE
  // property would invite Google to send invitations of its own.
  const description = notes ? `${email}\n\n${notes}` : email;

  try {
    await putEvent(store, uid, buildVEvent(uid, start, end, name, description));
  } catch (e) {
    console.error("CalDAV PUT failed:", e);
    return problem(502, "Bad Gateway", "The booking could not be stored.", cors);
  }

  // CalDAV has no conditional insert, so detect the race afterwards.
  try {
    if (lostRace(uid, await reportEvents(store, start, end), start, end)) {
      await deleteEvent(store, uid);
      return problem(409, "Conflict", "The slot was taken while you were booking it.", cors);
    }
  } catch (e) {
    console.error("Conflict check failed:", e);
    await deleteEvent(store, uid).catch(() => {});
    return problem(502, "Bad Gateway", "The booking could not be confirmed.", cors);
  }

  // Only now, with the booking confirmed and not rolled back, is there
  // anything to confirm. A failure here is reported, never fatal: the booking
  // stands, and the panel that made it can still cancel.
  const cancellationToken = await issueCancellationToken(cfg, uid, start);
  const confirmation = cfg.email
    ? await sendBookingEmails(cfg.email, {
      uid, slotStart: start, slotEnd: end, name, email, notes, cancellationToken,
    })
    : "disabled";

  return json({
    uid,
    slot_start: start,
    slot_end: end,
    cancellation_token: cancellationToken,
    confirmation_email: confirmation,
  }, cors);
}

/** Health answers any origin: it is token-less, and its body leaks nothing. */
const HEALTH_CORS = { "Access-Control-Allow-Origin": "*" };

interface Probe {
  ok: boolean;
  error?: string;
}

/**
 * The same read a booking depends on, over a near-empty window. Only the
 * Worker's own error text passes through: a runtime failure message may embed
 * the backend's hostname, which the health response must not.
 */
function probeCalendar(cal: Calendar): Promise<Probe> {
  const now = Date.now();
  const probe = reportEvents(
    cal,
    new Date(now).toISOString(),
    new Date(now + 3_600_000).toISOString(),
  )
    .then((): Probe => ({ ok: true }))
    .catch((e: unknown): Probe => ({
      ok: false,
      error: e instanceof Error && e.message.startsWith("CalDAV") ? e.message : "unreachable",
    }));
  const timeout = new Promise<Probe>(resolve =>
    setTimeout(() => resolve({ ok: false, error: "timed out" }), 5_000));
  return Promise.race([probe, timeout]);
}

function healthResponse(ok: boolean, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ ok, ...body }), {
    status: ok ? 200 : 503,
    headers: { "Content-Type": "application/json", ...HEALTH_CORS },
  });
}

async function getHealth(cfg: Config, env: Env): Promise<Response> {
  const { availability, store, coincide } = cfg.calendars;
  const availabilityProbe = probeCalendar(availability);
  // `store` internally, `appointments` on the wire (`ARCHITECTURE.md` §3).
  const [availabilityHealth, appointments] = await Promise.all([
    availabilityProbe,
    coincide ? availabilityProbe : probeCalendar(store),
  ]);

  // The sender travels with the ordinary vars, the API key separately as a
  // secret, so "sender set, key missing" is the forgot-the-secret shape.
  const email = cfg.email ? "configured" : env.SENDER_EMAIL ? "missing_key" : "off";

  return healthResponse(availabilityHealth.ok && appointments.ok && email !== "missing_key", {
    config: { ok: true },
    calendars: { availability: availabilityHealth, appointments },
    email,
  });
}

/**
 * The bearer capability both single-booking routes stand on: a cancellation
 * token naming this very booking. Returns the refusal, or null to proceed.
 */
async function tokenRefusal(
  request: Request,
  cfg: Config,
  uid: string,
  cors: Record<string, string>,
): Promise<Response | null> {
  const token = bearer(request);
  if (!token) {
    return problem(401, "Unauthorized", "A cancellation token is required.", cors);
  }

  let named: string;
  try {
    named = await verifyCancellationToken(cfg, token);
  } catch (e) {
    return rejected(e, cors);
  }
  if (named !== uid) {
    return problem(403, "Forbidden", "The token names a different booking.", cors);
  }
  return null;
}

/** What the emailed link's page shows before offering to cancel. */
async function getBooking(
  request: Request,
  cfg: Config,
  uid: string,
  cors: Record<string, string>,
): Promise<Response> {
  const refusal = await tokenRefusal(request, cfg, uid, cors);
  if (refusal) return refusal;

  let event;
  try {
    event = await getEvent(cfg.calendars.store, uid);
  } catch (e) {
    console.error("CalDAV GET failed:", e);
    return problem(502, "Bad Gateway", "The booking could not be read.", cors);
  }
  // A cancelled booking is a deleted event, so this is also how the page
  // learns that it has already been cancelled.
  if (!event) return problem(404, "Not Found", "That booking no longer exists.", cors);

  // The attendee's name and address are not echoed: the page shows when the
  // appointment is, and needs nothing else.
  return json({ uid, slot_start: event.start, slot_end: event.end }, cors);
}

async function deleteBooking(
  request: Request,
  cfg: Config,
  uid: string,
  cors: Record<string, string>,
): Promise<Response> {
  const refusal = await tokenRefusal(request, cfg, uid, cors);
  if (refusal) return refusal;

  try {
    // Idempotent: a token holder who cancels twice has still got what they
    // asked for, and the second call must not look like a failure.
    await deleteEvent(cfg.calendars.store, uid);
  } catch (e) {
    console.error("CalDAV DELETE failed:", e);
    return problem(502, "Bad Gateway", "The booking could not be cancelled.", cors);
  }
  return new Response(null, { status: 204, headers: cors });
}

function route(
  request: Request,
  cfg: Config,
  env: Env,
  cors: Record<string, string>,
): Promise<Response> | Response {
  const path = new URL(request.url).pathname;
  if (path === "/v1/health") {
    if (request.method !== "GET") {
      return problem(405, "Method Not Allowed", `${request.method} is not allowed here.`, HEALTH_CORS);
    }
    return getHealth(cfg, env);
  }
  if (path === "/v1/slots") {
    if (request.method !== "GET") {
      return problem(405, "Method Not Allowed", `${request.method} is not allowed here.`, cors);
    }
    return getSlots(request, cfg, cors);
  }
  if (path === "/v1/bookings") {
    if (request.method !== "POST") {
      return problem(405, "Method Not Allowed", `${request.method} is not allowed here.`, cors);
    }
    return postBooking(request, cfg, cors);
  }
  // The uid is not percent-decoded: the uids this Worker issues need no
  // escaping, and decoding a malformed escape would throw.
  const booking = path.match(/^\/v1\/bookings\/([^/]+)$/);
  if (booking?.[1]) {
    if (request.method === "GET") return getBooking(request, cfg, booking[1], cors);
    if (request.method === "DELETE") return deleteBooking(request, cfg, booking[1], cors);
    return problem(405, "Method Not Allowed", `${request.method} is not allowed here.`, cors);
  }
  return problem(404, "Not Found", `No route for ${path}.`, cors);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // The allowed origins are configuration too, so the configuration must be
    // in hand before any response — including the misconfiguration one, which
    // therefore carries no CORS headers.
    let cfg: Config;
    try {
      cfg = config(env);
    } catch (e) {
      console.error("Worker misconfigured:", e);
      // Reporting this very state is what the health endpoint is for; with no
      // configuration there is nothing further to probe.
      if (new URL(request.url).pathname === "/v1/health" && request.method === "GET") {
        return healthResponse(false, {
          config: { ok: false, error: e instanceof Error ? e.message : String(e) },
        });
      }
      return problem(500, "Internal Server Error", "The service is misconfigured.", {});
    }
    const cors = corsHeaders(request, cfg.origins);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    try {
      // Before the router, so that no request reaches the calendar backend on
      // someone else's budget; preflights are already answered above.
      if (cfg.rateLimit) {
        const { success } = await cfg.rateLimit.limit({
          key: request.headers.get("CF-Connecting-IP") ?? "unknown",
        });
        if (!success) {
          return problem(429, "Too Many Requests", "Too many requests; try again shortly.", cors);
        }
      }
      return await route(request, cfg, env, cors);
    } catch (e) {
      // Whatever it was, the caller is a browser: it needs the CORS headers and
      // the documented error shape, not an opaque runtime failure.
      console.error("Unhandled error:", e);
      return problem(500, "Internal Server Error", "The request could not be handled.", cors);
    }
  },
} satisfies ExportedHandler<Env>;
