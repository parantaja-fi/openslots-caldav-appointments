---
id: "decide-events-marked-free-should-not-block-2026-10-14"
status: "backlog"
priority: "medium"
assignee: null
epic: "Worker"
dueDate: null
created: "2026-10-14T12:23:10.000Z"
modified: "2026-10-15T05:30:39.000Z"
completedAt: null
labels: ["0.1.x", "decision"]
order: "a2"
---
# Decide: events marked Free should not block

> Written 2026-10-14 from a reading of the Worker during that day's
> competitor comparison, found while specifying the booking path's
> re-checks. A decision to take first, with a recommendation. Changes
> `eventsIn` and `CalendarEvent`, as does
> `a-moved-occurrence-breaks-recurrence-expansion-2026-10-15`.

`eventsIn` (`caldav.ts`) carries no `TRANSP`, so an event marked Free
(`TRANSP:TRANSPARENT`) blocks like any other. Google marks all-day
events Free by default, so one all-day reminder in a calendar that
holds `OPEN` events removes that day's slots. RFC 5545 (§3.8.2.7)
defines transparency as exactly this, and schedulers generally treat
Free as non-blocking (Cal.diy skips transparent events; Calendly
documents the same).

Recommendation: carry transparency on `CalendarEvent`; transparent
events neither block in `computeSlots` nor win in `lostRace`. Do not
drop them at parse time: an `OPEN` event marked Free is still
availability, and honouring transparency is what lets a practitioner
mark `OPEN` events Free so that other tools do not see that time as
busy. The system's own bookings (`booking-…` uids) keep blocking
whatever their transparency: a customer's claim is not freed by a flag
set in a calendar client, and `lostRace`'s earliest-booking rule needs
every booking visible. Confirm on the Google profile that an all-day
event made in Google's own UI arrives with `TRANSP:TRANSPARENT`, rather
than inferring it — the M2 `<c:expand>` lesson.

## Acceptance, if done

- Unit: `eventsIn` reading `TRANSP`, and `computeSlots` and `lostRace`
  ignoring transparent events other than bookings. CI green.
- The Google observation above, recorded.
- `ARCHITECTURE.md` §2's slot rule says what the code does; `PRIVACY.md`
  checked against it.