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
  /** Which Cloudflare account this setup means — an echo for the
   * practitioner's own eyes; the wizard never uses it. */
  cfEmail: string;
}

/** The non-secret half of the configuration form. Secret values live in
 * module memory only (main.ts) and must never reach this structure. */
export interface FormState {
  provider: Provider;
  /** The provider's own server address (Nextcloud today) — not written
   * to the fork; it powers the deep links into the provider's UI. */
  providerUrl: string;
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
  /** Manual steps the practitioner has ticked off themselves: epoch ms
   * of the tick (1 for ticks predating the timestamps). Absent = not
   * done — the values are attestations, not observations. */
  done: Record<string, number>;
  /** Per configuration group, when a value last changed (epoch ms) —
   * compared against the store moment to tell unstored edits apart. */
  edited?: Record<string, number>;
  /** Per configuration group, when its Done was last pressed (epoch ms)
   * — the card settles only on a press later than the group's last edit. */
  confirmed?: Record<string, number>;
  form: FormState;
  brevo: BrevoState | null;
  /** When this state last hit localStorage — lets a resumed visit say
   * how old the memory it runs on is. */
  savedAt?: number;
}

const KEY = "wizard-state";

export function load(): Saved {
  const fallback: Saved = {
    inputs: { owner: "", repo: UPSTREAM_REPO, workerUrl: "", pageUrl: "", senderDomain: "", cfEmail: "" },
    done: {},
    form: { provider: "nextcloud", providerUrl: "", sameCalendar: true, emailOn: true, values: {} },
    brevo: null,
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Saved;
    // Ticks saved as booleans predate the timestamps; 1 keeps them done
    // with an unknown moment.
    const done: Record<string, number> = {};
    for (const [id, tick] of Object.entries(parsed.done ?? {})) {
      if (tick) done[id] = typeof tick === "number" ? tick : 1;
    }
    return {
      inputs: { ...fallback.inputs, ...parsed.inputs },
      done,
      ...(parsed.edited ? { edited: parsed.edited } : {}),
      ...(parsed.confirmed ? { confirmed: parsed.confirmed } : {}),
      form: {
        ...fallback.form,
        ...parsed.form,
        values: parsed.form?.values ?? {},
      },
      brevo: parsed.brevo ?? null,
      ...(parsed.savedAt ? { savedAt: parsed.savedAt } : {}),
    };
  } catch {
    return fallback;
  }
}

export function save(state: Saved): void {
  state.savedAt = Date.now();
  localStorage.setItem(KEY, JSON.stringify(state));
}

/** Forget everything this browser remembers about the setup. */
export function reset(): void {
  localStorage.removeItem(KEY);
}
