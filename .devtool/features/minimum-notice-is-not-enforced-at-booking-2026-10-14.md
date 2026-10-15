---
id: "minimum-notice-is-not-enforced-at-booking-2026-10-14"
status: "todo"
priority: "high"
assignee: null
epic: "Worker"
dueDate: null
created: "2026-10-14T12:23:10.000Z"
modified: "2026-10-15T05:30:39.000Z"
completedAt: null
labels: ["0.1.x", "bug"]
order: "a4"
---
# Minimum notice is not enforced at booking

> Written 2026-10-14 from a reading of the Worker during that day's
> competitor comparison, one of the booking path's unchecked facts. A
> defect against documented behaviour. The others:
> `availability-blockers-are-not-re-checked-2026-10-14`,
> `decide-re-check-open-coverage-at-booking-2026-10-14`.

## Background

A create-grant attests what the calendars held when the slots were
listed, and stays valid for `GRANT_TTL_SECS` (default 1800). By design
(`ARCHITECTURE.md` §5.2) the booking path trusts it for `OPEN` events,
and re-checks only for conflicts, by re-querying the store after its
`PUT` (§5.3). Two other facts the listing checked age with the grant
and are not re-checked: the minimum notice, here, and blockers in a
separate availability calendar.

## The defect

`getSlots` clamps its window to `now + MIN_NOTICE_MINUTES`;
`postBooking` checks only that the grant lists the slot. A slot listed
at the edge of the notice therefore stays bookable for the grant's
lifetime: with the defaults, 120 minutes' notice becomes 90.

Worse when an operator sets `MIN_NOTICE_MINUTES` below
`GRANT_TTL_SECS / 60`, which `deploy.yml` lets them do: a slot can be
booked after it has started, and its cancellation token, which expires
at slot start (`issueCancellationToken`), is issued already expired. The
confirmation email then carries a dead link.

**Fix.** In `postBooking`, after the grant check and before the `PUT`,
refuse a `slot_start` earlier than `now + cfg.noticeMs` with 409. 409
because the SPA already treats it as "slot gone" and refreshes the
list, which will no longer offer the slot. Its message, "Sorry, that
time was just taken." (`frontend/src/booking.ts`), then misleads;
reword it to cover both causes, e.g. "Sorry, that time is no longer
available."

**Test.** The refusal precedes any backend call, so it belongs in the
unit project: a grant listing a slot at `now + notice − 1 min`, a fresh
proof, expect 409.

## Checked, no action

- **Grant size.** A grant enumerates its slot starts, about 27 bytes
  each before base64url, so a listing at `MAX_SLOTS` (500) makes a
  grant of about 18 KB in `Authorization`. Workers accept 128 KB of
  request headers in total
  (<https://developers.cloudflare.com/workers/platform/limits/>, read
  2026-10-14), and the SPA lists one week, at most 336 thirty-minute
  slots.

## Acceptance

- The unit test above; CI green.
- `ARCHITECTURE.md` §5.2 gains the notice re-check.
- Checked against `PRIVACY.md` and `SECURITY.md`'s scope list, as
  `CLAUDE.md` requires for §5 edits; no change expected.