// Sealed box (libsodium's crypto_box_seal), the format GitHub's secrets
// API requires: ciphertext = ephemeral_pk ‖ XSalsa20-Poly1305(message)
// under the X25519 shared key, nonce = BLAKE2b-24(ephemeral_pk ‖
// recipient_pk). X25519 comes from Web Crypto; the rest is vendored
// below — the M6 decision (`ROADMAP.md`): no crypto dependency, a
// current browser as the baseline. Verified in tests against tweetnacl.

export async function seal(message: Uint8Array, recipientPk: Uint8Array): Promise<Uint8Array> {
  const eph = (await crypto.subtle.generateKey("X25519", true, ["deriveBits"])) as CryptoKeyPair;
  const ephPk = new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey));
  const peer = await crypto.subtle.importKey("raw", recipientPk as BufferSource, "X25519", false, []);
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "X25519", public: peer }, eph.privateKey, 256),
  );
  // crypto_box's key derivation: HSalsa20 of the raw shared secret.
  const key = hsalsa20(shared, new Uint8Array(16));
  const nonce = blake2b(concat(ephPk, recipientPk), 24);
  return concat(ephPk, secretbox(message, nonce, key));
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

// --- Salsa20 family ---------------------------------------------------

const SIGMA = new Uint32Array([0x61707865, 0x3320646e, 0x79622d32, 0x6b206574]);

function rotl(x: number, n: number): number {
  return (x << n) | (x >>> (32 - n));
}

/** The 20-round Salsa20 doubleround loop, in place. */
function rounds(x: Uint32Array): void {
  for (let i = 0; i < 20; i += 2) {
    x[4]! ^= rotl((x[0]! + x[12]!) | 0, 7);
    x[8]! ^= rotl((x[4]! + x[0]!) | 0, 9);
    x[12]! ^= rotl((x[8]! + x[4]!) | 0, 13);
    x[0]! ^= rotl((x[12]! + x[8]!) | 0, 18);
    x[9]! ^= rotl((x[5]! + x[1]!) | 0, 7);
    x[13]! ^= rotl((x[9]! + x[5]!) | 0, 9);
    x[1]! ^= rotl((x[13]! + x[9]!) | 0, 13);
    x[5]! ^= rotl((x[1]! + x[13]!) | 0, 18);
    x[14]! ^= rotl((x[10]! + x[6]!) | 0, 7);
    x[2]! ^= rotl((x[14]! + x[10]!) | 0, 9);
    x[6]! ^= rotl((x[2]! + x[14]!) | 0, 13);
    x[10]! ^= rotl((x[6]! + x[2]!) | 0, 18);
    x[3]! ^= rotl((x[15]! + x[11]!) | 0, 7);
    x[7]! ^= rotl((x[3]! + x[15]!) | 0, 9);
    x[11]! ^= rotl((x[7]! + x[3]!) | 0, 13);
    x[15]! ^= rotl((x[11]! + x[7]!) | 0, 18);
    x[1]! ^= rotl((x[0]! + x[3]!) | 0, 7);
    x[2]! ^= rotl((x[1]! + x[0]!) | 0, 9);
    x[3]! ^= rotl((x[2]! + x[1]!) | 0, 13);
    x[0]! ^= rotl((x[3]! + x[2]!) | 0, 18);
    x[6]! ^= rotl((x[5]! + x[4]!) | 0, 7);
    x[7]! ^= rotl((x[6]! + x[5]!) | 0, 9);
    x[4]! ^= rotl((x[7]! + x[6]!) | 0, 13);
    x[5]! ^= rotl((x[4]! + x[7]!) | 0, 18);
    x[11]! ^= rotl((x[10]! + x[9]!) | 0, 7);
    x[8]! ^= rotl((x[11]! + x[10]!) | 0, 9);
    x[9]! ^= rotl((x[8]! + x[11]!) | 0, 13);
    x[10]! ^= rotl((x[9]! + x[8]!) | 0, 18);
    x[12]! ^= rotl((x[15]! + x[14]!) | 0, 7);
    x[13]! ^= rotl((x[12]! + x[15]!) | 0, 9);
    x[14]! ^= rotl((x[13]! + x[12]!) | 0, 13);
    x[15]! ^= rotl((x[14]! + x[13]!) | 0, 18);
  }
}

function le32(b: Uint8Array, i: number): number {
  return (b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16) | (b[i + 3]! << 24)) >>> 0;
}

function state(key: Uint8Array, in16: Uint8Array): Uint32Array {
  const x = new Uint32Array(16);
  x[0] = SIGMA[0]!;
  x[5] = SIGMA[1]!;
  x[10] = SIGMA[2]!;
  x[15] = SIGMA[3]!;
  for (let i = 0; i < 4; i++) {
    x[1 + i] = le32(key, 4 * i);
    x[11 + i] = le32(key, 16 + 4 * i);
    x[6 + i] = le32(in16, 4 * i);
  }
  return x;
}

/** HSalsa20: the core without the feedforward, keyed output words only. */
export function hsalsa20(key: Uint8Array, in16: Uint8Array): Uint8Array {
  const x = state(key, in16);
  rounds(x);
  const out = new Uint8Array(32);
  const view = new DataView(out.buffer);
  for (const [i, w] of [x[0]!, x[5]!, x[10]!, x[15]!, x[6]!, x[7]!, x[8]!, x[9]!].entries()) {
    view.setUint32(4 * i, w, true);
  }
  return out;
}

/** The XSalsa20 keystream: HSalsa20 subkey, then Salsa20 blocks. */
function xsalsa20(key: Uint8Array, nonce24: Uint8Array, length: number): Uint8Array {
  const subkey = hsalsa20(key, nonce24.subarray(0, 16));
  const out = new Uint8Array(length);
  const in16 = new Uint8Array(16);
  in16.set(nonce24.subarray(16, 24));
  const counter = new DataView(in16.buffer);
  for (let block = 0; block * 64 < length; block++) {
    counter.setBigUint64(8, BigInt(block), true);
    const x = state(subkey, in16);
    const z = Uint32Array.from(x);
    rounds(z);
    const chunk = new Uint8Array(64);
    const view = new DataView(chunk.buffer);
    for (let i = 0; i < 16; i++) view.setUint32(4 * i, (z[i]! + x[i]!) | 0, true);
    out.set(chunk.subarray(0, Math.min(64, length - block * 64)), block * 64);
  }
  return out;
}

// --- Poly1305 ---------------------------------------------------------

const P130 = (1n << 130n) - 5n;
const CLAMP = 0x0ffffffc0ffffffc0ffffffc0fffffffn;

function le128(b: Uint8Array, offset: number): bigint {
  let n = 0n;
  for (let i = 15; i >= 0; i--) n = (n << 8n) | BigInt(b[offset + i]!);
  return n;
}

export function poly1305(msg: Uint8Array, key: Uint8Array): Uint8Array {
  const r = le128(key, 0) & CLAMP;
  const s = le128(key, 16);
  let acc = 0n;
  for (let i = 0; i < msg.length; i += 16) {
    const chunk = msg.subarray(i, Math.min(i + 16, msg.length));
    let n = 1n << BigInt(8 * chunk.length);
    for (let j = 0; j < chunk.length; j++) n |= BigInt(chunk[j]!) << BigInt(8 * j);
    acc = ((acc + n) * r) % P130;
  }
  const tag = (acc + s) & ((1n << 128n) - 1n);
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) out[i] = Number((tag >> BigInt(8 * i)) & 0xffn);
  return out;
}

// --- Secretbox --------------------------------------------------------

