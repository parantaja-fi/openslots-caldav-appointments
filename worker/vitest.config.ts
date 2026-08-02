import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const wrangler = { configPath: "./wrangler.toml" };

// The pool honours the production per-IP limit from wrangler.toml, and every
// test shares one client key, so a suite would rate-limit itself. The limiter
// is exercised with a stub instead (routes.test.ts).
const ratelimits = {
  BOOKING_RL: { namespace_id: "1", simple: { limit: 100_000, period: 60 as const } },
};

// Two projects, because they need different configuration:
//   unit — no backend, so dummy credentials satisfy config(). Runs in CI.
//   live — real .dev.vars credentials against a real CalDAV server. Local.
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
              // Throwaway, and public by construction: it signs nothing real.
              SIGNING_KEY_JWK: JSON.stringify({
                kty: "EC",
                crv: "P-256",
                x: "Hq9mBzkBgqzLfMcOnwYoBSZ4B6LIVO8JuLcKDUnr44w",
                y: "qIxEjT-ATm6LUtr4WVNhV-as-1TmDfWmHp91D8_sPec",
                d: "NRdKOKBhFF9iyrB75zdIVZKk9Lf3JE2z6Fo6gRv1NfY",
              }),
            },
          },
        })],
        test: {
          name: "unit",
          include: ["test/**/*.test.ts"],
          exclude: ["test/**/*.live.test.ts"],
        },
      },
      {
        plugins: [cloudflareTest({ wrangler, miniflare: { ratelimits } })],
        test: {
          name: "live",
          include: ["test/**/*.live.test.ts"],
          // One remote calendar pair is shared by every live file.
          fileParallelism: false,
        },
      },
    ],
  },
});
