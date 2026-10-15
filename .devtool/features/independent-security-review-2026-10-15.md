---
id: "independent-security-review-2026-10-15"
status: "backlog"
priority: "medium"
assignee: null
epic: "Security"
dueDate: null
created: "2026-10-15T06:37:22.000Z"
modified: "2026-10-15T06:37:22.000Z"
completedAt: null
labels: ["later"]
order: "aEV"
---
# Independent security review

> Added 2026-10-15. A first, internal security round is done; this is
> the review it does not replace.

`SECURITY.md` says the project has had no independent security review
and was largely written by an LLM, while the wizard asks practitioners
to paste a GitHub PAT, a Cloudflare token and calendar credentials. The
scope is `SECURITY.md`'s list: the capability-grant and
cancellation-token model (`ARCHITECTURE.md` §5), the wizard's
sealed-box writes of credentials into a fork, and the deploy workflow
that consumes them.

## Acceptance

- Each finding fixed, or on the board.
- `SECURITY.md`'s status says what review the project has had.