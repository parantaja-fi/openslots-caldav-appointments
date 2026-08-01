import {
  calculateJwkThumbprint,
  EmbeddedJWK,
  importJWK,
  jwtVerify,
  SignJWT,
  type JWK,
} from "jose";
import type { Env } from "./config";

const ALG = "ES256";
const CREATE = "booking/create";
const DELETE = "booking/delete";
const PROOF_TYP = "booking-proof+jwt";

/** A rejected capability, carrying the status the client should be told. */
export class GrantError extends Error {
  constructor(public readonly status: 401 | 403, message: string) {
    super(message);
    this.name = "GrantError";
  }
}

interface Keys {
  sign: CryptoKey;
  verify: CryptoKey;
}

let cached: Keys | null = null;

async function keys(env: Env): Promise<Keys> {
  if (cached) return cached;
  const jwk = JSON.parse(env.SIGNING_KEY_JWK) as JWK;
  const { d: _private, ...publicJwk } = jwk;
  cached = {
    sign: await importJWK(jwk, ALG) as CryptoKey,
    verify: await importJWK(publicJwk, ALG) as CryptoKey,
  };
  return cached;
}

function sign(env: Env, claims: Record<string, unknown>, audience: string | undefined, expiry: number) {
  const jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(expiry);
  if (audience) jwt.setAudience(audience);
  return keys(env).then(k => jwt.sign(k.sign));
}

/**
 * One grant for the whole slot list (`ARCHITECTURE.md` §5). Possession
 * proves those slots were open when listed, so the booking path never
 * re-checks OPEN events.
 */
export async function issueCreateGrant(
  env: Env,
  thumbprint: string,
  slots: string[],
): Promise<string> {
  const ttl = Number(env.GRANT_TTL_SECS);
  return sign(env, { cap: CREATE, slots }, thumbprint, Math.floor(Date.now() / 1000) + ttl);
}

export async function verifyCreateGrant(
  env: Env,
  token: string,
  slotStart: string,
  thumbprint: string,
): Promise<void> {
  const { verify } = await keys(env);
  let claims;
  try {
    ({ payload: claims } = await jwtVerify(token, verify, {
      algorithms: [ALG],
      audience: thumbprint,
    }));
  } catch (e) {
    throw new GrantError(401, `Create-grant rejected: ${(e as Error).message}`);
  }
  if (claims.cap !== CREATE) throw new GrantError(403, "Not a create-grant.");
  if (!Array.isArray(claims.slots) || !claims.slots.includes(slotStart)) {
    throw new GrantError(403, "The grant does not cover this slot.");
  }
}

/**
 * Bearer, not session-bound: it travels in the confirmation email, and
 * possession of the email is the authority. Expires at slot start.
 */
export async function issueCancellationToken(
  env: Env,
  uid: string,
  slotStart: string,
): Promise<string> {
  return sign(env, { cap: DELETE, sub: uid }, undefined, Math.floor(Date.parse(slotStart) / 1000));
}

/** Returns the booking uid the token names. */
export async function verifyCancellationToken(env: Env, token: string): Promise<string> {
  const { verify } = await keys(env);
  let claims;
  try {
    ({ payload: claims } = await jwtVerify(token, verify, { algorithms: [ALG] }));
  } catch (e) {
    throw new GrantError(401, `Cancellation token rejected: ${(e as Error).message}`);
  }
  if (claims.cap !== DELETE) throw new GrantError(403, "Not a cancellation token.");
  if (typeof claims.sub !== "string") throw new GrantError(403, "The token names no booking.");
  return claims.sub;
}

/**
 * Verifies that the caller holds the session key, and returns its JWK
 * thumbprint for comparison against the grant's audience. The public key
 * travels in the proof's own header, so the Worker stores no session state.
 */
export async function verifySessionProof(env: Env, proof: string): Promise<string> {
  let header;
  try {
    ({ protectedHeader: header } = await jwtVerify(proof, EmbeddedJWK, {
      algorithms: [ALG],
      typ: PROOF_TYP,
      maxTokenAge: `${Number(env.PROOF_MAX_AGE_SECS)}s`,
    }));
  } catch (e) {
    throw new GrantError(401, `Session proof rejected: ${(e as Error).message}`);
  }
  return calculateJwkThumbprint(header.jwk as JWK);
}
