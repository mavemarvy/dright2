-- DRIGHT2 unified recommendation upgrade: canonical algorithm config, server-side interest learning,
-- personalized marketplace feed, promotion relevance, and sponsored telemetry hardening.

-- 1) algorithm_settings is the canonical configuration source.
alter table public.algorithm_settings
  add column if not exists marketplace_relevance_weight numeric not null default 30,
  add column if not exists marketplace_seller_verification_weight numeric not null default 15,
  add column if not exists marketplace_listing_quality_weight numeric not null default 10,
  add column if not exists marketplace_conversion_rate_weight numeric not null default 15,
  add column if not exists marketplace_sales_history_weight numeric not null default 10,
  add column if not exists marketplace_rating_weight numeric not null default 10,
  add column if not exists marketplace_freshness_weight numeric not null default 5,
  add column if not exists marketplace_trending_weight numeric not null default 5,
  add column if not exists marketplace_interest_weight numeric not null default 22,
  add column if not exists marketplace_seller_affinity_weight numeric not null default 10,
  add column if not exists marketplace_commerce_weight numeric not null default 18,
  add column if not exists marketplace_exploration_percentage numeric not null default 8,
  add column if not exists marketplace_page_size integer not null default 30,
  add column if not exists search_personalization_weight numeric not null default 8,
  add column if not exists social_interest_weight numeric not null default 14,
  add column if not exists interest_half_life_days numeric not null default 45,
  add column if not exists interest_score_cap numeric not null default 100,
  add column if not exists interest_search_weight numeric not null default 2,
  add column if not exists interest_view_weight numeric not null default 3,
  add column if not exists interest_dwell_weight numeric not null default 5,
  add column if not exists interest_completion_weight numeric not null default 7,
  add column if not exists interest_reaction_weight numeric not null default 5,
  add column if not exists interest_comment_weight numeric not null default 6,
  add column if not exists interest_save_weight numeric not null default 9,
  add column if not exists interest_share_weight numeric not null default 8,
  add column if not exists interest_follow_weight numeric not null default 10,
  add column if not exists interest_profile_visit_weight numeric not null default 4,
  add column if not exists interest_wishlist_weight numeric not null default 10,
  add column if not exists interest_checkout_weight numeric not null default 14,
  add column if not exists interest_purchase_weight numeric not null default 20,
  add column if not exists interest_skip_penalty numeric not null default 2,
  add column if not exists interest_hide_penalty numeric not null default 8,
  add column if not exists interest_not_interested_penalty numeric not null default 12,
  add column if not exists interest_block_penalty numeric not null default 20,
  add column if not exists interest_recompute_window_days integer not null default 365,
  add column if not exists interest_top_category_limit integer not null default 12,
  add column if not exists promotion_interest_weight numeric not null default 20,
  add column if not exists promotion_min_relevance numeric not null default 0.10;

-- Initialize canonical marketplace fields from the existing legacy singleton.
update public.algorithm_settings a
set marketplace_relevance_weight = coalesce(m.relevance_weight,a.marketplace_relevance_weight),
    marketplace_seller_verification_weight = coalesce(m.seller_verification_weight,a.marketplace_seller_verification_weight),
    marketplace_listing_quality_weight = coalesce(m.listing_quality_weight,a.marketplace_listing_quality_weight),
    marketplace_conversion_rate_weight = coalesce(m.conversion_rate_weight,a.marketplace_conversion_rate_weight),
    marketplace_sales_history_weight = coalesce(m.sales_history_weight,a.marketplace_sales_history_weight),
    marketplace_rating_weight = coalesce(m.rating_weight,a.marketplace_rating_weight),
    marketplace_freshness_weight = coalesce(m.freshness_weight,a.marketplace_freshness_weight),
    marketplace_trending_weight = coalesce(m.trending_weight,a.marketplace_trending_weight)
from public.marketplace_ranking_weights m
where a.is_singleton=true and m.is_singleton=true;

create or replace function public.sync_marketplace_weights_from_algorithm()
returns trigger language plpgsql set search_path='public' as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  update public.marketplace_ranking_weights
  set relevance_weight=new.marketplace_relevance_weight,
      seller_verification_weight=new.marketplace_seller_verification_weight,
      listing_quality_weight=new.marketplace_listing_quality_weight,
      conversion_rate_weight=new.marketplace_conversion_rate_weight,
      sales_history_weight=new.marketplace_sales_history_weight,
      rating_weight=new.marketplace_rating_weight,
      freshness_weight=new.marketplace_freshness_weight,
      trending_weight=new.marketplace_trending_weight,
      updated_at=now()
  where is_singleton=true;
  return new;
end $$;

drop trigger if exists trg_sync_marketplace_weights_from_algorithm on public.algorithm_settings;
create trigger trg_sync_marketplace_weights_from_algorithm
after update of marketplace_relevance_weight,marketplace_seller_verification_weight,marketplace_listing_quality_weight,
  marketplace_conversion_rate_weight,marketplace_sales_history_weight,marketplace_rating_weight,
  marketplace_freshness_weight,marketplace_trending_weight
on public.algorithm_settings for each row when (new.is_singleton=true)
execute function public.sync_marketplace_weights_from_algorithm();

