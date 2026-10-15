---
id: "deployment-heartbeat-2026-10-15"
status: "backlog"
priority: "low"
assignee: null
epic: "Operations"
dueDate: null
created: "2026-10-15T05:30:39.000Z"
modified: "2026-10-15T05:30:39.000Z"
completedAt: null
labels: ["later"]
order: "aF"
---
# Deployment heartbeat

> From `NOW.md`'s next actions, which proposed it for 0.2.0.

The August test bed's Worker vanished unnoticed; it was found gone on
2026-10-11. Anything pinging `GET /v1/health` on a schedule and mailing
the operator on red would have caught it, and would catch what a live
deployment will meet: an expired app password, a deleted calendar, a
revoked key. One shape needing nothing new: a scheduled workflow in the
fork that fails on red, GitHub notifying of the failed run. Check first
how GitHub treats schedules in a quiet repository; it is documented to
disable them after a period without activity.

Distinct from `email-volume-and-authentication-monitoring-2026-08-03`,
which watches what the system sends.