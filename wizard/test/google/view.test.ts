// @vitest-environment jsdom
import { generateKeyPairSync } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import page from "../../index.html?raw";

// Layer 3 (docs/wizard-testing.md): main.ts runs at import against the
// page's own markup; Google answers with the fixtures of token.test.ts
// and probe.test.ts.
const ID = "c_0a1b2c3d4e5f@group.calendar.google.com";
const CALENDAR = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(ID)}`;
const GOOGLE: Record<string, string> = {
  "https://oauth2.googleapis.com/token":
    '{"access_token":"test-access-token","expires_in":3599,"token_type":"Bearer"}',
  [`${CALENDAR}/events?maxResults=1&fields=summary,timeZone,accessRole`]:
    '{"summary":"booking-calendar","timeZone":"Europe/Helsinki","accessRole":"owner"}',
  [`${CALENDAR}?fields=dataOwner`]: '{"dataOwner":"anna@gmail.com"}',
};

// A throwaway key per run; token.test.ts checks what is signed with it.
const KEY_FILE = JSON.stringify({
  type: "service_account",
  project_id: "practice-bookings",
  private_key: generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({
    type: "pkcs8",
    format: "pem",
  }),
  client_email: "booking@practice-bookings.iam.gserviceaccount.com",
});

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

/** Sets a field and commits it, as leaving the field does. */
function enter(selector: string, value: string): void {
  const field = $<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector);
  field.value = value;
  field.dispatchEvent(new Event("change"));
}

const markers = (list: string): (string | null)[] =>
  [...document.querySelectorAll(`#${list} .marker`)].map((m) => m.textContent);

beforeAll(async () => {
  document.body.innerHTML = /<body>([\s\S]*)<\/body>/.exec(page)![1]!;
  // Node's localStorage, unavailable without --localstorage-file, shadows
  // jsdom's; what the page remembers is not under test here.
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
  // jsdom lays nothing out, so has nothing to scroll.
  Element.prototype.scrollIntoView = () => {};
  vi.stubGlobal("fetch", async (url: string) => {
    const body = GOOGLE[url];
    if (body === undefined) throw new Error(`Unexpected fetch: ${url}`);
    return new Response(body, { headers: { "content-type": "application/json" } });
  });
  // The paced poll never comes round; the edits ask Google themselves.
  vi.useFakeTimers({ toFake: ["setInterval"] });
  await import("../../src/main");
  enter("#f-provider", "google");
});

describe("the Google view", () => {
  it("stands in for the journey at #google; Back returns to the calendars card", async () => {
    location.hash = "#google";
    await vi.waitFor(() => expect($("#journey").hidden).toBe(true));
    expect($("#google-journey").hidden).toBe(false);
    expect(markers("google-journey")).toEqual(["3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7"]);

    $("#google-back").click();
    await vi.waitFor(() => expect($("#journey").hidden).toBe(false));
    expect($("#google-journey").hidden).toBe(true);
    expect(location.hash).toBe("#step-calendars");
  });

  it("has Google check a pasted key and a calendar, then hands the address over", async () => {
    location.hash = "#google";
    await vi.waitFor(() => expect($("#google-journey").hidden).toBe(false));
    enter("#f-GOOGLE_SERVICE_ACCOUNT_JSON", KEY_FILE);
    await vi.waitFor(() => expect($("#step-google-key .marker").textContent).toBe("✓"));
    enter("#f-google-availability", ID);
    await vi.waitFor(() => expect($("#step-google-calendars .marker").textContent).toBe("✓"));

    // Done confirms the calendars card only with the address in hand;
    // without it, the press would send the view back to #google.
    $("#google-back").click();
    await vi.waitFor(() => expect($("#journey").hidden).toBe(false));
    $("#step-calendars .dynfoot button").click();
    expect($("#step-calendars .marker").textContent).toBe("✓");
  });
});
