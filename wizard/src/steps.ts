// Pure derivation from saved state and probe results to what the page
// shows. Everything here is data — rendering (and therefore escaping)
// stays in main.ts, which builds DOM nodes and never feeds user input
// through HTML.

import type { FormGroups } from "./form";
import type {
  DeploymentProbe,
  DnsProbe,
  ForkProbe,
  HealthProbe,
  RecordProbe,
  RunProbe,
} from "./probes";
import type { Saved } from "./state";
import { UPSTREAM_OWNER, UPSTREAM_REPO } from "./state";

export interface ProbeState {
  fork?: ForkProbe;
  run?: RunProbe;
  record?: RecordProbe;
  deployment?: DeploymentProbe;
  health?: HealthProbe;
  dns?: DnsProbe;
}

/** The colour encodes what the practitioner must do; how the wizard
 * knows goes in the body text. open: work ahead; watch: the wizard is
 * polling for it to land; unknown: the wizard cannot ask right now (the
 * body says why — nothing is wrong); green: observed true; attested:
 * done on the practitioner's word or a past write, unverifiable in
 * principle — the green family, hollow tick, provenance in the body;
 * red: observed wrong. */
export type Status = "open" | "watch" | "unknown" | "green" | "attested" | "red";

/** Nothing left to do here — the green family. */
export function settled(s: Status): boolean {
  return s === "green" || s === "attested";
}

function when(at: number): string {
  return at > 1
    ? new Date(at).toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "earlier";
}

export function tickLine(at: number): string {
  return at > 1 ? `Marked done: ${when(at)}.` : "Marked done.";
}

const NOT_KNOWN = "Not known for now";

export interface StepLink {
  label: string;
  href: string;
  /** Render greyed out — the destination is not ready yet. */
  dim?: boolean;
  /** Render as a labelled plain link, not a button. */
  bare?: boolean;
}

export interface StepView {
  id: string;
  title: string;
  status: Status;
  body: string[];
  links: StepLink[];
  manual: boolean;
  /** Offer a Done button that runs the probes right away. */
  check?: boolean;
  /** The configuration cards' button — Done before the first store,
   * Reconfigure after it. Without `commits` there is nothing to confirm
   * yet: the press only puts the cursor in the card. */
  confirm?: { group: keyof FormGroups; label: string; commits: boolean };
  /** The step's state in a few words, shown in place of the card's
   * synopsis once there is something to report. */
  state?: string;
  /** Offer the wizard's Deploy button, which starts the run with the
   * token held in the tab. */
  deploy?: boolean;
}

/** When the fork last matched the form: the later of the wizard's record
 * in the fork and the practitioner's tick for a store by hand. */
function storeMomentOf(saved: Saved, probes: ProbeState): number {
  const recorded = probes.record?.state === "present" ? probes.record.storedAt : 0;
  return Math.max(recorded, saved.done["secrets"] ?? 0);
}

/** A run that started before the last store ran on the configuration
 * before it. */
function staleRun(run: RunProbe | undefined, storeMoment: number): boolean {
  return storeMoment > 0 && run !== undefined && "at" in run && run.at < storeMoment;
}

/** Where the latest run published the page, once it is green and its
 * Pages deployment has been read; empty until then. */
export function publishedAt(
  run: RunProbe | undefined,
  deployment: DeploymentProbe | undefined,
): string {
  return run?.state === "success" && deployment?.state === "present" && deployment.at >= run.at
    ? deployment.url
    : "";
}

export type GithubQuestion = "fork" | "record" | "run" | "deployment";

/** The GitHub questions worth asking now. Each costs one of the sixty an
 * hour GitHub answers unauthenticated, so a settled fact is not asked
 * again. A press asks every open question; unpressed, the deploy's facts
 * wait until the configuration is stored. */
