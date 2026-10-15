---
id: "close-the-booking-race-window-portably-2026-08-01"
status: "backlog"
priority: "low"
assignee: null
epic: "Worker"
dueDate: null
created: "2026-08-01T11:32:30.000Z"
modified: "2026-10-15T05:30:39.000Z"
completedAt: null
labels: ["later"]
order: "aK"
---
# Close the booking race window, portably

> Later, since 2026-08-01; from `ROADMAP.md`, where it was a per-slot
> Durable Object lock. That was rejected 2026-10-14: the Worker is to
> run beyond Cloudflare, so nothing that needs Durable Objects, D1, KV
> or similar bindings.

Only if real traffic ever makes the check-after-insert race window
matter (`ARCHITECTURE.md` §5.3): a request whose re-query lands before
the other's `PUT` sees no conflict, so two overlapping bookings can
still stand. Whatever closes it must be portable; platform glue only as
a thin, replaceable seam.