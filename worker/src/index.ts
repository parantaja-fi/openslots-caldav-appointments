import { reportEvents } from "./caldav";
import { calendars, checkEnv, type Env } from "./config";
import { problem } from "./problem";
import { computeSlots } from "./slots";

const UTC_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

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
  return json({ slots }, cors);
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
    return problem(404, "Not Found", `No route for ${path}.`, cors);
  },
} satisfies ExportedHandler<Env>;
