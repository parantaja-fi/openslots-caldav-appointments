---
id: "practitioner-guidance-for-open-events-2026-10-17"
status: "backlog"
priority: "medium"
assignee: null
epic: "Documentation"
dueDate: null
created: "2026-10-17T06:28:50.000Z"
modified: "2026-10-17T06:28:50.000Z"
completedAt: null
labels: ["0.1.x"]
order: "a6"
---
# Practitioner guidance for OPEN events

> Opened 2026-10-17, when
> `decide-events-marked-free-should-not-block-2026-10-14` landed in code,
> for the guidance `docs/open-event-precedents.md` §6 drafted from the
> survey. Guidance, not mechanism: `ARCHITECTURE.md` §2 stays the home
> of what the code does.

`SETUP.md` Part 6 and the wizard's "Open some time for booking" step
(`wizard/src/steps.ts`) say nothing about how to paint `OPEN` events
well. §6 has the points, each from the precedents it cites:

- Mark `OPEN` events Free where the app allows: a Busy `OPEN` event
  shows the practitioner as busy exactly when bookable. Never required;
  with a separate availability calendar a per-calendar "never show me as
  busy" does the same, never on a calendar that also holds bookings.
- Deleting an `OPEN` event that holds a booking keeps the booking, but a
  later cancellation will not reopen its time until `OPEN` is painted
  there again. Until `decide-re-check-open-coverage-at-booking-2026-10-14`
  lands, a deleted `OPEN` event also stays bookable from pages already
  open for up to `GRANT_TTL_SECS`.
- Overlap blocks meant to be continuous; abutting blocks leave a seam no
  booking spans, per the ruling of
  `decide-phase-of-abutting-open-events-2026-10-15` (unmerge,
  2026-10-17); word it from the code once that card lands.
- Paint timed `OPEN` events, not all-day ones: the Worker gives an
  all-day `OPEN` event no special meaning and offers slots round the
  clock.
- An all-day event left at its default Free no longer closes a day
  (since 2026-10-17): shorten the `OPEN` events or add a Busy event.

## Acceptance

- `SETUP.md` Part 6 and the wizard step carry the guidance, in words
  checked against `ARCHITECTURE.md` §2 as it stands then: the coverage
  re-check and abutting cards may have landed by then.
- `scripts/check-cards.sh` and lychee green.