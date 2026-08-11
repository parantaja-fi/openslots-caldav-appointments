# Booking Calendar — Roadmap to 0.2.0

> Milestones, each with an exit criterion. Order is dependency-driven, not
> a schedule. Scope per `SCOPE.md`; mechanisms per `ARCHITECTURE.md`.

## M0 — Decisions

All settled 2026-08-01: backends Radicale + Nextcloud, Google retained
best-effort; email via the Brevo transactional HTTP API behind a
`sendEmail()` seam (`ARCHITECTURE.md` §6); cancellation via a stateless
bearer token in the emailed link, valid until slot start
(`ARCHITECTURE.md` §5); licence MIT.

*Exit: met — each decision recorded.*

## M1 — Core rebuild

Worker API and SPA rebuilt from the spike, with the plain-JWT security
model and the two-logical-calendar configuration from day one. Verified
against Google (the known backend) in both configurations: coinciding
calendars and separate availability/store.

*Exit: met 2026-08-01 — `worker/test/flow.live.test.ts` runs the full
flow against a real backend in both configurations, and CI builds and
typechecks both halves. Verified against Nextcloud rather than Google;
the Google service-account path is implemented but not yet exercised
end to end, which M2 picks up.*

## M2 — Backend verification

Radicale and Nextcloud verified by the same suite against real
instances, Radicale self-hosted; Nextcloud is already green from M1.
Google likewise, best-effort.

Google, exercised 2026-08-02, found the one real interop gap: it accepts
`<c:expand>` and ignores it, returning the unexpanded master, so weekly
`OPEN` events yielded no slots at all. Recurrence expansion moved into
the Worker (`ARCHITECTURE.md` §2), which also brought it under unit test.
Backend profiles now select the backend (`worker/test/backends/`), CI
runs the live suite against Radicale on every pull request and against
Nextcloud and Google on `main`.

*Exit: met 2026-08-02 — suite green on all three backends, and no
document claims "any CalDAV server" without saying it is unsubstantiated.
The Proton write-up moved past 0.1.0; see "Later".*

## M3 — Customer email

Booking confirmation email carrying the cancellation link, using the M0
mechanism. Practitioner notification via their calendar client if
adequate, email otherwise.

`attendee.email` is now required — it is where the link goes — and the
confirmation points at a page of its own, which reads the booking through
a new `GET /v1/bookings/:uid` and cancels only on an explicit button
(`ARCHITECTURE.md` §3, §5). The practitioner is notified by email as
well, when they configure an address: no CalDAV client alerts reliably on
an event another client pushed in, so their calendar alone would have
left them discovering bookings by looking. Without an API key the Worker
sends nothing and says `disabled` in the booking response, which is what
keeps `wrangler dev` and every test run from mailing anyone.

*Exit: met 2026-08-06 — a hand-made booking with a live Brevo key,
cancelled from the emailed link opened in a fresh private window, and
`email-roundtrip` in CI now proves the same path on every push to `main`,
reading the link out of a real mailbox rather than the booking response.
Later the same day, after the first production deploy, a booking made at
the deployed page was cancelled from the emailed link on a phone — the
"another device" wording met literally.*

## M4 — Operator experience (descoped 2026-08-10)

Was the `SETUP.md` second edition plus deploy tooling, gated on
deploying from the documentation alone. Descoped in favour of going
straight to the wizard: the health endpoint and the fork-deploy CI
moved into M5 as its groundwork, the `SETUP.md` second edition to
0.2.0, and acceptance to M6's exit.

## M5 — Setup wizard: verifier

The first stage of the `docs/fork-guided-setup.md` wizard — the stage
that holds no credentials — together with the two pieces it watches,
built here because the wizard is what needs them. The 2026-08-10
prior-art research (ibid. §10) found no ready-made substitute: no
deploy-button ecosystem touches the GitHub side, and publishing our
CI steps as separate GitHub Actions buys nothing — forks inherit
workflows, so M5.2's `deploy.yml` is already its own distribution
channel. In dependency order:

1. **M5.1 — Health endpoint.** `GET /v1/health`, its token-less subset
   CORS-open to any origin: CalDAV reachability per calendar role,
   config parse status, email transport state — including a transport
   that was meant to be configured and is not, which a booking otherwise
   reports only in its own response (`ARCHITECTURE.md` §6). Consumed by
   `curl` now; by M5.2's CI and M5.3's verifier next. *Met 2026-08-10 —
   `ARCHITECTURE.md` §3; the booking store is `appointments` on the
   wire.*
