---
id: "m65-reconfiguration-2026-10-10"
status: "todo"
priority: "high"
assignee: null
epic: "Maintenance"
dueDate: null
created: "2026-10-10T14:21:47.000Z"
modified: "2026-10-18T18:28:38.000Z"
completedAt: null
labels: ["0.1.x"]
order: "a5"
---
# M6.5 — Maintenance mode in the "wizard" SPA

> Named Reconfiguration on 2026-10-10, prompted by walk attempt 2
> (2026-09-08); from `ROADMAP.md`. Redesigned 2026-10-18 as the
> wizard's return visit, with the author's production fork
> (`the-authors-production-fork-2026-10-18`) its first deployment; the
> sign-in it rests on is still to be decided
> (`decide-sign-in-instead-of-a-token-per-visit-2026-10-18`).

**Why.** The store writes every visible, non-empty, valid value the tab
holds (`effectiveValues`, `wizard/src/form.ts`), and the stepper tells
a returning practitioner to re-enter the lot. In a fresh browser the
secrets are in fact left alone — an empty value is skipped, not
written — but every booking-shape variable with a default is reset to
it without a word, nothing is ever deleted at either layer, and nothing
is read back. One changed setting costs a whole lap. The closer's
promise, "come back here: adjust the form, paste a fresh token, store
and deploy again", is what this makes cheap.

**The mode.** The same wizard SPA, a second view like the Google one,
entered when the probes find the fork's `.wizard/fork.json` — the
record every store already commits.
No fork is the current setup mode; a fork without the record is
setup resumed; a fork with it is maintenance. The upstream has no
record, so it needs no exception. A fresh browser asks the one question
it asks today, the GitHub username; the rest is probed. The hosted
wizard stays the one URL; the fork's own copy is as old as its last
sync.

**Status first, unauthenticated.** Findings, each carrying one named
remedy: fork found; last stored when; last deploy run when and how it
ended, with the run's own message when red; Worker health per calendar,
email transport and configuration parse; page and cancel page
reachable; DNS records still verified, by DoH; behind the upstream by
N changes, from the compare endpoint. This is the health page too, and
the Worker learns nothing new for it. Where health is blind — a revoked
Brevo key reads as present — the page says what it cannot see.

**Sign in.** The remedies write the fork, so the mode needs GitHub's
authority for the visit. How the practitioner obtains it is the
sign-in decision's to settle; what any answer must keep — the
authority in tab memory for the visit, none of it in the Worker — is
stated there. Until it lands, and as the fallback after, the PAT is
pasted as today.

**Remedies, authenticated.**

- *Change a setting.* Variables read back from the fork, so a forgotten
  form resets nothing; secrets listed by name and last-written date,
  never value; the store writes only the cards changed in this tab.
- *Replace a credential.* The one card opens, with the provider deep
  links the setup cards carry; one secret written; deploy.
- *Switch calendar provider.* The one remedy that deletes: the previous
  provider's secrets leave the fork, and `deploy.yml` reconciles the
  Worker's secrets against the fork's — every manifest secret absent in
  GitHub is deleted on the Worker, so a stale username no longer
  selects Basic auth against Google (`config.ts`). The Google
  hand-over's D6 (`docs/google-calendar-wizard.md` §9) waits on this.
- *Update from the upstream.* `merge-upstream`, then deploy;
  `upstream-fixes-reach-a-fork-2026-10-18` holds the path and its
  documentation, this is where the wizard performs it. A new required
  setting the update brings — `DISPLAY_TIMEZONE` since 2026-10-17
  (`all-day-and-floating-times-are-read-as-utc-2026-10-15`): a fork
  stored before that with email off fails every request after its next
  deploy — surfaces as a finding from the run's health probe and is
  fixed by the first remedy.
- *Deploy again.* For the vanished Worker, the renamed fork, the new
  domain (`custom-domain-flow-untested-2026-10-15`).

The deploy run's closing health probe turns the findings green, as
setup's does. The guiding comes from the manifest's help text, which
says what each value is and who issues it, and from remedies phrased as
verbs.

**Setup may gain steps** for the sign-in — under the decision's
GitHub App options, creating the fork's App and installing it on the
fork, its configuration stored with the rest through the setup PAT. A
fork set up before such steps exist takes them on its first visit, by
PAT.

**Out.** Signing-key rotation (a dispatch input on `deploy.yml`, with
`rotate-every-credential-at-the-020-release-2026-10-17`), the
heartbeat, validity checks deeper than health, any Worker-side console.

## Order of work

1. The kernel: read-back, the changed-cards-only store, deletions in
   the fork and the reconciling deploy. Exercised on the production fork
   at once, by PAT.
2. The sign-in, once decided: its setup steps, whatever the Worker
   serves for it, the lap in the mode.
3. The mode's entry and the status page with its remedies.
4. Update from the upstream.

## Acceptance

- From a fresh browser, after authenticating, one stored value is
  changed in one card with every other stored value intact and no
  credential re-entered; the deploy run's health probe is green.
- A provider switch leaves no secret of the previous provider in the
  fork or on the Worker.
- A fork behind the upstream is updated and deployed from the page; a
  missing required setting the update brings is named as a finding and
  fixed in place.