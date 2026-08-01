import { env } from "cloudflare:workers";
import { importJWK, SignJWT, type JWK } from "jose";
import { describe, expect, it } from "vitest";
import {
  GrantError,
  issueCancellationToken,
  issueCreateGrant,
  verifyCancellationToken,
  verifyCreateGrant,
  verifySessionProof,
} from "../src/grants";
import { newSession } from "./session";

const SLOT = "2026-09-01T09:00:00.000Z";
const OTHER_SLOT = "2026-09-01T09:30:00.000Z";

async function rejection(promise: Promise<unknown>): Promise<GrantError> {
  const error = await promise.then(() => null, (e: unknown) => e);
  expect(error).toBeInstanceOf(GrantError);
  return error as GrantError;
}

describe("create-grant", () => {
  it("accepts a slot it enumerates, for the session it is bound to", async () => {
    const session = await newSession();
    const grant = await issueCreateGrant(env, session.thumbprint, [SLOT, OTHER_SLOT]);

    await expect(verifyCreateGrant(env, grant, OTHER_SLOT, session.thumbprint)).resolves
      .toBeUndefined();
  });

  it("refuses a slot it does not enumerate", async () => {
    const session = await newSession();
    const grant = await issueCreateGrant(env, session.thumbprint, [SLOT]);

    expect((await rejection(verifyCreateGrant(env, grant, OTHER_SLOT, session.thumbprint))).status)
      .toBe(403);
  });

  it("refuses a different session's thumbprint", async () => {
    const session = await newSession();
    const other = await newSession();
    const grant = await issueCreateGrant(env, session.thumbprint, [SLOT]);

    expect((await rejection(verifyCreateGrant(env, grant, SLOT, other.thumbprint))).status).toBe(401);
  });

  it("refuses a tampered payload", async () => {
    const session = await newSession();
    const grant = await issueCreateGrant(env, session.thumbprint, [SLOT]);
    const [header, , signature] = grant.split(".");
    const forged = btoa(JSON.stringify({ cap: "booking/create", slots: [OTHER_SLOT] }))
      .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

    await rejection(verifyCreateGrant(env, `${header}.${forged}.${signature}`, OTHER_SLOT, session.thumbprint));
  });

  it("refuses a cancellation token in its place", async () => {
    const session = await newSession();
    const token = await issueCancellationToken(env, "uid-1", SLOT);

    await rejection(verifyCreateGrant(env, token, SLOT, session.thumbprint));
  });

  it("refuses an expired grant", async () => {
    const session = await newSession();
    // Signed by hand rather than with a fake clock: GRANT_TTL_SECS is half an
    // hour, and issueCreateGrant has no way to backdate.
    const key = await importJWK(JSON.parse(env.SIGNING_KEY_JWK) as JWK, "ES256") as CryptoKey;
    const expired = await new SignJWT({ cap: "booking/create", slots: [SLOT] })
      .setProtectedHeader({ alg: "ES256" })
      .setAudience(session.thumbprint)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(key);

    expect((await rejection(verifyCreateGrant(env, expired, SLOT, session.thumbprint))).status)
      .toBe(401);
  });
});

describe("cancellation token", () => {
  it("names the booking it was issued for", async () => {
    const future = new Date(Date.now() + 3600_000).toISOString();
    const token = await issueCancellationToken(env, "uid-1", future);

    await expect(verifyCancellationToken(env, token)).resolves.toBe("uid-1");
  });

  it("expires at slot start", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const token = await issueCancellationToken(env, "uid-1", past);

    expect((await rejection(verifyCancellationToken(env, token))).status).toBe(401);
  });

  it("refuses a create-grant in its place", async () => {
    const session = await newSession();
    const grant = await issueCreateGrant(env, session.thumbprint, [SLOT]);

    expect((await rejection(verifyCancellationToken(env, grant))).status).toBe(403);
  });
});

describe("session proof", () => {
  it("returns the thumbprint of the key that signed it", async () => {
    const session = await newSession();

    await expect(verifySessionProof(env, await session.proof())).resolves.toBe(session.thumbprint);
  });

  it("refuses a stale proof", async () => {
    const session = await newSession();
    const stale = await session.proof(Number(env.PROOF_MAX_AGE_SECS) + 60);

    expect((await rejection(verifySessionProof(env, stale))).status).toBe(401);
  });

  it("refuses a create-grant in its place", async () => {
    const session = await newSession();
    const grant = await issueCreateGrant(env, session.thumbprint, [SLOT]);

    await rejection(verifySessionProof(env, grant));
  });
});