export function githubQuestions(
  saved: Saved,
  probes: ProbeState,
  pressed = false,
): GithubQuestion[] {
  const { owner, repo } = saved.inputs;
  if (!owner || !repo) return [];
  const { fork, run, deployment } = probes;
  if (fork?.state === "absent") return ["fork"];
  const storeMoment = storeMomentOf(saved, probes);
  const deploying = pressed || storeMoment > 0;
  const unsure = (probe?: { state: string }) => probe === undefined || probe.state === "blind";
  const published = publishedAt(run, deployment);
  const out: GithubQuestion[] = [];
  // The fork's own record tells whether Pages is on.
  if (fork?.state !== "present" || (deploying && !fork.pages)) out.push("fork");
  if (unsure(probes.record)) out.push("record");
  if (
    unsure(run) ||
    run?.state === "running" ||
    (deploying &&
      (run?.state !== "success" || staleRun(run, storeMoment) || published.startsWith("http:")))
  ) {
    out.push("run");
  }
  if (unsure(deployment) || (run?.state === "success" && !published)) out.push("deployment");
  return out;
}

function healthLine(name: string, sub: { ok: boolean; error?: string }): string {
  return sub.ok ? `${name}: ok` : `${name}: ${sub.error ?? "failing"}`;
}

export function deriveSteps(
  saved: Saved,
  probes: ProbeState,
  groups?: FormGroups,
  tokenHeld = false,
): StepView[] {
  const { owner, repo, workerUrl, pageUrl, senderDomain } = saved.inputs;
  const fork = owner && repo ? `https://github.com/${owner}/${repo}` : null;
  const steps: StepView[] = [];

  // The work window teaches itself: the link opens the companion page
  // (wizard/public/companion.html), which carries the placement buttons
  // and the practice of moving between the two windows.
  steps.push({
    id: "windows",
    title: "Place your two windows",
    status: saved.done["windows"] ? "attested" : "open",
    body: [
      "The wizard works in two windows: the instructions stay here, and " +
        "every outside page — GitHub, Cloudflare, your calendar, Brevo — " +
        "opens in one work window beside them.",
      "Open the work window: it lands on the right part of the screen " +
        "with a short page of its own. Arrange the two however you like — " +
        "that page offers the usual arrangements — and keep both in view.",
      "Mark done once the windows sit where you want them.",
      ...(saved.done["windows"] ? [tickLine(saved.done["windows"])] : []),
    ],
    links: [{ label: "Open the work window", href: "companion.html" }],
    manual: true,
    state: saved.done["windows"] ? "Marked done" : undefined,
  });

  // The signup buttons, the echo fields and the tick row are laid out
  // by main.ts (renderAccounts) — the card's chrome, not its verdict.
  steps.push({
    id: "accounts",
    title: "GitHub and Cloudflare accounts",
    status: saved.done["accounts"] ? "attested" : "open",
    body: [
      "Your GitHub account hosts your copy of this project and serves " +
        "your static booking page; your Cloudflare account runs the " +
        "booking API. Free plans suffice on both.",
    ],
    links: [],
    manual: false,
    state: saved.done["accounts"] ? "Marked done" : undefined,
  });

  const forkProbe = probes.fork;
  steps.push({
    id: "fork",
    title: "Fork the project",
    status: !owner
      ? "open"
      : forkProbe?.state === "present"
        ? "green"
        : forkProbe?.state === "blind"
          ? "unknown"
          : "watch",
    body:
      forkProbe?.state === "present"
        ? []
        : [
            forkProbe?.state === "blind"
              ? `Not known whether your fork is there: ${forkProbe.reason}`
              : owner
                ? "Watching for the fork to appear."
                : "Enter your GitHub username below, then one click on the " +
                  "Fork button and press Done.",
          ],
    links: [
      {
        label: "Fork it",
        href: `https://github.com/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/fork`,
        // Its work is done once the fork is proven.
        ...(forkProbe?.state === "present" ? { dim: true } : {}),
      },
      // The proven fork, spelled out as its URL — the reader verifies
      // at a glance which fork the wizard is watching.
      ...(forkProbe?.state === "present" && fork
        ? [{ label: "Fork:", href: fork, bare: true }]
        : []),
    ],
    manual: false,
    check: Boolean(owner) && forkProbe?.state !== "present",
    state: !owner
      ? undefined
      : forkProbe?.state === "present"
        ? `Found: ${owner}/${repo}`
        : forkProbe?.state === "blind"
          ? NOT_KNOWN
          : "Watching for your fork",
  });

  // The configuration, split into its groups — each its own card,
  // settled when the practitioner confirms its values with Done; an edit
  // after the press asks for another. A card whose values were stored in
  // the fork but are no longer held here is attested, not verified —
  // secrets are write-only, so verification is impossible in principle.
  // An edit made after the store breaks the attestation: the card
  // re-opens, and so does the store step, until the change is stored too.
  const g: FormGroups = groups ?? { calendars: "open", cloudflare: "open", email: "open", shape: "open" };
  // The wizard's own stores leave a record in the fork, readable from any
  // browser; a by-hand store leaves only the practitioner's tick. The
  // later of the two is when the fork last matched the form.
  const recordProbe = probes.record;
  const recorded = recordProbe?.state === "present" ? recordProbe.storedAt : 0;
  const writeTick = saved.done["secrets"] ?? 0;
  const storeMoment = storeMomentOf(saved, probes);
  const editedSince = (key: keyof FormGroups): boolean =>
    (saved.edited?.[key] ?? 0) > storeMoment;
  const byRecord = recorded > 0 && recorded >= writeTick;
  const storedPhrase = byRecord
    ? `stored into your GitHub fork ${when(recorded)}`
    : writeTick > 1
      ? `marked stored by you ${when(writeTick)}`
      : "marked stored by you";
  const storedLine = `${storedPhrase.charAt(0).toUpperCase()}${storedPhrase.slice(1)}.`;
  const storedState = byRecord
    ? `Stored ${when(recorded)}`
    : writeTick > 1
      ? `Marked stored ${when(writeTick)}`
      : "Marked stored";
  const useFields = "Use the fields below to change the stored configuration.";
  // The press that confirmed the group's current values, or 0.
  const checkedAt = (key: keyof FormGroups): number => {
    const at = saved.confirmed?.[key] ?? 0;
    return g[key] === "green" && at >= (saved.edited?.[key] ?? 0) ? at : 0;
  };
  const groupStep = (id: string, key: keyof FormGroups, title: string): StepView => {
    const checked = checkedAt(key);
    const changed = storeMoment > 0 && editedSince(key);
    // Confirmed but not yet in the fork: the state line acknowledges the
    // press, and there is nothing left to press.
    const pending = checked > 0 && (!storeMoment || changed);
    const status: Status =
      g[key] === "red"
        ? "red"
        : checked
          ? "green"
          : storeMoment && !changed
            ? "attested"
            : "open";
    return {
      id,
      title,
      status,
      body: pending
        ? []
        : status === "green"
          ? [`Configured ${when(checked)}; ${storedPhrase}.`, useFields]
          : status === "attested"
            ? [storedLine, useFields]
            : changed
              ? [
                  "Changed since the last store — the change reaches your fork " +
                    "at the store step below.",
                ]
              : [],
      links: [],
      manual: false,
      ...(pending
        ? {}
        : {
            confirm: {
              group: key,
              label: storeMoment ? "Reconfigure" : "Done",
              commits: !storeMoment || changed,
            },
          }),
      state:
        status === "red"
          ? "A value needs fixing"
          : pending
            ? `Checked ${when(checked)}; ${changed ? "the change is " : ""}not stored yet`
            : status !== "open"
              ? byRecord
                ? "Stored"
                : "Marked stored"
              : changed
                ? "Changed; not stored yet"
                : undefined,
    };
  };
  const GROUP_TITLES: Record<keyof FormGroups, string> = {
    calendars: "Your calendars",
    cloudflare: "Your Cloudflare token",
    email: "Email confirmations",
    shape: "The shape of your bookings",
  };
  steps.push(groupStep("calendars", "calendars", GROUP_TITLES.calendars));
  steps.push(groupStep("cloudflare", "cloudflare", GROUP_TITLES.cloudflare));
  steps.push(groupStep("emailcfg", "email", GROUP_TITLES.email));
  steps.push(groupStep("shape", "shape", GROUP_TITLES.shape));

  const groupKeys = ["calendars", "cloudflare", "email", "shape"] as const;
  const groupsOk = groupKeys.every((k) => g[k] === "green");
  const changed = storeMoment ? groupKeys.filter(editedSince) : [];
  const storeStatus: Status =
    storeMoment && changed.length === 0
      ? "attested"
      : !storeMoment && recordProbe?.state === "blind"
        ? "unknown"
        : "open";
  steps.push({
    id: "secrets",
    title: "Store the configuration into your GitHub fork",
    status: storeStatus,
    body:
      storeStatus === "attested"
        ? [
            storedLine,
            "Secrets are write-only — the wizard cannot read them back. " +
              "Change a value above and this step re-opens to store it.",
          ]
        : changed.length
          ? [
              `Changed since the last store: ${changed
                .map((k) => GROUP_TITLES[k])
                .join(", ")} — not yet in your fork.`,
              groupsOk
                ? "Everything checks out. Paste a repo-scoped token below and " +
                  "the wizard stores the whole configuration afresh; then deploy " +
                  "again below."
                : "The wizard stores the whole configuration at once — " +
                  "re-enter the values still missing above, then paste a " +
                  "token here (or use the review list by hand).",
              storedLine,
            ]
          : [
              ...(recordProbe?.state === "blind"
                ? [`Not known whether your configuration is already stored: ${recordProbe.reason}`]
                : []),
              groupsOk
                ? "Everything checks out. Paste a repo-scoped token below and the " +
                  "wizard writes it all into your fork — or copy the review list " +
                  "in by hand."
                : "Complete the configuration steps above; once all four check " +
                  "out, one token paste writes everything into your fork at once.",
              "A store by hand leaves nothing the wizard can see — mark it done " +
                "yourself; the deploy run below is its proof.",
            ],
    links: [],
    // A record in the fork is a fact no tick can undo; the button serves
    // the by-hand path, and un-marking a tick.
    manual: !(storeStatus === "attested" && byRecord),
    state:
      storeStatus === "attested"
        ? storedState
        : storeStatus === "unknown"
          ? NOT_KNOWN
          : changed.length
            ? "Changes not yet stored"
            : undefined,
  });

  // Pages as an unauthenticated read sees it: on or off. Its source and
  // its address show in the deploy below.
  const pagesOn = forkProbe?.state === "present" && forkProbe.pages;
  steps.push({
    id: "pages",
    title: "Switch GitHub Pages to build using GitHub Actions",
    status: !owner
      ? "open"
      : forkProbe?.state === "blind"
        ? "unknown"
        : pagesOn
          ? "green"
          : "open",
    body:
      forkProbe?.state === "blind"
        ? [`Not known whether Pages is switched on: ${forkProbe.reason}`]
        : pagesOn
          ? ["Switched on. Where GitHub publishes your page shows once the deploy below has run."]
          : [
              "In your fork: Settings → Pages → Source: GitHub Actions; further " +
                "down, tick “Enforce HTTPS” unless it is ticked already. Then " +
                "press Done.",
              "Leave “Custom domain” empty: if your GitHub account already " +
                "serves a site under a custom domain, GitHub publishes this " +
                "page under it too, and nothing there is overwritten. HTTPS, " +
                "though, the fork decides for itself.",
            ],
    links: !pagesOn && fork ? [{ label: "Pages settings", href: `${fork}/settings/pages` }] : [],
    manual: false,
    check: Boolean(owner) && !pagesOn,
    state: !owner
      ? undefined
      : forkProbe?.state === "blind"
        ? NOT_KNOWN
        : pagesOn
          ? "Switched on"
          : undefined,
  });

  // The deploy starts here, not at the store: its first job needs the
  // Pages switch above. A run that started before the last store ran on
  // the configuration before it, so every store re-opens this step; so
  // does a green run whose Pages deployment reports a plain-HTTP page.
  const run = probes.run;
  const stale = staleRun(run, storeMoment);
  const published = publishedAt(run, probes.deployment);
  const plain = published.startsWith("http:");
  const due = stale || plain || run?.state === "none" || run?.state === "failure";
  const deployButton = due && tokenHeld && storeMoment > 0 && pagesOn;
  steps.push({
    id: "deploy",
    title: "Run the deploy",
    status: !owner
      ? "open"
      : run?.state === "blind"
        ? "unknown"
        : stale || run?.state === "none"
          ? "open"
          : plain || run?.state === "failure"
            ? "red"
            : run?.state === "success"
              ? "green"
              : "watch",
    body: [
      run?.state === "blind"
        ? `Not known whether a deploy has run: ${run.reason}`
        : stale
          ? "The configuration was stored after the last deploy — deploy again " +
            "to put it to work."
          : plain
            ? `GitHub published your page at ${published} — plain HTTP, which a ` +
              "browser upgrades to HTTPS by itself, and the booking service " +
              "then refuses it. Tick “Enforce HTTPS” in your fork's Pages " +
              "settings, then deploy again."
            : run?.state === "failure"
              ? "The last run failed. Its log ends with the health report naming " +
                "what is missing — fix that secret or variable and run it again."
              : run?.state === "running"
                ? "A run is in progress."
                : run?.state === "success"
                  ? "The deploy is green: Worker deployed, page published, health " +
                    "probe passed."
                  : "Once the configuration is stored and Pages switched on above, " +
                    "start the deploy. The run deploys the Worker and the page, " +
                    "then gates on the health check.",
      ...(deployButton
        ? [
            "Press Deploy and the wizard starts the run on your fork itself — " +
              "no need to go to GitHub.",
          ]
        : due && pagesOn
          ? [
              "Start it on GitHub: on your fork's Actions tab — the first time, " +
                "GitHub asks you to enable the workflows — choose Deploy, press " +
                "Run workflow, then Run workflow again in the box that opens.",
            ]
          : []),
    ],
    links: [
      ...(fork
        ? [
            {
              label: deployButton ? "By hand: Actions → Deploy" : "Actions → Deploy",
              href: `${fork}/actions/workflows/deploy.yml`,
            },
          ]
        : []),
      ...(run && run.state !== "none" && run.state !== "blind"
        ? [{ label: "The run", href: run.url }]
        : []),
      ...(plain && fork ? [{ label: "Pages settings", href: `${fork}/settings/pages` }] : []),
      // The page's real address, as its Pages deployment reports it.
      ...(published && !plain ? [{ label: "Your page:", href: published, bare: true }] : []),
    ],
    manual: false,
    deploy: deployButton,
    state: !owner
      ? undefined
      : run?.state === "blind"
        ? NOT_KNOWN
        : stale
          ? "Stored since the last deploy; deploy again"
          : run?.state === "none"
            ? undefined
            : plain
              ? "Published over plain HTTP"
              : run?.state === "failure"
                ? "The last run failed"
                : run?.state === "success"
                  ? published
                    ? `Published at ${published}`
                    : "Deployed"
                  : run
                    ? "Running"
                    : "Asking GitHub",
  });

  const health = probes.health;
  const healthBody: string[] = [];
  if (!workerUrl) {
    healthBody.push(
      owner
        ? "Waiting for a finished deploy to publish the Worker's address " +
          "on your page; the wizard picks it up by itself."
        : "Once your fork has deployed, the wizard reads the Worker's " +
          "address from your page and watches the API's own health report.",
    );
  } else if (!health) {
    healthBody.push("Asking the Worker for its health report.");
  } else if (health.state === "unreachable") {
    healthBody.push(
      "Not known: the Worker gave no answer — network trouble, or the API " +
        "is gone; the wizard cannot tell which. It keeps asking.",
    );
  } else {
    const b = health.body;
    healthBody.push(healthLine("configuration", b.config));
    if (b.calendars) {
      healthBody.push(healthLine("availability calendar", b.calendars.availability));
      healthBody.push(healthLine("booking store", b.calendars.appointments));
    }
    if (b.email) {
      healthBody.push(
        b.email === "missing_key"
          ? "email: sender configured but BREVO_API_KEY missing"
          : `email: ${b.email}`,
      );
    }
  }
  steps.push({
    id: "health",
    title: "Your booking service health check",
    status: !workerUrl
      ? owner
        ? "watch"
        : "open"
      : health?.state === "answered"
        ? health.body.ok
          ? "green"
          : "red"
        : health?.state === "unreachable"
          ? "unknown"
          : "watch",
    body: healthBody,
    links: workerUrl
      ? [{ label: "Health", href: `${workerUrl.replace(/\/+$/, "")}/v1/health` }]
      : [],
    manual: false,
    state: !workerUrl
      ? owner
        ? "Waiting for the deploy"
        : undefined
      : !health
        ? "Asking the Worker"
        : health.state === "unreachable"
          ? "No answer from the Worker"
          : health.body.ok
            ? "All checks pass"
            : "A check fails",
  });

  const dns = probes.dns;
  const emailOn = saved.form.emailOn;
  // Brevo's verdict counts only for the domain the form currently names;
  // absent (the by-hand path), public DNS alone decides.
  const brevo =
    saved.brevo && saved.brevo.domain === senderDomain ? saved.brevo : null;
  const dohGreen = dns?.state === "answered" && dns.dkim && dns.code && dns.dmarc;
  steps.push({
    id: "dns",
    title: "Prove your sender domain",
    status: !emailOn
      ? "green"
      : !senderDomain
        ? "open"
        : dns?.state === "blind"
          ? "unknown"
          : dohGreen && (!brevo || brevo.authenticated)
            ? "green"
            : "watch",
    body: !emailOn
      ? ["Email is switched off in the configuration — nothing to prove in DNS."]
      : [
          !senderDomain
            ? "Enter a valid sender address in the Email confirmations " +
              "step above; its domain is what these records vouch for."
            : dns?.state === "answered"
              ? `Public DNS: DKIM ${dns.dkim ? "found" : "missing"}, brevo-code ` +
                `${dns.code ? "found" : "missing"}, DMARC ${dns.dmarc ? "found" : "missing"}.`
              : dns
                ? "Not known: the DNS lookup service gave no answer, so the " +
                  "records cannot be checked right now. The wizard keeps asking."
                : "Looking the records up in public DNS.",
          ...(senderDomain && brevo
            ? [
                brevo.authenticated
                  ? "Brevo: domain authenticated."
                  : `Brevo: ${brevo.records.filter((r) => r.status).length} of ` +
                    `${brevo.records.length} records confirmed.`,
              ]
            : []),
          "Checked two ways: presence in public DNS, and Brevo's own " +
            "record-by-record verdict once the domain is registered above.",
        ],
    links: [],
    manual: false,
    state: !emailOn
      ? "Email off; nothing to prove"
      : !senderDomain
        ? undefined
        : dns?.state === "blind"
          ? NOT_KNOWN
          : dohGreen && (!brevo || brevo.authenticated)
            ? "Verified"
            : "Waiting for the records",
  });

  // OPEN events are the practitioner's to write, in their own calendar
  // app. Nor can the wizard see the slots: they answer the fork's own
  // page alone, not this one. The tick attests; the test drive proves.
  const { provider, providerUrl, sameCalendar } = saved.form;
  const calendarApp =
    provider === "nextcloud" && /^https?:\/\/./.test(providerUrl)
      ? `${providerUrl}/apps/calendar/`
      : provider === "google"
        ? "https://calendar.google.com/"
        : null;
  steps.push({
    id: "availability",
    title: "Open some time for booking",
    status: saved.done["availability"] ? "attested" : "open",
    body: [
      "In your availability calendar — in whatever calendar app you already " +
        "use — create an event titled exactly OPEN, tomorrow 10:00–12:00, " +
        "say. The booking page cuts it into slots of your appointment " +
        "length; a repeating event, “every Tuesday 09:00–12:00”, opens " +
        "that time every week.",
      sameCalendar
        ? "Every other event in that calendar, bookings included, blocks the " +
          "time it covers."
        : "Every other event in it, and every event in your booking calendar, " +
          "blocks the time it covers.",
      "The booking service only ever reads OPEN events: they are yours to " +
        "write, and to delete or shorten when a time closes. Slots start no " +
        "sooner than your minimum notice and reach no further than your " +
        "booking horizon, both under “The shape of your bookings” — an OPEN " +
        "event later today may show nothing.",
      "Mark done once the event is in place: the next step books one of " +
        "its slots on your page.",
      ...(saved.done["availability"] ? [tickLine(saved.done["availability"])] : []),
    ],
    links:
      provider === "nextcloud" || provider === "google"
        ? [{ label: "Open your calendars", href: calendarApp ?? "", dim: !calendarApp }]
        : [],
    manual: true,
    state: saved.done["availability"] ? "Marked done" : undefined,
  });

  steps.push({
    id: "smoke",
    title: "Book a test appointment",
    status: saved.done["smoke"] ? "attested" : "open",
    body: [
      "Open your booking page, book a slot, open the confirmation email on " +
        "another device, and cancel from its link. That walk is the whole " +
        "system end to end.",
      ...(pageUrl ? [] : ["The link appears once the first deploy has published the page."]),
      ...(saved.done["smoke"] ? [tickLine(saved.done["smoke"])] : []),
    ],
    links: pageUrl ? [{ label: "Your booking page", href: pageUrl }] : [],
    manual: true,
    state: saved.done["smoke"] ? "Marked done" : undefined,
  });

  return steps;
}

