/**
 * The page the emailed cancellation link lands on. The token is in the URL
 * fragment, which the browser never sends to a server (`ARCHITECTURE.md` §5),
 * so it reaches neither the static host's logs nor a Referer header; the uid
 * is an ordinary query parameter, being no secret on its own.
 */

import { cancelBooking, fetchBooking } from "./api";
import { element, when } from "./ui";

const status = element("cb-status");
const error = element("cb-error");
const button = element<HTMLButtonElement>("cb-cancel");

const uid = new URLSearchParams(location.search).get("uid") ?? "";
const token = location.hash.slice(1);

function fail(message: string): void {
  error.textContent = message;
  error.hidden = false;
}

button.onclick = async () => {
  button.disabled = true;
  button.textContent = "Cancelling…";
  try {
    await cancelBooking(uid, token);
  } catch (err) {
    button.disabled = false;
    button.textContent = "Cancel this booking";
    fail(`The booking could not be cancelled: ${String(err)}`);
    return;
  }
  button.hidden = true;
  error.hidden = true;
  status.textContent = "Your booking is cancelled. The time is free for someone else now.";
};

async function show(): Promise<void> {
  if (!uid || !token) {
    status.textContent =
      "This link is incomplete. Use the link from your confirmation email as it arrived.";
    return;
  }

  let booking;
  try {
    booking = await fetchBooking(uid, token);
  } catch (err) {
    status.textContent = "This link is not valid any more.";
    fail(String(err));
    return;
  }

  // No event behind the uid means it has been cancelled already — by this
  // link, or by the practitioner in their own calendar client.
  if (!booking) {
    status.textContent = "That booking has already been cancelled.";
    return;
  }
  status.textContent = `Your appointment is on ${when(booking.slot_start, booking.slot_end)}.`;
  button.hidden = false;
}

void show();
