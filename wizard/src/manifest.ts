// The checked-in manifest of required configuration (ROADMAP.md M6.1):
// every Actions secret and variable the fork-deploy workflow consumes,
// declared as data. The conditional shapes — email on/off, one calendar
// or two, Basic auth or a Google service account — live in form.ts, not
// in a manifest DSL. A test holds manifest and deploy.yml to the same
// name sets.

import raw from "../manifest.json";

export type Kind = "secret" | "variable";
export type Group = "calendars" | "cloudflare" | "email" | "shape";

export interface ManifestEntry {
  name: string;
  kind: Kind;
  group: Group;
  label: string;
  help: string;
  /** Key into VALIDATORS (validators.ts). */
  validate: string;
  placeholder?: string;
  /** Variables only: prefilled into the form on first load. */
  default?: string;
  /** May be left empty even when its group is active. */
  optional?: boolean;
  /** Collapsed behind the Advanced fold. */
  advanced?: boolean;
  /** Rendered as a password input and masked in the review list. */
  masked?: boolean;
  /** Rendered as a textarea (the Google key file). */
  multiline?: boolean;
}

export const MANIFEST = raw as ManifestEntry[];
