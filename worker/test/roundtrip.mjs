// The email path end to end: book a slot, wait for the confirmation to reach
// the inbox our recipient address forwards to, then cancel the booking with
// nothing but the uid and token carried by the link in that message. Everything
// before the last step is covered by the unit suite against a stubbed
// transport; only this proves the link a customer receives actually works.
//
// Deliberately not a vitest project: vitest.config.ts pins BREVO_API_KEY empty
// in every project so that no ordinary test run can send mail, and that guard
// must not grow an exception. Run it on purpose — `npm run roundtrip`, against
// a `wrangler dev` that does have the key — never as part of `npm test`.
//
// The recipient's local part is its testmail.app tag: the address forwards
// `<local>@<our domain>` to `<namespace>.<local>@inbox.testmail.app`, which
// keeps the visible recipient on a domain we own (so nothing can bounce) while
// the message stays readable over HTTP.

import { resolveTxt } from "node:dns/promises";
import { calculateJwkThumbprint, exportJWK, generateKeyPair, SignJWT } from "jose";
import { devVar } from "./vars.mjs";

/** Brevo to Gandi to testmail is normally seconds; three minutes is generous. */
const DELIVERY_TIMEOUT_MS = 180_000;
const POLL_MS = 5_000;
const INBOX = "https://api.testmail.app/api/json";

/** Environment first: CI passes secrets, a laptop keeps them in .dev.vars. */
function setting(name, fallback) {
  const value = process.env[name] || devVar(name) || fallback;
  if (!value) throw new Error(`${name} is set in neither the environment nor worker/.dev.vars`);
  return value;
}

const workerUrl = setting("WORKER_URL", "http://localhost:8787").replace(/\/$/, "");
const recipient = setting("ROUNDTRIP_RECIPIENT", "ci@parantaja.fi");
const apikey = setting("TESTMAIL_APIKEY");
const namespace = setting("TESTMAIL_NAMESPACE");
const cancelUrl = setting("CANCEL_URL");
const availability = setting("AVAILABILITY_CALENDAR_URL");
const store = setting("BOOKING_STORE_URL");
const senderDomain = setting("SENDER_EMAIL").split("@")[1];

const auth = "Basic " + Buffer.from(
  `${setting("TEST_WRITE_USERNAME")}:${setting("TEST_WRITE_PASSWORD")}`,
).toString("base64");

// The Worker sends the practitioner notice to PRACTITIONER_EMAIL. Naming that
// address again here is the operator stating it forwards into the test inbox;
// unset, the notice goes unchecked, because a working .dev.vars usually points
// the practitioner at a real mailbox for the browser e2e test instead.
const notified = process.env.ROUNDTRIP_NOTICE_RECIPIENT
  || devVar("ROUNDTRIP_NOTICE_RECIPIENT");
const practitioner = devVar("PRACTITIONER_EMAIL");
if (notified && notified !== practitioner) {
  throw new Error(
    `ROUNDTRIP_NOTICE_RECIPIENT is ${notified}, but the Worker notifies ` +
    `${practitioner ?? "nobody"}: the notice would never arrive.`,
  );
}

function step(message) {
  console.log(`  ${message}`);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// --- CalDAV, just enough to paint an OPEN event and take it away again. The
// Worker's own client is workerd-only, hence these few verbs by hand.

function stamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
}

async function paint(calendarUrl, summary, start, end) {
  const uid = crypto.randomUUID();
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//parantaja//roundtrip//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${summary}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");

  const response = await fetch(`${calendarUrl.replace(/\/$/, "")}/${uid}.ics`, {
    method: "PUT",
    headers: { Authorization: auth, "Content-Type": "text/calendar; charset=utf-8" },
    body: ics,
  });
  if (response.status !== 201 && response.status !== 204) {
    throw new Error(`PUT ${summary}: ${response.status}`);
  }
}

