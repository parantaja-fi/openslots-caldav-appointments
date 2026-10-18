---
id: "upstream-fixes-reach-a-fork-2026-10-18"
status: "backlog"
priority: "high"
assignee: null
epic: "Maintenance"
dueDate: null
created: "2026-10-18T11:00:47.000Z"
modified: "2026-10-18T19:36:36.000Z"
completedAt: null
labels: ["0.1.x"]
order: "a8Y"
---
# Upstream fixes reach a fork

> Written 2026-10-18 while reviewing what a running fork needs after
> setup, around `m65-reconfiguration-2026-10-10`.

A fork receives no fix of itself. The code, `deploy.yml` and the wizard
manifest reach it only when its owner syncs it with the upstream —
GitHub's *Sync fork* button, or the one REST call
`POST /repos/{owner}/{repo}/merge-upstream`, both settled in
`docs/fork-guided-setup.md` §8 and §10 — and then runs *Deploy* again.
0.1.x exists to ship fixes to running forks, yet nothing tells the
practitioner this: `SETUP.md` Part 6 and the wizard's closer speak of
changing settings, never of updating, and GitHub does not notify a
fork's owner of upstream commits or releases.

What shapes the mechanism:

- A sync, by the button or the REST call alike, fast-forwards a fork
  with no commits of its own and merges one that has some; GitHub
  offers no rebase. The wizard's record commits (`.wizard/fork.json`)
  are such commits on `main`, so today every configured fork's sync is
  a merge. Secrets and variables are untouched by it.
- A sync can bring a new required setting. `DISPLAY_TIMEZONE` became
  required on 2026-10-17
  (`all-day-and-floating-times-are-read-as-utc-2026-10-15`): a fork
  stored before that with email off syncs, deploys, and then fails
  every request until the variable is set, which the health probe at
  the end of the deploy run reports. An update is therefore sync,
  deploy, and sometimes a reconfiguration — the one
  `m65-reconfiguration-2026-10-10` must make cheap.
- Whether a fork is behind is public:
  `GET /repos/{owner}/{repo}/compare/{upstream}:main...{owner}:main`
  answers `behind_by` without a token, so the wizard can say so before
  anyone authenticates.
- The practitioner's one notification is *Watch → Custom → Releases*
  on the upstream.

Whether the wizard performs the sync itself belongs to the maintenance
mode's design, not here; this card is the path, its documentation, and
the record's move off `main`.

## The wizard's record leaves the `main` branch

The record moves to a branch of its own, read without a token from
there (`?ref=`). `main` then carries only the upstream's commits, and
every sync, by the button or by the wizard, is a fast-forward: history
stays linear and nothing is rewritten. A store stops pushing to `main`
as well. A practitioner who commits to `main` themselves gets GitHub's
merge instead; rebasing their own commits is theirs to choose, not the
wizard's.

The wizard's other commit on `main` must leave it too: the empty one
`registerWorkflows` lands when a dispatch answers 404, since a fresh
fork lists no workflows until a commit lands
(`docs/fork-guided-setup.md` §7.3). Where that commit may land instead
is not yet known; the probe below settles it.

No fork needs migrating: every fork so far is a test fork, deleted and
remade at will. Landing the move before
`the-authors-production-fork-2026-10-18` is set up keeps it so.

## Workflow changes

A sync whose upstream commits change `.github/workflows/` needs a token
with the Workflows permission; GitHub refuses it otherwise, and
`gh repo sync` matches that refusal. The wizard's token has none.
Withholding the permission is least privilege, not a guard on the
fork's secrets: the token's contents and Actions rights already reach
those through the code `deploy.yml` runs. The upstream's workflows are
expected to settle soon (the author, 2026-10-18), so such syncs should
be rare. For one, the practitioner presses GitHub's own *Sync fork*
button, which acts with the practitioner's own rights.

## Probed first, on a throwaway fork

1. Does the record's commit, on its own branch, register the
   workflows?
2. If only a commit on `main` does, does the registration survive
   moving `main` back past that empty commit, once, at setup? Its tree
   is the head's own, so nothing deployed changes.
3. Does the *Sync fork* button take a sync that changes a workflow?
4. Does a sync's push to `main` run `ci.yml` in the fork, whose
   credentialed jobs lack the upstream's secrets there?

If neither 1 nor 2 holds, the sync stays GitHub's merge and the record
need not move.

## Acceptance

- The record lives on its own branch, where the wizard writes and
  probes it, and `ARCHITECTURE.md` §1 says so. A fork set up afresh is
  then ahead of the upstream by nothing, so its next sync is a
  fast-forward. Or the probe showed this cannot be, and the card says
  why.
- `SETUP.md` Part 6 says how a fork is updated — sync, deploy — and
  what to do when the deploy run's health probe names a missing
  setting.
- The wizard's closer, or the maintenance mode that succeeds it, names
  the same path.
- A fork stored before 2026-10-17 with email off, synced to current
  `main`, deploys green once the time zone is set and takes a booking —
  or what it took instead is on the board.