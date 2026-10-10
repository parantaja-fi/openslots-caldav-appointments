// Pure derivation for the Google Calendar sub-wizard: saved state and
// Google's answers in, cards 3.1–3.7 out — where the failure table of
// docs/google-calendar-wizard.md §3 becomes code.

import type { Saved } from "../state";
import type { Status, StepLink, StepView } from "../steps";
import { settled, tickLine } from "../steps";

export type AccessRole = "freeBusyReader" | "reader" | "writer" | "owner";

// Least first: a share passes when it ranks at least its need.
const LEVELS: AccessRole[] = ["freeBusyReader", "reader", "writer", "owner"];

/** Each level as Google Calendar's sharing menu words it. */
const LEVEL_WORDS: Record<AccessRole, string> = {
  freeBusyReader: "See only free/busy (hide details)",
  reader: "See all event details",
  writer: "Make changes to events",
  owner: "Make changes and manage sharing",
};

/** Google's verdict on the pasted key, by token exchange. Every refusal
 * is a 400 invalid_grant: only its description tells a bad clock from a
 * dead key, so refused carries it verbatim. */
export type KeyProbe =
  | { state: "unasked" }
  | { state: "accepted"; at: number; clientEmail: string; projectId: string }
  | { state: "refused"; description: string }
  | { state: "blind"; reason: string };

/** One calendar as the service account sees it. present: name, time
 * zone and level from a metadata-only events.list, the owner from
 * calendars.get's dataOwner — which a main calendar lacks, its ID being
 * its owner. absent: Google's 404, no such calendar or not shared.
 * disabled: 403 SERVICE_DISABLED, with the body's activation link. */
export type CalendarProbe =
  | { state: "present"; summary: string; timeZone: string; accessRole: AccessRole; owner: string }
  | { state: "absent" }
  | { state: "disabled"; activationUrl: string }
  | { state: "blind"; reason: string };

export interface GoogleProbeState {
  /** Undefined while the tab holds no key. */
  key?: KeyProbe;
  availability?: CalendarProbe;
  /** Unasked while one calendar plays both roles. */
  store?: CalendarProbe;
}

/** The key file's non-secret fields, or null for anything that is not a
 * key file. Never the private key. */
export function parseGoogleKey(raw: string): { clientEmail: string; projectId: string } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const record = (parsed ?? {}) as Record<string, unknown>;
  const clientEmail = record["client_email"];
  const projectId = record["project_id"];
  return typeof clientEmail === "string" &&
    typeof projectId === "string" &&
    typeof record["private_key"] === "string"
    ? { clientEmail, projectId }
    : null;
}

export function caldavAddress(id: string): string {
  return `https://apidata.googleusercontent.com/caldav/v2/${encodeURIComponent(id)}/events/`;
}

const CONSOLE = "https://console.cloud.google.com";
// The settings page as a whole: the deep link into one calendar's
// settings is unverified (plan §10).
const CALENDAR_SETTINGS = "https://calendar.google.com/calendar/u/0/r/settings";

interface Row {
  id: string;
  probe: CalendarProbe | undefined;
  need: AccessRole;
  /** Leads the row's lines; empty when one calendar plays both roles. */
  label: string;
  noun: string;
}

interface RowVerdict {
  status: Status;
  lines: string[];
  /** A share beyond the need (plan §9 D7). */
  footnote?: string;
  activationUrl?: string;
}

function verdict(row: Row, account: string): RowVerdict {
  const { probe, need, label } = row;
  if (!probe) {
    return {
      status: "watch",
      lines: [`${label}Asking Google whether the service account sees it.`],
    };
  }
  if (probe.state === "blind") {
    return {
      status: "unknown",
      lines: [`${label}Not known whether the service account sees it: ${probe.reason}`],
    };
  }
  // The same for every calendar: the card says it once.
  if (probe.state === "disabled") {
    return { status: "red", lines: [], activationUrl: probe.activationUrl };
  }
  if (probe.state === "absent") {
    return {
      status: "red",
      lines: [
        `${label}Google finds no such calendar for the service account — check ` +
          "the ID, then the sharing.",
      ],
    };
  }
  // Invisible in the practitioner's own Google Calendar (plan §6).
  if (probe.owner === account) {
    return {
      status: "red",
      lines: [
        `${label}This calendar belongs to the service account, not to you — ` +
          "pick one of your own.",
      ],
    };
  }
  const has = LEVELS.indexOf(probe.accessRole);
  const needs = LEVELS.indexOf(need);
  if (has < needs) {
    const freeBusy = probe.accessRole === "freeBusyReader";
    return {
      status: "red",
      lines: [
        `${label}Shared, but only to ${freeBusy ? "see free/busy" : "see events"} — ` +
          `${row.noun} needs “${LEVEL_WORDS[need]}”.`,
        // The level alone cannot tell a Workspace's cap from a choice.
        ...(freeBusy
          ? [
              `If “${LEVEL_WORDS.reader}” is not on offer when you share, your ` +
                "Google Workspace lets outsiders see free/busy only — an admin " +
                "loosens it, or use a personal Google account.",
            ]
          : []),
      ],
    };
  }
  return {
    status: "green",
    lines: [
      `${label}That is your “${probe.summary}” (${probe.timeZone}), shared at ` +
        `“${LEVEL_WORDS[probe.accessRole]}”.`,
    ],
    ...(has > needs
      ? {
          footnote:
            `${label}Shared beyond its need: “${LEVEL_WORDS[probe.accessRole]}” where ` +
            `“${LEVEL_WORDS[need]}” would do — a leaked key could ` +
            `${probe.accessRole === "owner" ? "re-share the calendar" : "change its events"}.`,
        }
      : {}),
  };
}

