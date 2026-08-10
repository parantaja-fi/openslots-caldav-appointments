# Programmable slotting and allocation — design notes

> Exploratory, 2026-08-08. Nothing here is committed scope; `SCOPE.md`
> explicitly excludes practitioner UI for 0.1.0. These are thoughts on what
> "practitioner-programmable algorithms" would actually require, written
> down before the idea calcifies into either a plan or a dismissal.
> `simplicity-and-flexibility.md` places this design in a wider ladder
> (configuration → calendar vocabulary → presets → algebra → editor) and
> should be read first; this document remains the reference for the
> language, constraints and verification.

## 1. What exists today

Two fixed, trivial, pure functions:

- **Slotting** (`worker/src/slots.ts:computeSlots`): union the `OPEN`
  events, subtract blockers, walk a cursor in `SLOT_MINUTES` steps
  anchored to each interval's start. One duration, no buffers, no
  packing policy.
- **Allocation** (implicit in `POST /v1/bookings`): the booked interval
  *is* the requested slot. One VEVENT, nothing else touched.

The proposal: let the practitioner author both, in a Scratch-like visual
language inside a practitioner SPA, which checks the result against
formal constraints, compiles it, and stores it via a new API; the Worker
then executes the stored algorithm.

## 2. The two functions, made explicit

Any design starts by fixing the signatures. Both must stay **pure and
deterministic** — the grant model depends on it (`ARCHITECTURE.md` §5:
the create-grant enumerates slot starts; `GET /v1/slots` and the later
`POST /v1/bookings` must agree about what was offered).

```
slotting   f : (open: Interval, blockers: Interval[], window: Interval, now: Instant)
               → Set<{ interval: Interval, option: OptionId }>

allocation g : (chosen: Slot, open: Interval, blockers: Interval[])
               → { writes: Interval[] }        // what lands in the booking store
```

`OptionId` names a duration class or offering ("60 min", "90 min",
"intro call"); slots of different options may overlap, which is the
"multiple options of varying lengths" requirement.

## 3. Constraints, stated formally

The point of stating them is the discovery that **all of them are cheap
to check on outputs**, even where they would be hard to prove on
programs. That asymmetry drives the whole design (§5).

Slotting:

- **S1 containment** — ∀ s ∈ f(...): s.interval ⊆ open.
- **S2 per-option disjointness** — slots sharing an `option` are
  pairwise disjoint. Cross-option overlap is allowed (that is the
  feature).
