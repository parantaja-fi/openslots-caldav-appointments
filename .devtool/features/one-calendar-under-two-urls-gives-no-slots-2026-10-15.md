---
id: "one-calendar-under-two-urls-gives-no-slots-2026-10-15"
status: "backlog"
priority: "medium"
assignee: null
epic: "Slot rule"
dueDate: null
created: "2026-10-15T05:00:50.000Z"
modified: "2026-10-15T13:59:27.000Z"
completedAt: null
labels: ["0.1.x", "bug"]
order: "a0"
---
# One calendar under two URLs gives no slots

> Written 2026-10-15, one of five defects found by probing the Worker's
> parsing and slot code during the survey in
> `docs/open-event-precedents.md`, each confirmed by reading the code.
> Empties the booking page, silently.

The roles coincide when the two URLs are equal strings (`config.ts`).
Name one calendar twice, with and without a trailing slash, or with
`%40` for `@`, and both queries return the same events: each `OPEN`
event, read again as a store event, blocks itself, since `computeSlots`
blocks every store event. The wizard writes one URL into both settings
when the practitioner chooses one calendar, so this needs a hand
configuration per `SETUP.md`. Relatedly, listing and booking disagree:
`computeSlots` blocks an `OPEN` event in a separate store, `lostRace`
ignores it.

**Fix.** Make `OPEN` events in the store neutral in `computeSlots`, as
`lostRace` already treats them: they neither offer nor block. A booking
whose attendee is called `OPEN` still blocks, `isOpen` excluding
`booking-…` uids. Detecting coincidence then only saves a query: a
missed one costs a duplicate `REPORT` and changes no slot. Normalising
URLs instead would be fragile, servers aliasing collections in more
ways than a normaliser can know. `ARCHITECTURE.md` §2's slot rule
changes with it: an `OPEN` event painted into a separate store is
ignored rather than blocking.

**Tests.** Unit, `slots.test.ts`: the same events passed as both
availability and store give the coinciding result; an `OPEN` event in a
separate store neither offers nor blocks; a booking titled `OPEN` still
blocks. Live: a third configuration in `flow.live.test.ts`, the
availability URL under a second spelling, on the backends that accept
both without redirecting.

## Acceptance

- The unit and live tests above. Radicale green in CI; Nextcloud and
  Google green on the next `main` run.
- `ARCHITECTURE.md` §2 says what the code does: `OPEN` in a separate
  store ignored.
- `PRIVACY.md` checked against the §2 edit, as `CLAUDE.md` requires; no
  change expected.