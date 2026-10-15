# Booking Calendar — Roadmap

> Milestones, each with an exit criterion. Order is dependency-driven,
> not a schedule. Scope per `SCOPE.md`; mechanisms per
> `ARCHITECTURE.md`. Met milestones are kept to summaries here; their
> full exit stories live in this file's git history.

## Done — M0 to M6.4, released as 0.1.0

- **M0 — Decisions.** Met 2026-08-01. Backends Radicale and Nextcloud,
  Google retained best-effort; email via the Brevo transactional HTTP
  API behind a `sendEmail()` seam (`ARCHITECTURE.md` §6); cancellation
  via a stateless bearer token in the emailed link (§5); licence MIT.
- **M1 — Core rebuild.** Met 2026-08-01. Worker API and SPA rebuilt
  from the spike with the plain-JWT security model and the
  two-logical-calendar configuration from day one; the full flow
  live-tested against a real backend in both configurations; CI
  builds and typechecks both halves.
- **M2 — Backend verification.** Met 2026-08-02. The live suite green
  against Radicale, Nextcloud and Google, selected by backend profiles
  (`worker/test/backends/`). Google accepts `<c:expand>` and silently
  ignores it, so recurrence expansion moved into the Worker
  (`ARCHITECTURE.md` §2) — and no document claims "any CalDAV server".
- **M3 — Customer email.** Met 2026-08-06. Confirmation email carrying
  the cancellation link; a cancel page of its own over
  `GET /v1/bookings/:uid`; the practitioner notified by email, their
  calendar client alone being no notification; without an API key the
  Worker sends nothing and says `disabled`. The `email-roundtrip` CI
  job proves the emailed link works, reading it out of a real mailbox.
- **M4 — Operator experience.** Descoped 2026-08-10 in favour of going
  straight to the wizard: the health endpoint and the fork-deploy CI
  moved into M5, the `SETUP.md` second edition to 0.2.0.
- **M5 — Setup wizard: verifier.** Met 2026-08-10, all three stages:
  the token-less `GET /v1/health` (M5.1, `ARCHITECTURE.md` §3); the
  fork `deploy.yml` — `workflow_dispatch` only, secrets forwarded,
  everything origin-shaped derived per run, the ES256 signing key
  minted on the first run and existing nowhere but Cloudflare (M5.2,
  §7); and the credential-free verifier SPA at `/wizard/`, polling
  fork, workflow runs, health and DNS to green ticks (M5.3).
  Prior-art research in `docs/fork-guided-setup.md` §10.
- **M6 — Setup wizard: provisioning.** The PAT-driven stage:
  manifest-driven prompts, the browser writing Actions variables and
  sealed-box secrets over the REST API — never a config commit.
  Decisions settled 2026-08-11: secrets live in tab memory only; a
  single-tab session; sealed-box writes from Web Crypto plus the
  little that must be vendored; Pages enablement kept as one manual,
  deep-linked click (`docs/fork-guided-setup.md` §8).
  - **M6.1 — Manifest and configuration form.** Met 2026-08-11. The
    checked-in manifest drives the configuration form, and a test
    fails whenever the manifest and `deploy.yml` name different sets.
  - **M6.2 — GitHub provisioning.** Met 2026-08-11. The PAT minted
    through a prefilled template URL; sealed-box writes cross-checked
    against tweetnacl; the registering commit, dispatch and live run
    watched; `deploy-info.json` in the Pages artifact lets the wizard
    discover the Worker URL itself.
  - **M6.3 — Email provisioning.** Met 2026-08-11. Brevo domain
    created over its CORS-open API; the authoritative records shown
    with copy buttons; Brevo's per-record verdict and DoH both polled
    to green; resumable across sessions, the key re-pasted on resume.
  - **M6.4 — The journey, walked by proxy.** Met 2026-10-12, the
    author acting the `SCOPE.md` §2 practitioner. The welcome step
    with the one-picture mental model, phase rail and closers; six
    walk attempts (`docs/m6.4-walk-notes.md`) reshaped the wizard
    along the way — the vertical stepper, the work window beside the
    tab (`ARCHITECTURE.md` §1), per-owner Worker names, and the
    guided Google Calendar sub-wizard
    (`docs/google-calendar-wizard.md`, landed 2026-10-11) among them.
    Residue for 0.1.x: the Google cards walked with a fresh Google
    account, and the postponed usability remarks.

## 0.1.0

