# The Google Calendar sub-wizard — a plan

> Implemented 2026-10-11 through step 5 of §8; step 6, the walks with
> a fresh Google account, is open. The details below are as built.
> Companion to `fork-guided-setup.md` (what a tab can reach) and
> `wizard-testing.md` (where tests go). Grounding: the spikes'
> `GOOGLE_SETUP.md` and `GOOGLE_CALDAV_SETUP.md`, `LEARNINGS.md`,
> `worker/src/auth.ts`, the CORS probes of §2 and the spike of §10,
> all run 2026-10-10.

## 1. What it is for

The practitioner who picked Google at the calendars card today meets
two paragraphs of warning, a disabled "Create Google credentials"
button and three bare fields. Google is the one provider where the
by-hand route has nine steps across two consoles and a spreadsheet's
worth of ways to go wrong (`GOOGLE_SETUP.md` §troubleshooting). The
sub-wizard gives that route the wizard's own shape — deep link, act,
paste, verify — and produces exactly what the main wizard needs and
nothing more: the service-account key (`GOOGLE_SERVICE_ACCOUNT_JSON`)
and the two calendar addresses (`AVAILABILITY_CALENDAR_URL`,
`BOOKING_STORE_URL`). Everything downstream — the review, the store,
deploy, health, smoke — stays as it is.

## 2. What the tab can and cannot do (verified 2026-10-10)

| Endpoint | CORS from a Pages origin | Consequence |
|---|---|---|
| `oauth2.googleapis.com/token` | yes; any origin echoed, error bodies readable | The pasted key can be *proven live* in the tab: sign the service-account assertion with WebCrypto (the same RS256 the Worker does), exchange it for a one-hour token. The private key never leaves the tab; a signature does. |
| `www.googleapis.com/calendar/v3` | yes; `authorization` allowed, error bodies readable | With that token the tab can look at each calendar *as the service account*: its name, whose it is, and whether it is shared and how far (free-busy only / reader / writer / owner) — one read-only `events.list` asking for metadata only, so a `calendar.readonly` token suffices (§10, checks 3–8). |
| `apidata.googleusercontent.com/caldav/v2` | no (preflight 403) | CalDAV stays the Worker's: `/v1/health` after deploy, as today. |
| `console.cloud.google.com`, `calendar.google.com` | deep links only (framing denied, `fork-guided-setup.md` §1) | Every console step is link → act → tick, like the Cloudflare token today. |

The price of the second row: the practitioner enables the Google
Calendar API as well as the CalDAV API (the Worker needs only the
latter). One click, and it buys the whole key-and-sharing verification
*before* anything is deployed; the spike docs asked for both anyway.
Not at the token: issuance checks neither API enablement nor IAM, so a
disabled Calendar API first shows at the calendar look-up (§10,
surprise 4).

What the tab cannot see even with the token: whether the CalDAV API is
enabled. A service account with no IAM role cannot ask Service Usage
(§10, check 10), and CalDAV itself is off-limits. That one remains the
health card's finding (§3, failure table).

## 3. The journey

Seven cards, numbered 3.1–3.7 as substeps of the calendars card —
step 3 of the main list — in the main wizard's vocabulary throughout
(open / watch / green / attested / red; `settled()` as today). Cards
3.1–3.4 are attestations with deep links; 3.5 and 3.6 verify.

- **3.1 Google account and Google Cloud.** Sign in to the Google
  account whose calendar the practice runs on, and open the Cloud
  console for the first time: a terms-of-service dialog, nothing more
  — no billing account, the Calendar and CalDAV APIs are free. Link to
  the console. A Workspace account may find project creation barred by
  its admin; a personal account has no such gate. Attested.
- **3.2 Cloud project.** Link to the project-creation page. The
  practitioner pastes the project ID back (the dashboard shows it;
  non-secret, persisted). It makes every later link land on the
  right project and lets 3.5 catch a key from the wrong one.
- **3.3 Two APIs.** Links to the CalDAV API and the Google Calendar
  API library pages with `?project=`. "Enable, wait a minute."
  Attested here; the Calendar one is proven by 3.6's first call, the
  CalDAV one by health.
