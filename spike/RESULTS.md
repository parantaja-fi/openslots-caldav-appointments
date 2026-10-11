# Two-window spike — results

The spike is `two-window.html`; the protocol is §3.4 of `TASK.md`, and
the page carries its checklist. Serve the repository root over http,
not `file://`:

    python3 -m http.server 8765 -b 127.0.0.1

then open <http://127.0.0.1:8765/spike/two-window.html>. Answer with ✓,
✗ or a few words. Copy a section for Edge if it is at hand.

## Measured beforehand

COOP headers by curl, signed out, 2026-10-11. A redirect hop's header
counts as much as the final page's. Signed-in pages may differ: confirm
in DevTools.

| Targets | COOP |
|---|---|
| Cloudflare sign-in, signup, create API token | `same-origin` — severs |
| Google sign-in, Google Calendar | report-only (`same-origin`, `same-origin-allow-popups`) — does not sever |
| GitHub, Brevo, Nextcloud, Worker health, booking page | none |

GitHub's signup page answered curl with a bot screen; its settings pages
answer 404 when signed out. Neither carried COOP.

Headless Chromium (Playwright), same day: the first click created the
window and the second reused it; after Forget handle and after a reload
it was re-acquired by name; the empty-URL open left its page alone;
Cloudflare's signup cut the handle within 3 s, leaving its window open,
and the next click created a fresh one; Close closed a window that had
shown a foreign page; a gesture-less open with no work window was
blocked; relocation worked, and the relocated copy created the work
window. Placement, focus and real sign-ins need a person.

## Chrome ___ on macOS ___

| Target | Separate window? | Reused on the second click? | On the right part? | Handle alive after load? | COOP header | Notes |
|---|---|---|---|---|---|---|
| GitHub sign-in | | | | | | |
| GitHub signup | | | | | | |
| Fork the upstream | | | | | | |
| The fork | | | | | | |
| SETUP.md | | | | | | |
| Mint an access token | | | | | | |
| Access tokens (revoke) | | | | | | |
| Fork: secrets | | | | | | |
| Fork: variables | | | | | | |
| Fork: Pages settings | | | | | | |
| Fork: Actions → Deploy | | | | | | |
| Cloudflare sign-in | | | | | | |
| Cloudflare signup | | | | | | |
| Cloudflare: create API token | | | | | | |
| Nextcloud sign-in | | | | | | |
| Nextcloud: calendars | | | | | | |
| Nextcloud: app passwords | | | | | | |
| Google sign-in | | | | | | |
| Google Calendar | | | | | | |
| Brevo sign-in | | | | | | |
| Brevo signup | | | | | | |
| Brevo: API keys | | | | | | |
| Worker health (upstream) | | | | | | |
| Booking page (walk fork) | | | | | | |

| Scenario | Result | Notes |
|---|---|---|
| Relocation: moves left; the relocated copy creates the work window, on the right | | |
| Reload, then a target: re-acquired by name, no second window | | |
| Forget handle, then a target: the same | | |
| Work window closed by hand, then a target: created in the same place | | |
| Close work window, after a foreign page: it closes | | |
| Pop-ups blocked (the 8 s button, no work window open): `blocked`, nothing else breaks | | |
| Empty-URL open (“Re-acquire by name”): the work window’s page stays | | |
| No overlap at 1366×768 | | |
| No overlap at 1920×1080 | | |
| The wizard usable at 40 % width | | |

The COOP header is the server's, so the Chrome table's column serves all
browsers.

## Firefox ___ on macOS ___

| Target | Separate window? | Reused on the second click? | On the right part? | Handle alive after load? | Notes |
|---|---|---|---|---|---|
| GitHub sign-in | | | | | |
| GitHub signup | | | | | |
| Fork the upstream | | | | | |
| The fork | | | | | |
| SETUP.md | | | | | |
| Mint an access token | | | | | |
| Access tokens (revoke) | | | | | |
| Fork: secrets | | | | | |
| Fork: variables | | | | | |
| Fork: Pages settings | | | | | |
| Fork: Actions → Deploy | | | | | |
| Cloudflare sign-in | | | | | |
| Cloudflare signup | | | | | |
| Cloudflare: create API token | | | | | |
| Nextcloud sign-in | | | | | |
| Nextcloud: calendars | | | | | |
| Nextcloud: app passwords | | | | | |
| Google sign-in | | | | | |
| Google Calendar | | | | | |
| Brevo sign-in | | | | | |
| Brevo signup | | | | | |
| Brevo: API keys | | | | | |
| Worker health (upstream) | | | | | |
| Booking page (walk fork) | | | | | |

