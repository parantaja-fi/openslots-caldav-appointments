---
id: "reminder-email-before-the-appointment-2026-08-01"
status: "backlog"
priority: "medium"
assignee: null
epic: "Email"
dueDate: null
created: "2026-08-01T11:32:30.000Z"
modified: "2026-10-15T05:30:39.000Z"
completedAt: null
labels: ["0.2.0"]
order: "aB"
---
# Reminder email before the appointment

> In the pool since 2026-08-01, selected for 0.2.0 on 2026-08-10, the
> design below added 2026-10-15; from `ROADMAP.md`.

Reuses the M3 delivery mechanism and the booking's own data, and needs
no stored state:

- A scheduled trigger fires every interval *I* (a Cron Trigger on
  Cloudflare, any host's cron elsewhere: a thin seam, so the Worker
  stays portable). At tick *T* it reads the store for bookings
  starting in [*T* + *L*, *T* + *L* + *I*), *L* being the lead time.
  *T* is the tick's scheduled time, not the clock, so the windows
  tile time: each booking falls in exactly one, and no "sent" flag is
  needed. A re-delivered tick sends its reminders twice; rare, and
  only a duplicate.
- Bookings are recognised by uid, as everywhere. The address is the
  first line of the `DESCRIPTION` (`ARCHITECTURE.md` §2); a
  description the practitioner has edited out of shape is skipped.
- The reminder carries a freshly issued cancellation token, the same
  capability as the confirmation's, so nothing is stored.
- A booking made after its window's tick gets no reminder (with an
  hourly *I*, roughly those made less than *L* ahead): the
  confirmation stands in. A missed tick loses its window's
  reminders.
- One setting, the lead time; absent means off.
- Three messages per booking instead of two:
  `email-volume-and-authentication-monitoring-2026-08-03`'s thresholds
  assume two.