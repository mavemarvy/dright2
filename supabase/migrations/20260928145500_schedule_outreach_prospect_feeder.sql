do $$
declare v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname='outreach-prospect-feed-every-10-minutes' limit 1;
  if v_jobid is not null then perform cron.unschedule(v_jobid); end if;
  perform cron.schedule(
    'outreach-prospect-feed-every-10-minutes',
    '*/10 * * * *',
    $cron$
      select net.http_post(
        url := 'https://vtiardblxpaeekbfvhjo.supabase.co/functions/v1/outreach-prospect-feeder',
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := '{}'::jsonb,
        timeout_milliseconds := 10000
      );
    $cron$
  );
end $$;
