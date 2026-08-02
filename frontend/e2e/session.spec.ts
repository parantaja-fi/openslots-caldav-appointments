import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";

interface PublicJwk { crv: string; kty: string; x: string; y: string }

/** RFC 7638, independently of the implementation under test. */
function thumbprintOf(jwk: PublicJwk): string {
  const canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y });
  return createHash("sha256").update(canonical).digest("base64url");
}

// A blank page on the dev server's origin, so the module is imported into a
// browser that has not run the app — and therefore has no session key yet.
test.beforeEach(async ({ page }) => {
  await page.route("**/blank", route => route.fulfill({
    contentType: "text/html",
    body: "<!doctype html><title>session</title>",
  }));
  await page.goto("/blank");
});

test("signs the proof with the key whose thumbprint it reports", async ({ page }) => {
  const { thumbprint, proof } = await page.evaluate(async () => {
    const session = await import("/src/session.ts");
    // Racing them is the point: on a first visit each call used to generate
    // its own key pair, so the Worker saw a proof for an unknown thumbprint.
    const [thumbprint, proof] = await Promise.all([session.thumbprint(), session.proof()]);
    return { thumbprint, proof };
  });

  const header = JSON.parse(
    Buffer.from(proof.split(".")[0]!, "base64url").toString(),
  ) as { jwk: PublicJwk };
  expect(thumbprint).toBe(thumbprintOf(header.jwk));
});
