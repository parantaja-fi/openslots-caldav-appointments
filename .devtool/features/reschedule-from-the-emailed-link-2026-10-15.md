---
id: "reschedule-from-the-emailed-link-2026-10-15"
status: "backlog"
priority: "low"
assignee: null
epic: "Frontend"
dueDate: null
created: "2026-10-15T05:22:03.000Z"
modified: "2026-10-15T05:30:39.000Z"
completedAt: null
labels: ["later"]
order: "aI"
---
# Reschedule from the emailed link

> Later, since 2026-10-15; from `ROADMAP.md`. Low priority; Nylas,
> Aurinko, Tymeslot, calrs and Calnode offer it.

Needs no Worker change: the cancellation page offers another time, the
booking page books it under a fresh grant, and only then deletes the
old booking with the token it already holds. Book before delete, so a
failure leaves two bookings, both visible to the practitioner, never
none; the token's expiry at slot start bounds it. The customer
re-enters name and address, since `GET /v1/bookings/:uid` deliberately
returns times alone.