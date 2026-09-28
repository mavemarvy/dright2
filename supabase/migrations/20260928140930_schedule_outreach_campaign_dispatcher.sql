do $$
declare v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname='outreach-campaign-dispatch-every-minute' limit 1;
  if v_jobid is not null then perform cron.unschedule(v_jobid); end if;
  perform cron.schedule(
    'outreach-campaign-dispatch-every-minute','* * * * *',
    $cron$
      select net.http_post(
        url := 'https://vtiardblxpaeekbfvhjo.supabase.co/functions/v1/outreach-campaign-dispatcher',
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := '{}'::jsonb,
        timeout_milliseconds := 10000
      );
    $cron$
  );
end $$;
