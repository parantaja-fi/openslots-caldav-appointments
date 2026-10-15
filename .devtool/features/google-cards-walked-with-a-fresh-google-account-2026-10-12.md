---
id: "google-cards-walked-with-a-fresh-google-account-2026-10-12"
status: "backlog"
priority: "medium"
assignee: null
epic: "Wizard"
dueDate: null
created: "2026-10-12T08:25:20.000Z"
modified: "2026-10-15T05:30:39.000Z"
completedAt: null
labels: ["0.1.x"]
order: "a8"
---
# Google cards walked with a fresh Google account

> M6.4's residue, from `ROADMAP.md` (2026-10-12): the Google Calendar
> sub-wizard has been walked only with the author's own Google account.

Step 6 of `docs/google-calendar-wizard.md` §8: a walk with a fresh
Google account, Workspace and personal both if one is at hand. The
browser half of step 1 goes with it, if still open: the console links,
the settings deep link, the other share levels, a disabled Calendar API
on the spike project (§10's closing list).

ROADMAP also left "the postponed usability remarks" as residue. Walk
attempt 6's (`docs/m6.4-walk-notes.md`) were acted on in 90acd69, bar
one: in Chromium, Google's IAM console and Calendar settings pages
sever the opener link as Cloudflare's do, so the next link opens a fresh
work window (3.4, 3.6); the API library pages do not. Unfixable from the
wizard, lived with since 2026-10-12; Safari is unaffected. Anything
else this walk turns up joins it here.