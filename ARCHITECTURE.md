# Booking Calendar — Architecture

> Initial version, 2026-08-01, distilled from the spike phase (rationale in
> `LEARNINGS.md`, spike repository). This document is the authoritative home
> for the mechanisms below; other documents reference it rather than
> restating. `SCOPE.md` says what is being built and why.

## 1. Topology

Four parts:

1. **SPA** — static frontend (FullCalendar), served from free static
   hosting. Holds no secrets.
2. **Worker API** — Cloudflare Worker exposing a booking-domain API. Holds
   the CalDAV credentials and the grant-signing key. Never a calendar
   proxy: slot computation and booking/conflict logic live here.
3. **CalDAV backend(s)** — sole persistence layer. No database, no
   server-side session state.

```
 customer's browser          Cloudflare                 CalDAV backend(s)
┌───────────────────┐       ┌────────────────┐         ┌───────────────────┐
│ SPA — static page,│ grant,│ Worker API —   │ REPORT, │ availability      │
│ holds no secrets; │ proof,│ holds CalDAV   │ PUT,    │ calendar — read   │
│ session key in    │ token │ credentials and│ DELETE  ├───────────────────┤
│ IndexedDB         │──────▶│ signing key    │────────▶│ booking calendar  │
└───────────────────┘  (§5) └───────┬────────┘   (§2)  │ read and write    │
                                    │ API key          └───────────────────┘
                                    ▼ one fetch (§6)
                              Brevo — email
```

Every secret sits on the Worker's side of the first hop; what crosses
to the customer are signed, expiring cryptographic capabilities.
The availability calendar only ever sees reads (`REPORT`).
The bookings are written to the booking calendar.

4. **Setup wizard**

Beside the actual system and separate from it.
The wizard is a second static page served at `/wizard/`.
Its provisioning stage commits one additional file to the fork
(`.wizard/fork.json`), and writes GitHub Actions secrets and variables.
The committed file contains the fork's
provenance and when its configuration was last stored, public facts only.
With it, any browser can tell a configured fork without a token.
The wizard's outside links all open in one work window beside it.
Google Calendar, the one provider whose by-hand route crosses
two consoles, has its own guided sub-wizard inside the calendars step.

## 2. Calendar model

The system uses **two logical calendars**, configured independently:

- **Availability calendar** — read-only to the system. `OPEN` events here
  define availability. Reads use only CalDAV `REPORT`, so read-only
  credentials suffice; the system never writes to this calendar.
- **Booking calendar** — read/write. Bookings are created here as VEVENTs
  (`PUT {calendarUrl}/{uid}.ics`) and cancelled by `DELETE` of the same
  resource. This is the only place the system writes. Their uids are
  `booking-<compact UTC timestamp>-<uuid>`, which marks the events the
  system wrote — nothing else about a VEVENT is attendee-independent, the
  `SUMMARY` being the attendee's name — and orders them by creation time
  (§5 arbitrates on that order). The customer's email address, and their
  note when they left one, are the `DESCRIPTION`: an `ATTENDEE` property
  would be the semantically correct home, but it invites the backend's own
  scheduling — Google treats it as an invitation to send — where a
  description line is inert everywhere and is what the practitioner's
  calendar client shows them anyway.

The two roles may resolve to the **same backend calendar** — one calendar
holding both `OPEN` and booked events, the original single-calendar
design — in which case the window is queried once. Or they may be
separate, e.g. when the practitioner keeps `OPEN` slots in a calendar the
tool must not modify. Code always addresses the two roles; whether they
coincide is configuration.

**Slot rule:** availability is an `OPEN` event in the availability
calendar that the system did not write. In a separate store such an
event is neither availability nor a blocker, so listing and booking
(§5.3) agree about it. One calendar named under two spellings, its
`OPEN` events read again as the store's, thus behaves as the coinciding
configuration: detecting coincidence, by equal URL strings, only saves
a query. Every other event, in either logical calendar, blocks —
including a booking whose attendee happens to be called `OPEN`, which
the uid distinguishes. With coinciding calendars this is exactly the
spike behaviour; with separate calendars, bookings in the store block,
and any stray non-`OPEN` events in the availability calendar block too.
The exception is an event marked Free (`TRANSP:TRANSPARENT`, RFC 5545
§3.8.2.7), which does not block unless it is one of the system's own
bookings: those block whatever their transparency, the uid again
distinguishing. An `OPEN` event marked Free is still availability, and
transparency is read per occurrence, from the override where there is
one.

