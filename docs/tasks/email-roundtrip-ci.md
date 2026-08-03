# Task — email round-trip test in CI

> Status: **built** 2026-08-02. `worker/test/roundtrip.mjs`, the
> `email-roundtrip` job in `ci.yml`, `npm run roundtrip` locally.
> Companion to [[email-monitoring]] (`email-monitoring.md`); they share
> the Brevo account and the parantaja.fi addresses but are different
> things — that one watches production over weeks, this one proves the
> email path in minutes, on demand.

## Goal

Prove the *whole* loop, not just the API call: book a slot → Brevo sends
the confirmation → the message lands in a mailbox we control → the job
reads it, extracts the cancellation link, and cancels the booking
**using only what the email said** — the uid from the link's query and
the token from its fragment. Then assert the slot is free again.

That last step is the point. Everything up to it is covered by unit
tests against a stubbed transport; nothing else proves that the link a
customer receives actually works. It is the M3 exit criterion, made
repeatable.

## Ground rules

- **Recipients only at parantaja.fi.** Never `example.com` or any other
  domain we do not own: those sends hard-bounce, and bounces damage the
  domain's and the Brevo account's reputation.
- **Not on pull requests.** Real sends from PR CI would let any fork
  burn the send budget, the secrets are unavailable to fork PRs anyway,
  and mail latency makes a poor per-commit gate.
- **Not before the domain is authenticated.** Satisfied: Brevo shows
  parantaja.fi verified (SPF, DKIM) since 2026-08-02.
- **Its own API key.** `BREVO_CI_API_KEY` is a third Brevo key,
  revocable without touching local testing or production.

## Where the mail lands

`ci@parantaja.fi` is a Gandi **forward** to an inbox at testmail.app,
which the job reads over that service's HTTP API. The visible recipient
stays on our domain, so the no-foreign-recipients rule holds and nothing
can bounce; no mailbox fee, no IMAP, no `imapflow` dependency, and no
personal-mailbox credentials in CI. The practitioner notice goes to
`ci-notice@parantaja.fi`, forwarded the same way, so each message lands
in its own testmail tag and matching is unambiguous.

The convention the script relies on: **the recipient's local part is the
testmail tag**, `<local>@parantaja.fi → <namespace>.<local>@inbox.testmail.app`.

testmail.app was chosen over the alternatives in 2026-08-02's survey:
Mailosaur is paid-only, MailSlurp's free tier is too small, Mailtrap
intercepts SMTP rather than receiving over MX, and Mailinator's free
inboxes are public. The namespace stays out of the repository — anyone
holding it can spend the receive quota.

Rejected, and worth not re-deriving:

- **A Gandi mailbox polled over IMAP.** Gandi mailboxes are paid; the
  domain's addresses are free forwards. The alternative was CI
  credentials to a personal mailbox, which is worse.
- **Cloudflare Email Routing into an Email Worker.** Architecturally the
  best fit for this stack and blocked: Email Routing requires the zone
  on Cloudflare nameservers, and parantaja.fi is on Gandi's. Same
  blocker as [[email-monitoring]]. Do not move DNS for this; if it ever
  moves for other reasons, revisit both tasks together.
- **Self-hosted SMTP at home.** An MX pointing at a residential
  connection, inbound port 25, dynamic DNS, and some way for a GitHub
  runner to query what arrived. Every one of those fails at 03:00 and
  has nothing to do with what is being tested.

## Shape

A standalone script rather than a vitest project: the pool pins
`BREVO_API_KEY` empty by design (`vitest.config.ts`) so that no ordinary
test run can send mail, and that guard must not grow an exception. The
script drives a `wrangler dev` over HTTP — so the real entrypoint,
routing and all — and is the same command locally and in CI.

Steps, each printing one line: preflight the inbox API (a wrong key
fails before a send is spent) → clear and paint an OPEN event → session
key, thumbprint, proof → `GET /v1/slots` → `POST /v1/bookings` →
**assert `confirmation_email === "sent"`** → poll the inbox for a message
carrying the booking uid → parse `cancel.html?uid=…#token` out of it →
`DELETE /v1/bookings/:uid` with only those two values → assert 204 →
assert the slot is offered again → assert the practitioner notice →
assert the signature and its selector → clear.

The failure messages keep the two investigations apart, which was the
requirement: `confirmation_email` says whether Brevo took the message,
so "Brevo refused" is reported in seconds and "mail lost in transit"
only after the 180 s delivery budget.

## Findings that changed the specification

- **testmail.app has no delete API.** The original "mailbox purged by
  the test itself" is not possible. Isolation is `timestamp_from`,
  captured before the booking, plus matching on the booking uid;
  free-tier retention expires messages by itself.
- **Plus-addressing is moot**, so the open question about it needed no
  experiment. The forward's destination is a fixed address, so
  `ci+runid@parantaja.fi` could not produce a per-run tag even if Gandi
  delivered it.
- **`livequery=true` was not used.** It holds 60 s and then answers with
  a 307 back to itself, which needs redirect-loop management; polling
  every 5 s against a 180 s budget puts the timeout in the source where
  it can be read.
- **The DKIM check is weaker than specified, because testmail does not
  verify signatures.** It reports `dkim: "none"` on every message and
  its `Authentication-Results` covers SPF alone. Neither is evidence
  about us: Gandi SRS-rewrites the envelope when it forwards, so that
  `spf=pass` is a statement about `redirect.mail.gandi.net`. What the
  round trip asserts instead is the two halves whose conjunction breaks
  exactly when the record does — the message carries a `DKIM-Signature`
  with `d=parantaja.fi`, and the selector *that signature names* still
  resolves and publishes a key. So Brevo rotating `brevo2` is not a
  failure, while the CNAME being dropped at Gandi is. It does not check
  that the signature validates; doing so needs a verifier, which is a
  dependency this repo will not take for one assertion.

## Budget

Two received messages per run against testmail.app's ~100/month. The job
runs on `main`, on dispatch and weekly, and `needs` every other job, so
quota is never spent on a commit already known bad. At 10–30 `main`
pushes a month plus four crons that is 30–70 messages — headroom, not
comfort. Watch it over the first month.

Brevo's side is trivial against 300/day, but **it lands in the same
account statistics [[email-monitoring]] reads**, where the month is
capped at 100. Left open there deliberately: tagging CI sends (the Brevo
API accepts a `tags` array, a one-line addition to `sendEmail()`) is the
cleaner reconciliation, but adding it before a monitor exists is
speculative product code. Until then, CI's sends count into that task's
thresholds.

## Acceptance

- Green run on dispatch: booking made, mail received, cancellation
  performed from the link alone, slot free again. **Met locally
  2026-08-03**, against the Nextcloud pair; both messages arrived within
  the first poll, and a second run matched its own, not the first's.
- Red run when it should be: with the CI Brevo key deliberately revoked,
  the job fails saying the send was refused, in seconds rather than
  after the delivery timeout. **Met locally 2026-08-03**: 2.1 s, exit 1,
  no message spent. Note that `wrangler dev` does not always reload a
  rewritten `.dev.vars`; restart it, or the run silently uses the old
  key and the red test is not the test you think it is.
- A month of runs stays within whatever budget [[email-monitoring]]
  settles on, without tripping its alerts.
