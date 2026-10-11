# Task: two-window layout for the parantaja.fi configuration wizard

Status: ready for implementation. Two phases; phase 2 starts only after the phase-1 gate below is passed by the project owner.

## 0. Goal

Make the wizard run in **two tiled browser windows**: the wizard (instructions) on one side, and a single **work window** on the other, in which the wizard shows each step's external page (GitHub, Cloudflare, calendar provider, Brevo, DNS, …). One work window for the whole session: each step **navigates** it instead of opening a new tab. No new tabs, no manual window arranging by the end user.

Scope is "option 1" of a design discussion: plain `window.open` with a constant window name and window features. Do **not** build the alternatives (Document Picture-in-Picture, browser extension, iframe/proxy, native app); they are out of scope.

## 1. Background

The wizard is an SPA that walks a non-technical end user through creating accounts and minting API keys on third-party sites. Most steps are "do this on that website". The end user needs to see the instruction and the site **at the same time**. Today every step opens a new tab (`target="_blank"` or equivalent), so tabs accumulate, and the user has to drag a tab out into a second window by hand if they want side-by-side.

An earlier attempt concluded this cannot be done reliably. That conclusion was wrong: the needed primitive is old and standard. What makes it look unreliable are four specific mistakes, listed in §5. Avoid them and it works in Chrome, Edge, Firefox and Safari on desktop.

## 2. Facts the implementation relies on (do not re-derive; verify the ones marked *verify*)

Window creation and reuse

- `window.open(url, NAME, features)` with a non-empty `features` string creates a **separate window** (a "popup": no tab strip, read-only URL display), not a tab. Per the HTML spec, any non-empty features string without `location=yes,toolbar=yes` already means popup; add `popup=yes` to make it explicit (Chrome ≥ 99 recognises the keyword).
- `left`, `top`, `width`, `height` features position and size the new window. `width`/`height` are content size; the browser adds its own chrome and clamps to the screen. `screen.availWidth/availHeight/availLeft/availTop` describe the usable area of the screen the opener is on (`availLeft/availTop` are non-standard but implemented by all four desktop browsers; default them to 0).
- A later `window.open(url, NAME, …)` with the **same NAME** navigates the existing window instead of creating one, and returns its `WindowProxy`. *Verify:* `window.open('', NAME, features)` (empty URL) returns the existing window **without** navigating it — this is the classic way to re-acquire a handle after the opener page reloads.
- The opener keeps a `WindowProxy` handle (call it `work`). Across origins it may still: assign `work.location.href`, call `work.location.replace()`, `work.focus()`, `work.close()`, `work.postMessage()`, and read `work.closed`. Reading `work.location.href` or anything else throws `SecurityError`.
- Navigating an existing window via the handle (`work.location.href = url`) does **not** involve the popup blocker and needs no user gesture. Creating a window does: the creating `window.open` must run synchronously inside a user-gesture handler (click), with nothing awaited before it. Chrome's transient activation lasts ~5 s; an `await fetch()` before `window.open` is the usual cause of "blocked sometimes".
- One `window.open` consumes the activation. Two new windows need two clicks.
- Windows opened by script can be closed by script (`work.close()`), also after cross-origin navigation (*verify*). An ordinary tab cannot close itself unless its history has a single entry.
- `resizeTo`/`moveTo` work only on windows that were opened by script and contain a single tab. Hence the wizard can only be tiled automatically if it, too, runs in a script-opened window (§4.2).
- Popups survive their opener closing. The end user may close the original tab after relocation.

Cross-Origin-Opener-Policy (COOP) — the one real failure mode

