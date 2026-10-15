# Lessons

Dated notes for agents working in this repository: hard-won facts and
practices that fit neither CLAUDE.md's brief nor ARCHITECTURE.md's
mechanisms. Append new entries at the top; leave old ones as written.

## 2026-10-15 — Local Network Access, wrangler dev's trace store, and Google's CalDAV freshness

### Chromium blocks a fulfilled page's fetch to a loopback Worker

Chromium 151.0.7922.34, as Playwright 1.62.1 ships it, denies a fetch
from a document served by `route.fulfill` — so on a public origin — to a
Worker on localhost: Local Network Access. Grant it on the context,
`await context.grantPermissions(['local-network-access'])`. A page
served from localhost itself needs no grant.

### `wrangler dev` keeps a trace store, and answers SQL over it

wrangler 4.118.0 records the local Worker's requests and subrequests.
`POST /cdn-cgi/local/explorer/api/local/observability/query` on the dev
port, body `{ "sql": "…" }`, queries a `spans` table: an incoming
request is a span named after its method, a subrequest one named
`fetch`, the two joined on `trace_id`. URL, method and status are in the
JSON `attributes` column as `url.full`, `http.request.method` and
`http.response.status_code`, read with
`json_extract(attributes, '$."url.full"')`. That counts a request's
CalDAV calls exactly. `duration_ms` is real, but the CPU and wall-time
fields read 0, so it cannot measure CPU. The store survives restarts in
`.wrangler/`, full subrequest URLs (calendar IDs) included: delete it
after a live run. It refuses a page from another origin with 403.

### Google's CalDAV reads an API write at once

A write through Calendar API v3, as the service account, was in the
next CalDAV REPORT 0.3–0.4 s after the API call returned (two trials).
A test that writes through one and reads through the other need not
wait.

## 2026-10-11 — The work window, Safari's window policy, and driving Safari from the shell

### Safari ignores `window.open` geometry; place the window yourself

Real Safari (26.6.2) ignores `left`/`top`/`width`/`height` in the
features string, with and without a user activation, and opens the
popup as a clone of the opener's frame. The cure, exact in every
engine measured: `moveTo` + `resizeTo` on the still-blank window
between `window.open("", name, features)` and `location.replace(url)`
— the window is same-origin until it navigates, and no activation is
needed. A window that came out as a tab ignores the calls silently.
`wizard/src/workWindow.ts` does this; the measurements and the method
live in `spike/RESULTS.md` (probes: `spike/two-window.html` +
`spike/geometry.html`).

Do not trust wpt.fyi for window-chrome behaviour: its Safari runs pass
the placement tests because they exercise WebKit's machinery, not
Safari's window policy. MDN's "coordinate origin unreliable" was the
accurate source.

The rest of the work-window mechanics — reuse resting on the opener
link, `rel="noopener"`/`_blank` each breaking it, Cloudflare's COOP
severing the handle in Chromium but not Safari — are in
`spike/RESULTS.md` and the header of `wizard/src/workWindow.ts`.

### Driving Safari over Apple Events (`spike/safari-driver.sh`)

- A pending Automation consent does not error: the Apple Event blocks
  and times out after two minutes with −1712. `get version` answers
  before consent; window names and bounds do not. The prompt is
  charged to the app hosting the shell (the editor or terminal, not
  osascript) and may sit behind Touch ID.
- "Allow JavaScript from Apple Events" (Safari → Settings → Developer)
  lapses on its own; expect to ask for it again mid-session. When a
  page's JS throws, `do JavaScript` returns `missing value` rather
  than erroring — a silently empty result usually means a JS
  SyntaxError, not a permission problem.
- `\n` inside an AppleScript string literal becomes a real linefeed in
  the embedded JavaScript source — a syntax error you will not see.
  Use `String.fromCharCode(10)`.
- A scripted `.click()` carries no user activation. A real Return
  through System Events (key code 36, Accessibility permission) does,
  but lands in the frontmost window — raise the right window first and
  close any popup that stole focus, or the press activates whatever
  was focused there before.
- Safari prefixes window names with the profile ("Default — <title>"):
  match with `contains`, never `starts with`.
- `item 1 of (bounds of w)` fails to coerce inside a concatenation;
  read the bounds into a variable first.
- A page can publish its own measurements in its `<title>`:
  AppleScript then reads them as the window's name with no JavaScript
  permission at all (`spike/geometry.html`).

### Testing the wizard headless (Playwright)

- Popups: `waitForURL(...)`, never `waitForLoadState` — the latter
  resolves on the popup's `about:blank` and the next evaluate dies on
  navigation. Assert against the whole spike/wizard log, not its last
  line: status-poll lines interleave.
- A different port is a different origin, so `localStorage` starts
  empty: the wizard renders its fresh-state variant, which has been
  mistaken for a regression (the step-12 "lost button" of this date was
  the address-less branch, present since the step was born). Inject
  state with `ctx.addInitScript(() => localStorage.setItem(
  'wizard-state', ...))` before blaming a diff.
- Chromium's pop-up blocker is disabled by Playwright by default;
  re-enable with `ignoreDefaultArgs: ['--disable-popup-blocking']`.
  Even then click-initiated opens pass — the truly-blocked path needs
  `window.open` stubbed to return null.

### Shell scripts the user may run by hand

They get run with `sh`/`bash` regardless of the shebang. zsh's `print`
is not a bash builtin; use `printf`. (And in zsh, `status` is
read-only and `echo ======` expands the `=` — both have bitten.)
