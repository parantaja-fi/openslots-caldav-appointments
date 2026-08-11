// The vendored primitives are checked against published vectors, the
// whole seal against tweetnacl — an independent, widely reviewed
// implementation of exactly the construction GitHub's API expects.

import nacl from "tweetnacl";
import sealedbox from "tweetnacl-sealedbox-js";
import { describe, expect, it } from "vitest";
import { blake2b, hsalsa20, poly1305, seal, secretbox } from "../src/sealedbox";

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const bytes = (s: string) => new Uint8Array(Buffer.from(s, "hex"));

describe("blake2b", () => {
  it("matches the RFC 7693 appendix A vector", () => {
    expect(hex(blake2b(new TextEncoder().encode("abc"), 64))).toBe(
      "ba80a53f981c4d0d6a2797b69f12f6e94c212f14685ac4b74b12bb6fdbffa2d1" +
        "7d87c5392aab792dc252d5de4533cc9518d38aa8dbf1925ab92386edd4009923",
    );
  });

  it("agrees with tweetnacl-sealedbox's nonce derivation length", () => {
    const epk = nacl.box.keyPair().publicKey;
    const pk = nacl.box.keyPair().publicKey;
    expect(blake2b(new Uint8Array([...epk, ...pk]), 24)).toHaveLength(24);
  });

  it("handles multi-block input", () => {
    const long = new Uint8Array(300).fill(7);
    // Self-consistency: same input, same output; different length, different output.
    expect(hex(blake2b(long, 24))).toBe(hex(blake2b(long, 24)));
    expect(hex(blake2b(long.subarray(0, 299), 24))).not.toBe(hex(blake2b(long, 24)));
  });
});

describe("poly1305", () => {
  it("matches the RFC 8439 §2.5.2 vector", () => {
    const key = bytes(
      "85d6be7857556d337f4452fe42d506a80103808afb0db2fd4abff6af4149f51b",
    );
    const msg = new TextEncoder().encode("Cryptographic Forum Research Group");
    expect(hex(poly1305(msg, key))).toBe("a8061dc1305136c6c22b8baf0c0127a9");
  });
});

describe("hsalsa20 and secretbox", () => {
  it("agrees with tweetnacl's secretbox on random inputs", () => {
    for (let i = 0; i < 5; i++) {
      const key = nacl.randomBytes(32);
      const nonce = nacl.randomBytes(24);
      const msg = nacl.randomBytes(3 + i * 37);
      expect(hex(secretbox(msg, nonce, key))).toBe(hex(nacl.secretbox(msg, nonce, key)));
    }
  });

  it("derives the crypto_box shared key like tweetnacl does", () => {
    const a = nacl.box.keyPair();
    const b = nacl.box.keyPair();
    const shared = nacl.scalarMult(a.secretKey, b.publicKey);
    expect(hex(hsalsa20(shared, new Uint8Array(16)))).toBe(
      hex(nacl.box.before(b.publicKey, a.secretKey)),
    );
  });
});

describe("seal", () => {
  it("produces sealed boxes tweetnacl opens, across sizes", async () => {
    const kp = nacl.box.keyPair();
    for (const size of [0, 1, 32, 100, 5000]) {
      const msg = nacl.randomBytes(size);
      const sealed = await seal(msg, kp.publicKey);
      expect(sealed).toHaveLength(48 + size);
      const opened = sealedbox.open(sealed, kp.publicKey, kp.secretKey);
      expect(opened).not.toBeNull();
      expect(hex(opened!)).toBe(hex(msg));
    }
  });

  it("binds the box to the recipient", async () => {
    const right = nacl.box.keyPair();
    const wrong = nacl.box.keyPair();
    const sealed = await seal(new TextEncoder().encode("secret"), right.publicKey);
    expect(sealedbox.open(sealed, wrong.publicKey, wrong.secretKey)).toBeNull();
  });
});
