import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const wrangler = { configPath: "./wrangler.toml" };

// Two projects, because they need different configuration:
//   unit — no backend, so dummy credentials satisfy checkEnv. Runs in CI.
//   live — real .dev.vars credentials against a real CalDAV server. Local.
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [cloudflareTest({
          wrangler,
          miniflare: {
            bindings: {
              AVAILABILITY_USERNAME: "unit",
              AVAILABILITY_PASSWORD: "unit",
              BOOKING_STORE_USERNAME: "unit",
              BOOKING_STORE_PASSWORD: "unit",
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
        plugins: [cloudflareTest({ wrangler })],
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
