import type { JWK } from "jose";
import { googleAccessToken } from "./auth";

export interface Env {
  AVAILABILITY_CALENDAR_URL: string;
  BOOKING_STORE_URL: string;
  SLOT_MINUTES: string;
  BOOKING_HORIZON_DAYS: string;
  MIN_NOTICE_MINUTES: string;
  MAX_SLOTS: string;
  GRANT_TTL_SECS: string;
  PROOF_MAX_AGE_SECS: string;
  ALLOWED_ORIGINS: string;
  CANCEL_URL: string;
  DISPLAY_TIMEZONE: string;
  SENDER_EMAIL: string;
  SENDER_NAME?: string;
  PRACTITIONER_EMAIL?: string;
  /** Absent or empty means the confirmation email is deliberately off. */
  BREVO_API_KEY?: string;
  AVAILABILITY_USERNAME?: string;
  AVAILABILITY_PASSWORD?: string;
  BOOKING_STORE_USERNAME?: string;
  BOOKING_STORE_PASSWORD?: string;
  GOOGLE_SERVICE_ACCOUNT_JSON?: string;
  SIGNING_KEY_JWK: string;
  /** Optional because `wrangler dev` leaves it unbound; see wrangler.toml. */
  BOOKING_RL?: RateLimit;
}

/** One of the two logical calendars: a URL plus a way to authenticate to it. */
export interface Calendar {
  url: string;
  authHeader(): Promise<string>;
}

export interface Calendars {
  availability: Calendar;
  store: Calendar;
  /** True when both roles resolve to the same backend calendar. */
  coincide: boolean;
}

/** Everything `sendEmail()` needs, present only when a transport is configured. */
export interface Email {
  apiKey: string;
  sender: { email: string; name: string };
  /** The SPA page the cancellation link points at. */
  cancelUrl: string;
  /** IANA zone the appointment times are written in. */
  timezone: string;
  practitioner?: string;
}

/** The Worker's configuration, in the units the code actually uses. */
export interface Config {
  calendars: Calendars;
  email?: Email;
  slotMs: number;
  noticeMs: number;
  horizonMs: number;
  maxSlots: number;
  grantTtlSecs: number;
  proofMaxAgeSecs: number;
  origins: string[];
  signingKeyJwk: JWK;
  rateLimit?: RateLimit;
}

function basicAuth(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  return `Basic ${btoa(String.fromCharCode(...bytes))}`;
}

/**
 * A username selects HTTP Basic; otherwise the Google service account is used.
 * The two roles may differ, which is what lets availability be read-only.
 * The error names the role, never the URL: the health endpoint repeats
 * configuration errors to any origin.
 */
export function calendar(
  role: string,
  url: string,
  username: string | undefined,
  password: string | undefined,
  googleServiceAccountJson: string | undefined,
): Calendar {
  if (username) {
    const header = basicAuth(username, password ?? "");
    return { url, authHeader: () => Promise.resolve(header) };
  }
  if (googleServiceAccountJson) {
    const json = googleServiceAccountJson;
    return { url, authHeader: async () => `Bearer ${await googleAccessToken(json)}` };
  }
  throw new Error(`No credentials configured for the ${role} calendar`);
}

function required(env: Env, name: keyof Env): string {
  const value = env[name];
  if (typeof value !== "string" || !value) throw new Error(`${name} is not set`);
  return value;
}

function positive(env: Env, name: keyof Env): number {
  const value = Number(required(env, name));
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return value;
}

/**
 * No API key means the deployment deliberately sends no mail — which is what
 * lets `wrangler dev` and the live test suites run without reaching Brevo.
 * With one, the rest must be there and usable: an unresolvable zone or a
 * malformed cancellation URL would otherwise surface only in a sent message.
 */
function email(env: Env): Email | undefined {
  if (!env.BREVO_API_KEY) return undefined;

  const timezone = required(env, "DISPLAY_TIMEZONE");
  // Throws RangeError on a zone the runtime cannot resolve.
  new Intl.DateTimeFormat("en", { timeZone: timezone });
  const cancelUrl = required(env, "CANCEL_URL");
  new URL(cancelUrl);

  return {
    apiKey: env.BREVO_API_KEY,
    sender: { email: required(env, "SENDER_EMAIL"), name: env.SENDER_NAME || "Bookings" },
    cancelUrl,
    timezone,
    practitioner: env.PRACTITIONER_EMAIL || undefined,
  };
}

/**
 * Workers have no startup hook, so every request parses the configuration
 * first. Parsing *is* the validation: nothing is read anywhere that was not
 * converted here, so a missing or nonsensical value cannot surface later as a
 * cryptic mid-request error. Throws with a description of the first problem.
 */
export function config(env: Env): Config {
  const availabilityUrl = required(env, "AVAILABILITY_CALENDAR_URL");
  const storeUrl = required(env, "BOOKING_STORE_URL");
  const origins = required(env, "ALLOWED_ORIGINS")
    .split(",").map(origin => origin.trim()).filter(Boolean);
  if (!origins.length) throw new Error("ALLOWED_ORIGINS lists no origin");

  return {
    calendars: {
      availability: calendar(
        "availability",
        availabilityUrl,
        env.AVAILABILITY_USERNAME,
        env.AVAILABILITY_PASSWORD,
        env.GOOGLE_SERVICE_ACCOUNT_JSON,
      ),
      store: calendar(
        "booking-store",
        storeUrl,
        env.BOOKING_STORE_USERNAME,
        env.BOOKING_STORE_PASSWORD,
        env.GOOGLE_SERVICE_ACCOUNT_JSON,
      ),
      coincide: availabilityUrl === storeUrl,
    },
    email: email(env),
    slotMs: positive(env, "SLOT_MINUTES") * 60_000,
    noticeMs: positive(env, "MIN_NOTICE_MINUTES") * 60_000,
    horizonMs: positive(env, "BOOKING_HORIZON_DAYS") * 86_400_000,
    maxSlots: positive(env, "MAX_SLOTS"),
    grantTtlSecs: positive(env, "GRANT_TTL_SECS"),
    proofMaxAgeSecs: positive(env, "PROOF_MAX_AGE_SECS"),
    origins,
    signingKeyJwk: JSON.parse(required(env, "SIGNING_KEY_JWK")) as JWK,
    rateLimit: env.BOOKING_RL,
  };
}