- **S3 blocker avoidance** — no slot interval overlaps any blocker
  (strict inequalities; touching at an endpoint does not block, matching
  today's seam semantics).
- **S4 determinism** — f is a function of its arguments and nothing
  else. No clock reads beyond the `now` argument, no randomness.
- **S5 phase stability** — narrowing the window does not move surviving
  slot boundaries (today's "anchor to the interval, not the window"
  rule, generalised).

Allocation:

- **A1 coverage** — chosen.interval ⊆ ⋃ writes.
- **A2 boundedness** — ⋃ writes ⊆ [chosen.start − preₘₐₓ,
  chosen.end + postₘₐₓ] for declared bounds. Writes *may* extend beyond
  the `OPEN` interval — a cleanup buffer past closing time is
  legitimate; it merely blocks nothing.
- **A3 coherence with f** — after the writes land as blockers,
  re-running f offers no slot overlapping them. **This holds for free**
  given S3: any overlapping alternative (a 90-min slot straddling a
  booked 60-min one) vanishes because the write blocks it. Coherence
  needs no separate proof; it is S3 applied to the next evaluation.
- **A4 write-set shape** — see §7; multi-event writes complicate race
  arbitration and cancellation, and should be resisted.

Checking S1–S3 and A1–A2 on a produced slot list is O(n log n) sorting
and sweeping. S4 is a language property (no impure primitives), not a
runtime check. S5 can be spot-checked by evaluating twice.

## 4. The expressiveness ladder

Worth laying out, because each rung obsoletes most need for the next:

- **Tier 0 (today)** — three scalars: slot length, horizon, notice.
- **Tier 1 — richer parameters.** Multiple durations, pre/post buffers
  per option, alignment ("start on the hour"), daily caps, minimum gap
  between bookings, pack-toward-start. Still plain configuration; no
  language, no verification problem, no practitioner SPA strictly
  needed. This tier alone covers the classic Calendly/Cal.com gaps
  (several lengths from one availability block, adaptive buffers).
- **Tier 2 — a declarative combinator algebra.** Programs are terms:
  `tile(60m)`, `offset(15m, …)`, `overlay(a, b)` (union of options),
  `pack(dir, …)`, `require(gap ≥ 15m)`, `perOption(buffer(…))`.
  Closed under composition, **total by construction** (no unbounded
  loops — every combinator consumes a finite discretised interval), and
  most constraints hold by construction: a tiling combinator *cannot*
  emit overlapping same-option slots; blocker subtraction is in the
  evaluator, not the program, so S3 is unfalsifiable from inside the
  language.
- **Tier 3 — general imperative blocks** (what "Scratch-like" naively
  suggests): loops, variables, conditionals over raw timestamps.
  Turing-complete or near it; termination and S1–S3 become unprovable
  in general (Rice's theorem), verification collapses to testing, and
  the practitioner can express mostly *wrong* programs.

**The flexibility target is Tier 2 with a visual skin, not Tier 3.**
Scratch's value is discoverability and impossibility of syntax errors —
properties of the *editor*, available just as well over an algebra as
over an imperative language. Blockly (the natural implementation
library) is agnostic: blocks are whatever the block set says. Define
blocks that are the combinators; the toolbox then *is* the type system,
and ill-formed programs are unbuildable rather than rejected.

## 5. Verification strategy

Three layers, orthogonal, cheapest last:

1. **Correct by construction** (SPA + language design). The algebra
   makes S2/S3/S4 structural. What remains checkable: parameter ranges,
   A2 bounds.
2. **Simulation preview** (SPA). Evaluate the program against sample
   weeks — including adversarial ones: bookings mid-interval, abutting
   `OPEN` events, DST transitions — and *show the resulting calendar*.
   For the `SCOPE.md` §2 practitioner, this is the verification that
   matters: they think in examples, not invariants. Property-based
   testing (thousands of random small inputs, asserting S1–S5/A1–A3)
   runs behind the same button; time being discrete at minute
   granularity and windows bounded, the small-scope coverage is
   genuinely strong.
3. **Runtime output guards** (Worker, non-negotiable). Every evaluation
   of a stored program has its output checked against S1–S3/A1–A2
   before use; on violation, log and **fall back to the fixed default
   algorithm**. The Worker therefore never trusts the SPA's checking —
   the stored program is untrusted input like any other. This is what
   makes layers 1–2 optional polish rather than security boundaries.

Formal methods proper (compiling terms to linear integer arithmetic and
discharging S1–S3 with an SMT solver in the SPA — feasible for a
loop-free algebra, Z3 runs as WASM) are *possible* gilding, but given
layers 1 and 3 they prove things that already hold by construction or
are caught at runtime. Not worth the dependency unless the algebra
later grows conditionals rich enough to make construction-time
guarantees leak.

## 6. Execution in the Worker

- **Never eval.** The stored program is a JSON AST of algebra terms,
  versioned (`{"v": 1, "slotting": …, "allocation": …}`), validated
  against a schema on load, interpreted by a small fuel-bounded
  evaluator. No `eval`, no `new Function`, no WASM compilation of user
  input.
- **CPU budget.** The free-tier 10 ms allowance already prices ES256
  signatures (`ARCHITECTURE.md` §5). A term evaluator over a few dozen
  intervals is microseconds; fuel is a backstop, not an expected limit.
- **Grant interaction.** Multi-option slots multiply the enumeration:
  the grant's `slots` claim must carry `(start, end)` pairs (or
  `(start, option)`), not bare starts, and `MAX_SLOTS` bites sooner.
  Mechanical, but it is a wire-format change — per the field-naming
  rule, worth designing before Tier 1 ships, not after.

## 7. Allocation and the write set

Strong recommendation: **allocation emits exactly one VEVENT** whose
interval is the merged ⋃ writes (contiguous by A2 in practice), with
the appointment proper distinguishable inside it if needed (e.g.
`X-APPOINTMENT-START/END` or description lines).

Multiple VEVENTs per booking would break two settled mechanisms:

- **Race arbitration** (`lostRace`) keys on a single uid ordering;
  a booking that is three events needs group-atomic insert and
  group-rollback over a protocol (`ARCHITECTURE.md` §5) that is not
  atomic for even one event.
- **Cancellation** deletes one resource; groups need a group uid
  convention and partial-failure handling.

One merged event gives buffers, extended holds, and "consume the
overlapping alternatives" (free via A3) without touching either
mechanism. If genuinely disjoint writes ever justify themselves, that
is the moment to revisit — not before.

## 8. Storage: the "no database, ever" tension

The program must live somewhere the Worker reads. Options:

1. **A designated resource in the booking store** — e.g.
   `PUT {calendarUrl}/algorithm-config.ics`, a VEVENT/VTODO whose
   description carries the JSON. Honest to "CalDAV is the sole
   persistence layer"; survives Worker redeploys; visible (opaquely) in
   the practitioner's own client. Needs caching (read once per request
   alongside the slot query — it is one more `GET`, or it rides in the
   same `REPORT` window if given a sentinel date).
