# CLAUDE.md

Independent booking calendar for solo practitioners: static SPA +
Cloudflare Worker API + CalDAV as the sole persistence layer. No
database, ever.

## Document map

- `SCOPE.md` — what is being built, for whom, what is out. Open
  decisions live in its §6.
- `ARCHITECTURE.md` — authoritative home for every mechanism (topology,
  calendar model, API, security). Do not restate mechanisms elsewhere;
  reference them. When two documents describe the same mechanism they
  diverge.
- `ROADMAP.md` — milestones to 1.0.
- `../parantaja-booking-calendar-spikes/LEARNINGS.md` — rationale from the
  spike phase; consult before re-deriving a settled decision.

## Hard constraints

- **Two logical calendars**: availability (read-only, `OPEN` events) and
  booking store (the only place the system writes). They may be the same
  backend calendar; code addresses the roles, configuration decides.
- The API stays booking-domain-shaped (`slots`, `bookings`) — never a
  calendar proxy.
- Security is plain signed JWTs (ES256) per `ARCHITECTURE.md` §5. No
  UCAN, no DIDs, no server-side session state.
- TypeScript strict throughout. Dependencies: FullCalendar (frontend),
  `ical.js` + `jose` (Worker); anything else needs explicit
  justification.
- KISS. No speculative abstractions; nothing built that 1.0 does not
  need.

## Workflow

- Build both halves in CI from the start (the spike's production build
  was silently broken for months because only `vite dev` ever ran).
- Deploys are explicit (manual dispatch or release branch), never
  `on: push`.
- Gitignore `.wrangler/` when Worker code lands; wrangler doesn't.
- Choose API field names deliberately up front (`slot_start`, not
  `start`); renames cross the wire.
