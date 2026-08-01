export interface Slot {
  slot_start: string; // ISO 8601, UTC
  slot_end: string;
}

export interface BookRequest {
  slot_start: string;
  attendee: { name: string; email?: string };
  notes?: string;
}

export interface Booking {
  uid: string;
  slot_start: string;
  slot_end: string;
  cancellation_token: string;
}
