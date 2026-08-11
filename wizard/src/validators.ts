// Named validators the manifest refers to. Each normalises where safe
// (trimming, appending a trailing slash) rather than nagging; the value
// in a passing verdict is what the review list shows and copies.

export type Verdict = { ok: true; value: string } | { ok: false; message: string };

type Validator = (raw: string) => Verdict;

const ok = (value: string): Verdict => ({ ok: true, value });
const bad = (message: string): Verdict => ({ ok: false, message });

export const VALIDATORS: Record<string, Validator> = {
  text: (raw) => ok(raw.trim()),

  nonEmpty: (raw) => (raw.trim() ? ok(raw.trim()) : bad("cannot be empty")),

  caldavUrl: (raw) => {
    const value = raw.trim();
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return bad("not a full address — it starts with https://");
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return bad("must be an http(s) address");
    }
    return ok(value.endsWith("/") ? value : `${value}/`);
  },

  email: (raw) => {
    const value = raw.trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      ? ok(value)
      : bad("not an email address");
  },

  timezone: (raw) => {
    const value = raw.trim();
    return Intl.supportedValuesOf("timeZone").includes(value)
      ? ok(value)
      : bad("not a timezone name this browser knows — like Europe/Helsinki");
  },

  posInt: (raw) => {
    const value = raw.trim();
    return /^\d+$/.test(value) && Number(value) > 0
      ? ok(value)
      : bad("must be a positive whole number");
  },

  cloudflareAccountId: (raw) => {
    const value = raw.trim().toLowerCase();
    return /^[0-9a-f]{32}$/.test(value)
      ? ok(value)
      : bad("expected 32 characters of letters a–f and digits");
  },

  googleJson: (raw) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return bad("not valid JSON — paste the whole key file, unchanged");
    }
    const record = parsed as Record<string, unknown>;
    return typeof record["client_email"] === "string" &&
      typeof record["private_key"] === "string"
      ? ok(raw.trim())
      : bad("JSON, but not a service-account key — no client_email or private_key in it");
  },
};