create or replace function public.sync_algorithm_from_legacy_marketplace_weights()
returns trigger language plpgsql set search_path='public' as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  update public.algorithm_settings
  set marketplace_relevance_weight=new.relevance_weight,
      marketplace_seller_verification_weight=new.seller_verification_weight,
      marketplace_listing_quality_weight=new.listing_quality_weight,
      marketplace_conversion_rate_weight=new.conversion_rate_weight,
      marketplace_sales_history_weight=new.sales_history_weight,
      marketplace_rating_weight=new.rating_weight,
      marketplace_freshness_weight=new.freshness_weight,
      marketplace_trending_weight=new.trending_weight,
      updated_at=now()
  where is_singleton=true;
  return new;
end $$;

drop trigger if exists trg_sync_algorithm_from_legacy_marketplace_weights on public.marketplace_ranking_weights;
create trigger trg_sync_algorithm_from_legacy_marketplace_weights
after update of relevance_weight,seller_verification_weight,listing_quality_weight,conversion_rate_weight,
  sales_history_weight,rating_weight,freshness_weight,trending_weight
on public.marketplace_ranking_weights for each row when (new.is_singleton=true)
execute function public.sync_algorithm_from_legacy_marketplace_weights();

-- 2) Extend the existing interest profile rather than introducing a competing profile store.
alter table public.user_interest_profiles
  add column if not exists creator_scores jsonb not null default '{}'::jsonb,
  add column if not exists seller_scores jsonb not null default '{}'::jsonb,
  add column if not exists commerce_scores jsonb not null default '{}'::jsonb,
  add column if not exists profile_version integer not null default 2,
  add column if not exists last_recomputed_at timestamptz,
  add column if not exists needs_recompute boolean not null default true,
  add column if not exists last_event_at timestamptz;

-- Clients may read/reset their profile, but may no longer directly award themselves affinity scores.
drop policy if exists update_own_interest_profile on public.user_interest_profiles;
drop policy if exists upsert_own_interest_profile on public.user_interest_profiles;

-- Exclude explicit sensitive-trait labels from commercial personalization.
create or replace function public.is_allowed_personalization_key(p_key text)
returns boolean language sql immutable set search_path='public' as $$
  select p_key is not null and btrim(p_key)<>'' and lower(p_key) !~
    '(religion|religious|christian|muslim|islam|hindu|jewish|politic|political|political party|sexual orientation|sexuality|lesbian|gay|ethnicity|racial identity|race identity|medical condition|health condition|hiv|aids|cancer diagnosis|criminal history|trade union)';
$$;

