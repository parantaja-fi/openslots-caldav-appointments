# Booking Calendar — Roadmap to 1.0

> Milestones, each with an exit criterion. Order is dependency-driven, not
> a schedule. Scope per `SCOPE.md`; mechanisms per `ARCHITECTURE.md`.

## M0 — Decisions

Settle the open decisions in `SCOPE.md` §6: email delivery mechanism,
the two verified backends (proposal: Radicale + Nextcloud, Google retained
best-effort), cancellation-link semantics, repo licence.

*Exit: each decision recorded; licence chosen before first push.*

## M1 — Core rebuild

Worker API and SPA rebuilt from the spike, with the plain-JWT security
model and the two-logical-calendar configuration from day one. Verified
against Google (the known backend) in both configurations: coinciding
calendars and separate availability/store.

*Exit: automated test suite runs the full flow — list, book, conflict,
cancel — against a real backend; CI builds both halves.*

## M2 — Backend verification

The two chosen backends verified by the same suite against real
instances, at least one self-hosted. Document the Proton path (store
elsewhere + ICS view + CalDAV client for painting `OPEN`).

*Exit: test suite green on two backends; "any CalDAV server" claims
removed or substantiated.*

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
