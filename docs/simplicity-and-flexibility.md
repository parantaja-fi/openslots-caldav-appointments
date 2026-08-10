# Simplicity and flexibility — a synthesis

> Exploratory, 2026-08-08. Written after, and above, `practitioner-spa.md`
> (setup and admin) and `programmable-slotting.md` (programmable
> algorithms). Those two answer "how would X be built"; this one asks
> what is actually worth building, and finds that both goals — a simpler
> practitioner experience and a more flexible system — are served by the
> same small set of mechanisms and a handful of principles. Nothing here
> is committed scope.

## 1. The tension, named

Both goals threaten the KISS constraint from opposite sides: setup
tooling adds surfaces (SPAs, authn, admin APIs), programmability adds
semantics (languages, verification, storage). The resolution is not to
ration features but to notice that a few mechanisms serve both, and
that in each stack the early rungs deliver most of the value at almost
none of the cost. The principles below are the test each proposal must
pass.

## 2. Principles

- **P1 — The calendar client is the primary UI.** The practitioner
  already "programs" the system daily: painting an `OPEN` event *is*
  end-user programming, in a tool they chose and know. Every proposed
  new surface must first answer why the calendar client cannot carry
  it. Corollary: the highest-leverage flexibility mechanism is
  enriching the calendar vocabulary (§5), and the strongest admin
  feature is needing no admin at all (P4).
- **P2 — Remove configuration before building tools to manage it.**
  A default beats a form; a derived value beats a default; a deleted
  setting beats both. Single-calendar mode already halves the
  credential burden; the same scrutiny applies to every future knob.
  No GUI for a setting that should not exist.
- **P3 — Authority stays where it lives.** Provisioning power (create
  Workers, set secrets) belongs to the operator's Cloudflare account
  and their local machine; tools that wield it must run there — a
  deploy button, a local CLI wizard — never inside the Worker or a
  hosted SPA. The Worker keeps its narrow blast radius; the SPA
  verifies and edits operational settings only
  (`practitioner-spa.md` §3).
- **P4 — The system speaks up; the operator does not poll.** A solo
  practitioner has no ops team and will not visit a dashboard. Silent
  failure modes — an expired app password, a revoked Brevo key, a
  renamed calendar — must be *detected by the Worker on a schedule*
  and reported by email. An admin console you must remember to check
  is half a feature; the cron self-check (§4) is the whole one.
- **P5 — Checking beats proving; emitting beats orchestrating.**
  Runtime output guards make untrusted programs safe without formal
  proof (`programmable-slotting.md` §5). Likewise at the integration
  boundary: the system may *emit* (a webhook POST on booking or
  cancellation) but never *orchestrate* (sequences, CRM rows) — the
  `SCOPE.md` automation-platform line, restated as a mechanism rule.
- **P6 — Flexibility ships as vocabulary and presets before languages
  and editors.** Most practitioners want to *choose* behaviour, not
  author it. A named recipe selected from a gallery delivers the
  flexibility; the algebra underneath and the visual editor above are
  for the few who write recipes — initially the author and the
  community, not the practitioner.

## 3. Deployment postures — the spectrum "no database" buys

Setup simplification has a ceiling within the self-deployment posture:
accounts must be created, secrets must be set. Stepping further back,
the architecture — *all* state in the practitioner's own CalDAV —
makes intermediate postures unusually cheap, because there is no
tenant data to custody:

1. **Self-deployed** (the 0.1.0 target): operator owns the Cloudflare
   account, runs the deploy, holds everything. Maximum independence;
   the `SCOPE.md` §1 acceptance test lives here and remains the
   baseline that must keep working.
2. **Button-assisted self-deploy**: a Deploy-to-Cloudflare button —
   Git-connected, prompting for vars and secrets — removes the CLI
   from the happy path. Same ownership, least new machinery; the
   single best setup lever identified anywhere in these notes.
3. **Wizard-assisted**: a local `npx` setup wizard that runs where the
   operator's authority lives (P3) — drives `wrangler`, generates
   keys, writes secrets, runs the smoke test — with the helper SPA
   (`practitioner-spa.md` §1) verifying from the browser side. LLM
   assistance slots in here, as the onboarding wizard (`ROADMAP.md`
   M5–M6) already hints.
4. **Managed Worker**: someone else (first case: the author) deploys
   and operates the Worker; the practitioner brings a CalDAV URL, an
   app password, and an email address. Setup collapses to a form.
   Crucially this is a *thin* SaaS: the operator custodies
   credentials, never bookings or availability — those stay in the
   practitioner's calendar, and leaving is repointing DNS and
   revoking one app password. Honest costs: the manager becomes a
   trusted party and a single point of failure, and multi-tenancy
   would tempt exactly the per-tenant database the project forswears —
   so a managed posture means *one Worker per practitioner*, managed
   by hand or by tooling, not a multi-tenant rewrite.

The postures are not phases; they coexist. Each rung trades
independence for ease, and the documentation should present the choice
rather than assume rung 1.

## 4. The simplicity stack

