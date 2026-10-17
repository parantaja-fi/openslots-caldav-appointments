---
id: "one-long-recurrence-takes-the-booking-page-down-2026-10-15"
status: "todo"
priority: "high"
assignee: null
epic: "Slot rule"
dueDate: null
created: "2026-10-15T05:00:50.000Z"
modified: "2026-10-17T10:40:00.000Z"
completedAt: null
labels: ["0.1.x", "bug"]
order: "a3"
---
# One long recurrence takes the booking page down

> Written 2026-10-15, one of five defects found by probing the Worker's
> parsing and slot code during the survey in
> `docs/open-event-precedents.md`, each confirmed by reading the code.
>
> Step 3's override pass relies on
> `a-moved-occurrence-breaks-recurrence-expansion-2026-10-15`.

`eventsIn` walks each series from its `DTSTART` and throws after 10,000
iterations: failing loudly by design, since truncating a blocker's
series would offer slots over real appointments. But one such series
anywhere in either calendar fails every listing with 502, and the health
check then calls the calendar "unreachable", because `probeCalendar`
passes through only messages beginning "CalDAV". Real triggers: an
hourly rule begun more than about 14 months ago, a daily one more than
about 27 years ago. Below the cap the walk still costs CPU, against the
free plan's 10 ms per request
(<https://developers.cloudflare.com/workers/platform/limits/>), and
nothing in the repository measures how much.

**Fix, in order.**

1. Say what is wrong: the health check and the listing's problem detail
   report a recurring event too long to expand, rather than
   "unreachable" and "could not be read". No uid: one may carry a
   hostname or an address, which the health body must not
   (`ARCHITECTURE.md` §3).
2. Measure CPU per thousand iterations in workerd, and the cost of a
   daily series begun ten years ago.
3. If the measurement or a real calendar demands it, start the walk
   near the window for the rules where that is exact: `DAILY` and
   `WEEKLY` with any `INTERVAL` and no `COUNT`. The anchor is `DTSTART`
   plus the largest whole number of periods that keeps it at or before
   the window's start less the event's duration. An anchor that is
   itself an occurrence keeps the weekday, which re-anchoring otherwise
   loses (the comment in `eventsIn`); the override pass then covers
   recurrence-ids before the anchor too. Other rules keep the full walk
   and the cap.

**Tests.** Unit: the health check and the listing name the cap; with
step 3, a daily series begun in 1990 expands inside a 2026 window, and
agrees with the full walk on a series short enough for both.

## Acceptance

- The unit tests above; CI green.
- `ARCHITECTURE.md` §3 says what the code does: the health check's new
  state.

Note 2026-10-17: since
`all-day-and-floating-times-are-read-as-utc-2026-10-15`, converting a
floating occurrence costs about 19 µs more, two `Intl` offset lookups: a
daily floating series begun three years before the window took about
33 ms in Node 26, against 12 ms for the same series in UTC. Zoned and
UTC series cost what they did. Step 2 should measure a floating series
too.

Note 2026-10-17, later: step 1 landed as fb4bfd4. Step 2, measured in
workerd through the vitest pool on an M1 Pro, where the clock advances
through synchronous code: a draw costs about 10 µs in UTC, 20 µs zoned
(`VTIMEZONE`) and 29 µs floating, of which the ical.js iterator is
about 5 µs; the free plan's 10 ms buys about 990 draws. A daily series
begun ten years ago (3,660 draws) costs 37 ms in UTC, 72 ms zoned and
105 ms floating, so the budget is spent by a daily series about 2.7
years old in UTC, 1.4 zoned or 1 floating, and by an hourly one six
weeks old; a weekly series lasts about 17 years. Step 3 is demanded.
`LESSONS.md` keeps the method.