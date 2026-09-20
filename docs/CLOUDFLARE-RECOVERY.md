# Recover Without Buying a Plan

The last live check returned a D1 daily row-read quota error, not a DNS error.
The static page can load while database-backed news and email jobs fail.

1. Pause the old cron triggers while updating so the old code does not repeat the waste.
2. Keep the existing D1 database. Do not delete its tables or replace the DB binding.
3. Upload/deploy release 3.2 using START-HERE-BEGINNER.md.
4. If still blocked, wait for the daily reset: 00:00 UTC / 5:30 AM IST.
5. Restore the two intended Free-mode cron triggers and test one email in Delivery.

Free mode reduces the workload. It does not grant extra Cloudflare quota, guarantee
instant news, or bypass account limits. Other apps and console queries also use quota.
The versioned migrations, indexed/bounded history reads, 60-second caching, scan
cooldown, query/read guards and separate mail invocations reduce avoidable usage.
Quota errors back off, with a labelled stale snapshot if one is available.

Stored data is not deleted by a row-read block. JSON/CSV exports copy captured data
for up to 31 days at a time. If D1 itself is blocked, the export must wait for reset too.
Keep archives monthly, but do not delete data unless a separate cleanup is explicitly
requested after verifying a backup. Free per-database storage is finite (500 MB).

Actual delivery remains unverified until Resend accepts and delivers a test.
The source files have not been deployed or pushed to GitHub by Codex.

Official limits:
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/workers/platform/limits/
