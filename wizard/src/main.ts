import type { FieldView } from "./form";
import {
  PROVIDER_HELP,
  PROVIDERS,
  deriveForm,
  effectiveValues,
  formComplete,
  groupStatuses,
  senderDomainOf,
} from "./form";
import { authenticate, createDomain, getDomain } from "./brevo";
import type { RepoInfo } from "./github";
import { GithubError, getPublicKey, getRepo, putSecret, putVariable, startDeploy } from "./github";
import type { ManifestEntry } from "./manifest";
import { MANIFEST } from "./manifest";
import type { GithubCache } from "./probes";
import { probeDeployInfo, probeDns, probeFork, probeHealth, probeRun } from "./probes";
import type { PhaseView, ProbeState, StepView } from "./steps";
import { allGreen, derivePhases, deriveSteps } from "./steps";
import type { Provider } from "./state";
import { UPSTREAM_OWNER, UPSTREAM_REPO, load, save } from "./state";

const POLL_MS = 20_000;
const BADGE = { open: "○", watch: "◌", green: "✓", red: "✗" } as const;

const state = load();
const probes: ProbeState = {};
const cache: GithubCache = {};

// Secret values never leave this map for anywhere but the clipboard —
// not localStorage, not the network (index.html says so to the user).
const secrets: Record<string, string> = {};

// Variables are prefilled so the review list always shows what the fork
// will actually get; the timezone default is the browser's own zone.
for (const entry of MANIFEST) {
  if (entry.kind !== "variable") continue;
  if (entry.default !== undefined && state.form.values[entry.name] === undefined) {
    state.form.values[entry.name] = entry.default;
  }
}
if (!state.form.values["DISPLAY_TIMEZONE"]) {
  state.form.values["DISPLAY_TIMEZONE"] = Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function input(id: string): HTMLInputElement {
  return document.getElementById(id) as HTMLInputElement;
}

function render(): void {
  const fields = deriveForm(MANIFEST, state.form, secrets);
  const formOk = formComplete(fields);
  renderConfig(fields);
  renderEmail();
  renderProvision(formOk);
  renderReview(formOk);
  renderSteps();
}

// The step cards are static skeleton in index.html; the poll updates
// their status, text and open state in place. The containers inside
// them (the form, the fork inputs, the Brevo records) are never
// rebuilt here, so typing survives every poll.
let currentId: string | null | undefined; // undefined until the first render
const openOverride = new Map<string, boolean>();
const lastSet = new Map<string, boolean>();

function renderSteps(): void {
  const groups = groupStatuses(deriveForm(MANIFEST, state.form, secrets));
  const steps = deriveSteps(state, probes, groups);
  renderRail(derivePhases(steps));

  // The current step — the first not yet green — opens by itself and
  // wears the ring. A card toggled by hand stays as left until the
  // journey moves on; then the accordion advances and follows.
  const cur = steps.find((s) => s.status !== "green")?.id ?? null;
  const moved = currentId !== undefined && currentId !== cur;
  if (moved) openOverride.clear();

  steps.forEach((step, i) => {
    const li = document.getElementById(`step-${step.id}`)!;
    li.className = `step ${step.status}${step.id === cur ? " current" : ""}`;
    li.querySelector(".marker")!.textContent =
      step.status === "green" ? BADGE.green : step.status === "red" ? BADGE.red : String(i + 1);
    li.querySelector(".title")!.textContent = step.title;
    fillStepBody(li, step);
    const open = openOverride.get(step.id) ?? step.id === cur;
    lastSet.set(step.id, open);
    li.querySelector("details")!.open = open;
  });

  if (moved && cur) {
    document.getElementById(`step-${cur}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  currentId = cur;
  (document.getElementById("alldone") as HTMLElement).hidden = !allGreen(steps);
}

function renderRail(phases: PhaseView[]): void {
  const rail = document.getElementById("rail")!;
  rail.replaceChildren(
    ...phases.map((p) => {
      const chip = document.createElement("a");
      chip.className = `phase ${p.status}`;
      chip.href = `#step-${p.anchor}`;
      chip.textContent = p.status === "green" ? `✓ ${p.label}` : p.label;
      return chip;
    }),
  );
}

