import { readdirSync, readFileSync } from "node:fs";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const wrangler = { configPath: "./wrangler.toml" };

// The pool honours the production per-IP limit from wrangler.toml, and every
// test shares one client key, so a suite would rate-limit itself. The limiter
// is exercised with a stub instead (routes.test.ts).
const ratelimits = {
  BOOKING_RL: { namespace_id: "1", simple: { limit: 100_000, period: 60 as const } },
};

// Throwaway, and public by construction: it signs nothing real. Not part of a
// backend profile — which CalDAV server is under test says nothing about the key.
const SIGNING_KEY_JWK = JSON.stringify({
  kty: "EC",
  crv: "P-256",
  x: "Hq9mBzkBgqzLfMcOnwYoBSZ4B6LIVO8JuLcKDUnr44w",
  y: "qIxEjT-ATm6LUtr4WVNhV-as-1TmDfWmHp91D8_sPec",
  d: "NRdKOKBhFF9iyrB75zdIVZKk9Lf3JE2z6Fo6gRv1NfY",
});

// No test run may send mail, whatever a .dev.vars or a backend profile holds:
// the Brevo call is exercised against a stub in email.test.ts. Like the key
// above, this says nothing about which CalDAV server is under test.
const BREVO_API_KEY = "";

const BACKENDS = new URL("test/backends/", import.meta.url);

/**
 * A backend profile: one dotenv file per CalDAV server. Passed as bindings, so
 * it overrides both wrangler.toml and any .dev.vars — which goes on serving
 * `wrangler dev` and the e2e test alone.
 */
function profile(name: string): Record<string, string> {
  const bindings: Record<string, string> = {};
  for (const line of readFileSync(new URL(`${name}.vars`, BACKENDS), "utf8").split("\n")) {
    const match = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    const value = match[2]!;
    bindings[match[1]!] = /^(["']).*\1$/.test(value) ? value.slice(1, -1) : value;
  }
  return bindings;
}

const backends = readdirSync(BACKENDS)
  .filter(file => file.endsWith(".vars"))
  .map(file => file.replace(/\.vars$/, ""));

// One project per configuration:
//   unit        — no backend, so dummy credentials satisfy config(). Runs in CI.
//   live:<name> — the whole live suite against that backend. `npm test` runs
//                 every profile present; CI runs them as separate jobs.
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [cloudflareTest({
          wrangler,
          miniflare: {
            ratelimits,
            bindings: {
              AVAILABILITY_USERNAME: "unit",
              AVAILABILITY_PASSWORD: "unit",
              BOOKING_STORE_USERNAME: "unit",
              BOOKING_STORE_PASSWORD: "unit",
              SIGNING_KEY_JWK,
              BREVO_API_KEY,
            },
          },
        })],
        test: {
          name: "unit",
          include: ["test/**/*.test.ts"],
          exclude: ["test/**/*.live.test.ts"],
        },
      },
      ...backends.map(name => ({
        plugins: [cloudflareTest({
          wrangler,
          miniflare: {
            ratelimits,
            bindings: { ...profile(name), SIGNING_KEY_JWK, BREVO_API_KEY },
          },
        })],
        test: {
          name: `live:${name}`,
          include: ["test/**/*.live.test.ts"],
          // One calendar pair is shared by every live file.
          fileParallelism: false,
          // Google answers in seconds; the 5 s default times out on it.
          testTimeout: 60_000,
        },
      })),
    ],
  },
});