2. **M5.2 — Fork-deploy CI.** A `deploy.yml` (`workflow_dispatch`,
   never `on: push`) that deploys a fork with GitHub-web interaction
   only. Mostly assembly of maintained actions (researched 2026-08-10,
   `docs/fork-guided-setup.md` §10): `cloudflare/wrangler-action@v4`
   deploys the Worker, forwards repo secrets to Worker secrets and
   outputs the deployed URL — `VITE_WORKER_URL` without a subdomain
   query; `actions/configure-pages@v6` outputs the real Pages origin —
   `ALLOWED_ORIGINS` and `CANCEL_URL` never constructed from the
   username; `upload-pages-artifact` + `deploy-pages` ship the SPA.
   The one custom step: on first run, generate the ES256 signing key
   and pipe it straight into `wrangler secret put`, so it exists
   nowhere but Cloudflare. Ends by probing M5.1's health. This is the
   near-one-command deploy; the command is *Run workflow*. *Met
   2026-08-10 — dispatched against this repository with only Actions
   secrets and variables configured: both halves deployed, secrets
   forwarded, signing key minted on first run, health probe green.
   Nothing is committed: credentials and addresses are Actions
   secrets, public knobs Actions variables, and everything
   origin-shaped is derived per `ARCHITECTURE.md` §7.*
3. **M5.3 — The verifier.** A static SPA, one guided tab, that
   watches the manual steps land — fork existence and workflow runs
   polled unauthenticated, Worker health via M5.1, and the email DNS
   records by presence via DoH — turning each step into a green tick
   with a deep link to the next. Brevo's authoritative per-record
   status needs its API key, so it belongs to M6, keeping this stage
   credential-free (amended 2026-08-10 from "via its CORS-open API").
   *Met 2026-08-10 — `wizard/`, served at `/wizard/` beside the
   booking page by the M5.2 workflow.*

*Exit: a practitioner working through the manual steps sees each turn
green in the wizard without pasting any credential into it. Met
2026-08-10, every step walked green in a scripted browser against this
repository's own fork-style deployment; a practitioner who is not the
author remains M6's exit.*

## M6 — Setup wizard: provisioning

