import { describe, expect, it } from "vitest";
import type { FormGroups } from "../src/form";
import type { ProbeState } from "../src/steps";
import { allGreen, derivePhases, deriveSteps, githubQuestions } from "../src/steps";
import type { Saved } from "../src/state";

const TICK = 1_757_000_000_000; // an arbitrary moment in 2025

function saved(overrides: Partial<Saved["inputs"]> = {}, done: Record<string, number> = {}): Saved {
  return {
    inputs: {
      owner: "alice",
      repo: "openslots-caldav-appointments",
      workerUrl: "https://w.example",
      pageUrl: "https://alice.github.io/openslots-caldav-appointments/",
      senderDomain: "p.fi",
      cfEmail: "",
      ...overrides,
    },
    form: { provider: "nextcloud", providerUrl: "", sameCalendar: true, emailOn: true, values: {} },
    done,
    brevo: null,
  };
}

const FORK: ProbeState["fork"] = { state: "present", pages: false };
const PAGES_ON: ProbeState["fork"] = { state: "present", pages: true };
const STORED: ProbeState["record"] = { state: "present", storedAt: TICK };
const PAGE = "https://alice.github.io/openslots-caldav-appointments/";
const PLAIN = "http://www.example.fi/openslots-caldav-appointments/";
/** A green run after the store, and the Pages deployment it made. */
const RUN: ProbeState["run"] = { state: "success", url: "u", at: TICK + 1 };
const published = (url: string): ProbeState["deployment"] => ({
  state: "present",
  url,
  at: TICK + 2,
});

function withBrevo(s: Saved, authenticated: boolean, domain = "p.fi"): Saved {
  const record = (label: string, status: boolean) => ({
    label,
    type: "CNAME",
    host: `${label}._domainkey`,
    value: "v",
    status,
  });
  return {
    ...s,
    brevo: {
      domain,
      authenticated,
      records: [record("brevo1", true), record("brevo2", authenticated)],
    },
  };
}

function emailOff(s: Saved): Saved {
  return { ...s, form: { ...s.form, emailOn: false } };
}

function step(id: string, s: Saved, probes: ProbeState = {}) {
  const found = deriveSteps(s, probes).find((x) => x.id === id);
  if (!found) throw new Error(`no step ${id}`);
  return found;
}

describe("manual steps", () => {
  it("stay open until ticked, then are attested", () => {
    expect(step("accounts", saved()).status).toBe("open");
    expect(step("accounts", saved({}, { accounts: TICK })).status).toBe("attested");
    expect(step("availability", saved()).status).toBe("open");
    expect(step("availability", saved({}, { availability: TICK })).status).toBe("attested");
  });

  it("name the tick's moment in the body", () => {
    const ticked = step("smoke", saved({}, { smoke: TICK }));
    expect(ticked.status).toBe("attested");
    expect(ticked.body.join("\n")).toContain("Marked done:");
  });

  it("carry a dateless attestation for ticks predating the timestamps", () => {
    const ticked = step("smoke", saved({}, { smoke: 1 }));
    expect(ticked.status).toBe("attested");
    expect(ticked.body.join("\n")).toContain("Marked done.");
  });
});

describe("fork", () => {
  it("is open without a username, watches with one, greens on the probe", () => {
    expect(step("fork", saved({ owner: "" })).status).toBe("open");
    expect(step("fork", saved()).status).toBe("watch");
    expect(step("fork", saved(), { fork: FORK }).status).toBe("green");
  });

  it("stays watching on a proven absence", () => {
    expect(step("fork", saved(), { fork: { state: "absent" } }).status).toBe("watch");
  });

  it("is unknown when the probe is blind, saying why", () => {
    const view = step("fork", saved(), {
      fork: { state: "blind", reason: "GitHub answers sixty… at 08:03." },
    });
    expect(view.status).toBe("unknown");
    expect(view.body.join("\n")).toContain("Not known");
    expect(view.body.join("\n")).toContain("at 08:03");
  });

  it("shows the fork's URL as a plain link and dims the button once proven", () => {
    const links = step("fork", saved(), { fork: FORK }).links;
    const bare = links.find((l) => l.bare);
    expect(bare?.href).toBe("https://github.com/alice/openslots-caldav-appointments");
    expect(links.find((l) => l.label === "Fork it")?.dim).toBe(true);
    expect(step("fork", saved()).links.find((l) => l.label === "Fork it")?.dim).toBeFalsy();
  });

  it("offers the Done check exactly while a named fork is unproven", () => {
    expect(step("fork", saved({ owner: "" })).check).toBe(false);
    expect(step("fork", saved()).check).toBe(true);
    expect(step("fork", saved(), { fork: FORK }).check).toBe(false);
  });
});

