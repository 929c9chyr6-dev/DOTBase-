# AUTOPROVOZ — release management and disaster recovery

Applies to AUTOPROVOZ / PNEU-DOT / TASK deployed as Vercel project `dotbase-shared` and GitHub repository `929c9chyr6-dev/DOTBase-`.

## 1. Stable versions and rollback

Before every significant production change:

1. Verify the currently deployed production version and its source commit.
2. Run the automated tests and a manual smoke test for login, fleet, PNEU/DOT, TASK, and notifications.
3. Create an **annotated Git tag** on the verified production commit (e.g. `v1.5.0`). Do not tag an unverified commit as stable.
4. Record the release tag, commit SHA, Vercel deployment URL/ID, date, features, migrations, known issues, and rollback instructions in a GitHub release.
5. Deploy the next version through the normal reviewed workflow, validate it, and retain the last verified version for rollback.

**Rollback**: if the earlier Vercel deployment is still retained, use Vercel rollback. Otherwise rebuild the source from the Git tag and deploy it safely. Rolling back code **does not roll back Blob data**. If an incompatible data migration occurred, follow its explicitly tested recovery procedure first. Never overwrite the live data store based solely on the age of a code tag.

## 2. Daily private backups

Current app data lives in a **private Vercel Blob store**, not in the Git repository. The cron at `GET /api/daily-backup` creates a snapshot of **all source blobs**, including `config.json`, task/notification JSON, DOT records and associated files (if they live in the same source store).

Schedule: **02:00 UTC every day**, configured in `vercel.json`. Europe/Prague local time is 03:00 CET / 04:00 CEST. Cron requires `CRON_SECRET` and accepts no unauthenticated calls.

Each run:

- Enumerates source objects across all pages, with a 10,000-object safety limit.
- Copies all objects to a **different private Vercel Blob store** using a separate token.
- Verifies each copied object's stored size, and records an SHA-256 checksum in the manifest.
- Writes `manifest.json` **last**. A snapshot without a manifest is INCOMPLETE and must not be used as a restore point.
- Reports the number of objects and bytes in the cron logs. Errors return HTTP 500; missing configuration returns 503.

Snapshots are append-only under `autoprovoz-backups/daily/YYYY-MM-DD/<snapshot-id>/`. The implementation does **not** delete backups automatically. Configure retention and alarms after verifying the cost, provider limits, and restore procedure. As an initial policy proposal, consider 30 daily recovery points plus 12 monthly points, but **do not enable deletion without approval and test restores**.

### Required setup before merging this PR

1. Create a **new private** Blob store in the Bearcon team, separate from the live data store.
2. Configure a project environment variable `BACKUP_BLOB_READ_WRITE_TOKEN` in Vercel **Production only**, using the credential of that private destination store. Do not paste tokens into chat, commits, CI logs or documents.
3. Confirm `BLOB_READ_WRITE_TOKEN` (source store) and `CRON_SECRET` are configured. **Different token strings alone do not prove independent stores**: verify store IDs in the Vercel UI.
4. Validate the backup target has enough storage and that a daily full copy fits the 300-second Function timeout.
5. Run the backup on a staging/test dataset first. Independently check the manifest and restore the data into a **separate test store**. Do not test by overwriting production.
6. Add operational monitoring/notification for missing or failed daily manifests before treating the automated backup as production-grade.

### Current constraints

- Multiple Blob files can change during a backup. This produces a **per-object snapshot, not an atomic/transactional point-in-time database snapshot**.
- Verification checks destination size and stores source SHA-256, but an actual restore with checksum validation must be tested independently.
- This captures Blob files **only**. Environment variables, OAuth/VAPID/session secrets, domains, Vercel project settings, Git tags, DNS and other external services require separate configuration backups.
- It is a second **store**, but still within Vercel. For stronger disaster recovery, replicate to independent object storage/provider and use separate credentials and access controls.
- A full snapshot can become expensive as DOT photos and history grow. Track total snapshot bytes, storage cost and duration; consider content-addressed incremental storage after we measure usage.
- Backups can contain personal data and security-sensitive state. Keep them private, least-privilege, access-logged and covered by your data retention policy.

## 3. Recovery drill

At least once per month:

1. Select the last completed manifest.
2. Retrieve each manifest entry from the separate backup store into a non-production restore store.
3. Verify SHA-256 for **every** object; reject missing or mismatched files.
4. Start a staging copy of the app with restore-store credentials and safe test-only users.
5. Verify vehicle listings, DOT history/photos, TASK assignments, user/permission behavior, and notifications **without sending live push notifications**.
6. Record elapsed time, outcome, missing dependencies and remediation in the release log.

## 4. Release note template

- Version/tag:
- Date/time:
- Commit SHA:
- Vercel production deployment ID:
- Changed modules:
- Functional changes:
- Fixes:
- Known issues:
- Test results:
- Database or data-schema changes:
- Latest verified backup manifest:
- Rollback steps:
- Responsible person / approval:
