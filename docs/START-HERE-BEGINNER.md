# Politily Free Edition - Beginner Steps

No paid Cloudflare upgrade is required for this reduced-workload release.
Release 3.3 connects to the replacement politily-d1 database shown in your screenshot.
It starts empty; the old news and briefs are NOT restored by this update.
No files have been pushed to GitHub or deployed by Codex. Use this release instead
of the older 3.0/3.1/3.2 ZIPs.

## Step 1: Find the Files

Open this folder in Windows File Explorer:

`C:\Users\Admin\Documents\Politily\_BEGINNER_UPLOAD_PACKAGE\01_UPLOAD_THIS_TO_GITHUB`

It already contains the updated files. Do not use another old Downloads copy.
Upload the CONTENTS: app, db, worker, public, tests, scripts, docs and root files.
Do not upload the containing folder itself or the ZIP into the repository.

## Step 2: Before Uploading

An existing Cloudflare GitHub connection may deploy automatically when you commit.
First check Cloudflare > Workers & Pages > politily > Bindings. The D1 binding must
be named DB and point to the politily-d1 database you just created. Its Overview
shows Database ID 3d2c02a8-6529-4408-8c8d-4d5702251456. This ID is now included
in vite.config.ts. Do not create another database or paste this ID into a secret.
Edit the existing DB binding to select politily-d1 and save/deploy. If no DB binding
exists, use Add binding > D1 database with variable name DB and select politily-d1.
Updating GitHub as well is essential so later deployments preserve this connection.

If the live app is still exhausting quota, temporarily remove its old cron triggers
while you prepare this update. Record them first. This pauses scans/mail, not data storage.

## Step 3: Upload on GitHub

1. Open your EXISTING Politily repository on github.com.
2. Click Add file > Upload files.
3. Open the upload folder above. Select its files and folders and drag them into GitHub.
   Keep folder structure; app and package.json must be at the repository root.
4. Wait for every file to upload. Enter commit message: Connect Politily to the replacement D1 database.
5. Click Commit changes. Existing files with matching paths are replaced.
6. If package-lock.json still exists in GitHub, delete ONLY that old lockfile using
   GitHub's file menu. Keep pnpm-lock.yaml. Never upload .dev.vars or API keys.

Then continue to Cloudflare. Your GitHub source is updated, but a successful
Cloudflare deployment is still required before the live app changes.

## Step 4: Cloudflare Build Settings

Open Workers & Pages > politily > Settings > Build (Git integration).
Use Node 24 and pnpm 11.19.0. The repository root must contain package.json.

Build command:
`pnpm install --frozen-lockfile && pnpm run build`

Deploy command:
`pnpm exec wrangler deploy --config dist/server/wrangler.json`

Retry the latest build if it failed. This is a Worker app, not a static file upload.

## Step 5: Check Secrets and Cron

In Settings > Variables and secrets, preserve these two SECRETS:
- GEMINI_API_KEY: your Gemini key.
- RESEND_API_KEY: your Resend sending key.

Non-secret settings are included in vite.config.ts so deployment keeps them:
- ALERT_EMAIL = adityakhanna.tcc@gmail.com
- ALERT_FROM_EMAIL = alerts@alerts.shirdisairasoi.org
- APP_BASE_URL = https://politily.adityakhanna-tcc.workers.dev
- POLITILY_FREE_MODE = true
- POLITILY_SCANS_PAUSED = false

Only use the client-owned sender domain with permission. Its Resend domain must be verified.
Do not change DNS again just because D1 is blocked.

After deployment, Trigger events must contain these TWO cron triggers, and no old extras:
- `*/5 * * * *` : small news scan every five minutes.
- `1-59/5 * * * *` : separate email processing at minutes 1, 6, 11, 16, etc.

Newsletters are due at 2 PM and 9 PM IST and normally processed around 2:01 / 9:01 PM.
The second cron is needed on Free so scanning and mail do not share one query allowance.

## Step 6: Verify It Works

Open https://politily.adityakhanna-tcc.workers.dev/api/health
You should see release newsroom-3.3-d1-binding and freeMode true.
This diagnostic page does not query D1 or prove email delivery.

Open the app. New database setup may take several small attempts; leave the page
open or press Retry after a few seconds. The app creates its tables and source
catalog automatically; you do NOT need to paste SQL or create tables by hand.
After setup finishes, click Scan now once and check Source network for feed results.
The replacement database collects new reports; it does not recover old records.
If D1 quota is exhausted, wait until 5:30 AM IST for the Free daily reset.

In Delivery, click Send test once. Check the result in Resend > Emails, then Inbox/Spam.
Accepted means the provider received it, not necessarily that it reached the inbox.
Click Today so far for a newsletter test. If it fails, share the error text, not API keys.

## Keep and Download Your Data

The app does NOT auto-delete your news after 10, 15 or 30 days. Storage limits still apply.

1. Open Delivery.
2. Choose From and To dates, such as the last 15 days or one calendar month.
3. Click Full archive (JSON) to download issues, source reports, saved briefs/scripts
   and the source catalog. CSV is the easier spreadsheet view of the issues and briefs.
4. Wait for completion. Data arrives in small pages to reduce database load.
5. The download is a COPY. It does not remove anything from Cloudflare.

Each download supports up to 31 days. Repeat for older months. It exports captured
report dates, including current parent issues for reports in the selected period,
not only the first 160 dashboard records. Sources may publish before they are captured.
No Gemini tokens are spent exporting. Keep the JSON file for the richer archive.
Import/restore from these JSON files is not implemented; use D1's own backup/export
for a full restorable database snapshot. Never delete the database to reduce reads.

## Free-Plan Tradeoffs

Four feeds and at most six candidate reports are processed per scan. Important core
feeds and other enabled sources rotate; all feeds are NOT fetched every five minutes.
Email processing sends one new priority/urgent alert per tick, plus bounded retries
and scheduled digests. More alerts wait for the next tick. This is not an instant wire feed.

The app stops before 50 D1 queries per invocation, caches dashboard loads, and limits
history reads. Account-wide reads, writes, storage and Worker CPU limits still apply.
Check Cloudflare D1 Metrics after a day. Secure this private tool with Cloudflare Access
so strangers cannot spend its research/email quota.