CalDAV usage is deliberately narrow: `REPORT` (calendar-query with
time-range filter, `Depth: 1`), `PUT`, `DELETE`, `GET` of a single event.
Parse with `ical.js`; generate VCALENDAR text by hand (CRLF endings).

**Recurrence is expanded here.** The `REPORT` carries the time-range
filter alone. Every backend evaluates that filter against occurrences, so
a recurring master whose `DTSTART` precedes the window still arrives; the
Worker then expands `RRULE`, `EXDATE` and `RECURRENCE-ID` itself with
`ical.js`, registering any `VTIMEZONE` it was sent so a `TZID` resolves to
the right instant. A floating value — a `DATE`, as an all-day entry has,
or a `DATE-TIME` with neither `Z` nor `TZID` — is taken in the
practitioner's zone, `DISPLAY_TIMEZONE`, a Worker's own clock being UTC;
a `TZID` whose `VTIMEZONE` did not arrive falls back the same way. The
backend, though, evaluates a floating value by its own clock, so the
`REPORT` asks for a day beyond the window on each side and `eventsIn`
applies the window itself.
The walk through a series ends at the window's end by
nominal time, the time a `RECURRENCE-ID` names; an override counts by its
own, moved times wherever its nominal time lies, so an occurrence moved
out of the window drops out and one moved in from beyond its end counts.
Whether a series that overlaps the window only through such an override
arrives at all is for the backend's time-range filter to decide: Radicale
and Nextcloud return the whole resource, Google the matching override
alone with its master pruned, which the Worker reads as the single event
it describes.
The `REPORT` used to ask for `<c:expand>` instead.
Google ignores that element and returns the unexpanded master without
saying so, which turned a practitioner's weekly `OPEN` events into an
empty slot list — silently, and on the one backend most likely to be
used. Expanding here is the same work on every backend, and it is covered
by unit tests rather than by trust.
Google deviations (URL-encoded calendar ID, mandatory `Depth: 1`, ignored
`If-None-Match`) are documented in the spike repository.

## 3. Domain API

Five endpoints, booking-domain-shaped:

| Endpoint | Requires (§5) | Returns |
|----------|---------------|---------|
| `GET /v1/slots` | the session's key thumbprint | computed open slots for a window, with one create-grant covering the returned list |
| `POST /v1/bookings` | the slot's create-grant and a session proof | the booking, its cancellation token, and `confirmation_email` |
| `GET /v1/bookings/:uid` | that booking's cancellation token | the booking's times, for the page the emailed link lands on |
| `DELETE /v1/bookings/:uid` | that booking's cancellation token | cancellation |
| `GET /v1/health` | nothing — token-less | deployment health, for `curl`, the deploy CI's closing probe and the setup wizard (`ROADMAP.md` M5) |

For `POST /v1/bookings`, the required `attendee.email` is where the
confirmation and its cancellation link go.
In addition to the cancellation token, the response carries
`confirmation_email`: `sent`, `failed`, or `disabled`, the
latter when the deployment configured no transport.
A stored booking is never undone by a mail failure.
Hence, the caller is told instead (§6).

The `GET /v1/bookings/:uid` returns 404 once the booking is gone.
This is how the page knows a booking was already cancelled.
It answers times alone: the page needs no name or address,
so neither is echoed.

The `/v1/health` is token-less and CORS-open to any origin.
The body may carry booleans, coarse states, and env var names.
It should never carry a URL, hostname, address or key.
The endpoint checks the following:
- configuration parse status (§7), with the thrown message on failure;
- CalDAV reachability per calendar role
  (`availability` and `appointments`),
  probed with the same read a booking depends on,
  one probe when the roles coincide, each
  raced against a five-second timeout; and
