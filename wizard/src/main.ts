import type { GithubCache } from "./probes";
import { probeDns, probeFork, probeHealth, probeRun } from "./probes";
import type { ProbeState, StepView } from "./steps";
import { allGreen, deriveSteps } from "./steps";
import { load, save } from "./state";

const POLL_MS = 20_000;
const BADGE = { open: "○", watch: "◌", green: "✓", red: "✗" } as const;

const state = load();
const probes: ProbeState = {};
const cache: GithubCache = {};

function input(id: string): HTMLInputElement {
  return document.getElementById(id) as HTMLInputElement;
}

function render(): void {
  const steps = deriveSteps(state, probes);
  const list = document.getElementById("steps")!;
  list.replaceChildren(...steps.map(renderStep));
  (document.getElementById("alldone") as HTMLElement).hidden = !allGreen(steps);
}

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

let polling = false;
async function poll(): Promise<void> {
  if (polling) return;
  polling = true;
  const { owner, repo, workerUrl, senderDomain } = state.inputs;
  const jobs: Promise<void>[] = [];
  if (owner && repo) {
    jobs.push(probeFork(owner, repo, cache).then((r) => void (probes.fork = r)));
    jobs.push(probeRun(owner, repo, cache).then((r) => void (probes.run = r)));
  }
  if (workerUrl) {
    jobs.push(probeHealth(workerUrl).then((r) => void (probes.health = r)));
  }
  if (senderDomain) {
    jobs.push(probeDns(senderDomain).then((r) => void (probes.dns = r)));
  }
  await Promise.all(jobs);
  polling = false;
  render();
}

for (const [id, key] of [
  ["owner", "owner"],
  ["repo", "repo"],
  ["worker", "workerUrl"],
  ["domain", "senderDomain"],
] as const) {
  const field = input(id);
  field.value = state.inputs[key];
  field.addEventListener("change", () => {
    state.inputs[key] = field.value.trim();
    // A changed target invalidates what was probed for the old one.
    delete probes.fork;
    delete probes.run;
    delete probes.health;
    delete probes.dns;
    save(state);
    render();
    void poll();
  });
}

document.getElementById("refresh")!.addEventListener("click", () => void poll());

render();
void poll();
setInterval(() => void poll(), POLL_MS);
