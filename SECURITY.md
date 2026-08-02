# Security Policy

## Status

This project is pre-release and has had no independent security review.
The code was largely written by an LLM (see the README). There is no
supported version and no deployment that should hold real customer data
yet.

## Reporting a vulnerability

Report privately through GitHub's *Report a vulnerability* button under
the repository's Security tab, or by email to <pekka.nikander@iki.fi>.
Please do not open a public issue for a suspected vulnerability.

Expect an acknowledgement within a week. Given the pre-release state,
fixes land on `main`; there are no backports.

## What is in scope

The Worker API and the SPA in this repository, in particular the
capability-grant and cancellation-token model described in
[ARCHITECTURE.md](ARCHITECTURE.md) §5. Vulnerabilities in the CalDAV
backends themselves (Radicale, Nextcloud, …) belong to their own
projects.
