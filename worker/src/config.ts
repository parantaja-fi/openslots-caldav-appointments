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
  AVAILABILITY_USERNAME?: string;
  AVAILABILITY_PASSWORD?: string;
  BOOKING_STORE_USERNAME?: string;
  BOOKING_STORE_PASSWORD?: string;
  GOOGLE_SERVICE_ACCOUNT_JSON?: string;
  SIGNING_KEY_JWK: string;
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

function basicAuth(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  return `Basic ${btoa(String.fromCharCode(...bytes))}`;
}

/**
 * A username selects HTTP Basic; otherwise the Google service account is used.
 * The two roles may differ, which is what lets availability be read-only.
 */
export function calendar(
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
  throw new Error(`No credentials configured for ${url}`);
}

export function calendars(env: Env): Calendars {
  return {
    availability: calendar(
      env.AVAILABILITY_CALENDAR_URL,
      env.AVAILABILITY_USERNAME,
      env.AVAILABILITY_PASSWORD,
      env.GOOGLE_SERVICE_ACCOUNT_JSON,
    ),
    store: calendar(
      env.BOOKING_STORE_URL,
      env.BOOKING_STORE_USERNAME,
      env.BOOKING_STORE_PASSWORD,
      env.GOOGLE_SERVICE_ACCOUNT_JSON,
    ),
    coincide: env.AVAILABILITY_CALENDAR_URL === env.BOOKING_STORE_URL,
  };
}

const NUMERIC_VARS = [
  "SLOT_MINUTES",
  "BOOKING_HORIZON_DAYS",
  "MIN_NOTICE_MINUTES",
  "MAX_SLOTS",
  "GRANT_TTL_SECS",
  "PROOF_MAX_AGE_SECS",
] as const satisfies readonly (keyof Env)[];

/**
 * Workers have no startup hook, so every request validates configuration
 * first; otherwise missing secrets surface as cryptic errors mid-request.
 * Returns a description of the first problem, or null.
 */
export function checkEnv(env: Env): string | null {
  for (const role of ["AVAILABILITY_CALENDAR_URL", "BOOKING_STORE_URL"] as const) {
    if (!env[role]) return `${role} is not set`;
  }
  for (const name of NUMERIC_VARS) {
    const value = Number(env[name]);
    if (!Number.isFinite(value) || value <= 0) return `${name} must be a positive number`;
  }
  if (!env.AVAILABILITY_USERNAME && !env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return "availability calendar has neither AVAILABILITY_USERNAME nor GOOGLE_SERVICE_ACCOUNT_JSON";
  }
  if (!env.BOOKING_STORE_USERNAME && !env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return "booking store has neither BOOKING_STORE_USERNAME nor GOOGLE_SERVICE_ACCOUNT_JSON";
  }
  if (!env.SIGNING_KEY_JWK) return "SIGNING_KEY_JWK is not set; run `npm run keygen`";
  return null;
}
