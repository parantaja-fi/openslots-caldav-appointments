# Booking Calendar — Roadmap

> Releases and their milestones. Order is dependency-driven, not a
> schedule. Scope per `SCOPE.md`; mechanisms per `ARCHITECTURE.md`.
> Met milestones are kept to summaries here; their full exit stories
> live in this file's git history.

## The board

The work itself is on a board: `.devtool/features/`, one Markdown card
per item, drawn by the VS Code extension Kanban Markdown and readable
without it.

- **Epic** — the area: Worker, Frontend, Wizard, Email, Calendars,
  Security, Operations, Documentation. The board draws one swim lane
  per epic.
- **Labels** — the release, one of `0.1.x`, `0.2.0` and `later` (the
  pool releases are selected from); and `bug` or `decision` where
  apt.
- **Columns** — Backlog, To Do, In Progress, Review, Done. A finished
  card moves into `done/`, so a card is referred to by its id, its
  filename without `.md`, never by path.
- Cards are edited as plain Markdown (the extension's
  `markdownEditorMode`); its rich editor joins hard-wrapped lines.

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
    Its residue is on the board, labelled `0.1.x`.

## 0.1.0

M0–M6.4 done (M4 descoped along the way): the wizard's proxy
acceptance passed. M6.5, reconfiguration, and M6.6, the external
acceptance, follow the release — the latter deliberately.

## 0.1.x

Fixes to 0.1.0, and the two milestones that close M6: M6.5,
reconfiguration, and M6.6, the external acceptance by a practitioner
who is not the author, whose card holds the original bar. What trips
that practitioner becomes 0.1.x fixes. The work: the cards labelled
`0.1.x`.

## 0.2.0

Selected 2026-08-10 from the Later pool, and grown since; to be carved
into milestones when 0.1.0 closes. It brings the booking page into the
operator's own site, the author's parantaja.fi first, on another origin
than the Worker; and the `SETUP.md` second edition. The work: the cards
labelled `0.2.0`.

## Later

The pool releases are selected from: the cards labelled `later`.
