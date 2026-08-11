export const UPSTREAM_OWNER = "parantaja-fi";
export const UPSTREAM_REPO = "openslots-caldav-appointments";

export type Provider = "nextcloud" | "fastmail" | "google" | "radicale" | "other";

export interface Inputs {
  owner: string;
  repo: string;
  workerUrl: string;
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

export interface Saved {
  inputs: Inputs;
  /** Manual steps the practitioner has ticked off themselves. */
  done: Record<string, boolean>;
  form: FormState;
}

const KEY = "wizard-state";

export function load(): Saved {
  const fallback: Saved = {
    inputs: { owner: "", repo: UPSTREAM_REPO, workerUrl: "", senderDomain: "" },
    done: {},
    form: { provider: "nextcloud", sameCalendar: true, emailOn: true, values: {} },
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
    };
  } catch {
    return fallback;
  }
}

export function save(state: Saved): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}
