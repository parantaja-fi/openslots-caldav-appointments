---
id: "widen-the-open-convention-2026-10-15"
status: "backlog"
priority: "medium"
assignee: null
epic: "Slot rule"
dueDate: null
created: "2026-10-15T13:59:27.000Z"
modified: "2026-10-19T14:44:42.000Z"
completedAt: null
labels: ["later"]
order: "aQ"
---
# Widen the OPEN convention

> Design card, written 2026-10-15 when the Slot rule epic was formed.
> The epic's other cards tighten the blocking side of the rule in
> `ARCHITECTURE.md` §2 and §4: which events count, how they are read
> from the `REPORT`, and what the booking path re-checks. This card is
> the second half, to be worked once those have landed: the rule it
> widens must be the settled one, and both halves touch the same code,
> `eventsIn`'s per-occurrence read and `CalendarEvent`. Working it also
> reconsiders the provisional ruling on
> `decide-events-marked-free-should-not-block-2026-10-14`.

Today the marker is a `SUMMARY` exactly `OPEN`, in the availability
role, with a uid the system did not write (`slots.ts`, `isOpen`), and
every `OPEN` event yields one kind of slot: `SLOT_MINUTES` long, phased
from its merged interval's start. The widening is the first three rungs
of `docs/simplicity-and-flexibility.md` §5, with
`docs/programmable-slotting.md` the reference for constraints and
staging (§3, §4 Tier 1, §8 option 4, §10 Stages A and A′):

1. **Richer parameters**, as configuration: several durations,
   per-duration buffers, clock alignment, a daily cap.
2. **Calendar vocabulary**: the summary selects per block, `OPEN 90`,
   `OPEN intro`, painted in the client the practitioner already uses.
   A prefix match replaces the exact one; what follows needs a strict
   grammar, and a typo must fail loudly, the health check naming the
   unparseable or near-miss event (`Open`, a trailing space), never
   silently into wrong slots (`docs/open-event-precedents.md` §6).
3. **Presets**: named bundles the vocabulary refers to (`OPEN thai-90`).
   Their storage, the algebra they are written in and any editor are
   outside this card (`docs/simplicity-and-flexibility.md` §5 rungs
   4–5, §6).

What the precedents add (`docs/open-event-precedents.md` §4):
YouCanBookMe routes booking pages by phrase, the nearest thing to a
vocabulary; substring matching has documented false positives and exact
matching silent misses; SergeyMosin preferred a category to a title
word, against collisions and for other languages.

To settle, each as its own `decision` card when this card is worked:

- The grammar: what may follow `OPEN`, case, whitespace, whether a
  `DESCRIPTION` line may carry per-block overrides, and what an
  unparseable event does (offers nothing, and the health check says so).
- The slot model: a slot gains a duration class or offering; slots of
  different classes may overlap, same-class slots never do
  (`docs/programmable-slotting.md` §3, S1–S5).
- The wire: the create-grant's `slots` claim enumerates starts
  (`ARCHITECTURE.md` §5.2, §5.4); with several durations it must carry
  `(start, end)` or `(start, class)`, and `MAX_SLOTS` bites sooner.
  Field names are chosen up front, a rename crossing the wire.
- The write: one VEVENT per booking whose interval is the slot plus its
  buffers (`docs/programmable-slotting.md` §7), so `lostRace` and
  cancellation stay as they are.
- The page: how the SPA offers several durations from one block.
- Where the parameters live first: deploy-time variables
  (`ARCHITECTURE.md` §7), the wizard's manifest following.
- Private events: Google gives a reader share a Private event as its
  times only, without `SUMMARY`, `CATEGORIES`, `DESCRIPTION` or
  `TRANSP`
  ([study §8](/docs/resource-calendar-view-study.md#8-the-reader-share-at-both-levels)).
  No marker, in the title or a category, reaches the Worker from an
  `OPEN` event marked Private, nor can the health check name it.
  Whether the widened convention does more than the guidance and
  wizard check of `open-events-marked-private-give-no-slots-2026-10-19`.

## Acceptance

- A design note in `docs/`, set against `docs/programmable-slotting.md`
  and `docs/simplicity-and-flexibility.md`, and the decision cards
  above opened from it, labelled `decision`.
- `ARCHITECTURE.md` §2 and §4 unchanged until those are ruled.