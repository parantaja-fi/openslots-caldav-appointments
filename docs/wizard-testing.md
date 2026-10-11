# Wizard testing — a tentative plan

Status: suggestive, 2026-09-08. The wizard's UX is expected to settle
and then be left alone. When it *is* touched again, the touching starts
by writing or adjusting test cases — this document says where such a
case belongs and what harness it uses.

## The layering principle

The wizard was deliberately split so that everything decidable is a
pure function of data: `steps.ts` and `form.ts` derive *what the page
shows* from saved state, probe results and the manifest; `main.ts` only
turns those derivations into DOM. Tests follow the same split — push
every assertion to the lowest layer that can express it. A behaviour
testable as a derivation must never be tested through the DOM.

## Layer 1 — pure derivations (exists; the backbone)

Files: `test/steps.test.ts`, `test/form.test.ts`,
`test/validators.test.ts`, `test/manifest.test.ts`, `test/state.test.ts`,
`test/google/steps.test.ts`.

The contract: every status a step can wear, every body line that
carries a decision ("Not known: …", provenance lines, group verdicts),
every visibility rule. This is where a UX change starts: write the
expected `StepView`/`FieldView` first, watch it fail, then implement.

Covered today, and to be kept covered on any change:

- the full `Status` vocabulary per step — open/watch/unknown/green/
  attested/red — including that *unknown* always carries a why and
  *attested* always carries its provenance;
- data-precedence on the configuration cards (tab data beats the write
  record beats nothing);
- phase-rail compression and `allGreen` counting attested as settled;
- manifest ↔ `deploy.yml` name-set equality (`manifest.test.ts`) — the
  cross-check that fails when either side forgets the other;
- `load()` migrating boolean ticks to timestamps and filling in fields
  a saved state predates (`state.test.ts`, `localStorage` stubbed);
- the Google sub-wizard's cards 3.1–3.7, every row of its failure
  table that is theirs (`google-calendar-wizard.md` §3,
  `google/steps.test.ts`).

## Layer 2 — probes and clients over mocked `fetch` (exists)

Files: `test/probes.test.ts`, `test/github.test.ts`,
`test/brevo.test.ts`, `test/sealedbox.test.ts`,
`test/google/token.test.ts`, `test/google/probe.test.ts`.

The contract: each probe's mapping from HTTP reality to its typed
verdict — answer, proven absence, and blindness (rate limit with and
without an ETag cache, network down), plus the sealed-box writes
cross-checked against tweetnacl. New probe behaviour gets its case here
with `vi.stubGlobal("fetch", …)`; no test in this layer touches DOM.

One live counterpart, opt-in: `test/google/probe.live.test.ts`, run as
the `live:google` project against the spike's Google project and test
calendars. The project exists only where the Worker's gitignored
profile `worker/test/backends/google.vars` does; there `npm test` runs
it with the rest, and CI, which has none, never runs it.

## Layer 3 — DOM and interaction (begun)

File: `test/google/view.test.ts`.

The harness: the `index.html` body loaded into jsdom, `fetch` stubbed
and `setInterval` faked before `main.ts` is imported — it runs at
import — then events driven and the DOM asserted on. Node's own
`localStorage`, unavailable without `--localstorage-file`, shadows
jsdom's, so the test stubs it. Its contract so far: the Google view
standing in for the step list and Back returning, a pasted key and
calendar ID turning 3.5 and 3.6 green, the calendars card then
confirming on the handed-over address, and that card's summary of
them following the poll's answers while the main list shows.

The rest of `main.ts` (~1500 lines) is untested: it is glue, but some
of the glue is behaviour the walks keep finding. If any of the
following is touched, add a case in this harness first:

1. **Focus-hold accordion** — a card holding focus never closes or
   scrolls away when its status turns settled; it closes on the next
   render after focus leaves. (The M6.4 tab-order complaint.)
2. **`replaceKeepingFocus`** — typing survives a poll repaint; the
   Playwright check from M6.1 (secrets survive neither reload nor
   repaint) could move down into this harness.
3. **Provision flow** — mocked GitHub: log lines in order, partial
   failure surfaces the message, success stamps `done.secrets` and the
   `wrote` record.
4. **Start afresh** — resume note shown exactly when prior state
   exists; reset clears the key.
5. **Review list masking** — secrets render as bullets, copy buttons
   carry real values.

The test imports `main.ts` as it is, with no `init`, so its cases
share one document and one state. The cleaner future is still one
refactoring away: an `init(document)` entry point gives each case its
own and changes nothing else.

## Layer 4 — scripted browser (Playwright, on demand)

Two uses, both driven by fixtures rather than live services:

- **A state gallery.** Seed `localStorage` and stub the probe endpoints
  so each step renders each of its statuses deterministically; one
  screenshot per state. Serves visual regression *and* the human eye —
  "I need to see it" is a fixture away, and the gallery doubles as the
  review page whenever the visual design changes.
- **One happy path.** From empty state to all-green against mocked
  GitHub/Brevo/health endpoints, asserting only the waypoints (statuses
  reached, write performed, closer shown). Live-service walks stay
  manual — that is what the M6.x acceptance walks are for.

Neither exists yet; neither blocks anything. Build the gallery first if
either is built — it pays for itself the first time a colour is argued
about.

## Rules of engagement

- A change to what the wizard *decides* → layer 1 first.
- A change to how it *asks the world* → layer 2 first.
- A change to how it *feels under the hands* → layer 3 first, and the
  state gallery refreshed if colours or markers moved.
- CI runs layers 1–3 on every push (they need no credentials); layer 4
  stays a local tool until it proves cheap enough to pin.
