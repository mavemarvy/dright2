-- Install the recurring Telegram broadcast worker from the first authenticated Telegram update.
-- This avoids relying on a database-to-Edge bootstrap DNS call.

create or replace function public.ensure_telegram_broadcast_cron(p_worker_secret text)
returns void
language plpgsql
security definer
set search_path = public, cron
as $$
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Broadcast cron configuration requires service role';
  end if;
  if p_worker_secret is null or length(p_worker_secret) < 32 then
    raise exception 'Worker secret is invalid';
  end if;

  if not exists (
    select 1
    from cron.job
    where jobname='telegram-broadcast-worker'
      and active=true
  ) then
    perform public.configure_telegram_broadcast_cron(p_worker_secret);
  end if;
end;
$$;

revoke all on function public.ensure_telegram_broadcast_cron(text) from public, anon, authenticated;
grant execute on function public.ensure_telegram_broadcast_cron(text) to service_role;

do $$
declare
  v_job record;
begin
  for v_job in select jobid from cron.job where jobname='telegram-broadcast-bootstrap'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end $$;
