# Fork-guided setup — the browser as the whole toolchain

> Exploratory, 2026-08-09, and unlike its siblings empirically
> grounded: every load-bearing claim below was tested live the same day
> (§7). Companion to `practitioner-spa.md` (which audits what an SPA can
> verify) and `simplicity-and-flexibility.md` §3 (deployment postures);
> this note answers a sharper question: how much of `SETUP.md` can a
> guided SPA *do*, and can the practitioner's whole journey stay inside
> one well-guided window? Nothing here is committed scope.

## 1. The iframe answer, first

The tempting shape — third-party signups embedded in an iframe so the
practitioner never leaves the wizard — is dead, twice over:

- Cloudflare's dashboard sends `X-Frame-Options: SAMEORIGIN`; GitHub
  and Google login send `deny`/`DENY` (verified). This is
  anti-clickjacking machinery working as intended and will not soften.
- Even where framing is permitted (Brevo's app sent no framing
  header), browsers now partition third-party cookies inside iframes,
  so a login session established in an embedded frame is broken by
  construction.

The achievable equivalent: **one persistent wizard tab** holding the
checklist and all state; each third-party step opens via `window.open`
into a popup with per-provider instructions and deep links; and the
wizard **detects completion itself** — not through the popup
(cross-origin `window.opener` yields nothing) but by probing things it
can reach (§2). The practitioner's experience is still "come back to
the wizard, watch the tick turn green".

## 2. The CORS asymmetry that shapes everything

What a static, cross-origin SPA can call directly (all verified):

| Surface | Browser-callable? |
|---|---|
| `api.cloudflare.com` | **No.** No CORS headers; preflight rejected. |
| `api.github.com` | **Yes.** `Access-Control-Allow-Origin: *`, `Authorization` allowed on all methods, preflight cached 24 h. |
| `api.brevo.com` | **Yes.** Reflects arbitrary origins, all methods, `api-key` header accepted. |
| `cloudflare-dns.com` (DoH) | Yes — deliberately CORS-open. |
| The operator's Worker | Yes, by our own `ALLOWED_ORIGINS`; a token-less health subset can be CORS-`*`. |
| CalDAV backends | Effectively no; all CalDAV verification goes through the Worker. |

Cloudflare authority is unreachable from the browser; GitHub authority
is fully reachable. That asymmetry, not taste, dictates the design.

## 3. The mechanism: the fork as automation proxy

The practitioner's fork is not merely where their copy lives — it is
the arm that wields the authority the browser cannot.

**The fork itself is made manually** — one click on the Fork button,
deep-linked by the wizard, while the practitioner is in GitHub's UI
anyway having just created the account. This is deliberate, not a
concession: fork existence is publicly readable
(`GET /repos/{user}/{fork}`), so the wizard polls unauthenticated and
auto-advances the moment the fork appears; and with the fork existing
first, the PAT (personal access token, fine-grained) that the
practitioner then mints can be scoped to **that one repository** —
no account-wide grant, and no dependence on the fork-creation
endpoint, historically the shakiest under fine-grained tokens.

With that one repo-scoped PAT pasted into the wizard, the SPA can,
entirely from the browser (§7 for what each rests on):

1. write a config commit via the contents API — which, usefully, is
   also what registers the fork's inherited workflows with Actions
   (§7.3: a fresh fork lists zero workflows until its first commit;
   no UI click is needed, but a commit is);
2. write **Actions secrets** (libsodium sealed box; runs fine in a
   browser);
3. create the **Pages site** (`POST /repos/…/pages`,
   `build_type: workflow`);
4. dispatch the deploy workflow and poll the run to green — run
   status of a public repo is readable *unauthenticated*, so the
   wizard shows live CI progress without spending the PAT.

The deploy workflow then does everything that today needs a terminal:
`wrangler deploy` with the pasted-through Cloudflare API token, GitHub
secrets forwarded to Worker secrets, the frontend built and deployed
to Pages. Two whole error classes vanish because CI *derives* what a
human today transcribes: `VITE_WORKER_URL` (from the account's
workers.dev subdomain, queried with the same token) and
`ALLOWED_ORIGINS` (the Pages origin, *read* from the Pages API — an
account-level custom domain changes it, §7.9 — never constructed
from the username). `CANCEL_URL` falls out the same way.

Two further eliminations:

- **The signing key stops being a step.** Either the wizard generates
  the ES256 JWK with WebCrypto, or — better — the deploy workflow
  generates it on first run and `wrangler secret put`s it directly:
  the key then never exists outside Cloudflare at all. Subsequent
  deploys see it in `wrangler secret list` and leave it alone;
  rotation is a re-run with a flag. (Design sketch; verify at
  implementation. Never write it to the run log — public repo.)