describe("deploy", () => {
  it("follows the latest run", () => {
    expect(step("deploy", saved()).status).toBe("watch");
    const after = (state: "running" | "failure" | "success") =>
      step("deploy", saved(), { run: { state, url: "u", at: TICK } }).status;
    expect(step("deploy", saved(), { run: { state: "none" } }).status).toBe("open");
    expect(after("running")).toBe("watch");
    expect(after("failure")).toBe("red");
    expect(after("success")).toBe("green");
  });

  it("offers its Deploy button after a store, while the token is in the tab", () => {
    const deploy = (probes: ProbeState, token: boolean) =>
      deriveSteps(saved(), probes, undefined, token).find((x) => x.id === "deploy")!;
    const ready: ProbeState = { fork: PAGES_ON, record: STORED, run: { state: "none" } };
    expect(deploy(ready, true).deploy).toBe(true);
    const byHand = deploy(ready, false);
    expect(byHand.deploy).toBe(false);
    expect(byHand.body.join("\n")).toContain("Actions tab");
    expect(deploy({ ...ready, record: undefined }, true).deploy).toBe(false);
  });

  it("holds the deploy until Pages is switched on", () => {
    for (const fork of [undefined, FORK]) {
      const probes: ProbeState = { fork, record: STORED, run: { state: "none" } };
      const view = deriveSteps(saved(), probes, undefined, true).find((x) => x.id === "deploy")!;
      expect(view.deploy).toBe(false);
      expect(view.body.join("\n")).not.toContain("Actions tab");
    }
  });

  it("shows the page's real address once the run's Pages deployment is read", () => {
    const page = (probes: ProbeState) => step("deploy", saved(), probes).links.find((l) => l.bare);
    expect(page({ run: RUN, deployment: published(PAGE) })).toMatchObject({ href: PAGE });
    // An earlier run's deployment says nothing about this run's.
    const earlier = { state: "present", url: PAGE, at: TICK } as const;
    expect(page({ run: RUN, deployment: earlier })).toBeUndefined();
    const running = { state: "running", url: "u", at: TICK + 1 } as const;
    expect(page({ run: running, deployment: published(PAGE) })).toBeUndefined();
  });

  it("re-opens when the last run started before the last store", () => {
    const stale = deriveSteps(
      saved(),
      { fork: PAGES_ON, record: STORED, run: { state: "success", url: "u", at: TICK - 1 } },
      undefined,
      true,
    ).find((x) => x.id === "deploy")!;
    expect(stale.status).toBe("open");
    expect(stale.body[0]).toContain("stored after the last deploy");
    expect(stale.deploy).toBe(true);
    const fresh = { state: "success", url: "u", at: TICK + 1 } as const;
    expect(step("deploy", saved(), { record: STORED, run: fresh }).status).toBe("green");
  });

  it("turns red on a plain-HTTP page, pointing at the fork's Pages settings", () => {
    const probes: ProbeState = {
      fork: PAGES_ON,
      record: STORED,
      run: RUN,
      deployment: published(PLAIN),
    };
    const view = deriveSteps(saved(), probes, undefined, true).find((x) => x.id === "deploy")!;
    expect(view.status).toBe("red");
    expect(view.body[0]).toContain(`published your page at ${PLAIN} — plain HTTP`);
    expect(view.body[0]).toContain("“Enforce HTTPS” in your fork's Pages settings");
    expect(view.deploy).toBe(true);
    expect(view.links.map((l) => l.href)).toContain(
      "https://github.com/alice/openslots-caldav-appointments/settings/pages",
    );
    expect(view.links.find((l) => l.bare)).toBeUndefined();
    const secure: ProbeState = { ...probes, deployment: published(PAGE) };
    expect(step("deploy", saved(), secure).status).toBe("green");
  });

  it("links the run once one exists", () => {
    const links = step("deploy", saved(), { run: { state: "failure", url: "u", at: TICK } }).links;
    expect(links.map((l) => l.label)).toContain("The run");
  });

  it("is unknown when the run probe is blind, saying why", () => {
    const view = step("deploy", saved(), { run: { state: "blind", reason: "GitHub is down." } });
    expect(view.status).toBe("unknown");
    expect(view.body.join("\n")).toContain("Not known");
  });
});