- If a page loaded in the work window sends `Cross-Origin-Opener-Policy: same-origin` or `same-origin-allow-popups`, the browser moves it to a new browsing-context group. Consequences: `work.closed` becomes `true` even though the window is visibly open, `window.opener` in it becomes `null`, and the window's **name is cleared**, so name-based reuse also fails. Handle and name are both gone for good.
- Degradation: the next step creates a fresh work window at the same place; the old one stays behind and cannot be closed by script. If a provider sends COOP on *every* page, each deep link into that provider will create a new window.
- Which providers do this must be measured (phase 1). Unverified recollection: Google account pages send it; github.com does not; Cloudflare and Brevo unknown. Measure, do not assume.
- Top-level cross-origin navigation clears `window.name` only for windows **without** an opener. The work window has an opener, so its name survives ordinary navigation; only COOP (which removes the opener) clears it.

Other

- `sessionStorage` is only *copied* into a script-opened window at creation; do not rely on it for state shared between the original tab and a relocated wizard. Use `localStorage` (or whatever the wizard already persists to).
- The target site sees `window.opener` (reverse-tabnabbing exposure: it could navigate the wizard). Accepted for these providers; `noopener` would destroy the design.
- Firefox default `browser.link.open_newwindow.restriction = 2`: features ⇒ new window. Safari: popups allowed only from user gestures; fine.
- Mobile browsers have no windows. Out of scope; keep current behaviour there (§4.5).

## 3. Phase 1 — spike

Deliverable: one static page, `spike/two-window.html` (plain HTML + JS, no build step, no dependencies), plus `spike/RESULTS.md` as a blank results table for the project owner to fill in. The project owner runs the spike; you cannot observe popups yourself. Serve it over `http://localhost:…` (project dev server or `python3 -m http.server`), **not** `file://`.

### 3.1 Targets

Extract every external URL the wizard currently opens (grep for `window.open`, `target=`, `rel="noopener"`, `href` to foreign origins in step definitions) and put them, with a short label each, into a `TARGETS` array at the top of the spike. Include the provider login/entry pages even if the wizard deep-links past them. Add a free-text URL field for ad-hoc tests.

### 3.2 Core code (use verbatim in the spike; port to TypeScript in phase 2)

```js
const WORK_NAME       = 'parantaja-work';
const WIZARD_NAME     = 'parantaja-wizard';
const WIZARD_FRACTION = 0.4;   // wizard gets 40 % of the width, the work window the rest

function tile(side /* 'wizard' | 'work' */) {
  const total  = screen.availWidth;
  const left0  = screen.availLeft ?? 0;
  const top0   = screen.availTop  ?? 0;
  const wizard = Math.round(total * WIZARD_FRACTION);
  const left   = side === 'wizard' ? left0  : left0 + wizard;
  const width  = side === 'wizard' ? wizard : total - wizard;
  return `popup=yes,left=${left},top=${top0},width=${width},height=${screen.availHeight}`;
}

let work = null;   // WindowProxy of the work window. Module-level; never component state.

/**
 * Show `url` in the work window. MUST be called synchronously from a click handler
 * (nothing awaited before it): the first call creates the window and needs the gesture.
 * Returns 'reused' | 'created' | 'blocked'.
 */
function showInWorkWindow(url) {
  const alive = work !== null && !work.closed;
  const w = alive ? work : window.open('', WORK_NAME, tile('work')); // existing window found by name, or a fresh blank one
  if (w === null) return 'blocked';                                    // popup blocker
  if (alive) w.location.href = url;                                    // cross-origin assignment is permitted
  else       w.location.replace(url);                                  // no history entry for about:blank
  w.focus();
  work = w;
  return alive ? 'reused' : 'created';
}

/** Move this page into a script-sized window so it can be tiled. One click; returns 'already' | 'blocked' | 'relocated'. */
function relocateWizard() {
  if (window.name === WIZARD_NAME) return 'already';
  const w = window.open(location.href, WIZARD_NAME, tile('wizard'));
  return w === null ? 'blocked' : 'relocated';
}
```

### 3.3 Spike UI

Keep it to one screen; large buttons; no styling beyond legibility.

