# Booking Calendar

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
Next is M2, the same suite against Radicale and Nextcloud.

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

## Licence

MIT
