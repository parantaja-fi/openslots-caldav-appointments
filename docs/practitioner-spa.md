# Practitioner SPA — design notes

> Exploratory, 2026-08-08. Companion to `programmable-slotting.md` §9,
> which identified practitioner authentication as the hidden cost of any
> practitioner-facing API; this note takes the SPA on its own terms and
> leaves programmability entirely aside. Nothing here is committed
> scope; `SCOPE.md` excludes practitioner UI for 0.1.0, and
> `ROADMAP.md` M5–M6 now schedule the onboarding wizard.
> `simplicity-and-flexibility.md` steps further back and ranks the SPA
> against non-SPA levers (deploy button, local wizard, cron self-check);
> read it for where the SPA sits, this document for how it is built.

## 1. Two roles, different trust models

"The practitioner SPA" conflates two things that must be separated,
because one of them has no server to authenticate against:

1. **Onboarding helper** — used *before or during* deployment, when the
   operator's Worker may not exist yet. Necessarily unauthenticated;
   its powers are guidance and client-side verification only.
2. **Admin console** — used against a *running* Worker instance. This
   is the authenticated surface, and everything security-relevant below
   concerns it.

One static SPA can play both roles (the console is simply the helper
after "connect to your Worker" succeeds), but the design must never
let role 1's capabilities require role 2's authority.

A third architectural fact shapes both: the SPA is static and
cross-origin to everything. What it can reach directly is limited by
CORS:

- **The operator's Worker** — yes; `ALLOWED_ORIGINS` is already a
  first-class control and gains the admin SPA's origin.
- **The Cloudflare API** (`api.cloudflare.com`) — no CORS for
  third-party origins, so no browser calls. (Verify before relying on
  it either way — the `<c:expand>` lesson — but do not design around
  its availability.)
- **CalDAV backends** — effectively no; CalDAV servers do not serve
  CORS to arbitrary origins. All CalDAV verification goes through the
  Worker.
- **DNS-over-HTTPS** (`cloudflare-dns.com`) — yes, deliberately
  CORS-open. The SPA can check SPF/DKIM/DMARC records client-side.

## 2. Authentication: passkeys

WebAuthn fits the existing architecture unusually well: the system
already runs on browser-held non-extractable keys and stateless signed
tokens (`ARCHITECTURE.md` §5); a passkey is the same idea with
hardware/platform custody and phishing-resistant origin binding.

- **Verification** happens in the operator's own Worker. Assertion
  parsing needs CBOR and WebAuthn plumbing; `@simplewebauthn/server`
  runs on Workers atop WebCrypto — one new dependency, justified,
  confined to the admin routes.
- **No server-side session state, kept.** The WebAuthn *challenge* is
  a short-lived signed JWT from the existing ES256 key (TTL ~2 min,
  `iat` freshness), echoed back inside the ceremony — the same
  replay-bounding style as session proofs. A successful assertion
  yields a short-lived signed **admin token** (30–60 min bearer JWT,
  `scope: admin`), again stateless. Residual replay inside the tight
  TTLs is accepted, consistent with the system's existing stance.
  Signature counters cannot be tracked statelessly; synced passkeys
  report zero anyway. Accepted.
- **Credential storage.** The enrolled credential public keys (several
  — multiple devices must be enrollable) live in the **admin config
  resource in the booking store** (`programmable-slotting.md` §8
  option 1): a designated CalDAV resource carrying JSON. CalDAV
  remains the sole persistence layer.
- **Bootstrap.** First enrolment is the chicken-and-egg: it needs
  authority before any passkey exists. Root it in deployment: a
  `SETUP_TOKEN` wrangler secret, shown once at deploy, pasted into the
  SPA to authorise the first (and any recovery) enrolment. Whoever can
  set Worker secrets *already* owns the instance, so this adds no new
  root of trust — it merely channels the existing one.

### Where the SPA is hosted decides where the passkey works

WebAuthn credentials bind to the RP ID — the SPA's domain. A centrally
hosted SPA (say `admin.parantaja.fi`, serving every operator's own
Worker, holding no state — still not a SaaS) means every operator's
passkeys bind to that domain: convenient, one hosted page for all, but
a self-hosted copy of the SPA cannot use those credentials, and the
central origin's static files become code all operators trust.
Self-hosting the SPA inverts each point. Both must work; the RP ID
consequence just needs saying out loud in the operator guide, and
credentials record which RP ID they were enrolled under.

### Recovery: email AND SMS — and the recovery that already exists