1. "Relocate this page to the left part of the screen" — calls `relocateWizard()`; after success show "continue in the new window" in the original tab (the page knows it is the relocated copy from `window.name`).
2. One button per `TARGETS` entry, plus the free-text field with "Open" — all call `showInWorkWindow(url)` and log the return value.
3. "Focus work window" (`work?.focus()`), "Close work window" (`work?.close()`), "Forget handle" (`work = null`, to test re-acquisition by name on the next click), "Re-tile this window" (`window.moveTo/resizeTo` from `tile('wizard')`, only meaningful after relocation).
4. Status panel, polled every 500 ms: handle `none / alive / lost`, and a log with timestamps. After each navigation, log the handle state again 3 s later with the text "lost within 3 s of navigating ⇒ probably COOP on that page (unless you closed it)".
5. A short in-page checklist of what to observe (copy of §3.4).

### 3.4 Test protocol (goes into `spike/RESULTS.md`)

Browsers: Chrome and Firefox at minimum; Edge and Safari if available; note OS.

Per browser, one table with a row per target and these columns: opened as a separate window (not a tab)? · reused the same window on the second click? · placed on the right part of the screen? · handle alive after the page loaded? · COOP header on that page (DevTools in the work window: F12 or right-click → Inspect → Network → the document request → response headers; or `curl -sI -A Mozilla/5.0 URL | grep -i opener` from a normal machine) · notes (login persisted, page rendered correctly, anything odd).

Then these scenario rows per browser:

- Relocation: page moves to the left part; the relocated copy can create the work window (popup-from-popup) and it lands on the right part.
- Reload: press F5 in the (relocated) spike, click a target: is the existing work window reused (no second window)? This tests re-acquisition by name after the handle is lost.
- Forget handle + click: same expectation as reload.
- User closes the work window, then clicks a target: a new work window appears at the same place.
- Close button: `work.close()` closes the window after it has been on a foreign origin.
- Popups blocked (disable pop-ups for the site in browser settings): buttons return `blocked`, nothing else breaks.
- Empty-URL open: does `window.open('', NAME, …)` ever blank an existing window? (It must not; if it does in some browser, fall back to `window.open(url, NAME, tile('work'))`, which navigates and reuses.)
- Visual: the two windows do not overlap at 1366×768 and at 1920×1080; the wizard's own layout is usable at 40 % width.

### 3.5 Gate (project owner decides)

Phase 2 proceeds when, in Chrome and one other browser: separate-window, reuse, placement and relocation all work; and the list of COOP-severing pages is known. For each severing provider, the owner chooses: (a) accept one leftover window and add a "you may close the old window" instruction; (b) link only to that provider's entry page and describe in-site navigation in the step text; (c) move that provider to the end of the sequence. Record the choice in `RESULTS.md`; it drives the step content in phase 2.

## 4. Phase 2 — integrate into the wizard

### 4.1 `WorkWindow` module

