-- Expires abandoned guest/demo accounts so they don't pile up forever.
-- Run this once in the Supabase SQL editor, after supabase/schema.sql
-- (it depends on created_by's ON DELETE CASCADE from that script).
--
-- There's no client-side moment where a guest who closes the tab and never
-- comes back triggers any cleanup, so this runs on a schedule via pg_cron
-- instead: every hour, delete anonymous auth.users rows older than 24
-- hours. Deleting the auth user cascades to their patients, which cascades
-- to those patients' encounters/medications — nothing else to clean up.
--
-- Real (non-anonymous) accounts are never touched, regardless of age.
--
-- pg_cron needs to be enabled first: Database > Extensions > pg_cron in
-- the Supabase dashboard (some hosting tiers reject enabling it via plain
-- SQL even though the CREATE EXTENSION statement below is otherwise
-- sufficient) or `create extension if not exists pg_cron;` if your plan
-- allows it directly. Not available for local `supabase start` (Docker) —
-- this is a hosted-project-only concern.

create extension if not exists pg_cron;

-- Re-runnable: unschedule before scheduling so this script can be re-run
-- (e.g. to change the interval/threshold below) without erroring on a
-- duplicate job name.
select cron.unschedule(jobid)
from cron.job
where jobname = 'expire-guest-data';

select cron.schedule(
  'expire-guest-data',
  '0 * * * *', -- hourly, on the hour
  $$
    delete from auth.users
    where is_anonymous is true
      and created_at < now() - interval '24 hours';
  $$
);

-- To change how long guest data is kept, re-run this file with a
-- different interval above. To inspect/manage the job afterward:
--   select * from cron.job where jobname = 'expire-guest-data';
--   select * from cron.job_run_details order by start_time desc limit 20;
-- To stop it entirely:
--   select cron.unschedule('expire-guest-data');
