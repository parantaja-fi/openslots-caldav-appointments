# Booking Calendar

[![CI](https://github.com/parantaja-fi/openslots-caldav-appointments/actions/workflows/ci.yml/badge.svg)](https://github.com/parantaja-fi/openslots-caldav-appointments/actions/workflows/ci.yml)

> **First release, 0.1.0 — early, and tested only by the author.**
> The setup wizard has passed its acceptance walk with the author acting
> the practitioner ([ROADMAP.md](ROADMAP.md) M6.4); the same walk by
> someone who is not the author is still ahead (M6.6). Before 1.0, API
> field names, configuration and storage layout are likely to still change
> without notice.
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

Four parts:

- a static single-page app (free static hosting),
- a small serverless API on a Cloudflare Worker (free tier),
- one or two CalDAV calendars: an **availability calendar** the system
  only reads, and a **booking store** it reads and writes. These may be
  the same calendar, or separate — e.g. availability in a calendar the
  system cannot modify.
- the setup wizard, beside the system — a static page used once, to
  deploy and configure the other three.

## Setting up your own

Open the setup wizard at
<https://parantaja-fi.github.io/openslots-caldav-appointments/wizard/>.
It walks you from two free accounts, GitHub and Cloudflare, to a first
test booking, and checks every step it can see from outside.
Optional confirmation emails need a third free account, at Brevo,
and a domain of your own whose DNS you can edit.

Nothing you paste into the wizard passes through a server of this project.
There is no server: the wizard seals your passwords and keys in your browser
and writes them straight into your own fork on GitHub.
Your new booking page then runs on your GitHub Pages,
the API on your Cloudflare account.

[SETUP.md](SETUP.md) holds the why behind every step, and the way to
do it all by hand, if you decide not to trust the wizard.

## Status

The current release is **0.1.0**, the first: the
[ROADMAP.md](ROADMAP.md) milestones through M6.4 are met.
Reconfiguration (M6.5), and a walk by someone other than the author
(M6.6), deliberately follow the release.

CI builds and typechecks all three packages, runs the tests that need no
backend — the wizard's included — and runs the live suite against a
Radicale it starts itself. The credentialed backends, and the email
round trip, run on `main`, on manual dispatch and weekly. The browser
end-to-end test runs locally only.

## Alternatives

As of October 2026; the comparison behind the table is
[docs/competitor-comparison.md](docs/competitor-comparison.md). *Free
tier* means production use at no cost, hosting included; this project's
are the free tiers of GitHub, Cloudflare and, optionally, Brevo.

| Alternative | OSS | Free tier | How this project differs |
|-------------|-----|-----------|--------------------------|
| [Nylas Scheduler](https://www.nylas.com/) | No | No | Reaches self-hosted CalDAV such as Radicale; your calendar credentials stay in your own accounts |
| [Cronofy](https://www.cronofy.com/) | No | No | No vendor-side copy of your calendar |
| [Aurinko](https://www.aurinko.io/) | No | No | Speaks generic CalDAV (Radicale, Nextcloud) |
| [Apiroc](https://www.apiroc.com/), formerly OneCal's calendar API | No | No | Computes slots and takes bookings; Apiroc only relays calendar access |
| [Unipile](https://www.unipile.com/) | No | No | Speaks CalDAV; Unipile covers Google and Microsoft only |
| [Unified.to](https://unified.to/) | No | No | A booking page, not an integration API for developers |
| [Cal.com](https://cal.com/) | No* | Yes, one user | Bookings live only in your own calendar, not also in a vendor's database |
| [Cal.diy](https://github.com/calcom/cal.diy) | Yes | No | No server or database to run |
| [Easy!Appointments](https://github.com/alextselegidis/easyappointments) | Yes | No | Reads the calendar live; no database kept in step by cron |
| [Tymeslot](https://github.com/Tymeslot/tymeslot) | Yes | Yes, hosted | Self-hosting needs no server or database |
| [Nextcloud Calendar appointments](https://docs.nextcloud.com/server/latest/user_manual/en/groupware/calendar.html) | Yes | If on Nextcloud | Customers cancel from the emailed link; not tied to Nextcloud |
| [Appointments for Nextcloud](https://github.com/SergeyMosin/Appointments) | Yes | If on Nextcloud | The closest design; not tied to Nextcloud, and an API rather than an iframe |

 * Cal.com is no longer open source, since April 2026.

## Development

Three npm packages — `worker/`, `frontend/` and `wizard/` (the setup
wizard) — each with `dev`, `build` and `typecheck`.

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

| Document                   | Contents |
|----------------------------|----------|
| [SETUP.md](SETUP.md)       | Setting up by hand, and the why behind each wizard step |
| [SCOPE.md](SCOPE.md)       | What is being built, for whom, and what is out |
| [ARCHITECTURE.md](ARCHITECTURE.md) | The mechanisms: calendar model, API, security |
| [ROADMAP.md](ROADMAP.md)   | Met milestones, and what each coming release is for |
| [.devtool/features/](.devtool/features/) | The work, one card per item, labelled with its release |
| [SECURITY.md](SECURITY.md) | How to report a vulnerability |
| [PRIVACY.md](PRIVACY.md)   | What personal data the system handles, and who processes it |

## Contributing

Issues are welcome, especially reports from CalDAV backends other than
the verified ones. Before opening a pull request, please raise an issue
first: the scope is deliberately narrow ([SCOPE.md](SCOPE.md) §6 lists
what is out), and pre-1.0 the shape of things still moves. Suspected
vulnerabilities go to [SECURITY.md](SECURITY.md), not the issue tracker.

## Licence

MIT — see [LICENSE](LICENSE).
