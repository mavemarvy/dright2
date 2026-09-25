create or replace function public.claim_telegram_broadcast_campaigns(p_limit integer default 5)
returns setof public.telegram_broadcast_campaigns
language plpgsql
security definer
set search_path=public
as $$
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Broadcast worker requires service role';
  end if;

  return query
  with picked as (
    select id
    from public.telegram_broadcast_campaigns
    where status='queued'
    order by queued_at,id
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,5),20))
  )
  update public.telegram_broadcast_campaigns c
  set status='sending',
      started_at=coalesce(c.started_at,now()),
      updated_at=now(),
      error_code=null
  from picked
  where c.id=picked.id
  returning c.*;
end;
$$;

revoke all on function public.claim_telegram_broadcast_campaigns(integer) from public,anon,authenticated;
grant execute on function public.claim_telegram_broadcast_campaigns(integer) to service_role;

create or replace function public.configure_telegram_broadcast_cron(p_worker_secret text)
returns void
language plpgsql
security definer
set search_path=public,cron,net
as $$
declare
  v_job record;
  v_headers text;
  v_command text;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Broadcast cron configuration requires service role';
  end if;
  if p_worker_secret is null or length(p_worker_secret)<32 then
    raise exception 'Worker secret is invalid';
  end if;

  for v_job in select jobid from cron.job where jobname='telegram-broadcast-worker'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;

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
