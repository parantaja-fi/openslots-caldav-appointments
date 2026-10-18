---
id: "pre-push-checks-the-working-tree-not-the-commit-2026-10-18"
status: "todo"
priority: "critical"
assignee: null
epic: "Documentation"
dueDate: null
created: "2026-10-18T19:36:36.000Z"
modified: "2026-10-18T19:36:36.000Z"
completedAt: null
labels: ["0.1.x", "bug"]
order: "a4"
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
directory, runs both checks there, and removes the worktree. Neither
check changes. Git exports `GIT_DIR` and its kin to hooks, and a hook
running Git in another worktree clears them first (githooks(5)).

## Acceptance

- Fed by hand a ref whose commit cites an untracked card, the hook
  fails with the `docs` job's message; likewise a link to an untracked
  file, where lychee is installed.
- A push of a clean commit passes and leaves no worktree behind.
- `METHODOLOGY.md`'s account of the hook says it checks the commits
  pushed.