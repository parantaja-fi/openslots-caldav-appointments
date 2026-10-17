---
id: "offered-times-can-shift-during-the-day-2026-10-15"
status: "backlog"
priority: "low"
assignee: null
epic: "Slot rule"
dueDate: null
created: "2026-10-15T05:00:50.000Z"
modified: "2026-10-15T13:59:27.000Z"
completedAt: null
labels: ["0.1.x", "bug"]
order: "a4"
---
# Offered times can shift during the day

> Written 2026-10-15, one of five defects found by probing the Worker's
> parsing and slot code during the survey in
> `docs/open-event-precedents.md`, each confirmed by reading the code.
> Cosmetic.

Slot phase is anchored to each merged `OPEN` interval's start
(`ARCHITECTURE.md` §4), but the union is taken over what the `REPORT`
returns, and the `REPORT` starts at `max(window_start, now + notice)`.
An overlapping `OPEN` event that ends before that point is not returned,
so the merged interval starts later and the phase moves. Probe, 30-minute
slots, A 09:00–10:20 and B 10:10–12:00, window from 10:25: with both
events, 10:30, 11:00 and 11:30; with A filtered out, as the backend does
once `now + notice` passes 10:20, 10:40 and 11:10. That breaks the
phase stability `docs/programmable-slotting.md` §3 calls S5. It is safe:
`lostRace` sees overlapping bookings. It needs overlapping or abutting
events whose offset is not a multiple of the slot length, abutting ones
being merged too: 09:00–09:45 plus 09:45–10:30 offer 10:00 until
`now + notice` passes 09:45, then nothing. Unmerging abutting events
(`decide-phase-of-abutting-open-events-2026-10-15`) would remove that
case.

**Fix.** Start the availability `REPORT` a margin earlier, a day say,
and leave emission clamped as now; `computeSlots` already skips the
cursor arithmetically past the window's start. Chains of overlapping
`OPEN` events longer than the margin stay exposed, and §4 should say so.
Accepting and documenting the shift instead is defensible: the case is
rare and harmless.

**Test.** Live, `slots.live.test.ts`: paint the probe's A and B
tomorrow, list from 09:00 and from 10:25; the surviving starts must
agree.

## Acceptance

- The live test above. Radicale green in CI; Nextcloud and Google green
  on the next `main` run.
- `ARCHITECTURE.md` §4 says what the code does: the query margin and its
  limit, or the accepted shift.