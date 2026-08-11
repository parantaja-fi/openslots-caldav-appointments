import type { FieldView } from "./form";
import {
  PROVIDER_HELP,
  PROVIDERS,
  deriveForm,
  effectiveValues,
  formComplete,
  senderDomainOf,
} from "./form";
import type { ManifestEntry } from "./manifest";
import { MANIFEST } from "./manifest";
import type { GithubCache } from "./probes";
import { probeDeployInfo, probeDns, probeFork, probeHealth, probeRun } from "./probes";
import type { ProbeState, StepView } from "./steps";
import { allGreen, deriveSteps } from "./steps";
import type { Provider } from "./state";
import { load, save } from "./state";

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
  renderConfig(fields);
  renderReview(formComplete(fields));
  renderSteps();
}

// Probe results touch only the checklist, so the poll never rebuilds the
// form — a rebuild would wipe whatever is being typed into it.
function renderSteps(): void {
  const formOk = formComplete(deriveForm(MANIFEST, state.form, secrets));
  const steps = deriveSteps(state, probes, formOk);
  const list = document.getElementById("steps")!;
  list.replaceChildren(...steps.map(renderStep));
  (document.getElementById("alldone") as HTMLElement).hidden = !allGreen(steps);
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

function group(legendText: string, why: string, children: HTMLElement[]): HTMLFieldSetElement {
  const set = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = legendText;
  set.append(legend);
  const p = document.createElement("p");
  p.className = "why";
  p.textContent = why;
  set.append(p, ...children);
  return set;
}

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

  const providerHelp = PROVIDER_HELP[state.form.provider].map((text) => {
    const p = document.createElement("p");
    p.className = "why";
    p.textContent = text;
    return p;
  });

  const calendars = group(
    "Your calendars",
    "Availability is the calendar your OPEN events live in; bookings are " +
      "written as ordinary events. One calendar can play both roles.",
    [
      providerRow,
      toggle("One calendar for both — bookings are written into the availability calendar", state.form.sameCalendar, (on) => {
        state.form.sameCalendar = on;
        save(state);
        render();
      }),
      ...providerHelp,
      ...rows("calendars", false),
    ],
  );

  const cloudflare = group(
    "Cloudflare — runs the booking API",
    "The small program between your customers and your calendar runs on " +
      "Cloudflare's free tier. Minting the token is guided in the deploy stage.",
    rows("cloudflare", false),
  );

  const email = group(
    "Email — the confirmations",
    "Brevo delivers the booking confirmation, which carries the customer's " +
      "cancellation link. Off, bookings still work and nobody is emailed.",
    [
      toggle("Send confirmation emails", state.form.emailOn, (on) => {
        state.form.emailOn = on;
        save(state);
        render();
      }),
      ...rows("email", false),
    ],
  );

  const shapeChildren: HTMLElement[] = rows("shape", false);
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
  const shape = group(
    "The shape of your bookings",
    "How your OPEN blocks are cut into bookable slots.",
    shapeChildren,
  );

  const cfg = document.getElementById("cfg")!;
  // Rebuilding mid-interaction (a change fired by clicking into the next
  // field) replaces the freshly focused element; give focus back to it.
  const active =
    document.activeElement instanceof HTMLElement && cfg.contains(document.activeElement)
      ? document.activeElement.id
      : null;
  cfg.replaceChildren(calendars, cloudflare, email, shape);
  if (active) document.getElementById(active)?.focus();
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

// --- The checklist ----------------------------------------------------

function renderStep(step: StepView): HTMLLIElement {
  const li = document.createElement("li");
  li.className = step.status;

  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = BADGE[step.status];
  li.append(badge);

  const title = document.createElement("span");
  title.className = "title";
  title.textContent = step.title;
  li.append(title);

  const body = document.createElement("div");
  body.className = "body";
  for (const text of step.body) {
    const p = document.createElement("p");
    p.textContent = text;
    body.append(p);
  }
  if (step.links.length || step.manual) {
    const p = document.createElement("p");
    for (const link of step.links) {
      const a = document.createElement("a");
      a.href = link.href;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = link.label;
      p.append(a, " ");
    }
    if (step.manual) {
      const button = document.createElement("button");
      button.textContent = state.done[step.id] ? "Not done after all" : "Mark done";
      button.addEventListener("click", () => {
        state.done[step.id] = !state.done[step.id];
        save(state);
        render();
      });
      p.append(button);
    }
    body.append(p);
  }
  li.append(body);
  return li;
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
    await Promise.all(jobs);
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

document.getElementById("cfg")!.addEventListener("submit", (e) => e.preventDefault());
document.getElementById("refresh")!.addEventListener("click", () => void poll());

render();
void poll();
setInterval(() => void poll(), POLL_MS);
