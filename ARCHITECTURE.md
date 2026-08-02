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
  resource. This is the only place the system writes. Their uids are
  `booking-<compact UTC timestamp>-<uuid>`, which marks the events the
  system wrote — nothing else about a VEVENT is attendee-independent, the
  `SUMMARY` being the attendee's name — and orders them by creation time
  (§5 arbitrates on that order).

The two roles may resolve to the **same backend calendar** — one calendar
holding both `OPEN` and booked events, the original single-calendar
design — in which case the window is queried once. Or they may be
separate, e.g. when the practitioner keeps `OPEN` slots in a calendar the
tool must not modify. Code always addresses the two roles; whether they
coincide is configuration.

**Slot rule:** availability is an `OPEN` event in the availability
calendar that the system did not write. Every other event, in either
logical calendar, blocks — including a booking whose attendee happens to
be called `OPEN`, which the uid distinguishes. With coinciding calendars
this is exactly the spike behaviour; with separate calendars, bookings in
the store block, and any stray non-`OPEN` events in the availability
calendar block too.

CalDAV usage is deliberately narrow: `REPORT` (calendar-query with
time-range filter, `Depth: 1`), `PUT`, `DELETE`, `GET` of a single event.
Parse with `ical.js`; generate VCALENDAR text by hand (CRLF endings).

**Recurrence is the server's job.** The `REPORT` asks for
`<c:expand>` over the queried window, so each occurrence arrives as its
own VEVENT with a real `DTSTART` and no `RRULE` is ever interpreted here:
the server must already expand recurrences to evaluate the time-range
filter, so this only asks it to return what it computed. A backend that
ignores `expand` would silently drop recurring availability, so each
supported backend has a live test for it.
Google deviations (URL-encoded calendar ID, mandatory `Depth: 1`, ignored
`If-None-Match`) are documented in the spike repository.

## 3. Domain API

Three endpoints, booking-domain-shaped:

- `GET /v1/slots` — computed open slots for a window, with one create-grant
  covering the returned list (§5).
- `POST /v1/bookings` — book a slot; requires the slot's create-grant.
- `DELETE /v1/bookings/:uid` — cancel; requires the booking's
  cancellation token (§5).

Errors are RFC 9457 Problem Details. Field names are chosen deliberately
and prefixed by role (`slot_start`, not `start`).

## 4. Slot computation

1. **Availability.** Take the window's availability events (§2) from the
   availability calendar and normalise them to their **union**: sort by start, merge any
   pair that overlaps or abuts. Overlapping `OPEN` events must not yield
   duplicate or differently-phased slots.
2. **Seams.** Where two `OPEN` events merely *abut*, emit a zero-length
   **phantom blocking event** at the join. A booking must not span a seam the
   practitioner painted: an overlap is evidence of intended continuous
   availability, mere abutment is two separately-painted sessions. The
   phantom needs no special case below — under the strict inequalities in
   step 4 a zero-length interval at `t` blocks exactly the slots with
   `cursor < t < slotEnd`, and neither the slot ending at `t` nor the one
   starting at `t`.
3. **Blocking.** Every event in *either* calendar that is not availability
   blocks, plus the phantoms. When the two roles resolve to one calendar this is one query.
4. **Emission.** Clamp the union to `[now + minimum notice, now + horizon]`,
   then walk a cursor from each merged interval's start in `SLOT_MINUTES`
   steps. Emit `[cursor, cursor + SLOT_MINUTES)` when it fits inside the
   interval and no blocking event `b` satisfies
   `b.start < slotEnd && b.end > cursor`.

Consequently a blocking event *partially* overlapping an `OPEN` interval
removes exactly the sub-slots it touches and leaves the rest bookable —
identical treatment to an existing booking. Touching at an endpoint does not
block. A trailing remainder shorter than `SLOT_MINUTES` is discarded. Slot
phase is anchored to each merged interval's start, not to the clock hour.

Configurable: slot length, booking horizon, minimum notice.

## 5. Security

Capability grants as plain signed JWTs (ES256, `jose` or raw Web Crypto).
No UCAN, no DIDs, no server-side session state.

- **Sessions**: non-extractable P-256 key pair generated in the browser,
  held in IndexedDB. Create-grants are bound to the session's public key
  (`aud` = JWK thumbprint); requests are signed by the session key.
