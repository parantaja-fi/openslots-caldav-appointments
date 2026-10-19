---
id: "open-events-marked-private-give-no-slots-2026-10-19"
status: "backlog"
priority: "medium"
assignee: null
epic: "Wizard"
dueDate: null
created: "2026-10-19T14:44:42.000Z"
modified: "2026-10-19T14:44:42.000Z"
completedAt: null
labels: ["0.1.x"]
order: "aR"
---
# OPEN events marked Private give no slots

> Opened 2026-10-19 when
> `private-events-under-a-reader-share-untested-2026-10-15` closed.
> Inferred, not measured with an `OPEN` event: Google strips every
> Private event alike.

Google gives a reader share a Private event as its times only
([study §8](/docs/resource-calendar-view-study.md#8-the-reader-share-at-both-levels)):
no `SUMMARY`, so an `OPEN` event marked Private is not availability,
and no `TRANSP`, so it blocks
([§2](/ARCHITECTURE.md#2-calendar-model)). Its slots vanish without an
error anywhere. Likely ways in: marking the `OPEN` events Private to
hide them from others who see the calendar, or a default visibility of
Private in the practitioner's Google Calendar settings (that such a
setting exists is unverified).

- **Documentation.** `SETUP.md` Part 6 and the wizard's "Open some time
  for booking" step say: leave `OPEN` events at Default or Public
  visibility, never Private. Beside the guidance of
  `practitioner-guidance-for-open-events-2026-10-17`.
- **A wizard check.** The Google sub-wizard's 3.6 probe
  (`wizard/src/google/probe.ts`,
  [plan §3](/docs/google-calendar-wizard.md#3-the-journey)) reads one
  metadata-only `events.list` per calendar. Asking the availability
  calendar for its coming events' `visibility` — still
  `calendar.readonly`, no summaries — lets the wizard count the
  Private ones. It cannot tell an `OPEN` event from a private
  appointment, whose summary the service account cannot read either;
  where the availability calendar is the practitioner's own, private
  appointments are expected and a plain warning is noise. Where the
  check speaks — at 3.6, or at the booking step when it finds no
  slots — is settled when this is worked.

## Acceptance

- The documentation line in `SETUP.md` Part 6 and the wizard step.
- The check, with unit tests on the probe's reading.
- Observed on Google and recorded here: an `OPEN` event marked Private
  on the availability calendar gives no slots through the Worker and
  blocks.
- `scripts/check-cards.sh` and lychee green.