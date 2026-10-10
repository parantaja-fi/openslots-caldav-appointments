import { afterEach, describe, expect, it, vi } from "vitest";
import { load } from "../src/state";

const TICK = 1_757_000_000_000; // an arbitrary moment in 2025

/** What an older wizard left in localStorage: no Google answers yet. */
const OLD = {
  inputs: { owner: "alice", repo: "openslots-caldav-appointments" },
  done: { accounts: true, fork: false, smoke: TICK },
  form: { provider: "google", providerUrl: "", sameCalendar: false, emailOn: true, values: {} },
  brevo: null,
};

function stored(value: unknown): void {
  vi.stubGlobal("localStorage", { getItem: () => JSON.stringify(value) });
}

afterEach(() => vi.unstubAllGlobals());

describe("load", () => {
  it("fills in the Google answers for a state saved before them", () => {
    stored(OLD);
    const { form } = load();
    expect(form.provider).toBe("google");
    expect(form.sameCalendar).toBe(false);
    expect(form.google).toEqual({
      projectId: "",
      clientEmail: "",
      calendarIds: { availability: "", store: "" },
    });
  });

  it("keeps the Google answers it has", () => {
    const google = {
      projectId: "practice-bookings",
      clientEmail: "booking@practice-bookings.iam.gserviceaccount.com",
      calendarIds: { availability: "anna@gmail.com", store: "" },
    };
    stored({ ...OLD, form: { ...OLD.form, google } });
    expect(load().form.google).toEqual(google);
  });

  it("turns ticks saved as booleans into an unknown moment, dropping the unticked", () => {
    stored(OLD);
    expect(load().done).toEqual({ accounts: 1, smoke: TICK });
  });
});