M0–M6.4 done (M4 descoped along the way): the wizard's proxy
acceptance passed. M6.5, reconfiguration, and M6.6, the external
acceptance, follow the release — the latter deliberately.

## M6.5 — Reconfiguration

Changing one setting later without re-entering the rest. Today the
store writes the whole configuration from the tab, so once the tab
has forgotten the secrets a single change means re-entering every
credential — a new Cloudflare token and Brevo key among them, both
shown only once — and in a browser that has forgotten the form as
well, the booking-shape settings fall back to their defaults and the
next store overwrites the stored ones without a word. After the first
store, the store step instead writes only the cards changed in this
tab and leaves the rest as stored; what a calendar-provider switch
must then delete is part of the design. Done when a stored setup is
changed in one card from a fresh browser with every other stored
value intact. It is what makes the living-with-it closer's "come back
here … store and deploy again" cheap (walk attempt 2, 2026-09-08).

## M6.6 — External acceptance

The original bar, and what closes M6: a practitioner who is not the
author, observed (think-aloud where possible), completes setup in the
wizard tab alone, `SETUP.md` open only as reference, and takes a real
booking. Deliberately scheduled after the 0.1.0 release — no second
practitioner was at hand, and the release should not wait; what trips
them becomes 0.1.x fixes. Per-role calendar providers (availability
and booking store on different backends; today one provider choice
serves both) were deferred here from the walks.

## 0.2.0

Selected 2026-08-10 from the "Later" pool; to be carved into
milestones when 0.1.0 closes:

- **Booking page integrated into the operator's own site.** The
  first case is the author's: parantaja.fi, served by GitHub Pages, so
  the page and the Worker live on different origins. This is why
  `ALLOWED_ORIGINS` and the build-time API URL are features, not
  deployment glue, and why the API must keep working cross-origin.
- **Reminder email before the appointment** — reuses the M3 delivery
  mechanism and the booking's own data, and needs no stored state:
  - A scheduled trigger fires every interval *I* (a Cron Trigger on
    Cloudflare, any host's cron elsewhere: a thin seam, so the Worker
    stays portable). At tick *T* it reads the store for bookings
    starting in [*T* + *L*, *T* + *L* + *I*), *L* being the lead time.
    *T* is the tick's scheduled time, not the clock, so the windows
    tile time: each booking falls in exactly one, and no "sent" flag is
    needed. A re-delivered tick sends its reminders twice; rare, and
    only a duplicate.
  - Bookings are recognised by uid, as everywhere. The address is the
    first line of the `DESCRIPTION` (`ARCHITECTURE.md` §2); a
    description the practitioner has edited out of shape is skipped.
  - The reminder carries a freshly issued cancellation token, the same
    capability as the confirmation's, so nothing is stored.
  - A booking made after its window's tick gets no reminder (with an
    hourly *I*, roughly those made less than *L* ahead): the
    confirmation stands in. A missed tick loses its window's
    reminders.
  - One setting, the lead time; absent means off.
  - Three messages per booking instead of two:
    `docs/tasks/email-monitoring.md`'s thresholds assume two.
- **ICS URL as an availability source** — an alternative to CalDAV
  for the read-only role; also the prerequisite for the Proton path,
  whose verification and write-up stay in "Later".
- **Proper booking UX on a phone** — current booking calendar
  works well enough on a laptop, but has never been tried on
  a phone. Most probably both UX:es need improvements.
- **`SETUP.md` second edition** — happy path rewritten around the
  fork: browser-only, no Node, no git, no terminal; today's terminal
  path becomes the appendix for operators who want it. The Brevo/DNS
  part rewritten around the API-returned record set. Displaced from
  the descoped M4.

## Later

- Better cancellation. If possible, deletion of an event from
  the bookings calendar should send an email to the customer.
  This may be technically impossible, so also other options
  should be explored.
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
- **Reschedule** from the emailed link (low priority; Nylas, Aurinko,
  Tymeslot, calrs and Calnode offer it). Needs no Worker change: the
  cancellation page offers another time, the booking page books it
  under a fresh grant, and only then deletes the old booking with the
  token it already holds. Book before delete, so a failure leaves two
  bookings, both visible to the practitioner, never none; the token's
  expiry at slot start bounds it. The customer re-enters name and
  address, since `GET /v1/bookings/:uid` deliberately returns times
  alone.
- Wizard resilience after a mid-flight crash: remember in
  localStorage that an attempt was made and adapt the guidance —
  which pastes to redo, what is already done — secrets still never
  persisted (idea 2026-08-11; M6 ships plain restart).
