import type { Email } from "./config";

const ENDPOINT = "https://api.brevo.com/v3/smtp/email";

export interface BookingMail {
  uid: string;
  slotStart: string;
  slotEnd: string;
  name: string;
  email: string;
  notes: string;
  cancellationToken: string;
}

interface Message {
  to: string;
  subject: string;
  text: string;
}

/**
 * The seam (`ARCHITECTURE.md` §6): one transactional HTTP call, so changing
 * provider is this function. Never throws — the booking is already stored, and
 * a mail failure must not undo it — so it reports success instead.
 */
export async function sendEmail(email: Email, message: Message): Promise<boolean> {
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "api-key": email.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: email.sender,
        to: [{ email: message.to }],
        subject: message.subject,
        textContent: message.text,
      }),
    });
  } catch (e) {
    console.error("Email transport failed:", e);
    return false;
  }
  if (!response.ok) {
    console.error(`Email rejected: ${response.status} ${await response.text()}`);
    return false;
  }
  return true;
}

/** Plain text throughout: nothing to escape, and it reads everywhere. */
function when(email: Email, booking: BookingMail): string {
  const zone = { timeZone: email.timezone };
  const start = new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeStyle: "short", ...zone })
    .format(new Date(booking.slotStart));
  const end = new Intl.DateTimeFormat("en-GB", { timeStyle: "short", ...zone })
    .format(new Date(booking.slotEnd));
  return `${start}–${end} (${email.timezone})`;
}

/**
 * The token rides in the URL fragment, which browsers never send to a server
 * (`ARCHITECTURE.md` §5); the uid is in the query because it is not a secret
 * and the page needs it before it has parsed anything.
 */
function cancellationLink(email: Email, booking: BookingMail): string {
  const url = new URL(email.cancelUrl);
  url.searchParams.set("uid", booking.uid);
  url.hash = booking.cancellationToken;
  return url.toString();
}

function confirmation(email: Email, booking: BookingMail): Message {
  const appointment = when(email, booking);
  return {
    to: booking.email,
    subject: `Appointment confirmed: ${appointment}`,
    text: [
      `Hello ${booking.name},`,
      "",
      "Your appointment is booked:",
      "",
      `    ${appointment}`,
      "",
      "To cancel it, follow this link:",
      "",
      `    ${cancellationLink(email, booking)}`,
      "",
      "The link works until the appointment starts.",
      "",
    ].join("\n"),
  };
}

function notification(email: Email, booking: BookingMail, to: string): Message {
  const appointment = when(email, booking);
  const lines = [
    `${booking.name} <${booking.email}> booked:`,
    "",
    `    ${appointment}`,
    "",
  ];
  if (booking.notes) lines.push("Note from them:", "", `    ${booking.notes}`, "");
  lines.push("The event is in your booking calendar.", "");
  return { to, subject: `New booking: ${appointment}`, text: lines.join("\n") };
}

/**
 * Sends the customer their confirmation and, when the operator configured an
 * address, tells the practitioner. Only the customer's outcome is reported:
 * that is the one the booking response speaks about.
 */
export async function sendBookingEmails(
  email: Email,
  booking: BookingMail,
): Promise<"sent" | "failed"> {
  const [confirmed] = await Promise.all([
    sendEmail(email, confirmation(email, booking)),
    email.practitioner
      ? sendEmail(email, notification(email, booking, email.practitioner))
      : Promise.resolve(true),
  ]);
  return confirmed ? "sent" : "failed";
}
