---
id: "cancelled-single-events-still-block-2026-10-14"
status: "backlog"
priority: "medium"
assignee: null
epic: "Slot rule"
dueDate: null
created: "2026-10-14T12:23:10.000Z"
modified: "2026-10-15T13:59:27.000Z"
completedAt: null
labels: ["0.1.x", "bug"]
order: "a3"
---
# Cancelled single events still block

> Written 2026-10-14 from a reading of the Worker during that day's
> competitor comparison, found while specifying the booking path's
> re-checks.

The recurrence path skips an occurrence whose override is
`STATUS:CANCELLED`; the single-event path does not. A meeting its
organiser cancelled, which some clients keep, marked cancelled, until
the invitee deletes it, therefore blocks, and a cancelled `OPEN` event
still offers slots.

**Fix.** The same status check on both paths.

## Acceptance

- Unit: `eventsIn` reading single-event `STATUS`. CI green.