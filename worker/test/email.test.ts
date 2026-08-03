import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config, type Email } from "../src/config";
import { sendBookingEmails, type BookingMail } from "../src/email";

const email: Email = {
  apiKey: "test-key",
  sender: { email: "info@parantaja.fi", name: "Bookings" },
  cancelUrl: "https://booking.example.com/cancel.html",
  timezone: "Europe/Helsinki",
};

const booking: BookingMail = {
  uid: "booking-20260902T090000Z-c0ffee",
  slotStart: "2026-09-02T09:00:00Z",
  slotEnd: "2026-09-02T09:30:00Z",
  name: "Alice",
  email: "e2e@parantaja.fi",
  notes: "First visit",
  cancellationToken: "eyJhbGciOiJFUzI1NiJ9.token",
};

interface Sent {
  sender: { email: string; name: string };
  to: { email: string }[];
  subject: string;
  textContent: string;
}

let sent: { url: string; init: RequestInit }[];

function accept(status = 201): void {
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    sent.push({ url, init });
    return Promise.resolve(new Response("{}", { status }));
  });
}

function body(index: number): Sent {
  return JSON.parse(sent[index]!.init.body as string) as Sent;
}

beforeEach(() => { sent = []; });
afterEach(() => vi.unstubAllGlobals());

describe("the confirmation", () => {
  it("carries the appointment in the configured zone and a link that cancels it", async () => {
    accept();

    expect(await sendBookingEmails(email, booking)).toBe("sent");

    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe("https://api.brevo.com/v3/smtp/email");
    expect((sent[0]?.init.headers as Record<string, string>)["api-key"]).toBe("test-key");

    const message = body(0);
    expect(message.sender).toEqual(email.sender);
    expect(message.to).toEqual([{ email: "e2e@parantaja.fi" }]);
    // 09:00 UTC is noon in Helsinki: the customer must not read UTC.
    expect(message.subject).toBe("Appointment confirmed: Wednesday, 2 September 2026 at " +
      "12:00–12:30 (Europe/Helsinki)");
    expect(message.textContent).toContain("Hello Alice,");
    expect(message.textContent).toContain(
      "https://booking.example.com/cancel.html?uid=booking-20260902T090000Z-c0ffee" +
      "#eyJhbGciOiJFUzI1NiJ9.token",
    );
  });

  it("reports failure rather than throwing, the booking being already stored", async () => {
    accept(400);

    expect(await sendBookingEmails(email, booking)).toBe("failed");
  });

  it("reports failure when the transport itself does not answer", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new Error("network down")));

    expect(await sendBookingEmails(email, booking)).toBe("failed");
  });
});

describe("the practitioner notice", () => {
  it("goes out beside the confirmation, with the attendee's details", async () => {
    accept();

    await sendBookingEmails({ ...email, practitioner: "info@parantaja.fi" }, booking);

    expect(sent).toHaveLength(2);
    const notice = body(1);
    expect(notice.to).toEqual([{ email: "info@parantaja.fi" }]);
    expect(notice.textContent).toContain("Alice <e2e@parantaja.fi> booked:");
    expect(notice.textContent).toContain("First visit");
  });

  // The customer's confirmation is what the booking response speaks about.
  it("does not decide what the booking response says", async () => {
    let first = true;
    vi.stubGlobal("fetch", () => {
      const status = first ? 201 : 400;
      first = false;
      return Promise.resolve(new Response("{}", { status }));
    });

    expect(await sendBookingEmails(
      { ...email, practitioner: "info@parantaja.fi" }, booking,
    )).toBe("sent");
  });
});

describe("configuration", () => {
  it("leaves email off when no API key is set", () => {
    expect(config(env).email).toBeUndefined();
  });

  it("refuses a zone it cannot resolve once mail is configured", () => {
    expect(() => config({ ...env, BREVO_API_KEY: "k", DISPLAY_TIMEZONE: "Mars/Olympus" }))
      .toThrow();
  });

  it("refuses a cancellation URL that is not a URL", () => {
    expect(() => config({ ...env, BREVO_API_KEY: "k", CANCEL_URL: "cancel.html" })).toThrow();
  });
});
