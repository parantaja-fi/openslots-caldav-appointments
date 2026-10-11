import { KeyObject } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { probeCalendar } from "../../src/google/probe";
import type { CalendarProbe, KeyProbe } from "../../src/google/steps";
import { LEVELS, parseGoogleKey } from "../../src/google/steps";
import type { AccessToken } from "../../src/google/token";
import { requestToken } from "../../src/google/token";
import { VALIDATORS } from "../../src/validators";

// Against the spike's Google project and test calendars, as the Worker's
// google.vars names them (vitest.config.ts); one token serves every read.
// No failure prints the key, the token, the account or a calendar ID.

const KEY_FILE = process.env["GOOGLE_SERVICE_ACCOUNT_JSON"] ?? "";
const key = parseGoogleKey(KEY_FILE);

function calendarId(name: string): string {
  const id = VALIDATORS["googleCalendarId"]!(process.env[name] ?? "");
  if (!id.ok) throw new Error(`${name} in google.vars is not a Google calendar address`);
  return id.value;
}

/** A key verdict as a failure may print it. */
const said = (probe: KeyProbe) => (probe.state === "accepted" ? { state: probe.state } : probe);

/** A calendar verdict as a failure may print it. */
function shown(probe: CalendarProbe) {
  if (probe.state === "disabled") return { state: probe.state };
  if (probe.state !== "present") return probe;
  const owner = probe.owner === key?.clientEmail ? "the service account" : "another account";
  return { ...probe, owner };
}

let probe: KeyProbe;
let token: AccessToken | undefined;
beforeAll(async () => {
  ({ probe, token } = await requestToken(KEY_FILE));
}, 60_000);

describe("Google, live", () => {
  it("accepts the profile's key, naming the file's account and project", () => {
    expect(said(probe)).toEqual({ state: "accepted" });
    expect(probe.state === "accepted" && probe.clientEmail === key?.clientEmail, "account").toBe(
      true,
    );
    expect(probe.state === "accepted" && probe.projectId === key?.projectId, "project").toBe(true);
    expect(typeof token?.value, "token").toBe("string");
    expect(token!.expiresAt).toBeGreaterThan(Date.now());
  });

  it("sees availability as another account's calendar, shared to it", async () => {
    const availability = await probeCalendar(token!.value, calendarId("AVAILABILITY_CALENDAR_URL"));
    expect(shown(availability)).toEqual({
      state: "present",
      summary: "booking-calendar",
      timeZone: "Europe/Helsinki",
      accessRole: expect.toBeOneOf(LEVELS),
      owner: "another account",
    });
  });

  it("sees the store as the service account's own", async () => {
    const store = await probeCalendar(token!.value, calendarId("BOOKING_STORE_URL"));
    expect(shown(store)).toEqual({
      state: "present",
      summary: "booking-store-test",
      timeZone: "UTC",
      accessRole: expect.toBeOneOf(LEVELS),
      owner: "the service account",
    });
  });

  it("finds no calendar that does not exist", async () => {
    const unknown = await probeCalendar(token!.value, "does-not-exist@group.calendar.google.com");
    expect(shown(unknown)).toEqual({ state: "absent" });
  });

  it("refuses the account's name with a key Google never issued", async () => {
    const pair = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    );
    const forged = JSON.stringify({
      ...JSON.parse(KEY_FILE),
      private_key: KeyObject.from(pair.privateKey).export({ type: "pkcs8", format: "pem" }),
    });
    expect(said((await requestToken(forged)).probe)).toEqual({
      state: "refused",
      description: "Invalid JWT Signature.",
    });
  });

  it("refuses an assertion two hours old, naming iat and exp", async () => {
    const { probe: late } = await requestToken(KEY_FILE, Date.now() - 2 * 3_600_000);
    expect(said(late)).toEqual({
      state: "refused",
      description: expect.stringMatching(/\biat\b.*\bexp\b/),
    });
  });
});