// --- The configuration form -------------------------------------------

let advancedOpen = false;

function commitField(entry: ManifestEntry, value: string): void {
  if (entry.kind === "secret") {
    if (value) secrets[entry.name] = value;
    else delete secrets[entry.name];
  } else {
    state.form.values[entry.name] = value;
  }
  if (entry.name === "SENDER_EMAIL") {
    const domain = senderDomainOf(secrets);
    if (domain !== state.inputs.senderDomain) {
      state.inputs.senderDomain = domain;
      delete probes.dns;
      void poll();
    }
  }
  // A key pasted on resume lets the poll ask Brevo again straight away.
  if (entry.name === "BREVO_API_KEY" && value) void poll();
  save(state);
  render();
}

function fieldRow(view: FieldView): HTMLElement {
  const { entry } = view;
  const row = document.createElement("div");
  row.className = view.value && !view.valid ? "fieldrow invalid" : "fieldrow";

  const label = document.createElement("label");
  label.htmlFor = `f-${entry.name}`;
  label.textContent = entry.label + (view.required ? "" : " (optional)");
  row.append(label);

  const field = entry.multiline
    ? document.createElement("textarea")
    : document.createElement("input");
  field.id = `f-${entry.name}`;
  field.value = view.value;
  field.spellcheck = false;
  field.autocomplete = "off";
  if (field instanceof HTMLTextAreaElement) field.rows = 4;
  else field.type = entry.masked ? "password" : "text";
  if (entry.placeholder) field.placeholder = entry.placeholder;
  field.addEventListener("change", () => commitField(entry, field.value));
  row.append(field);

  if (view.message) {
    const err = document.createElement("span");
    err.className = "err";
    err.textContent = view.message;
    row.append(err);
  }
  const help = document.createElement("span");
  help.className = "help";
  help.textContent = entry.help;
  row.append(help);

  return row;
}

function toggle(labelText: string, checked: boolean, onChange: (on: boolean) => void): HTMLLabelElement {
  const label = document.createElement("label");
  label.className = "toggle";
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = checked;
  box.addEventListener("change", () => onChange(box.checked));
  label.append(box, ` ${labelText}`);
  return label;
}

function why(text: string): HTMLParagraphElement {
  const p = document.createElement("p");
  p.className = "why";
  p.textContent = text;
  return p;
}

// Rebuilding mid-interaction (a change fired by clicking into the next
// field) replaces the freshly focused element; give focus back to it.
function replaceKeepingFocus(box: HTMLElement, children: HTMLElement[]): void {
  const active =
    document.activeElement instanceof HTMLElement && box.contains(document.activeElement)
      ? document.activeElement.id
      : null;
  box.replaceChildren(...children);
  if (active) document.getElementById(active)?.focus();
}

