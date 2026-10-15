# CLAUDE.md

Independent booking calendar for solo practitioners: static SPA +
Cloudflare Worker API + CalDAV as the sole persistence layer. No
database, ever. The first release, 0.1.0, is out (2026-10-12);
testing continues past it.

## Document map

- `SCOPE.md` — what is being built, for whom, what is out.
- `ARCHITECTURE.md` — authoritative home for every mechanism (topology,
  calendar model, API, security). Do not restate mechanisms elsewhere;
  reference them. When two documents describe the same mechanism they
  diverge. Its §9 maps each section's concepts to the sources.
- `PRIVACY.md` — ARCHITECTURE §2/§5/§6 restated for the practitioner
  as data controller. A change to those sections must be checked
  against it (and against `SECURITY.md`'s scope list).
- `ROADMAP.md` — met milestones as dated summaries, and what each
  coming release (0.1.x, 0.2.0, Later) is for; it lists no work items.
- `.devtool/features/` — the work, one card per item, as the VS Code
  Kanban Markdown extension renders it (the `kanban-markdown` skill
  writes cards in its exact format). Conventions — epics, labels,
  referring to cards by id — in `ROADMAP.md`'s "The board". Open
  decisions are the cards labelled `decision`.
- `METHODOLOGY.md` — decision statuses, anchored references, the link
  check, and their ancestry. One of its rules binds this file too:
  CLAUDE.md is instructions, not the record — never cite it as the
  home of a fact.
- `SETUP.md` — the by-hand route for the operator, and the reference
  behind the wizard's steps.
- `NOW.md` — where the work stands between sessions; the `handoff`
  skill updates it.
- `LESSONS.md` — dated, hard-won facts (browser quirks, test and
  automation gotchas); read the relevant entry before re-measuring one.
- `docs/` — per-feature design notes and walk logs;
  `docs/fork-guided-setup.md` is the wizard's design doc.
- `spike/` — the work-window and Safari-driving probes;
  `spike/RESULTS.md` holds the measurements `LESSONS.md` cites.
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
- TypeScript strict throughout. Runtime dependencies: FullCalendar
  (frontend); `ical.js` + `jose` (Worker); none in the wizard — its
  sealed box is vendored, tweetnacl being a dev-only cross-check.
  Anything else needs explicit justification.
- KISS. No speculative abstractions; nothing built that the next
  release does not need.

## Deployment surroundings

- The author's practice site is GitHub Pages: staged at
  <https://staging.pnr.iki.fi>, deploying to <https://parantaja.fi>.
  The booking page will eventually integrate into it (`ROADMAP.md`
  0.2.0), so the page and the Worker are cross-origin by design:
  `ALLOWED_ORIGINS` is a deliberate control, never to be dissolved by
  serving the SPA from the Worker.
- The hosted wizard and page (`parantaja-fi.github.io`) update only
  through the upstream's own `deploy.yml` dispatch — the same path
  every fork uses. Workers are named `<owner>-booking-worker`, so
  upstream and forks can share a Cloudflare account. The tracked
  `wrangler.toml` stays pointed at localhost.
- The gitignored `worker/wrangler.production.toml` was the August 2026
  test bed; its Worker is gone. It is not a deploy route.

## Workflow

- CI builds and typechecks all three packages — `worker/`, `frontend/`,
  `wizard/` (the spike's production build was silently broken for
  months because only `vite dev` ever ran).
- Deploys are explicit (manual dispatch or release branch), never
  `on: push`.
- Choose API field names deliberately up front (`slot_start`, not
  `start`); renames cross the wire.
- Land branches by rebase or fast-forward; no merge commits.
- Secrets in any session output: names only, never values.
