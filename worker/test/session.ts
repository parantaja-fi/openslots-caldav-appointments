import { calculateJwkThumbprint, exportJWK, generateKeyPair, SignJWT } from "jose";

/** A browser session: a P-256 key pair that signs proofs of possession. */
export interface Session {
  thumbprint: string;
  proof(ageSeconds?: number): Promise<string>;
}

export async function newSession(): Promise<Session> {
  const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
  const jwk = await exportJWK(publicKey);
  return {
    thumbprint: await calculateJwkThumbprint(jwk),
    proof: (ageSeconds = 0) =>
      new SignJWT({})
        .setProtectedHeader({ alg: "ES256", typ: "booking-proof+jwt", jwk })
        .setIssuedAt(Math.floor(Date.now() / 1000) - ageSeconds)
        .sign(privateKey),
  };
}
