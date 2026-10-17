// Credentials the fixture uses to paint OPEN events. Deliberately separate
// from the Worker's own: the availability role must stay read-only.
declare global {
  namespace Cloudflare {
    interface Env {
      TEST_WRITE_USERNAME?: string;
      TEST_WRITE_PASSWORD?: string;
      // AVAILABILITY_CALENDAR_URL in a second spelling, served without a redirect.
      TEST_AVAILABILITY_URL_ALIAS?: string;
    }
  }
}

export {};