// Each configuration group renders into its own journey card.
function renderConfig(fields: FieldView[]): void {
  const rows = (g: ManifestEntry["group"], advanced: boolean) =>
    fields
      .filter((f) => f.visible && f.entry.group === g && Boolean(f.entry.advanced) === advanced)
      .map(fieldRow);

  const providerRow = document.createElement("div");
  providerRow.className = "fieldrow";
  const providerLabel = document.createElement("label");
  providerLabel.htmlFor = "f-provider";
  providerLabel.textContent = "Calendar provider";
  const select = document.createElement("select");
  select.id = "f-provider";
  for (const p of PROVIDERS) {
    const option = document.createElement("option");
    option.value = p.id;
    option.textContent = p.label;
    option.selected = p.id === state.form.provider;
    select.append(option);
  }
  select.addEventListener("change", () => {
    state.form.provider = select.value as Provider;
    save(state);
    render();
  });
  providerRow.append(providerLabel, select);

  const providerHelp = PROVIDER_HELP[state.form.provider].map(why);

  replaceKeepingFocus(document.getElementById("cfg-calendars")!, [
    why(
      "Availability is the calendar your OPEN events live in; bookings are " +
        "written as ordinary events. One calendar can play both roles.",
    ),
    providerRow,
    toggle("One calendar for both — bookings are written into the availability calendar", state.form.sameCalendar, (on) => {
      state.form.sameCalendar = on;
      save(state);
      render();
    }),
    ...providerHelp,
    ...rows("calendars", false),
  ]);

  replaceKeepingFocus(document.getElementById("cfg-cloudflare")!, [
    why(
      "The small program between your customers and your calendar runs on " +
        "Cloudflare's free tier. Minting the token is guided in the deploy stage.",
    ),
    ...rows("cloudflare", false),
  ]);

  replaceKeepingFocus(document.getElementById("cfg-emailcfg")!, [
    why(
      "Brevo delivers the booking confirmation, which carries the customer's " +
        "cancellation link. Off, bookings still work and nobody is emailed.",
    ),
    toggle("Send confirmation emails", state.form.emailOn, (on) => {
      state.form.emailOn = on;
      save(state);
      render();
    }),
    ...rows("email", false),
  ]);

  const shapeChildren: HTMLElement[] = [
    why("How your OPEN blocks are cut into bookable slots."),
    ...rows("shape", false),
  ];
  const advancedRows = rows("shape", true);
  if (advancedRows.length) {
    const details = document.createElement("details");
    details.open = advancedOpen;
    details.addEventListener("toggle", () => void (advancedOpen = details.open));
    const summary = document.createElement("summary");
    summary.textContent = "Advanced — the defaults are fine";
    details.append(summary, ...advancedRows);
    shapeChildren.push(details);
  }
  replaceKeepingFocus(document.getElementById("cfg-shape")!, shapeChildren);
}

// --- The sender domain at Brevo ---------------------------------------

let brevoBusy = false;
let brevoError = "";

async function registerDomain(): Promise<void> {
  brevoBusy = true;
  brevoError = "";
  renderEmail();
  try {
    state.brevo = await createDomain(secrets["BREVO_API_KEY"]!, state.inputs.senderDomain);
    save(state);
    void poll();
  } catch (e) {
    brevoError = e instanceof Error ? e.message : String(e);
  } finally {
    brevoBusy = false;
    renderEmail();
    renderSteps();
  }
}

function recordRow(r: { label: string; type: string; host: string; value: string; status: boolean }): HTMLElement {
  const row = document.createElement("div");
  row.className = "rec";
  const badge = document.createElement("span");
  badge.className = r.status ? "badge green" : "badge open";
  badge.textContent = r.status ? BADGE.green : BADGE.watch;
  const label = document.createElement("span");
  label.className = "reclabel";
  label.textContent = `${r.label} — ${r.type}`;
  const host = document.createElement("code");
  host.textContent = r.host;
  const value = document.createElement("code");
  value.className = "recvalue";
  value.textContent = r.value;
  row.append(badge, label, host, copyButton(r.host), value, copyButton(r.value));
  return row;
}

function renderEmail(): void {
  const box = document.getElementById("email")!;
  const domain = state.inputs.senderDomain;
  const key = secrets["BREVO_API_KEY"] ?? "";
  const current = state.brevo && state.brevo.domain === domain ? state.brevo : null;
  if (!state.form.emailOn || !domain || (!key && !current)) {
    box.replaceChildren();
    return;
  }

  const children: HTMLElement[] = [];

  if (!current) {
    const why = document.createElement("p");
    why.className = "why";
    why.textContent =
      state.brevo
        ? `The sender address moved from ${state.brevo.domain} to ${domain} — ` +
          "register the new domain at Brevo to get its records."
        : `Brevo only delivers your emails once ${domain} is proven yours: ` +
          "it hands out DNS records to place at your domain's registrar, " +
          "then checks them.";
    const row = document.createElement("p");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = brevoBusy ? "Registering…" : `Register ${domain} at Brevo`;
    button.disabled = brevoBusy;
    button.addEventListener("click", () => void registerDomain());
    row.append(button);
    children.push(why, row);
  } else {
    const why = document.createElement("p");
    why.className = "why";
    why.textContent = current.authenticated
      ? "Brevo has confirmed every record — your sender domain is proven."
      : "Create each record at your domain's DNS provider, exactly as " +
        "copied. Propagation can take hours: the records stay here across " +
        "visits and the wizard keeps checking, though after a reload it " +
        "needs the Brevo key pasted again to ask Brevo itself.";
    children.push(why, ...current.records.map(recordRow));
    if (!current.authenticated) {
      const byHand = document.createElement("p");
      byHand.className = "why";
      const a = document.createElement("a");
      a.href = `https://github.com/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/blob/main/SETUP.md`;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "SETUP.md Part 4";
      byHand.append(
        "Rather work in Brevo's own pages? ",
        a,
        " walks the same records; the verdicts here turn green either way.",
      );
      children.push(byHand);
    }
  }

  if (brevoError) {
    const err = document.createElement("p");
    err.className = "err";
    err.textContent = brevoError;
    children.push(err);
  }
  box.replaceChildren(...children);
}