The ultimate recovery needs no design: **control of the Cloudflare
account**. Set a fresh `SETUP_TOKEN` with `wrangler secret put`, enrol
a new passkey. Any in-band recovery is convenience layered *below*
that root, and must be weaker than it, never a bypass of it.

The specified in-band flow — both channels, not either:

1. Operator requests recovery; Worker sends one code to the recovery
   email (reusing the `sendEmail()` seam) and one to the recovery
   phone number; both stored in the admin config resource.
2. Both codes, entered together within a short window, authorise
   exactly one new passkey enrolment. Stateless again: each code is a
   signed JWT claim delivered out of band; hard per-IP and per-day
   rate limits; every attempt notified to the recovery email.

Requiring both is what makes SMS tolerable: SIM swap alone gains
nothing, mailbox compromise alone gains nothing. Costs to state
plainly: SMS needs a provider (Twilio or similar) — a new secret, a
new per-operator account to create, per-message cost, and regional
sender-ID friction; for a solo-practitioner tool this is real setup
burden serving a rare event. Worth making the SMS leg *configurable*:
without it, in-band recovery is simply absent and the Cloudflare-root
recovery is the (documented) answer. That default matches the KISS
posture; the full email+SMS flow is for operators who want to never
touch wrangler again.

## 3. Configuration through a GUI — what the Worker may touch

The tempting reading — "the SPA sets the Cloudflare secrets" — hides a
blast-radius decision. For the Worker to edit its own secrets it must
hold a Cloudflare API token; a token that can rewrite the Worker's
secrets can rewrite the Worker, and the deliberately narrow §5 blast
radius (write access to one calendar, nothing else) becomes total
compromise of the instance. And the browser cannot call the Cloudflare
API itself (§1, CORS). So:

**The Worker never holds Cloudflare account authority.** Draw the line
between two classes of configuration:

- **Bootstrap secrets** — CalDAV credentials, the grant-signing key,
  the Brevo key, `SETUP_TOKEN`: things the Worker needs *before* it can
  reach any storage, or that gate everything else. These stay wrangler
  secrets, set at deploy or in the dashboard, forever outside the SPA's
  write path. (Necessarily so for the CalDAV credentials: with no
  database, config the Worker persists lives in CalDAV, which it
  cannot reach without them. The bootstrap set is not a policy choice
  but a fixed point.)
- **Operational settings** — slot length, horizon, minimum notice,
  display zone, practitioner notification address, cancel-page URL,
  recovery contacts: things a running Worker can validate and store in
  the admin config resource. These become SPA-editable through an
  authenticated admin API, with the same parse-is-validation discipline
  as §7 config — the Worker refuses a zone it cannot resolve at write
  time, not at 3 a.m. Config precedence: resource overrides env var;
  env remains the complete fallback so a deployment with no resource
  behaves exactly as today. The resource rides the request path the
  Worker already walks to CalDAV; one extra `GET`, cacheable.

Secrets get a **write-only** admin verb at most (e.g. "test these
CalDAV credentials" tries a `REPORT` and reports success without
storing anything, leaving the actual `wrangler secret put` to the
operator) — the API never echoes a secret, and ideally never stores
one either.

## 4. How much of the setup experience this actually simplifies

Audit of the operator journey (`SETUP.md` shape), honestly scored:

| Step | SPA contribution |
|---|---|
| Cloudflare account | None. Manual, always. |
| Deploy the Worker | None from the SPA. The real lever is a **Deploy-to-Cloudflare button** (Git-connected deploy prompting for vars/secrets) — removes the CLI from the happy path and is worth pursuing *independently of any SPA*. |
| CalDAV backend setup, app passwords | Guidance only (per-provider walkthroughs with screenshots), then **verification through the Worker**: test-connect, list calendars, confirm an `OPEN` event is visible. This converts the single most error-prone step from "silent wrong slots" to an immediate green tick. |
| Secrets entry | Not automatable from the SPA (§3), but reducible: the SPA can *generate* a filled `wrangler secret put` script client-side — secrets typed into the form never leave the browser — for the operator to paste into their terminal. Then it verifies the result. |
| Brevo account, sender identity | Guidance; then "send a test email to yourself" through the Worker. |
| SPF/DKIM DNS records | **Client-side verification via DoH** — the SPA polls the records and turns green when propagation lands. Genuine automation of the step operators find most alien. |
| `ALLOWED_ORIGINS`, URLs | Verified end-to-end by the SPA calling the booking API from the browser — a live CORS check is self-demonstrating. |
| Smoke test | The SPA *is* the smoke test: health endpoint + a scripted dry-run booking against a sandbox slot. |

