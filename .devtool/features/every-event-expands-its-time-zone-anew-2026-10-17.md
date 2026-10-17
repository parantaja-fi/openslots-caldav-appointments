---
id: "every-event-expands-its-time-zone-anew-2026-10-17"
status: "backlog"
priority: "high"
assignee: null
epic: "Calendars"
dueDate: null
created: "2026-10-17T12:45:50.000Z"
modified: "2026-10-17T12:45:50.000Z"
completedAt: null
labels: ["0.1.x", "bug"]
order: "a5V"
---
# Every event expands its time zone anew

> Written 2026-10-17 from the side study of a room calendar shown as a
> public schedule, whose Worker reads a Google calendar through an
> older copy of `eventsIn`; its CPU on workers.dev led here.

A `REPORT` answers each event as a resource of its own, a VCALENDAR
that carries a `VTIMEZONE` for every `TZID` it uses (RFC 5545 §3.6.5):
Google's for Europe/Helsinki holds two `YEARLY` rules from 1970.
ical.js 2.2.1 resolves a `TZID` against that copy
(`Component.getTimeZoneByID`), hydrating an `ICAL.Timezone` per
VCALENDAR and caching it in that VCALENDAR alone. The first offset
asked of the zone, by `toJSDate()` or the iterator's comparisons, runs
`Timezone._ensureCoverage`, which expands each rule from its own
`DTSTART` to five years past the current one — 62 years of transitions
from 1970, about 0.8 ms in Node — and the next event pays again.

Measured on a saved Google `REPORT` of one week, 14 resources (13
single events and a weekly series), with `eventsIn` as of 406181d,
Node 26.8.1 on an M1 Pro, `process.cpuUsage` around `reportEvents` and
`fetch` stubbed: 12.6 ms a request warm (median of 49), 70–75 ms for a
fresh process's first; by the profile, three quarters of
`reportEvents` is `_ensureCoverage`. The study's Worker, deployed on
workers.dev, spent 33–123 ms of CPU a request by `wrangler tail`, and
2–16 ms warm once each definition was expanded only once per isolate.
About a dozen zoned events in the window spend the free plan's 10 ms
before any occurrence is drawn. Other backends keep the client's text,
which sets where the rules start; their cost is unmeasured.

**Fix.** Share zones by definition: an isolate-wide `Map` from a
`VTIMEZONE`'s text to its `ICAL.Timezone`, set into each parsed
VCALENDAR's zone cache before any time is read. Equal text gives an
equal zone, so a reading still depends on its resource alone — what
406181d removed the zone registry to secure. Tried on the same `REPORT`:
1.2 ms warm, 48–53 ms first, the events unchanged. The cache is
ical.js's private `_timezoneCache`, so a test must pin the sharing.
The alternatives: the registry back, each `VTIMEZONE` removed once
registered — public API, but the first definition seen under a `TZID`
then wins for the isolate's life; or a change upstream.

**Tests.** Unit: two resources carrying the same `VTIMEZONE` expand it
once, counted on `ICAL.Timezone.prototype._expandComponent`; two
carrying different rules under one `TZID` keep their own offsets.

## Acceptance

- The unit tests above; CI green; the live suites pass.
- CPU per request measured in workerd by `LESSONS.md`'s method, before
  and after, on a `REPORT` of a dozen or more zoned events; noted here.
- `ARCHITECTURE.md` §2 says zones are shared by definition.