// --- Provisioning the fork --------------------------------------------

// GitHub pre-fills everything on the token form except the repository
// pick (not supported as a URL parameter). The four permissions: secrets
// and variables for the writes, actions for the dispatch, contents for
// the empty registering commit.
const PAT_URL =
  "https://github.com/settings/personal-access-tokens/new" +
  "?name=Booking+setup+wizard" +
  "&description=" +
  encodeURIComponent(
    "Lets the setup wizard write the booking configuration into the fork " +
      "and start its deploy. Repository access: only the fork.",
  ) +
  "&expires_in=7" +
  "&contents=write&actions=write&secrets=write&actions_variables=write";

// The token joins the other secrets in module memory only.
let pat = "";
let provisioning = false;
const provisionLog: { text: string; kind: "info" | "ok" | "err" }[] = [];

async function provision(): Promise<void> {
  provisioning = true;
  provisionLog.length = 0;
  const say = (text: string, kind: "info" | "ok" | "err" = "info") => {
    provisionLog.push({ text, kind });
    renderProvision(true);
  };
  const { owner, repo } = state.inputs;
  const eff = effectiveValues(MANIFEST, state.form, secrets);
  try {
    if (!owner || !repo) {
      throw new Error("Enter your GitHub username above first — the wizard needs to know which fork to write to.");
    }
    say("Checking the token against your fork.");
    let info: RepoInfo;
    try {
      info = await getRepo(owner, repo, pat);
    } catch (e) {
      if (e instanceof GithubError && e.status === 404) {
        throw new Error(
          `The token cannot see ${owner}/${repo} — under the token's Repository access, pick your fork.`,
        );
      }
      throw e;
    }
    const key = await getPublicKey(owner, repo, pat);
    for (const [name, value] of Object.entries(eff.secrets)) {
      await putSecret(owner, repo, pat, key, name, value);
      say(`${name} written.`, "ok");
    }
    for (const [name, value] of Object.entries(eff.variables)) {
      await putVariable(owner, repo, pat, name, value);
      say(`${name} written.`, "ok");
    }
    say("Starting the deploy.");
    await startDeploy(owner, repo, pat, info.default_branch);
    say("Deploy started — watch it land in the deploy step below.", "ok");
    state.done["secrets"] = true;
    save(state);
    void poll();
  } catch (e) {
    say(e instanceof Error ? e.message : String(e), "err");
  } finally {
    provisioning = false;
    render();
  }
}

