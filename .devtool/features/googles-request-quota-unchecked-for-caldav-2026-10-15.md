---
id: "googles-request-quota-unchecked-for-caldav-2026-10-15"
status: "backlog"
priority: "medium"
assignee: null
epic: "Calendars"
dueDate: null
created: "2026-10-15T13:03:40.000Z"
modified: "2026-10-15T13:03:40.000Z"
completedAt: null
labels: ["0.1.x"]
order: "aQ"
---
# Google's request quota, unchecked for CalDAV

> Written 2026-10-15 from a side study of a room calendar shown as a
> public schedule, which read Google's quota pages for its own traffic.

Google meters the Calendar API: Cloud projects created from 1 May 2026
may make 10,000 requests a minute, 600 of them per user, up to a daily
threshold beyond which charges are to be announced later in 2026
(<https://developers.google.com/workspace/calendar/api/guides/quota>).
The service account is one user. Whether the CalDAV API, a separate API
in the same project, draws on that quota, has one of its own, or has
none is not documented there; nor is what a CalDAV request beyond a
limit gets.

The Worker's CalDAV requests:

- a slot listing: one REPORT per calendar, so two unless the roles
  coincide;
- a booking: a PUT, then a REPORT for `lostRace`, and a DELETE when the
  race is lost;
- `GET /v1/bookings/:uid`: a GET; a cancellation: a DELETE;
- `/v1/health`: one REPORT per calendar.

If CalDAV draws on the 600, some 300 slot listings a minute exhaust it.
The per-IP rate limit (`ARCHITECTURE.md` §5) bounds one caller, not
many.

## Acceptance

- The CalDAV API's quotas, as the Cloud console's Quotas page for it
  shows them, recorded here.
- `ARCHITECTURE.md` states the limit that applies and what the Worker
  answers beyond it.
- Rechecked when Google announces the charges.