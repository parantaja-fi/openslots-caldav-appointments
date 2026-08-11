import { describe, expect, it } from "vitest";
import { VALIDATORS } from "../src/validators";

const v = (name: string, raw: string) => VALIDATORS[name]!(raw);

describe("caldavUrl", () => {
  it("accepts http(s) and appends the trailing slash", () => {
    expect(v("caldavUrl", "https://c.example/dav/cal")).toEqual({
      ok: true,
      value: "https://c.example/dav/cal/",
    });
    expect(v("caldavUrl", "http://server:5232/u/cal/").ok).toBe(true);
  });

  it("rejects non-URLs and other schemes", () => {
    expect(v("caldavUrl", "cloud.example/dav").ok).toBe(false);
    expect(v("caldavUrl", "webcal://c.example/x/").ok).toBe(false);
  });
});

describe("email", () => {
  it("accepts an address, rejects the rest", () => {
    expect(v("email", " info@practice.example ").ok).toBe(true);
    expect(v("email", "practice.example").ok).toBe(false);
    expect(v("email", "info@nodot").ok).toBe(false);
  });
});

describe("timezone", () => {
  it("accepts IANA names the runtime knows and nothing else", () => {
    expect(v("timezone", "Europe/Helsinki").ok).toBe(true);
    expect(v("timezone", "Helsinki").ok).toBe(false);
  });
});

describe("posInt", () => {
  it("accepts positive whole numbers only", () => {
    expect(v("posInt", "30").ok).toBe(true);
    expect(v("posInt", "0").ok).toBe(false);
    expect(v("posInt", "-5").ok).toBe(false);
    expect(v("posInt", "12.5").ok).toBe(false);
  });
});

describe("cloudflareAccountId", () => {
  it("wants 32 hex characters, case-insensitively", () => {
    expect(v("cloudflareAccountId", "0123456789ABCDEF0123456789abcdef")).toEqual({
      ok: true,
      value: "0123456789abcdef0123456789abcdef",
    });
    expect(v("cloudflareAccountId", "not-an-id").ok).toBe(false);
  });
});

describe("googleJson", () => {
  it("wants the whole service-account key file", () => {
    const key = JSON.stringify({ client_email: "sa@p.iam", private_key: "---" });
    expect(v("googleJson", key).ok).toBe(true);
    expect(v("googleJson", "{}").ok).toBe(false);
    expect(v("googleJson", "not json").ok).toBe(false);
  });
});

describe("nonEmpty and text", () => {
  it("trim and verdict as named", () => {
    expect(v("nonEmpty", "  x ")).toEqual({ ok: true, value: "x" });
    expect(v("nonEmpty", "   ").ok).toBe(false);
    expect(v("text", "  anything  ")).toEqual({ ok: true, value: "anything" });
  });
});
