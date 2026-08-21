# check-board-heartbeat

Emails every admin if the Beacon Tower goes quiet for too long. See the
comment at the top of [`check-board-heartbeat/index.ts`](check-board-heartbeat/index.ts)
for how it decides that and what it sends.

## One-time setup

1. **Get a Resend account and API key** — [resend.com](https://resend.com),
   free tier is plenty for this (3,000 emails/month). Verify a sending
   domain there (Resend walks you through adding DNS records) — without a
   verified domain, Resend will only deliver to the email address on your
   own account, not to your other admins.

2. **Install the Supabase CLI** and log in, if you haven't already:
   ```
   npm install -g supabase
   supabase login
   supabase link --project-ref <your-project-ref>
   ```
   Your project ref is in your Supabase project's URL:
   `https://<project-ref>.supabase.co`.

3. **Set the function's secrets** (do NOT put these in any tracked file):
   ```
   supabase secrets set RESEND_API_KEY=re_your_actual_key
   supabase secrets set ALERT_FROM_EMAIL="KYPD Tool Tracker <alerts@yourdomain.com>"
   ```
   `ALERT_FROM_EMAIL` must be on the domain you verified with Resend.

4. **Deploy the function:**
   ```
   supabase functions deploy check-board-heartbeat
   ```

5. **Run the SQL migrations**, in this order, in the Supabase SQL editor:
   - [`../../sql/add_board_heartbeat_to_beacon_settings.sql`](../../sql/add_board_heartbeat_to_beacon_settings.sql)
   - [`../../sql/schedule_board_heartbeat_check.sql`](../../sql/schedule_board_heartbeat_check.sql)
     — read the comments at the top first, it needs a Vault secret and your
     project ref filled in before running.

6. **Re-flash the Beacon Tower** with the updated `shop-beacon-monitor.ino`
   so it starts sending its heartbeat.

## Testing it without waiting 10 minutes

Temporarily lower `OFFLINE_THRESHOLD_MINUTES` in `index.ts` to something
like `1`, redeploy, power off the Beacon Tower, and either wait for the next
5-minute cron tick or invoke it directly:

```
supabase functions invoke check-board-heartbeat
```

Set it back to `10` (or whatever you land on) and redeploy when done
testing.
