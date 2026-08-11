import { describe, expect, it } from "vitest";
import { deriveForm, effectiveValues, formComplete, senderDomainOf, visible } from "../src/form";
import type { ManifestEntry } from "../src/manifest";
import { MANIFEST } from "../src/manifest";
import type { FormState } from "../src/state";

function form(overrides: Partial<FormState> = {}): FormState {
  return {
    provider: "nextcloud",
    sameCalendar: true,
    emailOn: true,
    values: { DISPLAY_TIMEZONE: "Europe/Helsinki" },
    ...overrides,
  };
}

/** A complete happy-path secret set for the default form. */
const SECRETS: Record<string, string> = {
  AVAILABILITY_CALENDAR_URL: "https://cloud.example/dav/anna/availability",
  AVAILABILITY_USERNAME: "anna",
  AVAILABILITY_PASSWORD: "app-pass",
  CLOUDFLARE_API_TOKEN: "token",
  CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
  BREVO_API_KEY: "xkeysib-abc",
  SENDER_EMAIL: "info@Practice.example",
};

const entry = (name: string): ManifestEntry => MANIFEST.find((e) => e.name === name)!;

describe("visibility", () => {
  it("hides the booking-store fields when one calendar plays both roles", () => {
    expect(visible(entry("BOOKING_STORE_URL"), form())).toBe(false);
    expect(visible(entry("BOOKING_STORE_URL"), form({ sameCalendar: false }))).toBe(true);
  });

  it("swaps Basic-auth fields for the key file on Google", () => {
    expect(visible(entry("GOOGLE_SERVICE_ACCOUNT_JSON"), form())).toBe(false);
    const google = form({ provider: "google" });
    expect(visible(entry("GOOGLE_SERVICE_ACCOUNT_JSON"), google)).toBe(true);
    expect(visible(entry("AVAILABILITY_USERNAME"), google)).toBe(false);
    expect(visible(entry("AVAILABILITY_PASSWORD"), google)).toBe(false);
  });

  it("hides the whole email group when email is off", () => {
    const off = form({ emailOn: false });
    expect(visible(entry("BREVO_API_KEY"), off)).toBe(false);
    expect(visible(entry("SENDER_EMAIL"), off)).toBe(false);
    expect(visible(entry("DISPLAY_TIMEZONE"), off)).toBe(false);
  });
});

describe("completeness", () => {
  it("holds for the happy path, with optionals empty and defaults untouched", () => {
    expect(formComplete(deriveForm(MANIFEST, form(), SECRETS))).toBe(true);
  });

  it("fails on a missing required secret and on an invalid value", () => {
    const { AVAILABILITY_PASSWORD: _, ...missing } = SECRETS;
    expect(formComplete(deriveForm(MANIFEST, form(), missing))).toBe(false);

    const invalid = { ...SECRETS, AVAILABILITY_CALENDAR_URL: "not a url" };
    const fields = deriveForm(MANIFEST, form(), invalid);
    expect(formComplete(fields)).toBe(false);
    const url = fields.find((f) => f.entry.name === "AVAILABILITY_CALENDAR_URL")!;
    expect(url.valid).toBe(false);
    expect(url.message).toBeTruthy();
  });

  it("does not demand what is hidden", () => {
    const off = form({ emailOn: false });
    const { BREVO_API_KEY: _, SENDER_EMAIL: __, ...noEmail } = SECRETS;
    expect(formComplete(deriveForm(MANIFEST, off, noEmail))).toBe(true);
  });
});

describe("effectiveValues", () => {
  it("mirrors the booking-store role and normalises the URL", () => {
    const eff = effectiveValues(MANIFEST, form(), SECRETS);
    expect(eff.secrets["AVAILABILITY_CALENDAR_URL"]).toBe(
      "https://cloud.example/dav/anna/availability/",
    );
    expect(eff.secrets["BOOKING_STORE_URL"]).toBe(eff.secrets["AVAILABILITY_CALENDAR_URL"]);
    expect(eff.secrets["BOOKING_STORE_USERNAME"]).toBe("anna");
    expect(eff.secrets["BOOKING_STORE_PASSWORD"]).toBe("app-pass");
  });

  it("mirrors only the URL for Google — there are no Basic credentials", () => {
    const key = JSON.stringify({ client_email: "sa@p.iam", private_key: "---" });
    const secrets = {
      ...SECRETS,
      GOOGLE_SERVICE_ACCOUNT_JSON: key,
    };
    const eff = effectiveValues(MANIFEST, form({ provider: "google" }), secrets);
    expect(eff.secrets["GOOGLE_SERVICE_ACCOUNT_JSON"]).toBe(key);
    expect(eff.secrets["BOOKING_STORE_URL"]).toBeDefined();
    expect(eff.secrets["AVAILABILITY_USERNAME"]).toBeUndefined();
    expect(eff.secrets["BOOKING_STORE_USERNAME"]).toBeUndefined();
  });

  it("fills variable defaults and omits email entirely when off", () => {
    const eff = effectiveValues(MANIFEST, form({ emailOn: false }), SECRETS);
    expect(eff.variables["SLOT_MINUTES"]).toBe("30");
    expect(eff.variables["GRANT_TTL_SECS"]).toBe("1800");
    expect(eff.variables["DISPLAY_TIMEZONE"]).toBeUndefined();
    expect(eff.secrets["BREVO_API_KEY"]).toBeUndefined();
    expect(eff.secrets["SENDER_EMAIL"]).toBeUndefined();
  });

  it("omits empty optionals", () => {
    const eff = effectiveValues(MANIFEST, form(), SECRETS);
    expect(eff.secrets["PRACTITIONER_EMAIL"]).toBeUndefined();
    expect(eff.variables["SENDER_NAME"]).toBeUndefined();
  });
});

describe("senderDomainOf", () => {
  it("is the lowercased domain of a valid sender address, else empty", () => {
    expect(senderDomainOf(SECRETS)).toBe("practice.example");
    expect(senderDomainOf({ SENDER_EMAIL: "not-an-address" })).toBe("");
    expect(senderDomainOf({})).toBe("");
  });
});
