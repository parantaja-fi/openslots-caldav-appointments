---
id: "rotate-every-credential-at-the-020-release-2026-10-17"
status: "backlog"
priority: "critical"
assignee: null
epic: "Security"
dueDate: null
created: "2026-10-17T11:40:00.000Z"
modified: "2026-10-18T10:32:54.005Z"
completedAt: null
labels: ["0.2.0"]
order: "a5"
---
# Rotate every credential at the 0.2.0 release

> Written 2026-10-17. During that day's recurrence work a subagent's
> command printed two credentials into the Claude Code session
> transcript on the author's machine: the Nextcloud app password of
> the test account (the one in `BACKEND_NEXTCLOUD`) and the Google
> service-account key (the one in `BACKEND_GOOGLE`), with the test
> profiles' calendar URLs. Nothing reached a file in the repository
> or a commit. Ruled the same day: rotate everything at once when
> 0.2.0 is published, rather than those two now.

Every credential the project holds, where each lives, and what its
rotation touches. Names only; the values live where the table says.

| Credential | Issued by | Held in |
|---|---|---|
| Nextcloud app password, test account — *exposed* | The Good Cloud, the author's account | `worker/test/backends/nextcloud.vars`, `worker/.dev.vars`, GitHub secret `BACKEND_NEXTCLOUD` |
| Nextcloud app password, deploy | The Good Cloud, the author's account | GitHub secrets `AVAILABILITY_USERNAME`/`AVAILABILITY_PASSWORD` and `BOOKING_STORE_USERNAME`/`BOOKING_STORE_PASSWORD`; the Worker's secrets of the same names, which `deploy.yml` sets from them |
| Google service-account key — *exposed* | Google Cloud IAM, the spike's project | `worker/test/backends/google.vars`, GitHub secret `BACKEND_GOOGLE`, the spike repository's `worker/.dev.vars`; GitHub secret `GOOGLE_SERVICE_ACCOUNT_JSON` if the upstream deploy sets it |
| Brevo API keys | Brevo | the development key in `worker/.dev.vars`, which the deploy secret `BREVO_API_KEY` repeats; CI's `BREVO_CI_API_KEY` |
| testmail.app key | testmail.app | GitHub secret `TESTMAIL_APIKEY` |
| Cloudflare deploy token | Cloudflare | GitHub secret `CLOUDFLARE_API_TOKEN` |
| Worker signing key | minted by `deploy.yml`'s first run | the Worker's `SIGNING_KEY_JWK`, nowhere else |
| iCloud app-specific password | the development Apple ID | `worker/test/backends/icloud.vars` |

The two app passwords are told apart in The Good Cloud by their labels,
which name the secrets they feed. Identifiers were printed too, the
account IDs, namespaces and calendar URLs; they are not credentials and
do not rotate.

## Order of work

1. For each row: issue the new value at its source, replace it in
   every place the row names, then revoke the old one there.
2. `gh secret set BACKEND_NEXTCLOUD < worker/test/backends/nextcloud.vars`,
   and the same for `BACKEND_GOOGLE`, as `ci.yml` says; that also hands
   CI the profiles' `TEST_AVAILABILITY_URL_ALIAS`, which the third
   `flow.live` configuration needs.
3. The signing key was not exposed, and rotating it voids every
   cancellation link already emailed and every grant in flight
   (`ARCHITECTURE.md` §5.2): decide at the time whether 0.2.0 is the
   moment. To rotate: `npx wrangler secret delete SIGNING_KEY_JWK`,
   then a deploy run, which mints a new key.
4. Verify: CI green, live matrix and `email-roundtrip` included; a
   deploy run ending in a green health probe; one booking made and
   cancelled through the deployed page's emailed link.

## Acceptance

- Every row of the table carries a new value and the old one is
  revoked at its source, the date recorded here.
- CI green including the live matrix and the email round-trip; the
  deployed Worker's health green; a booking confirmed and cancelled
  through the emailed link.