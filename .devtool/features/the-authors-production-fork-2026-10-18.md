---
id: "the-authors-production-fork-2026-10-18"
status: "backlog"
priority: "high"
assignee: null
epic: "Maintenance"
dueDate: null
created: "2026-10-18T12:19:43.000Z"
modified: "2026-10-18T12:19:43.000Z"
completedAt: null
labels: ["0.1.x"]
order: "a8a"
---
# The author's production fork

> Written 2026-10-18. The forking workflow used for the author's own
> practice, downstream of this repository, within weeks; the dated
> account of what it took goes here.

A sibling repository under `parantaja-fi`, forked from this one under
another name, set up through the hosted wizard like any fork and
deployed by its own `deploy.yml` runs. Its Pages serve the booking page
at `parantaja-fi.github.io/<name>/` until
`booking-page-integrated-into-the-operators-site-2026-08-06` moves it
onto parantaja.fi; its Worker runs under its own name. This repository
then runs CI and hosts the wizard, never production: its Worker is a
test deployment, and the gitignored `wrangler.production.toml` stays
dead.

What it exercises that the M6.4 walks could not: the signing key minted
on a first run; a fork whose owner is an organisation, and the same as
the upstream's; and a deployment that will be maintained — the live bed
for `m65-reconfiguration-2026-10-10` and
`upstream-fixes-reach-a-fork-2026-10-18`, and what makes
`deployment-heartbeat-2026-10-15` concrete.

Credentials are issued for it, never copied from development:
production app passwords for the practice calendars, labelled for the
purpose at the provider; a Brevo key of its own, so the development key
stops doubling as production's; a Cloudflare token for its deploy. That
retires the deploy rows of
`rotate-every-credential-at-the-020-release-2026-10-17` early; the
exposed test credentials still rotate at 0.2.0 as ruled.

Needs first: `worker-name-collides-for-a-same-owner-fork-2026-10-18`.
Nothing else: the wizard as released walks it, and the maintenance mode
arrives to a deployment already running.

## Acceptance

- A booking made on the sibling's page lands in the practice calendar,
  its confirmation arrives from the practice's sender address, and its
  emailed link cancels it; this repository's Worker is untouched by the
  sibling's runs.
- The date, the sibling's name and what tripped the walk are recorded
  here; trips become 0.1.x cards.