import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// Tests run inside workerd with the real wrangler.toml vars and .dev.vars
// secrets. `*.live.test.ts` reach a real CalDAV backend and are excluded in CI.
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.toml" } })],
});