In order of leverage, spanning the practitioner's whole lifecycle
(evaluate → deploy → configure → verify → operate → recover):

1. **Evaluate: a hosted demo.** A public demo instance (fake
   practitioner, disposable calendar) lets a prospective operator try
   the booking flow before creating any account. Near-zero cost,
   removes the largest adoption unknown.
2. **Deploy: the button** (posture 2). Independent of any SPA work.
3. **Configure: fewer knobs** (P2), then the wizard (posture 3) for
   what remains. The helper SPA can also *generate* — client-side,
   secrets never leaving the browser — a filled `wrangler secret put`
   script for the operator to paste locally: provisioning stays local
   (P3), typing is eliminated anyway.
4. **Verify: the helper SPA's green ticks** — per-step verification
   through the Worker and DoH (`practitioner-spa.md` §4). This is
   where silent mis-steps die.
5. **Operate: the cron self-check.** A Worker scheduled trigger runs
   the health check daily and emails the operator on failure (and on
   recovery), via the existing `sendEmail()` seam. Covers the
   dominant real admin scenario — credentials silently expiring —
   with no console visit ever required (P4). Arguably the
   highest-value item in either SPA document, and it needs no SPA.
6. **Recover: documented roots.** Cloudflare account access as the
   ultimate recovery; in-band passkey recovery as optional convenience
   (`practitioner-spa.md` §2).

Items 1, 2 and 5 need no practitioner SPA, no authn, and no new
attack surface; together they plausibly halve both the setup risk and
the operational risk. The console proper (settings editor,
cancel-with-notify) is valuable but sits *behind* these in leverage.

## 5. The flexibility stack

Same shape: rungs ordered by value per unit of new semantics, each
rung usable without the ones above it.

1. **Richer configuration** (Tier 1 of `programmable-slotting.md` §4):
   multiple durations, per-option buffers, alignment. Config vars; no
   language, no authn. Covers the classic scheduling-tool gaps.
2. **Calendar vocabulary** (P1). Extend the `OPEN` summary:
   `OPEN 90`, `OPEN intro`, `OPEN massage|deep-tissue` — per-block
   selection of durations or named offerings, painted in the client
   the practitioner already uses. A description line can carry
   per-block overrides. This is programmability *in the existing UI*:
   no SPA, no API, no storage question — only a parser and a
   vocabulary spec. It perturbs one settled rule (`summary === "OPEN"`
   exactly → prefix match) and needs a strict grammar so a typo
   degrades loudly (health check reports "unparseable OPEN event"),
   not silently.
3. **Preset recipes** (P6). Named behaviour bundles as JSON — 
   "50 + 10 break", "60/90 with cleanup" — shipped with the system and
   shareable by the community; the practitioner picks and
   parameterises, referencing them from vocabulary (`OPEN thai-90`) or
   config. Delivers programmed flexibility to practitioners who will
   never program.
4. **The combinator algebra** (`programmable-slotting.md` §4 Tier 2) —
   now positioned as *the format presets are written in*, its first
   authors being the author and preset contributors, not
   practitioners. Runtime output guards regardless of author (P5).
5. **The visual editor** — the Blockly skin, last, only if rung 3's
   gallery visibly fails to cover real demand.

Other flexibility axes exist — booking-form fields per offering,
email template/language, webhook emission (P5) — and each should be
placed on this same ladder when its time comes: config first,
vocabulary if per-block, presets before authoring.

## 6. Shared mechanisms

What makes the two agendas converge — each mechanism below serves
both:

| Mechanism | Simplicity use | Flexibility use |
|---|---|---|
| Admin config resource in the booking store | operational settings, passkey credentials | stored recipes/programs |
| Calendar vocabulary parser | — | per-block behaviour in the existing UI |
| `sendEmail()` seam | cron self-check alerts, recovery codes | practitioner-cancel notification |
| Health check | setup verification, daily self-check | "unparseable OPEN event", guard-violation reports |
| Admin API + passkeys | settings editor, email visibility | recipe store API |
| Runtime output guards | fallback keeps a misconfigured system bookable | make untrusted programs safe |

Build order falls out: config resource and health check underpin
everything; the vocabulary parser is cheap and independent; passkeys
and the admin API come only when something needs writing from a
browser.

## 7. Staging, unified

- **Now / M5-adjacent:** health endpoint; cron self-check email;
  hosted demo; Deploy-to-Cloudflare button investigation. No SPA, no
  authn, no language.
- **Post-0.1.0, first wave:** Tier-1 slot configuration; calendar
  vocabulary; admin config resource (read-only, env-seeded); helper
  SPA as unauthenticated verifier (since promoted to M5.3 in
  `ROADMAP.md`).
- **Second wave:** passkey authn + admin API; settings editor;
  practitioner-cancel-with-notify; preset recipe support.
- **On demonstrated demand only:** the algebra as a user-facing
  authoring format; the visual editor; the managed posture as an
  offering; email+SMS recovery.

Each wave is independently shippable and abandonable, and the first
wave — where most of both values concentrate — contains no new
security surface and no new language.
