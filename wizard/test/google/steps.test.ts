import { describe, expect, it } from "vitest";
import type { AccessRole, CalendarProbe, GoogleProbeState } from "../../src/google/steps";
import {
  GOOGLE_PHASES,
  caldavAddress,
  deriveGoogleSteps,
  parseGoogleKey,
} from "../../src/google/steps";
import type { Saved } from "../../src/state";
import { NOT_KNOWN, derivePhases, settled } from "../../src/steps";
import { VALIDATORS } from "../../src/validators";

const TICK = 1_757_000_000_000; // an arbitrary moment in 2025
const PROJECT = "practice-bookings";
const SA = "booking@practice-bookings.iam.gserviceaccount.com";
const AVAILABILITY = "c_0a1b2c3d4e5f@group.calendar.google.com";
const STORE = "c_6a7b8c9d0e1f@group.calendar.google.com";
const OWNER = "anna@gmail.com";
const ATTESTED = ["google-account", "google-project", "google-apis", "google-service-account"];
const TICKED = Object.fromEntries(ATTESTED.map((id) => [id, TICK]));
const ACCEPTED: GoogleProbeState["key"] = {
  state: "accepted",
  at: TICK,
  clientEmail: SA,
  projectId: PROJECT,
};
/** Google's words for a clock off by two hours either way (plan §10). */
const CLOCK =
  "Invalid JWT: Token must be a short-lived token (60 minutes) and in a reasonable " +
  "timeframe. Check your iat and exp values in the JWT claim.";
const ACTIVATE =
  "https://console.developers.google.com/apis/api/calendar-json.googleapis.com/overview" +
  "?project=123456789012";

function saved(
  google: Partial<Saved["form"]["google"]> = {},
  done: Record<string, number> = {},
): Saved {
  return {
    inputs: {
      owner: "alice",
      repo: "openslots-caldav-appointments",
      workerUrl: "",
      pageUrl: "",
      senderDomain: "",
      cfEmail: "",
    },
    form: {
      provider: "google",
      providerUrl: "",
      sameCalendar: true,
      emailOn: true,
      values: {},
      google: {
        projectId: PROJECT,
        clientEmail: SA,
        calendarIds: { availability: AVAILABILITY, store: "" },
        ...google,
      },
    },
    done,
    brevo: null,
  };
}

function twoCalendars(s: Saved, store = STORE): Saved {
  return {
    ...s,
    form: {
      ...s.form,
      sameCalendar: false,
      google: { ...s.form.google, calendarIds: { availability: AVAILABILITY, store } },
    },
  };
}

const shared = (accessRole: AccessRole, owner = OWNER, summary = "Vastaanotto"): CalendarProbe => ({
  state: "present",
  summary,
  timeZone: "Europe/Helsinki",
  accessRole,
  owner,
});

function step(id: string, s: Saved, probes: GoogleProbeState = {}) {
  const found = deriveGoogleSteps(s, probes).find((x) => x.id === id);
  if (!found) throw new Error(`no step ${id}`);
  return found;
}

describe("the sub-wizard", () => {
  it("is seven cards, numbered as substeps of step 3", () => {
    const steps = deriveGoogleSteps(saved(), {});
    expect(steps.map((s) => s.id)).toEqual([
      ...ATTESTED,
      "google-key",
      "google-calendars",
      "google-back",
    ]);
    expect(steps.map((s) => s.title.split(" ")[0])).toEqual([
      "3.1",
      "3.2",
      "3.3",
      "3.4",
      "3.5",
      "3.6",
      "3.7",
    ]);
  });

  it("settles every card on ticks, an accepted key and a calendar shared at its need", () => {
    const steps = deriveGoogleSteps(saved({}, TICKED), {
      key: ACCEPTED,
      availability: shared("writer"),
    });
    expect(steps.every((s) => settled(s.status))).toBe(true);
    const back = steps.find((s) => s.id === "google-back")!;
    expect(back.status).toBe("green");
    expect(back.body).toEqual([
      `Service account: ${SA}.`,
      "Calendar: “Vastaanotto”, for availability and bookings alike.",
    ]);
  });

  it("compresses to a rail of a chip per card, standing on the first unsettled", () => {
    const steps = deriveGoogleSteps(saved({}, TICKED), { key: ACCEPTED });
    const phases = derivePhases(steps, GOOGLE_PHASES);
    expect(phases.map((p) => p.label)).toEqual([
      "3.1 Account",
      "3.2 Project",
      "3.3 APIs",
      "3.4 Service account",
      "3.5 Key",
      "3.6 Calendars",
      "3.7 Back",
    ]);
    expect(phases.map((p) => p.status)).toEqual([
      ...Array(5).fill("green"),
      "current",
      "todo",
    ]);
    expect(phases.map((p) => p.anchor)).toEqual(steps.map((s) => s.id));
  });
});

