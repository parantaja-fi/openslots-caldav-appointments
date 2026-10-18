---
id: "worker-name-collides-for-a-same-owner-fork-2026-10-18"
status: "review"
priority: "high"
assignee: null
epic: "Maintenance"
dueDate: null
created: "2026-10-18T12:19:43.000Z"
modified: "2026-10-18T13:56:34.000Z"
completedAt: null
labels: ["0.1.x"]
order: "a0"
---
# Worker name collides for a same-owner fork

> Written 2026-10-18, planning the author's production fork as a
> sibling repository under the same GitHub owner
> (`the-authors-production-fork-2026-10-18`). Built the same day; in
> Review until the upstream's dispatch below.

`deploy.yml` named the Worker `<owner>-booking-worker`, so the upstream
and a fork under another owner shared one Cloudflare account without
colliding. A fork under the *same* owner — an organisation may fork its
own repository under another name (verify on the fork page; a user
account may not, and the sibling would then need another owner) —
deployed onto the very Worker the upstream's runs deploy to: each run
overwriting the other's code and secrets.

Two ways out were weighed:

1. Derive the name from owner and repository, `<owner>-<repo>`. No
   knob. Every existing deployment's Worker is renamed on its next
   deploy, which mints a fresh signing key under the new name, voids
   the emailed cancellation links, and leaves the old Worker to delete
   by hand. Today that is one Worker, the upstream's own; after
   `m66-external-acceptance-2026-10-10` the same change costs a
   practitioner.
2. An optional `WORKER_NAME` Actions variable, default as before. Keeps
   every deployment stable; adds a knob only a same-owner fork needs.

## Done, 2026-10-18

Option 1, for the timing. `deploy.yml` derives the name from
`GITHUB_REPOSITORY`: lowercased, each run of other characters one `-`,
none at either end. A name over 63 characters fails the run rather
than being cut into another collision: 63 is the workers.dev hostname
label's limit
(<https://developers.cloudflare.com/workers/wrangler/configuration/>).
Wrangler's own deploy check is laxer — `_` allowed, no length limit —
so the step's check is the only guard. `ARCHITECTURE.md` §7 changed
with it; the wizard finds the Worker URL in `deploy-info.json`, so
nothing else did.

Verified locally only: the derivation on sample names, with BSD and
GNU `tr`; `wrangler deploy --dry-run` on the assembled configuration;
the wizard's manifest test. Cloudflare has not yet seen the new name.

## Next: the upstream's dispatch

1. Push `main`, then run Deploy on the upstream: Actions → Deploy →
   Run workflow, or
   `gh workflow run deploy.yml -R parantaja-fi/openslots-caldav-appointments`.
2. In the run's log:
   - "Deploy the Worker" publishes
     `parantaja-fi-openslots-caldav-appointments.pekka-nikander.workers.dev`;
   - "Mint the signing key if absent" mints one, the new Worker having
     none;
   - "Probe health" is green.
3. On the hosted site, `deploy-info.json` names the new Worker URL and
   a test booking goes through. Cancellation links the old Worker
   emailed are void, as expected.
4. Delete the old Worker, `parantaja-fi-booking-worker`: Cloudflare
   dashboard → Workers & Pages → it → Settings → Delete. Or, signed in
   to that account, from `worker/`:
   `npx wrangler delete parantaja-fi-booking-worker --dry-run`, then
   without `--dry-run`. Name it explicitly: bare, the command would
   take the local `wrangler.toml`'s name.
5. Point `spike/two-window.html`'s "Worker health (upstream)" probe at
   the new hostname.
6. Move this card to Done.

## Acceptance

- The upstream's dispatch lands on
  `parantaja-fi-openslots-caldav-appointments`, its health probe green,
  and `parantaja-fi-booking-worker` is deleted.
- The same-owner half — two Workers side by side — is proven by the
  production fork's first deploy, whose card checks the upstream's
  Worker untouched.