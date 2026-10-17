---
id: "m65-reconfiguration-2026-10-10"
status: "todo"
priority: "high"
assignee: null
epic: "Wizard"
dueDate: null
created: "2026-10-10T14:21:47.000Z"
modified: "2026-10-17T07:05:04.000Z"
completedAt: null
labels: ["0.1.x"]
order: "a5"
---
# M6.5 — Reconfiguration

> Named 2026-10-10, prompted by walk attempt 2 (2026-09-08); from
> `ROADMAP.md`.

Changing one setting later without re-entering the rest. Today the
store writes the whole configuration from the tab, so once the tab
has forgotten the secrets a single change means re-entering every
credential — a new Cloudflare token and Brevo key among them, both
shown only once — and in a browser that has forgotten the form as
well, the booking-shape settings fall back to their defaults and the
next store overwrites the stored ones without a word. After the first
store, the store step instead writes only the cards changed in this
tab and leaves the rest as stored; what a calendar-provider switch
must then delete is part of the design. It is what makes the
living-with-it closer's "come back here … store and deploy again"
cheap (walk attempt 2, 2026-09-08).

## Acceptance

- A stored setup is changed in one card from a fresh browser with every
  other stored value intact.

Note 2026-10-17: the Worker now requires `DISPLAY_TIMEZONE` always
(`all-day-and-floating-times-are-read-as-utc-2026-10-15`), and the
wizard files it under the booking shape rather than email. A fork stored
with email off before that date has no `DISPLAY_TIMEZONE` Actions
variable, so its next deploy fails every request until the variable is
set, which the health check reports; reconfiguration must surface the
zone to such a fork.