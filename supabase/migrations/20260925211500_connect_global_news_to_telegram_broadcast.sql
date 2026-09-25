
create or replace function public.enqueue_global_content_telegram_broadcast()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_news_enabled boolean := true;
  v_key text := 'global-content:' || new.id::text;
begin
  select coalesce(news_broadcasts_enabled,true)
  into v_news_enabled
  from public.telegram_broadcast_settings
  where singleton=true;

  if new.is_active
     and (new.content_kind='news' or coalesce(new.show_in_news,false))
     and v_news_enabled
  then
    insert into public.telegram_broadcast_campaigns(
      source_type,source_id,title,body,media_url,media_type,cta_label,cta_url,
      status,audience,payload,idempotency_key,created_by,updated_at
    )
    values(
      'news',
      new.id::text,
      new.title,
      new.message,
      new.media_url,
      new.media_type,
      coalesce(nullif(new.cta_label,''),'Read on DRIGHT'),
      coalesce(nullif(new.external_url,''),'/news?item=' || new.id::text),
      'queued',
      '{"chats":"all","subscribers":["news"]}'::jsonb,
      jsonb_build_object(
        'global_content_id',new.id,
        'content_kind',new.content_kind,
        'category',new.type,
        'show_in_news',new.show_in_news,
        'published_at',new.published_at
      ),
      v_key,
      new.created_by,
      now()
    )
    on conflict(idempotency_key) do update
    set title=excluded.title,
        body=excluded.body,
        media_url=excluded.media_url,
        media_type=excluded.media_type,
        cta_label=excluded.cta_label,
        cta_url=excluded.cta_url,
        audience=excluded.audience,
        payload=excluded.payload,
        updated_at=now(),
        status=case
          when public.telegram_broadcast_campaigns.status in ('queued','failed','partial','cancelled')
            then 'queued'
          else public.telegram_broadcast_campaigns.status
        end,
        error_code=case
          when public.telegram_broadcast_campaigns.status in ('queued','failed','partial','cancelled')
            then null
          else public.telegram_broadcast_campaigns.error_code
        end;
  else
    update public.telegram_broadcast_campaigns
    set status='cancelled',
        updated_at=now(),
        error_code='SOURCE_NOT_ACTIVE'
    where idempotency_key=v_key
      and status in ('queued','sending','failed','partial');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enqueue_global_content_telegram_broadcast on public.global_announcements;
create trigger trg_enqueue_global_content_telegram_broadcast
after insert or update of
  title,message,type,content_kind,show_in_news,is_active,media_url,media_type,external_url,cta_label
on public.global_announcements
for each row execute function public.enqueue_global_content_telegram_broadcast();
