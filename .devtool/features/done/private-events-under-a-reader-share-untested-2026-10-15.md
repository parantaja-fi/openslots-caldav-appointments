---
id: "private-events-under-a-reader-share-untested-2026-10-15"
status: "done"
priority: "medium"
assignee: null
epic: "Calendars"
dueDate: null
created: "2026-10-15T13:03:40.000Z"
modified: "2026-10-19T14:44:42.000Z"
completedAt: "2026-10-19T14:44:42.000Z"
labels: ["0.1.x"]
order: "a8W"
---
# Private events under a reader share untested

> Written 2026-10-15 from a side study of a room calendar shown as a
> public schedule, which met Google's per-event visibility from the
> reader's side.

The wizard has a separate availability calendar shared with the service
account at "See all event details" (`docs/google-calendar-wizard.md`
§3, card 3.6), Google's `reader` role. Google shows a reader an event
marked *Private* as busy, without its details
(<https://support.google.com/calendar/answer/34580>). For anonymous
public access at the same level this was seen in all three outlets: the
embed draws a bare busy block, the ICS feed writes `SUMMARY:Busy`, and
the API returns the event with `visibility: private` and no summary.
What CalDAV answers a reader is untested. If the REPORT leaves the
event out, it stops blocking, and slots are offered over a private
appointment.

## Acceptance

- One REPORT, as a service account, on a throwaway human-owned calendar
  shared with it at "See all event details" and holding a Private
  event: whether the event is absent, present as busy, or present in
  full, recorded here. Not the operator's calendar.
- If absent, a decision card for what the Worker does about it.

Answered 2026-10-18 by the resource calendar view's stage 3 study,
[§8](/docs/resource-calendar-view-study.md#8-the-reader-share-at-both-levels),
on a test calendar of the owner's shared with a service account at
*See all event details*: the Private event is present, times only —
`DTSTART`, `DTEND`, `DTSTAMP`, `UID` and an `ATTENDEE` naming the
calendar — with no `SUMMARY`, `CLASS` or `TRANSP`. Under the slot rule
([§2](/ARCHITECTURE.md#2-calendar-model)) it is neither `OPEN` nor
Free, so it blocks: no slots over a private appointment, and no
decision card. An `OPEN` event marked Private is stripped alike, so it
gives no slots and blocks:
`open-events-marked-private-give-no-slots-2026-10-19`.