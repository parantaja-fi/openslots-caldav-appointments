---
id: "decide-phase-of-abutting-open-events-2026-10-15"
status: "todo"
priority: "high"
assignee: null
epic: "Worker"
dueDate: null
created: "2026-10-15T06:51:43.000Z"
modified: "2026-10-15T08:40:42.000Z"
completedAt: null
labels: ["0.1.x", "decision"]
order: "a2F"
---
# Decide: phase of abutting OPEN events

*Draft, opened 2026-10-15.*

> Written 2026-10-15 from the point `docs/open-event-precedents.md` §4
> leaves open, the precedents not deciding it. To be ruled when this
> card is worked; recommendation: unmerge.

`union()` (`slots.ts`; `ARCHITECTURE.md` §4 steps 1–2) merges abutting
`OPEN` events like overlapping ones, phases the merged interval from the
first event's start, and puts a zero-length phantom blocker at the join
so that no slot spans it. Its rationale, "two separately-painted
sessions", is honoured only in part: no booking spans the join, but the
second session is phased from the first. With 30-minute slots,
09:00–09:45 plus 09:45–10:30 offers 09:00 and 10:00; the second
session's own start, 09:45, is never offered (`slots.test.ts`).

The alternative merges overlaps only. Abutting events stay separate
intervals, each phased from its own start: 09:00 and 09:45. A slot must
fit inside one interval, so none can span the join, and the phantom
goes, with §4 step 2. Phase no longer depends on whether the earlier
event is returned, which removes the abutting case of
`offered-times-can-shift-during-the-day-2026-10-15`, and the coverage
predicate of `decide-re-check-open-coverage-at-booking-2026-10-14` loses
its seam clause. A join on the first event's slot grid offers the same
starts either way; the overlap, boundary and covered-join cases in
`slots.test.ts` keep their expectations.

Recommendation: unmerge. It is the literal reading of the rationale,
anchors phase to what the practitioner painted, and is less code. What
it gives up: a block split off-grid for some other reason, a note
changed half-way, restarts its phase at the split; with hourly slots
09:00–11:45 plus 11:45–13:00 offers 11:45 rather than 12:00.

## Acceptance, if done

- Unit, `slots.test.ts`: abutting events phased from their own starts,
  and the second's starts the same whether or not the first is passed.
  CI green.
- `ARCHITECTURE.md` §4 says what the code does; so does the coverage
  predicate, if the re-check has landed.