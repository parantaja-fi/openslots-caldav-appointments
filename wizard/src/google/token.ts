// The service account's token for the wizard's own look at the
// calendars: the Worker's googleAccessToken (worker/src/auth.ts), copied
// per plan §9 D5 — the read-only scope, no cache, and Google's answer
// kept as 3.5's verdict.

import type { KeyProbe } from "./steps";
import { parseGoogleKey } from "./steps";

/** A calendar.readonly bearer token, for tab memory only. */
export interface AccessToken {
  value: string;
  /** Epoch ms. */
  expiresAt: number;
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function segment(value: unknown): string {
  return base64url(new TextEncoder().encode(JSON.stringify(value)));
}

/** Google's verdict on a key file, with the token when it accepts. The
 * private key is read here alone, and leaves only as a signature. */
export async function requestToken(
  keyFile: string,
  now = Date.now(),
): Promise<{ probe: KeyProbe; token?: AccessToken }> {
  const fields = parseGoogleKey(keyFile);
  if (!fields) return { probe: { state: "unreadable" } };
  const pem = (JSON.parse(keyFile) as { private_key: string }).private_key
    .replace(/-----[A-Z ]+-----/g, "")
    .replace(/\s/g, "");
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "pkcs8",
      Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
  } catch {
    return { probe: { state: "unreadable" } };
  }

  const iat = Math.floor(now / 1000);
  const claims = segment({
    iss: fields.clientEmail,
    scope: "https://www.googleapis.com/auth/calendar.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat,
    exp: iat + 3600,
  });
  const signingInput = `${segment({ alg: "RS256", typ: "JWT" })}.${claims}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  const assertion = `${signingInput}.${base64url(new Uint8Array(signature))}`;

  let res: Response;
  try {
    res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
  } catch {
    return {
      probe: {
        state: "blind",
        reason: "Google could not be reached — no network, or Google is down.",
      },
    };
  }
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  const value = body?.["access_token"];
  const expiresIn = body?.["expires_in"];
  if (res.ok && typeof value === "string" && typeof expiresIn === "number") {
    return {
      probe: { state: "accepted", at: now, ...fields },
      token: { value, expiresAt: now + expiresIn * 1000 },
    };
  }
  const refusal = body?.["error_description"] || body?.["error"];
  if (res.status >= 400 && res.status < 500 && typeof refusal === "string") {
    return { probe: { state: "refused", description: refusal } };
  }
  return {
    probe: {
      state: "blind",
      reason: `Google answered ${res.status} — neither a token nor a refusal.`,
    },
  };
}
