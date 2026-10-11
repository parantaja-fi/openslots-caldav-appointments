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
did not work as intended; not investigated yet. Relocation, reload,
forget, blocked and empty-URL runs were not recorded.

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
| Relocation: moves left; the relocated copy creates the work window, on the right | | |
| Reload, then a target: re-acquired by name, no second window | | |
| Forget handle, then a target: the same | | |
| Work window closed by hand, then a target: created in the same place | | |
| Close work window, after a foreign page: it closes | ✓ | after the booking page |
| Pop-ups blocked (the 8 s button, no work window open): `blocked`, nothing else breaks | | |
| Empty-URL open (“Re-acquire by name”): the work window’s page stays | | |
| No overlap at 1366×768 | | |
| No overlap at 1920×1080 | | |
| The wizard usable at 40 % width | | |

## Gate (§3.5)

Phase 2 proceeds when, in Chrome and one other browser, separate window,
reuse, placement and relocation all work, and the severing pages are
known. Per severing provider, choose: (a) accept one leftover window and
say the old one may be closed; (b) link only to its entry page and
describe the way in; (c) move it to the end of the sequence.

| Severing provider | Pages | Choice | Notes |
|---|---|---|---|
| Cloudflare (Chromium; not Safari) | sign-in, signup, create API token | (a) — the only one that helps: every Cloudflare page sends COOP, and both visits must stay where they are | one sentence on the Cloudflare token card |