/** XSalsa20-Poly1305, NaCl layout: 16-byte tag ‖ ciphertext. */
export function secretbox(message: Uint8Array, nonce24: Uint8Array, key: Uint8Array): Uint8Array {
  const stream = xsalsa20(key, nonce24, 32 + message.length);
  const ciphertext = new Uint8Array(message.length);
  for (let i = 0; i < message.length; i++) ciphertext[i] = message[i]! ^ stream[32 + i]!;
  const tag = poly1305(ciphertext, stream.subarray(0, 32));
  return concat(tag, ciphertext);
}

// --- BLAKE2b ----------------------------------------------------------

const IV = [
  0x6a09e667f3bcc908n, 0xbb67ae8584caa73bn, 0x3c6ef372fe94f82bn, 0xa54ff53a5f1d36f1n,
  0x510e527fade682d1n, 0x9b05688c2b3e6c1fn, 0x1f83d9abfb41bd6bn, 0x5be0cd19137e2179n,
];

// prettier-ignore
const BSIGMA = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3],
  [11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4],
  [7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8],
  [9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13],
  [2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9],
  [12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11],
  [13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10],
  [6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5],
  [10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0],
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3],
];

const MASK64 = (1n << 64n) - 1n;

function ror64(x: bigint, n: bigint): bigint {
  return ((x >> n) | (x << (64n - n))) & MASK64;
}

export function blake2b(message: Uint8Array, outLength: number): Uint8Array {
  const h = IV.slice();
  h[0] = h[0]! ^ 0x01010000n ^ BigInt(outLength);

  const compress = (block: Uint8Array, t: number, last: boolean): void => {
    const m: bigint[] = [];
    for (let i = 0; i < 16; i++) {
      let w = 0n;
      for (let j = 7; j >= 0; j--) w = (w << 8n) | BigInt(block[8 * i + j]!);
      m.push(w);
    }
    const v = [...h, ...IV];
    v[12] = v[12]! ^ BigInt(t);
    if (last) v[14] = v[14]! ^ MASK64;
    const G = (a: number, b: number, c: number, d: number, x: bigint, y: bigint): void => {
      v[a] = (v[a]! + v[b]! + x) & MASK64;
      v[d] = ror64(v[d]! ^ v[a]!, 32n);
      v[c] = (v[c]! + v[d]!) & MASK64;
      v[b] = ror64(v[b]! ^ v[c]!, 24n);
      v[a] = (v[a]! + v[b]! + y) & MASK64;
      v[d] = ror64(v[d]! ^ v[a]!, 16n);
      v[c] = (v[c]! + v[d]!) & MASK64;
      v[b] = ror64(v[b]! ^ v[c]!, 63n);
    };
    for (const s of BSIGMA) {
      G(0, 4, 8, 12, m[s[0]!]!, m[s[1]!]!);
      G(1, 5, 9, 13, m[s[2]!]!, m[s[3]!]!);
      G(2, 6, 10, 14, m[s[4]!]!, m[s[5]!]!);
      G(3, 7, 11, 15, m[s[6]!]!, m[s[7]!]!);
      G(0, 5, 10, 15, m[s[8]!]!, m[s[9]!]!);
      G(1, 6, 11, 12, m[s[10]!]!, m[s[11]!]!);
      G(2, 7, 8, 13, m[s[12]!]!, m[s[13]!]!);
      G(3, 4, 9, 14, m[s[14]!]!, m[s[15]!]!);
    }
    for (let i = 0; i < 8; i++) h[i] = h[i]! ^ v[i]! ^ v[i + 8]!;
  };

  // Every block but the last is full; an empty message is one zero block.
  const blocks = Math.max(1, Math.ceil(message.length / 128));
  for (let b = 0; b < blocks; b++) {
    const block = new Uint8Array(128);
    block.set(message.subarray(128 * b, Math.min(128 * (b + 1), message.length)));
    const last = b === blocks - 1;
    compress(block, last ? message.length : 128 * (b + 1), last);
  }

  const out = new Uint8Array(outLength);
  for (let i = 0; i < outLength; i++) out[i] = Number((h[i >> 3]! >> BigInt(8 * (i & 7))) & 0xffn);
  return out;
}
