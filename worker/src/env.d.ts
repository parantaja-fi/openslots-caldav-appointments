import type { Env } from "./config";

// Types `env` and `exports` from "cloudflare:workers"; config.ts stays the
// authoritative declaration of what this Worker is configured with.
declare global {
  namespace Cloudflare {
    interface Env extends BookingEnv {}
    interface GlobalProps {
      mainModule: typeof import("./index");
    }
  }
}

type BookingEnv = Env;