const ROLL_UP: Status[] = ["red", "unknown", "watch", "green"];

export function deriveGoogleSteps(saved: Saved, probes: GoogleProbeState): StepView[] {
  const { projectId, clientEmail, calendarIds } = saved.form.google;
  const key = probes.key;
  const accepted = key?.state === "accepted" ? key : null;
  const account = accepted?.clientEmail || clientEmail;
  const steps: StepView[] = [];

  const attestation = (id: string, title: string, body: string[], links: StepLink[]): StepView => {
    const at = saved.done[id];
    return {
      id,
      title,
      status: at ? "attested" : "open",
      body: at ? [...body, tickLine(at)] : body,
      links,
      manual: true,
    };
  };
  // The console pages after 3.2 open in its project; until it is known,
  // their links wait.
  const inProject = (label: string, path: string): StepLink => ({
    label,
    href: `${CONSOLE}/${path}?project=${projectId}`,
    ...(projectId ? {} : { dim: true }),
  });
  const waitsForProject = projectId ? [] : ["The links open once 3.2 has the project ID."];

  steps.push(
    attestation(
      "google-account",
      "3.1 Google account and Google Cloud",
      [
        "Sign in to the Google account whose calendar your practice runs on, " +
          "and open the Google Cloud console once: it asks you to accept its " +
          "terms, nothing more — no billing account; the Calendar and CalDAV " +
          "APIs are free.",
        "A Google Workspace account may have project creation barred by its " +
          "admin; a personal Google account has no such gate.",
      ],
      [{ label: "Google Cloud console", href: `${CONSOLE}/` }],
    ),
  );

  steps.push(
    attestation(
      "google-project",
      "3.2 Cloud project",
      [
        "Create a project — any name will do — and paste its project ID below; " +
          "the project's dashboard shows it. The ID, not the name or the " +
          "number: the console links that follow open in that project.",
      ],
      [{ label: "Create a project", href: `${CONSOLE}/projectcreate` }],
    ),
  );

  steps.push(
    attestation(
      "google-apis",
      "3.3 Two APIs",
      [
        "Enable both in your project, then wait a minute: the CalDAV API is what " +
          "your booking service speaks, the Google Calendar API what this " +
          "wizard checks your calendars with.",
        ...waitsForProject,
      ],
      [
        inProject("CalDAV API", "apis/library/caldav.googleapis.com"),
        inProject("Google Calendar API", "apis/library/calendar-json.googleapis.com"),
      ],
    ),
  );

  steps.push(
    attestation(
      "google-service-account",
      "3.4 Service account",
      [
        "Create a service account: any name; no role, no user access — press " +
          "Done. Then, on the account, Keys → Add key → Create new key → JSON. " +
          "A file downloads; 3.5 takes it.",
        "The file is the account's password: keep it to yourself.",
        ...waitsForProject,
      ],
      [
        inProject("Create a service account", "iam-admin/serviceaccounts/create"),
        inProject("Service accounts", "iam-admin/serviceaccounts"),
      ],
    ),
  );

  const strayKey = accepted && projectId && accepted.projectId !== projectId ? accepted : null;
  const clock =
    key?.state === "refused" && /\biat\b/.test(key.description) && /\bexp\b/.test(key.description);
  steps.push({
    id: "google-key",
    title: "3.5 Key",
    status: !key
      ? "open"
      : key.state === "unasked"
        ? "watch"
        : key.state === "blind"
          ? "unknown"
          : key.state === "refused" || strayKey
            ? "red"
            : "green",
    body: !key
      ? [
          "Paste the key file below — the whole file, unchanged. The key stays " +
            "in this tab: Google gets only a signature made with it.",
        ]
      : key.state === "unasked"
        ? ["Asking Google whether it accepts the key."]
        : key.state === "blind"
          ? [`Not known whether Google accepts the key: ${key.reason}`]
          : key.state === "refused"
            ? [
                clock
                  ? "Google finds the time stamps in the request out of range — " +
                    "check this computer's clock."
                  : "Google no longer accepts this key — make a new one.",
                `Google says: “${key.description}”`,
              ]
            : strayKey
              ? [
                  `This key belongs to project ${strayKey.projectId}, 3.2 says ` +
                    `${projectId} — make the key in ${projectId}, or correct 3.2.`,
                ]
              : [
                  `Google accepted the key at ${new Date(key.at).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}.`,
                  `Service account: ${key.clientEmail}.`,
                ],
    links:
      (key?.state === "refused" && !clock) || strayKey
        ? [inProject("Service accounts", "iam-admin/serviceaccounts")]
        : [],
    manual: false,
  });

  // One calendar for both roles is held to the store's need.
  const one = saved.form.sameCalendar;
  const rows: Row[] = one
    ? [
        {
          id: calendarIds.availability,
          probe: probes.availability,
          need: "writer",
          label: "",
          noun: "the booking store",
        },
      ]
    : [
        {
          id: calendarIds.availability,
          probe: probes.availability,
          need: "reader",
          label: "Availability: ",
          noun: "the availability calendar",
        },
        {
          id: calendarIds.store,
          probe: probes.store,
          need: "writer",
          label: "Booking store: ",
          noun: "the booking store",
        },
      ];
  const idsThere = rows.every((r) => r.id);
  const verdicts = idsThere && accepted ? rows.map((r) => verdict(r, accepted.clientEmail)) : [];
  const calendarsStatus: Status = !idsThere
    ? "open"
    : !accepted
      ? "watch"
      : ROLL_UP.find((s) => verdicts.some((v) => v.status === s))!;
  const activationUrl = verdicts.find((v) => v.activationUrl)?.activationUrl;
  const footnotes = verdicts.flatMap((v) => (v.footnote ? [v.footnote] : []));
  const instructions = [
    `In Google Calendar's settings, pick ${one ? "the calendar" : "each calendar"} on ` +
      "the left: its “Calendar ID” is under “Integrate calendar” — paste it " +
      "below. Your main calendar's ID is your Google address.",
    "Then, under “Share with specific people or groups” on the same page, add " +
      `${account || "the service account"} with ` +
      (one
        ? `“${LEVEL_WORDS.writer}”.`
        : `“${LEVEL_WORDS.reader}” on the availability calendar, ` +
          `“${LEVEL_WORDS.writer}” on the booking store.`),
    ...(account ? [] : ["The service account's address shows here once 3.5 has the key."]),
  ];
  steps.push({
    id: "google-calendars",
    title: "3.6 Calendars",
    status: calendarsStatus,
    body: [
      ...(idsThere && !accepted ? ["Checked once Google accepts the key at 3.5."] : []),
      // The disabled API is the key's project's — 3.2's, once 3.5 is green.
      ...(activationUrl && accepted
        ? [
            `Enable the Google Calendar API in project ${accepted.projectId}.`,
            "If you have just enabled it, Google takes a few minutes to notice; " +
              "the wizard keeps asking.",
          ]
        : []),
      ...verdicts.flatMap((v) => v.lines),
      ...(calendarsStatus === "green" ? [] : instructions),
    ],
    links: [
      ...(activationUrl ? [{ label: "Enable the Google Calendar API", href: activationUrl }] : []),
      { label: "Google Calendar settings", href: CALENDAR_SETTINGS },
    ],
    manual: false,
    ...(calendarsStatus === "green" && footnotes.length ? { footnote: footnotes.join(" ") } : {}),
  });

  const unsettled = steps.filter((s) => !settled(s.status));
  const name = (row: Row): string => (row.probe?.state === "present" ? row.probe.summary : "");
  steps.push({
    id: "google-back",
    title: "3.7 Back",
    status: unsettled.length ? "open" : "green",
    body: unsettled.length
      ? [`Still to settle: ${unsettled.map((s) => s.title).join(", ")}.`]
      : [
          `Service account: ${account}.`,
          ...rows.map((r) =>
            one
              ? `Calendar: “${name(r)}”, for availability and bookings alike.`
              : `${r.label}“${name(r)}”.`,
          ),
        ],
    links: [],
    manual: false,
  });

  return steps;
}
