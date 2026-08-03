# Booking Calendar — Roadmap to 1.0

> Milestones, each with an exit criterion. Order is dependency-driven, not
> a schedule. Scope per `SCOPE.md`; mechanisms per `ARCHITECTURE.md`.

## M0 — Decisions

All settled 2026-08-01: backends Radicale + Nextcloud, Google retained
best-effort; email via the Brevo transactional HTTP API behind a
`sendEmail()` seam (`ARCHITECTURE.md` §6); cancellation via a stateless
bearer token in the emailed link, valid until slot start
(`ARCHITECTURE.md` §5); licence MIT.

*Exit: met — each decision recorded.*

## M1 — Core rebuild

Worker API and SPA rebuilt from the spike, with the plain-JWT security
model and the two-logical-calendar configuration from day one. Verified
against Google (the known backend) in both configurations: coinciding
calendars and separate availability/store.

*Exit: met 2026-08-01 — `worker/test/flow.live.test.ts` runs the full
flow against a real backend in both configurations, and CI builds and
typechecks both halves. Verified against Nextcloud rather than Google;
the Google service-account path is implemented but not yet exercised
end to end, which M2 picks up.*

## M2 — Backend verification

Radicale and Nextcloud verified by the same suite against real
instances, Radicale self-hosted; Nextcloud is already green from M1.
Google likewise, best-effort.

Google, exercised 2026-08-02, found the one real interop gap: it accepts
`<c:expand>` and ignores it, returning the unexpanded master, so weekly
`OPEN` events yielded no slots at all. Recurrence expansion moved into
the Worker (`ARCHITECTURE.md` §2), which also brought it under unit test.
Backend profiles now select the backend (`worker/test/backends/`), CI
runs the live suite against Radicale on every pull request and against
Nextcloud and Google on `main`.

*Exit: met 2026-08-02 — suite green on all three backends, and no
document claims "any CalDAV server" without saying it is unsubstantiated.
The Proton write-up moved past 1.0; see "Later".*

## M3 — Customer email

Booking confirmation email carrying the cancellation link, using the M0
mechanism. Practitioner notification via their calendar client if
adequate, email otherwise.

`attendee.email` is now required — it is where the link goes — and the
confirmation points at a page of its own, which reads the booking through
a new `GET /v1/bookings/:uid` and cancels only on an explicit button
(`ARCHITECTURE.md` §3, §5). The practitioner is notified by email as
well, when they configure an address: no CalDAV client alerts reliably on
an event another client pushed in, so their calendar alone would have
left them discovering bookings by looking. Without an API key the Worker
sends nothing and says `disabled` in the booking response, which is what
keeps `wrangler dev` and every test run from mailing anyone.

*Exit: a booking produces a confirmation the customer can cancel from,
on another device. Built and under test; the criterion itself still wants
one run with a real Brevo key and a phone.*

## M4 — Operator experience

Operator guide (prerequisites, per-backend setup, secrets, deploy, custom
domain, smoke test) — first draft written 2026-08-02 as `SETUP.md`, from
one operator's own setup and therefore untested by anyone else — plus a
near-one-command deploy and a built-in health/config
check that says what is wrong — including an email transport that was
meant to be configured and is not, which a booking otherwise reports only
in its own response (`ARCHITECTURE.md` §6). Deploys remain explicit.

*Exit: the `SCOPE.md` §1 acceptance test — a practitioner who is not the
author deploys from the documentation alone and takes a real booking.*

## 1.0

M0–M4 done, acceptance test passed.

## Later

- The Proton path, verified then written up: booking store on a CalDAV
  backend, Proton subscribing to its ICS URL for viewing, a standard
  CalDAV client for painting `OPEN`. Verify against a real Proton
  account first — in particular the subscription refresh interval, which
  their documentation puts in hours, and whether a Nextcloud or Google
  secret-ICS URL is accepted at all. Describing it from their published
  behaviour instead would repeat the M2 `<c:expand>` mistake. Then a
  short `docs/proton.md` linked from the M4 operator guide.
- ICS URL as an availability source (enables Proton)
- Reminder email before the appointment — reuses the M3 delivery
  mechanism and the booking's own data; nothing new needed.
- Further verified backends (Baïkal, Fastmail, …) — marginal cost is one
  CI job per backend once the M2 suite exists.
- Per-slot Durable Object lock, if real traffic ever makes the
  check-after-insert race window matter (`ARCHITECTURE.md` §5).
- SMTP submission to the operator's own mailbox as an alternative email
  transport (rejected for 1.0 — `ARCHITECTURE.md` §6).
- Configurable minimum cancellation notice (cancellation token expiring
  N hours before slot start instead of at it).