describe("health", () => {
  it("waits for the deploy to publish the Worker's address", () => {
    expect(step("health", saved({ owner: "", workerUrl: "" })).status).toBe("open");
    expect(step("health", saved({ workerUrl: "" })).status).toBe("watch");
  });

  it("is unknown, not failing, when a known Worker gives no answer", () => {
    const view = step("health", saved(), { health: { state: "unreachable" } });
    expect(view.status).toBe("unknown");
    expect(view.body.join("\n")).toContain("Not known");
  });

  it("greens on ok and reds on a failing subsystem, naming it", () => {
    expect(
      step("health", saved(), {
        health: { state: "answered", body: { ok: true, config: { ok: true } } },
      }).status,
    ).toBe("green");
    const red = step("health", saved(), {
      health: {
        state: "answered",
        body: {
          ok: false,
          config: { ok: true },
          calendars: {
            availability: { ok: true },
            appointments: { ok: false, error: "CalDAV authentication failed (401)" },
          },
          email: "off",
        },
      },
    });
    expect(red.status).toBe("red");
    expect(red.body.join("\n")).toContain("CalDAV authentication failed (401)");
  });

  it("spells out the forgot-the-key state", () => {
    const view = step("health", saved(), {
      health: {
        state: "answered",
        body: { ok: false, config: { ok: true }, email: "missing_key" },
      },
    });
    expect(view.body.join("\n")).toContain("BREVO_API_KEY missing");
  });
});

const allGroups = (status: FormGroups[keyof FormGroups]): FormGroups => ({
  calendars: status,
  cloudflare: status,
  email: status,
  shape: status,
});

describe("configuration group steps", () => {
  it("follow their group verdicts, green only once confirmed", () => {
    const groups: FormGroups = { calendars: "green", cloudflare: "red", email: "open", shape: "green" };
    const s: Saved = { ...saved(), confirmed: { calendars: TICK } };
    const byId = new Map(deriveSteps(s, {}, groups).map((x) => [x.id, x.status]));
    expect(byId.get("calendars")).toBe("green");
    expect(byId.get("cloudflare")).toBe("red");
    expect(byId.get("emailcfg")).toBe("open");
    expect(byId.get("shape")).toBe("open");
  });

  it("offer Done until pressed, then acknowledge that nothing is stored yet", () => {
    const groups: FormGroups = { ...allGroups("open"), calendars: "green" };
    const before = deriveSteps(saved(), {}, groups).find((x) => x.id === "calendars")!;
    expect(before.confirm).toEqual({ group: "calendars", label: "Done", commits: true });
    expect(before.state).toBeUndefined();
    const s: Saved = { ...saved(), confirmed: { calendars: TICK } };
    const after = deriveSteps(s, {}, groups).find((x) => x.id === "calendars")!;
    expect(after.confirm).toBeUndefined();
    expect(after.state).toMatch(/^Checked .*; not stored yet$/);
  });

  it("ask for a fresh Done after an edit", () => {
    const groups: FormGroups = { ...allGroups("open"), calendars: "green" };
    const s: Saved = { ...saved(), confirmed: { calendars: TICK }, edited: { calendars: TICK + 1 } };
    expect(deriveSteps(s, {}, groups).find((x) => x.id === "calendars")!.status).toBe("open");
  });

  it("turn attested after the store when the tab forgot the secrets", () => {
    const view = step("calendars", saved({}, { secrets: TICK }));
    expect(view.status).toBe("attested");
    expect(view.body.join("\n")).toContain("Marked stored by you");
    expect(view.body.join("\n")).toContain("Use the fields below");
  });

  it("cite the fork's record when the wizard itself stored", () => {
    const view = step("calendars", saved(), { record: STORED });
    expect(view.status).toBe("attested");
    expect(view.body.join("\n")).toContain("Stored into your GitHub fork");
  });

  it("name when the values were configured and when stored, once both happened", () => {
    const groups: FormGroups = { ...allGroups("open"), calendars: "green" };
    const s: Saved = { ...saved(), confirmed: { calendars: TICK - 5 } };
    const view = deriveSteps(s, { record: STORED }, groups).find((x) => x.id === "calendars")!;
    expect(view.status).toBe("green");
    expect(view.body[0]).toMatch(/^Configured .*; stored into your GitHub fork /);
  });

  it("offer Reconfigure once stored, confirming only once something changed", () => {
    const unchanged = step("calendars", saved(), { record: STORED });
    expect(unchanged.confirm).toEqual({ group: "calendars", label: "Reconfigure", commits: false });
    const s: Saved = { ...saved(), edited: { calendars: TICK + 1 } };
    expect(step("calendars", s, { record: STORED }).confirm?.commits).toBe(true);
  });

  it("acknowledge a confirmed change as not yet stored", () => {
    const groups: FormGroups = { ...allGroups("open"), calendars: "green" };
    const s: Saved = { ...saved(), edited: { calendars: TICK + 1 }, confirmed: { calendars: TICK + 2 } };
    const view = deriveSteps(s, { record: STORED }, groups).find((x) => x.id === "calendars")!;
    expect(view.status).toBe("green");
    expect(view.state).toMatch(/^Checked .*; the change is not stored yet$/);
  });

  it("report their state in a few words, leaving the store's moment to the store", () => {
    expect(step("calendars", saved()).state).toBeUndefined();
    expect(step("calendars", saved(), { record: STORED }).state).toBe("Stored");
    expect(step("secrets", saved(), { record: STORED }).state).toMatch(/^Stored \S/);
  });

  it("go red on an invalid value even after the store", () => {
    const groups: FormGroups = { ...allGroups("green"), calendars: "red" };
    const s = deriveSteps(saved({}, { secrets: TICK }), {}, groups);
    expect(s.find((x) => x.id === "calendars")!.status).toBe("red");
  });

  it("re-open, with the store step, when a value changes after the store", () => {
    const s: Saved = { ...saved(), edited: { calendars: TICK + 1 } };
    const views = deriveSteps(s, { record: STORED });
    const card = views.find((x) => x.id === "calendars")!;
    expect(card.status).toBe("open");
    expect(card.body.join("\n")).toContain("Changed since the last store");
    const store = views.find((x) => x.id === "secrets")!;
    expect(store.status).toBe("open");
    expect(store.body.join("\n")).toContain("Your calendars");
    expect(views.find((x) => x.id === "cloudflare")!.status).toBe("attested");
  });

  it("keep edits made before the store attested", () => {
    const s: Saved = { ...saved(), edited: { calendars: TICK - 1 } };
    const views = deriveSteps(s, { record: STORED });
    expect(views.find((x) => x.id === "calendars")!.status).toBe("attested");
    expect(views.find((x) => x.id === "secrets")!.status).toBe("attested");
  });

  it("settle again once a fresh manual tick covers the edit", () => {
    const s: Saved = { ...saved({}, { secrets: TICK + 2 }), edited: { calendars: TICK + 1 } };
    const views = deriveSteps(s, { record: STORED });
    expect(views.find((x) => x.id === "secrets")!.status).toBe("attested");
    expect(views.find((x) => x.id === "secrets")!.body.join("\n")).toContain(
      "Marked stored by you",
    );
  });
});

