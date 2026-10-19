# Resource calendar view — stage 3 study: event sources, and the Worker deployed

> Carried here 2026-10-19 from the unmerged `spike/alkuvoima`
> (`0dc1843`) for §8, which answers
> `private-events-under-a-reader-share-untested-2026-10-15`; this
> paragraph is the only change. The documents, probes and raw files it
> names live on in `pooledevents-multical-embeddedview`.

> Desk research 2026-10-15; probes 2026-10-17 and 2026-10-18. Item S3
> of `tasks/resource-calendar-view.md` — a Facebook Page token tried
> from a Worker, and anonymous fetches of event pages from one — with
> what stage 1 left to a real deployment
> (`resource-calendar-stage1-spike.md` §9): its condition 1, the
> share, and its measurements of CPU, latency and quota. Labels:
> **documented** (the vendor's own docs or source code, archived copies
> included), **reported** (a third party; date given), **not found**,
> **measured** (by a probe here); inferences are marked as such. §4 and
> §5 rest on two delegated sweeps whose load-bearing sources were
> re-read here. The raw files, redacted, are in
> `resource-calendar-stage3-study/` (§12); vendor pages were read, not
> kept, and the link references at the end name them.

## 1. The answer

Stage 3 is feasible, Facebook included, but Facebook only on behaviour
Meta does not document. Stage 1's deployment questions have answers:
a share at *See only free/busy* gives the view what it shows and no
more, CPU comes down to about the free plan's 10 ms once a parser fix
is in, and the wall time is Google's.

1. **Facebook, the association's own Page** (§3). A Page token from a
   Business app at Standard Access, never reviewed or verified, reads
   `GET /{page-id}/events` and `GET /{event-id}`, from home and from a
   deployed Worker: times with offsets, a series' occurrences, and
   cancelled events on request. Meta's documents say otherwise: the
   Event reference confines Events on Pages to Marketing Partners, and
   the events edge's reference page has been gone since January 2023
   at the latest (§2.1). What is undocumented may stop without notice;
   a failed call then falls back to stage 2 times, as for any source.
   The token never expires (`expires_at` 0); `debug_token` gives it
   data access until 2027-01-15, which Meta's docs say does not apply
   to these permissions (§2.4). That date will tell.
2. **The other sources** (§4–§7). The Events Calendar and Wix Events
   give `schema.org/Event` JSON-LD with an offset; Modern Events
   Calendar 6.5.6 gives dates only, Events Manager only an `.ics`, and
   Open Graph no times. From a Cloudflare data centre these pages
   answer as from home: no wall, no challenge. Facebook's own event
   page carries no times from either, and turns away an empty
   User-Agent. Facebook therefore by the Graph API only; the rest by
   JSON-LD, or by `.ics` where the page links one.
3. **The share** (§8). Stage 1's condition 1 is met, at a lower level
   than it asked. Shared at *See only free/busy*, the view's service
   account receives a busy event's times only, a Public event in full,
   and a free event not at all: the view's own rule, applied by
   Google. The price: stage 2's grammar and stage 3's URLs are then
   readable only in Public events, a decision left open (§13). At this
   level Google sends a busy series as instances without their master,
   which the spike's reader drops and main's keeps.
4. **CPU** (§7). 33–123 ms per request on the deployed spike, every
   Google event expanding its own time zone from 1970; with each zone
   registered once, 2–16 ms warm and 25–59 ms for a colo's first
   request. The free plan documents 10 ms; nothing was cut off.
5. **Latency and quota** (§7, §9). A request's wall time is Google's
   REPORT: medians about 0.6 s from Tallinn and from home alike on
   2026-10-17, against 279 ms in stage 1's run two days earlier.
   Google's CalDAV quota is 3,000 requests a minute per user and
   10,000 per project, with no daily cap.
6. **Cache** (§7). The Cache API works on workers.dev: a miss, then
   hits. A cache would serve latency and quota, not CPU.

## 2. Meta's documents

Desk research, 2026-10-15, before any app or token existed. The
documents' text is left as found; where the probe (§3) has since
answered a point, the point says so.

### 2.1 Graph API version; `GET /{page-id}/events`, `GET /{event-id}`

- Current version **v26.0**, introduced 29 July 2026, available until
  "TBD"; v25.0 until 29 July 2028, v24.0 until 18 February 2028 —
  **documented** [changelog].
- `GET /{event-id}` is in the v26.0 reference, under "Limitations":
  "Access to Events on Users and Pages is only available to Facebook
  Marketing Partners." Reading requirements are given only for Events on
  an App ("An App access token of an App that created the Event") and on
  a Group ("A User access token of an Admin of the Event" plus the Groups
  API feature) — **documented** [event]. The same sentence stands in
  archived copies of 26 May 2020 and 21 January 2021 — **documented**
  (archive) [event-2020] [event-2021].
- `GET /{page-id}/events`: the v26.0 Page reference has no `events` edge
  (the alphabetical list runs `custom_user_settings`, `fantasy_games`,
  `feed`) — **documented** [page]. The edge's reference is gone: HTTP 404
  at `/docs/graph-api/reference/page/events/`, `…/v26.0/page/events` and
  `…/v2.12/page/events`; "Page Not Found" (HTTP 200) at
  `/documentation/graph-api/reference/page/events`, all checked
  2026-10-15 [pe-404]. Wayback: 200 up to 17 November 2021 (a v12.0
  title, body not captured), 404 from 29 January 2023 — **documented**
  (archive) [pe-cdx]. The last readable copy (13 November 2019, v5.0):
  "This is a restricted edge. You cannot request access at this time.";
  "Only Events for which the requesting User is listed as a Host or Guest
  will be returned."; "Requires a valid Page or User access token with
  basic permissions. Additional permissions are required for Marketing
  and Page management apps." — **documented** (archive) [pe-2019].
- Removal notice: none in the Graph API changelogs v19.0–v26.0 or the
  Pages API changelog (October 2020 – January 2026) — **not found**
  [changelog] [pages-changelog]. The last Events API entry, 4 April 2018:
  "All apps, including formerly approved apps, must undergo App Review in
  order to gain access to the API"; `GET /events` lost the edges
  attending, comments, declined, feed, interested, live_videos, maybe,
  noreply, photos, pictures, posts and videos — **documented** [apr-2018].
- New Pages Experience: the Pages API changelog's lists of endpoints
  available to NPE Pages (2 October 2020, 4 January 2021, 25 March 2021)
  contain neither endpoint — **documented** [pages-changelog]. The later
  NPE page (archived 27 December 2024) defers to each endpoint's
  reference and does not list events among the unsupported —
  **documented** (archive) [npe-2024].
- v26.0 retires legacy protocol features, on all supported versions from
  27 October 2026: `date_format` and root `GET /?ids=…` return an error;
  `If-None-Match` is ignored, ETags and 304 are gone — **documented**
  [v26].
- Meta's Content Library API has a `facebook/events/preview` path, but
  its examples run in a "Secure Research Environment" — **documented**
  [mcl]; a research product, not applicable here.
- Both endpoints answered the probe's Page token, from a never-reviewed
  app (§3).

### 2.2 Permissions and Features for the own Page's events

- `pages_read_engagement` "allows your app to read content (posts,
  photos, videos, events) posted by the Page … The allowed usage for this
  permission is to help a Page Admin administer and manage a Page";
  allowed usage includes "Get content posted by your Page"; depends on
  `pages_show_list` — **documented** [permissions]. This is the only
  current Meta text naming Page events as readable; it contradicts §2.1.
  The probe bears it out (§3).
- Page reference: with `pages_read_engagement` and
  `pages_read_user_content`, "only data owned by the Page is accessible"
  — **documented** [page]. `pages_read_user_content` covers
  user-generated content and `pages_manage_metadata` webhooks and Page
  settings; neither is needed to read the Page's own content.
  `pages_show_list` "allows your app to access the list of Pages a person
  manages" — **documented** [permissions].
- The "Manage everything on your Page" use case: "The following
  permissions are required for this use case and added by default":
  `business_management`, `pages_show_list`, `public_profile` —
  **documented** [usecase].
- The current Pages API overview and guides do not mention events —
  **not found** [pages-overview].