Net: the SPA **eliminates** few steps (DNS watching, smoke testing),
**de-risks** nearly all of them, and eliminates none of the account
creation. That is still a large win: the acceptance-test risk is not
that steps are many but that a mis-step is silent. The console is the
M5.1 health check with a face, plus per-step verification during
setup. It cannot replace `SETUP.md`, which stays behind the wizard as
the reference (`ROADMAP.md` M5–M6).

The provisioning the SPA cannot do has a natural home elsewhere: a
**local CLI wizard** (`npx`-run) executing where the operator's
authority lives — driving `wrangler`, generating the signing key,
setting secrets, running the smoke test. Wizard provisions, SPA
verifies; the two are complements, not alternatives
(`simplicity-and-flexibility.md` §3–4).

## 5. What else the console is good for

In rough order of value per unit of new surface:

1. **Health dashboard** — the M5.1 check, continuously: CalDAV
   reachability for both roles, email transport state, config parse
   status, last error. Read-only; cheapest useful thing. Its bigger
   sibling needs no SPA at all: a **cron self-check** — a Worker
   scheduled trigger running the same check daily and emailing the
   operator on failure and recovery, via the existing `sendEmail()`
   seam. A solo practitioner will not poll a dashboard; expired app
   passwords and revoked API keys are the dominant real admin
   scenario, and the self-check catches them unprompted.
2. **Practitioner-initiated cancellation, with customer notification.**
   A real mechanism gap today: deleting the booking event in their
   calendar client removes it silently — the customer is never told.
   The console lists upcoming bookings and offers "cancel and notify",
   reusing the M3 delivery machinery. Their calendar client *cannot*
   do this; it is not UI duplication.
3. **Operational settings editor** (§3): slot length, horizon, notice,
   zones, notification address — with validation at write.
4. **Email visibility**: bookings whose `confirmation_email` was
   `failed`, with a resend button. Today that signal reaches only the
   customer's own browser at booking time.
5. **Passkey management**: enrol another device, revoke one, configure
   recovery contacts.
6. **Key rotation trigger** — bounded value: rotation invalidates
   outstanding grants and emailed cancellation links (§5, accepted),
   and the signing key is a bootstrap secret, so at most the console
   *requests* rotation-by-redeploy guidance rather than performing it.
7. Booking statistics, exports, follow-ups — **out**, permanently: the
   `SCOPE.md` automation-platform exclusion. The API stays clean for
   n8n; the console does not become it.

Item 2 quietly reframes the settled "no practitioner UI beyond their
calendar client": that exclusion was scoped to 0.1.0 and to what the
calendar client can already do. Cancel-with-notification is precisely
what it cannot.

## 6. The new attack surface, soberly

Admin routes on the existing Worker (`/v1/admin/*`), passkey-gated,
rate-limited before routing like everything else, admin SPA origin
added to `ALLOWED_ORIGINS`. An attacker who defeats it gains: reading
bookings (names, emails, notes — real PII, the worst item), changing
the notification address (silent booking interception — pair every
change with a notice to the *old* address), degrading settings, and
whatever the recovery flow yields. They still cannot touch the
availability calendar (read-only credentials), cannot extract secrets
(never echoed), and cannot reach the Cloudflare account (no token to
steal — the §3 line is the whole game). Phishing is largely closed by
WebAuthn origin binding; the recovery flow is therefore the soft
underbelly and gets the hard limits and notifications above. The SPA
itself is static, open-source, self-hostable — central hosting is a
convenience with a stated supply-chain trade-off (§2).

## 7. Staging

- **Stage 0 (fits M5):** health endpoint JSON, plus the cron
  self-check emailing on failure; no SPA, no authn — `curl` and the
  setup docs consume the endpoint. Deploy-to-Cloudflare button and the
  local CLI wizard investigated on their own tracks.
- **Stage 1 (since promoted to M5.3):** the SPA as
  *onboarding helper only* — unauthenticated guidance, DoH DNS checks,
  and read-only verification against a token-less public subset of
  health. No admin API yet.
- **Stage 2:** passkey authn (`SETUP_TOKEN` bootstrap, no SMS),
  admin config resource, operational-settings editor, full health,
  failed-email list. Recovery = Cloudflare root, documented.
- **Stage 3:** practitioner-initiated cancellation with notification;
  passkey fleet management; optional email+SMS recovery for operators
  who configure the SMS leg.

Each stage is independently shippable; Stages 0–1 carry no new
security surface at all and deliver most of the setup-experience win,
which is where the acceptance risk actually lives.
