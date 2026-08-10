import { describe, expect, it } from "vitest";
import type { ProbeState } from "../src/steps";
import { allGreen, deriveSteps } from "../src/steps";
import type { Saved } from "../src/state";

function saved(overrides: Partial<Saved["inputs"]> = {}, done: Record<string, boolean> = {}): Saved {
  return {
    inputs: {
      owner: "alice",
      repo: "openslots-caldav-appointments",
      workerUrl: "https://w.example",
      senderDomain: "p.fi",
      ...overrides,
    },
    done,
  };
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
  it("is open without a URL and watches an unreachable Worker", () => {
    expect(step("health", saved({ workerUrl: "" })).status).toBe("open");
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

describe("dns", () => {
  it("is open without a domain — email off is a valid setup", () => {
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
