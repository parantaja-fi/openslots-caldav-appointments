// The work window: one window beside the wizard in which every outside
// page opens — GitHub, Cloudflare, the calendar, Brevo — each link
// navigating it instead of stacking up tabs, so the instructions and the
// page they speak of stay side by side (spike/TASK.md, spike/RESULTS.md).
//
// The first show() opens the window and spends the click's activation on
// it: show() runs synchronously inside the click handler, with nothing
// awaited before it, or the pop-up blocker refuses. Later calls only
// navigate the window and need no activation. After a reload the handle
// is gone, and window.open("", name) finds the window again by its name
// without navigating it.
//
// Handle and name both rest on the opener link. target="_blank", a name
// per link and rel="noopener" (which "noreferrer" implies) each cut it,
// and every link would open a tab of its own again: outside links here
// carry none of them. The price is that a page in the work window can
// navigate the wizard's tab through window.opener, though never read it.
//
// A page sending Cross-Origin-Opener-Policy — Cloudflare's dashboard —
// cuts the link from its side in Chromium (Safari keeps it): the handle
// reads closed and the name is cleared, so the next link opens a fresh
// window in the same place and the old one stays behind.

export const WORK_NAME = "booking-wizard-work";

// The wizard keeps the left 40 % of the screen; the work window takes
// the rest.
const WIZARD_FRACTION = 0.4;

/** The screen's usable area. availLeft and availTop are non-standard, though every desktop browser has them. */
export interface ScreenArea {
  availWidth: number;
  availHeight: number;
  availLeft?: number;
  availTop?: number;
}

/** The work window's box: the right of the screen, beside the wizard. */
export function workBox(s: ScreenArea): { left: number; top: number; width: number; height: number } {
  const wizard = Math.round(s.availWidth * WIZARD_FRACTION);
  return {
    left: (s.availLeft ?? 0) + wizard,
    top: s.availTop ?? 0,
    width: s.availWidth - wizard,
    height: s.availHeight,
  };
}

/** Window features placing the work window on the right of the screen. */
export function tile(s: ScreenArea): string {
  const b = workBox(s);
  return `popup=yes,left=${b.left},top=${b.top},width=${b.width},height=${b.height}`;
}

// Phones and tablets have no windows to place: there the work window is
// a tab — still one, reused by name.
function tiled(): boolean {
  return screen.availWidth >= 1100 && matchMedia("(pointer: fine)").matches;
}

// Module scope, never the saved state: a handle does not serialise.
let work: Window | null = null;
let lastUrl = "";

export type Shown = "reused" | "created" | "blocked";

/** Shows url in the work window — from inside a click handler only (above). */
export function show(url: string): Shown {
  lastUrl = url;
  if (work && !work.closed) {
    work.location.href = url;
    work.focus();
    return "reused";
  }
  const w = window.open("", WORK_NAME, tiled() ? tile(screen) : "");
  if (!w) return "blocked";
  if (tiled()) {
    // Safari ignores the features' geometry and clones the opener's
    // frame; placing the still-blank window by hand is exact in every
    // engine measured, and a tab ignores it (spike/RESULTS.md).
    const b = workBox(screen);
    w.moveTo(b.left, b.top);
    w.resizeTo(b.width, b.height);
  }
  w.location.replace(url); // a fresh window's about:blank leaves no history entry
  w.focus();
  work = w;
  return "created";
}

/** Brings the work window forward, reopening the last page shown if the window has gone — after a show(), and inside a click handler like it. */
export function reveal(): void {
  if (work && !work.closed) work.focus();
  else show(lastUrl);
}