| Scenario | Result | Notes |
|---|---|---|
| Relocation: moves left; the relocated copy creates the work window, on the right | | |
| Reload, then a target: re-acquired by name, no second window | | |
| Forget handle, then a target: the same | | |
| Work window closed by hand, then a target: created in the same place | | |
| Close work window, after a foreign page: it closes | | |
| Pop-ups blocked (the 8 s button, no work window open): `blocked`, nothing else breaks | | |
| Empty-URL open (“Re-acquire by name”): the work window’s page stays | | |
| No overlap at 1366×768 | | |
| No overlap at 1920×1080 | | |
| The wizard usable at 40 % width | | |

## Safari ___ on macOS ___

Quick run by the owner, 2026-10-11, the targets in an order of their
own. Every page worked, Cloudflare's included. The log: the first click
created the window and every later one reused it, and the handle was
alive 3 s after each page — Safari does not cut it on Cloudflare's COOP,
where Chromium does. Close closed the window after foreign pages. Tiling
did not work as intended — resolved: Safari ignores the features'
geometry, see "Geometry" below. Reload, forget, blocked and empty-URL
runs were not recorded.

| Target | Separate window? | Reused on the second click? | On the right part? | Handle alive after load? | Notes |
|---|---|---|---|---|---|
| GitHub sign-in | | created it (first click) | | ✓ | |
| GitHub signup | | ✓ | | ✓ | |
| Fork the upstream | | ✓ | | ✓ | |
| The fork | | ✓ | | ✓ | |
| SETUP.md | | ✓ | | ✓ | |
| Mint an access token | | ✓ | | ✓ | |
| Access tokens (revoke) | | ✓ | | ✓ | |
| Fork: secrets | | ✓ | | ✓ | |
| Fork: variables | | ✓ | | ✓ | |
| Fork: Pages settings | | ✓ | | ✓ | |
| Fork: Actions → Deploy | | ✓ | | ✓ | |
| Cloudflare sign-in | | ✓ | | ✓ | |
| Cloudflare signup | | ✓ | | ✓ | |
| Cloudflare: create API token | | ✓ | | ✓ | |
| Nextcloud sign-in | | ✓ | | ✓ | |
| Nextcloud: calendars | | ✓ | | ✓ | |
| Nextcloud: app passwords | | ✓ | | ✓ | |
| Google sign-in | | ✓ | | ✓ | |
| Google Calendar | | ✓ | | ✓ | |
| Brevo sign-in | | ✓ | | ✓ | |
| Brevo signup | | ✓ | | ✓ | |
| Brevo: API keys | | ✓ | | ✓ | |
| Worker health (upstream) | | ✓ | | ✓ | |
| Booking page (walk fork) | | ✓ | | ✓ | |

| Scenario | Result | Notes |
|---|---|---|
| Relocation: moves left; the relocated copy creates the work window, on the right | ✗/✓ | both opened at their opener's frame (geometry below); Re-tile then placed the copy exactly |
| Reload, then a target: re-acquired by name, no second window | | |
| Forget handle, then a target: the same | | |
| Work window closed by hand, then a target: created in the same place | | |
| Close work window, after a foreign page: it closes | ✓ | after the booking page |
| Pop-ups blocked (the 8 s button, no work window open): `blocked`, nothing else breaks | | |
| Empty-URL open (“Re-acquire by name”): the work window’s page stays | | |
| No overlap at 1366×768 | | |
| No overlap at 1920×1080 | | |
| The wizard usable at 40 % width | | |

## Geometry: where does the work window land?

