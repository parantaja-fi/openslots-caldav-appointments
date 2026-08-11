import { describe, expect, it } from "vitest";
import type { ProbeState } from "../src/steps";
import { allGreen, derivePhases, deriveSteps } from "../src/steps";
import type { Saved } from "../src/state";

function saved(overrides: Partial<Saved["inputs"]> = {}, done: Record<string, boolean> = {}): Saved {
  return {
    inputs: {
      owner: "alice",
      repo: "openslots-caldav-appointments",
      workerUrl: "https://w.example",
      pageUrl: "https://alice.github.io/openslots-caldav-appointments/",
      senderDomain: "p.fi",
      ...overrides,
    },
    form: { provider: "nextcloud", sameCalendar: true, emailOn: true, values: {} },
    done,
    brevo: null,
  };
}

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
  it("stay open until ticked, then are green", () => {
    expect(step("accounts", saved()).status).toBe("open");
    expect(step("accounts", saved({}, { accounts: true })).status).toBe("green");
  });
});

describe("fork", () => {
  it("is open without a username, watches with one, greens on the probe", () => {
    expect(step("fork", saved({ owner: "" })).status).toBe("open");
    expect(step("fork", saved()).status).toBe("watch");
    expect(step("fork", saved(), { fork: true }).status).toBe("green");
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
});

describe("health", () => {
  it("waits for the deploy to publish the Worker's address", () => {
    expect(step("health", saved({ owner: "", workerUrl: "" })).status).toBe("open");
    expect(step("health", saved({ workerUrl: "" })).status).toBe("watch");
    expect(step("health", saved(), { health: { state: "unreachable" } }).status).toBe("watch");
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

describe("secrets step", () => {
  it("points at the form until it is complete, then at the review list", () => {
    const before = deriveSteps(saved(), {}).find((x) => x.id === "secrets")!;
    expect(before.body.join("\n")).toContain("Fill in the configuration form");
    const after = deriveSteps(saved(), {}, true).find((x) => x.id === "secrets")!;
    expect(after.body.join("\n")).toContain("review list");
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
      step("dns", saved(), { dns: { dkim: true, code: true, dmarc: false } }).status,
    ).toBe("watch");
    expect(
      step("dns", saved(), { dns: { dkim: true, code: true, dmarc: true } }).status,
    ).toBe("green");
  });

  it("demands Brevo's verdict too once the domain is registered there", () => {
    const doh = { dns: { dkim: true, code: true, dmarc: true } };
    const waiting = step("dns", withBrevo(saved(), false), doh);
    expect(waiting.status).toBe("watch");
    expect(waiting.body.join("\n")).toContain("1 of 2 records confirmed");
    const done = step("dns", withBrevo(saved(), true), doh);
    expect(done.status).toBe("green");
    expect(done.body.join("\n")).toContain("domain authenticated");
  });

  it("ignores a Brevo registration for a domain the form no longer names", () => {
    const doh = { dns: { dkim: true, code: true, dmarc: true } };
    expect(step("dns", withBrevo(saved(), false, "old.example"), doh).status).toBe("green");
  });
});

describe("phases", () => {
  it("greens finished phases and points at the first unfinished one", () => {
    const phases = derivePhases(deriveSteps(saved({}, { accounts: true }), { fork: true }));
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
    const done = { accounts: true, secrets: true, pages: true };
    const phases = derivePhases(
      deriveSteps(saved({}, done), { fork: true, run: { state: "running", url: "u" } }),
    );
    expect(phases.find((p) => p.label === "Deploy")?.status).toBe("current");
  });

  it("is green throughout exactly when the checklist is", () => {
    const done = { accounts: true, secrets: true, pages: true, smoke: true };
    const probes: ProbeState = {
      fork: true,
      run: { state: "success", url: "u" },
      health: { state: "answered", body: { ok: true, config: { ok: true } } },
      dns: { dkim: true, code: true, dmarc: true },
    };
    const phases = derivePhases(deriveSteps(saved({}, done), probes));
    expect(phases.every((p) => p.status === "green")).toBe(true);
  });
});

describe("allGreen", () => {
  it("holds exactly when every step is green", () => {
    const done = { accounts: true, secrets: true, pages: true, smoke: true };
    const probes: ProbeState = {
      fork: true,
      run: { state: "success", url: "u" },
      health: { state: "answered", body: { ok: true, config: { ok: true } } },
      dns: { dkim: true, code: true, dmarc: true },
    };
    expect(allGreen(deriveSteps(saved({}, done), probes))).toBe(true);
    expect(allGreen(deriveSteps(saved({}, { ...done, smoke: false }), probes))).toBe(false);
  });
});
