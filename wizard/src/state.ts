export const UPSTREAM_OWNER = "parantaja-fi";
export const UPSTREAM_REPO = "openslots-caldav-appointments";

export type Provider = "nextcloud" | "fastmail" | "google" | "radicale" | "other";

export interface Inputs {
  owner: string;
  repo: string;
  /** Discovered from the fork's deploy-info.json, kept for the health
   * probe; never typed. */
  workerUrl: string;
  /** The booking page's real URL, also from deploy-info.json — never
   * constructed from the username (a custom Pages domain changes it). */
  pageUrl: string;
  /** Derived from the form's sender address, kept for the DNS probe. */
  senderDomain: string;
}

/** The non-secret half of the configuration form. Secret values live in
 * module memory only (main.ts) and must never reach this structure. */
export interface FormState {
  provider: Provider;
  sameCalendar: boolean;
  emailOn: boolean;
  /** Values of kind: "variable" manifest entries. */
  values: Record<string, string>;
}

/** One DNS record Brevo wants placed, with its last-known verdict.
 * Public data by nature — safe to persist. */
export interface BrevoRecord {
  label: string;
  type: string;
  host: string;
  value: string;
  status: boolean;
}

/** The sender domain as registered at Brevo. Persisted so the records
 * stay on screen across sessions while DNS propagates — only the API
 * key is pasted again on resume. */
export interface BrevoState {
  domain: string;
  authenticated: boolean;
  records: BrevoRecord[];
}

export interface Saved {
  inputs: Inputs;
  /** Manual steps the practitioner has ticked off themselves. */
  done: Record<string, boolean>;
  form: FormState;
  brevo: BrevoState | null;
}

const KEY = "wizard-state";

export function load(): Saved {
  const fallback: Saved = {
    inputs: { owner: "", repo: UPSTREAM_REPO, workerUrl: "", pageUrl: "", senderDomain: "" },
    done: {},
    form: { provider: "nextcloud", sameCalendar: true, emailOn: true, values: {} },
    brevo: null,
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Saved;
    return {
      inputs: { ...fallback.inputs, ...parsed.inputs },
      done: parsed.done ?? {},
      form: {
        ...fallback.form,
        ...parsed.form,
        values: parsed.form?.values ?? {},
      },
      brevo: parsed.brevo ?? null,
    };
  } catch {
    return fallback;
  }
}

export function save(state: Saved): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}
