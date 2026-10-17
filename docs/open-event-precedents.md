# Precedents for `OPEN` events — a survey

> Research, 2026-10-14. What commercial schedulers, open-source projects
> and the calendar standards do where this project paints availability
> as `OPEN` events, how their choices compare with ours, and what
> follows for the decisions pending on the board's cards
> `decide-re-check-open-coverage-at-booking-2026-10-14` and
> `decide-events-marked-free-should-not-block-2026-10-14`.
> [ARCHITECTURE.md](../ARCHITECTURE.md) §2 and §4 stay
> authoritative for our mechanisms; they are described here only as far
> as the comparison needs. Nothing here is committed scope. External
> sources were read on 2026-10-14. Facts marked *(search extract)* rest
> on a search engine's extraction of a page that could not be fetched:
> verify them before citing anything from here in ARCHITECTURE.md.

The convention is not new; most of its mechanics are. YouCanBookMe has
sold calendar events painted as availability since 2013, six other
vendors have followed, and Google ran a special-event variant from 2011
to 2024. Three open-source projects do the same, and RFC 7953
standardises the idea as `VAVAILABILITY`, which Google and Radicale
cannot store and almost no client can author. We share with them the
inversion itself (events minus busy time, not rules minus busy time),
bookings overlaid as new events and, with two open-source projects,
separate calendars for availability and bookings. What appears to be
ours alone: overlap and abutment treated differently, slot phase
anchored to each merged interval, a title marker made safe beside
bookings by uid provenance, and a signed listing standing in for an
availability check at booking. The comparison supports both pending
decisions. Our rule that every non-`OPEN` event blocks is stricter than
the standards, every server examined and nearly every scheduler, so Free
and cancelled events should stop blocking; and the open-source
precedents whose booking path was read re-check availability there, as
the coverage decision proposes. Practitioners need guidance the setup
documents lack:
above all, that `OPEN` events are best marked Free where their app
allows, and that a cancellation inside a deleted `OPEN` event does not
reopen its slot.

## 1. Title-marked availability has been on sale since 2013

