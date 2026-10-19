---
id: "pre-push-checks-the-working-tree-not-the-commit-2026-10-18"
status: "in-progress"
priority: "critical"
assignee: null
epic: "Documentation"
dueDate: null
created: "2026-10-18T19:36:36.000Z"
modified: "2026-10-19T16:15:04.000Z"
completedAt: null
labels: ["0.1.x", "bug"]
order: "a0"
---
# Pre-push checks the working tree, not the commit

> Written 2026-10-18, after the hook passed a push that CI's `docs` job
> then failed.

`.githooks/pre-push` runs `scripts/check-cards.sh` and lychee over the
working tree, so both see files the push does not carry. 6121656 cited
`the-authors-production-fork-2026-10-18` while that card existed only
in the working tree: the hook found the file and passed the push, and
the `docs` job, checking out the commit alone, failed on it until
c9626c5 committed the card. lychee has the same gap — a link to an
untracked file, or to an anchor only an uncommitted edit adds, passes
locally — and a reference only an uncommitted edit removes goes
unchecked.

## The fix

The hook checks what it pushes, as the `docs` job checks its checkout:
for each ref on its standard input whose local object is not all
zeros, it adds a detached worktree of that commit in a temporary
directory, runs both checks there, and removes the worktree, also when
a check fails or the hook is interrupted. Neither check changes. Git
exports `GIT_DIR` and its kin to hooks, and a hook running Git in
another worktree clears them first (githooks(5)).

Settled with the owner on 2026-10-19:

- Only each ref's tip is checked, as only the tip reaches the job.
  Unclean commits inside a push are acceptable; every pushed, and so
  perhaps tagged, version is clean, and failing on an earlier commit
  would mean rewriting history before the push.
- The pushed commit's own `scripts/check-cards.sh` runs. When it
  differs from the working tree's the hook refuses with exit 78
  (`EX_CONFIG`). Pushing a ref other than the one checked out may thus
  fail; the script changes rarely. `v0.1.0` predates it, so a push of
  that tag (to a fresh remote under `push.followTags`, say) needs
  `--no-verify`.
- Git runs the hook with the remote's name and URL as arguments even
  when nothing is pushed, its standard input then empty; that exits 0.
  Run by hand, with neither arguments nor refs (standard input a
  terminal or empty), the hook keeps its old working-tree check,
  warning `warning: pre-push: checking the working tree` on stderr.

## Acceptance

- Fed by hand a ref whose commit cites an untracked card, the hook
  fails with the `docs` job's message; likewise a link to an untracked
  file, where lychee is installed.
- A push of a clean commit passes and leaves no worktree behind, nor
  does an interrupted check.
- A pushed commit whose `scripts/check-cards.sh` differs from the
  working tree's is refused with exit 78.
- With nothing pushed the hook exits 0; run by hand with no input it
  warns and checks the working tree.
- `METHODOLOGY.md`'s account of the hook says it checks the commits
  pushed.