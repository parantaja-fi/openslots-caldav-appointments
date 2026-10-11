import { afterEach, describe, expect, it, vi } from "vitest";
import { WORK_NAME, tile } from "../src/workWindow";

const LAPTOP = { availWidth: 1440, availHeight: 875 };
const URL_A = "https://github.com/signup";
const URL_B = "https://dash.cloudflare.com/sign-up";

/** A stand-in for the window window.open hands back; it records where it was sent. */
function fakeWindow() {
  const w = {
    closed: false,
    focused: 0,
    visits: [] as string[],
    location: {
      set href(url: string) {
        w.visits.push(`assign ${url}`);
      },
      replace(url: string) {
        w.visits.push(`replace ${url}`);
      },
    },
    focus() {
      w.focused++;
    },
  };
  return w;
}

/** A browser whose window.open answers from `answers` in turn; returns the calls made. */
function browser(answers: (ReturnType<typeof fakeWindow> | null)[], { availWidth = 1440, fine = true } = {}) {
  const calls: string[][] = [];
  vi.stubGlobal("window", {
    open: (...args: string[]) => {
      calls.push(args);
      return answers.shift() ?? null;
    },
  });
  vi.stubGlobal("screen", { ...LAPTOP, availWidth });
  vi.stubGlobal("matchMedia", () => ({ matches: fine }));
  return calls;
}

// The handle lives in module scope, as it must: each test loads the
// module afresh.
async function load() {
  vi.resetModules();
  return import("../src/workWindow");
}

afterEach(() => vi.unstubAllGlobals());

describe("tile", () => {
  it("gives the work window the right 60 % of the screen", () => {
    expect(tile(LAPTOP)).toBe("popup=yes,left=576,top=0,width=864,height=875");
  });

  it("follows a screen that does not start at the origin — a second display, a menu bar", () => {
    expect(tile({ availWidth: 1920, availHeight: 1055, availLeft: 1440, availTop: 25 })).toBe(
      "popup=yes,left=2208,top=25,width=1152,height=1055",
    );
  });
});

describe("show", () => {
  it("opens the window on the first link, beside the wizard, without an about:blank in its history", async () => {
    const w = fakeWindow();
    const calls = browser([w]);
    const { show } = await load();
    expect(show(URL_A)).toBe("created");
    expect(calls).toEqual([["", WORK_NAME, tile(LAPTOP)]]);
    expect(w.visits).toEqual([`replace ${URL_A}`]);
    expect(w.focused).toBe(1);
  });

  it("navigates the same window on later links, opening nothing new", async () => {
    const w = fakeWindow();
    const calls = browser([w]);
    const { show } = await load();
    show(URL_A);
    expect(show(URL_B)).toBe("reused");
    expect(calls).toHaveLength(1);
    expect(w.visits).toEqual([`replace ${URL_A}`, `assign ${URL_B}`]);
    expect(w.focused).toBe(2);
  });

  it("says when pop-ups are refused, and keeps no handle", async () => {
    const w = fakeWindow();
    const calls = browser([null, w]);
    const { show } = await load();
    expect(show(URL_A)).toBe("blocked");
    expect(show(URL_A)).toBe("created");
    expect(calls).toHaveLength(2);
  });

  it("opens afresh once the window has gone — closed by hand, or cut loose by its page", async () => {
    const [first, second] = [fakeWindow(), fakeWindow()];
    const calls = browser([first, second]);
    const { show } = await load();
    show(URL_A);
    first.closed = true;
    expect(show(URL_B)).toBe("created");
    expect(calls).toHaveLength(2);
    expect(first.visits).toEqual([`replace ${URL_A}`]);
    expect(second.visits).toEqual([`replace ${URL_B}`]);
  });

  it("asks for a plain tab, no placement, on a narrow screen or without a fine pointer", async () => {
    let calls = browser([fakeWindow()], { availWidth: 1024 });
    (await load()).show(URL_A);
    expect(calls[0]?.[2]).toBe("");
    calls = browser([fakeWindow()], { fine: false });
    (await load()).show(URL_A);
    expect(calls[0]?.[2]).toBe("");
  });
});

describe("reveal", () => {
  it("brings the window forward, leaving its page alone", async () => {
    const w = fakeWindow();
    const calls = browser([w]);
    const { show, reveal } = await load();
    show(URL_A);
    reveal();
    expect(w.focused).toBe(2);
    expect(w.visits).toEqual([`replace ${URL_A}`]);
    expect(calls).toHaveLength(1);
  });

  it("reopens the last page shown once the window has gone", async () => {
    const [first, second] = [fakeWindow(), fakeWindow()];
    browser([first, second]);
    const { show, reveal } = await load();
    show(URL_A);
    show(URL_B);
    first.closed = true;
    reveal();
    expect(second.visits).toEqual([`replace ${URL_B}`]);
  });
});
