import { defineConfig } from "@playwright/test";

// Local only, and deliberately absent from CI: it needs a browser download and
// real CalDAV credentials from worker/.dev.vars.
export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://localhost:5173" },
  webServer: [
    { command: "npm run dev -- --port 5173 --strictPort", url: "http://localhost:5173", reuseExistingServer: true },
    { command: "npm run dev", cwd: "../worker", url: "http://localhost:8787/v1/slots", reuseExistingServer: true },
  ],
});
