# Manual GitHub upload and Cloudflare deployment

## 1. Upload these contents to GitHub

Open your EXISTING Politily repository and select its production branch (usually main).
Choose Add file > Upload files. Drag the CONTENTS of POLITILY_MANUAL_UPLOAD into the
upload area: app, db, docs, drizzle, public, scripts, tests, worker, and the root files.

Upload the contents, not the containing POLITILY_MANUAL_UPLOAD folder and not a ZIP.
At the repository root you must see package.json, pnpm-lock.yaml and vite.config.ts
beside the app and worker folders. Include the two dotfiles .gitignore and .env.example;
the latter is an empty local configuration template, not production credentials.

Commit the upload with the message: Update Politily to 3.5 hourly world desk.
If the repository still contains an obsolete package-lock.json, remove that old lockfile
so builds use pnpm-lock.yaml. Keep your existing GitHub/Cloudflare connection.

## 2. Deploy the existing Cloudflare Worker

Cloudflare > Workers & Pages > politily > Settings > Build settings:

- Production branch: the branch you uploaded to.
- Project/root directory: repository root (leave blank if that means root).
- Node version: 24.
- Build command: pnpm install --frozen-lockfile && pnpm run build
- Deploy command: pnpm exec wrangler deploy --config dist/server/wrangler.json

If your existing GitHub integration deploys automatically, inspect that build after
committing. If no build starts, select the latest production commit and deploy it.
Do not create a new Worker or a new database.

Preserve:
- Worker name: politily
- DB binding: DB -> politily-d1
- Database ID: 3d2c02a8-6529-4408-8c8d-4d5702251456
- Existing RESEND_API_KEY and GEMINI_API_KEY Worker secrets
- Recipient: adityakhanna.tcc@gmail.com
- Sender: alerts@alerts.shirdisairasoi.org (must be verified in Resend)

The recipient/sender are already configured in vite.config.ts. Keep API keys in
Cloudflare secrets. No keys are included in this folder.

## 3. Check the cron triggers

Workers & Pages > politily > Settings > Trigger Events should contain these TWO crons:

*/5 * * * *       news scan every five minutes
1-59/5 * * * *    separate email processing

Cloudflare interprets cron in UTC. The application applies Asia/Kolkata time internally
and sends the hourly editions from 8 AM through 11 PM IST inclusive. Normal processing
is about one minute after the hour. Scans and email do not require an open browser.

The 8 AM edition includes overnight captures. The final 11 PM edition can retry during
the 11 PM hour. Automatic retries pause at midnight and resume after 8 AM. Manual sends
are available anytime. Each automatic edition considers up to 100 captured records and
shows up to 60 grouped issues. Missed hourly slots are not all resent after an outage.

## 4. Verify the live deployment and email

Open:
https://politily.adityakhanna-tcc.workers.dev/api/health

Expected release: newsroom-3.5-hourly-world-desk
Expected scheduleIST: 08:00 through 23:00, 16 entries
Expected timezone: Asia/Kolkata
Email keyConfigured, senderConfigured and recipientConfigured should all be true.
These are configuration checks, not proof of inbox delivery.

Open the dashboard. A one-time additive database update may require a few retries.
The issue feed and source trails should load. Check Source network for successful
fetch timestamps and any failed feeds. Existing data should remain intact.

In Delivery, click Send test ONCE. Check its status in Delivery, then open Resend >
Emails and confirm Delivered, rather than just Accepted. Confirm the message reached
your inbox. You may also send Today so far to check a real briefing's source links.

After the next IST hour between 8 AM and 11 PM, check for a newsletter entry in
Delivery and the matching Resend delivered event. Confirm Cloudflare's mail cron
invoked successfully. Do not infer automatic delivery from a successful manual test.

If a build fails, retain its error log. If mail fails, check the recorded reason,
Resend sender verification, credentials and quota before retrying. Do not delete the
existing database to fix a build, source or email problem.

This folder is ready for manual upload. It has not been uploaded or deployed by Codex,
and production hourly email delivery has not yet been verified.