function renderProvision(formOk: boolean): void {
  const box = document.getElementById("provision")!;
  if (!formOk) {
    box.replaceChildren();
    return;
  }

  const h = document.createElement("h3");
  h.textContent = "Write it to your fork";

  const why = document.createElement("p");
  why.className = "why";
  const mint = document.createElement("a");
  mint.href = PAT_URL;
  mint.target = "_blank";
  mint.rel = "noopener";
  mint.textContent = "Mint an access token";
  why.append(
    mint,
    " on GitHub — the form comes pre-filled; under Repository access " +
      "choose “Only select repositories” and pick your fork. Paste the " +
      "token here and the wizard writes every secret and variable to " +
      "your fork itself, then starts the deploy. Prefer doing it by " +
      "hand? The review list below has copy buttons for everything.",
  );

  const row = document.createElement("div");
  row.className = "patrow";
  const field = document.createElement("input");
  field.id = "f-pat";
  field.type = "password";
  field.value = pat;
  field.placeholder = "github_pat_…";
  field.autocomplete = "off";
  field.spellcheck = false;
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = provisioning ? "Writing…" : "Write and deploy";
  button.disabled = !pat || provisioning;
  field.addEventListener("input", () => {
    pat = field.value.trim();
    button.disabled = !pat || provisioning;
  });
  button.addEventListener("click", () => void provision());
  row.append(field, button);

  const log = document.createElement("ul");
  log.className = "log";
  for (const line of provisionLog) {
    const li = document.createElement("li");
    li.className = line.kind;
    li.textContent = line.text;
    log.append(li);
  }

  box.replaceChildren(h, why, row, log);
}

// --- The review list --------------------------------------------------

function copyButton(value: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Copy";
  button.addEventListener("click", () => {
    void navigator.clipboard.writeText(value).then(() => {
      button.textContent = "Copied";
      setTimeout(() => void (button.textContent = "Copy"), 1500);
    });
  });
  return button;
}

function reviewRows(values: Record<string, string>): HTMLElement[] {
  const byName = new Map(MANIFEST.map((e) => [e.name, e]));
  return MANIFEST.filter((e) => values[e.name] !== undefined).map((entry) => {
    const value = values[entry.name]!;
    const row = document.createElement("div");
    row.className = "kv";
    const code = document.createElement("code");
    code.textContent = entry.name;
    const shown = document.createElement("span");
    shown.className = "val";
    const masked = byName.get(entry.name)?.masked || byName.get(entry.name)?.multiline;
    shown.textContent = masked ? "••••••••" : value;
    row.append(code, shown, copyButton(value));
    return row;
  });
}

function renderReview(formOk: boolean): void {
  const review = document.getElementById("review")!;
  if (!formOk) {
    review.replaceChildren();
    return;
  }
  const eff = effectiveValues(MANIFEST, state.form, secrets);
  const { owner, repo } = state.inputs;
  const fork = owner && repo ? `https://github.com/${owner}/${repo}` : null;

  const section = (title: string, values: Record<string, string>, page: string): HTMLElement[] => {
    const h = document.createElement("h3");
    h.textContent = title;
    const where = document.createElement("p");
    where.className = "where";
    if (fork) {
      where.append("Create each of these on your fork's ");
      const a = document.createElement("a");
      a.href = `${fork}/settings/${page}/actions`;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = `${title.toLowerCase()} page`;
      where.append(a, ", name and value exactly as shown.");
    } else {
      where.textContent = "Enter your GitHub username above for a direct link to where these go.";
    }
    return [h, where, ...reviewRows(values)];
  };

  review.replaceChildren(
    ...section("Secrets", eff.secrets, "secrets"),
    ...section("Variables", eff.variables, "variables"),
  );
}

// --- The step cards ---------------------------------------------------

// Body text and action links fill the card's head slot — links stacked,
// styled as buttons. The confirming button (Mark done, or Done for a
// checked step) sits alone in the foot, after whatever the card embeds
// (the form, the inputs, the Brevo records).
function fillStepBody(li: HTMLElement, step: StepView): void {
  const children: HTMLElement[] = [];
  for (const text of step.body) {
    const p = document.createElement("p");
    p.textContent = text;
    children.push(p);
  }
  if (step.links.length) {
    const links = document.createElement("div");
    links.className = "links";
    for (const link of step.links) {
      const a = document.createElement("a");
      a.className = "linkbtn";
      a.href = link.href;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = link.label;
      links.append(a);
    }
    children.push(links);
  }
  li.querySelector(".dyn")!.replaceChildren(...children);

  const foot: HTMLElement[] = [];
  if (step.check) {
    const button = document.createElement("button");
    button.textContent = "Done";
    button.addEventListener("click", () => {
      button.disabled = true;
      button.textContent = "Checking…";
      void poll(); // its render rebuilds this card with the verdict
    });
    foot.push(button);
  }
  if (step.manual) {
    const button = document.createElement("button");
    button.textContent = state.done[step.id] ? "Not done after all" : "Mark done";
    button.addEventListener("click", () => {
      state.done[step.id] = !state.done[step.id];
      save(state);
      render();
    });
    foot.push(button);
  }
  li.querySelector(".dynfoot")!.replaceChildren(...foot);
}