describe("3.1–3.4", () => {
  it("stay open until ticked, then are attested with the tick's moment", () => {
    for (const id of ATTESTED) {
      expect(step(id, saved()).status).toBe("open");
      const ticked = step(id, saved({}, { [id]: TICK }));
      expect(ticked.status).toBe("attested");
      expect(ticked.manual).toBe(true);
      expect(ticked.body.at(-1)).toMatch(/^Marked done: /);
    }
  });

  it("say nothing until ticked, then Marked done", () => {
    for (const id of ATTESTED) {
      expect(step(id, saved()).state).toBeUndefined();
      expect(step(id, saved({}, { [id]: TICK })).state).toBe("Marked done");
    }
  });

  it("open the console pages after 3.2 in its project", () => {
    const cloud = "https://console.cloud.google.com";
    expect(step("google-account", saved()).links[0]?.href).toBe(`${cloud}/`);
    expect(step("google-project", saved()).links[0]?.href).toBe(`${cloud}/projectcreate`);
    expect(step("google-apis", saved()).links.map((l) => l.href)).toEqual([
      `${cloud}/apis/library/caldav.googleapis.com?project=${PROJECT}`,
      `${cloud}/apis/library/calendar-json.googleapis.com?project=${PROJECT}`,
    ]);
    expect(step("google-service-account", saved()).links.map((l) => l.href)).toEqual([
      `${cloud}/iam-admin/serviceaccounts/create?project=${PROJECT}`,
      `${cloud}/iam-admin/serviceaccounts?project=${PROJECT}`,
    ]);
  });

  it("dim those links until 3.2 has the project ID, saying so", () => {
    for (const id of ["google-apis", "google-service-account"]) {
      const view = step(id, saved({ projectId: "" }));
      expect(view.links.every((l) => l.dim)).toBe(true);
      expect(view.body).toContain("The links open once 3.2 has the project ID.");
      expect(step(id, saved()).links.some((l) => l.dim)).toBe(false);
    }
  });
});

describe("3.5 key", () => {
  it("is open without a key, watches while Google is asked, is unknown when blind", () => {
    expect(step("google-key", saved()).status).toBe("open");
    expect(step("google-key", saved(), { key: { state: "unasked" } }).status).toBe("watch");
    const blind = step("google-key", saved(), { key: { state: "blind", reason: "no network." } });
    expect(blind.status).toBe("unknown");
    expect(blind.body).toEqual(["Not known whether Google accepts the key: no network."]);
  });

  it("greens on acceptance, naming the moment and the service account", () => {
    const view = step("google-key", saved(), { key: ACCEPTED });
    expect(view.status).toBe("green");
    expect(view.body[0]).toMatch(/^Google accepted the key at .+\.$/);
    expect(view.body).toContain(`Service account: ${SA}.`);
    expect(view.links).toEqual([]);
  });

  // Failure table, rows 1 and 2: the key is refused before Google is asked.
  it("takes only a key file, and never hands out its private key", () => {
    const file = {
      type: "service_account",
      project_id: PROJECT,
      private_key: "-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----\n",
      client_email: SA,
    };
    expect(parseGoogleKey(JSON.stringify(file))).toEqual({ clientEmail: SA, projectId: PROJECT });
    const keyless = JSON.stringify({ ...file, private_key: undefined });
    for (const raw of ["not json", "null", "[]", keyless]) {
      expect(parseGoogleKey(raw), raw).toBeNull();
    }
  });

  it("is red on a private key that does not import, with no word from Google", () => {
    const view = step("google-key", saved(), { key: { state: "unreadable" } });
    expect(view.status).toBe("red");
    expect(view.body).toEqual([
      "The private key in this file cannot be read — paste the file again, unchanged, " +
        "or make a new key.",
    ]);
    expect(view.links.map((l) => l.label)).toEqual(["Service accounts"]);
  });

  it("is red on a key from another project than 3.2's, linking 3.2's service accounts", () => {
    const view = step("google-key", saved(), { key: { ...ACCEPTED, projectId: "old-experiment" } });
    expect(view.status).toBe("red");
    expect(view.body).toEqual([
      `This key belongs to project old-experiment, 3.2 says ${PROJECT} — ` +
        `make the key in ${PROJECT}, or correct 3.2.`,
    ]);
    expect(view.links[0]?.href).toBe(
      `https://console.cloud.google.com/iam-admin/serviceaccounts?project=${PROJECT}`,
    );
  });

  it("takes any project's key while 3.2 is empty", () => {
    const view = step("google-key", saved({ projectId: "" }), {
      key: { ...ACCEPTED, projectId: "old-experiment" },
    });
    expect(view.status).toBe("green");
  });

  it("reads a refusal as a dead key, quoting Google beneath", () => {
    for (const description of ["Invalid JWT Signature.", "Invalid grant: account not found"]) {
      const view = step("google-key", saved(), { key: { state: "refused", description } });
      expect(view.status).toBe("red");
      expect(view.body).toEqual([
        "Google no longer accepts this key — make a new one.",
        `Google says: “${description}”`,
      ]);
      expect(view.links.map((l) => l.label)).toEqual(["Service accounts"]);
    }
  });

  it("reads a refusal naming iat and exp as this computer's clock", () => {
    const view = step("google-key", saved(), { key: { state: "refused", description: CLOCK } });
    expect(view.status).toBe("red");
    expect(view.body).toEqual([
      "Google finds the time stamps in the request out of range — check this computer's clock.",
      `Google says: “${CLOCK}”`,
    ]);
    expect(view.links).toEqual([]);
  });

  it("says its state in a few words, nothing without a key", () => {
    const cases: [GoogleProbeState["key"], string | undefined][] = [
      [undefined, undefined],
      [{ state: "unasked" }, "Asking Google"],
      [{ state: "blind", reason: "no network." }, NOT_KNOWN],
      [{ state: "unreadable" }, "The key cannot be read"],
      [{ state: "refused", description: CLOCK }, "Check this computer's clock"],
      [{ state: "refused", description: "Invalid JWT Signature." }, "Google refuses the key"],
      [{ ...ACCEPTED, projectId: "old-experiment" }, "A key from another project"],
      [ACCEPTED, "Accepted by Google"],
    ];
    for (const [key, state] of cases) {
      expect(step("google-key", saved(), { key }).state, key?.state).toBe(state);
    }
  });
});