2. **Worker KV/D1** — violates the constraint's letter and spirit.
3. **Deploy-time config var** — no new API, no SPA write path, no
   practitioner authoring. This is where **Tier 1 should live**:
   parameters are configuration, and `ARCHITECTURE.md` §7 already has
   one obvious place for configuration.
4. **Per-`OPEN`-event recipes** — a recipe name in the event
   (`OPEN 90min` or a description line), letting the practitioner paint
   different rules on different blocks from their existing client.
   Attractive, composes with any of the above as the *reference*
   mechanism; the definitions still need a home. Note it perturbs the
   settled slot rule (`summary === "OPEN"` exactly) — a prefix match
   with the remainder as recipe name is the minimal change.

Option 1 + 4 is the architecturally consistent pair. Option 4 is more
than a storage detail: the calendar client is the practitioner's
primary UI, so a vocabulary they can paint (`OPEN 90`, `OPEN intro`)
is itself the most practitioner-native programmability surface — see
`simplicity-and-flexibility.md` §5, which develops it as a rung of its
own, usable long before any stored program exists. It needs a strict
grammar: a typo must degrade loudly (the health check reporting an
unparseable `OPEN` event), never silently into wrong slots.

## 9. The hidden cost: practitioner authentication

Today there is **no practitioner-facing authenticated surface at all**
— deliberately (`ARCHITECTURE.md` §8). A store-algorithm API creates
one, and it is write access to behaviour, strictly more sensitive than
any existing endpoint. It needs: operator credentials or keys,
issuance/rotation story, its own rate limiting, and a threat model
(a forged program cannot exfiltrate — the language is pure — but can
deny service or corrupt the offering, bounded by the §5 runtime guards
and the default fallback). This authn surface is plausibly *more* work
than the language, and it is the part with security consequences.
The operator onboarding wizard (`ROADMAP.md` M5–M6) is the natural
host: one practitioner SPA, one authn story, both needs.

## 10. Staging recommendation

- **Stage A (fits post-0.1.0 as configuration):** Tier 1 parameters —
  multiple durations with per-option buffers and alignment — as
  deploy-time config. Forces the real design work with lasting value
  regardless of what follows: option-aware slot model, `(start, end)`
  grants, merged-write allocation, runtime output guards. No new authn,
  no language, no SPA.
- **Stage A′:** the calendar vocabulary — per-`OPEN`-event selection
  of durations and named offerings, parsed from the summary. No SPA,
  no API, no stored programs; pairs with Stage A's parameters.
- **Stage B:** the Tier 2 algebra as a JSON AST; Worker evaluator +
  guards + fallback; storage per §8 option 1; the store API and
  practitioner authn. Authorable by hand (it is small JSON) before any
  visual editor exists — which proves the language pulls its weight
  independently of the skin. Its first authors are not practitioners
  but **preset writers**: named, parameterisable recipes shipped with
  the system or shared by the community, which practitioners select
  (via vocabulary: `OPEN thai-90`) rather than write.
- **Stage C:** the Blockly editor and simulation preview in the
  practitioner SPA, over the unchanged Stage B language and API — only
  if the preset gallery visibly fails to cover real demand.

Each stage is independently shippable and independently abandonable;
Stage A alone probably covers the majority of real practitioner
demand, and observed Stage A demand is the evidence that should decide
whether B and C happen. That is the KISS-compatible version of "full
flexibility": build the flexibility *mechanism* only when a concrete
inflexibility has bitten.

## 11. Verdict on "flexibility beyond current tools"

The genuinely-beyond-Calendly capabilities — overlapping multi-length
options from one painted block, allocation that consumes neighbouring
time, per-block recipes, packing policies — live at Tiers 1–2 and
survive the constraint framework intact. Tier 3 generality adds
expressiveness that is mostly rope. The Scratch idea is right as an
*editor* and wrong as a *semantics*: keep the language a total, pure,
output-checked algebra, and let the blocks be its friendly face.