- `pages_events` is listed, its description calling it "page_events",
  but it logs business events (purchase, lead) for ads, unrelated to
  Facebook Events — **documented** [permissions].
  `user_events` is not in the reference — **not found**; in 2018 it was
  put under "heightened scrutiny during Login Review" [apr-2018].
- PPCA covers public data of Pages "for which you lack the
  pages_read_engagement permission and the pages_read_user_content
  permission"; "Readable data includes business metadata, public comments
  and posts"; allowed usage "Analyze and/or display posts and engagement
  on Pages"; common endpoints `/page/feed`, `/page-post`,
  `/page-post/comments`; needs App Review and business verification —
  **documented** [ppca]. Events are not named: PPCA is not needed for the
  own Page and is not shown to reach any Page's events.
- How an app becomes a "Facebook Marketing Partner" for event access:
  **not found**.

### 2.3 Development mode, roles, verification

- "Apps in Development mode can only request permissions from role users
  … Similarly, features will only be active for role users" —
  **documented** [appmodes]. "Apps in Development Mode can request any
  Permission from any app User who has a Role on the app." —
  **documented** [pages-overview].
- Business apps have no modes: "For Business apps, which do not have app
  modes, permissions must be approved for Advanced access before they can
  be granted to your app by an app user without a role on the app itself
  or a role in a Business that has claimed it" — **documented**
  [pages-overview]. "If your app will only be used by people who have a
  role on it, the permissions and features your app requires will only
  need Standard Access"; "All Business, Consumer, and Gaming apps are
  automatically approved for Standard Access for all permissions and
  features" — **documented** [access-levels]. For a Business app the
  design's "development mode" thus reads as Standard Access with role
  users only (inference).
- Roles: Administrators, Developers and Testers each "can grant the app
  any permission while it is in development", with all features active —
  **documented** [roles]. Administrator, Developer and Analytics roles
  need a Meta Developer Account; a Tester may be added only "if they are
  your employee or you have an agreement with them which establishes that
  they are acting on your behalf as a tester of your app" —
  **documented** [roles]. A volunteer Page admin therefore needs a
  developer account, or such an agreement (inference).
- Business verification: "If your app will only be used by app users who
  have a role on the app itself you do not need to complete
  verification; these users can grant your app any permissions at any
  time and all features are always active" — **documented** [bizver].
  Advanced Access requires it — **documented** [access-levels].
- PPCA, on its own testing phase: access only where "the person who holds
  the admin role for the Page also holds an admin, developer, or tester
  role on the app"; "Once you set your app to live mode, it will not be
  able to see any Page public content without this feature." —
  **documented** [ppca]. This describes PPCA, not
  `pages_read_engagement`.
