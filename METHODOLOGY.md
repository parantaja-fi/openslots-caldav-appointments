# Booking Calendar — Methodology

> How this project records decisions and keeps its documents honest.
> Adopted 2026-10-15, distilled from the design method of the author's
> PhysiologyWorkbench project (its meta-decisions MAD0–MAD16); the
> ancestry behind that is Nygard's architecture decision records, MADR,
> PEP 1's status words and RFC 2026's maturity levels — references at
> the end. Taken here deliberately light: the three conventions below
> and nothing else, the KISS constraint applying to method as much as
> to code. What was not adopted, and what would change that, closes the
> file.

## 1. Decisions carry a status

A `decision` card (`ROADMAP.md`, "The board") opens, after its title,
with one italic line holding the status word and its date, nothing
else. The words:

- *Draft, opened \<date\>* — open; a recommendation on the card is a
  proposal, and nothing builds on it.
- *Accepted, ruled \<date\>* — ruled; the code need not match yet. The
  card sheds the `decision` label and its "Decide:" title prefix (the
  id never changes) and stays on the board as the work item.
- *Provisional, ruled \<date\>: until …* — ruled for now; the line
  names what would reopen it.
- *Rejected, ruled \<date\>* / *Superseded by \<id\>, \<date\>* — kept
  for the record.

There is no *Final*: a ruling whose code matches is a finished card,
and the Done column says so. Seed decisions predating the board stay
where they are (`SCOPE.md` §7).

## 2. Mechanisms are linked, and links are checked

A new cross-document reference to a mechanism is a Markdown link onto
the section's own anchor, the one Markdown derives from the heading —
`[§5.2](ARCHITECTURE.md#52-creating-and-cancelling-bookings)` — which
GitHub, VS Code's preview and lychee all compute alike. Renumbering or
retitling a section breaks its inbound links loudly: the check below
lists them, and the rename fixes them in the same commit — the loud
break is the point, where a bare "§5.2" in prose goes stale silently.
An explicit anchor (`<a id="…"></a>`) is used only for a target that
is not a heading, and is named semantically (`#grant-shape`), never by
position. The existing bare "§5.2" mentions are converted when their
surrounding text is next edited, never in a sweep.

Every link is verified mechanically: the `docs` job in
[ci.yml](.github/workflows/ci.yml), and locally

```sh
lychee --offline --include-fragments --hidden --root-dir "$PWD" .
```

which checks that relative links resolve and that their fragments —
the anchors above, and heading slugs — exist. Remote URLs are
deliberately not checked: offline keeps the check deterministic, and a
dead external link is an editorial problem, not a build failure.

The same check runs as a `pre-push` hook (`.githooks/pre-push`),
enabled once per clone by `git config core.hooksPath .githooks`.
Without lychee installed the hook waves the push through: CI remains
the gate, the hook only shortens the loop.

The board's own links are the backticked card ids, which lychee cannot
see. `scripts/check-cards.sh`, run by the same hook and job, checks
that every card's frontmatter id matches its filename and that every
id cited in tracked Markdown names a card that exists — in
`.devtool/features/` or its `done/`, which is why cards are referred
to by id, never by path. A card's links into the repository are
root-relative for the same reason: `/ARCHITECTURE.md#…` resolves
alike before and after the card's move into `done/`. `--hidden` stops
lychee skipping hidden directories, `.devtool/` among them, and
`--root-dir` resolves a leading `/` at the checkout's root, as GitHub
does at the repository's.

## 3. CLAUDE.md is instructions, not the record

`CLAUDE.md` tells the working agent how to behave and changes freely.
No document, card or code comment cites it as the home of a fact. A
fact `CLAUDE.md` states and another document needs lives in
`ARCHITECTURE.md`, on a card or in `docs/`, and `CLAUDE.md` references
it there.

## Not adopted, and what would change that

The rest of the parent method — numbered rulings (ADn/ASRn) with
per-ruling statuses, the generated rulings index, the glossary of
user-facing strings, the binding/non-binding document split — costs
more than it returns at this scale: one record document, one author, a
handful of open decisions. Three triggers would reopen the question,
most likely as `ARCHITECTURE.md` kept authoritative with its rulings
numbered in place rather than carved into separate records:

- the independent security review
  (`independent-security-review-2026-10-15`), whose findings need
  citable, statused rulings;
- a second regular contributor;
- the 1.0 freeze of API and configuration semantics.

A glossary earns its keep separately, when the customer-facing strings
go multilingual.

## References

- Nygard, *Documenting Architecture Decisions* (2011) — the ADR.
  <https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions>
- MADR — Markdown Architectural Decision Records.
  <https://adr.github.io/madr/>
- PEP 1 — PEP Purpose and Guidelines: the status words.
  <https://peps.python.org/pep-0001/>
- RFC 2026 — The Internet Standards Process: maturity levels.
  <https://www.rfc-editor.org/rfc/rfc2026>
- lychee — the link checker. <https://lychee.cli.rs/>