create or replace function public.recompute_user_interest_profile(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_requester uuid:=auth.uid();
  v_role text:=coalesce(auth.role(),'');
  v_half_life numeric:=45;
  v_cap numeric:=100;
  v_window integer:=365;
  v_top_limit integer:=12;
  w_search numeric:=2; w_view numeric:=3; w_dwell numeric:=5; w_complete numeric:=7;
  w_react numeric:=5; w_comment numeric:=6; w_save numeric:=9; w_share numeric:=8;
  w_follow numeric:=10; w_profile numeric:=4; w_wishlist numeric:=10; w_checkout numeric:=14;
  w_purchase numeric:=20; w_skip numeric:=2; w_hide numeric:=8; w_not_interested numeric:=12; w_block numeric:=20;
  v_scores jsonb:='{}'::jsonb;
  v_creators jsonb:='{}'::jsonb;
  v_sellers jsonb:='{}'::jsonb;
  v_commerce jsonb:='{}'::jsonb;
  v_top text[]:='{}'::text[];
  v_count integer:=0;
begin
  if p_user_id is null then raise exception 'user required'; end if;
  if v_requester is not null and v_requester<>p_user_id and v_role<>'service_role' and not public.is_admin(v_requester) then
    raise exception 'Not authorized to recompute this profile' using errcode='42501';
  end if;

  select interest_half_life_days,interest_score_cap,interest_recompute_window_days,interest_top_category_limit,
         interest_search_weight,interest_view_weight,interest_dwell_weight,interest_completion_weight,
         interest_reaction_weight,interest_comment_weight,interest_save_weight,interest_share_weight,
         interest_follow_weight,interest_profile_visit_weight,interest_wishlist_weight,interest_checkout_weight,
         interest_purchase_weight,interest_skip_penalty,interest_hide_penalty,interest_not_interested_penalty,interest_block_penalty
  into v_half_life,v_cap,v_window,v_top_limit,w_search,w_view,w_dwell,w_complete,w_react,w_comment,w_save,w_share,
       w_follow,w_profile,w_wishlist,w_checkout,w_purchase,w_skip,w_hide,w_not_interested,w_block
  from public.algorithm_settings where is_singleton=true limit 1;
  v_half_life:=greatest(coalesce(v_half_life,45),1); v_cap:=greatest(coalesce(v_cap,100),1);
  v_window:=greatest(coalesce(v_window,365),30); v_top_limit:=least(greatest(coalesce(v_top_limit,12),3),30);

  with category_events as (
    select p.category key,
      case le.event_type
        when 'impression' then w_view*.20 when 'open' then w_view when 'click' then w_view
        when 'time_on_page' then w_dwell when 'video_play' then w_dwell*.70
        when 'favorite' then w_wishlist when 'save' then w_save when 'wishlist_add' then w_wishlist
        when 'share' then w_share when 'seller_profile_visit' then w_profile when 'contact_seller' then w_profile
        when 'chat_opened' then w_profile when 'checkout_initiated' then w_checkout when 'checkout_completed' then w_checkout
        when 'purchase' then w_purchase when 'service_order' then w_purchase when 'course_enrollment' then w_purchase
        when 'job_application' then w_purchase*.75 when 'unfavorite' then -w_view when 'wishlist_remove' then -w_view
        else w_view*.35 end::numeric weight, le.created_at ts
    from public.listing_events le join public.products p on p.id=le.listing_id
    where le.user_id=p_user_id and le.created_at>=now()-make_interval(days=>v_window)

    union all
    select sp.category,
      case se.event_type when 'qualified_view' then w_view when 'watch_complete' then w_complete when 'replay' then w_complete*.8
        when 'dwell' then w_dwell when 'share' then w_share when 'profile_visit' then w_profile when 'follow' then w_follow
        when 'unfollow' then -w_follow*.5 when 'skip' then -w_skip when 'not_interested' then -w_not_interested
        when 'hide_creator' then -w_hide else 0 end::numeric,
      se.created_at
    from public.social_post_events se join public.social_posts sp on sp.id=se.post_id
    where se.user_id=p_user_id and se.created_at>=now()-make_interval(days=>v_window)

    union all
    select sp.category,
      (case when sv.qualified_view_at is not null then w_view else w_view*.25 end
       + least(coalesce(sv.total_watch_ms,0)::numeric/30000,1)*w_dwell
       + least(coalesce(sv.last_completion_ratio,0),1)*w_complete)::numeric,
      coalesce(sv.last_started_at,sv.viewed_at)
    from public.social_post_views sv join public.social_posts sp on sp.id=sv.post_id
    where sv.user_id=p_user_id and coalesce(sv.last_started_at,sv.viewed_at)>=now()-make_interval(days=>v_window)

    union all select sp.category,w_react,spr.created_at from public.social_post_reactions spr join public.social_posts sp on sp.id=spr.post_id where spr.user_id=p_user_id and spr.created_at>=now()-make_interval(days=>v_window)
    union all select sp.category,w_save,sps.created_at from public.social_post_saves sps join public.social_posts sp on sp.id=sps.post_id where sps.user_id=p_user_id and sps.created_at>=now()-make_interval(days=>v_window)
    union all select sp.category,w_comment,spc.created_at from public.social_post_comments spc join public.social_posts sp on sp.id=spc.post_id where spc.user_id=p_user_id and spc.status='visible' and spc.created_at>=now()-make_interval(days=>v_window)

    union all select nullif(sh.category,''),w_search,sh.created_at from public.search_history sh where sh.user_id=p_user_id and sh.category is not null and sh.created_at>=now()-make_interval(days=>v_window)
    union all select p.category,w_search*2,sh.created_at from public.search_history sh join public.products p on p.id=sh.clicked_listing_id where sh.user_id=p_user_id and sh.clicked_listing_id is not null and sh.created_at>=now()-make_interval(days=>v_window)
    union all select p.category,w_wishlist,wl.created_at from public.wishlist wl join public.products p on p.id=wl.product_id where wl.user_id=p_user_id and wl.created_at>=now()-make_interval(days=>v_window)
    union all select p.category,w_purchase,o.created_at from public.orders o join public.products p on p.id=o.product_id where o.buyer_id=p_user_id and o.status in ('paid','processing','delivered','completed') and o.created_at>=now()-make_interval(days=>v_window)
    union all select nullif(ua.category,''),case when ua.activity_type ilike '%purchase%' then w_purchase when ua.activity_type ilike '%save%' or ua.activity_type ilike '%favorite%' then w_save else w_view end,ua.created_at from public.user_activity ua where ua.user_id=p_user_id and ua.category is not null and ua.created_at>=now()-make_interval(days=>v_window)
  ), filtered as (
    select key,weight,ts from category_events where public.is_allowed_personalization_key(key)
  ), decayed as (
    select key, weight * power(0.5, greatest(extract(epoch from (now()-ts))/86400.0,0)/v_half_life) val from filtered
  ), raw as (
    select key,sum(val) raw_score from decayed group by key
  ), norm as (
    select key,least(v_cap,greatest(0,case when max(greatest(raw_score,0)) over()>0 then greatest(raw_score,0)/max(greatest(raw_score,0)) over()*v_cap else 0 end)) score from raw
  )
  select coalesce(jsonb_object_agg(key,round(score,2)) filter(where score>0),'{}'::jsonb),
         coalesce((array_agg(key order by score desc) filter(where score>0))[1:v_top_limit],'{}'::text[]),
         (select count(*) from filtered)
  into v_scores,v_top,v_count from norm;

  with creator_events as (
    select sp.author_id key,
      (case when sv.qualified_view_at is not null then w_view else w_view*.25 end + least(coalesce(sv.total_watch_ms,0)::numeric/30000,1)*w_dwell + least(coalesce(sv.last_completion_ratio,0),1)*w_complete)::numeric weight,
      coalesce(sv.last_started_at,sv.viewed_at) ts
    from public.social_post_views sv join public.social_posts sp on sp.id=sv.post_id where sv.user_id=p_user_id and sp.author_id<>p_user_id and coalesce(sv.last_started_at,sv.viewed_at)>=now()-make_interval(days=>v_window)
    union all select sp.author_id,case se.event_type when 'share' then w_share when 'profile_visit' then w_profile when 'follow' then w_follow when 'unfollow' then -w_follow*.5 when 'not_interested' then -w_not_interested when 'hide_creator' then -w_hide when 'skip' then -w_skip else w_view*.25 end,se.created_at from public.social_post_events se join public.social_posts sp on sp.id=se.post_id where se.user_id=p_user_id and sp.author_id<>p_user_id and se.created_at>=now()-make_interval(days=>v_window)
    union all select sp.author_id,w_react,r.created_at from public.social_post_reactions r join public.social_posts sp on sp.id=r.post_id where r.user_id=p_user_id and sp.author_id<>p_user_id and r.created_at>=now()-make_interval(days=>v_window)
    union all select sp.author_id,w_save,s.created_at from public.social_post_saves s join public.social_posts sp on sp.id=s.post_id where s.user_id=p_user_id and sp.author_id<>p_user_id and s.created_at>=now()-make_interval(days=>v_window)
    union all select following_id,w_follow,created_at from public.user_follows where follower_id=p_user_id and created_at>=now()-make_interval(days=>v_window)
    union all select blocked_id,-w_block,created_at from public.user_blocks where blocker_id=p_user_id and created_at>=now()-make_interval(days=>v_window)
  ), raw as (
    select key,sum(weight*power(0.5,greatest(extract(epoch from(now()-ts))/86400.0,0)/v_half_life)) raw_score from creator_events where key is not null group by key
  ), norm as (
    select key,least(v_cap,greatest(0,case when max(greatest(raw_score,0)) over()>0 then greatest(raw_score,0)/max(greatest(raw_score,0)) over()*v_cap else 0 end)) score from raw
  ) select coalesce(jsonb_object_agg(key::text,round(score,2)) filter(where score>0),'{}'::jsonb) into v_creators from norm;

  with seller_events as (
    select p.uploaded_by key,
      case le.event_type when 'purchase' then w_purchase when 'checkout_completed' then w_checkout when 'checkout_initiated' then w_checkout when 'wishlist_add' then w_wishlist when 'favorite' then w_wishlist when 'seller_profile_visit' then w_profile when 'contact_seller' then w_profile when 'chat_opened' then w_profile else w_view end::numeric weight,
      le.created_at ts
    from public.listing_events le join public.products p on p.id=le.listing_id where le.user_id=p_user_id and p.uploaded_by<>p_user_id and le.created_at>=now()-make_interval(days=>v_window)
    union all select p.uploaded_by,w_wishlist,wl.created_at from public.wishlist wl join public.products p on p.id=wl.product_id where wl.user_id=p_user_id and p.uploaded_by<>p_user_id and wl.created_at>=now()-make_interval(days=>v_window)
    union all select o.seller_id,w_purchase,o.created_at from public.orders o where o.buyer_id=p_user_id and o.seller_id<>p_user_id and o.status in ('paid','processing','delivered','completed') and o.created_at>=now()-make_interval(days=>v_window)
    union all select blocked_id,-w_block,created_at from public.user_blocks where blocker_id=p_user_id and created_at>=now()-make_interval(days=>v_window)
  ), raw as (
    select key,sum(weight*power(0.5,greatest(extract(epoch from(now()-ts))/86400.0,0)/v_half_life)) raw_score from seller_events where key is not null group by key
  ), norm as (
    select key,least(v_cap,greatest(0,case when max(greatest(raw_score,0)) over()>0 then greatest(raw_score,0)/max(greatest(raw_score,0)) over()*v_cap else 0 end)) score from raw
  ) select coalesce(jsonb_object_agg(key::text,round(score,2)) filter(where score>0),'{}'::jsonb) into v_sellers from norm;

  with commerce_events as (
    select p.category key,
      case le.event_type when 'favorite' then w_wishlist when 'wishlist_add' then w_wishlist when 'checkout_initiated' then w_checkout when 'checkout_completed' then w_checkout when 'purchase' then w_purchase when 'service_order' then w_purchase when 'course_enrollment' then w_purchase else 0 end::numeric weight,
      le.created_at ts
    from public.listing_events le join public.products p on p.id=le.listing_id where le.user_id=p_user_id and le.created_at>=now()-make_interval(days=>v_window)
    union all select p.category,w_wishlist,wl.created_at from public.wishlist wl join public.products p on p.id=wl.product_id where wl.user_id=p_user_id and wl.created_at>=now()-make_interval(days=>v_window)
    union all select p.category,w_purchase,o.created_at from public.orders o join public.products p on p.id=o.product_id where o.buyer_id=p_user_id and o.status in ('paid','processing','delivered','completed') and o.created_at>=now()-make_interval(days=>v_window)
  ), filtered as (select * from commerce_events where weight<>0 and public.is_allowed_personalization_key(key)), raw as (
    select key,sum(weight*power(0.5,greatest(extract(epoch from(now()-ts))/86400.0,0)/v_half_life)) raw_score from filtered group by key
  ), norm as (
    select key,least(v_cap,greatest(0,case when max(greatest(raw_score,0)) over()>0 then greatest(raw_score,0)/max(greatest(raw_score,0)) over()*v_cap else 0 end)) score from raw
  ) select coalesce(jsonb_object_agg(key,round(score,2)) filter(where score>0),'{}'::jsonb) into v_commerce from norm;

  insert into public.user_interest_profiles(user_id,scores,top_categories,interaction_count,last_updated,creator_scores,seller_scores,commerce_scores,profile_version,last_recomputed_at,needs_recompute,last_event_at)
  values(p_user_id,v_scores,v_top,v_count,now(),v_creators,v_sellers,v_commerce,2,now(),false,now())
  on conflict(user_id) do update set scores=excluded.scores,top_categories=excluded.top_categories,interaction_count=excluded.interaction_count,
    last_updated=excluded.last_updated,creator_scores=excluded.creator_scores,seller_scores=excluded.seller_scores,commerce_scores=excluded.commerce_scores,
    profile_version=2,last_recomputed_at=now(),needs_recompute=false;

  return jsonb_build_object('user_id',p_user_id,'scores',v_scores,'top_categories',v_top,'creator_scores',v_creators,'seller_scores',v_sellers,'commerce_scores',v_commerce,'interaction_count',v_count,'profile_version',2);
end $$;

revoke all on function public.recompute_user_interest_profile(uuid) from public,anon;
grant execute on function public.recompute_user_interest_profile(uuid) to authenticated,service_role;

create or replace function public.mark_interest_profile_dirty()
returns trigger language plpgsql security definer set search_path='public' as $$
declare v_doc jsonb; v_uid uuid; v_ts timestamptz:=now();
begin
  v_doc:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  begin
    v_uid:=coalesce(nullif(v_doc->>'user_id','')::uuid,nullif(v_doc->>'buyer_id','')::uuid,nullif(v_doc->>'follower_id','')::uuid);
  exception when others then v_uid:=null; end;
  begin v_ts:=coalesce(nullif(v_doc->>'created_at','')::timestamptz,now()); exception when others then v_ts:=now(); end;
  if v_uid is not null then
    insert into public.user_interest_profiles(user_id,needs_recompute,last_event_at,last_updated)
    values(v_uid,true,v_ts,now())
    on conflict(user_id) do update set needs_recompute=true,last_event_at=greatest(coalesce(public.user_interest_profiles.last_event_at,'epoch'::timestamptz),excluded.last_event_at);
  end if;
  return coalesce(new,old);
end $$;

-- Attach cheap dirty markers to existing authoritative behavior sources.
do $$ declare t text; begin
  foreach t in array array['listing_events','social_post_events','social_post_views','social_post_reactions','social_post_saves','social_post_comments','wishlist','orders','user_follows','search_history','user_activity'] loop
    execute format('drop trigger if exists trg_interest_dirty_%I on public.%I',t,t);
    execute format('create trigger trg_interest_dirty_%I after insert or update or delete on public.%I for each row execute function public.mark_interest_profile_dirty()',t,t);
  end loop;
end $$;

create or replace function public.process_dirty_interest_profiles(p_limit integer default 100)
returns integer language plpgsql security definer set search_path='public' as $$
declare r record; v_count integer:=0;
begin
  for r in select user_id from public.user_interest_profiles where needs_recompute=true order by coalesce(last_event_at,last_updated) asc limit greatest(1,least(coalesce(p_limit,100),1000))
  loop
    perform public.recompute_user_interest_profile(r.user_id); v_count:=v_count+1;
  end loop;
  return v_count;
end $$;
revoke all on function public.process_dirty_interest_profiles(integer) from public,anon,authenticated;
grant execute on function public.process_dirty_interest_profiles(integer) to service_role;

-- Bootstrap users who already have behavioral history.
insert into public.user_interest_profiles(user_id,needs_recompute,last_event_at,last_updated)
select u.user_id,true,max(u.ts),now() from (
  select user_id,created_at ts from public.listing_events where user_id is not null
  union all select user_id,created_at from public.social_post_events where user_id is not null
  union all select user_id,created_at from public.search_history where user_id is not null
  union all select user_id,created_at from public.wishlist where user_id is not null
  union all select buyer_id,created_at from public.orders where buyer_id is not null
) u group by u.user_id
on conflict(user_id) do update set needs_recompute=true,last_event_at=greatest(coalesce(public.user_interest_profiles.last_event_at,'epoch'::timestamptz),excluded.last_event_at);

-- Schedule batched learning on the already-installed pg_cron extension.
do $$ begin
  if not exists(select 1 from cron.job where jobname='dright-interest-learning-15m') then
    perform cron.schedule('dright-interest-learning-15m','*/15 * * * *','select public.process_dirty_interest_profiles(100);');
  end if;
end $$;

-- 3) Server-side personalized Marketplace feed; existing browser ranking remains a compatibility fallback.
create or replace function public.get_marketplace_feed_v2(
  p_cursor text default null,
  p_limit integer default null,
  p_search text default null,
  p_category text default null,
  p_min_price numeric default null,
  p_max_price numeric default null,
  p_location text default null,
  p_verified_only boolean default false,
  p_min_rating numeric default null,
  p_product_type text default null
) returns jsonb
language plpgsql security definer set search_path='public' as $$
declare
  v_uid uuid:=auth.uid(); v_limit integer:=30; v_explore numeric:=8;
  wr numeric:=30; wv numeric:=15; wq numeric:=10; wc numeric:=15; ws numeric:=10; wrat numeric:=10; wf numeric:=5; wt numeric:=5;
  wi numeric:=22; wsa numeric:=10; wco numeric:=18; wsp numeric:=8;
  v_cursor_score numeric; v_cursor_epoch numeric; v_cursor_id uuid; v_result jsonb;