- **Brevo's DNS step inverts.** The Brevo API returns, per domain, the
  exact records to place and a per-record `status` boolean
  (`dkim1/dkim2` CNAMEs, `brevo-code` TXT, DMARC TXT — the modern set
  does not even involve editing SPF). The wizard displays the
  authoritative records itself, polls both Brevo's view and DoH, and
  goes green on propagation. `SETUP.md` Part 4's "leave the Brevo tab
  open and transcribe carefully" disappears.

Config changes after setup ride the same loop: the wizard (or the
GitHub web editor, deep-linked) commits, CI redeploys. The no-terminal
property persists past setup.

## 4. The ledger

| `SETUP.md` step | Fork-posture outcome |
|---|---|
| Node + git + terminal (prereq 5) | **Eliminated.** No local-machine role remains. |
| GitHub account | **New manual prerequisite** (today anonymous clone suffices). Popup; undetectable; "done" button. |
| Cloudflare account | Manual, popup; detected only retroactively, when the token's first CI job succeeds. |
| Cloudflare API token | Manual mint (deep-linked, screenshotted), one paste. Verified by a CI job — the browser cannot check it. |
| The fork | Manual, **one deep-linked click**; wizard auto-detects it unauthenticated (§3). |
| GitHub PAT | Manual mint, one paste. Scoped to the fork alone; still the wizard's strongest credential — §6. |
| Pages site, CI wiring, secrets entry | **Automatic** (browser + repo-scoped PAT). |
| Signing key | **Automatic** (CI-generated, §3). |
| CalDAV calendar creation, app password | Manual in the provider's UI (popup); then **verified through the Worker**: test-REPORT, list calendars, see the `OPEN` event. The most error-prone step becomes a green tick. |
| Worker + page deploy | **Automatic** (Actions). |
| `VITE_WORKER_URL`, `ALLOWED_ORIGINS`, `CANCEL_URL` | **Automatic** — derived in CI; the wizard's live CORS fetch is self-demonstrating proof. |
| Brevo account | Manual, popup. |
| Brevo domain + DNS records | Domain created and monitored **via the Brevo API from the browser**; records displayed by the wizard; registrar edit manual; DoH + Brevo polling turn it green. |
| Smoke test | The wizard scripts it, against the health endpoint and a real slot. |
| Later config changes | Commit → CI redeploy; no terminal, ever. |

Irreducible manual core: **four account creations** (GitHub,
Cloudflare, Brevo, CalDAV provider if new), **one fork click**,
**three-or-four credential mints**, **one registrar DNS edit**.
Everything between them automates, and every manual step ends with a
paste into the wizard or a probe the wizard can watch.

## 5. Where the wizard runs, and the bootstrap

The wizard itself is the helper SPA of `practitioner-spa.md` §1 role 1
— unauthenticated toward the Worker, no admin surface. The fork gives
it a natural home: the practitioner's own Pages serves their own copy.
But the session starts before the fork (or its Pages site) exists, so
the first stretch necessarily runs from the **upstream project's
hosted copy** (the hosted wizard `ROADMAP.md` M5–M6 schedule). The
manual-fork ordering (§3) allows a clean split: only the PAT need
transit the upstream-hosted copy — it provisions Pages and the first
deploy, then hands off to the fork's own copy, into which the
longer-lived secrets (Cloudflare token, CalDAV credentials, Brevo
key) are pasted. Or simpler: finish the session where it started.
Either way the code the credentials transit is the repository's own
static, open-source SPA — the same trust as running its CI.

## 6. Trust, soberly

