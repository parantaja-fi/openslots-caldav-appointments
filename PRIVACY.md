# Privacy

> How the system handles personal data, where the data lives, and who
> processes it. Written for a practitioner who is the data
> controller for their customers' bookings. This document is
> (as of 2026-10-12) a factual description of the mechanisms in
> [ARCHITECTURE.md](ARCHITECTURE.md), not legal advice.

## What a booking is

A customer books with the name (or whatever nickname they give),
an email address and an optional note.
Together with the appointment's times, that is the whole of the
personal data the system handles. It gets stored in exactly one place:
in the booking event in your booking-store calendar — the name given
as the event's summary, the address and note as its description
(`ARCHITECTURE.md` §2). There is no database; no server of this
project ever sees a booking.

## Who processes the bookings

A booking passes through, and partly rests with, the services you
chose during setup — your processors, in GDPR terms:

- **GitHub Pages** serves the booking page and sees what any web
  server sees: the visitor's address and requests, under GitHub's own
  log policy. The page itself sets no cookies and runs no analytics;
  the browser session key (`ARCHITECTURE.md` §5) is anonymous and
  the private half never leaves the browser.
- **Cloudflare** runs the API, and sees its requests as any host
  would — the per-IP rate limit is Cloudflare's own counter.
  Our Worker is stateless: it holds a booking in memory for the one
  request that carries it, writes it to your calendar, and keeps no
  log of its own. It prints only errors, which persist nowhere unless
  you enable logging in your Cloudflare dashboard.
- **Your calendar provider** stores the booking event — the one
  persistent copy — under your account and their terms.
- **Brevo**, when you configured email, is given each booking's name,
  address, times and a cancellation link to be sent in the confirmation
  email; the notice sent to you carries the same plus the note the
  customer wrote. Brevo keeps transactional logs under its own policy.

The customer's mailbox holds the confirmation, and its link is the
authority to cancel (`ARCHITECTURE.md` §5).
The cancellation token is included in the URL as a so-called fragment,
i.e. the part after the # sign.  That part the browsers keep to
themselves.  The browser does not send it to the server when it
fetches pages, and therefore it does not appear in any requests,
server logs or Referer headers. The booking page's own script reads
and uses it (via JavaScript) after the page loads.

## Deletion and retention

Cancelling a booking — the customer from their link, or you deleting
the event in your calendar client — removes the event, and with it the
system's only copy. What remains is outside the system: the emails
already in mailboxes, Brevo's log, and whatever trash or version
history your calendar provider keeps. Past appointments stay in your
calendar until you delete them; the system never deletes anything of
its own accord. Retention is your policy, applied with your calendar
client.

## Your side of it

Under the GDPR and laws like it, you are the controller of your
customers' booking data. Practically:

- Your own privacy notice is where customers should learn the above,
  naming the processors (GitHub, Cloudflare, your calendar provider and,
  if you use email, Brevo) you actually use.
- Each of your processors publishes a data-processing agreement,
  accepted or downloaded from their account settings.
- A customer asking what you hold on them is answered from your
  calendar; one asking to be erased, by deleting their events and,
  where it matters, your copies of the notification emails.

## Operator credentials

What you paste during setup — calendar passwords, API keys, tokens —
is your data, not your customers'.  It too passes through no server
of this project: the setup wizard keeps secrets in the browser tab
memory and seals them into your own GitHub fork's
[Actions secrets](https://docs.github.com/en/actions/reference/security/secrets)
(`ARCHITECTURE.md` §1), where GitHub stores them encrypted.
