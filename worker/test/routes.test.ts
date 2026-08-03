import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { Env } from "../src/config";
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

  // Validation happens before the capability checks, so no backend is needed.
  it.each([undefined, "", "alice@", "not an address"])(
    "rejects a booking whose attendee email is %o", async email => {
      const response = await worker.fetch(new Request("https://api.test/v1/bookings", {
        method: "POST",
        body: JSON.stringify({
          slot_start: new Date(Date.now() + 86_400_000).toISOString(),
          attendee: { name: "Alice", email },
        }),
      }));

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ detail: expect.stringContaining("email") });
    },
  );

  it("allows only GET and DELETE on a single booking", async () => {
    const response = await worker.fetch(
      new Request("https://api.test/v1/bookings/booking-1", { method: "PUT" }),
    );

    expect(response.status).toBe(405);
  });

  it("refuses to show a booking without a cancellation token", async () => {
    const response = await worker.fetch(new Request("https://api.test/v1/bookings/booking-1"));

    expect(response.status).toBe(401);
  });

  it("404s an unknown route", async () => {
    const response = await worker.fetch(new Request("https://api.test/v1/calendars"));

    expect(response.status).toBe(404);
  });

  it("treats a uid with a malformed percent escape as a uid, not a crash", async () => {
    const response = await worker.fetch(
      new Request("https://api.test/v1/bookings/%E0%A4%A", { method: "DELETE" }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("Content-Type")).toBe("application/problem+json");
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
describe("rate limiting", () => {
  const window_ = `window_start=${new Date(Date.now() + 86_400_000).toISOString()}` +
    `&window_end=${new Date(Date.now() + 172_800_000).toISOString()}`;
  const limited = (limit: RateLimit["limit"]): Env => ({ ...env, BOOKING_RL: { limit } });

  // The unit project has no calendar backend, so a request that got as far as
  // the router would answer 502: 429 is proof it was turned away before that.
  it("turns a request away before the calendar backend, session or not", async () => {
    const response = await handler.fetch(
      new Request(`https://api.test/v1/slots?${window_}`),
      limited(() => Promise.resolve({ success: false })),
    );

    expect(response.status).toBe(429);
  });

  it("answers a failing limiter in the documented shape, with CORS headers", async () => {
    const response = await handler.fetch(
      new Request(`https://api.test/v1/slots?${window_}`, {
        headers: { Origin: "http://localhost:5173" },
      }),
      limited(() => Promise.reject(new Error("rate limiter unavailable"))),
    );

    expect(response.status).toBe(500);
    expect(response.headers.get("Content-Type")).toBe("application/problem+json");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
  });
});

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
