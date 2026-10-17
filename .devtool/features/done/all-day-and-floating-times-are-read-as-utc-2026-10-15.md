---
id: "all-day-and-floating-times-are-read-as-utc-2026-10-15"
status: "done"
priority: "high"
assignee: null
epic: "Slot rule"
dueDate: null
created: "2026-10-15T05:00:50.000Z"
modified: "2026-10-17T07:05:04.000Z"
completedAt: "2026-10-17T07:05:04.000Z"
labels: ["0.1.x", "bug"]
order: "a1"
---
# All-day and floating times are read as UTC

> Written 2026-10-15, one of five defects found by probing the Worker's
> parsing and slot code during the survey in
> `docs/open-event-precedents.md`, each confirmed by reading the code.
> Fails unsafe west of UTC.

A `DATE` value, or a `DATE-TIME` with neither `Z` nor `TZID`, is
floating: RFC 5545 means the reader's local time. ical.js resolves
floating values in the runtime's zone, and a Worker's is UTC. An all-day
event therefore covers midnight to midnight UTC. For a Helsinki
practitioner that is 03:00 to 03:00 in summer, harmless by day. At UTC−5
it is 19:00 the evening before to 19:00 the day itself: a Busy all-day
event leaves that day's evening slots on offer and blocks the evening
before. Floating timed events shift by the whole offset. Values with
`TZID` or `Z`, which most clients write, are unaffected.

**Fix.** Resolve floating values in the practitioner's zone, at the one
point where `eventsIn` converts to instants (`toEvent`). ical.js carries
no zone data; take the offset from `Intl`, whose zone data the email
code already relies on. The zone is `DISPLAY_TIMEZONE`, which the
wizard always sets (defaulting to the browser's) and `deploy.yml`
always passes, but which `config.ts` validates only when email is
configured: validate it always.

**Tests.** Unit: an all-day event and a floating timed event resolve
correctly in a zone east and a zone west of UTC, across a daylight-
saving change; a `TZID` event is unchanged.

## Acceptance

- The unit tests above; CI green.
- `ARCHITECTURE.md` §2 says what the code does: floating values in the
  practitioner's zone.
- `PRIVACY.md` checked against the §2 edit, as `CLAUDE.md` requires; no
  change expected.

Done 2026-10-17: one conversion in `caldav.ts` reads a floating value, a
`DATE` or a `DATE-TIME` with neither `Z` nor `TZID`, in
`DISPLAY_TIMEZONE`, which `config()` now validates always (4f989a8). Two
consequences followed. The backend evaluates a floating value by its own
clock, UTC on Radicale and Nextcloud, so an all-day entry on the
practitioner's day ahead lay outside its filter while inside the window:
the `REPORT` now asks a day beyond the window on each side, `eventsIn`
window-checks single events too, and a live case per backend shows it
(034939e). The wizard filed the zone under email, so a fork with email
off deployed it empty: it is a booking-shape setting now (f95db7e); a
fork deployed with email off before this needs its `DISPLAY_TIMEZONE`
Actions variable set before it redeploys, which the health check reports
until then (noted on `m65-reconfiguration-2026-10-10`). Within the hour
a daylight-saving change repeats or skips, the conversion can land an
hour from RFC 5545 §3.3.5's reading; accepted. Converting a floating
occurrence costs about 19 µs, noted on
`one-long-recurrence-takes-the-booking-page-down-2026-10-15`. Unit,
Radicale, Nextcloud and Google suites green locally; `ARCHITECTURE.md`
§2 and §7 updated; `PRIVACY.md` checked, no change.