describe("3.6 calendars", () => {
  it("is open until every needed ID is there", () => {
    const none = saved({ calendarIds: { availability: "", store: "" } });
    expect(step("google-calendars", none, { key: ACCEPTED }).status).toBe("open");
    const noStore = twoCalendars(saved(), "");
    expect(step("google-calendars", noStore, { key: ACCEPTED }).status).toBe("open");
  });

  it("waits for 3.5 before Google is asked", () => {
    const keys: GoogleProbeState["key"][] = [
      undefined,
      { state: "unreadable" },
      { state: "refused", description: CLOCK },
    ];
    for (const key of keys) {
      const view = step("google-calendars", saved(), { key });
      expect(view.status).toBe("watch");
      expect(view.body[0]).toBe("Checked once Google accepts the key at 3.5.");
    }
  });

  it("watches while Google is asked, is unknown when blind", () => {
    const asking = step("google-calendars", saved(), { key: ACCEPTED });
    expect(asking.status).toBe("watch");
    expect(asking.body[0]).toBe("Asking Google whether the service account sees it.");
    const blind = step("google-calendars", saved(), {
      key: ACCEPTED,
      availability: { state: "blind", reason: "no network." },
    });
    expect(blind.status).toBe("unknown");
    expect(blind.body[0]).toBe("Not known whether the service account sees it: no network.");
  });

  it("greens on a share at its need, naming the calendar and nothing more", () => {
    const view = step("google-calendars", saved(), {
      key: ACCEPTED,
      availability: shared("writer"),
    });
    expect(view.status).toBe("green");
    expect(view.body).toEqual([
      "That is your “Vastaanotto” (Europe/Helsinki), shared at “Make changes to events”.",
    ]);
  });

  it("names the service account and each level in Google's words", () => {
    const one = step("google-calendars", saved()).body.join("\n");
    expect(one).toContain(`add ${SA} with “Make changes to events”.`);
    const two = step("google-calendars", twoCalendars(saved())).body.join("\n");
    expect(two).toContain(
      `add ${SA} with “See all event details” on the availability calendar, ` +
        "“Make changes to events” on the booking store.",
    );
    const unknown = step("google-calendars", saved({ clientEmail: "" })).body.join("\n");
    expect(unknown).toContain("add the service account with");
    expect(unknown).toContain("The service account's address shows here once 3.5 has the key.");
  });

  it("links Google Calendar's settings page", () => {
    const settings = "https://calendar.google.com/calendar/u/0/r/settings";
    expect(step("google-calendars", saved()).links).toEqual([
      { label: "Google Calendar settings", href: settings },
    ]);
  });

  it("instructs in the settings page's order: sharing, then the ID further down", () => {
    const body = step("google-calendars", saved()).body;
    const share = body.findIndex((l) =>
      l.includes("Under “Share with specific people or groups”"),
    );
    expect(share).toBeGreaterThanOrEqual(0);
    expect(body[share + 1]).toMatch(/^Then scroll down to “Integrate calendar”/);
  });

  // Failure table, rows 6–10; row 11, the CalDAV API, is the health
  // card's (plan §8, step 5).
  it("asks once for the Calendar API in the key's project, with Google's link", () => {
    const disabled: CalendarProbe = { state: "disabled", activationUrl: ACTIVATE };
    const view = step("google-calendars", twoCalendars(saved()), {
      key: ACCEPTED,
      availability: disabled,
      store: disabled,
    });
    expect(view.status).toBe("red");
    expect(view.body.filter((l) => l.startsWith("Enable"))).toEqual([
      `Enable the Google Calendar API in project ${PROJECT}.`,
    ]);
    expect(view.links[0]).toEqual({ label: "Enable the Google Calendar API", href: ACTIVATE });
  });

  it("links the API's page in the key's project when Google's body has no link", () => {
    const view = step("google-calendars", saved({ projectId: "" }), {
      key: ACCEPTED,
      availability: { state: "disabled", activationUrl: "" },
    });
    expect(view.status).toBe("red");
    expect(view.body[0]).toBe(`Enable the Google Calendar API in project ${PROJECT}.`);
    expect(view.links[0]).toEqual({
      label: "Enable the Google Calendar API",
      href:
        "https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" +
        `?project=${PROJECT}`,
    });
  });

  it("is red on a calendar the service account cannot find", () => {
    const view = step("google-calendars", saved(), {
      key: ACCEPTED,
      availability: { state: "absent" },
    });
    expect(view.status).toBe("red");
    expect(view.body[0]).toBe(
      "Google finds no such calendar for the service account — check the ID, then the sharing.",
    );
  });

  it("is red on a calendar the service account owns", () => {
    const view = step("google-calendars", saved(), {
      key: ACCEPTED,
      availability: shared("owner", SA),
    });
    expect(view.status).toBe("red");
    expect(view.body[0]).toBe(
      "This calendar belongs to the service account, not to you — pick one of your own.",
    );
  });

  it("is red on a store shared only to see events", () => {
    const view = step("google-calendars", twoCalendars(saved()), {
      key: ACCEPTED,
      availability: shared("reader"),
      store: shared("reader"),
    });
    expect(view.status).toBe("red");
    expect(view.body).toContain(
      "Booking store: Shared, but only to see events — " +
        "the booking store needs “Make changes to events”.",
    );
    expect(view.body.join("\n")).not.toContain("Workspace");
  });

  it("is red on free/busy only, naming the Workspace cap as the likely cause", () => {
    const view = step("google-calendars", twoCalendars(saved()), {
      key: ACCEPTED,
      availability: shared("freeBusyReader"),
      store: shared("writer"),
    });
    expect(view.status).toBe("red");
    expect(view.body).toContain(
      "Availability: Shared, but only to see free/busy — " +
        "the availability calendar needs “See all event details”.",
    );
    expect(view.body.join("\n")).toContain(
      "your Google Workspace lets outsiders see free/busy only — an admin loosens it, " +
        "or use a personal Google account.",
    );
  });

  it("holds one calendar for both roles to the store's need, asking after it alone", () => {
    const one = step("google-calendars", saved(), {
      key: ACCEPTED,
      availability: shared("reader"),
      store: { state: "absent" },
    });
    expect(one.status).toBe("red");
    expect(one.body[0]).toBe(
      "Shared, but only to see events — the booking store needs “Make changes to events”.",
    );
    const two = step("google-calendars", twoCalendars(saved()), {
      key: ACCEPTED,
      availability: shared("reader"),
      store: shared("writer"),
    });
    expect(two.status).toBe("green");
  });

  it("greens a share beyond its need, noting it after the verdicts", () => {
    const view = step("google-calendars", twoCalendars(saved()), {
      key: ACCEPTED,
      availability: shared("writer"),
      store: shared("owner"),
    });
    expect(view.status).toBe("green");
    expect(view.body).toEqual([
      "Availability: That is your “Vastaanotto” (Europe/Helsinki), shared at " +
        "“Make changes to events”.",
      "Booking store: That is your “Vastaanotto” (Europe/Helsinki), shared at " +
        "“Make changes and manage sharing”.",
      "Availability: Shared beyond its need: “Make changes to events” where “See all event " +
        "details” would do — a leaked key could change its events.",
      "Booking store: Shared beyond its need: “Make changes and manage sharing” where " +
        "“Make changes to events” would do — a leaked key could re-share the calendar.",
    ]);
  });

  it("wears the worst of its rows", () => {
    const blind: CalendarProbe = { state: "blind", reason: "no network." };
    const status = (store: CalendarProbe) =>
      step("google-calendars", twoCalendars(saved()), { key: ACCEPTED, availability: blind, store })
        .status;
    expect(status({ state: "absent" })).toBe("red");
    expect(status(shared("writer"))).toBe("unknown");
  });

  it("says its state in a few words, nothing while an ID is missing", () => {
    const none = saved({ calendarIds: { availability: "", store: "" } });
    const disabled: CalendarProbe = { state: "disabled", activationUrl: ACTIVATE };
    const two = {
      key: ACCEPTED,
      availability: shared("reader"),
      store: shared("writer", OWNER, "Varaukset"),
    };
    const cases: [Saved, GoogleProbeState, string | undefined][] = [
      [none, { key: ACCEPTED }, undefined],
      [saved(), { key: { state: "unreadable" } }, "Waiting for the key"],
      [saved(), { key: ACCEPTED }, "Asking Google"],
      [saved(), { key: ACCEPTED, availability: { state: "blind", reason: "x." } }, NOT_KNOWN],
      [saved(), { key: ACCEPTED, availability: disabled }, "The Calendar API is off"],
      [saved(), { key: ACCEPTED, availability: { state: "absent" } }, "A calendar needs fixing"],
      [saved(), { key: ACCEPTED, availability: shared("writer") }, "Shared: “Vastaanotto”"],
      [twoCalendars(saved()), two, "Shared: “Vastaanotto”, “Varaukset”"],
    ];
    for (const [s, probes, state] of cases) {
      expect(step("google-calendars", s, probes).state).toBe(state);
    }
  });
});

