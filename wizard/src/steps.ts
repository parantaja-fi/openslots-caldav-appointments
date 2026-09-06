// Pure derivation from saved state and probe results to what the page
// shows. Everything here is data — rendering (and therefore escaping)
// stays in main.ts, which builds DOM nodes and never feeds user input
// through HTML.

import type { FormGroups } from "./form";
import type { DnsProbe, HealthProbe, RunProbe } from "./probes";
import type { Saved } from "./state";
import { UPSTREAM_OWNER, UPSTREAM_REPO } from "./state";

export interface ProbeState {
  fork?: boolean;
  run?: RunProbe;
  health?: HealthProbe;
  dns?: DnsProbe;
}

/** open: waiting on the practitioner; watch: the wizard is polling;
 * green/red: the probe has spoken. */
export type Status = "open" | "watch" | "green" | "red";

export interface StepView {
  id: string;
  title: string;
  status: Status;
  body: string[];
  links: { label: string; href: string }[];
  manual: boolean;
  /** Offer a Done button that runs the probes right away. */
  check?: boolean;
}

function healthLine(name: string, sub: { ok: boolean; error?: string }): string {
  return sub.ok ? `${name}: ok` : `${name}: ${sub.error ?? "failing"}`;
}

export function deriveSteps(saved: Saved, probes: ProbeState, groups?: FormGroups): StepView[] {
  const { owner, repo, workerUrl, pageUrl, senderDomain } = saved.inputs;
  const fork = owner && repo ? `https://github.com/${owner}/${repo}` : null;
  const steps: StepView[] = [];

  steps.push({
    id: "accounts",
    title: "Create the accounts",
    status: saved.done["accounts"] ? "green" : "open",
    body: [
      "A GitHub account hosts your copy of the project and your booking " +
        "page; a Cloudflare account runs the booking API. Both free plans " +
        "suffice. Accounts are invisible from here — mark this done yourself.",
    ],
    links: [
      { label: "GitHub signup", href: "https://github.com/signup" },
      { label: "Cloudflare signup", href: "https://dash.cloudflare.com/sign-up" },
    ],
    manual: true,
  });

  steps.push({
    id: "fork",
    title: "Fork the project",
    status: !owner ? "open" : probes.fork ? "green" : "watch",
    body: [
      probes.fork
        ? "Your fork exists."
        : owner
          ? "Watching for the fork to appear."
          : "One click on GitHub's Fork button. Then enter your GitHub " +
            "username below and press Done.",
    ],
    links: [
      {
        label: "Fork it",
        href: `https://github.com/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/fork`,
      },
    ],
    manual: false,
    check: Boolean(owner) && !probes.fork,
  });

  // The configuration, split into its groups — each its own card,
  // checked separately as its fields validate. Once the values are
  // written to the fork the deploy is their proof: a reload that forgot
  // the tab-held secrets must not reopen the cards.
  const g: FormGroups = groups ?? { calendars: "open", cloudflare: "open", email: "open", shape: "open" };
  const wrote = Boolean(saved.done["secrets"]);
  const groupStatus = (s: FormGroups[keyof FormGroups]): Status =>
    s === "red" ? "red" : wrote || s === "green" ? "green" : "open";
  const groupStep = (id: string, key: keyof FormGroups, title: string): StepView => ({
    id,
    title,
    status: groupStatus(g[key]),
    body: [],
    links: [],
    manual: false,
  });
  steps.push(groupStep("calendars", "calendars", "Your calendars"));
  steps.push(groupStep("cloudflare", "cloudflare", "Your Cloudflare token"));
  steps.push(groupStep("emailcfg", "email", "Email confirmations"));
  steps.push(groupStep("shape", "shape", "The shape of your bookings"));

  const groupsOk = (["calendars", "cloudflare", "email", "shape"] as const).every(
    (k) => groupStatus(g[k]) === "green",
  );
  steps.push({
    id: "secrets",
    title: "Write it to your fork",
    status: wrote ? "green" : "open",
    body: [
      groupsOk
        ? "Everything checks out. Paste a repo-scoped token below and the " +
          "wizard writes it all into your fork and starts the deploy — or " +
          "copy the review list in by hand."
        : "Complete the configuration steps above; once all four are " +
          "green, one token paste writes everything into your fork at once.",
      "Secrets are write-only, so the wizard cannot watch this step; the " +
        "deploy run below is its proof.",
    ],
    links: [],
    manual: true,
  });

  steps.push({
    id: "pages",
    title: "Switch Pages to GitHub Actions",
    status: saved.done["pages"] ? "green" : "open",
    body: [
      "In your fork: Settings → Pages → Source: GitHub Actions. One click, " +
        "unreadable from here, proven by the deploy run below.",
    ],
    links: fork ? [{ label: "Pages settings", href: `${fork}/settings/pages` }] : [],
    manual: true,
  });

  const run = probes.run;
  steps.push({
    id: "deploy",
    title: "Run the deploy",
    status: !owner
      ? "open"
      : run?.state === "success"
        ? "green"
        : run?.state === "failure"
          ? "red"
          : "watch",
    body: [
      run?.state === "failure"
        ? "The last run failed. Its log ends with the health report naming " +
          "what is missing — fix that secret or variable and run it again."
        : run?.state === "running"
          ? "A run is in progress."
          : run?.state === "success"
            ? "The deploy is green: Worker deployed, page published, health " +
              "probe passed."
            : "On your fork's Actions tab, choose Deploy and press Run " +
              "workflow. The run deploys the Worker and the page, then " +
              "gates on the health check.",
    ],
    links: [
      ...(fork
        ? [{ label: "Actions → Deploy", href: `${fork}/actions/workflows/deploy.yml` }]
        : []),
      ...(run && run.state !== "none" ? [{ label: "The run", href: run.url }] : []),
    ],
    manual: false,
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
  } else if (!health || health.state === "unreachable") {
    healthBody.push("No answer from the Worker yet.");
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
    title: "The API reports healthy",
    status: !workerUrl
      ? owner
        ? "watch"
        : "open"
      : health?.state === "answered"
        ? health.body.ok
          ? "green"
          : "red"
        : "watch",
    body: healthBody,
    links: workerUrl
      ? [{ label: "Health", href: `${workerUrl.replace(/\/+$/, "")}/v1/health` }]
      : [],
    manual: false,
  });

  const dns = probes.dns;
  const emailOn = saved.form.emailOn;
  // Brevo's verdict counts only for the domain the form currently names;
  // absent (the by-hand path), public DNS alone decides.
  const brevo =
    saved.brevo && saved.brevo.domain === senderDomain ? saved.brevo : null;
  const dohGreen = Boolean(dns && dns.dkim && dns.code && dns.dmarc);
  steps.push({
    id: "dns",
    title: "Prove your sender domain",
    status: !emailOn
      ? "green"
      : !senderDomain
        ? "open"
        : dohGreen && (!brevo || brevo.authenticated)
          ? "green"
          : "watch",
    body: !emailOn
      ? ["Email is switched off in the configuration — nothing to prove in DNS."]
      : [
          !senderDomain
            ? "Enter a valid sender address in the Email confirmations " +
              "step above; its domain is what these records vouch for."
            : dns
              ? `Public DNS: DKIM ${dns.dkim ? "found" : "missing"}, brevo-code ` +
                `${dns.code ? "found" : "missing"}, DMARC ${dns.dmarc ? "found" : "missing"}.`
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
  });

  steps.push({
    id: "smoke",
    title: "Book a test appointment",
    status: saved.done["smoke"] ? "green" : "open",
    body: [
      "Open your booking page, book a slot, open the confirmation email on " +
        "another device, and cancel from its link. That walk is the whole " +
        "system end to end.",
      ...(pageUrl ? [] : ["The link appears once the first deploy has published the page."]),
    ],
    links: pageUrl ? [{ label: "Your booking page", href: pageUrl }] : [],
    manual: true,
  });

  return steps;
}

export function allGreen(steps: StepView[]): boolean {
  return steps.every((s) => s.status === "green");
}

export interface PhaseView {
  label: string;
  status: "green" | "current" | "todo";
  /** The phase's first step — where its rail chip links to. */
  anchor: string;
}

const PHASES: [string, string[]][] = [
  ["Accounts", ["accounts"]],
  ["Fork", ["fork"]],
  ["Configure", ["calendars", "cloudflare", "emailcfg", "shape", "secrets"]],
  ["Deploy", ["pages", "deploy", "health"]],
  ["Email", ["dns"]],
  ["Test drive", ["smoke"]],
];

/** The journey compressed to a rail: a phase is green when every step
 * of it is, and the first phase not yet green is where the
 * practitioner stands. */
export function derivePhases(steps: StepView[]): PhaseView[] {
  const byId = new Map(steps.map((s) => [s.id, s.status]));
  let currentFound = false;
  return PHASES.map(([label, ids]) => {
    const anchor = ids[0]!;
    if (ids.every((id) => byId.get(id) === "green"))
      return { label, status: "green" as const, anchor };
    if (currentFound) return { label, status: "todo" as const, anchor };
    currentFound = true;
    return { label, status: "current" as const, anchor };
  });
}
