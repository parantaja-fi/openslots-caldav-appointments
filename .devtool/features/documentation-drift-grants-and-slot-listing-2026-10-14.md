---
id: "documentation-drift-grants-and-slot-listing-2026-10-14"
status: "backlog"
priority: "low"
assignee: null
epic: "Documentation"
dueDate: null
created: "2026-10-14T12:23:10.000Z"
modified: "2026-10-15T05:30:39.000Z"
completedAt: null
labels: ["0.1.x"]
order: "a5"
---
# Documentation drift: grants and slot listing

> Written 2026-10-14 from a reading of the Worker during that day's
> competitor comparison. The documents that change with the booking
> path's fixes are on those cards.

- `SCOPE.md` §3 says "Per-slot, short-lived create-grants issued with
  the slot list"; the code and `ARCHITECTURE.md` §5.2 issue one grant
  per list. It drifted because it restates a mechanism, which
  `CLAUDE.md` says to reference instead. Reduce the bullet to the
  constraint (plain signed ES256 JWT capabilities, no server-side
  session state) and point to `ARCHITECTURE.md` §5.
- `ARCHITECTURE.md` §3's table has `GET /v1/slots` require the session's
  key thumbprint. The code makes it optional: without one, the listing
  comes back without a grant, for a viewer who need not hold a session.
  Say so in the table, and in §5.4, which also reads as mandatory.

## Acceptance

- The documents say what the code does.
- Checked against `PRIVACY.md` and `SECURITY.md`'s scope list, as
  `CLAUDE.md` requires for §5 edits; no change expected.