The owner's Safari run put the work window somewhere other than the
planned right-hand box ("tiling did not work as intended"). The probes
(spike/geometry.html, the three Probe buttons) measure it: a same-origin
page reports its real position and size into the spike's log, each line
ending `Δ actual − planned`, and into its title, which AppleScript reads
as the window's name. Two candidate fixes are measured alongside:
moveTo/resizeTo on the still-blank window before it navigates — the one
a production work window allows, since it is cross-origin from the first
page on — and moveTo/resizeTo on the loaded same-origin probe.

Chromium 141 headed, macOS 26 (2026-10-11, screen available 2336×1465 at
0,45): Δ 0,0 0×0 on creation, after probe-fix and after probe-move — the
features string is honoured exactly, and both corrections hold.

What is documented for Safari (WebKit source, wpt.fyi stable runs
17–27, WebKit bugs 23603/259093/263759/270532, Apple's guides;
researched 2026-10-11): on a single display the requested left/top are
honoured exactly; width/height mean the inner size, and the height
comes out 28–32 px short of the request after clamping to the screen's
usable area — cosmetic here. `popup=yes` adds nothing; the geometry
keys alone make it a popup. Three ways the placement genuinely goes
astray: the "Open pages in tabs instead of windows" setting on Always
turns the popup into a tab and geometry is ignored (Safari refuses to
move or size any window with more than one tab, deliberately, bug
23603); Private Browsing's fingerprinting protection fakes the numbers
(screenX/availLeft read 0, outer equals inner), so boxes computed from
them land wrong; and with several displays, x is global but y and the
clamping are measured per screen, arrangement-dependent — MDN calls the
coordinate origin unreliable. The opener may moveTo/resizeTo the popup
while it still sits on about:blank (same origin; verified by WPT for
resizeTo in 17–27), though in the same task as window.open it may race
the initial placement; once the popup has navigated cross-origin the
call throws. No gesture is needed, only a top-level frame and no mouse
button held down.

Safari 26.6.2, measured 2026-10-11 on the one built-in display (screen
available 2336×1465 at 0,45; normal browsing, not private), via
spike/safari-driver.sh — it needs Automation → Safari, "Allow
JavaScript from Apple Events", and Accessibility for the real Return
press; each prompt is charged to the app hosting the shell, and until
answered the Apple Event times out at two minutes with −1712:

- **The features' geometry is ignored, with and without a user
  activation** — contradicting the wpt.fyi runs, which exercise
  WebKit's machinery, not Safari's window policy. The new window clones
  the opener's frame: created from the full-width spike, the probe read
  `Δ -934,0 232×0` — the opener's own position and size — for a real
  Return press and a scripted click alike. Pop-ups, incidentally, were
  not blocked even without the activation.
- **moveTo/resizeTo on the still-blank window before navigating is
  exact**: probe-fix read `Δ 0,0 0×0` on every run, with activation and
  without. resizeTo sets the outer size in both engines (Safari's inner
  came to 1465 − 32 for the toolbar; Chromium's 1465 − 67).
- This also explains the owner's morning run: the relocation and the
  work window both opened at their opener's frame, and the one
  correction tried — Re-tile, a moveTo/resizeTo — placed the relocated
  copy exactly (its window still sat on the planned wizard box,
  0,45 .. 934,1510, hours later).
- **The wizard's fix is verified in Safari**: with workWindow.ts
  correcting the blank window, the built wizard on :4174 put its work
  window at 934,45 .. 2336,1510 — the planned box to the pixel — from a
  scripted, activation-less click, the worst case measured.

## Gate (§3.5)

Phase 2 proceeds when, in Chrome and one other browser, separate window,
reuse, placement and relocation all work, and the severing pages are
known. Per severing provider, choose: (a) accept one leftover window and
say the old one may be closed; (b) link only to its entry page and
describe the way in; (c) move it to the end of the sequence.

| Severing provider | Pages | Choice | Notes |
|---|---|---|---|
| Cloudflare (Chromium; not Safari) | sign-in, signup, create API token | (a) — the only one that helps: every Cloudflare page sends COOP, and both visits must stay where they are | one sentence on the Cloudflare token card |
