import { describe, expect, it } from "vitest";
import type { FormGroups } from "../src/form";
import type { ProbeState } from "../src/steps";
import { allGreen, derivePhases, deriveSteps } from "../src/steps";
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

const FORK: ProbeState["fork"] = { state: "present" };
const STORED: ProbeState["record"] = { state: "present", storedAt: TICK };

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
  });

  it("name the tick's moment in the body", () => {
    const ticked = step("pages", saved({}, { pages: TICK }));
    expect(ticked.status).toBe("attested");
    expect(ticked.body.join("\n")).toContain("Marked done:");
  });

  it("carry a dateless attestation for ticks predating the timestamps", () => {
    const ticked = step("pages", saved({}, { pages: 1 }));
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
    expect(step("deploy", saved(), { run: { state: "running", url: "u" } }).status).toBe("watch");
    expect(step("deploy", saved(), { run: { state: "failure", url: "u" } }).status).toBe("red");
    expect(step("deploy", saved(), { run: { state: "success", url: "u" } }).status).toBe("green");
  });

  it("links the run once one exists", () => {
    const links = step("deploy", saved(), { run: { state: "failure", url: "u" } }).links;
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
  it("follow their group verdicts", () => {
    const groups: FormGroups = { calendars: "green", cloudflare: "red", email: "open", shape: "open" };
    const byId = new Map(deriveSteps(saved(), {}, groups).map((x) => [x.id, x.status]));
    expect(byId.get("calendars")).toBe("green");
    expect(byId.get("cloudflare")).toBe("red");
    expect(byId.get("emailcfg")).toBe("open");
    expect(byId.get("shape")).toBe("open");
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

  it("let data in the tab speak over the attestation", () => {
    const groups: FormGroups = { ...allGroups("open"), calendars: "green" };
    const s = deriveSteps(saved({}, { secrets: TICK }), {}, groups);
    expect(s.find((x) => x.id === "calendars")!.status).toBe("green");
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
  it("greys the guessed page address until the deploy reveals the real one", () => {
    const dimmed = step("pages", saved({ pageUrl: "" })).links.find((l) => l.bare);
    expect(dimmed?.dim).toBe(true);
    expect(dimmed?.href).toBe("https://alice.github.io/openslots-caldav-appointments/");
    const live = step("pages", saved()).links.find((l) => l.bare);
    expect(live?.dim).toBeFalsy();
    expect(live?.href).toBe("https://alice.github.io/openslots-caldav-appointments/");
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
    const done = { accounts: TICK, secrets: TICK, pages: TICK };
    const phases = derivePhases(
      deriveSteps(saved({}, done), { fork: FORK, run: { state: "running", url: "u" } }),
    );
    expect(phases.find((p) => p.label === "Deploy")?.status).toBe("current");
  });

  it("is green throughout exactly when the checklist is", () => {
    const done = { accounts: TICK, secrets: TICK, pages: TICK, smoke: TICK };
    const probes: ProbeState = {
      fork: FORK,
      run: { state: "success", url: "u" },
      health: { state: "answered", body: { ok: true, config: { ok: true } } },
      dns: { state: "answered", dkim: true, code: true, dmarc: true },
    };
    const phases = derivePhases(deriveSteps(saved({}, done), probes));
    expect(phases.every((p) => p.status === "green")).toBe(true);
  });
});

describe("allGreen", () => {
  it("holds exactly when every step is settled — attested counts", () => {
    const done = { accounts: TICK, secrets: TICK, pages: TICK, smoke: TICK };
    const probes: ProbeState = {
      fork: FORK,
      run: { state: "success", url: "u" },
      health: { state: "answered", body: { ok: true, config: { ok: true } } },
      dns: { state: "answered", dkim: true, code: true, dmarc: true },
    };
    expect(allGreen(deriveSteps(saved({}, done), probes))).toBe(true);
    const { smoke: _, ...butSmoke } = done;
    expect(allGreen(deriveSteps(saved({}, butSmoke), probes))).toBe(false);
  });
});
