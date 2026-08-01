import { WORKER_URL } from "./config";
import { proof, thumbprint } from "./session";
import type { BookRequest, Booking, Slot } from "./types";

export class ConflictError extends Error {}

/**
 * The create-grant from the most recent slot listing. It covers exactly those
 * slots, so booking requires a listing first and a stale one is refused.
 */
let grant: string | null = null;

async function detail(response: Response): Promise<string> {
  const body = await response.json().catch(() => null) as { detail?: string } | null;
  return body?.detail ?? `HTTP ${response.status}`;
}

export async function fetchSlots(start: string, end: string): Promise<Slot[]> {
  const url = new URL(`${WORKER_URL}/v1/slots`);
  url.searchParams.set("window_start", new Date(start).toISOString());
  url.searchParams.set("window_end", new Date(end).toISOString());

  const response = await fetch(url, {
    headers: { "X-Session-Thumbprint": await thumbprint() },
  });
  if (!response.ok) throw new Error(await detail(response));

  const body = await response.json() as { slots: Slot[]; grant: string };
  grant = body.grant;
  return body.slots;
}

export async function postBooking(request: BookRequest): Promise<Booking> {
  if (!grant) throw new Error("No booking grant; reload the calendar.");

  const response = await fetch(`${WORKER_URL}/v1/bookings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${grant}`,
      "X-Session-Proof": await proof(),
    },
    body: JSON.stringify(request),
  });
  if (response.status === 409) throw new ConflictError(await detail(response));
  if (!response.ok) throw new Error(await detail(response));

  return await response.json() as Booking;
}

export async function cancelBooking(uid: string, token: string): Promise<void> {
  const response = await fetch(`${WORKER_URL}/v1/bookings/${encodeURIComponent(uid)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(await detail(response));
}
