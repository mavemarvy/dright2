begin;
create extension if not exists pg_cron;

do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname='dright2-weekly-sales-progression' loop
    perform cron.unschedule(j.jobid);
  end loop;
  for j in select jobid from cron.job where jobname='dright2-time-lifecycle-maintenance' loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;

select cron.schedule(
  'dright2-weekly-sales-progression',
  '1 0 * * 1',
  'select public.run_weekly_sales_progression();'
);

select cron.schedule(
  'dright2-time-lifecycle-maintenance',
  '* * * * *',
  'select public.run_time_based_lifecycle_maintenance();'
);
commit;