import { buildVEvent, deleteEvent, putEvent, reportEvents } from "./caldav";
import { calendars, checkEnv, type Env } from "./config";
import {
  GrantError,
  issueCancellationToken,
  issueCreateGrant,
  verifyCancellationToken,
  verifyCreateGrant,
  verifySessionProof,
} from "./grants";
import { problem } from "./problem";
import { computeSlots } from "./slots";

const UTC_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
/** Base64url SHA-256, per RFC 7638. */
const THUMBPRINT = /^[A-Za-z0-9_-]{43}$/;

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("Origin") ?? "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Session-Thumbprint, X-Session-Proof",
  };
  if (env.ALLOWED_ORIGINS.split(",").some(allowed => allowed.trim() === origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
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

async function getSlots(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const requestedStart = parseUtcIso(params.get("window_start"));
  const requestedEnd = parseUtcIso(params.get("window_end"));
  if (!requestedStart || !requestedEnd) {
    return problem(400, "Bad Request",
      "window_start and window_end must be UTC ISO 8601 datetimes.", cors);
  }

  const now = Date.now();
  const from = new Date(Math.max(
    requestedStart.getTime(),
    now + Number(env.MIN_NOTICE_MINUTES) * 60_000,
  ));
  const to = new Date(Math.min(
    requestedEnd.getTime(),
    now + Number(env.BOOKING_HORIZON_DAYS) * 86_400_000,
  ));
  if (from >= to) return json({ slots: [] }, cors);

  const { availability, store, coincide } = calendars(env);
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

  const slots = computeSlots(
    availabilityEvents, storeEvents, Number(env.SLOT_MINUTES), from, to,
  );
  if (slots.length > Number(env.MAX_SLOTS)) {
    return problem(400, "Bad Request",
      `The window holds more than ${env.MAX_SLOTS} slots; request a narrower one.`, cors);
  }

  // A caller that identifies its session gets the grant that lets it book;
  // one that just wants to see the calendar need not have a session at all.
  const thumbprint = request.headers.get("X-Session-Thumbprint");
  if (!thumbprint) return json({ slots }, cors);
  if (!THUMBPRINT.test(thumbprint)) {
    return problem(400, "Bad Request", "X-Session-Thumbprint is not a JWK thumbprint.", cors);
  }
  const grant = await issueCreateGrant(env, thumbprint, slots.map(s => s.slot_start));
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

async function postBooking(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
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
    await verifyCreateGrant(env, grant, slotStart, await verifySessionProof(env, proof));
  } catch (e) {
    return rejected(e, cors);
  }

  const start = new Date(slotStart).toISOString();
  const end = new Date(Date.parse(start) + Number(env.SLOT_MINUTES) * 60_000).toISOString();
  const uid = crypto.randomUUID();
  const { store } = calendars(env);

  try {
    await putEvent(store, uid, buildVEvent(uid, start, end, name, notes));
  } catch (e) {
    console.error("CalDAV PUT failed:", e);
    return problem(502, "Bad Gateway", "The booking could not be stored.", cors);
  }

  // CalDAV has no conditional insert, so detect the race afterwards: anyone
  // else's non-OPEN event in this slot means we lost it, and ours must go.
  try {
    const events = await reportEvents(store, start, end);
    const conflict = events.some(event =>
      event.uid !== uid && event.summary !== "OPEN" &&
      event.start < end && event.end > start);
    if (conflict) {
      await deleteEvent(store, uid);
      return problem(409, "Conflict", "The slot was taken while you were booking it.", cors);
    }
  } catch (e) {
    console.error("Conflict check failed:", e);
    await deleteEvent(store, uid).catch(() => {});
    return problem(502, "Bad Gateway", "The booking could not be confirmed.", cors);
  }

  return json({
    uid,
    slot_start: start,
    slot_end: end,
    cancellation_token: await issueCancellationToken(env, uid, start),
  }, cors);
}

async function deleteBooking(
  request: Request,
  env: Env,
  uid: string,
  cors: Record<string, string>,
): Promise<Response> {
  const token = bearer(request);
  if (!token) {
    return problem(401, "Unauthorized", "A cancellation token is required.", cors);
  }

  let named: string;
  try {
    named = await verifyCancellationToken(env, token);
  } catch (e) {
    return rejected(e, cors);
  }
  if (named !== uid) {
    return problem(403, "Forbidden", "The token cancels a different booking.", cors);
  }

  try {
    // Idempotent: a token holder who cancels twice has still got what they
    // asked for, and the second call must not look like a failure.
    await deleteEvent(calendars(env).store, uid);
  } catch (e) {
    console.error("CalDAV DELETE failed:", e);
    return problem(502, "Bad Gateway", "The booking could not be cancelled.", cors);
  }
  return new Response(null, { status: 204, headers: cors });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(request, env);

    // Workers have no startup hook, so configuration is checked per request.
    const misconfigured = checkEnv(env);
    if (misconfigured) {
      console.error("Worker misconfigured:", misconfigured);
      return problem(500, "Internal Server Error", "The service is misconfigured.", cors);
    }

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const path = new URL(request.url).pathname;
    if (path === "/v1/slots") {
      if (request.method !== "GET") {
        return problem(405, "Method Not Allowed", `${request.method} is not allowed here.`, cors);
      }
      return getSlots(request, env, cors);
    }
    if (path === "/v1/bookings") {
      if (request.method !== "POST") {
        return problem(405, "Method Not Allowed", `${request.method} is not allowed here.`, cors);
      }
      return postBooking(request, env, cors);
    }
    const booking = path.match(/^\/v1\/bookings\/([^/]+)$/);
    if (booking?.[1]) {
      if (request.method !== "DELETE") {
        return problem(405, "Method Not Allowed", `${request.method} is not allowed here.`, cors);
      }
      return deleteBooking(request, env, decodeURIComponent(booking[1]), cors);
    }
    return problem(404, "Not Found", `No route for ${path}.`, cors);
  },
} satisfies ExportedHandler<Env>;