describe("the write step", () => {
  it("waits for the group steps, then invites the token", () => {
    const before = deriveSteps(saved(), {}).find((x) => x.id === "secrets")!;
    expect(before.status).toBe("open");
    expect(before.body.join("\n")).toContain("Complete the configuration steps");
    const after = deriveSteps(saved(), {}, allGroups("green")).find((x) => x.id === "secrets")!;
    expect(after.body.join("\n")).toContain("review list");
  });

  it("lets the later of record and tick speak, offering no tick button for a record", () => {
    const later: ProbeState["record"] = { state: "present", storedAt: TICK + 1 };
    const recorded = step("secrets", saved({}, { secrets: TICK }), { record: later });
    expect(recorded.status).toBe("attested");
    expect(recorded.body.join("\n")).toContain("Stored into your GitHub fork");
    expect(recorded.manual).toBe(false);
    const ticked = step("secrets", saved({}, { secrets: TICK + 2 }), { record: later });
    expect(ticked.body.join("\n")).toContain("Marked stored by you");
    expect(ticked.manual).toBe(true);
  });

  it("is unknown, saying why, when it cannot see the record and holds no tick", () => {
    const view = step("secrets", saved(), { record: { state: "blind", reason: "GitHub is down." } });
    expect(view.status).toBe("unknown");
    expect(view.body[0]).toContain("GitHub is down.");
  });
});

