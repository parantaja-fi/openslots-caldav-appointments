// The manifest is the single declared source of what a fork must be
// given; deploy.yml is what actually consumes it. These tests fail the
// moment the two name different sets — a rename crosses the wire.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MANIFEST } from "../src/manifest";
import { VALIDATORS } from "../src/validators";

const deployYml = readFileSync(
  new URL("../../.github/workflows/deploy.yml", import.meta.url),
  "utf8",
);

function referenced(kind: "secrets" | "vars"): Set<string> {
  const names = new Set<string>();
  for (const m of deployYml.matchAll(new RegExp(`\\b${kind}\\.([A-Z_]+)`, "g"))) {
    names.add(m[1]!);
  }
  return names;
}

function declared(kind: "secret" | "variable"): Set<string> {
  return new Set(MANIFEST.filter((e) => e.kind === kind).map((e) => e.name));
}

describe("manifest ⇄ deploy.yml", () => {
  it("names exactly the secrets the workflow consumes", () => {
    expect(declared("secret")).toEqual(referenced("secrets"));
  });

  it("names exactly the variables the workflow consumes", () => {
    expect(declared("variable")).toEqual(referenced("vars"));
  });
});

describe("manifest integrity", () => {
  it("has unique names and known kinds, groups and validators", () => {
    const names = MANIFEST.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
    for (const e of MANIFEST) {
      expect(["secret", "variable"]).toContain(e.kind);
      expect(["calendars", "cloudflare", "email", "shape"]).toContain(e.group);
      expect(VALIDATORS[e.validate], `${e.name} names an unknown validator`).toBeDefined();
      expect(e.label).toBeTruthy();
      expect(e.help).toBeTruthy();
    }
  });

  it("gives defaults only to variables, each passing its own validator", () => {
    for (const e of MANIFEST.filter((e) => e.default !== undefined)) {
      expect(e.kind).toBe("variable");
      expect(VALIDATORS[e.validate]!(e.default!)).toEqual({ ok: true, value: e.default });
    }
  });
});