- the email transport state: `configured`, `off`, or `missing_key`,
  when a sender address is set but
  the API key secret is not, the forgot-the-secret shape a booking
  otherwise reports only in its own response (§6).

It reports 200 when everything is healthy (`off` is healthy: it is deliberate),
503 otherwise, so a `curl -f` is the whole probe.
Rate-limited like every other route, which is also the answer
to strangers driving CalDAV probes:
a health call costs its caller what an unauthenticated `/v1/slots`
call already could.

Errors are RFC 9457 Problem Details. Field names are chosen deliberately
and prefixed by role (`slot_start`, not `start`).

## 4. Slot computation

1. **Availability.** Take the window's availability events (§2) from the
   availability calendar and normalise them to their **union**: sort by
   start, merge any pair that overlaps. Overlapping `OPEN` events must not
   yield duplicate or differently-phased slots; an overlap is evidence of
   intended continuous availability. Mere abutment, though, is two
   separately-painted sessions: abutting events stay separate intervals,
   each phased from its own start, and a slot must fit inside one
   interval, so none spans the join. The availability calendar is read
   from a day before the window, so that an overlapping `OPEN` event
   ending before it still anchors the phase; a chain of overlapping `OPEN`
   events longer than a day can still shift phase as the window's start,
   at the earliest `now + minimum notice`, passes its earlier members.
2. **Blocking.** Every event in *either* calendar blocks, save
   availability, `OPEN` events in the store that the system did not write
   (§2), and those §2 exempts as Free. When the two roles coincide (§2)
   this is one query.
3. **Emission.** Clamp the union to `[now + minimum notice, now + horizon]`,
   then walk a cursor from each merged interval's start in `SLOT_MINUTES`
   steps. Emit `[cursor, cursor + SLOT_MINUTES)` when it fits inside the
   interval and no blocking event `b` satisfies
   `b.start < slotEnd && b.end > cursor`.

Consequently a blocking event *partially* overlapping an `OPEN` interval
removes exactly the sub-slots it touches and leaves the rest bookable —
identical treatment to an existing booking. Touching at an endpoint does not
block. A trailing remainder shorter than `SLOT_MINUTES` is discarded. Slot
phase is anchored to each `OPEN` interval's start, not to the clock hour.

Configurable: slot length, booking horizon, minimum notice.

## 5. Security

Capability grants are plain signed JWTs (ES256, `jose` or raw Web Crypto).
(No UCAN, no DIDs, no server-side session state; see the spikes for history.)

### 5.1 Session protection

Each browser session is protected with a non-extractable P-256 key pair generated
in the browser, held in IndexedDB.
Create-grants (see below) are bound to the session's public key
(`aud` = JWK thumbprint); requests are signed by the session key.

### 5.2 Creating and cancelling bookings

Creating a booking requires a create-grant, bound to the session (§5.4).

**Create-grants as the offer.**

For each available slot list, a *single* short-lived (30 min) create-grant is
minted for the session that asked. It enumerates the open slot beginnings in a `slots` claim.
Its possession confines a booking to a slot start actually listed.
The booking path re-checks the offer itself after its insert:
the slot must still be covered by the availability calendar's `OPEN` events,
one of their merged intervals (§4) containing it,
and nothing in either calendar may block it (§5.3).
Before the insert, it also refuses a slot start the minimum notice (§4)
has since overtaken.

The explicit enumeration of the slots is not the time-window wildcard.
A wildcard (once considered) would leave the slot's phase (§4) unchecked,
for the re-check tests coverage, not phase.

One grant per list rather than one per slot, because per-slot issuance would be costly:
80 ES256 signatures cost ≈ 3.8 ms of the 10 ms free-tier CPU allowance and
450 bytes each on the wire, so a month's slots would exceed both.

The response is bounded by a `MAX_SLOTS` guard that asks for a narrower window.

**Cancellation tokens issued on successful bookings.**

A cancellation token is a bearer ES256 JWT, naming
the booking UID, expiring at slot start.
Deliberately, it is *not* session-bound.
It is delivered in the confirmation email, and
its possession is the authority itself (the magic-link trust model).
This is what makes cancelling from another device work.
The link carries the token in the URL **fragment**,
which means it is never sent to servers and that it thereby
stays out of logs and Referer headers.
The SPA reads it and sends it in a header, when needed.