YouCanBookMe's "On duty events", captured in September 2013, already
turned the default round: "the system will stop offering any times to be
booked unless it can find a matching stencil event" ([YCBM, Wayback
2013](https://web.archive.org/web/20130924205422/http://youcanbook.me/feature/onduty)).
Renamed twice, now Calendar Managed Availability, it is still sold on
paid plans
([YCBM](https://ycbm.capacity.com/article/396932/setting-up-calendar-managed-availability)).
FreeBusy followed by December 2020 with `#free` events
([FreeBusy](https://help.freebusy.io/en/articles/1733744-how-do-i-mark-when-i-m-available)),
SavvyCal by May 2021
([SavvyCal](https://docs.savvycal.com/article/27-time-blocks-to-define-availability)),
Koalendar by April 2022 in wording visibly modelled on SavvyCal's
([Koalendar](https://help.koalendar.com/article/62-set-availability-from-your-google-calendar)),
SimplyMeet.me in February 2023
([SimplyMeet.me](https://news.simplymeet.me/how-to-use-reverse-calendar-sync-with-simplymeet-me/)),
Apptoto at an unknown date
([Apptoto](https://www.apptoto.com/apptoto-manual/article/online-booking-pages/availability-pages/availability/))
and meetergo in December 2025, the only vendor found that reads CalDAV
and ICS sources
([meetergo](https://help.meetergo.com/en/scheduling/availability/add-availability-from-calendar)).
Google's appointment slots (2011–2024) are the one retirement, and weak
evidence against the pattern: the block was a special event type owned
by Google's booking logic rather than a user-drawn event read by a rule,
it apparently checked no other calendar, and Google replaced it "to
create a cohesive user experience" ([Workspace
Updates](https://workspaceupdates.googleblog.com/2024/03/transition-from-appointment-slots-to-schedules-google-calendar.html)).

The mainstream schedulers lack the feature. Calendly, HubSpot Meetings,
SuperSaaS, Zoho Bookings, SimplyBook.me, Doodle and Google's appointment
schedules take availability from in-app rules and let calendar events
only block
([Calendly](https://calendly.com/help/how-to-set-your-availability);
[HubSpot](https://knowledge.hubspot.com/meetings-tool/why-does-my-availability-for-meetings-not-match-my-integrated-calendars);
[SuperSaaS](https://www.supersaas.com/info/doc/integration/synchronize);
[Zoho](https://help.zoho.com/portal/en/kb/bookings/my-profile/articles/working-hours);
[SimplyBook.me](https://help.simplybook.me/wiki/Calendar_Sync_custom_feature);
[Doodle](https://help.doodle.com/en/articles/10300817-booking-page-troubleshooting-and-faq);
[Google](https://support.google.com/calendar/answer/190998?hl=en)), as
do Acuity and Microsoft Bookings *(search extract)*. The line follows
the market: tools for teams keep rules, tools for individuals with
irregular weeks add painted availability, and a solo practitioner
belongs to the second group. Nylas and Cronofy accept explicit windows
in place of rules, but pushed by API into their own stores
([Nylas](https://developer.nylas.com/docs/v3/scheduler/managing-availability.md);
[Cronofy](https://docs.cronofy.com/developers/api/scheduling/available-periods/)).
The field calls the pattern "positive availability" (meetergo) or
"calendar-managed availability" (YouCanBookMe).

## 2. Open source has three implementations and recurring demand

SergeyMosin's Nextcloud Appointments app is the mature one. Its External
mode (2020) makes every timed, public event marked Free in a Source
calendar bookable, and writes bookings to a Destination calendar, which
must be a different one
([help.php](https://github.com/SergeyMosin/Appointments/blob/442544b964c55f44490aec1fc35b47608d07fe3b/templates/help.php#L121-L126);
[BackendUtils.php](https://github.com/SergeyMosin/Appointments/blob/442544b964c55f44490aec1fc35b47608d07fe3b/lib/Backend/BackendUtils.php#L1733-L1741)).
Its maintainer preferred a category to a title word, which might collide
with a planned feature, "plus there are different languages"
([#100](https://github.com/SergeyMosin/Appointments/issues/100)), and in
October 2026 declined to subdivide events into slots
([#664](https://github.com/SergeyMosin/Appointments/issues/664)).
justinrubek/calendar-scheduler, a Rust experiment dormant since 2023,
has our two roles: every event in its availability calendar counts,
every event in its booked calendar subtracts
([README](https://github.com/justinrubek/calendar-scheduler)). A
WordPress plugin by SKAWINSKI GmbH (January 2026, no stars) subdivides
windows whose title contains a keyword, `VERFÜGBAR` by default, in one
calendar shared with its bookings
([caldav-booking.php](https://github.com/SKAWINSKI-GmbH/wordpress-caldav_booking_plugin/blob/1b47b73dd7b3b3ba0c6ae3387162598ab7211241/caldav-booking.php#L1655-L1670)).
None of the thirteen other projects examined (Cal.diy,
Easy!Appointments, calrs, Tymeslot and Nextcloud's built-in Appointments
among them) defines availability from events; those with any
availability model subtract busy time from rules. Rules need a store and
painted events do not, which matters to a design without a database.

Requests for the inverse recur nonetheless, from people whose
availability follows travel or changes weekly
([cal.diy#6881](https://github.com/calcom/cal.diy/issues/6881);
[easyappointments#1578](https://github.com/alextselegidis/easyappointments/issues/1578);
[woocommerce-appointments#758](https://github.com/bookingwp/woocommerce-appointments/issues/758)),
and Cal.com's own team keeps a title-based "Time blocks" ticket open
([cal.diy#13305](https://github.com/calcom/cal.diy/issues/13305)). The
maintainers' objections meet choices already made here. Nextcloud's
designers wanted the personal calendar "protected from malicious action"
([nextcloud/calendar#1023](https://github.com/nextcloud/calendar/issues/1023));
our availability role is read-only. Cal.com lacked a calendar UI
([cal.diy#18198](https://github.com/calcom/cal.diy/issues/18198)); the
practitioner's own client is ours.

## 3. The standard exists, but nobody paints it

RFC 7953 (2016) is the only standard for positive availability. A
`VAVAILABILITY` component makes its range busy except where recurring
`AVAILABLE` subcomponents free it, `PRIORITY` layers overrides over a
base week, and free-busy is computed from the available time first,
events then being overlaid "in the usual way" ([RFC 7953
§4](https://www.rfc-editor.org/rfc/rfc7953.html#section-4),
[§5](https://www.rfc-editor.org/rfc/rfc7953.html#section-5)). It was
written for office hours in colleagues' free-busy lookups, not for
booking pages. Our convention is that algorithm in `VEVENT` clothing:
the availability calendar acts as an unbounded `VAVAILABILITY`, each
`OPEN` event as an `AVAILABLE`, and the blocking step of
[ARCHITECTURE.md](../ARCHITECTURE.md) §4 as the overlay. Where the RFC
layers priorities, we delete or except occurrences, which is less
general but possible in every client. The RFC admits only `DATE-TIME`
values, leaving all-day availability outside its model
([§3.1](https://www.rfc-editor.org/rfc/rfc7953.html#section-3.1)).

Adoption rules it out as our source. Cyrus implements it fully, though
whether Fastmail, built on Cyrus, enables it is unverified. SabreDAV,
and with it Nextcloud and Baïkal, keeps one `VAVAILABILITY` in the
scheduling Inbox and refuses the component in calendars
([CalDavBackend.php](https://github.com/nextcloud/server/blob/master/apps/dav/lib/CalDAV/CalDavBackend.php)).
Google's CalDAV is `VEVENT`-only
([Google](https://developers.google.com/workspace/calendar/caldav/v2/guide)),
iCloud advertises no `calendar-availability`, and Radicale 3.7.7
answered a `PUT` of the component with 400 in a local test. The only
authoring interfaces found are Nextcloud's weekly-hours settings page
([convert.js](https://github.com/nextcloud/calendar-availability-vue/blob/main/src/convert.js))
and Apple Calendar's account Availability controls
([Apple](https://support.apple.com/guide/calendar/icl26669/mac)). No
successor is coming: JMAP Calendars knows availability only as computed
busy periods
([draft-ietf-jmap-calendars](https://datatracker.ietf.org/doc/html/draft-ietf-jmap-calendars)),
and the JSCalendar mapping lists `VAVAILABILITY` as not convertible
([draft-ietf-calext-jscalendar-icalendar](https://datatracker.ietf.org/doc/html/draft-ietf-calext-jscalendar-icalendar)).
The `VEVENT` stays CalDAV's only universally writable and universally
visible primitive, and a convention over it the pragmatic choice.

## 4. Seven choices across ten designs

The table sets ours beside the precedents documented well enough to
compare; a dash means undocumented. SavvyCal, FreeBusy and Koalendar
document little beyond their marker and appear only in the text.

| Design | Marker | Marker's Free/Busy | Subdivision and phase | Overlap; abutment | Recurrence | Bookings go to | What blocks |
|---|---|---|---|---|---|---|---|
| **Ours** | `SUMMARY` exactly `OPEN`, availability role only, uid not `booking-…` | ignored | stepped from each merged interval's start | merged; abutment leaves a seam | expanded in the Worker | booking calendar, which may be the same one | every other event in either calendar that is not Free; the system's own bookings block whatever their transparency (until 2026-10-17 Free events blocked too, as did an `OPEN` event in a separate store) |
| YouCanBookMe | key phrase in title; documented as exact and case-sensitive, matched as substring | must be Free | global grid; events must sit on it | union across calendars; — | yes | linked calendar, on top of the block | Busy events, declined invitations |
| Google appointment slots, 2011–24 | special event type | n/a | block split into slots of a chosen length | — | yes; booked slots duplicated when a block was made recurring | new event, inside the block | its own bookings; apparently nothing else |
| meetergo | exact title | Free on Google, Outlook; Busy on iCloud, CalDAV, ICS | — | — | — | — | non-Free events, rules per provider |
| SimplyMeet.me | every event in a dedicated calendar | — | block packed: 1 h gives three 20-min slots | — | — | the usual calendar, never the marker one | — |
| Apptoto | title exact, contains, or rule | — | selectable increments (8:00, 8:30…) | — | — | configured calendars | all events, unless ignored by title |
| SergeyMosin, External mode | `TRANSP:TRANSPARENT`, timed, public, in Source; optionally `CATEGORIES:Appointment` | Free *is* the marker | none: event = slot | independent; a booking blocks the slots it overlaps | expanded; rewrites the source by default | Destination, which must differ | Busy, uncancelled events in Destination only |
| calendar-scheduler | every event in the availability calendar | ignored | 30-min raster from the request's start | OR-merged; no seam | `RRULE` only, at most 100 | separate booked calendar | every event in the booked calendar |
| SKAWINSKI plugin | keyword in title, case-insensitive substring | ignored | starts every 15 min from each window's start; slots overlap | never merged; every join a seam | none | the same calendar | non-Free events, pending bookings |
| RFC 7953 | `AVAILABLE` inside `VAVAILABILITY` | n/a | none; output is free-busy | union, layered by `PRIORITY` | `RRULE`, `EXDATE`, `RECURRENCE-ID` | n/a | events by normal free-busy: neither Free nor cancelled |

**Marker.** Exact, case- and whitespace-sensitive equality is the
strictest variant found. Substring matching has documented false
positives: YouCanBookMe warned that "SS" matches "miss", and that a
phrase like "Sales" captures any Free event containing it ([YCBM
2016](https://web.archive.org/web/20161215093554/http://support.youcanbook.me/article/80-on-duty-setting-up-a-customised-schedule);
[YCBM
troubleshooting](https://web.archive.org/web/20240304102503/https://support.youcanbook.me/hc/en-us/articles/17321747803671-Troubleshooting-Calendar-Managed-Availability)).
Exact matching trades those for silent misses, and case mismatch heads
YouCanBookMe's troubleshooting list. Every title-matching vendor except
FreeBusy, whose `#free` is fixed like `OPEN`, lets the user choose the
phrase, and YouCanBookMe routes booking pages by phrase
([YCBM](https://ycbm.capacity.com/article/396932/setting-up-calendar-managed-availability)),
the nearest precedent for the vocabulary of
[programmable-slotting.md](programmable-slotting.md) §8. SimplyMeet.me's
whole-calendar marker shows what a title avoids: ordinary appointments
in that calendar "will appear as available", and so would bookings
written there.

**Free/Busy.** YouCanBookMe, Koalendar and meetergo (on Google and
Outlook) require Free markers. Only meetergo says why: provider
free/busy cannot tell a Busy marker from a meeting at the same time.
FreeBusy makes Free optional, needed only for people reading the
calendar outside FreeBusy
([FreeBusy](https://help.freebusy.io/en/articles/1725300-how-to-create-free-or-available-events-using-google-calendar)).
meetergo's contrary advice for iCloud, CalDAV and ICS, to keep markers
Busy because "these providers skip events marked 'Free'", evidently
describes its own ingestion: a `calendar-query` returns transparent
events, and only a `free-busy-query` drops them ([RFC 4791
§7.10](https://www.rfc-editor.org/rfc/rfc4791.html#section-7.10)). We
read with `calendar-query` and, like FreeBusy and the SKAWINSKI plugin,
ignore the marker's transparency.

**Subdivision and phase.** YouCanBookMe requires events to start and end
on its global grid, a recurring support fault
([YCBM](https://ycbm.capacity.com/article/932811/setting-up-calendar-managed-availability));
Google split a block "into smaller slots", presumably from its start
([Google Help, Wayback
2014](https://web.archive.org/web/20140219015043/https://support.google.com/calendar/answer/190998));
calendar-scheduler's raster moves with each query. Stepping from each
merged interval's start avoids the grid fault at the price of odd start
times when an `OPEN` event begins at an odd minute; clock alignment
stays a Tier 1 option
([programmable-slotting.md](programmable-slotting.md) §4).

**Overlap and abutment.** No vendor documents either. The two
open-source projects that subdivide each take one uniform position:
calendar-scheduler merges, so a booking may straddle abutting events;
the SKAWINSKI plugin never merges, so every join is a seam and an
overlap offers start times from both windows. Only we read intent from
the geometry, and only in part: the seam forbids spanning the join, but
the second event is phased from the first, so with 30-minute slots
09:00–09:45 plus 09:45–10:30 offers 10:00, not 09:45
([slots.test.ts](../worker/test/slots.test.ts)). Leaving abutting events
unmerged, each phased from its own start, would be the literal reading
of "two separately-painted sessions" and would need no phantom event.
The precedents do not decide between the two.

**Recurrence and bookings.** No vendor documents how it expands
recurring markers; on Google's CalDAV that is the client's job,
`<c:expand>` being ignored ([ARCHITECTURE.md](../ARCHITECTURE.md) §2).
SergeyMosin's app by default rewrites the practitioner's recurring
source events
([BCSabreImpl.php](https://github.com/SergeyMosin/Appointments/blob/442544b964c55f44490aec1fc35b47608d07fe3b/lib/Backend/BCSabreImpl.php#L283-L292)),
which our read-only role rules out. Every implementation of painted
events overlays bookings as new events. Google's slots, which tied
bookings to instances of the block, duplicated booked slots when a block
was made recurring ([Google Help, Wayback
2023](https://web.archive.org/web/20230607195744/https://support.google.com/calendar/answer/190998));
recomputing from calendar state, as YouCanBookMe and we do, cannot fail
that way. Which events block is the subject of §6.

## 5. Shared ground, and four things that appear to be ours

Most of the convention is common ground: events minus busy time, a title
marker (YouCanBookMe, meetergo, the SKAWINSKI plugin), exact matching
(meetergo), a fixed token (FreeBusy), separate calendars for
availability and bookings (calendar-scheduler, SergeyMosin), overlaid
bookings, recurring markers, and a marker indifferent to its own
transparency (FreeBusy, the SKAWINSKI plugin). Four things have no
precedent this survey found. That is absence of evidence: vendors
document little beyond the marker, and GitHub's code search answered no
phrase query.

1. **Overlap merges; abutment leaves a seam** (§4).
2. **Phase is anchored to each merged interval**, not to a grid or to
   the query.
3. **A role-scoped title marker guarded by uid provenance.** `OPEN`
   counts only in the availability role, the same title in the store
   neither offers nor blocks (it blocked until 2026-10-17), and the
   system knows its own writes by uid, a booking's `SUMMARY` being the
   attendee's name ([ARCHITECTURE.md](../ARCHITECTURE.md) §2). That is
   what makes coinciding roles safe. The SKAWINSKI plugin also shares one calendar,
   but titles bookings `<meeting type>: <name>` and finds windows by
   substring
   ([caldav-booking.php](https://github.com/SKAWINSKI-GmbH/wordpress-caldav_booking_plugin/blob/1b47b73dd7b3b3ba0c6ae3387162598ab7211241/caldav-booking.php#L1316)),
   so, judging by its code and untested, an attendee whose name contains
   the keyword turns a booking into a window: the failure commit
   `a3290e4` closed here.
4. **A signed listing as the availability proof at booking**, which the
   precedents do without (§6). Since 2026-10-17 the listing is the offer
   and the booking path re-checks coverage
   ([ARCHITECTURE.md](../ARCHITECTURE.md) §5.2).

## 6. Lessons for the two decisions, and for practitioners

**Free and cancelled events should stop blocking**
(`decide-events-marked-free-should-not-block-2026-10-14`, with
`cancelled-single-events-still-block-2026-10-14`). Here the
standards and servers are unanimous, the schedulers nearly so, and we
are the exception. RFC 5545 makes `TRANSP` the switch for whether an
event consumes time
([§3.8.2.7](https://www.rfc-editor.org/rfc/rfc5545.html#section-3.8.2.7)),
and RFC 4791 counts transparent and cancelled events as free
([§7.10](https://www.rfc-editor.org/rfc/rfc4791.html#section-7.10)).
SabreDAV, Apple's CalendarServer, DAViCal, Radicale and Stalwart
implement exactly that
([FreeBusyGenerator.php](https://github.com/sabre-io/vobject/blob/master/lib/FreeBusyGenerator.php)),
as do Nextcloud's booking feature
([EventConflictFilter.php](https://github.com/nextcloud/calendar/blob/main/lib/Service/Appointments/EventConflictFilter.php)),
every vendor that documents the point, and the open-source schedulers
calrs, Calnode, Tymeslot, Thunderbird Appointment and Cal.diy;
Easy!Appointments is reversing its contrary behaviour
([#1945](https://github.com/alextselegidis/easyappointments/issues/1945)).
Of the projects examined, only zeitfenster, bookMyMeet and
calendar-scheduler share our rule, and even RFC 7953 overlays events by
normal free-busy processing. All-day defaults make the point practical:
Thunderbird creates all-day events transparent
([calendar.js](https://searchfox.org/comm-central/source/calendar/base/calendar.js)),
and all 209 all-day events in Google's Finnish holiday feed carry
`TRANSP:TRANSPARENT`
([feed](https://calendar.google.com/calendar/ical/en.finnish%23holiday%40group.v.calendar.google.com/public/basic.ics)).
Adopt the decision as written: transparent and cancelled non-`OPEN`
events neither block nor win `lostRace`; an `OPEN` event is availability
whatever its transparency, as at FreeBusy; a cancelled `OPEN` event or
occurrence offers nothing, as SergeyMosin's app skips cancelled sources.
Keep the live Google check, the feed being an export rather than CalDAV,
and keep reading with `calendar-query`, without which a Free `OPEN`
event would vanish.

**Re-check `OPEN` coverage at booking**
(`decide-re-check-open-coverage-at-booking-2026-10-14`). SergeyMosin's
slot token carries the start, the end and the source event's URI; booking
re-reads that event and refuses if it has gone
([BCSabreImpl.php](https://github.com/SergeyMosin/Appointments/blob/442544b964c55f44490aec1fc35b47608d07fe3b/lib/Backend/BCSabreImpl.php#L1051-L1087)).
calendar-scheduler recomputes availability over the requested interval
([lib.rs](https://github.com/justinrubek/calendar-scheduler/blob/7dc177a06ed8e76992b530bdd8b3b490b8df8ab1/crates/scheduling-api/src/lib.rs#L63-L109)).
Neither lets a listing prove availability. The spike phase's first plan
(spike repository, commit `797c018`) also had booking fail once the
`OPEN` event had disappeared, before spike 3 dropped the check as its
"clearest single win". The precedents side with the first plan and with
the decision's reframing, in which the grant becomes the offer: the role
SergeyMosin's token already plays. Do it together with
`availability-blockers-are-not-re-checked-2026-10-14`, as the card
recommends.

**Practitioner guidance.** [SETUP.md](../SETUP.md) Part 6 and the
wizard's "Open some time for booking" step
([steps.ts](../wizard/src/steps.ts)) should add the following.

- **Mark `OPEN` events Free where your app allows.** A Busy `OPEN` event
  shows you as busy, to colleagues and to any tool reading your
  free-busy, exactly when you are bookable: the reason YouCanBookMe gave
  in 2013 for keeping markers in a separate calendar. It changes nothing
  in this system, now or once Free events stop blocking, and must not be
  required: whether
  iCloud permits it is disputed (§7). With a separate availability
  calendar, a per-calendar switch such as Nextcloud's "Never show me as
  busy" does the same at once; never on a calendar that also holds
  bookings, which would drop out of free-busy with it.
- **Deleting an `OPEN` event that holds a booking keeps the booking, but
  a later cancellation will not reopen its time until `OPEN` is painted
  there again**, exactly as YouCanBookMe documents
  ([YCBM](https://ycbm.capacity.com/article/932811/setting-up-calendar-managed-availability)).
  Until 2026-10-17 a deleted `OPEN` event also stayed bookable from
  pages already open for up to `GRANT_TTL_SECS`, 30 minutes by default;
  the booking path now re-checks coverage.
- **Overlap blocks meant to be continuous; abutting blocks leave a seam
  no booking spans.** No other tool will have taught this.
- **Paint timed `OPEN` events, not all-day ones.** RFC 7953 excludes
  all-day availability, SergeyMosin's app skips all-day sources, and the
  first spike gave the same advice; the Worker gives an all-day `OPEN`
  event no special meaning and offers slots round the clock.
- **Once Free events stop blocking, an all-day event left at its
  default Free no longer closes a day**: delete or shorten the `OPEN`
  events, or add a Busy event.

Two smaller points. When the health check gains its foreseen
"unparseable `OPEN` event" report
([programmable-slotting.md](programmable-slotting.md) §8), it should
name near misses too, such as `Open`, a trailing space or an all-day
`OPEN` event, rather than the match being relaxed. And
[ARCHITECTURE.md](../ARCHITECTURE.md) §2 should point here for precedent
rather than restate it, citing only directly fetched sources.

## 7. Where the sources disagree

| Topic | One account | The other | Reading |
|---|---|---|---|
| End of Google's appointment slots | Booking pages stopped 2024-07-18 ([9to5Google](https://9to5google.com/2024/03/18/google-calendar-appointment-slots/)) | Creation stopped 18 July; booking pages ended 7–8 August 2024 ([Google](https://workspaceupdates.googleblog.com/2024/08/release-notes-08-09-2024.html)) | Google's own posts |
| YouCanBookMe's match | "must match exactly", "case sensitive" | Free events "that contain the word" are picked up ([troubleshooting](https://web.archive.org/web/20240304102503/https://support.youcanbook.me/hc/en-us/articles/17321747803671-Troubleshooting-Calendar-Managed-Availability)) | Substring in practice; the current matcher is unverified |
| Free/Busy on iCloud | Set "Available" on iOS ([YCBM 2016](https://web.archive.org/web/20161215093554/http://support.youcanbook.me/article/80-on-duty-setting-up-a-customised-schedule)) | "No way to set an event as 'Free'" ([YCBM](https://ycbm.capacity.com/article/396932/setting-up-calendar-managed-availability)); not on the desktop, sometimes on iPhone or iPad ([Calendly](https://calendly.com/help/icloud-all-day-events)) | Client-dependent; never require it |
| meetergo's markers | Replace weekly hours ([changelog](https://meetergo.com/en/changelog/new-help-center-multi-account-switching-and-calendar-based-availability)) | Add windows to them ([help](https://help.meetergo.com/en/scheduling/availability/add-availability-from-calendar)) | Possibly two modes; unverified |
| Google's all-day default | Free ([SSA](https://simplyscheduleappointments.com/guides/google-calendar-all-day-events-not-blocking-availability/); YouCanBookMe *(search extract)*) | No Google statement found; CalDAV untested | Probable; confirm live, as the Free-events card requires |

## 8. Verdict

The precedents settle the convention's legitimacy and leave its
mechanics to us. They also sort our divergences into principled and
accidental ones. The vendors' Free rule for markers, where explained at
all, is an artefact of engines that see only busy intervals; reading
whole events, we may ignore a marker's transparency, but nothing excuses
ignoring it on blockers, where every standard and server agrees. The
grant as availability proof was an economy no precedent shares, and the
coverage re-check rightly spends it. What remains ours, the seam,
interval-anchored phase and uid provenance, has no external test to
fail: it is behaviour
no other tool will have taught a practitioner, so it belongs in their
guidance as well as in [ARCHITECTURE.md](../ARCHITECTURE.md) §4.
