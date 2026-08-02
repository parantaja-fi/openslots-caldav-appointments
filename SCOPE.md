# Booking Calendar — Scope

> Seed document for the product repository, 2026-08-01. Written at the close
> of the spike phase; the distilled findings are in `LEARNINGS.md` in the
> spike repository (`../parantaja-booking-calendar-spikes`), which also holds all
> spike code for reference. This document says what is being built and for
> whom; it is not an implementation plan.

---

## 1. Goal

An **independent, free-to-host or cheap-to-host booking calendar for
practitioners** — solo or small-practice professionals (therapists, healers,
teachers, consultants) who want customers to book appointments against their
real calendar without subscribing to a SaaS booking platform or surrendering
their data to one.

**Acceptance test for 1.0**: a practitioner who is not the author, with
ordinary computer literacy and no help beyond the repository's documentation,
deploys the system for themselves and takes a real booking.

Everything in scope serves that test. Anything that does not is out.

## 2. Users

- **Practitioner (operator).** Owns a calendar; marks availability by
  creating events titled `OPEN` in it, using whatever calendar client they
  already use. Deploys and configures the system once. Not assumed to be a
  developer, but assumed able to follow a careful step-by-step guide
  (create accounts, copy secrets, run a few commands).
- **Customer.** Follows a link, sees free slots, books one with name and
  email, receives a confirmation, can cancel. No account, no app install,
  no assumptions about their calendar provider.

## 3. Product shape (settled by the spikes)

Carried forward as constraints, not open questions — rationale in
`LEARNINGS.md`:

- **CalDAV is the sole persistence layer.** No database. Bookings are
  events; availability is `OPEN` events; cancellation deletes an event.
- **Two logical calendars: availability and booking store.** The system
  reads `OPEN` events from an *availability calendar* it never writes,
  and reads and writes booking events in a *booking store*. These are
  roles, not necessarily distinct calendars: both may point at the same
  backend calendar (one calendar holding OPEN and booked events), or the
  practitioner may keep OPEN slots in a separate calendar — for instance
  one the system holds only read credentials for, which narrows what a
  compromised deployment could touch.
- **Store/surface split.** Both logical calendars are CalDAV; the booking
  store is the only place the system writes. The practitioner interacts
  with either through any standard CalDAV client, and providers without
  CalDAV (notably Proton) are supported as read-only viewing surfaces via
  ICS subscription, never as the store. The store may live on the
  practitioner's existing provider (Google, Fastmail, Nextcloud, …) or a
  small self-hosted server (Radicale, Baïkal).
- **Three-part topology**: static SPA (free static hosting) + small
  serverless API (free-tier Cloudflare Worker) + the CalDAV store. The API
  is booking-domain-shaped (`slots`, `bookings`), never a calendar proxy.
- **Security = capability grants as plain signed JWTs.** Per-slot,
  short-lived create-grants issued with the slot list (the grant doubles as
  the availability proof); a bearer cancellation token issued per booking,
  carried by the emailed cancellation link, expiring at slot start. ES256,
  sessions identified by browser-held non-extractable keys. No UCAN, no
  DIDs, no server-side session state.
- **Minimal dependencies, TypeScript strict throughout.** FullCalendar on
  the frontend, `ical.js` + `jose` (or raw Web Crypto) on the Worker;
  nothing else without a fight.

## 4. In scope for 1.0

Functional:

1. Slot browsing and booking (the spike flow, unchanged in substance).
2. Cancellation by the customer, from the booking confirmation.
3. **Booking confirmation email** to the customer, carrying the
   cancellation link. (Also the answer to cancelling from another device.)
4. Practitioner notification of new bookings — via their own calendar
   client's normal mechanisms if possible; email only if that proves
   inadequate.
5. Configurable slot length, booking horizon, and minimum notice.

Backends and verification:

6. **Two verified backends: Radicale (self-hosted) and Nextcloud**, with
   Google retained best-effort from the spikes (reusing the spike
   credentials). "Verified" means an automated test suite runs the full
   booking flow against a real instance. All three are green as of
   2026-08-02; "any CalDAV server" remains an unsubstantiated claim, and
   Google showed why — see `ROADMAP.md` M2.
7. A documented Proton path: booking store elsewhere + ICS subscription
   for viewing + a standard CalDAV client for painting availability.

Operator experience (the actual 1.0 substance):

8. **Operator guide**: prerequisites, per-backend setup, secrets, deploy,
   custom domain, smoke test. Written for the §2 practitioner, tested by
   the §1 acceptance test.
9. One-command (or near) deploy; configuration in one obvious place; a
   built-in health/config check that tells the operator what is wrong.
10. CI that builds both halves and runs the test suite; deploys are
    explicit, never a side effect of push.

## 5. Out of scope for 1.0

- Multi-practitioner scheduling, or aggregating availability across more
  calendars than the two roles in §3.
- Payments, deposits, or pricing.
- Customer accounts, PassKeys, or any cross-device identity (the emailed
  cancellation link covers the real need).
- Recurring bookings, waiting lists, reminders.
- Any UI for the practitioner beyond their own calendar client.
- Proton (or any provider) as a booking store via unofficial APIs.
- Native apps; anything requiring a database.

Out of scope permanently unless the goal changes: features whose natural
home is an automation platform (CRM rows, follow-up sequences). The API
stays clean enough that n8n/Windmill can consume it; we do not become them.

## 6. Open decisions to settle first

None remaining. Email, backends, and cancellation-link semantics were
settled 2026-08-01; the decisions are recorded in `ARCHITECTURE.md`
(§5, §6) and `ROADMAP.md` M0.
