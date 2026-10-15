---
id: "booking-page-integrated-into-the-operators-site-2026-08-06"
status: "backlog"
priority: "medium"
assignee: null
epic: "Frontend"
dueDate: null
created: "2026-08-06T12:24:47.000Z"
modified: "2026-10-15T05:32:55.000Z"
completedAt: null
labels: ["0.2.0"]
order: "aA"
---
# Booking page integrated into the operator's site

> In the pool since 2026-08-06, selected for 0.2.0 on 2026-08-10; from
> `ROADMAP.md`.

The first case is the author's: parantaja.fi, served by GitHub Pages,
so the page and the Worker live on different origins. This is why
`ALLOWED_ORIGINS` and the build-time API URL are features, not
deployment glue, and why the API must keep working cross-origin.