describe("pages", () => {
  it("is green once the fork reports Pages switched on", () => {
    const view = step("pages", saved(), { fork: PAGES_ON });
    expect(view.status).toBe("green");
    expect(view.body[0]).toContain("deploy below");
    expect(view.check).toBe(false);
  });

  it("asks for the switch, and for HTTPS, while Pages is off", () => {
    const off = step("pages", saved(), { fork: FORK });
    expect(off.status).toBe("open");
    expect(off.check).toBe(true);
    expect(off.body[0]).toContain("Source: GitHub Actions");
    expect(off.body[0]).toContain("“Enforce HTTPS”");
    expect(off.links.map((l) => l.href)).toContain(
      "https://github.com/alice/openslots-caldav-appointments/settings/pages",
    );
  });

  it("is unknown when GitHub cannot be asked, saying why", () => {
    const view = step("pages", saved(), { fork: { state: "blind", reason: "GitHub is down." } });
    expect(view.status).toBe("unknown");
    expect(view.body[0]).toContain("GitHub is down.");
  });
});

describe("githubQuestions", () => {
  it("asks everything once, then nothing settled — nor the deploy's facts before a store", () => {
    expect(githubQuestions(saved({ owner: "" }), {})).toEqual([]);
    expect(githubQuestions(saved(), {})).toEqual(["fork", "record", "run", "deployment"]);
    expect(githubQuestions(saved(), { fork: { state: "absent" } })).toEqual(["fork"]);
    const looked: ProbeState = {
      fork: FORK,
      record: { state: "absent" },
      run: { state: "none" },
      deployment: { state: "none" },
    };
    expect(githubQuestions(saved(), looked)).toEqual([]);
    expect(githubQuestions(saved(), looked, true)).toEqual(["fork", "run"]);
    const blind = { state: "blind", reason: "r" } as const;
    expect(githubQuestions(saved(), { ...looked, record: blind, deployment: blind })).toEqual([
      "record",
      "deployment",
    ]);
  });

  it("watches Pages, then the run, once the configuration is stored", () => {
    const stored: ProbeState = {
      fork: FORK,
      record: STORED,
      run: { state: "none" },
      deployment: { state: "none" },
    };
    expect(githubQuestions(saved(), stored)).toEqual(["fork", "run"]);
    expect(githubQuestions(saved(), { ...stored, fork: PAGES_ON })).toEqual(["run"]);
    const after = (at: number): ProbeState => ({
      ...stored,
      fork: PAGES_ON,
      run: { state: "success", url: "u", at },
      deployment: published(PAGE),
    });
    expect(githubQuestions(saved(), after(TICK + 1))).toEqual([]);
    expect(githubQuestions(saved(), after(TICK - 1))).toEqual(["run"]);
  });

  it("reads a green run's Pages deployment, and watches for a redeploy of a plain-HTTP page", () => {
    const green: ProbeState = { fork: PAGES_ON, record: STORED, run: RUN };
    expect(githubQuestions(saved(), { ...green, deployment: { state: "none" } })).toEqual([
      "deployment",
    ]);
    const earlier = { state: "present", url: PAGE, at: TICK } as const;
    expect(githubQuestions(saved(), { ...green, deployment: earlier })).toEqual(["deployment"]);
    expect(githubQuestions(saved(), { ...green, deployment: published(PLAIN) })).toEqual(["run"]);
  });
});

describe("dns", () => {
  it("is green with nothing to prove when email is off", () => {
    const view = step("dns", emailOff(saved({ senderDomain: "" })));
    expect(view.status).toBe("green");
    expect(view.body.join("\n")).toContain("switched off");
  });

  it("waits for a sender address when email is on but none is valid yet", () => {
    expect(step("dns", saved({ senderDomain: "" })).status).toBe("open");
  });

  it("greens only when all three records are present", () => {
    expect(
      step("dns", saved(), { dns: { state: "answered", dkim: true, code: true, dmarc: false } })
        .status,
    ).toBe("watch");
    expect(
      step("dns", saved(), { dns: { state: "answered", dkim: true, code: true, dmarc: true } })
        .status,
    ).toBe("green");
  });

  it("is unknown when the lookup service is unreachable", () => {
    const view = step("dns", saved(), { dns: { state: "blind" } });
    expect(view.status).toBe("unknown");
    expect(view.body.join("\n")).toContain("Not known");
  });

  it("demands Brevo's verdict too once the domain is registered there", () => {
    const doh: ProbeState = { dns: { state: "answered", dkim: true, code: true, dmarc: true } };
    const waiting = step("dns", withBrevo(saved(), false), doh);
    expect(waiting.status).toBe("watch");
    expect(waiting.body.join("\n")).toContain("1 of 2 records confirmed");
    const done = step("dns", withBrevo(saved(), true), doh);
    expect(done.status).toBe("green");
    expect(done.body.join("\n")).toContain("domain authenticated");
  });

  it("ignores a Brevo registration for a domain the form no longer names", () => {
    const doh: ProbeState = { dns: { state: "answered", dkim: true, code: true, dmarc: true } };
    expect(step("dns", withBrevo(saved(), false, "old.example"), doh).status).toBe("green");
  });
});

