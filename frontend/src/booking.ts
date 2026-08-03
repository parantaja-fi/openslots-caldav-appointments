import type { Calendar } from "@fullcalendar/core";
import { cancelBooking, ConflictError, postBooking } from "./api";
import type { Booking, Slot } from "./types";
import { element, when as label } from "./ui";

let panel: HTMLDivElement | null = null;

function getPanel(): HTMLDivElement {
  if (panel) return panel;
  panel = document.createElement("div");
  panel.id = "booking-panel";
  Object.assign(panel.style, {
    display: "none",
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    background: "white",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    padding: "24px",
    boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
    zIndex: "1000",
    minWidth: "320px",
  });
  document.body.appendChild(panel);
  return panel;
}

export function showBookingForm(
  slot: Slot,
  calendar: Calendar,
  refreshSlots: () => Promise<void>,
): void {
  const el = getPanel();
  const when = label(slot.slot_start, slot.slot_end);

  el.innerHTML = `
    <h3 style="margin:0 0 16px;font-size:1.1rem">${when}</h3>
    <label style="display:block;margin-bottom:12px;font-size:0.9rem">
      Name
      <input id="bf-name" type="text" placeholder="Your name"
        style="display:block;width:100%;margin-top:4px;padding:8px;border:1px solid #d1d5db;border-radius:4px;font-size:1rem">
    </label>
    <label style="display:block;margin-bottom:12px;font-size:0.9rem">
      Email
      <input id="bf-email" type="email" placeholder="you@example.com"
        style="display:block;width:100%;margin-top:4px;padding:8px;border:1px solid #d1d5db;border-radius:4px;font-size:1rem">
    </label>
    <label style="display:block;margin-bottom:16px;font-size:0.9rem">
      Note <span style="color:#9ca3af">(optional)</span>
      <input id="bf-note" type="text" placeholder="Anything I should know"
        style="display:block;width:100%;margin-top:4px;padding:8px;border:1px solid #d1d5db;border-radius:4px;font-size:1rem">
    </label>
    <div id="bf-error" style="color:#dc2626;margin-bottom:12px;font-size:0.9rem;display:none"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button id="bf-dismiss"
        style="padding:8px 16px;border:1px solid #d1d5db;border-radius:4px;background:white;cursor:pointer">
        Cancel
      </button>
      <button id="bf-submit"
        style="padding:8px 16px;border:none;border-radius:4px;background:#22c55e;color:white;cursor:pointer;font-size:1rem">
        Book
      </button>
    </div>
  `;
  el.style.display = "block";

  const name = element<HTMLInputElement>("bf-name");
  const email = element<HTMLInputElement>("bf-email");
  name.focus();
  element("bf-dismiss").onclick = () => { el.style.display = "none"; };

  element("bf-submit").onclick = async () => {
    // The address is where the confirmation and its cancellation link go, so
    // it is as required as the name; the Worker checks it again.
    const missing = [name, email].filter(field => !field.value.trim());
    for (const field of missing) field.style.borderColor = "#dc2626";
    if (missing.length) return;
    const submit = element<HTMLButtonElement>("bf-submit");
    const dismiss = element<HTMLButtonElement>("bf-dismiss");
    submit.disabled = dismiss.disabled = true;
    submit.textContent = "Booking…";

    let booking: Booking;
    try {
      booking = await postBooking({
        slot_start: slot.slot_start,
        attendee: { name: name.value.trim(), email: email.value.trim() },
        notes: element<HTMLInputElement>("bf-note").value.trim() || undefined,
      });
    } catch (err) {
      submit.disabled = dismiss.disabled = false;
      submit.textContent = "Book";
      const error = element("bf-error");
      error.textContent = err instanceof ConflictError
        ? "Sorry, that time was just taken."
        : `Booking failed: ${String(err)}`;
      error.style.display = "block";
      await refreshSlots();
      return;
    }

    calendar.getEventById(slot.slot_start)?.remove();
    showConfirmation(booking, name.value.trim(), email.value.trim(), when, refreshSlots);
  };
}

/**
 * The panel holds the cancellation token for as long as it is open. The
 * emailed link is what carries it beyond this tab — so when the confirmation
 * did not go out, the panel says that this is the only way back.
 */
function showConfirmation(
  booking: Booking,
  name: string,
  email: string,
  when: string,
  refreshSlots: () => Promise<void>,
): void {
  const el = getPanel();
  el.innerHTML = `
    <h3 style="margin:0 0 12px;color:#16a34a;font-size:1.1rem">Booking confirmed</h3>
    <p id="bf-confirmation" style="margin:0 0 16px"></p>
    <div id="bf-error" style="color:#dc2626;margin-bottom:12px;font-size:0.9rem;display:none"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button id="bf-cancel-booking"
        style="padding:8px 16px;border:1px solid #d1d5db;border-radius:4px;background:white;cursor:pointer">
        Cancel booking
      </button>
      <button id="bf-close"
        style="padding:8px 16px;border:none;border-radius:4px;background:#22c55e;color:white;cursor:pointer;font-size:1rem">
        Close
      </button>
    </div>
  `;
  element("bf-confirmation").textContent = booking.confirmation_email === "sent"
    ? `Thanks, ${name}. ${when} is booked, and a confirmation is on its way to ` +
      `${email}; it carries a link you can cancel from later.`
    : `Thanks, ${name}. ${when} is booked. The confirmation email could not be ` +
      `sent, so this panel is the only place you can cancel it from.`;
  el.style.display = "block";

  element("bf-close").onclick = () => { el.style.display = "none"; };

  const cancel = element<HTMLButtonElement>("bf-cancel-booking");
  cancel.onclick = async () => {
    cancel.disabled = true;
    cancel.textContent = "Cancelling…";
    try {
      await cancelBooking(booking.uid, booking.cancellation_token);
    } catch (err) {
      cancel.disabled = false;
      cancel.textContent = "Cancel booking";
      const error = element("bf-error");
      error.textContent = `Cancellation failed: ${String(err)}`;
      error.style.display = "block";
      return;
    }
    el.style.display = "none";
    await refreshSlots();
  };
}
