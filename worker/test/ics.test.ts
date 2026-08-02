import ICAL from "ical.js";
import { describe, expect, it } from "vitest";
import { buildVEvent } from "../src/caldav";

const START = "2026-09-01T09:00:00.000Z";
const END = "2026-09-01T09:30:00.000Z";

function octets(text: string): number {
  return new TextEncoder().encode(text).length;
}

function vevent(summary: string, description: string): ICAL.Event {
  const ics = buildVEvent("booking-1", START, END, summary, description);
  for (const line of ics.split("\r\n")) expect(octets(line)).toBeLessThanOrEqual(75);
  return new ICAL.Event(new ICAL.Component(ICAL.parse(ics)).getFirstSubcomponent("vevent")!);
}

describe("line folding", () => {
  it("keeps a 1000-character note within the octet limit and readable", () => {
    // Multi-byte throughout, so a naive character count would overrun and a
    // naive octet count would split a character in half.
    const note = "Selkä — ja niskaoireiden kartoitus. ".repeat(30).slice(0, 1000);
    expect(note).toHaveLength(1000);

    expect(vevent("Alice", note).description).toBe(note);
  });

  it("leaves lines that fit alone", () => {
    const ics = buildVEvent("booking-1", START, END, "Alice", "");
    expect(ics).not.toContain("\r\n ");
  });
});
