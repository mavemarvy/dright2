-- ST-2: repair the existing DRIGHT2 unified analytics pipeline.
-- analytics_events is the canonical observation stream.
-- product_views, listing_events and search_history are preserved as legacy compatibility datasets.

create unique index if not exists idx_analytics_sessions_session_id_unique
  on public.analytics_sessions(session_id);

drop policy if exists insert_own_analytics_events on public.analytics_events;
drop policy if exists insert_anon_analytics_events on public.analytics_events;
revoke insert, update, delete on public.analytics_events from anon, authenticated;

create or replace function public.track_analytics_event(
  p_event_type text,
  p_entity_type text default 'product',
  p_entity_id uuid default null,
  p_seller_id uuid default null,
  p_session_id text default null,
  p_device_hash text default null,
  p_browser text default null,
  p_country text default null,
  p_city text default null,
  p_referrer text default null,
  p_source text default 'direct',
  p_metadata jsonb default '{}'::jsonb,
  p_is_bot boolean default false,
  p_device_type text default 'desktop',
  p_os text default null,
  p_browser_name text default null,
  p_state text default null,
  p_language text default null,
  p_timezone text default null,
  p_session_duration integer default null,
  p_is_bounce boolean default false,
  p_keywords text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_existing timestamptz;
  v_event_id uuid;
  v_created_at timestamptz;
  v_cooldown interval;
  v_page_increment integer := 0;
  v_page_path text := nullif(left(coalesce(p_metadata->>'page_path',''), 500), '');
  v_legacy_event_type text;
begin
  if p_is_bot then return jsonb_build_object('tracked', false, 'reason', 'bot'); end if;
  if p_event_type is null or btrim(p_event_type) = '' or length(p_event_type) > 80 then raise exception 'invalid event_type'; end if;
  if p_session_id is not null and length(p_session_id) > 160 then raise exception 'invalid session_id'; end if;

  v_cooldown := case
    when p_event_type in ('product_view','service_view','job_view','course_view','profile_view') then interval '30 minutes'
    when p_event_type in ('promotion_impression','impression') then interval '1 minute'
    when p_event_type = 'open' then interval '10 seconds'
    else null
  end;

  if v_cooldown is not null and p_entity_id is not null then
    select ae.created_at into v_existing
    from public.analytics_events ae
    where ae.entity_id = p_entity_id
      and ae.entity_type = p_entity_type
      and ae.event_type = p_event_type
      and ((v_viewer_id is not null and ae.viewer_id = v_viewer_id)
        or (v_viewer_id is null and p_session_id is not null and ae.session_id = p_session_id))
    order by ae.created_at desc limit 1;
    if v_existing is not null and now() - v_existing < v_cooldown then
      return jsonb_build_object('tracked', false, 'reason', 'cooldown', 'last_event', v_existing);
    end if;
  end if;

  insert into public.analytics_events (
    event_type,entity_type,entity_id,seller_id,viewer_id,session_id,ip_hash,device_hash,
    browser,country,city,referrer,source,metadata,is_bot,device_type,os,browser_name,state,
    language,timezone,session_duration,is_bounce,keywords
  ) values (
    left(btrim(p_event_type),80),left(coalesce(nullif(btrim(p_entity_type),''),'platform'),40),p_entity_id,p_seller_id,
    v_viewer_id,p_session_id,
    encode(extensions.digest(coalesce(current_setting('request.headers', true), ''), 'sha256'),'hex'),
    nullif(left(coalesce(p_device_hash,''),160),''),nullif(left(coalesce(p_browser,''),255),''),
    nullif(left(coalesce(p_country,''),100),''),nullif(left(coalesce(p_city,''),100),''),
    nullif(left(coalesce(p_referrer,''),1000),''),left(coalesce(nullif(btrim(p_source),''),'direct'),80),
    coalesce(p_metadata,'{}'::jsonb),false,nullif(left(coalesce(p_device_type,''),30),''),
    nullif(left(coalesce(p_os,''),60),''),nullif(left(coalesce(p_browser_name,''),60),''),
    nullif(left(coalesce(p_state,''),100),''),nullif(left(coalesce(p_language,''),30),''),
    nullif(left(coalesce(p_timezone,''),100),''),p_session_duration,coalesce(p_is_bounce,false),
    nullif(left(coalesce(p_keywords,''),500),'')
  ) returning id,created_at into v_event_id,v_created_at;

  v_page_increment := case when p_event_type in ('product_view','service_view','job_view','course_view','profile_view','page_view','open') then 1 else 0 end;

  if p_session_id is not null and btrim(p_session_id) <> '' then
    insert into public.analytics_sessions (
      session_id,user_id,device_type,os,browser,language,timezone,country,entry_page,exit_page,
      page_views,events_count,duration_seconds,is_bounce,started_at,ended_at
    ) values (
      p_session_id,v_viewer_id,p_device_type,p_os,coalesce(p_browser_name,p_browser),p_language,p_timezone,p_country,
      v_page_path,v_page_path,v_page_increment,1,0,(v_page_increment <= 1),now(),now()
    )
    on conflict (session_id) do update set
      user_id=coalesce(public.analytics_sessions.user_id,excluded.user_id),
      device_type=coalesce(public.analytics_sessions.device_type,excluded.device_type),
      os=coalesce(public.analytics_sessions.os,excluded.os),
      browser=coalesce(public.analytics_sessions.browser,excluded.browser),
      language=coalesce(public.analytics_sessions.language,excluded.language),
      timezone=coalesce(public.analytics_sessions.timezone,excluded.timezone),
      country=coalesce(public.analytics_sessions.country,excluded.country),
      exit_page=coalesce(excluded.exit_page,public.analytics_sessions.exit_page),
      page_views=public.analytics_sessions.page_views + v_page_increment,
      events_count=public.analytics_sessions.events_count + 1,
      ended_at=now(),
      duration_seconds=greatest(0,extract(epoch from (now()-public.analytics_sessions.started_at))::integer),
      is_bounce=(public.analytics_sessions.page_views + v_page_increment <= 1);
  end if;

  if p_event_type='product_view' and p_entity_type='product' and p_entity_id is not null then
    insert into public.product_views(product_id,user_id,viewed_at) values (p_entity_id,v_viewer_id,v_created_at);
    update public.products set view_count=coalesce(view_count,0)+1 where id=p_entity_id;
  end if;

  v_legacy_event_type := case
    when p_event_type in ('product_view','service_view','job_view','course_view') then 'open'
    when p_event_type='chat_started' then 'chat_opened'
    when p_event_type='checkout_started' then 'checkout_initiated'
    when p_event_type='review' then 'review_submitted'
    when p_event_type='rating' then 'rating_submitted'
    when p_event_type='product_save' then 'save'
    when p_event_type in ('impression','click','open','gallery_interaction','video_play','scroll_depth','time_on_page','exit','favorite','unfavorite','save','share','copy_link','seller_profile_visit','contact_seller','chat_opened','purchase','service_order','course_enrollment','job_application','checkout_initiated','checkout_completed','payment_completed','review_submitted','rating_submitted','refund','cancellation','dispute','repeat_purchase','wishlist_add','wishlist_remove') then p_event_type
    else null end;

  if v_legacy_event_type is not null and p_entity_id is not null and p_entity_type in ('product','service','job','course','digital_download') then
    if not exists (
      select 1 from public.listing_events le
      where le.listing_id=p_entity_id and le.event_type=v_legacy_event_type and le.created_at>=now()-interval '5 seconds'
        and ((v_viewer_id is not null and le.user_id=v_viewer_id)
          or (v_viewer_id is null and p_session_id is not null and le.session_id=p_session_id))
    ) then
      insert into public.listing_events(listing_id,listing_type,user_id,event_type,metadata,session_id,created_at,view_source)
      values(p_entity_id,p_entity_type,v_viewer_id,v_legacy_event_type,coalesce(p_metadata,'{}'::jsonb),p_session_id,v_created_at,p_source);
    end if;
  end if;

  if p_event_type='search' and nullif(btrim(coalesce(p_metadata->>'query','')),'') is not null then
    insert into public.search_history(user_id,query,category,filters,result_count,clicked_listing_id)
    values(
      v_viewer_id,left(p_metadata->>'query',500),nullif(left(coalesce(p_metadata->>'category',''),200),''),
      case when jsonb_typeof(p_metadata->'filters')='object' then p_metadata->'filters' else null end,
      case when coalesce(p_metadata->>'result_count','') ~ '^\d+$' then (p_metadata->>'result_count')::integer else null end,
      case when coalesce(p_metadata->>'clicked_listing_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then (p_metadata->>'clicked_listing_id')::uuid else null end
    );
  end if;

  return jsonb_build_object('tracked',true,'event_id',v_event_id,'created_at',v_created_at,'viewer_id',v_viewer_id,'session_id',p_session_id);
end;
$$;

grant execute on function public.track_analytics_event(text,text,uuid,uuid,text,text,text,text,text,text,text,jsonb,boolean,text,text,text,text,text,text,integer,boolean,text) to anon,authenticated;
