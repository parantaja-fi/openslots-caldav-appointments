# Setting up your booking calendar

> **First draft.** Written 2026-08-02 from one operator's setup. It has
> not yet been tested by anyone but the author, which is exactly what
> `ROADMAP.md` M4 exists to fix. If a step is wrong or a step is
> missing, that is a bug — please open an issue.

This guide takes you from nothing to a working booking page. It assumes
you can copy commands into a terminal and follow instructions carefully.
It does not assume you know what CalDAV, DNS or a Worker is.

Read it once through before starting. The email part in particular has
an order that matters.

## What you will end up with

- A web page your customers visit to see your free times and book one.
- Free times that come from *your own calendar* — you mark them with
  your ordinary calendar app, on your phone or laptop.
- Bookings that appear as ordinary events in your calendar.
- A confirmation email to the customer with a link they can cancel from.
- An email to you whenever someone books.

There is no database and no admin panel. Your calendar is the system's
memory. If you delete a booking in your calendar app, it is cancelled.

## Before you start

You need five things. Getting these is most of the work.

1. **A calendar that speaks CalDAV.** Nextcloud, Fastmail, Google, or a
   small server you run yourself (Radicale). Apple iCloud and Proton do
   **not** work as the store. If you are choosing fresh, Nextcloud
   (including free hosted ones) is the smoothest.
2. **A Cloudflare account.** Free. This runs the small piece of software
   that sits between your customers and your calendar.
3. **A domain name** — `yourpractice.com`. You need to be able to edit
   its DNS records. If you have a website, you already have this.
4. **A Brevo account.** Free tier, 300 emails a day, far more than you
   need. This sends the confirmations.
5. **A computer with Node.js 20 or later** and `git`. You need it only
   for setup, not for running the system.

Set aside two or three sessions. The DNS changes in Part 4 need time to
take effect between steps, and that time is not yours to control.

---

## Part 1 — Your calendars

The system uses two *roles*:

- the **availability calendar**, which it only ever reads. Events titled
  `OPEN` in it mean "customers may book inside this time".
- the **booking store**, which it reads and writes. Confirmed bookings
  are created here.

These can be the same calendar or two different ones. Two is safer — the
system can then hold read-only credentials for your availability
calendar and cannot damage it — but one is simpler and perfectly fine.
Decide now; you can change it later by editing one setting.

**Create the calendar(s)** in your calendar app. Name them something
obvious, like `Availability` and `Bookings`.

**Find their addresses.** Every CalDAV calendar has a URL. Where to look:

| Provider | Where the URL comes from |
|---|---|
| Nextcloud | Calendar app → the `⋯` next to the calendar → *Copy internal link*. It looks like `https://cloud.example/remote.php/dav/calendars/you/bookings/` |
| Fastmail | Settings → Calendars → the calendar → *CalDAV URL* |
| Google | `https://apidata.googleusercontent.com/caldav/v2/CALENDAR_ID/events/` where `CALENDAR_ID` is from calendar settings. The `@` in it must be written `%40` |
| Radicale | `http://your-server:5232/username/calendar-name/` |

The URL must end with a `/`.

**Get credentials.** Not your ordinary password:

- **Nextcloud**: Settings → Security → *Create new app password*. Make
  two if you are using two calendars.
- **Fastmail**: Settings → Privacy & Security → App passwords.
- **Google**: this one is genuinely awkward. You need a *service account*
  in Google Cloud, a JSON key file for it, and you must share each
  calendar with the service account's email address (with *Make changes
  to events* for the booking store). If that sentence is daunting, use a
  different provider.
- **Radicale**: whatever you put in its `htpasswd` file.

Write down: two URLs, two usernames, two passwords. Treat the passwords
like passwords.

---

## Part 2 — Get it running on your own machine

Prove it works locally before putting it on the internet.

```sh
git clone https://github.com/parantaja-fi/openslots-caldav-appointments.git
cd openslots-caldav-appointments/worker
npm ci
```

**Make a signing key.** This is the secret that makes cancellation links
work and stops people forging bookings.

```sh
npm run keygen
```

It prints one long line starting `{"kty":"EC"`. Keep it; it is a secret.

**Write your settings.**

```sh
cp .dev.vars.example .dev.vars
```

Open `.dev.vars` in a text editor. It is ignored by git and never
leaves your machine. Fill in:

- `AVAILABILITY_USERNAME` / `AVAILABILITY_PASSWORD`
- `BOOKING_STORE_USERNAME` / `BOOKING_STORE_PASSWORD`
- `SIGNING_KEY_JWK` — the line from `npm run keygen`, in single quotes
- `AVAILABILITY_CALENDAR_URL` and `BOOKING_STORE_URL` — your two URLs.
  (These are not in the example file; add them. They override the
  placeholders in `wrangler.toml`.)

Leave `BREVO_API_KEY` commented out. Email comes later, deliberately —
with no key the system sends nothing, which is what you want while you
are experimenting.

**Open some availability.** In your calendar app, create an event in the
availability calendar titled exactly `OPEN`, tomorrow, say 10:00–14:00.
The title must be exactly that word.

**Start both halves**, in two terminals:

```sh
cd worker    && npm run dev     # the API, on http://localhost:8787
cd frontend  && npm ci && npm run dev   # the page, on http://localhost:5173
```

Visit <http://localhost:5173>. You should see your `OPEN` block cut into
bookable 30-minute slots. Book one with a name and an email address.
Check your calendar app: the event is there. The page offers a cancel
button; use it, and watch the event disappear.

If this works, the hard part is done. If it does not, see
[Troubleshooting](#troubleshooting).

**Adjust the shape of the thing** in `worker/wrangler.toml`:

| Setting | Means |
|---|---|
| `SLOT_MINUTES` | Length of one appointment |
| `MIN_NOTICE_MINUTES` | How soon someone may book — `120` blocks the next two hours |
| `BOOKING_HORIZON_DAYS` | How far ahead the page shows |

---

## Part 3 — Put it on the internet

### The API

```sh
cd worker
npx wrangler login          # opens a browser
npx wrangler deploy
```

It prints an address like `https://booking-worker.you.workers.dev`.

Now give it your secrets. These are stored by Cloudflare, not in any
file:

```sh
npx wrangler secret put SIGNING_KEY_JWK
npx wrangler secret put AVAILABILITY_USERNAME
npx wrangler secret put AVAILABILITY_PASSWORD
npx wrangler secret put BOOKING_STORE_USERNAME
npx wrangler secret put BOOKING_STORE_PASSWORD
```

Each asks you to paste the value. For Google, the secret is
`GOOGLE_SERVICE_ACCOUNT_JSON` and the value is the whole JSON file
contents on one line, and there are no username/password secrets.

Put the real calendar URLs into `wrangler.toml` (they are settings, not
secrets), and deploy again.

### The page

```sh
cd frontend
VITE_WORKER_URL=https://booking-worker.you.workers.dev npm run build
npx wrangler pages deploy dist --project-name booking
```

That address is **baked into the built files**. If the API address ever
changes, rebuild and redeploy the page.

It prints an address like `https://booking.pages.dev`.

### Let them talk to each other

Back in `worker/wrangler.toml`, set `ALLOWED_ORIGINS` to the page's
address, exactly, with no trailing slash:

```toml
ALLOWED_ORIGINS = "https://booking.pages.dev"
```

Deploy the worker again. Visit the page; it should behave exactly as it
did locally.

### Your own domain

Optional, and worth doing before you set up email — the confirmation
email will contain a link to this page, and a link whose domain matches
the sender's domain is treated more kindly by spam filters.

Cloudflare's custom-domain flow is simplest when your domain's DNS is
hosted at Cloudflare. If it is elsewhere (Gandi, your registrar, your
web host), you have a choice: move the DNS to Cloudflare, or stay on the
`.pages.dev` and `.workers.dev` addresses. Moving DNS does **not** move
your email — your mailboxes stay exactly where they are, as long as you
copy the MX records across faithfully.

A reasonable arrangement: `booking.yourpractice.com` for the page,
`api.yourpractice.com` for the API.

---

## Part 4 — Email

This is the part with the most fiddly detail, because the world's mail
systems have spent twenty years learning to distrust strangers. Do it in
order.

### 4.1 What you are proving

Anyone can put your address in the `From:` line of an email. Three DNS
records let receiving systems tell your real mail from a forgery, and
without them Gmail and Outlook will quietly bin your confirmations:

- **SPF** — a list of who may send for your domain.
- **DKIM** — a cryptographic signature; the public half lives in DNS.
- **DMARC** — what to do when neither passes, and where to send reports.

### 4.2 Set up Brevo

1. Create the account. Use an address at your own domain.
2. Go to **Senders, Domains & Dedicated IPs → Domains → Add a domain**,
   enter `yourpractice.com`, and choose *Authenticate this domain*.
3. Brevo shows you a list of DNS records. Leave this page open.

Authenticate the **domain**, not just a single sender address. Once the
domain is authenticated, any address at it can send, and you never touch
this page again.

### 4.3 Add the records

Go to wherever you edit DNS — your registrar's control panel. At Gandi
that is *Domain → DNS Records*.

Copy Brevo's values **exactly**. What follows describes the shape of
each record, so you know what you are looking at; the values are theirs,
not mine.

**Domain verification.** A `TXT` record at the top level of your domain
(the name field is `@`, or blank, depending on the panel) with a value
like `brevo-code:` and a long string.

**DKIM.** Usually two `CNAME` records named `brevo1._domainkey` and
`brevo2._domainkey`, each pointing at an address at `dkim.brevo.com`.
Some accounts get a single `TXT` record at `mail._domainkey` instead,
holding a very long key. If so, and your DNS panel rejects it as too
long, the value must be split into several quoted pieces inside one
record — the pieces are joined back together automatically, and where
you split does not matter as long as you do not insert spaces.

**SPF.** This one is different from the others: **you must not add a
second SPF record.** A domain may have exactly one, and two is worse
than none. Look for an existing `TXT` record at the top level starting
`v=spf1`. If there is one — and there will be, if you have mailboxes on
this domain — *edit* it to add Brevo's `include:`, keeping what is
already there:

```
v=spf1 include:_mailcust.gandi.net include:spf.brevo.com ~all
```

(`_mailcust.gandi.net` is Gandi's mail; yours will name your own
provider.) While you are there, if it ends in `?all`, change that to
`~all`. `?all` means "I decline to say", which is no use to anybody.

**DMARC.** A `TXT` record named `_dmarc`:

```
v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com
```

`p=none` means "do not block anything yet, just tell me what you see" —
the right place to start. `rua` is where the daily reports go; Brevo's
address means Brevo parses them for you and shows the result in their
dashboard. You can use your own address instead, but the reports are
machine-readable XML and unpleasant to read by hand.

### 4.4 Verify — properly

Wait a few minutes, then press *Verify* in Brevo. Green ticks are
necessary but not sufficient; they only prove the records exist.

The real test is a message. Send yourself one (Part 5 does this), open
it in Gmail, and use the `⋮` menu → **Show original**. You want to see:

```
SPF:   PASS
DKIM:  PASS   with   header.d=yourpractice.com
DMARC: PASS
```

The `header.d` part is what matters. If it names a Brevo domain rather
than yours, the DKIM records are not being used and your domain is not
really authenticated — go back to 4.3.

<https://www.mail-tester.com> is a good second opinion: send it a
message, and it scores what it finds.

### 4.5 Switch the email on

Two settings in `worker/wrangler.toml`:

```toml
CANCEL_URL         = "https://booking.yourpractice.com/cancel"
DISPLAY_TIMEZONE   = "Europe/Helsinki"
SENDER_EMAIL       = "info@yourpractice.com"
SENDER_NAME        = "Your Practice"
PRACTITIONER_EMAIL = "info@yourpractice.com"
```

- `CANCEL_URL` must be the deployed cancellation page. This is the link
  in the confirmation email; if it is wrong, customers cannot cancel.
  Write it **without** `.html`: Pages serves `cancel.html` at `/cancel`
  and redirects the longer form to it, and the cancellation token travels
  in the part of the link after `#`, which survives a redirect only by
  browser convention. Do not make a customer's only way out depend on
  that. Open the address yourself before switching the email on.
- `DISPLAY_TIMEZONE` is the zone appointment times are written in, e.g.
  `Europe/Helsinki`, `Europe/London`.
- `SENDER_EMAIL` must be at the domain you just authenticated, and
  should be a real mailbox you read. A `From:` address that bounces is
  itself a spam signal.
- `PRACTITIONER_EMAIL` gets a notice on every booking. Leave it out and
  you get none.

And the key, which is a secret:

```sh
cd worker
npx wrangler secret put BREVO_API_KEY
npx wrangler deploy
```

**Until you set that key, the system sends no mail at all** and says so
in its own responses. That is deliberate: it is what lets you develop
and test without mailing anybody. It also means a deployment where you
configured everything *except* the key will take bookings silently and
tell nobody. If confirmations are not arriving, check this first.

### 4.6 Things that will bite you

- **Do not send test bookings to made-up addresses** like
  `test@example.com`. They bounce, and bounces damage your standing with
  Brevo and with the receiving systems. Use a real mailbox you own.
- **Free-tier Brevo adds its own small footer** to messages. Harmless,
  but it will appear.
- **You share sending machines with other Brevo customers** on the free
  tier. Their behaviour affects your delivery a little, and no DNS
  record changes that. It is normally fine at this volume.
- **Tighten DMARC later.** After a few weeks, when the reports show only
  your mail provider and Brevo, change `p=none` to `p=quarantine`. That
  is the point at which forgeries of your domain actually start being
  stopped.

---

## Part 5 — The end-to-end check

Do this once, properly, before you give the address to a customer.

1. Mark an `OPEN` block in your availability calendar for tomorrow.
2. On your **phone**, visit the booking page. Book a slot, using a real
   email address you can read on that phone.
3. Confirm all four of these:
   - the event appears in your calendar app;
   - the confirmation email arrives, with the right date, the right time
     in the right timezone, and a working cancel link;
   - your practitioner notice arrives;
   - the slot no longer appears as free on the page.
4. Open the emailed link on the phone. It should show the appointment.
   Press cancel.
5. Confirm the event has gone from your calendar and the slot is offered
   again.

Step 4 is the one that matters most, because it is the one that proves a
customer who closed their browser can still get out of an appointment.
Do it in a private/incognito window if you can — that proves the link
works with no help from the browser that made the booking.

---

## Part 6 — Living with it

**To open times for booking**: create an event titled `OPEN` in your
availability calendar, in whatever calendar app you already use. It gets
divided into slots automatically. Repeating events work — "every Tuesday
09:00–12:00" is one event.

**To close a time**: delete or shorten the `OPEN` event. Slots already
booked are unaffected.

**To cancel a booking yourself**: delete the event in your calendar. The
system notices; nothing else is needed. It does not currently tell the
customer, so do that yourself.

**Anything already booked** blocks its slot, whether the booking came
through the system or you put it in the calendar by hand — as long as it
is in the booking store calendar.

---

## Troubleshooting

**The page shows no slots.**
Check the `OPEN` event's title is exactly `OPEN`, that it is in the
availability calendar and not another one, and that it is further ahead
than `MIN_NOTICE_MINUTES`. If it is today and soon, that is why.

**The page shows an error immediately.**
Almost always the calendar URL or the credentials. Check the URL ends in
`/`. Check you used an app password, not your login password.

**Bookings work locally but not once deployed.**
`ALLOWED_ORIGINS` must exactly match the address the page is served
from — scheme included, no trailing slash. And the secrets must actually
have been set: `npx wrangler secret list`.

**Bookings work but no email arrives.**
In order: is `BREVO_API_KEY` set as a secret on the deployed worker? Is
the domain authenticated in Brevo (not merely added)? Is it in the spam
folder? Does Brevo's own activity log show the message? That log
distinguishes "we never got it" from "we sent it and it bounced", which
are very different problems.

**Email arrives but lands in spam.**
Check *Show original* per §4.4. `header.d` naming your own domain is the
single most important line. After that: does the link in the mail point
at the same domain as the sender?

**The cancel link does nothing.**
`CANCEL_URL` must point at the *deployed* cancellation page. If it still
says `localhost`, that is the problem, and the emails already sent
cannot be fixed.

---

## What is not automated yet

Honesty about the current state:

- There is no one-command deploy. Part 3 is the manual version of it.
- There is no health check that tells you what is misconfigured. Until
  there is, this guide's troubleshooting section is the substitute.
- Nothing warns you if the email transport is configured but broken.

All three are `ROADMAP.md` M4.

## Where things are written down

| Document | Contents |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | How it all actually works, in detail |
| [SCOPE.md](SCOPE.md) | What this is and is not meant to do |
| [README.md](README.md) | Development, testing, contributing |
