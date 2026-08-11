// Pure derivation from saved state and probe results to what the page
// shows. Everything here is data — rendering (and therefore escaping)
// stays in main.ts, which builds DOM nodes and never feeds user input
// through HTML.

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
}

function healthLine(name: string, sub: { ok: boolean; error?: string }): string {
  return sub.ok ? `${name}: ok` : `${name}: ${sub.error ?? "failing"}`;
}

export function deriveSteps(saved: Saved, probes: ProbeState, formOk = false): StepView[] {
  const { owner, repo, workerUrl, senderDomain } = saved.inputs;
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
          : "One click on GitHub's Fork button. Enter your GitHub username " +
            "above and this step turns green the moment the fork exists.",
    ],
    links: [
      {
        label: "Fork it",
        href: `https://github.com/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/fork`,
      },
    ],
    manual: false,
  });

  steps.push({
    id: "secrets",
    title: "Enter the configuration",
    status: saved.done["secrets"] ? "green" : "open",
    body: [
      formOk
        ? "The form above is complete. Copy each name and value from its " +
          "review list into your fork's Actions settings — secrets and " +
          "variables each have a page of their own."
        : "Fill in the configuration form above; once every required field " +
          "is valid it becomes a copy-ready review list.",
      "Secrets are write-only, so the wizard cannot watch this step; the " +
        "deploy run below is its proof.",
    ],
    links: fork
      ? [
          { label: "Secrets", href: `${fork}/settings/secrets/actions` },
          { label: "Variables", href: `${fork}/settings/variables/actions` },
        ]
      : [],
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
      "Enter your Worker URL above — the deploy run prints it — and the " +
        "wizard watches the API's own health report.",
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
      ? "open"
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
  steps.push({
    id: "dns",
    title: "Email DNS records",
    status: !emailOn
      ? "green"
      : !senderDomain
        ? "open"
        : dns && dns.dkim && dns.code && dns.dmarc
          ? "green"
          : "watch",
    body: !emailOn
      ? ["Email is switched off in the configuration — nothing to prove in DNS."]
      : [
          !senderDomain
            ? "Enter a valid sender address in the configuration form; its " +
              "domain is what these records vouch for."
            : dns
              ? `DKIM ${dns.dkim ? "found" : "missing"}, brevo-code ` +
                `${dns.code ? "found" : "missing"}, DMARC ${dns.dmarc ? "found" : "missing"}.`
              : "Looking the records up.",
          "Checked by presence in public DNS (SETUP.md Part 4 names them); " +
            "Brevo's own record-by-record verdict arrives with the next wizard " +
            "stage.",
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
      ...(owner
        ? [
            "If your account has a custom Pages domain, your page lives " +
              "there instead of github.io.",
          ]
        : ["Enter your GitHub username above for the link."]),
    ],
    links: owner
      ? [
          {
            label: "Your booking page",
            href: `https://${owner}.github.io/${repo}/`,
          },
        ]
      : [],
    manual: true,
  });

  return steps;
}

export function allGreen(steps: StepView[]): boolean {
  return steps.every((s) => s.status === "green");
}
