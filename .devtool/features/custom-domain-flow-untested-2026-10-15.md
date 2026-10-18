---
id: "custom-domain-flow-untested-2026-10-15"
status: "backlog"
priority: "low"
assignee: null
epic: "Maintenance"
dueDate: null
created: "2026-10-15T05:32:55.000Z"
modified: "2026-10-18T12:18:58.000Z"
completedAt: null
labels: ["0.1.x"]
order: "a8V"
---
# Custom-domain flow untested

> From `NOW.md`'s untested residue.

A deployment moved onto its own domain, as `SETUP.md`'s "Your own
domain" suggests (`booking.yourpractice.com` for the page,
`api.yourpractice.com` for the API), has not been tried end to end.
`ARCHITECTURE.md` §7 says it needs only a deploy re-run, never a
reconfiguration, everything origin-shaped being derived on each run.
The author's walks met only an account-level Pages custom domain
(`docs/m6.4-walk-notes.md`, attempt 2, step 8), which the wizard leaves
alone.

## Acceptance

- A deployment moved to its own domain takes a booking and cancels it
  from the emailed link after nothing but a deploy re-run, or what it
  took instead is on the board.