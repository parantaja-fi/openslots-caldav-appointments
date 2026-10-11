import { KeyObject } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requestToken } from "../../src/google/token";

const NOW = 1_757_000_000_123; // an arbitrary moment in 2025, mid-second
const PROJECT = "practice-bookings";
const SA = "booking@practice-bookings.iam.gserviceaccount.com";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GRANTED = '{"access_token":"test-access-token","expires_in":3599,"token_type":"Bearer"}';

// Plan §10's refusals, verbatim; each comes as a 400.
const CLOCK =
  "Invalid JWT: Token must be a short-lived token (60 minutes) and in a reasonable " +
  "timeframe. Check your iat and exp values in the JWT claim.";
const REFUSALS: [string, string][] = [
  [
    '{"error":"invalid_grant","error_description":"Invalid JWT: Token must be a short-lived ' +
      "token (60 minutes) and in a reasonable timeframe. Check your iat and exp values in the " +
      'JWT claim."}',
    CLOCK,
  ],
  [
    '{"error":"invalid_grant","error_description":"Invalid JWT Signature."}',
    "Invalid JWT Signature.",
  ],
  [
    '{"error":"invalid_grant","error_description":"Invalid grant: account not found"}',
    "Invalid grant: account not found",
  ],
];

// A throwaway pair per run: the private half signs, the public half checks.
const rsa = await crypto.subtle.generateKey(
  {
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  },
  true,
  ["sign", "verify"],
);
const ec = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
  "sign",
  "verify",
]);
const pem = (key: CryptoKey) =>
  KeyObject.from(key).export({ type: "pkcs8", format: "pem" }) as string;

/** A key file as Google hands it out, less the fields nothing reads. */
function keyFile(privateKey = pem(rsa.privateKey)): string {
  return JSON.stringify({
    type: "service_account",
    project_id: PROJECT,
    private_key: privateKey,
    client_email: SA,
  });
}

function google(status: number, body: string, contentType = "application/json") {
  const fetch = vi.fn(
    async (_url: string, _init: RequestInit) =>
      new Response(body, { status, headers: { "content-type": contentType } }),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const decode = (segment: string): unknown =>
  JSON.parse(Buffer.from(segment, "base64url").toString());

afterEach(() => vi.unstubAllGlobals());

describe("requestToken", () => {
  it("posts an RS256 assertion for the read-only scope, signed with the key", async () => {
    const fetch = google(200, GRANTED);
    await requestToken(keyFile(), NOW);
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(TOKEN_URL);
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("content-type")).toBe(
      "application/x-www-form-urlencoded",
    );
    const form = init.body as URLSearchParams;
    expect([...form.keys()]).toEqual(["grant_type", "assertion"]);
    expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    const [header = "", claims = "", signature = ""] = form.get("assertion")!.split(".");
    expect(decode(header)).toEqual({ alg: "RS256", typ: "JWT" });
    const iat = Math.floor(NOW / 1000);
    expect(decode(claims)).toEqual({
      iss: SA,
      scope: "https://www.googleapis.com/auth/calendar.readonly",
      aud: TOKEN_URL,
      iat,
      exp: iat + 3600,
    });
    const signed = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      rsa.publicKey,
      new Uint8Array(Buffer.from(signature, "base64url")),
      new TextEncoder().encode(`${header}.${claims}`),
    );
    expect(signed).toBe(true);
  });

  it("is accepted with the key's names, the token apart with its expiry", async () => {
    google(200, GRANTED);
    expect(await requestToken(keyFile(), NOW)).toEqual({
      probe: { state: "accepted", at: NOW, clientEmail: SA, projectId: PROJECT },
      token: { value: "test-access-token", expiresAt: NOW + 3_599_000 },
    });
  });

  it("is refused with Google's description verbatim", async () => {
    for (const [body, description] of REFUSALS) {
      google(400, body);
      expect(await requestToken(keyFile(), NOW), body).toEqual({
        probe: { state: "refused", description },
      });
    }
  });

  it("is refused with the OAuth error itself when Google gives no description", async () => {
    google(401, '{"error":"invalid_client"}');
    expect(await requestToken(keyFile(), NOW)).toEqual({
      probe: { state: "refused", description: "invalid_client" },
    });
  });

  it("is blind without a network, saying so", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    expect(await requestToken(keyFile(), NOW)).toEqual({
      probe: {
        state: "blind",
        reason: "Google could not be reached — no network, or Google is down.",
      },
    });
  });

  it("is blind on an answer that is neither a token nor a refusal", async () => {
    const answers: [number, string, string][] = [
      [500, "<html><body>Internal Server Error</body></html>", "text/html"],
      [503, '{"error":"temporarily_unavailable"}', "application/json"],
      [200, '{"token_type":"Bearer"}', "application/json"],
    ];
    for (const [status, body, contentType] of answers) {
      google(status, body, contentType);
      expect(await requestToken(keyFile(), NOW), body).toEqual({
        probe: {
          state: "blind",
          reason: `Google answered ${status} — neither a token nor a refusal.`,
        },
      });
    }
  });

  it("is unreadable on a private key that does not import, and Google is never asked", async () => {
    const fetch = google(200, GRANTED);
    const truncated = pem(rsa.privateKey).slice(0, 200);
    for (const privateKey of ["not a key", truncated, pem(ec.privateKey)]) {
      expect(await requestToken(keyFile(privateKey), NOW)).toEqual({
        probe: { state: "unreadable" },
      });
    }
    expect(await requestToken("not json", NOW)).toEqual({ probe: { state: "unreadable" } });
    expect(fetch).not.toHaveBeenCalled();
  });
});
