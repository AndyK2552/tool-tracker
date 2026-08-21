-- Run this once in the Supabase SQL editor, AFTER deploying the
-- check-board-heartbeat Edge Function (see supabase/functions/README.md)
-- and running add_board_heartbeat_to_beacon_settings.sql.
--
-- Schedules that function to run every 5 minutes via pg_cron + pg_net.
-- Requires the pg_cron and pg_net extensions, which the hosted Supabase
-- platform provides -- enable them first if this is a fresh project:
--   create extension if not exists pg_cron;
--   create extension if not exists pg_net;
--
-- The service_role key is needed to authorize the call to the Edge
-- Function, but must NOT be pasted into this file (it's tracked in git).
-- Store it in Supabase Vault first, as its own one-time step, run directly
-- in the SQL editor and never committed anywhere:
--
--   select vault.create_secret('<your service_role key>', 'service_role_key');
--
-- Then fill in your project ref below (from your Supabase project URL,
-- https://<project-ref>.supabase.co) and run this file.

select cron.schedule(
  'check-board-heartbeat',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/check-board-heartbeat',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- To check it's registered: select * from cron.job;
-- To see run history:       select * from cron.job_run_details order by start_time desc limit 10;
-- To remove it later:       select cron.unschedule('check-board-heartbeat');
