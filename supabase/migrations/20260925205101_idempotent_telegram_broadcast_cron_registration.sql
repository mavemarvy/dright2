create or replace function public.configure_telegram_broadcast_cron(p_worker_secret text)
returns void
language plpgsql
security definer
set search_path=public,cron,net
as $$
declare
  v_headers text;
  v_command text;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Broadcast cron configuration requires service role';
  end if;

  if p_worker_secret is null or length(p_worker_secret)<32 then
    raise exception 'Worker secret is invalid';
  end if;

  if exists (
    select 1 from cron.job
    where jobname='telegram-broadcast-worker'
      and active=true
  ) then
    return;
  end if;

  perform cron.unschedule(jobid)
  from cron.job
  where jobname='telegram-broadcast-worker';

  v_headers := jsonb_build_object(
    'Content-Type','application/json',
    'X-Dright-Broadcast-Worker-Secret',p_worker_secret
  )::text;

  v_command := format(
    'select net.http_post(url := %L, headers := %L::jsonb, body := %L::jsonb);',
    'https://vtiardblxpaeekbfvhjo.supabase.co/functions/v1/telegram-broadcast-worker',
    v_headers,
    '{}'
  );

  perform cron.schedule('telegram-broadcast-worker','* * * * *',v_command);
end;
$$;

revoke all on function public.configure_telegram_broadcast_cron(text) from public,anon,authenticated;
grant execute on function public.configure_telegram_broadcast_cron(text) to service_role;
