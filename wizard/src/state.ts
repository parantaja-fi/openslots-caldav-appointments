export const UPSTREAM_OWNER = "parantaja-fi";
export const UPSTREAM_REPO = "openslots-caldav-appointments";

export interface Inputs {
  owner: string;
  repo: string;
  workerUrl: string;
  senderDomain: string;
}

export interface Saved {
  inputs: Inputs;
  /** Manual steps the practitioner has ticked off themselves. */
  done: Record<string, boolean>;
}

const KEY = "wizard-state";

export function load(): Saved {
  const fallback: Saved = {
    inputs: { owner: "", repo: UPSTREAM_REPO, workerUrl: "", senderDomain: "" },
    done: {},
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Saved;
    return { inputs: { ...fallback.inputs, ...parsed.inputs }, done: parsed.done ?? {} };
  } catch {
    return fallback;
  }
}

export function save(state: Saved): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}
