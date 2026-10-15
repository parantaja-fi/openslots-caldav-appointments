---
id: "per-role-calendar-providers-2026-10-10"
status: "backlog"
priority: "medium"
assignee: null
epic: "Wizard"
dueDate: null
created: "2026-10-10T12:51:22.000Z"
modified: "2026-10-15T13:03:40.000Z"
completedAt: null
labels: ["0.1.x"]
order: "a7"
---
# Per-role calendar providers

> Deferred from the M6.4 walks (attempts 2 and 3) on 2026-10-10, to
> `m66-external-acceptance-2026-10-10`; from `ROADMAP.md`. The token
> cache added 2026-10-15.

Availability and booking store on different backends; today one
provider choice in the wizard serves both. Google card 3.6 is already
per role; when providers become per role it shows the Google ones only
(`docs/google-calendar-wizard.md` §6).

`auth.ts` caches one Google token per isolate, whichever service
account asked for it, so a Worker can use one Google account; a role
on a second one needs the cache keyed by account.