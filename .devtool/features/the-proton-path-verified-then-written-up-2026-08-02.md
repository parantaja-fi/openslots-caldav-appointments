---
id: "the-proton-path-verified-then-written-up-2026-08-02"
status: "backlog"
priority: "low"
assignee: null
epic: "Calendars"
dueDate: null
created: "2026-08-02T11:49:23.000Z"
modified: "2026-10-15T05:30:39.000Z"
completedAt: null
labels: ["later"]
order: "aM"
---
# The Proton path, verified then written up

> Later, since 2026-08-02; from `ROADMAP.md`. Needs
> `ics-url-as-an-availability-source-2026-08-01`.

Booking store on a CalDAV backend, Proton subscribing to its ICS URL
for viewing, a standard CalDAV client for painting `OPEN`. Verify
against a real Proton account first — in particular the subscription
refresh interval, which their documentation puts in hours, and whether
a Nextcloud or Google secret-ICS URL is accepted at all. Describing it
from their published behaviour instead would repeat the M2
`<c:expand>` mistake. Then a short `docs/proton.md` linked from the
operator guide.