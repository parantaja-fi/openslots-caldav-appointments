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
import {
  GithubError,
  RECORD_PATH,
  getPublicKey,
  getRepo,
  putSecret,
  putVariable,
  startDeploy,
  writeRecord,
} from "./github";
import type { ManifestEntry } from "./manifest";
import { MANIFEST } from "./manifest";
import type { GithubCache } from "./probes";
import {
  githubPaced,
  probeDeployInfo,
  probeDeployment,
  probeDns,
  probeFork,
  probeHealth,
  probeRecord,
  probeRun,
} from "./probes";
import type { PhaseView, ProbeState, StepLink, StepView } from "./steps";
import {
  allGreen,
  derivePhases,
  deriveSteps,
  githubQuestions,
  publishedAt,
  settled,
} from "./steps";
import type { Provider } from "./state";
import { UPSTREAM_OWNER, UPSTREAM_REPO, load, reset, save } from "./state";

const POLL_MS = 20_000;
const BADGE = { open: "○", watch: "◌", unknown: "?", green: "✓", attested: "✓", red: "✗" } as const;

const state = load();
// The loaded state's age, captured before this session's saves restamp
// it — a fresh visit has none.
const resumedFrom = state.savedAt;
const probes: ProbeState = {};
const cache: GithubCache = { answers: {} };

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
  renderAccounts();
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
// The card whose Done was pressed last: it stays open beside its
// acknowledgment until the journey moves on without it. `ackFresh` lets
// the press's own render, which moves the journey, keep it.
let acked: string | null = null;
let ackFresh = false;

