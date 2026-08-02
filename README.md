# Booking Calendar

[![CI](https://github.com/parantaja-fi/openslots-caldav-appointments/actions/workflows/ci.yml/badge.svg)](https://github.com/parantaja-fi/openslots-caldav-appointments/actions/workflows/ci.yml)

> **Pre-release; not code complete.** One of five milestones is met (see
> [ROADMAP.md](ROADMAP.md)). There is no confirmation email, only one
> backend is verified, and there is no operator guide. API field names,
> configuration and storage layout may still change without notice.
>
> **Largely written by an LLM.** Most of the code and documentation here
> was written by Claude under the author's direction. It has not been
> thoroughly reviewed by a human and has had no independent security
> review. Read it before you run it, and do not point it at a calendar
> whose contents you cannot afford to lose.

An independent, free-to-host or cheap-to-host booking calendar for
practitioners — solo or small-practice professionals (therapists, healers,
teachers, consultants) who want customers to book appointments against
their real calendar without subscribing to a SaaS booking platform.

## How it works

The practitioner marks availability by creating events titled `OPEN` in a
calendar, using whatever calendar client they already have. The system
subdivides those into bookable slots, shows them to customers on a simple
web page, and writes confirmed bookings back as ordinary calendar events.
Cancellation deletes the event. There is no database: CalDAV is the sole
persistence layer.

Three parts:

- a static single-page app (free static hosting),
- a small serverless API on a Cloudflare Worker (free tier),
- one or two CalDAV calendars: an **availability calendar** the system
  only reads, and a **booking store** it reads and writes. These may be
  the same calendar, or separate — e.g. availability in a calendar the
  system cannot modify.

## Status

M1 met: the Worker API and the SPA are built, and an automated suite runs
the whole flow — list, book, lose a race, cancel — against a real CalDAV
backend, with the two logical calendars both separate and coinciding.
Next is M2, the same suite against Radicale and Nextcloud. M3 adds the
confirmation email, M4 the operator guide and one-command deploy; 1.0 is
the two together.

CI builds and typechecks both halves and runs the tests that need no
backend. The live CalDAV suite runs locally against real credentials, as
does the browser end-to-end test.

## Development

Two npm packages, `worker/` and `frontend/`, each with `dev`, `build` and
`typecheck`.

```sh
cd worker && npm ci && npm run keygen   # a SIGNING_KEY_JWK for .dev.vars
cp .dev.vars.example .dev.vars          # then fill in, see the comments
npm test                                # unit tests plus live CalDAV tests
npm test -- --project unit              # what CI runs: no backend needed
```

The live tests write to whatever calendars `.dev.vars` names, so point
them at dedicated test calendars.

Optional local pre-release check, needing a browser and the same
credentials — deliberately not part of CI:

```sh
cd frontend && npm run e2e
```

## Documentation

| Document | Contents |
|---|---|
| [SCOPE.md](SCOPE.md) | What is being built, for whom, and what is out |
| [ARCHITECTURE.md](ARCHITECTURE.md) | The mechanisms: topology, calendar model, API, security |
| [ROADMAP.md](ROADMAP.md) | Milestones from here to 1.0 |
| [SECURITY.md](SECURITY.md) | How to report a vulnerability |

## Contributing

Issues are welcome, especially reports from CalDAV backends other than
the verified ones. Before opening a pull request, please raise an issue
first: the scope is deliberately narrow ([SCOPE.md](SCOPE.md) §5 lists
what is out), and pre-1.0 the shape of things still moves. Suspected
vulnerabilities go to [SECURITY.md](SECURITY.md), not the issue tracker.

## Licence

MIT — see [LICENSE](LICENSE).
