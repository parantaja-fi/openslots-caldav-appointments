---
id: "availability-blockers-are-not-re-checked-2026-10-14"
status: "done"
priority: "high"
assignee: null
epic: "Slot rule"
dueDate: null
created: "2026-10-14T12:23:10.000Z"
modified: "2026-10-17T07:36:00.000Z"
completedAt: "2026-10-17T07:36:00.000Z"
labels: ["0.1.x", "bug"]
order: "a4"
---
# Availability blockers are not re-checked

> Written 2026-10-14 from a reading of the Worker during that day's
> competitor comparison. A defect against documented behaviour, and
> unsafe: a booking can stand over a real appointment. Background in
> `minimum-notice-is-not-enforced-at-booking-2026-10-14`;
> `decide-re-check-open-coverage-at-booking-2026-10-14` builds on this.

The slot rule (`ARCHITECTURE.md` §2): every non-`OPEN` event in either
calendar blocks. The post-insert re-query reads only the store. When
the roles coincide, that one query sees everything, and an appointment
the practitioner added after the listing wins outright (`lostRace`).
With separate calendars, the same appointment added to the availability
calendar goes unseen for the grant's lifetime, and the booking stands.
The two configurations, which `flow.live.test.ts` exists to keep
equivalent, behave differently. Nor is the case exotic: a separate
availability calendar is the natural role for the practitioner's main
calendar, shared read-only (`SCOPE.md` §3).

**Fix.** When the roles do not coincide, re-query both calendars in
parallel and hand the concatenation to `lostRace`, in the shape of
`getSlots`' paired `REPORT`. `lostRace` needs no change: it already
ignores `OPEN` events and lets any event the system did not write win.
Cost: one more subrequest, in parallel, so no added latency. A failed
availability read now fails the booking (rolled back, 502), which is
right: the booking could not be confirmed.

**Test.** In `flow.live.test.ts`, which runs both configurations: list,
paint a non-`OPEN` event into the availability calendar over a listed
slot, book that slot with the grant; expect 409 and nothing left in the
store. It passes today with one calendar in both roles and fails with
separate calendars. Write it first.

## Acceptance

- The live test above, both configurations. Radicale green in CI;
  Nextcloud and Google green on the next `main` run.
- `ARCHITECTURE.md` §5.3's "re-query the slot in the store" becomes
  both calendars when they are separate.
- Checked against `PRIVACY.md` and `SECURITY.md`'s scope list, as
  `CLAUDE.md` requires for §5 edits. No change expected: the booking
  path reads a calendar the listing already reads, and no new data or
  party appears.

Done 2026-10-17 (999955c): the post-insert re-query is the listing's
paired `REPORT` narrowed to the slot, the availability calendar always
and the store when the roles are separate, in parallel; `lostRace`
reads the concatenation, and a failed availability read rolls the
booking back with 502. Live, both configurations, in
`flow.live.test.ts`: an appointment painted into the availability
calendar after the listing refuses the booking and leaves nothing in
the store; the separate-calendar case failed before the fix.
`bookings.live.test.ts`, whose grants are minted rather than listed,
now paints `OPEN` over its slot. `ARCHITECTURE.md` §5.2 and §5.3
updated; `PRIVACY.md` and `SECURITY.md`'s scope list checked, no
change. Unit, Radicale, Nextcloud and Google suites green locally.