---
id: "a-moved-occurrence-breaks-recurrence-expansion-2026-10-15"
status: "done"
priority: "high"
assignee: null
epic: "Slot rule"
dueDate: null
created: "2026-10-15T05:00:50.000Z"
modified: "2026-10-17T06:28:50.000Z"
completedAt: "2026-10-17T06:28:50.000Z"
labels: ["0.1.x", "bug"]
order: "a0"
---
# A moved occurrence breaks recurrence expansion

> Written 2026-10-15, one of five defects found by probing the Worker's
> parsing and slot code during the survey in
> `docs/open-event-precedents.md`, each confirmed by reading the code.
> Fails unsafe, offering slots over a real appointment.
>
> `decide-re-check-open-coverage-at-booking-2026-10-14` re-checks
> coverage through the expansion repaired here: do this first, or
> together. That card and
> `decide-events-marked-free-should-not-block-2026-10-14` change
> `eventsIn` and `CalendarEvent` too.

`eventsIn` walks a series in recurrence-id order and stops at the first
occurrence whose start (the override's moved start, where there is one)
lies at or after the window's end. Two consequences:

- An occurrence moved past the window's end ends the walk early, and the
  window's later occurrences are lost. Probe: a daily series from 7
  September 09:00Z with its 8 September occurrence moved to 8 October;
  over 7–14 September only 7 September comes back.
- An occurrence moved into the window from beyond its end is never
  reached. Probe: a weekly series whose 21 September occurrence is moved
  to 10 September; a window holding 10 September and ending before 21
  September misses it.

For `OPEN` series this loses availability, which is safe. For blockers
it offers slots over a real appointment, and the booking path, reading
through the same code, does not catch it either. The existing tests move
an occurrence only within its day.

**Fix.** End the walk on the nominal time (the recurrence-id), not the
moved start, and test each occurrence's moved interval for overlap.
Then visit the series' overrides (`ICAL.Event`'s `exceptions`) whose
recurrence-id lies outside the walked range, and keep those whose moved
interval overlaps the window. Cancelled overrides stay skipped on both
paths.

**Tests.** The two probes, as unit tests in `recurrence.test.ts`. And a
live case per backend: returning the series at all when only a moved-in
override overlaps the window is the server's time-range evaluation,
which RFC 4791 §9.9 requires and no backend here has been seen to do.

## Acceptance

- The unit and live tests above. Radicale green in CI; Nextcloud and
  Google green on the next `main` run.
- `ARCHITECTURE.md` §2 says what the code does: overrides moved across
  the window.
- `PRIVACY.md` checked against the §2 edit, as `CLAUDE.md` requires; no
  change expected.

Done 2026-10-17: the walk ends on nominal time, each occurrence's moved
interval is tested for overlap, and overrides the walk did not reach
count by their own times (3b455c3). The live case found a backend
difference: Google's time-range `calendar-query` returns a series that
overlaps the window only through a moved occurrence as that override
alone, master pruned (`LESSONS.md`, 2026-10-17), so an override arriving
without its master is read as the single event it describes (e0cf7c5).
Radicale and Nextcloud return the whole resource. Unit and live suites
green locally on all three backends; `ARCHITECTURE.md` §2 updated;
`PRIVACY.md` checked, no change.