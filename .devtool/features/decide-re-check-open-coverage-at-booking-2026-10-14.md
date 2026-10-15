---
id: "decide-re-check-open-coverage-at-booking-2026-10-14"
status: "todo"
priority: "medium"
assignee: null
epic: "Worker"
dueDate: null
created: "2026-10-14T12:23:10.000Z"
modified: "2026-10-15T06:51:43.000Z"
completedAt: null
labels: ["0.1.x"]
order: "a2V"
---
# Re-check OPEN coverage at booking

> Written 2026-10-14 from a reading of the Worker during that day's
> competitor comparison. Decided 2026-10-15: do it, together with
> `availability-blockers-are-not-re-checked-2026-10-14`.
> Background in `minimum-notice-is-not-enforced-at-booking-2026-10-14`.
> The coverage re-check goes through the expansion that
> `a-moved-occurrence-breaks-recurrence-expansion-2026-10-15` repairs:
> that one first, or together.

With the blockers re-check the booking path reads the availability
calendar anyway, and when the roles coincide the store query already
returns its `OPEN` events. Re-checking that the slot is still covered
then costs CPU, not a subrequest, and closes the last staleness: today
an `OPEN` event deleted after a listing stays bookable for the grant's
lifetime. Deleting `OPEN` is the practitioner's ordinary way of
withdrawing time (ill in the morning), and the customer whose booking
slips through is not told when the practitioner deletes it
(`better-cancellation-2026-10-12`).

The predicate is local to the slot: the union of the `OPEN` events the
re-query returns must contain `[start, end)`, with no seam strictly
inside. Every `OPEN` event that matters overlaps the slot, so the window
query returns it; phase needs no check, the grant having attested it.
`union()` in `slots.ts` already computes both. The seam clause goes if
`decide-phase-of-abutting-open-events-2026-10-15` unmerges abutting
events. Coverage counts `OPEN` from the availability calendar only
(`ARCHITECTURE.md` §2), so with separate calendars keep the two result
lists apart for this check.

It is a design change, not a fix. The grant stops being the
availability proof and becomes the offer: it still binds the session
and confines a booking to slot starts actually listed. §5.2's
"Create-grants as availability proofs", the comments on `postBooking`'s
grant check and on `issueCreateGrant`, and `SCOPE.md` §3 (see
`documentation-drift-grants-and-slot-listing-2026-10-14`) change with
it.

## Acceptance

- Live, both configurations: an `OPEN` event deleted after the listing,
  then the booking refused. Radicale green in CI; Nextcloud and Google
  green on the next `main` run.
- `ARCHITECTURE.md` §5.2 gains the coverage re-check, and the texts
  named above say what the code does.
- Checked against `PRIVACY.md` and `SECURITY.md`'s scope list, as
  `CLAUDE.md` requires for §5 edits; no change expected.