export function allGreen(steps: StepView[]): boolean {
  return steps.every((s) => settled(s.status));
}

export interface PhaseView {
  label: string;
  status: "green" | "current" | "todo";
  /** The phase's first step — where its rail chip links to. */
  anchor: string;
}

const PHASES: [string, string[]][] = [
  ["Windows", ["windows"]],
  ["Accounts", ["accounts"]],
  ["Fork", ["fork"]],
  ["Configure", ["calendars", "cloudflare", "emailcfg", "shape", "secrets"]],
  ["Deploy", ["pages", "deploy", "health"]],
  ["Email", ["dns"]],
  ["Test drive", ["availability", "smoke"]],
];

/** The journey compressed to a rail: a phase is green when every step
 * of it is settled (green or attested), and the first phase not yet
 * settled is where the practitioner stands. */
export function derivePhases(steps: StepView[]): PhaseView[] {
  const byId = new Map(steps.map((s) => [s.id, s.status]));
  let currentFound = false;
  return PHASES.map(([label, ids]) => {
    const anchor = ids[0]!;
    if (ids.every((id) => settled(byId.get(id) ?? "open")))
      return { label, status: "green" as const, anchor };
    if (currentFound) return { label, status: "todo" as const, anchor };
    currentFound = true;
    return { label, status: "current" as const, anchor };
  });
}