The booking UID rides in the query beside the token.
It is no secret on its own.

The linked page only *shows* the booking on load, through
`GET /v1/bookings/:uid`. Just clicking the link doesn't cancel.

Cancelling requires clicking an explicit button, which issues the `DELETE`.
Hence, a mail-scanner URL prefetch cannot cancel, and a prefetch
without the fragment cannot even read.

Replay is harmless: `DELETE` is idempotent.
A cancelled booking's disappearance is the revocation.
Hence, no single-use state is needed.

### 5.3 Error and attack scenarios

**Double-booking.**

CalDAV `PUT` is not atomic, so the Worker checks after inserting:
insert, re-query the slot in both calendars (one query when they coincide),
roll back with `DELETE` when the slot is no longer covered (§5.2) or is
blocked, return 409.
The slot belongs to the *earliest* booking UID in it (§2),
and outright to any event the system did not write that blocks (§2).
Hence, two simultaneous bookings settle into one 200 and one 409,
rather than two rollbacks leaving the slot empty.

A residual window remains: a request whose re-query lands before the
other's `PUT` sees no conflict, so two overlapping bookings can still
stand. That is acceptable at practitioner-scale traffic.
Closing it, if ever needed, must stay portable: no Durable Object or
other Cloudflare-only binding (card
`close-the-booking-race-window-portably-2026-08-01`).

**Abuse.**

Per-IP rate limiting applies to every request before it is routed.
Nothing reaches the calendar backend on an unmetered path.
Replay is bounded by the short token lifetimes and `iat` freshness.

Booking also sends mail, and the same limit is what bounds that.
Moreover, the message is fixed text to the one address the booker
typed, and reaching it at all costs a create-grant and an open slot.

**Blast radius.**

The Worker holds write credentials only for the booking calendar.
With a separate read-only availability calendar, a compromised Worker
cannot alter the practitioner's availability — only the bookings it
manages anyway.

Server key rotation invalidates outstanding create-grants and emailed
cancellation links. That is accepted: create-grants live 30 minutes,
and the practitioner can always cancel from their own client.

### 5.4 Wire format

`GET /v1/slots` carries the session's JWK thumbprint in
`X-Session-Thumbprint`.

`POST /v1/bookings` carries the create-grant in `Authorization: Bearer`
and a session proof in `X-Session-Proof`.
The proof is an ES256 JWT signed by the session key,
with header `{ alg, jwk }` and payload `{ iat }`.
The Worker verifies it against the embedded JWK, checks `iat`
freshness, and checks that the JWK's RFC 7638 thumbprint equals the
grant's `aud`.
The proof binds no method or URI: exactly one endpoint is proof-gated,
so there is nowhere to replay a proof to.

`DELETE /v1/bookings/:uid` carries the cancellation token in
`Authorization: Bearer` and needs no proof, being a bearer capability
by design.

## 6. Email

One transport behind a one-function seam (`sendEmail()`): the Brevo
transactional HTTP API — a single `fetch` from the Worker, free tier
(300/day) far above practitioner volume. The operator brings their own
sender identity: a sender address on their domain with SPF/DKIM records
at their DNS; the Brevo API key is a Worker secret. The seam exists so a
provider change is one function, not a rewrite.

Two messages, both plain text — nothing to escape, and it reads
everywhere. The **customer's confirmation** states the appointment in the
configured display zone (never UTC) and carries the cancellation link,
`{cancel URL}?uid={uid}#{token}` per §5. The **practitioner's notice**
adds the attendee's name, address and note, and goes out only when the
operator configured an address for it; no CalDAV client reliably alerts
on an event another client pushed in, so the calendar alone is not
notification.

Both are sent after the conflict re-check has passed, never before: only
a booking that survived is confirmed. Neither can undo the booking —
`sendEmail()` reports failure rather than throwing, and the response's
`confirmation_email` (§3) passes that on, so the page that made the
booking knows to keep offering the cancellation it still holds.

