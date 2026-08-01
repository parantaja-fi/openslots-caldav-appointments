import type { Env } from "./config";

// Types `import { env } from "cloudflare:workers"`; config.ts stays the
// authoritative declaration of what this Worker is configured with.
declare global {
  namespace Cloudflare {
    interface Env extends BookingEnv {}
  }
}

type BookingEnv = Env;
