# Task — email volume and authentication monitoring

> Status: **not started**, specification only. Written 2026-08-02 while
> setting up the Brevo sender identity for `parantaja.fi`.
>
> **Scope warning.** This is operator monitoring for one deployment, not
> product code. It is *not* part of 0.1.0 (`SCOPE.md` §4 does not list
> it, and the built-in health check in M5.1 is a different thing — that one
> tells the operator their configuration is wrong, this one watches what
> the system actually does over weeks). It may belong in a separate
> repository. Decide that before writing code.

## Why

The deployment sends at most ten messages a day and a hundred a month —
one or two appointments a day, each producing a confirmation and a
practitioner notice. Anything materially above that means one of:

- a bug sending duplicates,
- someone driving the booking endpoint to mail people,
- a leaked `BREVO_API_KEY` being used by somebody else,
- someone forging `parantaja.fi` in the `From:` of mail we never sent.

The first three burn the domain's sending reputation before anyone
notices; the fourth harms it without touching our account at all.

## The two instruments are not interchangeable

This is the substance of the task and the thing not to get wrong.

**Brevo's own statistics measure what we sent.** Exact, same-day, and
attributable to our API key. This is the right instrument for the
volume cap.

**DMARC aggregate reports measure what receivers saw.** They are:

- *incomplete* — only receivers who bother to report (Google, Microsoft,
  Yahoo and a long tail; many send nothing), so the totals are a lower
  bound and can never be reconciled against a sent count;
- *late* — reports cover a 24-hour window and arrive up to a day or two
  after it closes;
- *aggregated* — a `<record>` carries a `<count>` of messages sharing a
  source IP, disposition and authentication result, not individual
  messages.

So DMARC cannot enforce "no more than ten a day". What it can do, and
nothing else can, is show mail claiming to be `parantaja.fi` **from
sources that are not ours** — the forgery case — and show our own
authentication silently breaking after a DNS or provider change.

Build both. Do not conflate them.

## Requirements

### A. Volume (from Brevo)

1. Daily: count messages sent in the last 24 h. Alert above **10**.
2. Monthly: count messages sent in the calendar month. Alert above **100**.
3. Alert on any hard bounce or spam complaint at all — at this volume,
   one is a signal, not noise.
4. Thresholds in one obvious place, not scattered through the code.

Source: the `/v3/smtp/statistics/` family of the Brevo API
(`aggregatedReport` for a date range, per-day reports for the daily
figure) with a **read-only** API key — a second key, not the sending
one. Confirm the exact response shape against the live API when
building; do not trust this file for field names.

Alternative worth considering: Brevo webhooks push `delivered`,
`hardBounce` and `spam` events to a URL as they happen, which would make
this reactive rather than polled. Costs a public endpoint; polling costs
nothing but a schedule. Polling is probably right for a threshold that
is measured per day.

### B. Authentication health (from DMARC)

1. Ingest the aggregate reports arriving at the `rua` address. They are
   XML per RFC 7489 Appendix C, delivered as `.gz` or `.zip` attachments.
2. For each `<record>`: read `<row><source_ip>`, `<row><count>`,
   `<row><policy_evaluated><dkim|spf>`, `<identifiers><header_from>` and
   the `<auth_results>` selector.
3. Alert when any report shows messages from a source that is neither
   Brevo nor Gandi — the two legitimate senders for `parantaja.fi`.
4. Alert when our own sources show `dkim=fail` — that is a broken DKIM
   record, and it will be silently costing delivery.
5. Keep a rolling record so "normal" is visible. A handful of reports a
   day; anything durable will do.

Note the DMARC policy is `p=none` today. Tightening it to `p=quarantine`
once this monitor shows only Brevo and Gandi signing is the *point* of
building it, and should be an explicit step in the task, not an
afterthought.

## Design options

Not decided. Trade-offs as they stand:

**1. Nothing bespoke — a free third-party DMARC digest.** Postmark's
free DMARC service (or dmarcian's free tier) parses the reports and
emails a weekly summary. Zero to build, covers requirement B in a human
readable form, covers none of A, and has no thresholds — it relies on
someone reading it. Reasonable as an interim measure the same day the
DMARC record goes in, and worth doing regardless.

**2. Scheduled GitHub Actions workflow.** One job on a `schedule:`,
running a script that (a) hits the Brevo statistics API and (b) reads
the `rua` mailbox over IMAP and parses the attachments. Threshold
breach ⇒ non-zero exit ⇒ GitHub emails the failure. Cheapest real
option: no infrastructure, secrets already have a home, and the alert
channel is **independent of Brevo**, which matters when the thing being
alerted about may be Brevo suspending the account. Downsides: IMAP
credentials for a real mailbox in CI secrets, and cron granularity.

**3. Cloudflare Email Worker.** Route the `rua` address to a Worker that
parses reports as they arrive and keeps counts in KV or D1, with the
Brevo poll on a `scheduled` trigger in the same Worker. Coherent with
the stack already in use and genuinely the nicest shape. Blocker:
Cloudflare Email Routing requires the zone on Cloudflare nameservers,
and `parantaja.fi` is on Gandi's. Moving DNS is a decision with its own
consequences (it would, incidentally, also give free DMARC report
handling in the Cloudflare dashboard). Do not move DNS *for* this.

Recommendation on present information: do option 1 immediately as it
costs nothing, then build option 2. Revisit option 3 only if the DNS
moves for other reasons.

## Alerting

Whatever is built must not alert *through the channel it is watching*.
An alert about Brevo, sent via Brevo, is not an alert. GitHub's own
failure notification (option 2) satisfies this for free.

## Acceptance

- A deliberate burst of eleven test sends in a day produces an alert
  within one scheduling interval.
- A DMARC report containing a source IP belonging to neither Brevo nor
  Gandi produces an alert.
- A week of ordinary operation produces no alerts at all — a monitor
  that cries wolf will be ignored, and at this volume the normal state
  is genuinely quiet.
- The DMARC policy can be moved to `p=quarantine` on the evidence it
  collects.

## Open questions

- Which repository does this live in? It monitors one deployment, but
  the volume-cap idea generalises to any operator of this system.
- Is the `rua` address Brevo's (`rua@dmarc.brevo.com`, as configured
  today), our own, or both? Ingesting the reports ourselves requires our
  own address in the record — see `SETUP.md`.
- Retention: how long is "a rolling record", and where?
- The CI round-trip test (`email-roundtrip-ci.md`) sends through the
  same Brevo account. Its sends must either be tagged and filtered out
  of the volume thresholds, or counted into them — settle jointly.