describe("3.7 back", () => {
  it("is open while anything before it is unsettled, naming what", () => {
    const view = step("google-back", saved({}, TICKED), { key: ACCEPTED });
    expect(view.status).toBe("open");
    expect(view.body).toEqual(["Still to settle: 3.6 Calendars."]);
    expect(view.state).toBeUndefined();
  });

  it("sums up two calendars by role", () => {
    const view = step("google-back", twoCalendars(saved({}, TICKED)), {
      key: ACCEPTED,
      availability: shared("reader"),
      store: shared("writer", OWNER, "Varaukset"),
    });
    expect(view.status).toBe("green");
    expect(view.body).toEqual([
      `Service account: ${SA}.`,
      "Availability: “Vastaanotto”.",
      "Booking store: “Varaukset”.",
    ]);
    expect(view.state).toBe("All settled");
  });
});

describe("Done", () => {
  it("is offered on 3.5 and 3.6 until each is green, and nowhere else", () => {
    expect(step("google-key", saved()).check).toBe(true);
    const refused = { key: { state: "refused", description: "Invalid grant" } as const };
    expect(step("google-key", saved(), refused).check).toBe(true);
    expect(step("google-key", saved(), { key: ACCEPTED }).check).toBe(false);
    expect(step("google-calendars", saved()).check).toBe(true);
    expect(step("google-calendars", saved(), { key: ACCEPTED }).check).toBe(true);
    const green = { key: ACCEPTED, availability: shared("writer") };
    expect(step("google-calendars", saved(), green).check).toBe(false);
    for (const id of [...ATTESTED, "google-back"]) {
      expect(step(id, saved(), green).check).toBeUndefined();
    }
  });
});

describe("caldavAddress", () => {
  it("encodes the ID's @ as %40", () => {
    expect(caldavAddress(AVAILABILITY)).toBe(
      "https://apidata.googleusercontent.com/caldav/v2/" +
        "c_0a1b2c3d4e5f%40group.calendar.google.com/events/",
    );
  });

  it("reduces back to the ID through the calendar-ID validator", () => {
    for (const id of [AVAILABILITY, "anna@gmail.com"]) {
      expect(VALIDATORS["googleCalendarId"]!(caldavAddress(id))).toEqual({ ok: true, value: id });
    }
  });
});
