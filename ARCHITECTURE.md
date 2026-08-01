# Booking Calendar — Architecture

> Initial version, 2026-08-01, distilled from the spike phase (rationale in
> `LEARNINGS.md`, spike repository). This document is the authoritative home
> for the mechanisms below; other documents reference it rather than
> restating. `SCOPE.md` says what is being built and why.

## 1. Topology

Three parts, nothing else:

1. **SPA** — static frontend (FullCalendar), served from free static
   hosting. Holds no secrets.
2. **Worker API** — Cloudflare Worker exposing a booking-domain API. Holds
   the CalDAV credentials and the grant-signing key. Never a calendar
   proxy: slot computation and booking/conflict logic live here.
3. **CalDAV backend(s)** — sole persistence layer. No database, no
   server-side session state.

## 2. Calendar model

The system uses **two logical calendars**, configured independently:

- **Availability calendar** — read-only to the system. `OPEN` events here
  define availability. Reads use only CalDAV `REPORT`, so read-only
  credentials suffice; the system never writes to this calendar.
- **Booking store** — read/write. Bookings are created here as VEVENTs
  (`PUT {calendarUrl}/{uid}.ics`) and cancelled by `DELETE` of the same
  resource. This is the only place the system writes.

The two roles may resolve to the **same backend calendar** — one calendar
holding both `OPEN` and booked events, the original single-calendar
design — in which case the window is queried once. Or they may be
separate, e.g. when the practitioner keeps `OPEN` slots in a calendar the
tool must not modify. Code always addresses the two roles; whether they
coincide is configuration.

**Slot rule:** `OPEN` events are recognised only in the availability
calendar. Every other event, in either logical calendar, blocks. With
coinciding calendars this is exactly the spike behaviour; with separate
calendars, bookings in the store block, and any stray non-`OPEN` events in
the availability calendar block too.

CalDAV usage is deliberately narrow: `REPORT` (calendar-query with
time-range filter, `Depth: 1`), `PUT`, `DELETE`, `GET` of a single event.
Parse with `ical.js`; generate VCALENDAR text by hand (CRLF endings).
Google deviations (URL-encoded calendar ID, mandatory `Depth: 1`, ignored
`If-None-Match`) are documented in the spike repository.

## 3. Domain API

Three endpoints, booking-domain-shaped:

- `GET /v1/slots` — computed open slots for a window, each with its
  create-grant (§5).
- `POST /v1/bookings` — book a slot; requires the slot's create-grant.
- `DELETE /v1/bookings/:uid` — cancel; requires the booking's
  delete-grant.

Errors are RFC 9457 Problem Details. Field names are chosen deliberately
and prefixed by role (`slot_start`, not `start`).

## 4. Slot computation

Partition the window's events into `OPEN` (availability calendar only) and
blocking (everything else, both calendars); walk a cursor through each
`OPEN` event in `SLOT_MINUTES` steps; emit sub-slots not overlapped by any
blocking event. Configurable: slot length, booking horizon, minimum
notice.

## 5. Security

Capability grants as plain signed JWTs (ES256, `jose` or raw Web Crypto).
No UCAN, no DIDs, no server-side session state.

- **Sessions**: non-extractable P-256 key pair generated in the browser,
  held in IndexedDB. Grants are bound to the session's public key
  (`aud` = JWK thumbprint); requests are signed by the session key.
- **Create-grant = availability proof.** Issued per open slot with the
  slot list, short-lived (30 min). Possession proves the slot was open
  when listed, so the booking path re-checks only for conflicting
  bookings, never for `OPEN` events.
- **Delete-grant** issued on successful booking, bound to the booking
  session, expiring at slot start + grace (24 h default). Lifetime is a
  property of the resource; no revocation state.
- **Double-booking**: CalDAV `PUT` is not atomic, so check-after-insert —
  insert, re-query the window in the store, roll back with `DELETE` on
  conflict, return 409. Acceptable at practitioner-scale traffic; a
  per-slot Durable Object lock is the known escalation if ever needed.
- **Anti-abuse**: per-IP rate limiting on grant issuance (the slot-list
  endpoint). Replay bounded by short TTL + `iat` freshness.
- **Blast radius**: the Worker holds write credentials only for the
  booking store. With a separate read-only availability calendar, a
  compromised Worker cannot alter the practitioner's availability, only
  the bookings it manages anyway. Server key rotation invalidates
  outstanding grants; accepted (grants are short-lived and the
  practitioner can always cancel from their own client).

## 6. Configuration

One obvious place (`wrangler` config + secrets). Operational settings as
vars; credentials and keys as secrets. Each logical calendar gets its own
URL and credentials; pointing both at the same values is the
single-calendar setup. All required config is validated at the top of
`fetch` — Workers have no startup hook, and missing secrets otherwise
surface as cryptic crypto errors mid-request.

## 7. Deliberately absent

No database. No customer accounts or cross-device identity (the emailed
cancellation link covers the need). No practitioner UI beyond their own
calendar client. No calendar-proxy endpoints. Deploys are explicit, never
a side effect of push.