begin
  select marketplace_page_size,marketplace_exploration_percentage,marketplace_relevance_weight,marketplace_seller_verification_weight,
    marketplace_listing_quality_weight,marketplace_conversion_rate_weight,marketplace_sales_history_weight,marketplace_rating_weight,
    marketplace_freshness_weight,marketplace_trending_weight,marketplace_interest_weight,marketplace_seller_affinity_weight,
    marketplace_commerce_weight,search_personalization_weight
  into v_limit,v_explore,wr,wv,wq,wc,ws,wrat,wf,wt,wi,wsa,wco,wsp
  from public.algorithm_settings where is_singleton=true limit 1;
  v_limit:=least(greatest(coalesce(p_limit,v_limit,30),5),50);
  if p_cursor is not null and p_cursor<>'' then begin
    v_cursor_score:=split_part(p_cursor,'|',1)::numeric; v_cursor_epoch:=split_part(p_cursor,'|',2)::numeric; v_cursor_id:=split_part(p_cursor,'|',3)::uuid;
  exception when others then raise exception 'Invalid marketplace cursor'; end; end if;

  with base as (
    select p.id,p.name,p.description,p.price,p.commission_rate,p.image_url,p.category,p.uploaded_by,p.created_at,p.sales_team_tier,
      p.is_free,p.stock_quantity,p.initial_stock,p.product_type,p.demo_video_url,p.total_reviews,p.average_rating,p.total_sales,p.view_count,p.is_featured,p.is_sponsored,
      p.location,p.tags,p.brand,p.condition,
      u.full_name seller_name,u.avatar_url seller_avatar,u.store_title store_name,coalesce(u.is_verified,false) seller_verified,
      coalesce(ls.dds_score,0)::numeric dds_score,coalesce(ls.trending_score,0)::numeric listing_trending_score,
      case when coalesce(btrim(p_search),'')='' then .50
        when lower(p.name)=lower(btrim(p_search)) then 1.00
        when lower(p.name) like lower(btrim(p_search))||'%' then .90
        when p.name ilike '%'||btrim(p_search)||'%' then .80
        when p.category ilike '%'||btrim(p_search)||'%' then .65
        when coalesce(p.description,'') ilike '%'||btrim(p_search)||'%' then .45
        when exists(select 1 from unnest(coalesce(p.tags,'{}'::text[])) tag where tag ilike '%'||btrim(p_search)||'%') then .55
        else 0 end::numeric search_relevance,
      case when v_uid is null then 0 else coalesce((uip.scores->>p.category)::numeric,0)/100 end category_affinity,
      case when v_uid is null then 0 else coalesce((uip.seller_scores->>p.uploaded_by::text)::numeric,0)/100 end seller_affinity,
      case when v_uid is null then 0 else coalesce((uip.commerce_scores->>p.category)::numeric,0)/100 end commerce_affinity,
      (case when p.image_url is not null then .34 else 0 end + case when length(coalesce(p.description,''))>=50 then .33 else 0 end + case when p.stock_quantity is not null then .33 else 0 end)::numeric listing_quality,
      least(case when coalesce(p.view_count,0)>0 then coalesce(p.total_sales,0)::numeric/p.view_count else 0 end,1)::numeric conversion_rate,
      least(ln(1+greatest(coalesce(p.total_sales,0),0))/ln(101),1)::numeric sales_score,
      case when coalesce(p.total_reviews,0)>0 then least(greatest(coalesce(p.average_rating,0)::numeric/5,0),1) else .35 end rating_score,
      greatest(0,1-extract(epoch from(now()-p.created_at))/2592000.0)::numeric freshness_score,
      greatest(least(coalesce(ls.trending_score,0)::numeric/100,1),least(coalesce(p.view_count,0)::numeric/200,1))::numeric trend_score
    from public.products p
    join public.users u on u.id=p.uploaded_by
    left join public.listing_scores ls on ls.listing_id=p.id
    left join public.user_interest_profiles uip on uip.user_id=v_uid
    where p.is_active=true and p.is_hidden=false and p.approval_status='approved'
      and coalesce(u.account_status,'active') not in ('banned','suspended','deleted','disabled')
      and (p_category is null or p_category='' or lower(p.category)=lower(p_category))
      and (p_min_price is null or p.price>=p_min_price) and (p_max_price is null or p.price<=p_max_price)
      and (p_location is null or p_location='' or coalesce(p.location,u.store_location,u.location,'') ilike '%'||p_location||'%')
      and (not coalesce(p_verified_only,false) or coalesce(u.is_verified,false)=true)
      and (p_min_rating is null or coalesce(p.average_rating,0)>=p_min_rating)
      and (p_product_type is null or p_product_type='' or upper(p.product_type)=upper(p_product_type))
      and (coalesce(btrim(p_search),'')='' or p.name ilike '%'||btrim(p_search)||'%' or p.category ilike '%'||btrim(p_search)||'%' or coalesce(p.description,'') ilike '%'||btrim(p_search)||'%' or exists(select 1 from unnest(coalesce(p.tags,'{}'::text[])) tag where tag ilike '%'||btrim(p_search)||'%'))
      and (v_uid is null or not exists(select 1 from public.user_blocks b where (b.blocker_id=v_uid and b.blocked_id=p.uploaded_by) or (b.blocker_id=p.uploaded_by and b.blocked_id=v_uid)))
  ), ranked as (
    select b.*,
      (b.search_relevance*wr + (case when b.seller_verified then 1 else 0 end)*wv + b.listing_quality*wq + b.conversion_rate*wc + b.sales_score*ws + b.rating_score*wrat + b.freshness_score*wf + b.trend_score*wt
       + b.category_affinity*wi + b.seller_affinity*wsa + b.commerce_affinity*wco
       + case when coalesce(btrim(p_search),'')<>'' then b.category_affinity*wsp else 0 end
       + least(b.dds_score,100)*.05
       + case when mod(abs(hashtextextended(b.id::text||coalesce(v_uid::text,'anon')||current_date::text,0)),100)<v_explore then greatest(v_explore*.35,1) else 0 end)::numeric final_score,
      case when v_uid is not null and b.commerce_affinity>=.65 then 'commerce_affinity'
           when v_uid is not null and b.category_affinity>=.55 then 'similar_category'
           when b.trend_score>=.70 then 'trending'
           when b.freshness_score>=.80 then 'fresh'
           else 'recommended' end recommendation_reason
    from base b
  ), keyed as (
    select * from ranked where v_cursor_score is null or final_score<v_cursor_score
      or (final_score=v_cursor_score and extract(epoch from created_at)<v_cursor_epoch)
      or (final_score=v_cursor_score and extract(epoch from created_at)=v_cursor_epoch and id<v_cursor_id)
  ), page_all as (
    select * from keyed order by final_score desc,created_at desc,id desc limit v_limit+1
  ), page as (
    select * from page_all order by final_score desc,created_at desc,id desc limit v_limit
  )
  select jsonb_build_object(
    'items',coalesce(jsonb_agg(to_jsonb(page)-'final_score'-'search_relevance'-'category_affinity'-'seller_affinity'-'commerce_affinity'-'listing_quality'-'conversion_rate'-'sales_score'-'rating_score'-'freshness_score'-'trend_score'-'dds_score'-'listing_trending_score' order by final_score desc,created_at desc,id desc),'[]'::jsonb),
    'has_more',(select count(*) from page_all)>v_limit,
    'next_cursor',(select final_score::text||'|'||extract(epoch from created_at)::text||'|'||id::text from page order by final_score asc,created_at asc,id asc limit 1),
    'personalized',(v_uid is not null and exists(select 1 from public.user_interest_profiles where user_id=v_uid and interaction_count>0)),
    'algorithm_version',2
  ) into v_result from page;
  return coalesce(v_result,jsonb_build_object('items','[]'::jsonb,'has_more',false,'next_cursor',null,'personalized',false,'algorithm_version',2));
