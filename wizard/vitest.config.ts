import { existsSync, readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

// The Worker's Google profile serves the wizard's live test too: the
// spike's project and test calendars. Gitignored, so CI has none.
const GOOGLE = new URL("../worker/test/backends/google.vars", import.meta.url);
const NAMES = ["GOOGLE_SERVICE_ACCOUNT_JSON", "AVAILABILITY_CALENDAR_URL", "BOOKING_STORE_URL"];

/** The names the live test reads, parsed as worker/vitest.config.ts
 * parses a profile. */
function profile(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of readFileSync(GOOGLE, "utf8").split("\n")) {
    const match = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || !NAMES.includes(match[1]!)) continue;
    const value = match[2]!;
    env[match[1]!] = /^(["']).*\1$/.test(value) ? value.slice(1, -1) : value;
  }
  return env;
}

// One project per configuration, as in the Worker:
//   unit        — everything but the live test. Runs in CI.
//   live:google — the live test against Google, where the profile exists.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["test/**/*.test.ts"],
          exclude: ["test/**/*.live.test.ts"],
        },
      },
      ...(existsSync(GOOGLE)
        ? [
            {
              test: {
                name: "live:google",
                include: ["test/**/*.live.test.ts"],
                env: profile(),
                // Google answers in seconds; the 5 s default times out on it.
                testTimeout: 60_000,
              },
            },
          ]
        : []),
    ],
  },
});
