# Security Policy

## Status

This project is pre-1.0 and has had no independent security review.
The code was largely written by an LLM (see the README). There are no
supported versions. Deployments made from a pre-1.0 release may
hold real booking data, at your own discretion.  Weigh the lack of
external security reviews, and the code being written by an LLM,
before your copy does, and read [PRIVACY.md](PRIVACY.md) for what
that data is and where it lives.

## Reporting a vulnerability

Report privately through GitHub's *Report a vulnerability* button under
the repository's Security tab, or by email to <pekka.nikander@iki.fi>.
Please do not open a public issue for a suspected vulnerability.

Expect an acknowledgement within a week.
Fixes land on `main`; there are no backports.

## What is in scope

In scope are the Worker API, the SPA and the setup wizard,
all in this repository. In particular, the following:
1. The capability-grant and cancellation-token model described
   in [ARCHITECTURE.md](ARCHITECTURE.md) §5.
2. The wizard's handling of the credentials it writes to a fork
   as sealed-box GitHub Actions secrets (§1, §7).
3. The deploy workflow that consumes the secrets.

Vulnerabilities in the CalDAV backends themselves (Radicale,
Nextcloud, …) belong to their own projects.
