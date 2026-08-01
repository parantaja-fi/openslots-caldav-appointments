/**
 * The browser session: a P-256 key pair the page generates once and keeps in
 * IndexedDB. The private key is non-extractable, so the proof can only be
 * signed by this browser. `ARCHITECTURE.md` §5.
 */

const DB = "booking-session";
const STORE = "keys";
const KEY = "session";

interface PublicJwk {
  crv: string;
  kty: string;
  x: string;
  y: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transact<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = action(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function keyPair(): Promise<CryptoKeyPair> {
  const db = await openDb();
  const stored = await transact<CryptoKeyPair | undefined>(db, "readonly", s => s.get(KEY));
  if (stored) return stored;

  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"],
  );
  await transact(db, "readwrite", s => s.put(pair, KEY));
  return pair;
}

function b64url(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function segment(value: unknown): string {
  return b64url(new TextEncoder().encode(JSON.stringify(value)).buffer as ArrayBuffer);
}

async function publicJwk(): Promise<PublicJwk> {
  const { publicKey } = await keyPair();
  const { crv, kty, x, y } = await crypto.subtle.exportKey("jwk", publicKey);
  return { crv: crv!, kty: kty!, x: x!, y: y! };
}

/** RFC 7638: SHA-256 of the required members, in lexicographic order. */
export async function thumbprint(): Promise<string> {
  const { crv, kty, x, y } = await publicJwk();
  const canonical = JSON.stringify({ crv, kty, x, y });
  return b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical)));
}

/**
 * A short-lived JWT proving possession of the session key. The public key
 * travels in the header, so the Worker holds no session state.
 */
export async function proof(): Promise<string> {
  const { privateKey } = await keyPair();
  const signingInput =
    segment({ alg: "ES256", typ: "booking-proof+jwt", jwk: await publicJwk() }) +
    "." + segment({ iat: Math.floor(Date.now() / 1000) });

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${b64url(signature)}`;
}
