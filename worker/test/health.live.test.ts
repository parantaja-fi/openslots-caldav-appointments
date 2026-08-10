import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import handler from "../src/index";

describe("health, live", () => {
  it("reports a healthy deployment", async () => {
    // The suite blanks BREVO_API_KEY so no test can send mail; clearing the
    // sender too makes the transport deliberately off rather than forgotten.
    const response = await handler.fetch(
      new Request("https://api.test/v1/health"),
      { ...env, SENDER_EMAIL: "" },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      config: { ok: true },
      calendars: { availability: { ok: true }, appointments: { ok: true } },
      email: "off",
    });
  });

  it("fails health when the sender is set but the key secret is not", async () => {
    // Ambient suite state: SENDER_EMAIL from the vars, the key blanked —
    // exactly the forgot-the-secret shape M5.2's CI probe must catch.
    const response = await handler.fetch(new Request("https://api.test/v1/health"), env);

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, email: "missing_key" });
  });
});