- **3.4 Service account.** Link to the create page. "Any name; no
  role, no user access — Done. Then Keys → Add key → Create new key →
  JSON. A file downloads." Attested. A Workspace organisation created
  since 2024 has service-account key creation switched off by default
  (the `iam.disableServiceAccountKeyCreation` policy); the card says
  an admin can allow it for the project, and the Workspace walk of §8
  step 6 is where this gets observed. A personal account has no
  organisation and no such policy.
- **3.5 Key.** Paste the file. Synchronously: JSON, `client_email`,
  `private_key` (the validator that exists), then the pkcs8 import.
  Then the token exchange, for `calendar.readonly` — the narrowest
  scope that still verifies 3.6 — green "Google accepted the key at
  12:34", red with Google's own `error_description` quoted otherwise
  (every refusal is a 400 `invalid_grant`; the wording is the only
  distinction and Google does not promise it). Green says the key is
  live, nothing about 3.3. Derived: `client_email`, persisted, and
  `project_id`, cross-checked against 3.2 and kept with the probe
  result. The key itself stays in tab memory like every secret; the
  token too, with its expiry.
- **3.6 Calendars.** One row per role, one when `sameCalendar`. Paste
  the calendar ID (Settings → the calendar → Integrate calendar; a
  pasted full CalDAV address is accepted and reduced). From it the
  address, `@` as `%40`. Below it the sharing instruction with the
  service account's address and a copy button, the required level
  named — "See all event details" for availability, "Make changes to
  events" for the store — and a link to Google Calendar's settings
  (a deep link to that calendar's own page is unverified, §10).
  Verification, as the service account, by one metadata-only
  `events.list` per calendar (name, time zone, access level) and a
  `calendars.get` for the owner: "that is your “Vastaanotto”", the
  level at least the requirement on the order free-busy < reader <
  writer < owner, and a calendar the service account itself owns
  refused — it would be invisible in the practitioner's own Google
  Calendar (§6). Polled at the wizard's cadence while red, so sharing
  in the other tab turns the card green by itself; a round over two
  calendars is about half a second.
- **3.7 Back.** A summary; the main calendars card shows the same
  summary in place of its three fields, and its Done press settles
  the group exactly as today.

Where each mistake surfaces, and what the practitioner reads:

| Mistake | Caught at | Reads |
|---|---|---|
| Not JSON, or not a key file | 3.5, sync | as today |
| A private key that does not import | 3.5, the pkcs8 import | "The private key in this file cannot be read — paste the file again, unchanged, or make a new key" |
| Key from another project | 3.5 | "This key belongs to project X, 3.2 says Y" |
| Key revoked, account or project deleted | 3.5, token exchange 400 `invalid_grant` | "Google no longer accepts this key — make a new one", Google's words beneath |
| Clock badly off on this machine | 3.5, the same 400, its description naming `iat` and `exp` | "…check this computer's clock", Google's words beneath |
| Calendar API not enabled | 3.6, 403 `SERVICE_DISABLED`, naming the project by *number* and carrying the enable link | "Enable the Google Calendar API in project X" — X the key's project ID: the project the API is off in, and 3.2's once 3.5 is green; the link from the body, else 3.3's library page in the key's project |
| Wrong calendar ID, or not shared at all | 3.6, 404 (seen for an unknown ID; expected for an unshared one, §10 check 5) | "Google finds no such calendar for the service account — check the ID, then the sharing" |
| A calendar the service account created | 3.6, owner is the account itself | "This calendar belongs to the service account, not to you — pick one of your own" |
| Shared, but only free/busy or only to see | 3.6, access level | "Shared, but only to see events — the booking store needs “Make changes to events”" |
| Workspace forbids sharing details outside the domain | 3.6, free-busy level | beneath the row above's line, as a condition, since the level alone cannot tell the two apart: "If “See all event details” is not on offer when you share, your Google Workspace lets outsiders see free/busy only — an admin loosens it, or use a personal Google account" |
| CalDAV API not enabled | health card, `CalDAV REPORT failed: 403` | a Google-specific hint with the library link (today's health body, provider-aware) |

## 4. Where it lives

**A view in the same document, not a second page.** The hash (`#google`)
selects it; the render loop draws the seven cards in place of the step
list, their markers reading 3.1–3.7 so the practitioner knows they are
inside step 3, the rail shows the same, "Back" returns to the calendars card. The walk notes asked for "a page" and that is what the
practitioner sees. A second HTML page would drop the key at
navigation — secrets live in tab memory by rule, and a double paste
is worse than a hash. Seven cards, two of them verifying, inside one accordion
item of the calendars card is the other way to lose, visually.

**Modules**, following the wizard's layering:

- `wizard/src/google/steps.ts` — pure: `Saved` plus the Google probe
  results in, seven `StepView`s out. Where the failure table above
  becomes code.
- `wizard/src/google/token.ts` — the assertion and the exchange: the
  Worker's `googleAccessToken`, copied (§9 D5), with `fetch` spelt the
  same, `calendar.readonly` for its scope and no cache. It answers
  with 3.5's verdict and, on acceptance, the token and its expiry
  beside it, never inside it. A private key that fails the pkcs8
  import is `unreadable`, and Google is never asked.
- `wizard/src/google/probe.ts` — the calendar look-up as the service
  account: the metadata-only `events.list` and
  `calendars.get?fields=dataOwner` in parallel, the worse answer
  winning when they disagree; swallows network failure into "blind"
  like `probes.ts`. Google answers in three error shapes (§10,
  surprise 6): it keys on `error.code`, then the ErrorInfo `reason`
  where present, else `errors[0].reason`. A `SERVICE_DISABLED` without
  `metadata.activationUrl` leaves the link empty for 3.6 to fill (§3).
- `validators.ts` gains `googleProjectId` and `googleCalendarId`
  (reducing a pasted address to its ID); `googleJson` stays as it is,
  and `parseGoogleKey` in `google/steps.ts` yields the key's
  non-secret fields, never the private key.
- Rendering is `main.ts`'s own, drawing either list (§7); the Google
  branch of `renderConfig` is the live button plus 3.7's summary.

**State.** `FormState` gains `google: { projectId, clientEmail,
calendarIds: { availability, store } }`, each a validated value or
empty — persisted; IDs and addresses of the practitioner's own
calendars are identity, not credential, like `providerUrl` (§9 D2).
Ticks reuse `Saved.done` under `google-…` ids, so the attestation
mechanics are the existing ones.
Tab memory: the key in the existing `secrets` map, the token beside
it, probe results in the poll loop's memory like every other probe.

**Hand-over.** No new channel: the sub-wizard writes the key and the
derived addresses into the same `secrets` map the manifest rows write
today, `effectiveValues` mirrors the store address when `sameCalendar`
as before, and the review, store and deploy cards never learn Google
was involved. The health card learns one thing: a provider-aware hint
for 401 / 403 / 404 from Google.

**Secrecy.** Unchanged in kind: the key is pasted once per tab and
goes to Google only as a signature over a short assertion; the token
is never persisted; the console and calendar pages open in new tabs
under the practitioner's own login; nothing of Google's ever touches
the fork.

## 5. Tests (`wizard-testing.md`)

- Layer 1: every row of the failure table as a derivation test; the
  validators (`%40`, a pasted address reduced to its ID, a project ID
  that is not one).
- Layer 2: `token.ts` against a key pair made per run, the signature
  checked with the public half; `probe.ts` over mocked `fetch` with
  Google's real error bodies — §10 and the spike branch's `RESULTS.md`
  hold them, the Calendar API's own `SERVICE_DISABLED` body still
  missing and inferred from Drive's.
- Layer 3: the view toggle, and paste → verify → green in a `jsdom`
  document: `test/google/view.test.ts`, importing `main.ts` as it is.
- Live, opt-in like `live:radicale`: `live:google`, the key and the
  probe against the spike's project and test calendars, which is also
  where step 1 of §8 does its checking.

## 6. What stays out, and why

- **Creating project, APIs, service account and key from the tab** with
  the practitioner's own Google login (Google Identity Services and the
  Cloud REST APIs, which do serve CORS). It needs an OAuth client owned
  upstream, consent-screen verification for cloud-platform scopes or
  an "unverified app" interstitial on every practitioner's screen, and
  makes the project a party to every practitioner's Google account.
  The narrower variant — Calendar scope only, to list calendars by
  name and share them with the service account by API — carries the
  same client problem for less. Neither before 0.2.0 is out and a
  second practitioner has walked the manual route.
- **Creating the calendars by the service account.** A calendar the
  account makes is invisible in the practitioner's own Google Calendar
  until shared back — the opposite of the mental model.
- **The OAuth refresh-token route** of the second spike. The Worker
  does not speak it and need not.
- **Per-role providers.** M6.6. Card 3.6 is already per role; when
  providers become per role it shows the Google ones only.

## 7. Lifted out of M6.4

What the seven cards share with the main list, made callable on
2026-10-11 rather than copied:

- the card renderer: `renderSteps` draws either list into its own
  static `<ol>` in `index.html` — accordion, `fillStepBody`, markers
  (3.1–3.7 in the view) — its per-card memory keyed by step ids, which
  are unique across both;
- `derivePhases` over a given phase table, `GOOGLE_PHASES` giving the
  rail one chip per card;
- the field row: `inputRow` builds one from what it shows and a commit
  callback; `fieldRow` wraps it for the manifest's rows, and the
  Google rows validate into `state.form.google` through it.

Deliberately not lifted, pending the baseline's own rework: the
`secrets` map as a module (the hand-over writes into it in place), the
`init(document)` entry point (the layer-3 test imports `main.ts` as it
is) and the link and window chrome (`linkBtn`, `linksRow`, `bareLink`,
used as they stand). The attestation stamps and `pressConfirm` needed
no lifting, and the poll loop gained a Google job rather than becoming
a list of probes. Nothing is generalised on speculation.

## 8. Steps, in order

1. Spike check against the spike's project (credentials in the spikes'
   `.dev.vars`; half a session): the access level is read the way §3
   assumes; the exact 403 body for a disabled Calendar API and the 404
   for an unshared calendar; the calendar-settings deep-link format;
   each console link of §3 clicked once. Captured bodies become layer
   2 fixtures. The API half ran 2026-10-10 on the branch
   `google-wizard-spike` (§10); the browser half — the console links,
   the settings deep link, the other share levels, a disabled Calendar
   API on the spike project — is §10's closing list and needs the
   author's own login.