- **Create-grant = availability proof.** *One* grant is issued with the slot
  list, enumerating the open slot starts in a `slots` claim, short-lived
  (30 min). Possession proves those slots were open when listed, so the
  booking path re-checks only for conflicting bookings, never for `OPEN`
  events. An explicit enumeration is not the time-window wildcard that would
  lose this property and need a compensating availability check. One grant
  rather than one per slot because per-slot issuance does not fit the budget:
  80 ES256 signatures cost ≈ 3.8 ms of the 10 ms free-tier CPU allowance and
  ≈ 450 bytes each on the wire, so a month's slots would exceed both. The
  response is bounded by a `MAX_SLOTS` guard that asks for a narrower window.
- **Cancellation token** issued on successful booking: a bearer ES256 JWT
  naming the booking UID, expiring at slot start. Deliberately *not*
  session-bound — it is delivered in the confirmation email, and
  possession of the email is the authority (the magic-link trust model),
  which is what makes cancelling from another device work. The link
  carries the token in the URL **fragment** (never sent to servers, so it
  stays out of logs and Referer headers); the SPA reads it and sends it in
  a header. The linked page only *shows* the booking on load — cancelling
  requires an explicit button issuing the DELETE, so mail-scanner URL
  prefetch cannot cancel. Replay is harmless: DELETE is idempotent and a
  cancelled booking's disappearance is the revocation, so no single-use
  state is needed.
- **Double-booking**: CalDAV `PUT` is not atomic, so check-after-insert —
  insert, re-query the slot in the store, roll back with `DELETE` on
  conflict, return 409. The slot belongs to the **earliest** booking uid
  in it (§2), and outright to any event the system did not write, so two
  simultaneous bookings settle into one 200 and one 409 rather than two
  rollbacks leaving the slot empty. Residual window: a request whose
  re-query lands before the other's `PUT` sees no conflict, so two
  overlapping bookings can still stand. Acceptable at
  practitioner-scale traffic; a per-slot Durable Object lock is the known
  escalation if ever needed.
- **Anti-abuse**: per-IP rate limiting on grant issuance (the slot-list
  endpoint). Replay bounded by short TTL + `iat` freshness.
- **Blast radius**: the Worker holds write credentials only for the
  booking store. With a separate read-only availability calendar, a
  compromised Worker cannot alter the practitioner's availability, only
  the bookings it manages anyway. Server key rotation invalidates
  outstanding create-grants and emailed cancellation links; accepted
  (create-grants live 30 minutes, and the practitioner can always cancel
  from their own client).

**Wire format.** `GET /v1/slots` carries the session's JWK thumbprint in
`X-Session-Thumbprint`. `POST /v1/bookings` carries the create-grant in
`Authorization: Bearer` and a session proof in `X-Session-Proof` — an ES256
JWT signed by the session key, header `{ alg, jwk }`, payload `{ iat }`; the
Worker verifies it against the embedded JWK, checks `iat` freshness, and
checks that the JWK's RFC 7638 thumbprint equals the grant's `aud`. The proof
binds no method or URI: exactly one endpoint is proof-gated, so there is
nowhere to replay a proof to. `DELETE /v1/bookings/:uid` carries the
cancellation token in `Authorization: Bearer` and needs no proof, being a
bearer capability by design.

## 6. Email

One transport behind a one-function seam (`sendEmail()`): the Brevo
transactional HTTP API — a single `fetch` from the Worker, free tier
(300/day) far above practitioner volume. The operator brings their own
sender identity: a sender address on their domain with SPF/DKIM records
at their DNS; the Brevo API key is a Worker secret. The seam exists so a
provider change is one function, not a rewrite.

SMTP submission to the operator's own mailbox was considered and
deferred (`ROADMAP.md` Later): Workers cannot speak SMTP over `fetch`,
so it needs the TCP-sockets API plus an SMTP client dependency, and
mailbox credentials in the Worker would grant mail-*reading* access — a
worse blast radius than a send-only API key.

## 7. Configuration

One obvious place (`wrangler` config + secrets). Operational settings as
vars; credentials and keys as secrets. Each logical calendar gets its own
URL and credentials; pointing both at the same values is the
single-calendar setup.

Configuration is parsed once at the top of `fetch` — Workers have no
startup hook — into the units the code uses (durations in milliseconds,
the two calendar handles, the allowed origins). Parsing *is* the
validation: nothing is read anywhere that was not converted there, so a
setting cannot be validated and then re-read raw somewhere else, and
missing secrets cannot surface as cryptic crypto errors mid-request. A
misconfigured Worker answers 500 Problem Details without CORS headers,
the allowed origins being configuration themselves.

## 8. Deliberately absent

No database. No customer accounts or cross-device identity (the emailed
cancellation link covers the need). No practitioner UI beyond their own
calendar client. No calendar-proxy endpoints. Deploys are explicit, never
a side effect of push.