No API key means the deployment sends nothing and says `disabled`. That
is what lets `wrangler dev` and every live test run without reaching
Brevo; a production deployment that meant to send mail and forgot the
secret is what the M5.1 health check is for.

SMTP submission to the operator's own mailbox was considered and
deferred (card `smtp-submission-as-an-email-transport-2026-08-01`):
Workers cannot speak SMTP over `fetch`, so it needs the TCP-sockets API
plus an SMTP client dependency, and mailbox credentials in the Worker would grant mail-*reading* access — a
worse blast radius than a send-only API key.

## 7. Configuration

One obvious place (`wrangler` config + secrets). Operational settings as
vars; credentials and keys as secrets. Each logical calendar gets its own
URL and credentials; pointing both at the same values is the
single-calendar setup.

The email settings follow the same rule as the rest, with one wrinkle:
the API key decides whether they are read at all. Without it there is no
email configuration; with it, the sender address and the cancellation
page's URL must both be present and usable — a URL that will not parse
is refused there, not discovered in a sent message. The display zone is
not one of them: slot reading needs it as much as the email does (§2),
so it is read, and a zone the runtime cannot resolve refused, with or
without the key.

Configuration is parsed once at the top of `fetch` — Workers have no
startup hook — into the units the code uses (durations in milliseconds,
the two calendar handles, the allowed origins). Parsing *is* the
validation: nothing is read anywhere that was not converted there, so a
setting cannot be validated and then re-read raw somewhere else, and
missing secrets cannot surface as cryptic crypto errors mid-request. A
misconfigured Worker answers 500 Problem Details without CORS headers,
the allowed origins being configuration themselves.

The fork deploy (`.github/workflows/deploy.yml`, `ROADMAP.md` M5.2)
populates all of this from a public repository without committing any
of it: operational knobs come from Actions variables, credentials and
addresses from Actions secrets, and everything origin-shaped —
`ALLOWED_ORIGINS`, `CANCEL_URL`, the page's API URL and base path —
is derived on each run from the Pages settings and the Worker deploy
itself, so a renamed fork or a custom domain needs a re-run, never a
reconfiguration. The Worker is named `<owner>-booking-worker` after the
repository's owner, so the upstream and forks can share one Cloudflare
account.

## 8. Deliberately absent

No database. No customer accounts or cross-device identity (the emailed
cancellation link covers the need). No practitioner UI beyond their own
calendar client. No calendar-proxy endpoints. Deploys are explicit, never
a side effect of push.

## 9. Code map

| Section | Concept | Code |
|---------|---------|------|
| §1 | Wizard verifier probes (GitHub REST, health, DoH) | `wizard/src/probes.ts` |
| §1 | Wizard provisioning: fork writes, sealed-box secrets | `wizard/src/github.ts`, `wizard/src/sealedbox.ts` |
| §1 | The work window | `wizard/src/workWindow.ts` |
| §1 | Google sub-wizard | `wizard/src/google/`, `docs/google-calendar-wizard.md` |
| §2 | CalDAV wire, parsing, recurrence expansion | `worker/src/caldav.ts` |
| §2 | Booking uid; the slot rule (`OPEN`, blocking) | `worker/src/slots.ts` |
| §2 | OAuth tokens for Google's CalDAV endpoint | `worker/src/auth.ts` |
| §3 | The five routes, CORS, rate limiting | `worker/src/index.ts` |
| §3 | Problem Details errors | `worker/src/problem.ts` |
| §4 | Union, emission | `computeSlots` in `worker/src/slots.ts` |
| §5 | Create-grant, session proof, cancellation token — issue and verify | `worker/src/grants.ts` |
| §5 | The browser session key | `frontend/src/session.ts` |
| §5 | The wire headers | `frontend/src/api.ts` |
| §5 | The page the emailed link opens | `frontend/src/cancel.ts` |
| §5 | The offer re-check: coverage, double-booking arbitration | `covered` and `lostRace` in `worker/src/slots.ts`, under the booking route of `worker/src/index.ts` |
| §6 | `sendEmail()` seam, both messages | `worker/src/email.ts` |
| §7 | Parsing as validation | `worker/src/config.ts` |
| §7 | The deriving fork deploy | `.github/workflows/deploy.yml` |