2. Layer 1: validators, `google/steps.ts`, tests. Nothing visible.
3. Layer 2: `token.ts`, `probe.ts`, tests; the live test.
4. The §7 lift from the settled M6.4, then the view, hand-over and the
   live button. Done 2026-10-11.
5. The health hint; `SETUP.md` Part 1's Google rows point at the
   wizard; `ROADMAP.md` records the milestone. Done 2026-10-11.
6. A walk with a fresh Google account, Workspace and personal both if
   one is at hand.

## 9. Decisions

- **D1** — view in the same document (recommended, §4) or a second
  HTML page with the key pasted again on return.
- **D2** — project ID and calendar IDs persisted as non-secret form
  state (recommended) or kept in tab memory with the key.
- **D3** — require the Google Calendar API for in-tab verification
  (recommended) or verify only through health after deploy.
- **D4** — ask for the project ID at 3.2 (recommended: precise
  links, a cross-check) or take it from the key alone.
- **D5** — `token.ts` copied from the Worker (recommended; separate
  packages, forty lines, and a different scope) or imported across the
  tree.
- **D6** — after M6.5 (recommended: reconfiguration decides what a
  provider switch deletes, which the hand-over must respect) or
  straight after M6.4 as the roadmap note says.
- **D7** — a calendar shared beyond its need (the store at "manage
  sharing", availability at "make changes"): a quiet footnote on 3.6
  (recommended — a leaked key could then re-share or write) or
  nothing, green is green.

## 10. Spike results (2026-10-10)

**Setup.** Run at 19:13 UTC against the spikes' Google Cloud project, as its service account, by `spike/google-wizard/probe.mjs` on the branch `google-wizard-spike`:
- Node 26.8.1 `fetch` and WebCrypto, signing exactly as `worker/src/auth.ts` does;
- curl 8.7.1 for the repeats from a foreign origin;
- check 8 rerun at 19:21 (one call added) and check 7 at 19:29 (two calls added);
- one sample per call.

Findings and the masked raw logs are in `spike/google-wizard/RESULTS.md` on that branch.

**Masking**, here and there: tokens appear as `<redacted>`, plus `<service-account>`, `<project-id>`, `<project-number>`, and `<practitioner>` for the availability calendar's owner. Calendar IDs are cut to eight characters.

† marks a call beyond step 1's list. No permission check refused anything.

1. **Token exchange: confirmed.**
   - 200, `{"access_token":"<redacted>","expires_in":3599,"token_type":"Bearer"}`.
   - Repeated by curl with `Origin: https://example.github.io`: 200, `access-control-allow-origin` echoes the origin, and `access-control-expose-headers: vary,vary,vary,content-encoding,date,server,content-length`.
   - There is no `access-control-allow-credentials`, and the tab does not need it.
   - §2's first row holds on success as well as on error.
   - The repeat sent the very same assertion and was granted a second token.
2. **`invalid_grant`: confirmed. Only `error_description` tells the cases apart.**
   - All four are 400, not 401, with `"error":"invalid_grant"`.
   - `iat`/`exp` two hours in the past and, †, two hours in the future give the identical body. Only that body mentions time.
   - A tampered signature and an `iss` that does not exist each have their own description (bodies below).
   - Not tried: a revoked key, and a deleted account or project. By inference:
     - a revoked key reads "Invalid JWT Signature." (the assertion carries no `kid`, so a deleted key simply fails to verify);
     - a deleted account reads "account not found".
   - The amount of clock skew Google tolerates was not tested.
3. **`calendars.get`: the name is confirmed; the access level is not there.**
   - 200 for both calendars, with:
     - `summary` and `description`;
     - `timeZone`: Europe/Helsinki for availability, UTC for the store (which the service account created);
     - `dataOwner`, the owning account: `<practitioner>` for availability, `<service-account>` for the store;
     - two dozen `labelProperties.eventLabels`.
   - No access level anywhere in the body. §2's "how far" needs another call (4, 8).
4. **Calendar list: the level is confirmed, but only after a write.**
   - Before any insert, the service account's list held only the store (`owner`).
   - The availability calendar, though shared to the account, was absent: sharing does not add it to the list.
   - `calendarList.get` on it answered 404 with exactly the body a nonexistent calendar gets. The list therefore does not show whether a calendar is shared.
   - `calendarList.insert {"id": …}` answered 200 with an entry carrying `accessRole` (below). The value was `owner`: the spike's availability share is "Make changes and manage sharing", not the "See all event details" that §3 asks for.
   - Re-inserting the store, already listed, is idempotent: 200 and a new etag.
   - Insert writes to the service account's own state and needs the `calendar` or `calendar.calendarlist` scope (8).
   - CalDAV never needed the entry: the spikes read availability without it.
5. **Unknown calendar: confirmed for a nonexistent ID.**
   - `calendars.get` and `calendarList.insert` for `does-not-exist@group.calendar.google.com` both answer 404 `notFound`, in the legacy shape only (no `status`, no `details`).
   - † The read-only `events.list` of check 8 answers the same.
   - Not tried: a calendar that exists but is not shared to the account, which is the failure table's real case. There was no third calendar. The same 404 is expected but not shown.
6. **Disabled API: confirmed with Drive; the Calendar body itself not captured.**
   - The Calendar API is enabled on the spike project, so Drive, which is disabled there, stood in.
   - With the calendar-scoped token, Drive answers 403 `ACCESS_TOKEN_SCOPE_INSUFFICIENT` with `www-authenticate: Bearer … error="insufficient_scope"`. Scope is checked before enablement.
   - † With a token that also carries `drive.metadata.readonly`: 403 `SERVICE_DISABLED` (below).
     - Its message, `activationUrl`, `containerInfo` and `consumer` name the project number, never the ID.
     - The link points at `console.developers.google.com`.
     - The shape is hybrid: the legacy `error.errors[]` (`usageLimits` / `accessNotConfigured` / `extendedHelp`) sits beside `error.status` and `error.details[]` (ErrorInfo, LocalizedMessage, Help).
   - Calendar's own errors: the 404s are legacy only; its scope 403 (8) is hybrid.
   - For a disabled Calendar API, the same body with `service: calendar-json.googleapis.com` is inferred, not seen.
7. **CORS on an authenticated success: confirmed, and † on errors.**
   - `calendars.get` by curl from the foreign origin: 200, with `access-control-allow-origin: https://example.github.io` and `access-control-expose-headers: date,etag,content-length,vary,vary,vary,content-encoding,server`.
   - The 19:29 rerun added two error responses:
     - Calendar's 404 for the unknown calendar;
     - the gateway's 403 for an insufficient scope (Drive with the calendar token).
   - Both echo the origin, and the 403 exposes `www-authenticate`.
   - The preflight was already shown to allow `authorization`, so a tab can read the bodies the failure table depends on.
   - `SERVICE_DISABLED` comes from the same gateway as the scope 403 and should behave alike (inferred).
8. **`calendar.readonly`: confirmed, and it is enough.**
   - Token exchange 200; `calendars.get` 200 with the same body.
   - `calendarList.insert` answers 403 `ACCESS_TOKEN_SCOPE_INSUFFICIENT`:
     - hybrid shape; ErrorInfo `service: calendar-json.googleapis.com`, `method: calendar.v3.CalendarList.Insert`;
     - its `www-authenticate` lists the scopes that would work: `…/auth/calendar`, `…/auth/calendar.calendarlist`, and legacy feeds.
   - † `events.list?maxResults=1&fields=summary,timeZone,accessRole` under the read-only token returns name, time zone and `accessRole` (`owner` for both; below). For the unknown calendar it returns check 5's 404.
   - That is everything 3.6 verifies, in one read-only call per calendar, with no write and no event data.
9. **OPEN events: inconclusive.**
   - `events?q=OPEN&singleEvents=true&maxResults=5` over the next 30 days, on availability: 200 in 358 ms, zero items, no further page, `accessRole: owner` at the top level.
   - One call cannot tell an empty window from a `q` search that misses. An unfiltered call over the same window would settle it.
10. **† Service Usage: §2 confirmed.**
    - A `cloud-platform` token is issued without complaint.
    - `services.get` for `caldav.googleapis.com` answers 403 `AUTH_PERMISSION_DENIED` on `serviceusage.services.get`, in the new shape only (no `errors[]`), and takes about a second.
    - The tab cannot learn whether the CalDAV API is enabled; that remains the health card's job.

**Bodies.** Verbatim apart from masking. These and the raw logs supply §5's layer-2 fixtures; the Calendar `SERVICE_DISABLED` body is still missing.

`invalid_grant`, `iat`/`exp` two hours behind or ahead:

```json
{"error":"invalid_grant","error_description":"Invalid JWT: Token must be a short-lived token (60 minutes) and in a reasonable timeframe. Check your iat and exp values in the JWT claim."}
```

Signature tampered:

```json
{"error":"invalid_grant","error_description":"Invalid JWT Signature."}
```

`iss` an account that does not exist:

```json
{"error":"invalid_grant","error_description":"Invalid grant: account not found"}
```

404. The same body for an unknown calendar (`calendars.get`, `calendarList.insert`, `events.list`) and for a shared calendar not yet in the list (`calendarList.get`):

```json
{
 "error": {
  "errors": [
   {
    "domain": "global",
    "reason": "notFound",
    "message": "Not Found"
   }
  ],
  "code": 404,
  "message": "Not Found"
 }
}
```

Disabled API, with Drive standing in. The two repeats of `error.message` are shortened to `…`:

```json
{
  "error": {
    "code": 403,
    "message": "Google Drive API has not been used in project <project-number> before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=<project-number> then retry. If you enabled this API recently, wait a few minutes for the action to propagate to our systems and retry.",
    "errors": [
      {
        "message": "…",
        "domain": "usageLimits",
        "reason": "accessNotConfigured",
        "extendedHelp": "https://console.developers.google.com"
      }
    ],
    "status": "PERMISSION_DENIED",
    "details": [
      {
        "@type": "type.googleapis.com/google.rpc.ErrorInfo",
        "reason": "SERVICE_DISABLED",
        "domain": "googleapis.com",
        "metadata": {
          "activationUrl": "https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=<project-number>",
          "serviceTitle": "Google Drive API",
          "containerInfo": "<project-number>",
          "service": "drive.googleapis.com",
          "consumer": "projects/<project-number>"
        }
      },
      {
        "@type": "type.googleapis.com/google.rpc.LocalizedMessage",
        "locale": "en-US",
        "message": "…"
      },
      {
        "@type": "type.googleapis.com/google.rpc.Help",
        "links": [
          {
            "description": "Google developers console API activation",
            "url": "https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=<project-number>"
          }
        ]
      }
    ]
  }
}
```

Calendar-list entry for availability, from `calendarList.insert`:

```json
{
 "kind": "calendar#calendarListEntry",
 "etag": "\"1791659608441679\"",
 "id": "dfe6b43b…@group.calendar.google.com",
 "summary": "booking-calendar",
 "description": "parantaja.fi booking calendar",
 "timeZone": "Europe/Helsinki",
 "dataOwner": "<practitioner>",
 "colorId": "17",
 "backgroundColor": "#9a9cff",
 "foregroundColor": "#000000",
 "selected": true,
 "accessRole": "owner",
 "defaultReminders": []
}
```

`events.list?maxResults=1&fields=summary,timeZone,accessRole` on availability, with a `calendar.readonly` token:

```json
{
 "summary": "booking-calendar",
 "timeZone": "Europe/Helsinki",
 "accessRole": "owner"
}
```

**Timings.** Milliseconds, wall-clock from request to body read in Node, with the connection kept alive unless stated. One machine; no browser, so no preflight.

| Call | Status | ms | n |
|---|---|---|---|
| Token exchange, new connection | 200 | 124–176 | 5 |
| Token exchange | 200 | 26–74 | 5 |
| Token exchange, `invalid_grant` | 400 | 19–26 | 4 |
| `calendars.get` | 200 | 334–541 | 6 |
| `events.list`, metadata only or `q=OPEN` | 200 | 356–483 | 5 |
| `calendarList` list, get, insert | 200 | 427–637 | 7 |
| Calendar 404 | 404 | 172–352 | 4 |
| Calendar 403, scope | 403 | 148–151 | 2 |
| Drive 403, scope / disabled | 403 | 35 / 193 | 2 |
| Service Usage 403 | 403 | 983–1020 | 2 |

curl, with a new connection each time:

| Call | ms |
|---|---|
| Token exchange | 68–70 |
| `calendars.get` | 415–444 |
| Calendar 404 | 364 |
| Gateway 403 | 71 |

**Surprises**

1. **The spike's availability share is `owner`, not `reader`.**
   - The share goes beyond what §3 asks for, so the level check must be "at least", on the order `freeBusyReader` < `reader` < `writer` < `owner`.
   - Whether an over-share deserves a remark is for §3 to decide: `owner` lets a leaked key re-share the practitioner's calendar.
2. **The access level is not where §2 implies.**
   - `calendars.get` has none.
   - The calendar list has it only after an insert, which is a write and needs the full or `calendarlist` scope. A shared calendar is not listed until then.
   - `events.list` has it, read-only.
   - So the tab can hold a `calendar.readonly` token, the narrowest scope that still verifies, and 3.5 can mint that token directly.
   - `token.ts` then differs from the Worker's `googleAccessToken` in its scope: one more reason for D5's copy.
3. **`dataOwner` gives the owning account.**
   - §3 did not foresee it. It appears in `calendars.get` and in calendar-list entries.
   - 3.6 could say whose calendar it is.
   - 3.6 could also catch §6's anti-pattern, a calendar the service account created itself (`dataOwner` equals `client_email`, typically in UTC). The spikes' own store is one.
   - It costs a `calendars.get?fields=dataOwner` alongside the `events.list`, unless `events.list` carries it too (not tried).
4. **A disabled API shows only at 3.6, and by project number.**
   - Token issuance checks neither API enablement nor IAM, and scope is checked before enablement. So a green 3.5 says nothing about 3.3, and a disabled Calendar API first shows at 3.6 as `SERVICE_DISABLED` (inferred from Drive).
   - That body names the project number, which neither the key nor 3.2 yields. So the red text:
     - names the project by ID — the key's, which 3.5 holds to 3.2's;
     - links either `metadata.activationUrl` or 3.3's own `?project=<id>` page.
   - Detection keys on ErrorInfo `reason: "SERVICE_DISABLED"`, or in the legacy part `errors[0].reason: "accessNotConfigured"`.
5. **Every `invalid_grant` is a 400, not a 401.**
   - The failure table splits "no longer accepts this key" from "check this computer's clock" on the wording of `error_description` (`iat and exp`), and Google does not promise that wording.
   - Show Google's string verbatim under either message.
6. **Three error shapes.**
   - Calendar's 404 is legacy only.
   - Calendar's scope 403 and the gateway's `SERVICE_DISABLED` are hybrid.
   - Service Usage uses the new shape only.
   - So `probe.ts` should key on `error.code`, then ErrorInfo's `reason` where present, else `errors[0].reason`. `error.status` is absent from the 404.
7. **Calendar is the slow party.**
   - Calendar calls take 0.33–0.64 s; a warm token exchange takes 26–74 ms; the gateway's own 403s start from 35 ms.
   - A poll round over two calendars takes about 0.5 s in parallel or 1 s in sequence, before preflights.
8. **The assertion can be replayed.** Google does not enforce single use, so an assertion is as good as a token until its `exp`. The tab sends it only to Google, so nothing changes.
9. **`calendars.get` is bulky.** It carries two dozen event labels; request it with `fields=`.

**State left behind.**
- The availability calendar is now in the service account's calendar list (check 4). It was left there, as permitted; `calendarList.delete` removes it.
- The store's entry was re-inserted, unchanged except for its etag.
- Nothing else was written.

**What only a human with a browser can settle**

- **§3's console links**, each clicked once while signed in to a fresh account:
  - 3.1: first visit and the terms dialog;
  - 3.2: project creation;
  - 3.3: the library pages for `caldav.googleapis.com` and `calendar-json.googleapis.com` with `?project=<id>`;
  - 3.4: service-account creation, then Keys → Add key → JSON.
- **The calendar-settings deep link for 3.6:**
  - its format (candidate, unverified: `https://calendar.google.com/calendar/r/settings/calendar/<base64 of the calendar ID>`);
  - whether it lands on the sharing section;
  - which signed-in account it opens when there are several.
- **The other access levels.**
  - Share availability at "See all event details" to observe `reader`. Share at "See only free/busy" and at "Make changes to events" for `freeBusyReader` and `writer`.
  - At each level, record what `events.list` (metadata only) and `calendars.get` answer. In particular: is free/busy-only a 200 or an error?
  - Changing a share needs the practitioner's Calendar settings.
- **A disabled Calendar API on the spike project.** Disable it, rerun `probe.mjs 3 8`, then re-enable. This gives:
  - the real `SERVICE_DISABLED` body for `calendar-json.googleapis.com`;
  - whether its number-based `activationUrl` opens the right project;
  - the propagation delay in each direction.

  The Worker speaks CalDAV, a separate API, and should not notice (inferred).
- **An existing calendar not shared to the service account**, to see the 404 the failure table assumes. Needs a throwaway calendar in the practitioner's account.
- **A deleted key, and a disabled then a deleted service account**, for their `invalid_grant` descriptions.
- **A Workspace domain that limits external sharing to free/busy**, to see what access level such a share shows.
- **A real Pages origin.** The same calls from a browser, to check:
  - how many preflights there are and how they are cached;
  - that the error bodies curl shows as readable actually reach the page.

Spike branch `google-wizard-spike` at `47083a86d707176cd16101a2c23a301f108e01e6`.
