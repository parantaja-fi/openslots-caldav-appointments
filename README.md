# Booking Calendar

[![CI](https://github.com/parantaja-fi/openslots-caldav-appointments/actions/workflows/ci.yml/badge.svg)](https://github.com/parantaja-fi/openslots-caldav-appointments/actions/workflows/ci.yml)

> **Pre-release; not code complete.** Three of five milestones are met
> (see [ROADMAP.md](ROADMAP.md)). The operator guide
> ([SETUP.md](SETUP.md)) is a first draft, tested by nobody but the
> author. API field names, configuration and storage layout may still
> change without notice.
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

M1 and M2 met: the Worker API and the SPA are built, and an automated
suite runs the whole flow — list, book, lose a race, cancel — against a
real CalDAV backend, with the two logical calendars both separate and
coinciding. That suite is green against Radicale, Nextcloud and Google.

M3 is met: a booking sends the customer a confirmation carrying a
cancellation link, and the practitioner a notice, through the Brevo
transactional API; the round trip runs in CI against a real mailbox.
Configure no API key and the Worker sends nothing and says so, which is
how it runs in development and in CI. Of the setup wizard's milestones
([ROADMAP.md](ROADMAP.md) M5–M6), the health endpoint and the
fork-deploy workflow are met: *Run workflow* on a configured fork
deploys both halves and gates on health. Next is the guided browser
tab; 0.1.0 is the wizard passing its acceptance test.

CI builds and typechecks both halves, runs the tests that need no
backend, and runs the live suite against a Radicale it starts itself. The
credentialed backends, and the email round trip, run on `main`, on
manual dispatch and weekly. The browser end-to-end test runs locally
only.

## Development

Two npm packages, `worker/` and `frontend/`, each with `dev`, `build` and
`typecheck`.

```sh
cd worker && npm ci && npm run keygen   # a SIGNING_KEY_JWK for .dev.vars
cp .dev.vars.example .dev.vars          # then fill in, see the comments
npm test -- --project unit              # no backend needed
```

No vitest run sends mail: `vitest.config.ts` pins an empty
`BREVO_API_KEY` for every project, whatever `.dev.vars` or a backend
profile holds, and the transport itself is covered against a stub.
`wrangler dev` does read the key from `.dev.vars`, so with one set the
browser e2e test sends real mail — deliberately, and only to addresses
at a domain the author controls (`e2e@parantaja.fi`), never to
`example.com`, whose bounces would cost sender reputation.

### Backend profiles

The live CalDAV suite runs once per **profile**: a dotenv file in
`worker/test/backends/` naming one backend's calendars and credentials.
`npm test` runs every profile present, `npm test -- --project live:<name>`
just one. Adding a backend is a new profile, a matrix entry in
[ci.yml](.github/workflows/ci.yml) and one secret — nothing else.

Only `radicale.vars` is checked in; it doubles as the template, and its
password reaches nothing but a loopback server. Every other profile is
gitignored, and CI reads it from a secret holding that same file
verbatim:

```sh
gh secret set BACKEND_NEXTCLOUD < worker/test/backends/nextcloud.vars
gh secret set BACKEND_GOOGLE    < worker/test/backends/google.vars
```

The live tests write to the calendars a profile names, so point them at
dedicated test calendars.

For the local Radicale, serve it through waitress rather than its own
server, which drops roughly one connection in a thousand when workerd is
the client. Then create the two collections; Radicale will not make them
on `PUT`:

```sh
pipx install radicale && pipx inject radicale waitress
waitress-serve --listen=localhost:5232 radicale:application &
node scripts/mkcalendars.mjs radicale
npm test -- --project live:radicale
```

Radicale also needs an htpasswd user matching the profile; the
`live-radicale` job in [ci.yml](.github/workflows/ci.yml) builds the
whole configuration from scratch and is the reference.

Optional local pre-release check, needing a browser and the credentials
in `.dev.vars` — deliberately not part of CI:

```sh
cd frontend && npm run e2e
```

### The email round trip

`npm run roundtrip` proves what nothing else does: that the cancellation
link a customer is actually sent works. It books a slot, waits for the
confirmation to reach the inbox `ci@parantaja.fi` forwards to, and
cancels the booking using only the uid and token carried by the link in
that message. Run it deliberately, against a `wrangler dev` that has a
`BREVO_API_KEY`:

```sh
cd worker && npm run roundtrip
```

It sends two real messages and spends two of a small monthly receive
quota, so it is never part of `npm test`. In CI it is the
`email-roundtrip` job: `main`, manual dispatch and a weekly cron, gated
behind every other job being green, and never on a pull request. Three
secrets — `BREVO_CI_API_KEY` (a key of its own, revocable without
touching local testing or production), `TESTMAIL_APIKEY` and
`TESTMAIL_NAMESPACE`.

## Documentation

| Document | Contents |
|---|---|
| [SETUP.md](SETUP.md) | Setting up a deployment of your own, start to finish |
| [SCOPE.md](SCOPE.md) | What is being built, for whom, and what is out |
| [ARCHITECTURE.md](ARCHITECTURE.md) | The mechanisms: topology, calendar model, API, security |
| [ROADMAP.md](ROADMAP.md) | Milestones from here to 0.2.0 |
| [SECURITY.md](SECURITY.md) | How to report a vulnerability |

## Contributing

Issues are welcome, especially reports from CalDAV backends other than
the verified ones. Before opening a pull request, please raise an issue
first: the scope is deliberately narrow ([SCOPE.md](SCOPE.md) §5 lists
what is out), and pre-1.0 the shape of things still moves. Suspected
vulnerabilities go to [SECURITY.md](SECURITY.md), not the issue tracker.

## Licence

MIT — see [LICENSE](LICENSE).
