---
id: "ics-url-as-an-availability-source-2026-08-01"
status: "backlog"
priority: "medium"
assignee: null
epic: "Calendars"
dueDate: null
created: "2026-08-01T11:32:30.000Z"
modified: "2026-10-15T13:03:40.000Z"
completedAt: null
labels: ["0.2.0"]
order: "aC"
---
# ICS URL as an availability source

> In the pool since 2026-08-01, selected for 0.2.0 on 2026-08-10,
> Google's feed below added 2026-10-15; from `ROADMAP.md`.

An alternative to CalDAV for the read-only role; also the prerequisite
for the Proton path, whose verification and write-up stay in Later
(`the-proton-path-verified-then-written-up-2026-08-02`).

## Google's feed, as read 2026-10-14

From a side study of a room calendar shown as a public schedule.

- **Addresses.** The public one,
  `https://calendar.google.com/calendar/ical/<calendar id>/public/basic.ics`,
  answers only while the calendar is public. The secret one reads it
  without public sharing, but Google means it for the owner alone,
  offers a reset, and lets a Workspace admin withhold it
  (<https://support.google.com/calendar/answer/37648>); it was not
  tried. Neither has a documented refresh interval.
- **Freshness.** The feed is sent `Cache-Control: no-store`. An edit
  made through the API was in it at the first poll, under a second
  later, in both trials; an ACL change took effect within 10–20 s. The
  hours of lag people report come from their subscribing clients.
- **Cross-origin.** No CORS headers: a Worker can read the feed, a
  browser page on another origin cannot.
- **Content.** Under free/busy sharing, Free events are left out; under
  all details, they carry `TRANSP:TRANSPARENT`. Events whose details
  are hidden, such as Private ones, come as `SUMMARY:Busy`. Times are
  in UTC, and descriptions are raw HTML.