The PAT-driven stage: prompts driven by a checked-in manifest of
required configuration (Heroku's `app.json` convention, ibid. §10),
the PAT minted through a prefilled template URL (GitHub, 2025-08),
then the browser writes public knobs to Actions variables and
credentials to sealed-box Actions secrets over the REST API — never a
config commit; a fork is public and so is its history. Decisions
settled 2026-08-11:

- **Pages enablement stays one manual, deep-linked click** (the
  `docs/fork-guided-setup.md` §8 decision, now settled): it spares
  the PAT the Administration permission — the widest of the five —
  and the click itself teaches that it is GitHub serving the booking
  page.
- **Secrets live in tab memory only**; non-secret state persists in
  localStorage. A crash mid-flight means restarting with fresh
  pastes ("Later" holds the softening).
- **Single-tab session**: the whole journey runs from the
  upstream-hosted wizard, no handoff to the fork's own copy. To be
  evaluated in M6.4 against the practitioner's production mental
  model — revisit if finishing on their own page proves clearer.
- **Sealed-box secret writes without a crypto dependency**: Web
  Crypto's X25519 plus the little that must be vendored
  (XSalsa20-Poly1305). Requiring a current browser is acceptable —
  this is an admin tool used once.

1. **M6.1 — Manifest and configuration form.** A checked-in manifest
   declaring every Actions secret and variable — name, kind, group,
   label, one-sentence help, default, validator — drives the
   configuration form: a CalDAV provider picker moving `SETUP.md`
   Part 1 to the moment of need, essentials visible, every
   defaultable knob under a collapsed Advanced. No network writes
   yet: the interim output is a validated review list with copy
   buttons and deep links into the fork's settings, and a test that
   fails whenever the manifest and `deploy.yml` name different sets.
   *Met 2026-08-11: deployed with the form, the review list and the
   cross-check test; secrets verified (Playwright) to survive neither
   reload nor the poll's repaint.*
2. **M6.2 — GitHub provisioning.** The PAT step (template URL,
   paste, verified by an authenticated read of the fork), sealed-box
   secret and variable writes, the workflow-registering commit,
   dispatch and the live run watched. The deploy workflow
   additionally drops a `deploy-info.json` (Worker URL, page origin)
   into the Pages artifact, so the wizard discovers the Worker URL
   itself and that paste disappears. Verify before building on them:
   the Cloudflare token template link and its bot challenge from a
   fresh account, account-ID auto-detection (dropping
   `CLOUDFLARE_ACCOUNT_ID` from the form), Pages' CORS on
   `deploy-info.json`, the exact PAT template parameters.
3. **M6.3 — Email provisioning.** Brevo key pasted, domain created
   over Brevo's CORS-open API, the authoritative records displayed
   with copy buttons, Brevo's per-record verdict and DoH both polled
   to green; then the email secrets written and the deploy
   re-dispatched. Resumable across sessions — DNS propagation is not
   the practitioner's clock — with the key re-pasted on resume.
4. **M6.4 — The journey, walked by proxy.** The welcome step with
   the one-picture mental model (customer → page on GitHub → API on
   Cloudflare → your calendar), phase rail, living-with-it and
   revoke-the-PAT closers, and an "I'd rather do this myself in
   GitHub's UI" link on every automated step. Then the acceptance
   walk with the author acting the `SCOPE.md` §2 practitioner —
   pretending not to know what GitHub is — from a fresh browser
   profile to a real booking. 0.1.0 releases on this passing.
5. **M6.5 — External acceptance.** The original bar: a practitioner
   who is not the author, observed (think-aloud where possible),
   completes setup in the wizard tab alone, `SETUP.md` open only as
   reference, and takes a real booking. Deliberately scheduled
   *after* the 0.1.0 release — releasing inside a milestone is
   unorthodox, but no second practitioner is at hand and the release
   should not wait; what trips them becomes 0.1.x fixes.

*Exit for 0.1.0: M6.4 — the proxy walk passes end to end. M6.5 keeps
the unchanged external bar and closes M6 itself.*

## 0.1.0

M0–M6.4 done (M4 descoped along the way): the wizard's proxy
acceptance passed. M6.5, the external acceptance, deliberately
follows the release.

## 0.2.0

Selected 2026-08-10 from the "Later" pool; to be carved into
milestones when 0.1.0 closes:

- **Booking page integrated into the operator's own site.** The
  first case is the author's: parantaja.fi, served by GitHub Pages, so
  the page and the Worker live on different origins. This is why
  `ALLOWED_ORIGINS` and the build-time API URL are features, not
  deployment glue, and why the API must keep working cross-origin.
- **Reminder email before the appointment** — reuses the M3 delivery
  mechanism and the booking's own data; may require a cron-like wakeup mechanism.
- **ICS URL as an availability source** — an alternative to CalDAV
  for the read-only role; also the prerequisite for the Proton path,
  whose verification and write-up stay in "Later".
- **`SETUP.md` second edition** — happy path rewritten around the
  fork: browser-only, no Node, no git, no terminal; today's terminal
  path becomes the appendix for operators who want it. The Brevo/DNS
  part rewritten around the API-returned record set. Displaced from
  the descoped M4.

## Later

- **WordPress plugin** (0.3.0 or later), if practitioners embedding
  into WP materialise. Same cross-origin story as the site
  integration.
- The Proton path, verified then written up: booking store on a CalDAV
  backend, Proton subscribing to its ICS URL for viewing, a standard
  CalDAV client for painting `OPEN`. Verify against a real Proton
  account first — in particular the subscription refresh interval, which
  their documentation puts in hours, and whether a Nextcloud or Google
  secret-ICS URL is accepted at all. Describing it from their published
  behaviour instead would repeat the M2 `<c:expand>` mistake. Then a
  short `docs/proton.md` linked from the operator guide.
- Further verified backends (Baïkal, Fastmail, …) — marginal cost is one
  CI job per backend once the M2 suite exists.
- Per-slot Durable Object lock, if real traffic ever makes the
  check-after-insert race window matter (`ARCHITECTURE.md` §5).
- SMTP submission to the operator's own mailbox as an alternative email
  transport (rejected for 0.1.0 — `ARCHITECTURE.md` §6).
- Configurable minimum cancellation notice (cancellation token expiring
  N hours before slot start instead of at it).
- Wizard resilience after a mid-flight crash: remember in
  localStorage that an attempt was made and adapt the guidance —
  which pastes to redo, what is already done — secrets still never
  persisted (idea 2026-08-11; M6 ships plain restart).