// A card toggled by hand records an override. The toggle event also
// echoes programmatic opens; those are told apart by comparing against
// what the render last set.
for (const li of document.querySelectorAll<HTMLElement>("#journey .step")) {
  const id = li.id.slice("step-".length);
  const details = li.querySelector("details")!;
  details.addEventListener("toggle", () => {
    if (details.open !== lastSet.get(id)) {
      lastSet.set(id, details.open);
      openOverride.set(id, details.open);
    }
  });
}

// A poll requested while one is in flight runs right after it — an edited
// input mid-poll must not wait for the next tick.
let polling = false;
let queued = false;
async function poll(): Promise<void> {
  if (polling) {
    queued = true;
    return;
  }
  polling = true;
  do {
    queued = false;
    const { owner, repo, workerUrl, pageUrl, senderDomain } = state.inputs;
    const jobs: Promise<void>[] = [];
    if (owner && repo) {
      jobs.push(probeFork(owner, repo, cache).then((r) => void (probes.fork = r)));
      jobs.push(probeRun(owner, repo, cache).then((r) => void (probes.run = r)));
    }
    if (owner && repo && (!workerUrl || !pageUrl)) {
      jobs.push(
        probeDeployInfo(owner, repo).then((info) => {
          if (!info) return;
          state.inputs.workerUrl = info.worker_url;
          state.inputs.pageUrl = `${info.page_origin}${info.base_path}/`;
          save(state);
          queued = true; // let the health probe run on the next lap
        }),
      );
    }
    if (workerUrl) {
      jobs.push(probeHealth(workerUrl).then((r) => void (probes.health = r)));
    }
    if (senderDomain) {
      jobs.push(probeDns(senderDomain).then((r) => void (probes.dns = r)));
    }
    // Brevo's side of the dual DNS verdict — only askable while the key
    // is in tab memory; the persisted records carry the wait otherwise.
    const brevoKey = secrets["BREVO_API_KEY"];
    if (brevoKey && state.brevo && !state.brevo.authenticated && state.brevo.domain === senderDomain) {
      const domain = state.brevo.domain;
      jobs.push(
        (async () => {
          let next = await getDomain(brevoKey, domain);
          if (
            !next.authenticated &&
            next.records.every((r) => r.status) &&
            (await authenticate(brevoKey, domain))
          ) {
            next = await getDomain(brevoKey, domain);
          }
          state.brevo = next;
          save(state);
        })().catch(() => {
          // a network or key hiccup — the last known state stands
        }),
      );
    }
    await Promise.all(jobs);
    renderEmail();
    renderSteps();
  } while (queued);
  polling = false;
}

for (const [id, key] of [
  ["owner", "owner"],
  ["repo", "repo"],
] as const) {
  const field = input(id);
  field.value = state.inputs[key];
  field.addEventListener("change", () => {
    state.inputs[key] = field.value.trim();
    // A changed target invalidates what was probed — and discovered —
    // for the old one.
    state.inputs.workerUrl = "";
    state.inputs.pageUrl = "";
    delete probes.fork;
    delete probes.run;
    delete probes.health;
    delete probes.dns;
    save(state);
    render();
    void poll();
  });
}

for (const form of document.querySelectorAll("form.cfg")) {
  form.addEventListener("submit", (e) => e.preventDefault());
}

const refresh = document.getElementById("refresh") as HTMLButtonElement;
refresh.addEventListener("click", () => {
  refresh.disabled = true;
  refresh.textContent = "Checking…";
  void poll().finally(() => {
    refresh.disabled = false;
    refresh.textContent = "Check now";
  });
});

render();
void poll();
setInterval(() => void poll(), POLL_MS);