- **The PAT is the strongest credential the wizard touches.** Even
  repo-scoped, it can rewrite workflows and thereby exfiltrate the
  other secrets in that repo. Mitigations: fine-grained and scoped to
  the fork alone (§3 — possible only because the fork is made first),
  short expiry, revoked after setup (the wizard's last step says so).
  The paranoid path stays open: do the GitHub steps by hand in
  GitHub's own UI; the wizard degrades to verifier, which is exactly
  `practitioner-spa.md`'s Stage 1.
- **GitHub becomes a secret custodian** — CalDAV credentials and the
  Brevo key transit repo secrets on their way to Worker secrets. The
  narrower-trust alternative (paste secrets into the Cloudflare
  dashboard instead, CI never sees them) costs a few clicks and is a
  fork in the checklist, not a different architecture.
- **The fork must be public** for free Pages; Actions minutes are free
  on public repos. Secrets are safe in a public repo, but run logs are
  public — CI must never print derived secrets (§3).
- **P3 holds.** The browser tab is the practitioner's machine; tokens
  live in its memory and go only to the APIs they belong to; no server
  of ours ever sees them (there is no server of ours at all). This is
  the local `npx` wizard of `simplicity-and-flexibility.md` §3
  posture 3 reborn as a page, with the fork's CI as its executing arm.
- **Updates** are the fork-sync button, one click, also drivable by
  API (untested).

## 7. Verification log, 2026-08-09

All tests live, from this machine; the flow tests (3–6) under a
classic-scope token (`repo`), the post-fork wizard sequence re-run
under a repo-scoped fine-grained PAT (8).

1. **Framing**: `dash.cloudflare.com` → `X-Frame-Options: SAMEORIGIN`;
   `github.com/login` → `deny`; `accounts.google.com` → `DENY`;
   `app.brevo.com` → no framing header (but see §1 on partitioned
   cookies).
2. **CORS**: `api.cloudflare.com` — no ACAO on GET with Origin,
   preflight 400. `api.github.com` — ACAO `*`; preflight allows
   `Authorization` on GET/POST/PATCH/PUT/DELETE, `max-age` 86400.
   `api.brevo.com` — reflects origin, all methods, on real
   authenticated calls.
3. **Fork flow**: `POST /forks` with `organization` created
   `parantaja-fi/fork-guided-setup-test` from
   `pekkanikander/fork-guided-setup-test`. Fresh fork:
   `actions/permissions` says `enabled: true`, but **zero workflows
   registered and dispatch 404s** until a first commit lands — a
   one-file contents-API `PUT` registered both inherited workflows
   (`active`) within seconds. No UI interaction at any point.
4. **Secrets**: sealed-box write via the secrets API; a dispatched
   workflow confirmed the secret present (checked presence, not
   value).
5. **Pages**: `POST /pages` with `build_type: workflow`, then a
   dispatched `actions/deploy-pages` workflow;
   `https://parantaja-fi.github.io/fork-guided-setup-test/` serves 200.
6. **Polling**: run status of the public fork readable with an
   `Origin` header and no authentication.
7. **Brevo**: `GET /v3/senders/domains` (real key, Origin header) —
   CORS pass, `parantaja.fi` reported authenticated+verified. `POST` a
   throwaway domain → full `dns_records` payload with per-record
   `status`; `GET` it back; `DELETE` clean. All browser-callable.

8. **Fine-grained PAT** (added later the same day): a PAT scoped to
   the *single* test repository, permissions Contents, Actions,
   Secrets and Pages (all read/write): config commit 201, sealed-box
   secret write ok, `workflow_dispatch` 204, run polling 200 — but
   **Pages-site creation 403** ("Resource not accessible by personal
   access token"). Adding **Administration read/write** to the same
   token turned it into 201, the dispatched deploy ran, and the page
   served. Proven minimal-ish list: Contents, Actions, Secrets,
   Pages, Administration, all on the one fork; whether Pages is
   redundant beside Administration was not isolated. A classic
   `repo`+`workflow` PAT remains the (coarser, also proven) fallback.
9. **Pages origin is not constructible.** The created site's
   `html_url` came back as `http://www.pnr.iki.fi/…` — an
   account-level Pages custom domain propagates to every repo site.
   CI and wizard must therefore *read* the origin from
   `GET /repos/…/pages`, never assume `{user}.github.io`, or
   `ALLOWED_ORIGINS` and `CANCEL_URL` end up silently wrong for
   exactly the practitioners who own a domain.

The test repos (`pekkanikander/fork-guided-setup-test`,
`parantaja-fi/fork-guided-setup-test`) are disposable; deletion is
manual in both (Settings → Danger Zone).

## 8. Open questions

- ~~Fine-grained PAT permission model~~ — settled, §7.8: a PAT scoped
  to the single fork suffices, with Contents, Actions, Secrets, Pages
  **and Administration** (the last needed only for Pages-site
  creation). Residual niggles: whether Pages is redundant beside
  Administration; and that Administration is the widest of the five
  (repo settings, collaborators, deletion — still confined to the one
  fork). The wizard could trade it away by making Pages enablement a
  second deep-linked manual click (fork Settings → Pages → Source:
  GitHub Actions); decide at implementation.
- ~~`wrangler`-side derivations in CI~~ — mostly dissolved by §10: the
  Worker URL is a `wrangler-action` output and the Pages origin a
  `configure-pages` output, so no subdomain query and no hand-rolled
  Pages read. Residue: the first-run signing-key generation and its
  secret-existence check (§3) — still unexercised.
- ~~Fork-sync by API~~ — settled, §10: one native REST call
  (`POST /repos/{owner}/{repo}/merge-upstream`), also GitHub's own
  "Sync fork" button.
- Custom-domain (non-`github.io`) flow; whether the Cloudflare
  token-mint page's deep link survives their bot challenge from a
  fresh account.

## 9. Where it lands

This is a new rung in `simplicity-and-flexibility.md` §3 — call it
**fork-assisted deploy** — and it plausibly replaces both its
neighbours: it subsumes the Deploy-to-Cloudflare button (which covers
only the Worker half and none of the redeploy loop) and retires the
local CLI wizard (same authority story, no terminal). Same ownership
as self-deploy; the practitioner ends with their own repo, their own
page, their own Worker, and a calendar that was always theirs.

Sequencing follows the staging logic the other notes settled: the CI
deploy workflow and the health endpoint are the wizard's groundwork
(`ROADMAP.md` M5.1–M5.2) — they make the fork path *possible* with
only a browser — and the wizard SPA proper is the road to 0.1.0, now
with a verified mechanism instead of a sketch. Acceptance moved with
it: the wizard, not the documentation alone, is the operator
experience (`SCOPE.md` §1 still awaits that amendment).

## 10. Prior art and ready-made parts, researched 2026-08-10

Three questions asked of the ecosystem; three clear answers.

**Is there a PAT-less path for the wizard?** No. Live probes
(2026-08-10) show `github.com/login/*` — web flow and device flow
alike — still emits no CORS headers, and the 2025 PKCE addition came
without a public-client story, so no browser can complete any GitHub
OAuth exchange without a proxy. Every deployed system in this space
(giscus, utterances, Decap CMS) converged on the same shape: a GitHub
App plus a small hosted token broker — a backend, which §5's bootstrap
posture deliberately avoids. The pasted fine-grained PAT remains the
only zero-backend mechanism. One real improvement shipped 2025-08-26:
**PAT template URLs** — the token-mint page accepts query parameters
(`target_name`, `expires_in`, one per permission), so the wizard
deep-links a fully prefilled form; only the repository selection and
the Generate click stay manual. The §7.8 minting ceremony collapses to
click, pick the fork, generate, paste.

**How much of the deploy workflow already exists?** About 80%.
`cloudflare/wrangler-action@v4` does the deploy, forwards env vars to
Worker secrets via its `secrets:` input, and exposes the deployed URL
as a `deployment-url` output — the workers.dev subdomain query
disappears. `actions/configure-pages@v6` outputs the Pages `origin`
and `base_url` *read from the Pages API* — the §7.9 trap, already
solved upstream — and its `enablement: true` can create the site,
though its own docs confirm §7.8 from the other side: the default
`GITHUB_TOKEN` cannot, whatever its permissions; site creation needs
the PAT (or one manual Settings → Pages click, after which
`GITHUB_TOKEN` suffices forever). `upload-pages-artifact@v5` +
`deploy-pages@v5` remain current. The genuinely custom residue is one
step: idempotent first-run keypair generation piped straight into
`wrangler secret put` (stdin, so the key never touches a log), plus
glue. And there is **no case for publishing our own Actions**: forks
inherit `.github/workflows/` and "Sync fork" keeps them current, so a
self-contained `deploy.yml` already *is* the distribution mechanism —
whereas a fork calling an upstream reusable workflow cannot use
`secrets: inherit` across owners and would carry a caller stub kept in
lockstep anyway. Local composite actions if it grows unwieldy; nothing
more.

**Does any deploy-button ecosystem absorb this?** No. Cloudflare's
Deploy button (2025) and every sibling (Netlify, Vercel, Heroku's
`app.json`, Render, Railway) share one shape: clone the repo, prompt
for declared variables, and store all configuration *inside the
vendor's platform*. None will set GitHub Actions secrets, enable
GitHub Pages, or hold third-party (Brevo) credentials — and the
Cloudflare button clones rather than forks, severing the Sync-fork
update path, with Workers Builds as a second CI and second config
surface. The GitHub-native alternative (template repo + first-run
self-configuring workflow) hits exactly the token walls above; its
community workaround is the same user-minted PAT, minus the guided
UI. The wizard's GitHub half is genuinely uncovered ground. The one
convention worth borrowing is Heroku's: a declarative, checked-in
manifest of required configuration (`app.json` /`.dev.vars.example`
style) driving the wizard's prompts, rather than prompts hard-coded
in wizard source.