end $$;
revoke all on function public.get_marketplace_feed_v2(text,integer,text,text,numeric,numeric,text,boolean,numeric,text) from public;
grant execute on function public.get_marketplace_feed_v2(text,integer,text,text,numeric,numeric,text,boolean,numeric,text) to anon,authenticated;

-- 4) Add non-sensitive interest relevance and expected-value normalization to existing sponsored delivery.
create or replace function public.get_promotion_delivery_v2(p_placement text, p_limit integer default 5)
returns table(campaign_id uuid,campaign_asset_id uuid,asset_type text,asset_id uuid,tier_code text,goal text,placement text,title text,description text,image_url text,cta_label text,destination text,allow_comments boolean,seller_id uuid,sponsored_label text)
language plpgsql security definer set search_path='public' as $$
declare
  v_place text:=lower(btrim(coalesce(p_placement,'marketplace'))); v_limit integer:=greatest(1,least(coalesce(p_limit,5),20));
  v_viewer uuid:=auth.uid(); v_cap integer; v_window integer; v_min_quality numeric; v_interest_weight numeric:=20; v_min_relevance numeric:=.10;
begin
  select ap.frequency_cap,ap.frequency_window_hours into v_cap,v_window from public.ad_placements ap where ap.code=v_place and ap.enabled=true;
  if v_cap is null then return; end if;
  select minimum_quality_score into v_min_quality from public.promotion_distribution_settings where singleton=true;
  select promotion_interest_weight,promotion_min_relevance into v_interest_weight,v_min_relevance from public.algorithm_settings where is_singleton=true limit 1;
  return query
  with candidates as (
    select pc.id campaign_id,ca.id campaign_asset_id,ca.asset_type,ca.asset_id,pc.tier_code,pc.goal,
      coalesce(cr.headline,ca.title_snapshot) title,cr.description,coalesce(cr.media_url,ca.image_snapshot) image_url,
      coalesce(cr.cta_label,'Learn More') cta_label,ca.destination_snapshot destination,pc.allow_comments,pc.seller_id,
      pc.quality_score,pt.tier_rank,coalesce(cp.actual_spend,0) placement_spend,pc.media_budget,
      greatest(
        case when v_viewer is null then .35 else 0 end,
        case when pc.audience_category is not null and public.is_allowed_personalization_key(pc.audience_category) then coalesce((uip.scores->>pc.audience_category)::numeric,0)/100 else 0 end,
        case when prod.category is not null and public.is_allowed_personalization_key(prod.category) then coalesce((uip.scores->>prod.category)::numeric,0)/100 else 0 end,
        coalesce((select max(coalesce((uip.scores->>i)::numeric,0)/100) from unnest(coalesce(pc.audience_interests,'{}'::text[])) i where public.is_allowed_personalization_key(i)),0),
        case when pc.audience_category is null and cardinality(coalesce(pc.audience_interests,'{}'::text[]))=0 and prod.category is null then .35 else 0 end
      )::numeric relevance_score,
      case
        when pc.goal='more_views' then coalesce((pc.pricing_snapshot->>'cost_per_1000_impressions')::numeric,6)
        else coalesce((pc.pricing_snapshot->>'cost_per_click')::numeric,.15) * 1000 * greatest(
          case when pc.actual_impressions>0 then pc.actual_clicks::numeric/pc.actual_impressions else 0 end,
          coalesce((pc.pricing_snapshot->>'default_ctr')::numeric,.02)
        )
      end::numeric expected_ecpm
    from public.promotion_campaigns pc
    join public.promotion_tiers pt on pt.code=pc.tier_code and pt.is_enabled=true
    join public.campaign_placements cp on cp.campaign_id=pc.id and cp.placement_code=v_place and cp.status='enabled'
    join public.ad_placements ap on ap.code=cp.placement_code and ap.enabled=true
    join public.campaign_assets ca on ca.campaign_id=pc.id and ca.status='eligible' and ca.asset_type=any(ap.supported_asset_types)
    left join public.products prod on ca.asset_type in ('product','service','course') and prod.id=ca.asset_id
    left join public.user_interest_profiles uip on uip.user_id=v_viewer
    left join lateral(select c.headline,c.description,c.media_url,c.cta_label from public.promotion_creatives c where c.campaign_id=pc.id and (c.campaign_asset_id=ca.id or c.campaign_asset_id is null) and c.moderation_status='approved' order by (c.campaign_asset_id=ca.id) desc,c.created_at desc limit 1) cr on true
    where pc.status='active' and pc.payment_status='paid' and pc.payment_verified_at is not null and pc.moderation_status='approved'
      and pc.start_date<=now() and pc.end_date>now() and coalesce(pc.actual_spend,0)<pc.media_budget
      and pc.quality_score>=coalesce(v_min_quality,0) and public.promotion_viewer_is_eligible(pc.id,v_viewer)
      and (v_viewer is null or not exists(select 1 from public.promotion_feedback pf where pf.user_id=v_viewer and pf.campaign_id=pc.id and pf.feedback_type in('hide','not_relevant')))
      and (v_viewer is null or not exists(select 1 from public.user_blocks b where (b.blocker_id=v_viewer and b.blocked_id=pc.seller_id) or (b.blocker_id=pc.seller_id and b.blocked_id=v_viewer)))
      and (v_viewer is null or (select count(*) from public.sponsored_listing_logs sl where sl.user_id=v_viewer and sl.campaign_id=pc.id and sl.placement=v_place and sl.created_at>=now()-make_interval(hours=>v_window))<v_cap)
  )
  select c.campaign_id,c.campaign_asset_id,c.asset_type,c.asset_id,c.tier_code,c.goal,v_place,c.title,c.description,c.image_url,c.cta_label,c.destination,c.allow_comments,c.seller_id,'Sponsored'::text
  from candidates c
  where v_viewer is null or c.relevance_score>=coalesce(v_min_relevance,.10)
    or not exists(select 1 from public.user_interest_profiles u where u.user_id=v_viewer and u.interaction_count>0)
  order by (c.expected_ecpm * (0.5+least(greatest(c.quality_score,0),1)) * (1 + c.relevance_score*least(greatest(coalesce(v_interest_weight,20),0),100)/100) * (1 + least(c.tier_rank,3)*.08)) desc,
    (c.placement_spend/greatest(c.media_budget,.01)) asc,
    md5(c.campaign_id::text||date_trunc('hour',now())::text||coalesce(v_viewer::text,''))
  limit v_limit;
end $$;

-- Remove the permissive OR-policy; the existing restrictive policy + BEFORE INSERT guard remain authoritative.
drop policy if exists insert_sponsored_logs on public.sponsored_listing_logs;

-- Prime a bounded batch so existing users begin receiving learned profiles immediately.
select public.process_dirty_interest_profiles(100);