One module (`workWindow.ts` or the project's equivalent), framework-agnostic, exporting:

- `tile(side)`, pure, unit-tested with a fake `screen`.
- `show(url): 'reused' | 'created' | 'blocked'` — §3.2 semantics; document the synchronous-gesture requirement in a comment that will survive refactoring.
- `focus()`, `close()`, `state(): 'none' | 'alive' | 'lost'` — `lost` means handle exists but `closed === true` (user closed it, or COOP).
- `subscribe(listener)` — polls `closed` at ~1 s while a handle exists, notifies on transitions, so the UI can show a "Show the work window" button state.
- `relocateWizard()` and `isRelocated()` (`window.name === WIZARD_NAME`).

The handle lives in module scope. Never put a `WindowProxy` in React/Vue/Svelte state or in any serialised store.

### 4.2 Start flow

On "Start" (one click): if desktop (§4.5) and not already relocated, call `relocateWizard()`.

- `'relocated'`: the original tab renders only a static notice ("The wizard continues in its own window") with a "Bring it to the front" button (`wizardWindow.focus()`) and, if that window was closed, a button that calls `relocateWizard()` again. The SPA must do nothing else in the original tab. Wizard state must already be in persistent storage before relocation, or relocation must happen before any state exists.
- `'blocked'`: show, once, how to allow pop-ups for this site in the user's browser (one short hint per browser family, detected from the user agent; keep it to one sentence) and how to snap this window to the left manually (Windows: Win+←; macOS: drag to the left screen edge, or Window ▸ Move & Resize). Then continue in-tab. The work window still opens on the right.

In the relocated window, offer a small "Tile windows" control that re-applies `tile('wizard')` to itself via `moveTo`/`resizeTo` (the work window cannot be re-tiled from outside; it is re-created in place if closed).

### 4.3 Step pages

Every "Open <site>" action calls `WorkWindow.show(url)` synchronously from the click. Remove all `target="_blank"`, `rel="noopener"`, `rel="noreferrer"` and ad-hoc `window.open` for step links. Add a persistent "Show the work window" button in the wizard chrome (`focus()`; if `state()` is `lost`/`none`, re-`show()` the current step's URL).

When `show()` returns `'blocked'`, render the step's link as a plain anchor `<a href="…" target="parantaja-work">` (no `rel`): a user click on a named-target link is not popup-blocked, opens a tab the first time and reuses it by name afterwards. Tabs then do not multiply even without pop-up permission; only auto-tiling is lost.

Apply the per-provider decisions from the gate (§3.5) to the step texts.

### 4.4 Audit existing window usage

Before changing anything, list every existing `window.open`, `target`, OAuth popup or redirect flow in the wizard. If a step already uses an OAuth popup, give it a different name; if a step relies on the wizard tab itself being redirected and back, confirm it still works from the relocated window (it should: it is an ordinary window).

### 4.5 Desktop detection

Treat as desktop when `screen.availWidth >= 1100` and the primary pointer is fine (`matchMedia('(pointer: fine)')`). Otherwise skip relocation and tiling, but still route step links through named reuse (`show()` without features is acceptable there, or the anchor fallback), so tabs do not multiply on mobile either.

### 4.6 Tests and acceptance

Unit tests: `tile()` for both sides and for non-zero `availLeft/availTop`; state transitions of the module with a fake `window.open` returning `null`, a live object and a closed one.

Manual: re-run the §3.4 tables against the integrated wizard in Chrome and one other browser.

Accept when:

1. A full wizard run in Chrome creates **no** new tabs and at most one work window per non-severing provider.
2. After "Start" with pop-ups allowed, wizard and work windows are tiled automatically; with pop-ups blocked, the user is told once what to do and every step remains completable.
3. Closing the work window and clicking the next step re-creates it in place; reloading the wizard does not produce a second work window (if the spike confirmed name re-acquisition; otherwise re-creation in place is acceptable).
4. `grep` finds no `_blank`, `noopener` or `noreferrer` on step links; the module comments explain why they must not come back.
5. Mobile behaviour is no worse than today.
6. Code quality: TypeScript strict, no `any`, small pure functions where possible, the browser-touching surface thin and isolated in the module.

## 5. Do not

- Do not use `_blank`, a per-step name, or `noopener`/`noreferrer` in features or `rel` — each one of these turns every step into a new tab or window and discards the handle. (`noreferrer` implies `noopener`.)
- Do not `await` anything between the click and the creating `window.open`.
- Do not read `work.location` or any other cross-origin property; only `closed`, `location` assignment/`replace`, `focus`, `close`, `postMessage`.
- Do not store the handle in component state or serialise it.
- Do not try `resizeTo`/`moveTo` on an ordinary tab; it silently does nothing.
- Do not add COOP headers to the wizard's own responses as a "fix"; they do not protect against the opener exposure and `same-origin` would break the design.
- Do not build Picture-in-Picture, extension, split-view triggers, proxies or iframes.

## 6. Open points for the project owner

- `WIZARD_FRACTION`: 0.4 proposed; adjust after seeing the wizard at that width.
- Wording of the pop-up hint and the "continue in the new window" notice (wizard's UI language).
- Per-provider COOP decisions (§3.5).