function renderSteps(): void {
  const groups = groupStatuses(deriveForm(MANIFEST, state.form, secrets));
  const steps = deriveSteps(state, probes, groups, Boolean(pat));
  renderRail(derivePhases(steps));

  // The current step — the first not yet green — opens by itself and
  // wears the ring. A card toggled by hand stays as left until the
  // journey moves on; then the accordion advances and follows. A card
  // whose field holds the focus never closes under the typist — turning
  // green mid-form must not steal the remaining fields from the tab
  // order; the accordion catches up once focus leaves it. A pressed
  // button is no typist: Chrome focuses it, and its card would linger
  // open until the next poll.
  const cur = steps.find((s) => !settled(s.status))?.id ?? null;
  const moved = currentId !== undefined && currentId !== cur;
  if (moved) {
    openOverride.clear();
    if (!ackFresh) acked = null;
  }
  ackFresh = false;
  const active = document.activeElement;
  const focused =
    active instanceof HTMLElement && active.matches("input, textarea, select")
      ? (active.closest(".step")?.id.slice("step-".length) ?? null)
      : null;

  steps.forEach((step, i) => {
    const li = document.getElementById(`step-${step.id}`)!;
    li.className = `step ${step.status}${step.id === cur ? " current" : ""}`;
    li.querySelector(".marker")!.textContent =
      settled(step.status) || step.status === "red" || step.status === "unknown"
        ? BADGE[step.status]
        : String(i + 1);
    li.querySelector(".title")!.textContent = step.title;
    fillStepBody(li, step);
    const open =
      openOverride.get(step.id) ?? (step.id === cur || step.id === focused || step.id === acked);
    lastSet.set(step.id, open);
    li.querySelector("details")!.open = open;
  });

  // The new current card scrolls into view — but never under a typist,
  // not even when their edit re-opens their own card (the scroll would
  // pull the button their press is on away from the pointer), and not
  // after a Done press, whose next card opens right below.
  if (moved && cur && !acked && !focused) {
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

// A changed value is what breaks a stored group's attestation — the
// stamp is compared against the store moment in steps.ts.
function stampEdited(group: string): void {
  (state.edited ??= {})[group] = Date.now();
}

function commitField(entry: ManifestEntry, value: string): void {
  stampEdited(entry.group);
  if (entry.kind === "secret") {
    if (value) secrets[entry.name] = value;
    else delete secrets[entry.name];
  } else {
    state.form.values[entry.name] = value;
  }
  // A Nextcloud internal link pasted before the server address fills
  // the server in backwards — everything before /remote.php is it.
  if (
    (entry.name === "AVAILABILITY_CALENDAR_URL" || entry.name === "BOOKING_STORE_URL") &&
    state.form.provider === "nextcloud" &&
    !state.form.providerUrl
  ) {
    const cut = value.indexOf("/remote.php");
    if (cut > 0) state.form.providerUrl = value.slice(0, cut);
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
  renderAfterFocusMove();
}

function fieldRow(view: FieldView, labelText?: string): HTMLElement {
  const { entry } = view;
  const row = document.createElement("div");
  row.className = view.value && !view.valid ? "fieldrow invalid" : "fieldrow";

  const label = document.createElement("label");
  label.htmlFor = `f-${entry.name}`;
  label.textContent = (labelText ?? entry.label) + (view.required ? "" : " (optional)");
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

// A button-styled link; without an address it renders greyed out,
// waiting for the input that completes it.
function linkBtn(label: string, href: string | null): HTMLAnchorElement {
  const a = document.createElement("a");
  a.className = href ? "linkbtn" : "linkbtn disabled";
  if (href) {
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener";
  }
  a.textContent = label;
  return a;
}

function linksRow(...links: HTMLElement[]): HTMLElement {
  const div = document.createElement("div");
  div.className = "links";
  div.append(...links);
  return div;
}

// A labelled plain link — "Fork: https://…" — or, dimmed, the same
// address as grey text while the destination is not yet live.
function bareLink(l: StepLink): HTMLElement {
  const span = document.createElement("span");
  span.className = l.dim ? "bare dim" : "bare";
  if (l.dim) {
    span.textContent = `${l.label} ${l.href}`;
  } else {
    const a = document.createElement("a");
    a.href = l.href;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = l.href;
    span.append(`${l.label} `, a);
  }
  return span;
}

// The accounts card: signup button, echo field and the tick, laid out
// as aligned rows — filling in who you are here matches the mental
// model, and the fork step picks the username up ready-made. The rows
// are rebuilt only when the tick changes — the fields hold their own
// values — so the click on Mark done right after typing lands.
let accountsBuilt = false;
let accountsDone: number | undefined;

function renderAccounts(): void {
  const done = state.done["accounts"];
  if (accountsBuilt && done === accountsDone) return;
  accountsBuilt = true;
  accountsDone = done;
  const box = document.getElementById("accounts-rows")!;

  const echo = (id: string, value: string, commit: (v: string) => void): HTMLInputElement => {
    const field = document.createElement("input");
    field.id = id;
    field.value = value;
    field.spellcheck = false;
    field.autocomplete = "off";
    field.addEventListener("change", () => commit(field.value.trim()));
    return field;
  };
  const labelFor = (id: string, text: string): HTMLLabelElement => {
    const label = document.createElement("label");
    label.htmlFor = id;
    label.textContent = text;
    return label;
  };

  const ownerField = echo("acc-owner", state.inputs.owner, commitOwner);
  const emailField = echo("acc-cf-email", state.inputs.cfEmail, (v) => {
    state.inputs.cfEmail = v;
    save(state);
    renderAfterFocusMove();
  });

  const tick = document.createElement("button");
  tick.type = "button";
  tick.textContent = done ? "Mark not done" : "Mark done";
  tick.addEventListener("click", () => {
    if (state.done["accounts"]) delete state.done["accounts"];
    else state.done["accounts"] = Date.now();
    save(state);
    render();
  });
  const tickNote = document.createElement("span");
  tickNote.className = "ticknote";
  if (done) tickNote.textContent = done > 1 ? `Marked done: ${whenShort(done)}` : "Marked done";

  replaceKeepingFocus(box, [
    linkBtn("GitHub signup", "https://github.com/signup"),
    labelFor("acc-owner", "Username"),
    ownerField,
    linkBtn("Cloudflare signup", "https://dash.cloudflare.com/sign-up"),
    labelFor("acc-cf-email", "Email"),
    emailField,
    tick,
    ...(done ? [tickNote] : []),
  ]);
}

function whenShort(at: number): string {
  return new Date(at).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// The GitHub username is asked on the accounts card and shown again on
// the fork card — one value behind both fields; changing either
// invalidates whatever was probed for the old one.
function commitOwner(value: string): void {
  state.inputs.owner = value;
  input("owner").value = value;
  input("acc-owner").value = value;
  state.inputs.workerUrl = "";
  state.inputs.pageUrl = "";
  delete probes.fork;
  delete probes.run;
  delete probes.record;
  delete probes.deployment;
  delete probes.health;
  delete probes.dns;
  save(state);
  renderAfterFocusMove();
  asked = true;
  void poll();
}

// A text field's change event fires while the focus is still moving on,
// by Tab or by a click; a render then would rebuild the box the focus is
// headed into, its target with it. The render waits for the focus to
// land (focusin, before any keystroke can follow), or for the next task
// when nothing takes the focus; replaceKeepingFocus then carries the
// focus over to the rebuilt field. A press on a card's own button waits
// on until its click is delivered: the render would re-word the card
// above the button and so move it from under the pointer.
let renderPending = false;
let pressing = false;
function renderAfterFocusMove(): void {
  renderPending = true;
  setTimeout(flushRender);
}
function flushRender(): void {
  if (!renderPending || pressing) return;
  renderPending = false;
  render();
}
document.addEventListener("focusin", flushRender);
document.addEventListener(
  "pointerdown",
  (e) => {
    pressing =
      e.button === 0 &&
      e.target instanceof Element &&
      e.target.closest(".dynfoot button, #accounts-rows button") !== null;
  },
  true,
);
for (const type of ["pointerup", "pointercancel", "contextmenu"]) {
  document.addEventListener(
    type,
    () => {
      pressing = false;
      setTimeout(flushRender);
    },
    true,
  );
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

// Nextcloud's card walks its own instance: the server address first —
// never written to the fork — because it completes the deep links; the
// instructions sit right above the field each one feeds.
function nextcloudChildren(fields: FieldView[]): HTMLElement[] {
  const byName = new Map(fields.map((f) => [f.entry.name, f]));
  const row = (name: string, label?: string): HTMLElement[] => {
    const f = byName.get(name)!;
    return f.visible ? [fieldRow(f, label)] : [];
  };

  const serverRow = document.createElement("div");
  serverRow.className = "fieldrow";
  const label = document.createElement("label");
  label.htmlFor = "f-provider-url";
  label.textContent = "Nextcloud server address";
  const field = document.createElement("input");
  field.id = "f-provider-url";
  field.type = "text";
  field.value = state.form.providerUrl;
  field.placeholder = "https://cloud.example.com";
  field.spellcheck = false;
  field.autocomplete = "off";
  field.addEventListener("change", () => {
    state.form.providerUrl = field.value.trim().replace(/\/+$/, "");
    save(state);
    renderAfterFocusMove();
  });
  const help = document.createElement("span");
  help.className = "help";
  help.textContent =
    "The address you sign in at. It stays in this browser and unlocks " +
    "the links below; pasting a calendar address first fills it in too.";
  serverRow.append(label, field, help);

  const server = /^https?:\/\/./.test(state.form.providerUrl) ? state.form.providerUrl : null;

  const children: HTMLElement[] = [
    serverRow,
    why(
      "Find the calendar address: open your calendars, click the pen " +
        "beside the calendar, and copy “Internal link” into the field below.",
    ),
    linksRow(linkBtn("Open your calendars", server && `${server}/apps/calendar/`)),
    ...row("AVAILABILITY_CALENDAR_URL"),
    why(
      "Create an app password for it: Security → “Create new app " +
        "password”. The login stays your ordinary Nextcloud login; only " +
        "the password is minted for this. Name the app password so that " +
        "you recognise it later, e.g. " +
        `${state.inputs.owner || "<your-github-username>"}/${state.inputs.repo}.`,
    ),
    linksRow(linkBtn("Create an app password", server && `${server}/settings/user/security`)),
    ...row("AVAILABILITY_USERNAME", "New App Password login"),
    ...row("AVAILABILITY_PASSWORD", "New App Password password"),
  ];
  if (!state.form.sameCalendar) {
    children.push(
      why(
        "The booking calendar, the same way — one app password serves " +
          "both when the calendars live in the same account.",
      ),
      ...row("BOOKING_STORE_URL"),
      ...row("BOOKING_STORE_USERNAME", "Booking login"),
      ...row("BOOKING_STORE_PASSWORD"),
    );
  }
  return children;
}

// Each configuration group renders into its own journey card.
function renderConfig(fields: FieldView[]): void {
  const rows = (g: ManifestEntry["group"], advanced: boolean) =>
    fields
      .filter((f) => f.visible && f.entry.group === g && Boolean(f.entry.advanced) === advanced)
      .map((f) => fieldRow(f));

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
    stampEdited("calendars");
    state.form.provider = select.value as Provider;
    save(state);
    render();
  });
  providerRow.append(providerLabel, select);

  const calendarChildren: HTMLElement[] = [
    why(
      "Availability is the calendar your OPEN events live in; bookings are " +
        "written as ordinary events. One calendar can play both roles.",
    ),
    toggle("One calendar for both — bookings are written into the availability calendar", state.form.sameCalendar, (on) => {
      stampEdited("calendars");
      state.form.sameCalendar = on;
      save(state);
      render();
    }),
    providerRow,
  ];
  if (state.form.provider === "nextcloud") {
    calendarChildren.push(...nextcloudChildren(fields));
  } else {
    calendarChildren.push(...PROVIDER_HELP[state.form.provider].map(why));
    if (state.form.provider === "google") {
      // The visible marker for the guided path to come (ROADMAP.md M6):
      // a page of its own creating the project, service account and key.
      const marker = document.createElement("p");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.disabled = true;
      btn.textContent = "Create Google credentials";
      marker.append(btn);
      calendarChildren.push(
        marker,
        why("Not implemented yet — until it is, the steps above are by hand."),
      );
    }
    calendarChildren.push(...rows("calendars", false));
  }
  replaceKeepingFocus(document.getElementById("cfg-calendars")!, calendarChildren);

  replaceKeepingFocus(document.getElementById("cfg-cloudflare")!, [
    why(
      "The small program between your customers and your calendar runs on " +
        "Cloudflare's free tier. Create the token from the “Edit Cloudflare " +
        "Workers” template — by hand: Dashboard → Manage account → Account " +
        "API tokens → Create Token.",
    ),
    linksRow(linkBtn("Create an API token", "https://dash.cloudflare.com/?to=/:account/api-tokens/create")),
    ...rows("cloudflare", false),
  ]);

  const emailChildren: HTMLElement[] = [
    why(
      "Brevo delivers the booking confirmation, which carries the customer's " +
        "cancellation link. Off, bookings still work and nobody is emailed.",
    ),
    toggle("Send confirmation emails", state.form.emailOn, (on) => {
      stampEdited("email");
      state.form.emailOn = on;
      save(state);
      render();
    }),
  ];
  if (state.form.emailOn) {
    emailChildren.push(
      why(
        "The key: Brevo → Settings → SMTP & API → API keys → “Generate " +
          "a new API key”.",
      ),
      linksRow(linkBtn("Generate a Brevo API key", "https://app.brevo.com/settings/keys/api")),
    );
  }
  emailChildren.push(...rows("email", false));
  replaceKeepingFocus(document.getElementById("cfg-emailcfg")!, emailChildren);

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
// the record file and the empty registering commit.
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
    const storedAt = new Date();
    await writeRecord(owner, repo, pat, info.default_branch, {
      repository: info.full_name,
      forked_from: info.parent?.full_name ?? null,
      forked_at: info.parent ? info.created_at : null,
      stored_at: storedAt.toISOString(),
    });
    // What was just written needs no read-back; the poll confirms it.
    probes.record = { state: "present", storedAt: storedAt.getTime() };
    say(`${RECORD_PATH} written — the dated record of this store.`, "ok");
    say("Stored. The deploy follows below, once Pages is switched on.", "ok");
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
  h.textContent = "Store the configuration";

  const why = document.createElement("p");
  why.className = "why";
  const mint = document.createElement("a");
  mint.href = PAT_URL;
  mint.target = "_blank";
  mint.rel = "noopener";
  mint.textContent = "Mint an access token";
  // “Only select repositories” carries the whole least-privilege point —
  // and went unnoticed in the M6.4 walk until set in bold.
  const only = document.createElement("strong");
  only.textContent = "“Only select repositories”";
  why.append(
    mint,
    " on GitHub — the form comes pre-filled; under Repository access choose ",
    only,
    " and pick your fork. Paste the token here and the wizard writes " +
      "every secret and variable to your fork itself; the deploy is its " +
      "own step below. Prefer doing it by hand? The review list below has " +
      "copy buttons for everything.",
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
  button.textContent = provisioning ? "Storing…" : "Store";
  button.disabled = !pat || provisioning;
  field.addEventListener("input", () => {
    pat = field.value.trim();
    button.disabled = !pat || provisioning;
    renderSteps(); // the deploy step offers its button once a token is held
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

// Body text fills the card's head slot; the action links (styled as
// buttons, in a row) and the confirming button (Mark done; Done for a
// checked step or a configuration card, Reconfigure once it is stored)
// sit in the foot, after whatever the card embeds (the form, the fork
// inputs, the Brevo records) — so the fork step's Fork-it lands below
// the username it needs.
//
// A foot is rebuilt only when what it shows changes: a rebuild after
// tabbing onto its button would drop the focus.
const footShown = new Map<string, string>();

function fillStepBody(li: HTMLElement, step: StepView): void {
  const children: HTMLElement[] = [];
  for (const text of step.body) {
    const p = document.createElement("p");
    p.textContent = text;
    children.push(p);
  }
  li.querySelector(".dyn")!.replaceChildren(...children);

  // A ticked step that re-opened (the store step, after an edit) is
  // marked done afresh, not un-marked — the new tick covers the edit.
  const undoes = Boolean(state.done[step.id]) && step.status === "attested";
  const shown = JSON.stringify([
    step.links,
    step.check,
    step.confirm?.label,
    step.manual,
    undoes,
    step.footnote,
    step.deploy,
  ]);
  if (footShown.get(step.id) === shown) return;
  footShown.set(step.id, shown);

  const foot: HTMLElement[] = [];
  if (step.links.length) {
    foot.push(
      linksRow(
        ...step.links.map((l) =>
          l.bare ? bareLink(l) : linkBtn(l.label, l.dim ? null : l.href),
        ),
      ),
    );
  }
  if (step.check) {
    const button = document.createElement("button");
    button.textContent = "Done";
    button.addEventListener("click", () => {
      button.disabled = true;
      button.textContent = "Checking…";
      // The poll's render rebuilds this card if the verdict changes it.
      asked = true;
      void poll().finally(() => {
        button.disabled = false;
        button.textContent = "Done";
      });
    });
    foot.push(button);
  }
  if (step.confirm) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = step.confirm.label;
    button.addEventListener("click", () => pressConfirm(step.id));
    foot.push(button);
  }
  if (step.manual) {
    const button = document.createElement("button");
    button.textContent = undoes ? "Mark not done" : "Mark done";
    button.addEventListener("click", () => {
      if (undoes) delete state.done[step.id];
      else state.done[step.id] = Date.now();
      save(state);
      render();
    });
    foot.push(button);
  }
  if (step.footnote) {
    const p = document.createElement("p");
    p.textContent = step.footnote;
    foot.push(p);
  }
  if (step.deploy) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Deploy";
    let error: HTMLParagraphElement | null = null;
    button.addEventListener("click", () => {
      button.disabled = true;
      button.textContent = "Starting…";
      error?.remove();
      const { owner, repo } = state.inputs;
      // Stays disabled once started: the run takes a moment to show, and
      // its appearance rebuilds this foot without the button.
      void getRepo(owner, repo, pat)
        .then((info) => startDeploy(owner, repo, pat, info.default_branch))
        .then(
          () => {
            button.textContent = "Started";
            void poll();
          },
          (e: unknown) => {
            error = document.createElement("p");
            error.className = "err";
            error.textContent = e instanceof Error ? e.message : String(e);
            button.after(error);
            button.disabled = false;
            button.textContent = "Deploy";
          },
        );
    });
    foot.push(button);
  }
  li.querySelector(".dynfoot")!.replaceChildren(...foot);
}

// Done confirms the card's values when they all hold, and otherwise puts
// the cursor on the first that does not. Reconfigure on a stored card
// nobody has changed has nothing to confirm: it only puts the cursor in
// the card. The card is asked afresh at the press: an edit made on the
// way to the button changes the answer without rebuilding the button.
function pressConfirm(stepId: string): void {
  const fields = deriveForm(MANIFEST, state.form, secrets);
  const confirm = deriveSteps(state, probes, groupStatuses(fields)).find((s) => s.id === stepId)?.confirm;
  if (!confirm) return;
  const bad = fields.find((f) => f.visible && f.entry.group === confirm.group && !f.valid);
  if (bad || !confirm.commits) {
    const target = bad
      ? document.getElementById(`f-${bad.entry.name}`)
      : document.getElementById(`cfg-${stepId}`)?.querySelector<HTMLElement>("input, select, textarea");
    target?.focus();
    return;
  }
  (state.confirmed ??= {})[confirm.group] = Date.now();
  save(state);
  acked = stepId;
  ackFresh = true;
  render();
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
// input mid-poll must not wait for the next tick. GitHub hears only the
// journey's open questions: at once on the first look and on the
// practitioner's presses (`asked`), otherwise paced to last the hour.
let polling = false;
let queued = false;
let asked = true;
let lastRound = 0;
async function poll(): Promise<void> {
  if (polling) {
    queued = true;
    return;
  }
  polling = true;
  do {
    queued = false;
    const { owner, repo, workerUrl, senderDomain } = state.inputs;
    const jobs: Promise<void>[] = [];
    const ask = asked;
    asked = false;
    const questions = githubQuestions(state, probes, ask);
    const now = Date.now();
    if (questions.length && (ask || githubPaced(cache, questions.length, lastRound, now))) {
      lastRound = now;
      if (questions.includes("fork")) {
        jobs.push(probeFork(owner, repo, cache).then((r) => void (probes.fork = r)));
      }
      if (questions.includes("record")) {
        jobs.push(probeRecord(owner, repo, cache).then((r) => void (probes.record = r)));
      }
      if (questions.includes("run")) {
        jobs.push(probeRun(owner, repo, cache).then((r) => void (probes.run = r)));
      }
      if (questions.includes("deployment")) {
        jobs.push(probeDeployment(owner, repo, cache).then((r) => void (probes.deployment = r)));
      }
    }
    // The Worker's address waits in the deploy's own note on the page, at
    // the address the Pages deployment reports — read again once a later
    // deploy publishes elsewhere.
    const published = publishedAt(probes.run, probes.deployment);
    if (published && published !== state.inputs.pageUrl) {
      jobs.push(
        probeDeployInfo(published).then((info) => {
          if (!info) return;
          const pageUrl = `${info.page_origin}${info.base_path}/`;
          if (info.worker_url === workerUrl && pageUrl === state.inputs.pageUrl) return;
          state.inputs.workerUrl = info.worker_url;
          state.inputs.pageUrl = pageUrl;
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
    // An answer that opens a question of its own — a run just turned
    // green leaves its page's address in its Pages deployment — is
    // followed up at once, as after a press.
    if (githubQuestions(state, probes).some((q) => !questions.includes(q))) {
      asked = true;
      queued = true;
    }
    renderEmail();
    renderSteps();
  } while (queued);
  polling = false;
}

{
  const field = input("owner");
  field.value = state.inputs.owner;
  field.addEventListener("change", () => commitOwner(field.value.trim()));
}
{
  const field = input("repo");
  field.value = state.inputs.repo;
  field.addEventListener("change", () => {
    state.inputs.repo = field.value.trim();
    // A changed target invalidates what was probed — and discovered —
    // for the old one.
    state.inputs.workerUrl = "";
    state.inputs.pageUrl = "";
    delete probes.fork;
    delete probes.run;
    delete probes.record;
    delete probes.deployment;
    delete probes.health;
    delete probes.dns;
    save(state);
    render();
    asked = true;
    void poll();
  });
}

for (const form of document.querySelectorAll("form.cfg")) {
  form.addEventListener("submit", (e) => e.preventDefault());
}

// A visit running on remembered state says so, with the memory's age,
// and offers the clean break — the cure for state gone strange (an old
// test run, another journey's leftovers).
if (resumedFrom) {
  const note = document.getElementById("resume")!;
  note.hidden = false;
  note.textContent = `Resuming your visit from ${new Date(resumedFrom).toLocaleDateString(
    undefined,
    { day: "numeric", month: "short" },
  )}.`;
  const resetBtn = document.getElementById("reset") as HTMLButtonElement;
  resetBtn.hidden = false;
  resetBtn.addEventListener("click", () => {
    if (
      confirm(
        "Forget everything this browser remembers about this setup — ticks, " +
          "form values, discovered addresses — and start afresh? Whatever was " +
          "already written to your fork stays there.",
      )
    ) {
      reset();
      location.reload();
    }
  });
}

const refresh = document.getElementById("refresh") as HTMLButtonElement;
refresh.addEventListener("click", () => {
  refresh.disabled = true;
  refresh.textContent = "Checking…";
  asked = true;
  void poll().finally(() => {
    refresh.disabled = false;
    refresh.textContent = "Check again";
  });
});

render();
void poll();
setInterval(() => void poll(), POLL_MS);