describe("availability", () => {
  const withForm = (s: Saved, form: Partial<Saved["form"]>): Saved => ({
    ...s,
    form: { ...s.form, ...form },
  });

  it("teaches OPEN events, and what blocks them in this calendar setup", () => {
    const one = step("availability", saved()).body.join("\n");
    expect(one).toContain("titled exactly OPEN");
    expect(one).toContain("bookings included");
    const two = step("availability", withForm(saved(), { sameCalendar: false })).body.join("\n");
    expect(two).toContain("every event in your booking calendar");
  });

  it("links the calendar app where the wizard knows it — the page is the next step's", () => {
    const hrefs = (s: Saved) => step("availability", s).links.map((l) => l.href);
    const cloud = withForm(saved(), { providerUrl: "https://cloud.example.com" });
    expect(hrefs(cloud)).toEqual(["https://cloud.example.com/apps/calendar/"]);
    expect(hrefs(withForm(saved(), { provider: "google" }))).toEqual([
      "https://calendar.google.com/",
    ]);
    expect(hrefs(withForm(saved(), { provider: "fastmail" }))).toEqual([]);
    expect(hrefs(saved())).toEqual([]); // Nextcloud before its server address is known
  });
});

describe("phases", () => {
  it("greens finished phases and points at the first unfinished one", () => {
    const phases = derivePhases(deriveSteps(saved({}, { accounts: TICK }), { fork: FORK }));
    expect(phases.map((p) => `${p.label}:${p.status}`)).toEqual([
      "Accounts:green",
      "Fork:green",
      "Configure:current",
      "Deploy:todo",
      "Email:todo",
      "Test drive:todo",
    ]);
  });

  it("is current on Deploy while any of its three steps lags", () => {
    const done = { accounts: TICK, secrets: TICK };
    const phases = derivePhases(
      deriveSteps(saved({}, done), {
        fork: PAGES_ON,
        run: { state: "running", url: "u", at: TICK + 1 },
      }),
    );
    expect(phases.find((p) => p.label === "Deploy")?.status).toBe("current");
  });

  it("is green throughout exactly when the checklist is", () => {
    const done = { accounts: TICK, secrets: TICK, availability: TICK, smoke: TICK };
    const probes: ProbeState = {
      fork: PAGES_ON,
      run: { state: "success", url: "u", at: TICK + 1 },
      health: { state: "answered", body: { ok: true, config: { ok: true } } },
      dns: { state: "answered", dkim: true, code: true, dmarc: true },
    };
    const phases = derivePhases(deriveSteps(saved({}, done), probes));
    expect(phases.every((p) => p.status === "green")).toBe(true);
  });
});

describe("allGreen", () => {
  it("holds exactly when every step is settled — attested counts", () => {
    const done = { accounts: TICK, secrets: TICK, availability: TICK, smoke: TICK };
    const probes: ProbeState = {
      fork: PAGES_ON,
      run: { state: "success", url: "u", at: TICK + 1 },
      health: { state: "answered", body: { ok: true, config: { ok: true } } },
      dns: { state: "answered", dkim: true, code: true, dmarc: true },
    };
    expect(allGreen(deriveSteps(saved({}, done), probes))).toBe(true);
    const { smoke: _, ...butSmoke } = done;
    expect(allGreen(deriveSteps(saved({}, butSmoke), probes))).toBe(false);
  });
});

describe("state lines", () => {
  it("stand in for the synopsis once a step has something to report", () => {
    expect(step("accounts", saved()).state).toBeUndefined();
    expect(step("fork", saved(), { fork: FORK }).state).toBe("Found: alice/openslots-caldav-appointments");
    expect(step("pages", saved(), { fork: PAGES_ON }).state).toBe("Switched on");
    const deployed = { fork: PAGES_ON, record: STORED, run: RUN, deployment: published(PAGE) };
    expect(step("deploy", saved(), deployed).state).toBe(`Published at ${PAGE}`);
    expect(step("dns", emailOff(saved())).state).toBe("Email off; nothing to prove");
  });
});
