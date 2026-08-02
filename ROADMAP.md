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
Google likewise, best-effort. Document the Proton path (store elsewhere
+ ICS view + CalDAV client for painting `OPEN`).

Google, exercised 2026-08-02, found the one real interop gap: it accepts
`<c:expand>` and ignores it, returning the unexpanded master, so weekly
`OPEN` events yielded no slots at all. Recurrence expansion moved into
the Worker (`ARCHITECTURE.md` §2), which also brought it under unit test.
Backend profiles now select the backend (`worker/test/backends/`), CI
runs the live suite against Radicale on every pull request and against
Nextcloud and Google on `main`.

*Exit: test suite green on two backends; "any CalDAV server" claims
removed or substantiated. Suite green on all three since 2026-08-02;
the Proton write-up is what remains.*

## M3 — Customer email

Booking confirmation email carrying the cancellation link, using the M0
mechanism. Practitioner notification via their calendar client if
adequate, email otherwise.

*Exit: a booking produces a confirmation the customer can cancel from,
on another device.*

## M4 — Operator experience

Operator guide (prerequisites, per-backend setup, secrets, deploy, custom
domain, smoke test), near-one-command deploy, built-in health/config
check that says what is wrong. Deploys remain explicit.

*Exit: the `SCOPE.md` §1 acceptance test — a practitioner who is not the
author deploys from the documentation alone and takes a real booking.*

## 1.0

M0–M4 done, acceptance test passed.

## Later

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
