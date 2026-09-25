-- Bootstrap the DRIGHT Telegram broadcast worker without exposing the bot token.
-- The temporary bootstrap calls the public setup endpoint; that endpoint derives the
-- worker secret from TELEGRAM_BROADCAST_BOT_TOKEN, installs the authenticated worker
-- cron job, then removes this bootstrap job.

create or replace function public.complete_telegram_broadcast_bootstrap()
returns void
language plpgsql
security definer
set search_path = public, cron
as $$
declare
  v_job record;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Bootstrap completion requires service role';
  end if;

  for v_job in
    select jobid from cron.job where jobname='telegram-broadcast-bootstrap'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$$;

revoke all on function public.complete_telegram_broadcast_bootstrap() from public, anon, authenticated;
grant execute on function public.complete_telegram_broadcast_bootstrap() to service_role;

do $$
declare
  v_job record;
begin
  for v_job in
    select jobid from cron.job where jobname='telegram-broadcast-bootstrap'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;

  perform cron.schedule(
    'telegram-broadcast-bootstrap',
    '* * * * *',
    $cmd$select net.http_get(
      url := 'https://vtiardblxpaeekbfvhjo.supabase.co/functions/v1/telegram-broadcast-webhook',
      timeout_milliseconds := 30000
    );$cmd$
  );
end $$;