async function clear(calendarUrl, start, end) {
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">` +
    `<d:prop><d:getetag/></d:prop><c:filter>` +
    `<c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">` +
    `<c:time-range start="${stamp(start)}" end="${stamp(end)}"/>` +
    `</c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`;

  const response = await fetch(calendarUrl, {
    method: "REPORT",
    headers: { Authorization: auth, "Content-Type": "application/xml; charset=utf-8", Depth: "1" },
    body,
  });
  if (response.status !== 207) throw new Error(`REPORT: ${response.status}`);

  const origin = new URL(calendarUrl).origin;
  const xml = await response.text();
  for (const [, href] of xml.matchAll(/<[^:>\s]+:href[^>]*>([\s\S]*?)<\//g)) {
    const url = new URL(href.trim(), origin);
    if (url.pathname.endsWith(".ics")) {
      await fetch(url, { method: "DELETE", headers: { Authorization: auth } });
    }
  }
}

// --- The inbox.

async function inbox(tag, since, extra = {}) {
  const url = new URL(INBOX);
  const params = {
    apikey, namespace, tag,
    timestamp_from: String(since),
    headers: "true",
    limit: "100",
    ...extra,
  };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const response = await fetch(url);
  const body = await response.json();
  if (body.result !== "success") {
    throw new Error(`testmail.app answered ${response.status}: ${body.message ?? "no reason given"}`);
  }
  return body.emails;
}

/** Polls until one message matches, or the delivery budget is spent. */
async function awaitMessage(tag, since, describe, matches) {
  const deadline = Date.now() + DELIVERY_TIMEOUT_MS;
  for (;;) {
    const found = (await inbox(tag, since)).find(matches);
    if (found) return found;
    if (Date.now() >= deadline) {
      throw new Error(
        `Brevo accepted the send, but no ${describe} reached ${tag}@ in ` +
        `${DELIVERY_TIMEOUT_MS / 1000} s. The mail was lost between Brevo and the inbox.`,
      );
    }
    await sleep(POLL_MS);
  }
}

/** testmail returns headers as [{key, line}], `key` already lower-cased. */
function header(message, name) {
  return (message.headers ?? [])
    .filter(entry => entry.key === name)
    .map(entry => entry.line.replace(/\r?\n\s+/g, " "))
    .join("\n");
}

/**
 * Not `dkim=pass`: testmail's MX does not verify signatures — it reports
 * `dkim: "none"` on every message and its Authentication-Results covers SPF
 * alone. What can be established without a verifier is each half of the pair,
 * which together fail exactly when the record breaks: Brevo still signs as us,
 * and the selector it named is still published. Pulling the selector out of the
 * signature rather than hard-coding `brevo2` means Brevo rotating it is not a
 * failure, while the CNAME being dropped at the registrar is.
 */
async function assertDkim(message) {
  const signature = header(message, "dkim-signature");
  if (!signature) throw new Error("The received message carries no DKIM-Signature.");

  const domain = /\bd=([^;\s]+)/.exec(signature)?.[1];
  const selector = /\bs=([^;\s]+)/.exec(signature)?.[1];
  if (domain !== senderDomain) {
    throw new Error(`The message is signed for ${domain}, not ${senderDomain}.`);
  }

  const name = `${selector}._domainkey.${domain}`;
  const records = await resolveTxt(name).catch(error => {
    throw new Error(`${name} does not resolve (${error.code}): the DKIM record is gone.`);
  });
  if (!records.flat().join("").includes("p=")) {
    throw new Error(`${name} resolves but publishes no key.`);
  }
  return name;
}

// --- The run.

const since = Date.now();
const tag = recipient.split("@")[0];

console.log(`Round trip against ${workerUrl}, mail to ${recipient} (tag ${tag})`);

// Before a single send is spent: a wrong key or namespace fails here.
await inbox(tag, since, { limit: "1" });
step("testmail.app reachable");

const slotStart = new Date(Date.now() + 24 * 3600_000);
slotStart.setUTCMinutes(0, 0, 0);
const windowStart = slotStart.toISOString();
const windowEnd = new Date(slotStart.getTime() + 3600_000).toISOString();

await clear(availability, slotStart, new Date(windowEnd));
await clear(store, slotStart, new Date(windowEnd));
await paint(availability, "OPEN", slotStart, new Date(windowEnd));
step(`painted OPEN ${windowStart}`);

const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
const jwk = await exportJWK(publicKey);
const thumbprint = await calculateJwkThumbprint(jwk);
const proof = () => new SignJWT({})
  .setProtectedHeader({ alg: "ES256", typ: "booking-proof+jwt", jwk })
  .setIssuedAt()
  .sign(privateKey);

async function slots() {
  const response = await fetch(
    `${workerUrl}/v1/slots?window_start=${windowStart}&window_end=${windowEnd}`,
    { headers: { "X-Session-Thumbprint": thumbprint } },
  );
  if (!response.ok) throw new Error(`GET /v1/slots: ${response.status} ${await response.text()}`);
  return response.json();
}

const offered = await slots();
if (!offered.slots.length) throw new Error("The painted OPEN event yielded no slots.");
const booked = offered.slots[0].slot_start;
step(`${offered.slots.length} slots offered, booking ${booked}`);

const response = await fetch(`${workerUrl}/v1/bookings`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${offered.grant}`,
    "X-Session-Proof": await proof(),
  },
  body: JSON.stringify({
    slot_start: booked,
    attendee: { name: "CI Round Trip", email: recipient },
    notes: "Automated end-to-end check of the email path.",
  }),
});
if (!response.ok) throw new Error(`POST /v1/bookings: ${response.status} ${await response.text()}`);
const booking = await response.json();

// Whether Brevo took the message is the fork between two quite different
// investigations, so it is settled here rather than by a delivery timeout.
if (booking.confirmation_email === "disabled") {
  throw new Error("The Worker has no BREVO_API_KEY: it sent nothing, by configuration.");
}
if (booking.confirmation_email !== "sent") {
  throw new Error("Brevo refused the send. Check the CI API key and the sender identity.");
}
step(`booked ${booking.uid}, Brevo accepted the confirmation`);

const confirmation = await awaitMessage(
  tag, since, "confirmation", message => message.text?.includes(booking.uid),
);
step(`confirmation received: ${confirmation.subject}`);

// From here the booking response is not consulted again. Only what the customer
// was actually sent may be used — that is the whole point of this test.
const escaped = cancelUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const link = confirmation.text.match(new RegExp(`${escaped}\\S*`))?.[0];
if (!link) throw new Error(`No link to ${cancelUrl} in the confirmation:\n${confirmation.text}`);

const linked = new URL(link);
const uid = linked.searchParams.get("uid");
const token = linked.hash.slice(1);
if (!uid || !token) throw new Error(`The link carries no uid or no token: ${link}`);
if (uid !== booking.uid) throw new Error(`The link names ${uid}, the booking is ${booking.uid}`);
step("cancellation link parsed");

const cancelled = await fetch(`${workerUrl}/v1/bookings/${uid}`, {
  method: "DELETE",
  headers: { Authorization: `Bearer ${token}` },
});
if (cancelled.status !== 204) {
  throw new Error(
    `The emailed link did not cancel: DELETE answered ${cancelled.status} ` +
    `${await cancelled.text()}`,
  );
}
step("cancelled from the emailed link alone");

const again = await slots();
if (!again.slots.some(slot => slot.slot_start === booked)) {
  throw new Error(`${booked} is still taken after the cancellation.`);
}
step("the slot is offered again");

if (notified) {
  const notice = await awaitMessage(
    notified.split("@")[0], since, "practitioner notice",
    message => message.subject?.startsWith("New booking:"),
  );
  step(`practitioner notice received: ${notice.subject}`);
} else {
  step("practitioner notice not checked: ROUNDTRIP_NOTICE_RECIPIENT is unset");
}

step(`signed for ${senderDomain}, and ${await assertDkim(confirmation)} still resolves`);

await clear(availability, slotStart, new Date(windowEnd));
await clear(store, slotStart, new Date(windowEnd));
console.log("Round trip complete.");
