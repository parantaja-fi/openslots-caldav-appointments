---
id: "decide-sign-in-instead-of-a-token-per-visit-2026-10-18"
status: "backlog"
priority: "high"
assignee: null
epic: "Maintenance"
dueDate: null
created: "2026-10-18T12:19:43.000Z"
modified: "2026-10-18T18:28:38.000Z"
completedAt: null
labels: ["0.1.x", "decision"]
order: "a8b"
---
# Decide: sign-in instead of a token per visit

*Draft, opened 2026-10-18.*

> Written 2026-10-18 while redesigning `m65-reconfiguration-2026-10-10`
> into a maintenance mode, with the author's production fork
> (`the-authors-production-fork-2026-10-18`) as its first deployment.
> The step the practitioner meets on every return visit.

**The question.** Every maintenance act is a write to the fork — a
secret or variable, a merge from the upstream, a deploy dispatch — so
it needs GitHub's authority. Today that is a fine-grained PAT minted per
visit from a prefilled link (`PAT_URL` in `wizard/src/main.ts`: name,
description, seven-day expiry and the four permissions prefilled, the
repository pick not), pasted into the tab, and revoked afterwards by
the closer's link. The wish is a login, not a credential mint.

**What must not change.** Where the authority ends up: in the wizard
tab, in memory, for the visit, scoped to the one fork. And what the
Worker holds: write credentials for the booking calendar only
(`ARCHITECTURE.md` §5.3). Any design that parks GitHub authority in
the Worker, so that a passkey or password *to the Worker* could change
the configuration, widens a compromised Worker's reach from the
bookings it manages anyway to the fork's secrets, its workflow, and
through `deploy.yml` every credential including the Cloudflare token.
A Cloudflare token in the Worker, for writing its own secrets, is the
same widening and ends portability besides. That is the architecture
change to refuse, whatever the login looks like.

**The chicken and the egg.** A GitHub sign-in from a static page needs
a server for one step — the token exchange (web flow) or a CORS relay
(device flow; `github.com/login/*` is expected to send no CORS
headers — verify). The only server a fork has is its Worker, which
does not exist before the first deploy. So setup keeps the PAT, once;
the sign-in is for every visit after.

## Options

1. **The PAT, as today**, the link's expiry shortened to a day. No
   machinery. The friction stays: GitHub's settings page, Generate,
   copy, paste, revoke.
2. **Per-fork GitHub App, web flow.** At setup, one more deep-linked
   click creates a GitHub App owned by the practitioner through
   GitHub's manifest flow (`/settings/apps/new` with a posted
   manifest; the conversion call on `api.github.com` needs no
   authentication — verify its CORS); the wizard stores the client id
   as a variable and the client secret as a fork secret through the
   setup PAT, keeps no private key, and the practitioner installs the
   App on the fork, one click more. A visit: redirect to GitHub,
   approve, back; the Worker exchanges the code for a user token with
   the client secret and hands it to the tab; the token carries the
   App's permissions on that fork and expires in eight hours. The
   Worker holds a client secret, with which a compromise could complete
   exchanges for codes it does not have — not mint tokens.
3. **Per-fork GitHub App, device flow.** As 2, but no client secret
   anywhere: the Worker relays two routes unchanged. The visit shows a
   short code the practitioner types into GitHub's page. The paste
   returns, smaller.
4. **Passkeys to the Worker.** WebAuthn fits the stateless model: the
   credential's public key a configured variable, challenge and session
   signed JWTs under the existing key. It authenticates the
   practitioner to the party that must not hold the authority the visit
   needs. Its place is a later Worker-side console — cancel-and-notify,
   deeper health, resend — not the configuration path.

Additionally, the following was considered but rejected:

5. **One GitHub App owned by the upstream, device flow.** No manifest
   step: the client id is public and hard-coded. But the App's owner
   can mint installation tokens for every installation, so the upstream
   would hold standing write access to every fork's secrets and
   deploys — a trust the fork posture does not ask for today, and
   `SECURITY.md` would have to say so.


**Tentative recommendation.** Option 2, with 1 kept as the by-hand
route `SETUP.md` documents and the fallback when the App is gone.
Cost: the manifest step and the install step in the wizard's setup;
the sign-in lap replacing the paste in the maintenance mode;
one exchange route on the Worker, CORS-open like health,
documented in `ARCHITECTURE.md` §1 and §3; two configuration entries.
To check at implementation: CORS on the
`github.com/login` endpoints; whether GitHub's web flow has since
gained a secretless PKCE variant, which would make 2 as free of secrets
as 3; the App's user-token lifetime setting; and that the callback URLs
cover both the upstream-hosted wizard and the fork's own copy.

**What it binds.** The maintenance mode's entry, and whether the setup's
closer still says "revoke the token" — it does, for the setup PAT.