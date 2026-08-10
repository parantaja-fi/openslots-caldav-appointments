import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../src/config";
import handler from "../src/index";

// What an empty, healthy calendar answers a REPORT with.
const MULTISTATUS = `<?xml version="1.0"?><multistatus xmlns="DAV:"/>`;

function caldavAnswers(status: number): void {
  vi.stubGlobal("fetch", () => Promise.resolve(new Response(MULTISTATUS, { status })));
}

function caldavUnreachable(): void {
  vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Network connection lost")));
}

function health(overrides: Partial<Env>, init?: RequestInit): Promise<Response> {
  return handler.fetch(new Request("https://api.test/v1/health", init), { ...env, ...overrides });
}

afterEach(() => vi.unstubAllGlobals());

describe("health", () => {
  it("reports a healthy deployment", async () => {
    caldavAnswers(207);
    const response = await health({ SENDER_EMAIL: "" });

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(await response.json()).toEqual({
      ok: true,
      config: { ok: true },
      calendars: { availability: { ok: true }, appointments: { ok: true } },
      email: "off",
    });
  });

  it("reports a configuration failure instead of a bare 500", async () => {
    const response = await health({ SLOT_MINUTES: "0" });

    expect(response.status).toBe(503);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(await response.json()).toEqual({
      ok: false,
      config: { ok: false, error: "SLOT_MINUTES must be a positive number" },
    });
  });

  it("names the role, never the URL, when credentials are missing", async () => {
    const response = await health({ AVAILABILITY_USERNAME: "" });

    const { config } = await response.json() as { config: { error: string } };
    expect(config.error).toContain("availability calendar");
    expect(config.error).not.toContain("http");
  });

  it("passes its own error through, so a 401 is tellable from a wrong URL", async () => {
    caldavAnswers(401);
    const response = await health({ SENDER_EMAIL: "" });

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      ok: false,
      calendars: {
        availability: { ok: false, error: "CalDAV REPORT failed: 401" },
        appointments: { ok: false, error: "CalDAV REPORT failed: 401" },
      },
    });
  });

  it("coarsens a network failure to 'unreachable'", async () => {
    caldavUnreachable();
    const response = await health({});

    expect(await response.json()).toMatchObject({
      calendars: { availability: { ok: false, error: "unreachable" } },
    });
  });

  it.each([
    [{ BREVO_API_KEY: "a-key" }, "configured", 200],
    [{}, "missing_key", 503], // the sender rides in the vars; the suite blanks the key
    [{ SENDER_EMAIL: "" }, "off", 200],
  ])("reports the email transport of %o as %s", async (overrides, state, status) => {
    caldavAnswers(207);
    const response = await health(overrides);

    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ email: state });
  });

  it("allows only GET", async () => {
    const response = await health({}, { method: "POST" });

    expect(response.status).toBe(405);
  });
});
