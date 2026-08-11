// Pure derivation for the configuration form: which manifest fields are
// visible and required under the current toggles, whether the form is
// complete, and the effective name→value sets the review list shows.
// Secret values arrive as a parameter and are never persisted here —
// main.ts holds them in module memory only.

import type { ManifestEntry } from "./manifest";
import type { FormState, Provider } from "./state";
import { VALIDATORS } from "./validators";

export interface FieldView {
  entry: ManifestEntry;
  visible: boolean;
  required: boolean;
  value: string;
  /** False blocks the review list: a required field left empty, or any
   * non-empty value its validator rejects (then message says why). */
  valid: boolean;
  message?: string;
}

export const PROVIDERS: { id: Provider; label: string }[] = [
  { id: "nextcloud", label: "Nextcloud" },
  { id: "fastmail", label: "Fastmail" },
  { id: "google", label: "Google Calendar" },
  { id: "radicale", label: "Radicale (self-hosted)" },
  { id: "other", label: "Another CalDAV server" },
];

export const PROVIDER_HELP: Record<Provider, string[]> = {
  nextcloud: [
    "Calendar address: in the Nextcloud Calendar app, open the ⋯ menu next " +
      "to the calendar and choose “Copy internal link”.",
    "App password: Settings → Security → “Create new app password”. The " +
      "username stays your Nextcloud username.",
  ],
  fastmail: [
    "Calendar address: Settings → Calendars → the calendar → CalDAV URL.",
    "App password: Settings → Privacy & Security → App passwords — mint one " +
      "just for this.",
  ],
  google: [
    "Google is the awkward one: it needs a service account in Google Cloud " +
      "and its JSON key file, and each calendar shared with the service " +
      "account's address — the booking calendar with “Make changes to " +
      "events”. If that sounds daunting, another provider is easier.",
    "Calendar address: https://apidata.googleusercontent.com/caldav/v2/" +
      "CALENDAR_ID/events/ — write any @ in the ID as %40.",
  ],
  radicale: [
    "Calendar address: http://your-server:5232/username/calendar-name/.",
    "Credentials: the username and password from your Radicale htpasswd file.",
  ],
  other: [
    "Any CalDAV calendar address, ending in a slash. Use an app password if " +
      "your provider mints them — never your ordinary login password.",
  ],
};

const STORE_FIELDS = new Set([
  "BOOKING_STORE_URL",
  "BOOKING_STORE_USERNAME",
  "BOOKING_STORE_PASSWORD",
]);

const BASIC_AUTH_FIELDS = new Set([
  "AVAILABILITY_USERNAME",
  "AVAILABILITY_PASSWORD",
  "BOOKING_STORE_USERNAME",
  "BOOKING_STORE_PASSWORD",
]);

export function visible(entry: ManifestEntry, form: FormState): boolean {
  if (entry.group === "email" && !form.emailOn) return false;
  if (form.sameCalendar && STORE_FIELDS.has(entry.name)) return false;
  if (form.provider === "google") {
    if (BASIC_AUTH_FIELDS.has(entry.name)) return false;
  } else if (entry.name === "GOOGLE_SERVICE_ACCOUNT_JSON") {
    return false;
  }
  return true;
}

function fieldValue(
  entry: ManifestEntry,
  form: FormState,
  secrets: Record<string, string>,
): string {
  return (entry.kind === "secret" ? secrets[entry.name] : form.values[entry.name]) ?? "";
}

export function deriveForm(
  manifest: ManifestEntry[],
  form: FormState,
  secrets: Record<string, string>,
): FieldView[] {
  return manifest.map((entry) => {
    const vis = visible(entry, form);
    const value = fieldValue(entry, form, secrets);
    if (!vis) return { entry, visible: false, required: false, value, valid: true };
    const required = !entry.optional && entry.default === undefined;
    if (!value.trim()) {
      return { entry, visible: true, required, value, valid: !required };
    }
    const verdict = VALIDATORS[entry.validate]!(value);
    return verdict.ok
      ? { entry, visible: true, required, value, valid: true }
      : { entry, visible: true, required, value, valid: false, message: verdict.message };
  });
}

export function formComplete(fields: FieldView[]): boolean {
  return fields.every((f) => !f.visible || f.valid);
}

export interface Effective {
  secrets: Record<string, string>;
  variables: Record<string, string>;
}

/** The complete name→value sets the fork needs: validated, normalised,
 * defaults applied, hidden roles mirrored, empty optionals omitted. */
export function effectiveValues(
  manifest: ManifestEntry[],
  form: FormState,
  secrets: Record<string, string>,
): Effective {
  const out: Effective = { secrets: {}, variables: {} };
  for (const entry of manifest) {
    if (!visible(entry, form)) continue;
    const raw = fieldValue(entry, form, secrets) || entry.default || "";
    if (!raw.trim()) continue;
    const verdict = VALIDATORS[entry.validate]!(raw);
    if (!verdict.ok) continue;
    (entry.kind === "secret" ? out.secrets : out.variables)[entry.name] = verdict.value;
  }
  if (form.sameCalendar) {
    const url = out.secrets["AVAILABILITY_CALENDAR_URL"];
    if (url) out.secrets["BOOKING_STORE_URL"] = url;
    if (form.provider !== "google") {
      const user = out.secrets["AVAILABILITY_USERNAME"];
      const pass = out.secrets["AVAILABILITY_PASSWORD"];
      if (user) out.secrets["BOOKING_STORE_USERNAME"] = user;
      if (pass) out.secrets["BOOKING_STORE_PASSWORD"] = pass;
    }
  }
  return out;
}

/** The domain the email DNS records must vouch for — from a valid sender
 * address, else empty. Feeds the M5 DNS probe; a domain is public by
 * nature, so persisting it breaks no secrecy. */
export function senderDomainOf(secrets: Record<string, string>): string {
  const verdict = VALIDATORS["email"]!(secrets["SENDER_EMAIL"] ?? "");
  return verdict.ok
    ? verdict.value.slice(verdict.value.lastIndexOf("@") + 1).toLowerCase()
    : "";
}