- Server to server: "Access tokens are portable. Once you obtain a token,
  you can use it from any machine"; use `appsecret_proof` for calls from
  the server — **documented** [portability]. "If you obtain a token on a
  client, you can send it to your server for server-to-server calls." —
  **documented** [tokens]. Meta's server-to-server guide assumes Live
  mode after App Review ("We recommend that you only switch to Live mode
  after your app has undergone App Review") — **documented** [s2s]. A
  permanently development-mode app: **not found**; Graph answered the
  probe's never-reviewed app from a Worker (§3).
- Inactive state: apps "may be placed" in it after 90 days with no
  logins, no API calls and no webhooks (whether all three must hold is
  not stated); then "All access tokens associated with the app will be
  invalidated", new tokens are needed, and permissions "removed from the
  app due to disuse" must be re-approved through App Review —
  **documented** [app-states]. Regular Worker calls should keep the app
  active (inference).
- At most 15 apps per person with developer or admin roles that are not
  connected to a verified business — **documented** [create-app].

### 2.4 Token lifetimes, invalidation, renewal

- Short-lived User token "about one to two hours"; long-lived "about 60
  days" (`grant_type=fb_exchange_token`; sample `expires_in` 5183944 s);
  "Do not depend on these lifetimes remaining the same" — **documented**
  [tokens] [long-lived].
- Long-lived Page token from a long-lived User token
  (`GET /{app-scoped-user-id}/accounts`): "do not have an expiration date
  and only expire or are invalidated under certain conditions"; "The
  person requesting the token must have a role on the Page" —
  **documented** [long-lived]. Page tokens are "unique to each Page,
  admin, and app combination" — **documented** [tokens].
- Invalidators: logout or password change (190/460), de-authorisation
  (190/458), expiry (190/463); "Due to security related events, access
  tokens may be invalidated before the expected expiration time";
  "Facebook will not notify you that an access token has become invalid"
  — **documented** [debug-errors]. The app going Inactive (§2.3) —
  **documented** [app-states].
- Data-access expiry (90 days of user inactivity) does not apply to
  `business_management`, `pages_manage_metadata`,
  `pages_read_engagement`, `pages_read_user_content`, `pages_show_list`;
  but "if your app does not use a permission for 90 days, that permission
  may expire" — **documented** [auth-vs-data] [permissions].
  `debug_token` nonetheless gives the probe's Page token a
  `data_access_expires_at` 90 days out (§3).
- The admin losing the Page role invalidates the Page token: **not
  found** in Meta docs; **reported** by Chatlayer (undated vendor doc,
  read 2026-10-15) [chatlayer]. Effect of losing the app role, or of a
  mode switch, on existing tokens: **not found**.
- Renewal: "You can not use an expired token to request a long-lived
  token"; the person goes through the login flow again — **documented**
  [long-lived].
- Alternative: a System User token, for "programmatic, automated actions
  on Ad objects or Pages without requiring input from an app user or
  re-authentication"; generated under Business settings, System Users,
  where one may "choose a token expiration preference"; "endpoints check
  whether the identified user has access to the requested resource"; an
  employee system user "must be granted access to individual assets
  that are owned by, or shared with, your business portfolio" —
  **documented** [tokens]. The Page would thus have to be in, or shared
  with, a business portfolio (inference). A system-user token with a
  development-mode or Standard-Access-only app on a Page: **not found**.
- `debug_token` returns `expires_at`, `data_access_expires_at`,
  `is_valid`, `issued_at`, `error` (code, message, subcode), `profile_id`
  ("For impersonated access tokens, the ID of the page this token
  contains"), `scopes`, `granular_scopes`; it needs an app token or an
  app developer's User token of the same app — **documented**
  [debug-token]. "For long-lived access tokens the issued_at field is
  also returned" — **documented** [debug-errors]. How a non-expiring
  token shows in `expires_at`: **not found**; **measured**: 0 (§3).

### 2.5 Event node fields

- v26.0 reference [event] — **documented**:
  - Default fields: `description`, `end_time` ("End time, if one has been
    set"), `event_times` (`list<ChildEvent>`, "Array of times of a
    multi-instance event"), `name`, `place`, `start_time`.
  - Types: `start_time` and `end_time` "string"; `timezone` "enum",
    values not listed; `updated_time` "datetime", "ISO 8601 formatted";
    `created_time` "datetime".
  - Also `is_canceled` (bool), `is_online` (bool), `online_event_format`,
    `is_page_owned` (bool, "Whether the event is created by page or
    not"), `cover` (CoverPhoto), `ticket_uri` (string), `type` (enum:
    private, public, group, community, friends, work_company,
    messenger_community).
  - Only `can_guests_invite`, `guest_list_enabled`, `is_draft` and the
    `roles` and `ticket_tiers` edges carry "Requires an access token of an
    Admin of the Event"; no other per-field permission is stated.
- ChildEvent reference (the items of `event_times`): HTTP 404 — **not
  found** [child-event].
- Time format: not specified in the current reference — **not found**.
  The 5 July 2012 changelog, "Removing Timezone From Event Times": "events
  have been intended to be created with start and end times that are
  specific to the location of the event so including a timezone in the
  API simply led to confusion"; `timezone` names the zone "as defined" by
  a link to php.net's time-zone list (tz database names); "developers
  reading time in ISO 8601 should be supporting the full standard … Most
  events return local times (no GMT offset), but in the future events
  likely will return other formats (namely date-only and precise)" —
  **documented** (2012) [jul-2012]. `date_format` can no longer coerce
  the form (§2.1) [v26].
- `cover.source`: "Direct URL for the person's cover photo image" (sic);
  nothing on expiry — **documented** [cover-photo]. The event `picture`
  edge needs "A user access token" — **documented** [event-picture].
- **Measured** (§3): `start_time` and `end_time` carry a colon-less
  offset, `2026-10-22T17:00:00+0300`; `timezone` is `Europe/Helsinki`;
  `updated_time` is in `+0000`; the `event_times` items carry `id`,
  `start_time` and `end_time`; `cover.source` differs on every fetch.

### 2.6 Rate limits

- Page and system-user tokens fall under Business Use Case limits; for
  the Pages API "Calls within 24 hours = 4800 * Number of Engaged Users",
  engaged users being "the number of Users who engaged with the Page per
  24 hours"; User and App tokens follow Platform limits, for an app
  token "Calls within one hour = 200 * Number of Users" — **documented**
  [rate-limits].
- Usage is reported in two headers — **documented** [rate-limits]:
  - `X-App-Usage`, whose `call_count` is a "percentage of calls made by
    your app over a rolling one hour period";
  - `X-Business-Use-Case-Usage` (the same page also calls it
    `X-Business-Use-Case`), whose `call_count` is a "percentage of
    allowed calls made by your app over a rolling one hour period",
    although the Pages limit is set per 24 hours; its
    `estimated_time_to_regain_access` is in minutes.
- Errors: 80001 "There have been too many calls to this Page account"
  for a Page or system-user token, 32 for a User token — **documented**
  [page] [rate-limits].
- Floor for a Page with few or no engaged users: **not found**. Whether
  `GET /{event-id}` counts as a Pages API call: **not found**;
  **measured**: with a Page token it reports `X-App-Usage`, the Page
  edges the Pages header (§3).

### 2.7 Terms: storing, caching, displaying

- Platform Terms (last updated 3 February 2026) — **documented** [terms]:
  - "Platform Data" covers anything obtained through Platform, "including
    data … derived from such data", access tokens and app secrets
    included (§12.l).
  - Prohibited: "Processing Platform Data for purposes other than the
    applicable permitted purposes set forth in Meta's Developer Docs"
    (§3.a.viii).
  - Delete Platform Data "as soon as reasonably possible" when "no longer
    necessary for a legitimate business purpose", when the service stops,
    or on Meta's or the User's request (§3.d.i).
  - Sharing only in listed cases (§3.c.ii): legal requirement; with a
    Service Provider; on a User's express direction or consent, with
    proof retained; for data that is not Restricted, with third parties
    bound by contract.
  - "You must protect and not transfer, share, or solicit … access
    tokens, or app secrets, but you may share with a Service Provider who
    helps you … operate your App" (§6.a.iv).
  - A public privacy-policy URL is required (§4.a).
  - No clause on caching (no hit for "cach").
- Data reached with "Pages and Business Assets Permissions" is not
  Restricted Platform Data (page last updated 1 July 2020) —
  **documented** [terms-12n]. The §3.e exceptions to §3.a–d (Messenger
  content, lead data, shops data; last updated 3 February 2025) do not
  cover Page data — **documented** [terms-3e].
- `pages_read_engagement`'s permitted use is "to help a Page Admin
  administer and manage a Page"; its review screencast is to "Showcase
  that the post content is successfully displayed on your app platform"
  — **documented** [permissions]. Whether a public room view showing the
  Page's own event times falls within that purpose, or counts as
  "sharing" under §3.c: **not found**. Reading it as the Page admin's
  express direction (§3.c.ii.3) is inference only.
- Developer Policies (3 February 2026), §11 Pages API: comply with the
  "Pages, Groups and Events Policies"; do not disclose Page admins
  without consent; nothing on caching or display — **documented**
  [devpolicy].
- Image URLs: "Profile picture URLs returned by this edge will expire" is
  documented for user profile pictures only [user-picture]; expiry or
  signing of `cover.source`: **not found**. Meta "expires or rotates
  source URLs over time" for ad-creative images and video sources —
  **reported** (Fivetran doc, undated, © 2026) [fivetran]. The
  `og:image` of the probed event page (§6) was a `lookaside.fbsbx.com`
  crawler URL carrying only a `media_id`, with no visible signature.

## 3. The Page-token probe

**Measured**, 2026-10-17, on a test Page made for the purpose, with
Graph API v26.0. Every call answered 200. The raw responses are in
`graph-local-1.json`, `graph-local-2.json` and `graph-worker.json`.

How the token was made:
- The app: a Business app with the use case "Manage everything on your
  Page", created by the test Page's admin, who thereby holds its
  Administrator role. Standard Access only; never published, reviewed
  or verified. Nothing in the flow asked for App Review or business
  verification.
- `pages_read_engagement` is not among the use case's defaults (§2.2);
  it had to be added under the use case's Customize before Graph API
  Explorer [explorer] offered it.
- In Graph API Explorer, a User token for the app with
  `pages_show_list` and `pages_read_engagement`, the test Page alone
  granted; extended in the Access Token Debugger [token-debugger]
  ("Extend Access Token", no app secret needed); then `GET me/accounts`
  with the extended token gave the Page token. The Debugger shows it as
  a Page token that never expires.

The calls, as a Worker would make them (`probes/graph-calls.mjs`):
- Round one, 12:00 UTC, from home, six calls: `/me` (with a Page
  token, the Page itself: `id` and `name`); `debug_token`;
  `/{page-id}/events`, with default fields and with a `fields` list;
  `/{event-id}`, likewise. One event existed, without a cover.
- Round two, 12:17 UTC, eight calls: round one's, plus the events edge
  with `include_canceled=true` and one occurrence of a series fetched
  by its own ID. The Page then held a single event, now with a cover, a
  weekly series of three and a cancelled event.
- The Worker round, 12:58 UTC: round two from the probe Worker in TLL
  (§7).

The `fields` list: `id`, `name`, `description`, `start_time`,
`end_time`, `timezone`, `event_times`, `is_canceled`, `is_draft`,
`updated_time`, `place`, `is_online`, `type`, `ticket_uri`, `cover`,
`owner`, `is_page_owned`.

What came back:
- `debug_token`, asked with the Page token itself (Meta documents an
  app token or a developer's User token there, §2.4):
  - `type` PAGE, `is_valid` true, `profile_id` the Page, `user_id`
    present;
  - `scopes` `pages_show_list`, `pages_read_engagement` and
    `public_profile`; `granular_scopes` the first two;
  - `expires_at` 0, the documents' open question (§2.4);
  - `data_access_expires_at` 2027-01-15T11:52:46Z: 90 days after
    11:52:46, which is 3 min 29 s before the token's `issued_at`
    (2026-10-17T11:56:15Z), so presumably 90 days from the admin's
    grant in Graph API Explorer (inference).
- Default fields: `description`, `end_time`, `name`, `place`,
  `start_time` and `id`, plus `event_times` for the series: the
  reference's list (§2.5).
- Times: ISO 8601 in the event's local time with a colon-less offset,
  `2026-10-22T17:00:00+0300`; `updated_time` in `+0000`. Node's V8
  parses the form correctly, but it lies outside ECMAScript's
  date-time string format, which wants `+03:00` [ecma-date]: the
  engine's leniency, not the standard. Parse it explicitly
  (inference).
- The series: its top-level `start_time` is the first occurrence's
  start (2026-10-22T17:00:00+0300) and its `end_time` the last one's
  end (2026-11-05T19:00:00+0200), a span of two weeks across the end
  of summer time. `event_times` lists the three occurrences, latest
  first, each with its own `id`, `start_time` and `end_time`; one
  fetched by its ID is an event like any other, without
  `event_times`. A parser must take the occurrences, never the
  top-level span.
- The edge lists events latest start first, with `before` and `after`
  cursors. The cancelled event has `is_canceled` true and is listed
  only with `include_canceled=true`. All three lay in the future;
  whether past events are listed was not tried.
- The other fields: `timezone` `Europe/Helsinki`; `type` `public`;
  `is_draft` and `is_online` false; `is_page_owned` false, although
  every event was created on the Page; `owner` never returned;
  `ticket_uri` absent, none being set. `updated_time` moved when the
  cover was added (11:48:12 to 12:08:15).
- `cover`: `id`, `offset_x`, `offset_y` and `source`. The `source` URL
  differs on every fetch, six of six, its `oh` parameter among the
  changes, presumably a signature. Its `oe` stays the same and, read as
  a hexadecimal Unix time, is 2026-10-21T21:48:34Z, four and a half
  days after the fetch. That it is the URL's expiry is inference;
  untested.
- Rate-limit headers:
  - `/me` and the events edge carry `x-business-use-case-usage` of
    type `pages`: `call_count` 0 in round one, 1 afterwards;
    `estimated_time_to_regain_access` 0.
  - `debug_token` and the event nodes carry `x-app-usage`:
    `call_count` 3 in round one, 4–5 in round two and 3–5 in the
    Worker round; `total_cputime` 0; `total_time` 3–6.
  - So `GET /{event-id}` with a Page token counts against the app's
    Platform limit, not the Pages limit (§2.6). Of what totals these
    are percentages is not shown; with one user, the Platform formula
    gives 200 calls an hour (inference).

## 4. Event plugins and Wix: JSON-LD on single-event pages

| Source | Event JSON-LD by default | `startDate` / `endDate` | Basis |
|---|---|---|---|
| The Events Calendar 6.18.1 (free) | Yes, on single events and calendar views; no admin setting, only the filter `tribe_json_ld_markup` | ISO 8601 with offset (`format('c')`), in the event's own zone (`tribe_events_timezone_mode` defaults to `event`) | **documented** (source) [tec-view] [tec-event]; vendor-group doc: "the Events schema markup is automatically added to your event pages", example "2024-06-15T18:30:00-04:00" (last updated 2 July 2026) [tec-doc] |
| Events Manager 7.4.8 | None: no JSON-LD, microdata or setting | — | **documented** (source) [em-zip]; vendor site search "nothing matched" [em-search] |
| Modern Events Calendar Lite 6.5.6 (last updated 10 May 2022; the last public version) | Off until the settings page is first saved: no `schema` key in the activation defaults, but the form pre-ticks it | Date only (`Y-m-d`): no time, no offset | **documented** (source) [mec-schema] [mec-zip] |
| Wix Events | Yes: "When you create a Wix Events page, Wix automatically creates an Event preset markup for it" | Not stated — **not found**; observed "2024-10-31T12:50:00-04:00" (§6) | **documented** [wix-preset] [wix-patterns] |

- TEC:
  - All-day events are stored as day bounds, so the output should be
    `…T00:00:00±hh:mm` to `…T23:59:59±hh:mm` — **documented** by reading
    the source [tec-zip]; not observed. Multi-day: one Event spanning the
    days — **documented** (source). Recurring events are a Pro feature;
    their markup: **not found**.
  - Offset bugs: forum threads from June 2016 to November 2017 show
    `+00:00` or offset-less values moving events by a day in Google —
    **reported** (e.g. 2016-06-16 [tec-bug-2016], 2017-11-06
    [tec-bug-2017]). Fixes in 4.2.3 (2016-07-20), 4.6.2 (2017-10-18) and
    4.6.3 (2017-11-02, "outputting the correct UTC offset where
    required") — **documented** (changelog in [tec-zip]). Later reports:
    **not found**.
  - With Yoast SEO 19.0 or later the Event joins Yoast's graph
    (`wpseo_schema_graph_pieces`) — **documented** (source) [tec-zip].
    The §6 TEC page (TEC 4.x) had two blocks, Yoast's first and the
    Event second. A parser must therefore search all blocks and `@graph`
    arrays (inference).
- Events Manager: an iCal VEVENT template is its only machine-readable
  event output — **documented** (source) [em-zip]. Third-party add-ons:
  "Structured data for Events Manager" 0.3.1 (last updated 2018-10-21)
  [em-sd]; Xylus "Event SEO" 1.1.6 (2026-08-17; date form not stated)
  [em-xylus].
- MEC:
  - Lite was closed on wordpress.org on 2022-05-11 [mec-closed]; current
    Lite and Pro downloads need registration [mec-install]. Their markup:
    **not found**. The vendor KB says only "You can turn Schema scripts
    on/off" [mec-kb].
  - In 6.5.6 — **documented** (source) [mec-schema]:
    - it prints one block per shown event, in lists and calendars too;
    - multi-day `endDate` is the start plus the period;
    - recurring events get one block per occurrence;
    - all-day events cannot be told apart from timed ones;
    - `offers.validFrom` is `…T00:00` without offset.
  - Time-zone bug reports: **not found**.
- Wix:
  - Fields (start and end date, status, attendance mode, location,
    tickets) are listed in [wix-patterns]. The markup can be excluded or
    converted to custom JSON-LD in SEO Settings [wix-preset]
    [wix-events-seo]. No date or time-zone variables exist [wix-vars].
    All **documented**.
  - Observed (§6):
    - local time with offset;
    - an event with schedule "TBD" had no Event markup;
    - the page state also carries Google Calendar link times in UTC
      (`20241031T165000Z/20241031T180500Z`) and an `.ics` link on
      `wixevents.com` with a signed token.
- `.ics`: TEC prints a per-event `?ical=1` link (observed [b-tec]). Its
  one fetch (§6) gave `DTSTART;TZID=UTC+2:20261104T160000` with no
  `VTIMEZONE`, and a `PRODID` naming TEC 4.6.22.1 [b-tec-ics].
  - "UTC+2" is not an IANA name. TEC's JSON-LD code treats zone strings
    beginning "UTC" as fixed offsets
    (`Tribe__Timezones::timezone_from_utc_offset`) — **documented**
    (source) [tec-event]. The site thus likely uses WordPress's
    fixed-offset zone setting (inference). Under it, a summer event
    would carry +02:00 against Helsinki's +03:00 (inference; not
    observed).
- Open Graph (source 2): the protocol defines no event type and no
  start or end property — **documented** [ogp]. None of the four pages
  in §6 had a time-bearing Open Graph property. Times appeared only in
  prose: TEC `og:title` "(19:00)" and `og:description` "Showtime 19.00";
  Facebook's date-only "perjantai, lokakuu 23 2026".
- Inference:
  - TEC and Wix JSON-LD yield instants.
  - MEC yields days only.
  - Events Manager needs its `.ics`.
  - Open Graph yields no machine-readable time.

## 5. Data-centre egress (Cloudflare Workers)

Facebook:
- robots.txt — **documented** [fb-robots]:
  - "Collection of data on Facebook through automated means is
    prohibited unless you have express written permission from
    Facebook";
  - `User-agent: *` gets `Disallow: /`;
  - `facebookexternalhit` is allowed except for listed paths;
  - a sitemap of future public events is published.
- Crawler UA "facebookexternalhit/1.1" — **documented** [fb-crawler].
- Terms of Service: "You may not access or collect data from our Products
  using automated means … without our prior permission … regardless of
  whether such automated access or collection is undertaken while
  logged-in" — **reported** (third-party capture of 2026-09-12; Meta's own
  page returns only a script shell to curl) [fb-terms]. A 2024 US ruling
  held Meta's terms did not reach logged-out scraping of public data —
  **reported** (Zyte, 2024-01-30) [zyte].
- Login walls for data-centre sources — **reported**:
  - Discourse, 2022-09-13: a log-in box, "usually due to your server IP
    reputation" [discourse];
  - Apify, 2025-07-17: data-centre and VPN IPs blocked, "an unclosable
    login modal" [apify];
  - Scrapfly, 2026-10-09: "datacenter IPs get flagged within minutes"
    [scrapfly];
  - facebook-event-scraper issue #27, 2025-05-27 to 06-30: "FB has block
    lists for free proxy lists" [fes-27];
  - Mobilizon's importer broke on 2025-07-20, cause unknown [mobilizon].
- Meta documents no login wall — **not found**. Nothing specific to
  Cloudflare Worker egress — **not found**.

Wix — **documented**:
- AI-crawler blocking is by robots.txt only [wix-ai].
- Crawlers get a 403 only on password-protected or member-only pages
  [wix-403].
- Platform security is described only generically [wix-sec].
- Blocking of data-centre or Cloudflare IPs: **not found**. Both Wix pages
  in §6 came through Cloudflare (`server: cloudflare`, `__cf_bm`
  cookie), so Cloudflare's bot rules may apply (inference).

WordPress plugins and hosts:
- Solid Security's opt-in "Default Ban List" (HackRepair) returns a 403
  to an empty User-Agent — **documented** (source) [solid-list]
  [solid-module].
- All-In-One WP Security's 6G rule matches User-Agent substrings such as
  `extract`, `harvest`, `loader`, `miner` and `python`. It is off by
  default, and an empty UA is not matched — **documented** (source)
  [aios-6g] [aios-settings].
- Wordfence classifies bots by IP blocklists and JavaScript activity —
  **reported** (staff on the wordpress.org forum, c. July 2022)
  [wordfence].
- Sucuri — **documented** [sucuri]:
  - its bot protection answers with a redirect page;
  - its Emergency DDoS Protection breaks Facebook and Google link
    previews.
- SiteGround:
  - flagged IPs or UAs are "challenged with a Captcha page" —
    **documented** (2017) [sg-2017];
  - the challenge is an HTTP 202 with `sg-captcha: challenge` and a
    JavaScript proof-of-work, with no self-service exemption —
    **reported** (Sprocket Security, 2026-03-10; mySites.guru,
    2026-07-14) [sg-sprocket] [sg-mysites].
- WP Engine "block[s] known malicious bots" [wpengine]. Kinsta defaults
  to "Block malicious traffic"; its "Challenge bots" level blocks when a
  challenge cannot be completed [kinsta]. Both **documented**.

Cloudflare-fronted targets and Worker subrequests — **documented**:
- A Worker's subrequest to another Cloudflare zone carries
  `CF-Connecting-IP` "2a06:98c0:3600::103", the same for every Worker.
  It also carries `CF-Worker`, naming the Worker's zone. Towards a
  non-Cloudflare origin the Worker controls those headers [cf-headers].
- A target can block all other zones' Workers with one rule on
  `cf.worker.upstream_zone` [cf-block-worker].
- Bot Fight Mode cannot be bypassed by WAF custom rules [cf-bfm].
- Super Bot Fight Mode can be, since custom rules run first [cf-sbfm].
- "I'm Under Attack" needs JavaScript [cf-uam].
- Empty User-Agents are allowed by default [cf-waf-ts].
- Challenges carry `cf-mitigated: challenge` [cf-detect].
- How a target zone's bot scoring treats another account's Worker:
  **not found**.

Reported, Cloudflare Workers:
- Bot Fight Mode challenged a Worker's subrequest to its own zone with a
  403 (GitHub PR, 2026-09-30) [gh-bfm].
- chatgpt.com returned 403 to a Worker's fetch (OpenAI forum, 2026-05-28);
  fixed by 2026-06-18 [openai-403].
- A Worker's fetch sent no User-Agent (Miniflare issue, January 2022)
  [miniflare].

Inference:
- Send an explicit User-Agent free of the 6G substrings.
- Do not trust the status alone; 202 and 200 challenge pages exist.
  Check for `sg-captcha` and `cf-mitigated`.
- Treat an expected but missing JSON-LD block as a possible challenge.

§7 fetched §6's pages from a Worker: no wall, no challenge.

## 6. Baseline from this machine

One GET per URL, `curl -sS -L --max-time 20 -D - -o <file>`, curl's
default user agent (curl 8.7.1), 2026-10-15 13:44–13:47 UTC; the `.ics`
at 14:09 UTC. The response headers, the fetch times and the `.ics`, its
description replaced, are in `baseline/`. The page bodies, and the venue
listings searched to find the URLs, are third parties' and were not
kept.

| Page | Status, redirects | Wall or challenge | Machine-readable times | `og:title` / `og:image` | Size |
|---|---|---|---|---|---|
| Facebook event (Kuudes Linja, Helsinki, 23 Oct 2026) [b-fb] | 200, none | None. A logged-out page shell, with a header login form and `"is_checkpointed":false` | None: no JSON-LD and no start or end time anywhere in the HTML. `og:description` gives only the date, in Finnish: "perjantai, lokakuu 23 2026" | Yes / yes (`lookaside.fbsbx.com/lookaside/crawler/media/?media_id=…`) | 670,248 B |
| Wix Events, dated (31 Oct 2024) [b-wix] | 200, none | None; `server: cloudflare`, sets `__cf_bm` | JSON-LD `startDate` "2024-10-31T12:50:00-04:00", `endDate` "2024-10-31T14:05:00-04:00"; `eventStatus` EventScheduled, offline attendance | Yes / no | 1,052,613 B |
| Wix Events, schedule "TBD" (2026 summer) [b-wix-tbd] | 200, none | None; Cloudflare, `__cf_bm` | None: the page state has `scheduleTbd: true` ("Events Occur All Summer Long!") | Yes / yes | 774,233 B |
| The Events Calendar (Suistoklubi, Hämeenlinna, 4 Nov 2026) [b-tec] | 200, none | None (LiteSpeed; the "captcha" hits are a site form's script) | JSON-LD `startDate` "2026-11-04T16:00:00+02:00", `endDate` "2026-11-04T23:00:00+02:00" | Yes / no | 52,439 B |
| Same event, TEC iCal export [b-tec-ics] | 200, none; `text/calendar`, attachment | None | `DTSTART;TZID=UTC+2:20261104T160000`, `DTEND;TZID=UTC+2:20261104T230000`; no `VTIMEZONE` | — | 2,111 B |

Notes:
- The TEC site:
  - runs WordPress 5.5.23, with TEC asset versions 4.6.22.1 and 4.7.19;
  - has Yoast, whose JSON-LD is the first block on the page.
- The TEC times match the page's visible "04/11 @ 16:00 - 23:00". The
  title and `og:description` give the show time, 19:00. JSON-LD carries
  what the editor entered as event times, here the venue's span, not the
  show.
- Facebook answered in Finnish without an `Accept-Language` header, with
  `og:locale` en_US. That the language follows the client's location is
  inference. Its `cache-control` was `private, no-cache, no-store,
  must-revalidate`.

## 7. From a Cloudflare data centre (2026-10-17)

A keyed probe Worker on workers.dev (`resource-view-probe`, compatibility
date 2026-08-01, wrangler 4.118.0); every request was served in TLL
(Tallinn). One GET per page per User-Agent: an explicit one
(`Mozilla/5.0 (compatible; resource-view-spike/0.1)`), curl's
(`curl/8.7.1`, §6's) and none. The Worker reduced each page to §6's
columns, and no HTML left it. Times are `Date.now()` differences inside
a Worker, so I/O only. The answers are in `worker-fetches.txt`, the
Graph calls in `graph-worker.json`. All **measured**, one request each.

Pages:

| Page | Explicit UA | curl's UA | No UA |
|---|---|---|---|
| [b-fb] | 200, §6's logged-out shell, in English: `lang="en"`, `og:description` "Event in Helsinki, Finland … on Friday, October 23 2026"; `"is_checkpointed":false`; no JSON-LD, no times; 590,349 B | the same; 589,925 B | redirected to `/unsupportedbrowser`, "Update Your Browser"; 148,269 B |
| [b-wix] | 200, as §6: 1,052,613 B, JSON-LD `startDate` "2024-10-31T12:50:00-04:00"; `cf-cache-status: HIT`; cookies `ssr-caching`, `sec-fetch-unsupported`, `__cf_bm` | the same | the same |
| [b-wix-tbd] | 200, as §6: 774,233 B, no JSON-LD; `HIT` | the same | the same |
| [b-tec] | 200, as §6: 52,439 B, JSON-LD `startDate` "2026-11-04T16:00:00+02:00" | the same | the same |
| [b-tec-ics] | 200, as §6: 2,111 B, `DTSTART;TZID=UTC+2:20261104T160000`, no `VTIMEZONE` | the same | the same |

- No `cf-mitigated`, no `sg-captcha`, no challenge page, no login wall.
- Facebook refuses an empty User-Agent; §5's inference "send an explicit
  User-Agent" now rests on a measurement.
- Facebook answered in English from TLL and in Finnish from home (§6),
  neither request with `Accept-Language`. That the language follows the
  client's location remains inference; Estonian was not served.
- Every response through the Worker carried `server: cloudflare`,
  `cf-ray` and `cf-cache-status`, Facebook's and the LiteSpeed site's
  included; from home neither had them. Cloudflare adds them to a
  Worker's subrequest, so from a Worker they do not show whether a
  target sits behind Cloudflare.
- Times: Facebook 243–431 ms, Wix 27–228 ms (its own Cloudflare cache),
  TEC 331–569 ms, the `.ics` 105–134 ms.

Graph API, §3's round two from the Worker, 12:58 UTC: all eight calls
200; bodies identical to the local run's apart from the `cover.source`
URLs; 211–809 ms per call against 159–484 ms locally. Through the
Worker, responses lose `content-encoding` and `content-length` and gain
`transfer-encoding` and the three Cloudflare headers.

Cache API: on workers.dev, `caches.default.put` then `match` gave a
miss, a hit, a hit. The docs name custom domains and Pages as having
functional cache operations, and the dashboard editor and Playground as
having none; of workers.dev they say nothing [cf-cache].

Where a request's wall time goes, for the test week (14 events): ten
requests, each timing the token, then two REPORTs in a row
(`worker-fetches.txt`; at home, `split-local.txt`).

| | Token exchange, first request | First REPORT | Second REPORT |
|---|---|---|---|
| Worker in TLL | 37 ms | 463–805 ms, median 599 | 476–646 ms, median 539 |
| The same code under `wrangler dev`, at home | 91 ms | 482–678 ms, median 596 | 524–743 ms, median 583 |

- The wall time is Google's REPORT, the same from TLL as from home.
- It was 247–442 ms, median 279, in stage 1's run (2026-10-15): Google's
  latency varies between days by a factor of two.
- A second REPORT in the same request is no faster.

The deployed spike (`resource-view-spike`, stage 1's Worker with R4's
fields), timed from home with `probes/timing.mjs` at 12:41 UTC: ten
requests for the test week, ten for six weeks (2026-10-04T21:00Z to
11-15T22:00Z), and ten for the week again (`timing-deployed.txt`).
Wall times 565–965 ms (median 694), 520–709 ms (573) and
487–1,256 ms (637); 2,408 B of blocks for the week, 2,969 B for six
weeks. CPU, from the Worker's tail (`wrangler tail --format json`,
`cpuTime`), in ms; `cpu.txt` lists every request the tail caught, all
of the weeks' but only 6 and 4 of the six weeks' ten:

| Run and colo | Test week | Six weeks |
|---|---|---|
| Before the time-zone fix, 12:28 UTC, TLL | 123, 83, 52, 47, 80, 76, 50, 79, 64, 48 | 91, 45, 35, 63, 33, 33 |
| After it, 12:41 UTC, TLL | 59, 16, 16, 6, 7, 10, 9, 5, 7, 6 | 6, 4, 6, 6 |
| After it, 12:41 UTC, ARN (the week again) | 25, 6, 5, 3, 3, 4, 2, 2, 3, 2 | — |

- Before the fix, every Google event expanded its own VTIMEZONE from
  1970: Google sends each event as a VCALENDAR of its own, and ical.js
  prefers an embedded VTIMEZONE to its registry. The fix registers
  each zone once and removes the VTIMEZONE
  (`worker/src/caldav.ts`, `registerTimezones()`).
- After it, a warm request costs 2–16 ms; the first in each colo,
  presumably a fresh isolate's, 59 ms in TLL and 25 ms in ARN.
- The six-week window holds few more events than the week, so its CPU
  says little about longer spans.
- Every request ended `ok`. The free plan documents 10 ms of CPU per
  request [cf-limits]; how that is enforced was not studied, but
  nothing over it was cut off.

## 8. The reader share at both levels

**Measured**, 2026-10-18. Stage 1 read the room as its owner, and its
condition 1 asked for a rerun on a share. A calendar of the author's
own was shared with the spike's service account, first at *See all
event details*, then at *See only free/busy*, and read at each with
the Worker's own REPORT (`probes/report.mjs`) over 2026-10-18T21:00Z
to 10-25T22:00Z (`reader-details.xml`, `reader-freebusy.xml`); at
free/busy also over 10-22T12:00Z to 10-25T22:00Z
(`reader-freebusy-narrow.xml`). Its six events were made in Google
Calendar's editor:

| Event | *See all event details* | *See only free/busy* |
|---|---|---|
| *Oletus*, defaults | In full: `TRANSP:OPAQUE`, no `CLASS`, empty `DESCRIPTION` and `LOCATION` | Times only |
| *Yksityinen*, Private | Times only | Times only |
| *Julkinen*, Public | In full, `CLASS:PUBLIC` | The same bytes as at details |
| *Vapaa*, free | In full, `TRANSP:TRANSPARENT` | Absent |
| *Koko päivä*, all-day | In full, `VALUE=DATE`, `TRANSP:TRANSPARENT`: free by the editor's default | Absent |
| *Sarja*, daily 10:00–11:00 for three days, the middle one set free | The master, `RRULE:FREQ=DAILY;UNTIL=…`, `TRANSP:OPAQUE`, and the middle day's override, `TRANSP:TRANSPARENT` | The first and third days as two VEVENTs with `RECURRENCE-ID`s in UTC and no master; the free day absent |

- "Times only" is `DTSTART`, `DTEND`, `DTSTAMP`, `UID` and an
  `ATTENDEE` naming the calendar itself: no `SUMMARY`, no `CLASS`, no
  `TRANSP`, so busy. The owner's address appears at neither level.
- At free/busy Google expands a series itself, bounded by the
  REPORT's time-range: the narrow window returns the third day's
  instance alone. The instances keep the master's `UID`, and their
  `DTSTART` its `TZID`.
- At details, a Private event is stripped exactly as every busy event
  is at free/busy, and every other event comes in full: the view's
  Worker would hold every title not marked Private, and its own code
  would be the boundary (`resource-calendar-stage1-spike.md` §4).
- At free/busy the Worker receives what the view shows and no more:
  times for busy events, titles for Public ones, nothing for free
  ones. The price is text: stage 2's grammar and stage 3's URLs are
  readable only in Public events, and a member's non-Public booking
  keeps stage 1's default buffers.
- The spike's `eventsIn()` skips every VEVENT with a `RECURRENCE-ID`,
  reaching overrides only through their master, so at free/busy a busy
  series vanishes from its view. Main's reader takes an override whose
  master is absent from its VCALENDAR as an event of its own, since
  `e0cf7c5` (2026-10-17), prompted by another of Google's prunings: the
  master left out when only a moved occurrence overlaps the window.
- Not tried: a Public event with a description, at free/busy; a busy
  all-day event; a Workspace domain whose external sharing is capped
  at free/busy, under which stage 1 §9 guessed that even Public titles
  would read "busy". On a per-calendar free/busy share a Public event
  comes in full.

## 9. Google's quota

**Measured**, 2026-10-18: the Service Usage API's quota metrics
(`v1beta1`, `consumerQuotaMetrics`) for the spike's Cloud project, read
as its owner (`quota-caldav.json`, `quota-calendar-json.json`; the
project number masked).

| Service | Per minute per project per user | Per minute per project | Per day |
|---|---|---|---|
| CalDAV API, `caldav.googleapis.com` | 3,000 | 10,000 | — |
| Calendar API, `calendar-json.googleapis.com` | 600 | 10,000 | — |

- No daily limit and no override on either.
- A service account is its requests' user (inference), so one view
  Worker may send 3,000 REPORTs a minute, 50 a second. Uncached, a
  page request costs one REPORT; stage 1's condition 3, a per-IP rate
  limit or bounded cache keys, keeps a view far below that.
- Not verified: Google's answer over the limit, and whether CalDAV
  requests also draw on the Calendar API's quota, as stage 1 §9
  asked. CalDAV's own metric suggests they do not (inference).

## 10. The 2026-10-12 claims

The task's stage 3 rests on a search of 2026-10-12, to be verified
against Meta's own documents.

| Claim | The documents (§2, §5) | Measured (§3, §7) |
|---|---|---|
| "the old `page_events` permission is gone" | Wrong in letter: `pages_events`, which its description calls "page_events", is still listed, but serves ads business events. No current permission is dedicated to Page events (not found). | — |
| Other Pages' events need PPCA (App Review plus business verification) | PPCA does need both. But it names posts, comments and metadata, not events, and the Event node's Marketing Partner limit applies regardless. | Not tried: the probe read its own Page only. |
| An anonymous datacenter fetch most likely meets a login wall | Reported only (2022–2026), not documented. | No wall from Tallinn: Facebook's logged-out shell, without times; an empty User-Agent redirected to `/unsupportedbrowser`. |
| A Page's own events are readable with that Page's token | Contradicted by the Event reference; supported only by the `pages_read_engagement` description. | Readable through both endpoints, from home and from a Worker. |
| A development-mode app reaches Pages whose admin holds an app role | Documented for permissions and features; for Business apps the equivalent is Standard Access. It does not lift the Marketing Partner limit (inference). | A Standard-Access Business app, its Administrator the Page's admin, read the Page's events: the limit was not applied. |

The task's own list to verify: `pages_show_list` and
`pages_read_engagement` sufficed for both endpoints (fewer were not
tried); a never-reviewed app sufficed for server-side reads; the Page
token does not expire, and once invalidated is made anew by the same
flow (§2.4); an event returns `start_time`, `end_time`, `cover` and
`place`.

## 11. Open points

Facebook:
- It runs on undocumented behaviour, which may end without notice; the
  fallback is stage 2 times, visible to staff.
- Whether events created by Page admins without an app role show.
- Whether the token survives the admin losing the app role or the Page
  role, a password change, or the app going Inactive after 90 days
  unused (§2.3); regular Worker calls should keep it active
  (inference).
- Whether reads stop at `data_access_expires_at`, 2027-01-15, which
  Meta's docs say does not apply to these permissions (§2.4). A call on
  that date settles it, if the probe app and token are kept until
  then.
- The Pages limit's floor for a Page with few engaged users; usage
  stayed at 0–1 per cent here.
- `cover.source`'s lifetime: its `oe` says 2026-10-21T21:48Z
  (inference).
- Whether a public room view of the Page's own events fits
  `pages_read_engagement`'s permitted purpose (§2.7): **not found**.
- The probe used a test Page; the association's own Page was not
  tried.

Other sources:
- Wix's date form is undocumented; one observed page gave local time
  with offset.
- Current MEC (7.x, Pro) markup is unknown; 6.5.6 gave dates only.
- TEC's all-day output was read from source, not observed; TEC Pro's
  recurring markup was not found.
- `.ics` forms beyond one TEC site were not studied, though they are
  Events Manager's only machine-readable output; the one seen named a
  non-IANA zone, `UTC+2`, with no `VTIMEZONE` (§4).

Google:
- The free/busy cases not tried (§8).
- Google's answer over quota, and CalDAV against the Calendar API's
  quota (§9).
- REPORT latency doubled between two days (§7); a cache is the remedy
  should it matter.

The task's open questions C (direction of correction), D (calendar
kind), E (host site) and G (who holds the Meta app) stand.

## 12. Files and reruns

The raw files are in `resource-calendar-stage3-study/`, redacted: in
the Graph files the Page, app, user and event IDs, the Page's name and
venue, image and ticket URLs, paging cursors and Meta's trace headers;
in the CalDAV files the calendar IDs; in the quota files the project
number; in the page headers, cookie values, request and trace IDs, and
the connection quality Facebook reported.

| File | What | Made by |
|---|---|---|
| `graph-local-1.json`, `graph-local-2.json` | §3's rounds one and two from home: request, status, time, headers and body per call | `probes/meta.mjs` |
| `graph-worker.json` | Round two from the probe Worker | `probes/meta.mjs`, `PROBE_URL` set |
| `worker-fetches.txt` | §7's Cache API, page fetches and REPORT split, from the probe Worker | `probes/probe.mjs` |
| `split-local.txt` | The split under `wrangler dev` at home | the probe Worker, run locally |
| `timing-deployed.txt` | The deployed spike, timed from home | `probes/timing.mjs`, `WORKER_URL` set |
| `cpu.txt` | Each request's time, colo, path, status, outcome, CPU and wall time from the deployed spike's tail; no addresses | `wrangler tail --format json`, extracted |
| `reader-details.xml`, `reader-freebusy.xml`, `reader-freebusy-narrow.xml` | §8's REPORTs | `probes/report.mjs` with `reader` |
| `quota-caldav.json`, `quota-calendar-json.json` | §9's quota metrics | the Service Usage API |
| `baseline/` | §6's response headers, the `.ics`, fetch times and curl's version | curl |

The probes are in `../spike/resource-view/`: `probes/` run from there;
`worker/src/probe.mjs` is the probe Worker, deployed for a run and
then deleted (`worker/wrangler.probe.toml`). Each names, in its head
comment, the files its secrets come from; none is in the repository.

## 13. Closing

### Per stage

- **Stage 1** stands on stage 1's conditions
  (`resource-calendar-stage1-spike.md` §9). This study meets the
  first, at *See only free/busy* rather than *See all event details*
  (§8), and adds two: a reader that keeps masterless instances, as
  main's does, and each zone registered once, without which a week
  costs 33–123 ms of CPU (§7). Its measurements are in (§7, §9): CPU
  2–16 ms warm against the free plan's documented 10 ms, nothing cut
  off; the wall time Google's; quota ample.
- **Stage 2** is untouched, except that at free/busy its grammar is
  readable only in Public events (§8).
- **Stage 3** is feasible. JSON-LD (The Events Calendar, Wix Events)
  and `.ics` answer a Worker as they answer a home connection;
  Facebook answers only through the Graph API, on behaviour Meta does
  not document (§3). Every source needs the fallback to stage 2 times
  that the task already specifies; the task's fetch rules gain an
  explicit User-Agent and a check for challenge pages (§5).
- **Stage 4**: the cover's URL changes on every fetch and its `oe`
  suggests a life of days (§3, inference), as the task assumed; its
  link-out with the association's own image stays the honest version.

### Decisions this leaves

- The share level: free/busy keeps every non-Public title out of the
  view's Worker; details lets stage 2's grammar work in every event
  not marked Private (§8).
- Whether to build on undocumented Graph behaviour at all, and if so
  who holds the Meta app (open question G). The probe's app and token
  can answer the 2027-01-15 question only if kept until then.
- The task's open questions C, D and E.

## Link references

[changelog]: https://developers.facebook.com/docs/graph-api/changelog
[v26]: https://developers.facebook.com/docs/graph-api/changelog/version26.0/
[event]: https://developers.facebook.com/docs/graph-api/reference/event/
[event-2020]: https://web.archive.org/web/20200526184123/https://developers.facebook.com/docs/graph-api/reference/event/
[event-2021]: https://web.archive.org/web/20210121155045/https://developers.facebook.com/docs/graph-api/reference/event/
[page]: https://developers.facebook.com/docs/graph-api/reference/page/
[pe-404]: https://developers.facebook.com/docs/graph-api/reference/v26.0/page/events
[pe-cdx]: https://web.archive.org/cdx/search/cdx?url=developers.facebook.com/docs/graph-api/reference/page/events/&from=2019
[pe-2019]: https://web.archive.org/web/20191113223731/https://developers.facebook.com/docs/graph-api/reference/page/events/
[pages-changelog]: https://developers.facebook.com/documentation/pages-api/changelog
[apr-2018]: https://developers.facebook.com/docs/graph-api/changelog/non-versioned-changes/apr-4-2018
[npe-2024]: https://web.archive.org/web/20241227125613/https://developers.facebook.com/docs/pages-api/new-pages-experience
[mcl]: https://developers.facebook.com/docs/content-library-and-api/content-library-api/guides/fb-events/
[permissions]: https://developers.facebook.com/docs/permissions/
[usecase]: https://developers.facebook.com/documentation/development/create-an-app/pages-use-case
[ppca]: https://developers.facebook.com/docs/features-reference/page-public-content-access
[appmodes]: https://developers.facebook.com/documentation/development/build-and-test/app-modes
[pages-overview]: https://developers.facebook.com/documentation/pages-api/overview
[roles]: https://developers.facebook.com/documentation/development/build-and-test/app-roles
[bizver]: https://developers.facebook.com/documentation/development/release/business-verification
[access-levels]: https://developers.facebook.com/docs/graph-api/overview/access-levels
[s2s]: https://developers.facebook.com/documentation/development/create-an-app/server-to-server-apps
[portability]: https://developers.facebook.com/documentation/facebook-login/access-tokens/portability
[tokens]: https://developers.facebook.com/documentation/facebook-login/guides/access-tokens
[long-lived]: https://developers.facebook.com/documentation/facebook-login/guides/access-tokens/get-long-lived
[auth-vs-data]: https://developers.facebook.com/documentation/facebook-login/auth-vs-data
[debug-errors]: https://developers.facebook.com/docs/facebook-login/access-tokens/debugging-and-error-handling
[debug-token]: https://developers.facebook.com/docs/graph-api/reference/debug_token
[app-states]: https://developers.facebook.com/documentation/development/create-an-app/app-dashboard/app-states
[create-app]: https://developers.facebook.com/documentation/development/create-an-app
[chatlayer]: https://docs.chatlayer.ai/channels/facebook/facebook-admin-removal
[child-event]: https://developers.facebook.com/docs/graph-api/reference/child-event/
[jul-2012]: https://developers.facebook.com/docs/graph-api/changelog/non-versioned-changes/jul-5-2012
[cover-photo]: https://developers.facebook.com/docs/graph-api/reference/cover-photo/
[event-picture]: https://developers.facebook.com/docs/graph-api/reference/event/picture/
[rate-limits]: https://developers.facebook.com/docs/graph-api/overview/rate-limiting
[terms]: https://developers.facebook.com/terms/
[terms-12n]: https://developers.facebook.com/terms/12n/
[terms-3e]: https://developers.facebook.com/terms/3e/
[devpolicy]: https://developers.facebook.com/devpolicy/
[user-picture]: https://developers.facebook.com/docs/graph-api/reference/user/picture/
[fivetran]: https://fivetran.com/docs/connectors/applications/facebook-ads/troubleshooting/url-signature-expired
[tec-view]: https://plugins.svn.wordpress.org/the-events-calendar/tags/6.18.1/src/Tribe/Views/V2/Template/JSON_LD.php
[tec-event]: https://plugins.svn.wordpress.org/the-events-calendar/tags/6.18.1/src/Tribe/JSON_LD/Event.php
[tec-zip]: https://downloads.wordpress.org/plugin/the-events-calendar.6.18.1.zip
[tec-doc]: https://docs.nexcess.com/software/the-events-calendar/events-seo/
[tec-bug-2016]: https://theeventscalendar.com/support/forums/topic/google-search-crawlingdisplaying-incorrect-date-from-plugins-json/
[tec-bug-2017]: https://theeventscalendar.com/support/forums/topic/utc-issue/
[em-zip]: https://downloads.wordpress.org/plugin/events-manager.7.4.8.zip
[em-search]: https://wp-events-plugin.com/?s=schema
[em-sd]: https://wordpress.org/plugins/structured-data-for-events-manager/
[em-xylus]: https://wordpress.org/plugins/event-schema/
[mec-closed]: https://wordpress.org/plugins/modern-events-calendar-lite/
[mec-install]: https://support.webnus.net/en/article/installation-berovs/
[mec-kb]: https://support.webnus.net/en/article/general-settings-xpa3of/
[mec-schema]: https://plugins.svn.wordpress.org/modern-events-calendar-lite/tags/6.5.6/app/features/schema.php
[mec-zip]: https://downloads.wordpress.org/plugin/modern-events-calendar-lite.6.5.6.zip
[wix-preset]: https://support.wix.com/en/article/understanding-preset-markups-for-your-sites-pages
[wix-patterns]: https://support.wix.com/en/article/default-settings-for-seo-patterns
[wix-events-seo]: https://support.wix.com/en/article/wix-events-optimizing-seo-settings
[wix-vars]: https://support.wix.com/en/article/using-variables-in-seo-settings
[ogp]: https://ogp.me/
[fb-robots]: https://www.facebook.com/robots.txt
[fb-crawler]: https://developers.facebook.com/docs/sharing/webmasters/web-crawlers/
[fb-terms]: https://conductatlas.com/platform/meta/meta-terms-of-service/automated-data-collection-restrictions/
[zyte]: https://www.zyte.com/blog/california-court-meta-ruling/
[discourse]: https://meta.discourse.org/t/facebook-oneboxes-not-working-on-my-forums/238906
[apify]: https://blog.apify.com/scrape-facebook-python/
[scrapfly]: https://scrapfly.io/blog/posts/how-to-scrape-facebook
[fes-27]: https://github.com/francescov1/facebook-event-scraper/issues/27
[mobilizon]: https://framacolibri.org/t/event-importer-from-facebook-into-mobilizon/26702
[wix-ai]: https://support.wix.com/en/article/blocking-ai-crawlers-from-your-site
[wix-403]: https://support.wix.com/en/article/google-search-console-403-error
[wix-sec]: https://support.wix.com/en/article/wix-security-measures-overview
[solid-list]: https://plugins.svn.wordpress.org/better-wp-security/trunk/core/modules/ban-users/lists/hackrepair-apache.inc
[solid-module]: https://plugins.svn.wordpress.org/better-wp-security/trunk/core/modules/ban-users/module.json
[aios-6g]: https://plugins.svn.wordpress.org/all-in-one-wp-security-and-firewall/trunk/classes/firewall/rule/rules/6g/rule-block-user-agents-6g.php
[aios-settings]: https://plugins.svn.wordpress.org/all-in-one-wp-security-and-firewall/trunk/classes/wp-security-configure-settings.php
[wordfence]: https://wordpress.org/support/?p=15837730
[sucuri]: https://docs.sucuri.net/?p=130
[sg-2017]: https://www.siteground.com/blog/new-anti-bot-ai
[sg-sprocket]: https://www.sprocketsecurity.com/blog/please-show-your-work-bypassing-javascript-proof-of-work-captchas
[sg-mysites]: https://mysites.guru/blog/siteground-captcha-blocking-mysites-guru/
[wpengine]: https://wpengine.com/support/wp-engines-security-environment/
[kinsta]: https://kinsta.com/docs/wordpress-hosting/mykinsta-tools/wordpress-tools-bot-protection
[cf-headers]: https://developers.cloudflare.com/fundamentals/reference/http-headers/
[cf-block-worker]: https://developers.cloudflare.com/waf/custom-rules/use-cases/block-worker-subrequests/
[cf-bfm]: https://developers.cloudflare.com/bots/get-started/bot-fight-mode/
[cf-sbfm]: https://developers.cloudflare.com/bots/get-started/super-bot-fight-mode/
[cf-uam]: https://developers.cloudflare.com/fundamentals/reference/under-attack-mode/
[cf-waf-ts]: https://developers.cloudflare.com/waf/managed-rules/troubleshooting/
[cf-detect]: https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/detect-response
[gh-bfm]: https://github.com/serpcompany/zenbujapanese-monorepo/pull/541
[openai-403]: https://community.openai.com/t/cimd-fetch-failed-with-403-from-cloudflare-worker/1381961
[miniflare]: https://github.com/cloudflare/miniflare/issues/139
[b-fb]: https://www.facebook.com/events/1435723122103285
[b-wix]: https://baruchactuarialsoc.wixsite.com/bass/event-details/actex-workshop
[b-wix-tbd]: https://wsqpadvisorycouncil.wixsite.com/washingtonsquarepark/event-details/2026-summer-programs
[b-tec]: https://www.suisto.fi/event/ke-4-11-aatulove-1900/
[b-tec-ics]: https://www.suisto.fi/event/ke-4-11-aatulove-1900/?ical=1
[cf-cache]: https://developers.cloudflare.com/workers/runtime-apis/cache/
[cf-limits]: https://developers.cloudflare.com/workers/platform/limits/
[explorer]: https://developers.facebook.com/tools/explorer/
[token-debugger]: https://developers.facebook.com/tools/debug/accesstoken/
[ecma-date]: https://tc39.es/ecma262/#sec-date-time-string-format
