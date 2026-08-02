import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import handler from "../src/index";

const worker = exports.default;

describe("routing", () => {
  it("rejects a window that is not UTC ISO 8601", async () => {
    const response = await worker.fetch(
      new Request("https://api.test/v1/slots?window_start=2026-09-01&window_end=2026-09-02"),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("Content-Type")).toBe("application/problem+json");
  });

  it("rejects the wrong method on a known route", async () => {
    const response = await worker.fetch(
      new Request("https://api.test/v1/slots", { method: "POST" }),
    );

    expect(response.status).toBe(405);
  });

  it("404s an unknown route", async () => {
    const response = await worker.fetch(new Request("https://api.test/v1/calendars"));

    expect(response.status).toBe(404);
  });
});

describe("CORS", () => {
  it("answers a preflight from an allowed origin", async () => {
    const response = await worker.fetch(new Request("https://api.test/v1/slots", {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:5173" },
    }));

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
  });

  it("withholds the origin header from an origin that is not allowed", async () => {
    const response = await worker.fetch(new Request("https://api.test/v1/slots", {
      method: "OPTIONS",
      headers: { Origin: "https://evil.test" },
    }));

    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});

// The handler is called directly rather than through the entrypoint, so that
// the configuration can be varied.
describe("configuration", () => {
  const request = () => new Request("https://api.test/v1/slots", {
    method: "OPTIONS",
    headers: { Origin: "http://localhost:5173" },
  });

  // The allowed origins are configuration themselves, so a misconfigured
  // Worker cannot answer with CORS headers — but it must still say so in the
  // documented error shape rather than crashing.
  it("reports missing ALLOWED_ORIGINS rather than failing to build CORS headers", async () => {
    const response = await handler.fetch(request(), { ...env, ALLOWED_ORIGINS: "" });

    expect(response.status).toBe(500);
    expect(response.headers.get("Content-Type")).toBe("application/problem+json");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("reports a setting that is not a positive number", async () => {
    const response = await handler.fetch(request(), { ...env, SLOT_MINUTES: "half an hour" });

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ title: "Internal Server Error" });
  });
});
