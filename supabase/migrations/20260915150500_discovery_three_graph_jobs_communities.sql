-- DRIGHT2 three-graph discovery completion.
-- Additive/backwards-compatible: preserves get_social_feed_v2/list_communities contracts and existing interest table.

alter table public.algorithm_settings
  add column if not exists social_commerce_affinity_weight numeric not null default 4,
  add column if not exists jobs_page_size integer not null default 30,
  add column if not exists jobs_search_weight numeric not null default 40,
  add column if not exists jobs_category_affinity_weight numeric not null default 14,
  add column if not exists jobs_skills_weight numeric not null default 20,
  add column if not exists jobs_location_weight numeric not null default 8,
  add column if not exists jobs_application_history_weight numeric not null default 18,
  add column if not exists jobs_employer_affinity_weight numeric not null default 8,
  add column if not exists jobs_freshness_weight numeric not null default 10,
  add column if not exists jobs_exploration_percentage numeric not null default 8,
  add column if not exists communities_interest_weight numeric not null default 20,
  add column if not exists communities_friend_weight numeric not null default 12,
  add column if not exists communities_activity_weight numeric not null default 10,
  add column if not exists communities_growth_weight numeric not null default 8,
  add column if not exists communities_freshness_weight numeric not null default 6,
  add column if not exists communities_exploration_percentage numeric not null default 10;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='algorithm_social_commerce_range') then
    alter table public.algorithm_settings add constraint algorithm_social_commerce_range check (social_commerce_affinity_weight between 0 and 30);
  end if;
  if not exists (select 1 from pg_constraint where conname='algorithm_jobs_page_size_range') then
    alter table public.algorithm_settings add constraint algorithm_jobs_page_size_range check (jobs_page_size between 5 and 60);
  end if;
  if not exists (select 1 from pg_constraint where conname='algorithm_jobs_exploration_range') then
    alter table public.algorithm_settings add constraint algorithm_jobs_exploration_range check (jobs_exploration_percentage between 0 and 50);
  end if;
  if not exists (select 1 from pg_constraint where conname='algorithm_communities_exploration_range') then
    alter table public.algorithm_settings add constraint algorithm_communities_exploration_range check (communities_exploration_percentage between 0 and 50);
  end if;
end $$;

alter table public.user_interest_profiles
  add column if not exists job_scores jsonb not null default '{}'::jsonb,
  add column if not exists job_employer_scores jsonb not null default '{}'::jsonb,
  add column if not exists job_interaction_count integer not null default 0,
  add column if not exists last_job_recomputed_at timestamptz;

create or replace function public.mark_interest_profile_dirty()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare v_doc jsonb; v_uid uuid; v_ts timestamptz:=now();
begin
  v_doc:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  begin
    v_uid:=coalesce(
      nullif(v_doc->>'user_id','')::uuid,
      nullif(v_doc->>'buyer_id','')::uuid,
      nullif(v_doc->>'follower_id','')::uuid,
      nullif(v_doc->>'viewer_id','')::uuid,
      nullif(v_doc->>'applicant_id','')::uuid
    );
  exception when others then v_uid:=null; end;
  begin v_ts:=coalesce(nullif(v_doc->>'created_at','')::timestamptz,now()); exception when others then v_ts:=now(); end;
  if v_uid is not null then
    insert into public.user_interest_profiles(user_id,needs_recompute,last_event_at,last_updated)
    values(v_uid,true,v_ts,now())
    on conflict(user_id) do update set
      needs_recompute=true,
      last_event_at=greatest(coalesce(public.user_interest_profiles.last_event_at,'epoch'::timestamptz),excluded.last_event_at),
      last_updated=now();
  end if;
  return coalesce(new,old);
end $$;

-- Job-specific activity was not previously marking the shared interest profile dirty.
drop trigger if exists trg_interest_dirty_job_analytics on public.analytics_events;
create trigger trg_interest_dirty_job_analytics
after insert or update on public.analytics_events
for each row when (new.entity_type='job') execute function public.mark_interest_profile_dirty();

drop trigger if exists trg_interest_dirty_job_applications on public.job_applications;
create trigger trg_interest_dirty_job_applications
after insert or update or delete on public.job_applications
for each row execute function public.mark_interest_profile_dirty();

create or replace function public.recompute_user_job_interest_profile(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_requester uuid:=auth.uid();
  v_role text:=coalesce(auth.role(),'');
  v_half_life numeric:=45;
  v_cap numeric:=100;
  v_window integer:=365;
  w_view numeric:=3; w_dwell numeric:=5; w_save numeric:=9; w_share numeric:=8; w_apply numeric:=15;
  v_scores jsonb:='{}'::jsonb;
  v_employers jsonb:='{}'::jsonb;
  v_count integer:=0;
begin
  if p_user_id is null then raise exception 'user required'; end if;
  if v_requester is not null and v_requester<>p_user_id and v_role<>'service_role' and not public.is_admin(v_requester) then
    raise exception 'Not authorized to recompute this profile' using errcode='42501';
  end if;

  select interest_half_life_days,interest_score_cap,interest_recompute_window_days,
         interest_view_weight,interest_dwell_weight,interest_wishlist_weight,interest_share_weight,
         least(interest_purchase_weight*.75,75)
  into v_half_life,v_cap,v_window,w_view,w_dwell,w_save,w_share,w_apply
  from public.algorithm_settings where is_singleton=true limit 1;
  v_half_life:=greatest(coalesce(v_half_life,45),1);
  v_cap:=greatest(coalesce(v_cap,100),1);
  v_window:=greatest(coalesce(v_window,365),30);

  with events as (
    select j.category key,
      case ae.event_type
        when 'job_view' then w_view
        when 'view' then w_view
        when 'open' then w_view
        when 'click' then w_view*1.25
        when 'qualified_impression' then w_view*.7
        when 'dwell' then w_dwell
        when 'save' then w_save
        when 'favorite' then w_save
        when 'share' then w_share
        when 'job_application' then w_apply
        else w_view*.20 end::numeric weight,
      ae.created_at ts
    from public.analytics_events ae
    join public.jobs j on j.id=ae.entity_id
    where ae.viewer_id=p_user_id and ae.entity_type='job'
      and ae.created_at>=now()-make_interval(days=>v_window)
    union all
    select j.category,w_apply,ja.created_at
    from public.job_applications ja join public.jobs j on j.id=ja.job_id
    where ja.applicant_id=p_user_id and ja.created_at>=now()-make_interval(days=>v_window)
  ), filtered as (
    select key,weight,ts from events where public.is_allowed_personalization_key(key)
  ), raw as (
    select key,sum(weight*power(.5,greatest(extract(epoch from(now()-ts))/86400.0,0)/v_half_life)) raw_score
    from filtered group by key
  ), norm as (
    select key,least(v_cap,greatest(0,case when max(greatest(raw_score,0)) over()>0 then greatest(raw_score,0)/max(greatest(raw_score,0)) over()*v_cap else 0 end)) score
    from raw
  )
  select coalesce(jsonb_object_agg(key,round(score,2)) filter(where score>0),'{}'::jsonb),
         (select count(*) from filtered)
  into v_scores,v_count from norm;

  with events as (
    select j.employer_id key,
      case ae.event_type when 'job_application' then w_apply when 'save' then w_save when 'favorite' then w_save when 'share' then w_share when 'dwell' then w_dwell else w_view end::numeric weight,
      ae.created_at ts
    from public.analytics_events ae join public.jobs j on j.id=ae.entity_id
    where ae.viewer_id=p_user_id and ae.entity_type='job' and j.employer_id<>p_user_id
      and ae.created_at>=now()-make_interval(days=>v_window)
    union all
    select j.employer_id,w_apply,ja.created_at
    from public.job_applications ja join public.jobs j on j.id=ja.job_id
    where ja.applicant_id=p_user_id and j.employer_id<>p_user_id and ja.created_at>=now()-make_interval(days=>v_window)
  ), raw as (
    select key,sum(weight*power(.5,greatest(extract(epoch from(now()-ts))/86400.0,0)/v_half_life)) raw_score
    from events where key is not null group by key
  ), norm as (
    select key,least(v_cap,greatest(0,case when max(greatest(raw_score,0)) over()>0 then greatest(raw_score,0)/max(greatest(raw_score,0)) over()*v_cap else 0 end)) score
    from raw
  )
  select coalesce(jsonb_object_agg(key::text,round(score,2)) filter(where score>0),'{}'::jsonb) into v_employers from norm;

  insert into public.user_interest_profiles(user_id,job_scores,job_employer_scores,job_interaction_count,last_job_recomputed_at,last_updated)
  values(p_user_id,v_scores,v_employers,v_count,now(),now())
  on conflict(user_id) do update set
    job_scores=excluded.job_scores,
    job_employer_scores=excluded.job_employer_scores,
    job_interaction_count=excluded.job_interaction_count,
    last_job_recomputed_at=now(),
    last_updated=now();

  return jsonb_build_object('user_id',p_user_id,'job_scores',v_scores,'job_employer_scores',v_employers,'interaction_count',v_count);
end $$;
revoke all on function public.recompute_user_job_interest_profile(uuid) from public,anon;
grant execute on function public.recompute_user_job_interest_profile(uuid) to authenticated,service_role;

create or replace function public.process_dirty_interest_profiles(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare r record; v_count integer:=0;
begin
  for r in
    select user_id from public.user_interest_profiles
    where needs_recompute=true
    order by coalesce(last_event_at,last_updated) asc
    limit greatest(1,least(coalesce(p_limit,100),1000))
  loop
    perform public.recompute_user_interest_profile(r.user_id);
    perform public.recompute_user_job_interest_profile(r.user_id);
    v_count:=v_count+1;
  end loop;
  return v_count;
end $$;
revoke all on function public.process_dirty_interest_profiles(integer) from public,anon,authenticated;
grant execute on function public.process_dirty_interest_profiles(integer) to service_role;

-- Social V2 keeps the exact public signature while consuming continuous learned affinity + a deliberately small commerce signal.
create or replace function public.get_social_feed_v2(
  p_feed text default 'social', p_cursor text default null, p_limit integer default null,
  p_session_id uuid default null, p_target_id uuid default null, p_community_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid:=auth.uid(); v_feed text:=lower(trim(coalesce(p_feed,'social'))); v_session uuid; v_limit integer:=20; v_start_pos integer:=0;
  v_cursor_score numeric; v_cursor_epoch numeric; v_cursor_id uuid;
  v_explore numeric:=10; v_recency numeric:=8; v_watch numeric:=20; v_completion numeric:=18; v_save numeric:=12; v_share numeric:=10;
  v_comment numeric:=8; v_follow numeric:=8; v_friend numeric:=14; v_creator numeric:=10; v_trend numeric:=8; v_fresh numeric:=8;
  v_negative numeric:=25; v_creator_max integer:=2; v_category_max integer:=4; v_interest numeric:=14; v_commerce numeric:=4; v_result jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if v_feed='for_you' then v_feed:='social'; end if;
  if v_feed not in ('social','following','friends','mine','community') then raise exception 'Invalid Social feed'; end if;
  if v_feed='community' and (p_community_id is null or not public.community_can_view(p_community_id,v_uid)) then raise exception 'Community unavailable'; end if;

  select coalesce(p_limit,social_feed_batch_size),social_exploration_percentage,social_recency_weight,social_watch_weight,
    social_completion_weight,social_save_weight,social_share_weight,social_comment_weight,social_follow_weight,social_friend_affinity,
    social_creator_affinity,social_trend_weight,social_fresh_boost,social_negative_penalty,social_creator_max_per_window,
    social_category_max_per_window,social_interest_weight,social_commerce_affinity_weight
  into v_limit,v_explore,v_recency,v_watch,v_completion,v_save,v_share,v_comment,v_follow,v_friend,v_creator,v_trend,v_fresh,v_negative,
    v_creator_max,v_category_max,v_interest,v_commerce
  from public.algorithm_settings where is_singleton=true limit 1;
  v_limit:=least(greatest(coalesce(v_limit,20),5),50);

  if p_session_id is not null and exists(
    select 1 from public.social_feed_sessions where id=p_session_id and user_id=v_uid and expires_at>now()
      and feed_mode=v_feed and community_id is not distinct from p_community_id
  ) then
    v_session:=p_session_id;
    update public.social_feed_sessions set last_activity_at=now(),expires_at=greatest(expires_at,now()+interval '2 hours') where id=v_session;
  else
    insert into public.social_feed_sessions(user_id,feed_mode,community_id) values(v_uid,v_feed,p_community_id) returning id into v_session;
  end if;

  if p_cursor is not null and p_cursor<>'' then begin
    v_cursor_score:=split_part(p_cursor,'|',1)::numeric;
    v_cursor_epoch:=split_part(p_cursor,'|',2)::numeric;
    v_cursor_id:=split_part(p_cursor,'|',3)::uuid;
  exception when others then raise exception 'Invalid Social cursor'; end; end if;
  select coalesce(max(position),-1)+1 into v_start_pos from public.social_feed_session_items where session_id=v_session;

  with base as (
    select p.id,p.author_id,p.body,p.media_path,p.media_type,p.media_width,p.media_height,p.visibility,p.comments_enabled,p.allowed_reactions,
      p.created_at,p.updated_at,p.edited_at,p.community_id,p.source_type,p.category,p.topic_tags,p.linked_entity_type,p.linked_entity_id,
      p.linked_entity_url,p.is_pinned,u.full_name author_name,u.username author_username,u.avatar_url author_avatar,
      coalesce(u.is_verified,false) author_verified,
      exists(select 1 from public.user_follows f where f.follower_id=v_uid and f.following_id=p.author_id) is_following,
      exists(select 1 from public.user_follows f1 join public.user_follows f2 on f2.follower_id=f1.following_id and f2.following_id=f1.follower_id where f1.follower_id=v_uid and f1.following_id=p.author_id) is_friend,
      coalesce((select sum(v.play_count) from public.social_post_views v where v.post_id=p.id),0)::integer view_count,
      (select count(*)::integer from public.social_post_views v where v.post_id=p.id) unique_view_count,
      (select count(*)::integer from public.social_post_events e where e.post_id=p.id and e.event_type='click') click_count,
      (select count(*)::integer from public.social_post_reactions r where r.post_id=p.id) reaction_count,
      (select count(*)::integer from public.social_post_comments cm where cm.post_id=p.id and cm.status='visible') comment_count,
      (select count(*)::integer from public.social_post_saves s where s.post_id=p.id) save_count,
      (select count(*)::integer from public.social_post_events e where e.post_id=p.id and e.event_type='share') share_count,
      (select count(*)::integer from public.social_post_events e where e.post_id=p.id and e.event_type='watch_complete') completion_count,
      coalesce((select sum(e.watch_ms) from public.social_post_events e where e.post_id=p.id and e.watch_ms is not null),0)::numeric aggregate_watch_ms,
      (select r.reaction from public.social_post_reactions r where r.post_id=p.id and r.user_id=v_uid) current_reaction,
      exists(select 1 from public.social_post_saves s where s.post_id=p.id and s.user_id=v_uid) is_saved,
      c.name community_name,c.slug community_slug,c.avatar_url community_avatar,
      least(1,greatest(0,coalesce((ip.scores->>p.category)::numeric,0)/100))::numeric interest_affinity,
      least(1,greatest(0,coalesce((ip.commerce_scores->>p.category)::numeric,0)/100))::numeric commerce_affinity,
      least(1,greatest(0,coalesce((ip.creator_scores->>p.author_id::text)::numeric,0)/100))::numeric stored_creator_affinity,
      coalesce((select count(*)*2 from public.social_post_reactions r join public.social_posts rp on rp.id=r.post_id where r.user_id=v_uid and rp.author_id=p.author_id),0)
        +coalesce((select count(*)*3 from public.social_post_comments cm join public.social_posts cp on cp.id=cm.post_id where cm.user_id=v_uid and cp.author_id=p.author_id),0)
        +coalesce((select count(*)*4 from public.social_post_saves s join public.social_posts sp on sp.id=s.post_id where s.user_id=v_uid and sp.author_id=p.author_id),0) dynamic_creator_affinity,
      coalesce((select count(*) from public.social_feed_session_items si join public.social_posts hp on hp.id=si.post_id where si.session_id=v_session and hp.author_id=p.author_id),0) creator_seen,
      coalesce((select count(*) from public.social_feed_session_items si join public.social_posts hp on hp.id=si.post_id where si.session_id=v_session and hp.category is not distinct from p.category),0) category_seen
    from public.social_posts p
    join public.users u on u.id=p.author_id
    left join public.communities c on c.id=p.community_id
    left join public.user_interest_profiles ip on ip.user_id=v_uid
    where public.social_can_view_post(p.id,v_uid) and p.moderation_status='approved'
      and not exists(select 1 from public.social_feed_session_items si where si.session_id=v_session and si.post_id=p.id)
      and not exists(select 1 from public.social_post_events e where e.user_id=v_uid and e.post_id=p.id and e.event_type='not_interested')
      and not exists(select 1 from public.social_post_events e join public.social_posts hp on hp.id=e.post_id where e.user_id=v_uid and e.event_type='hide_creator' and hp.author_id=p.author_id)
      and (v_feed<>'mine' or p.author_id=v_uid)
      and (v_feed<>'following' or exists(select 1 from public.user_follows f where f.follower_id=v_uid and f.following_id=p.author_id))
      and (v_feed<>'friends' or exists(select 1 from public.user_follows f1 join public.user_follows f2 on f2.follower_id=f1.following_id and f2.following_id=f1.follower_id where f1.follower_id=v_uid and f1.following_id=p.author_id))
      and (v_feed<>'community' or p.community_id=p_community_id)
  ), ranked as (
    select b.*,
      (ln(1+greatest(b.aggregate_watch_ms,0)/1000.0)*v_watch
       +ln(1+greatest(b.completion_count,0))*v_completion
       +ln(1+greatest(b.save_count,0))*v_save
       +ln(1+greatest(b.share_count,0))*v_share
       +ln(1+greatest(b.comment_count,0))*v_comment
       +case when b.is_following then v_follow else 0 end
       +case when b.is_friend then v_friend else 0 end
       +greatest(least(b.dynamic_creator_affinity::numeric/20,1),b.stored_creator_affinity)*v_creator
       +b.interest_affinity*v_interest
       +b.commerce_affinity*least(v_commerce,30)
       +ln(1+b.reaction_count+b.comment_count+b.save_count+b.share_count)*v_trend
       +greatest(0,1-extract(epoch from(now()-b.created_at))/604800.0)*v_recency
       +case when b.created_at>now()-interval '48 hours' then v_fresh else 0 end
       +case when mod(abs(hashtextextended(b.id::text||v_session::text,0)),100)<v_explore then v_explore/2 else 0 end
       -b.creator_seen*least(v_negative,10)-b.category_seen*least(v_negative/2,5))::numeric rank_score,
      case when b.is_friend then 'From a friend'
           when b.is_following then 'Because you follow this creator'
           when b.interest_affinity>=.55 then 'Based on your interests'
           when b.commerce_affinity>=.65 then 'Related to things you explore on DRIGHT'
           when b.community_id is not null then 'From a community you may like'
           when b.created_at>now()-interval '48 hours' then 'Fresh on DRIGHT'
           else 'Recommended for you' end recommendation_reason
    from base b
  ), keyed as (
    select r.*,
      row_number() over(partition by r.author_id order by r.rank_score desc,r.created_at desc,r.id desc) creator_batch_rank,
      row_number() over(partition by coalesce(r.category,'__none__') order by r.rank_score desc,r.created_at desc,r.id desc) category_batch_rank
    from ranked r
    where v_cursor_score is null or r.rank_score<v_cursor_score
      or (r.rank_score=v_cursor_score and extract(epoch from r.created_at)<v_cursor_epoch)
      or (r.rank_score=v_cursor_score and extract(epoch from r.created_at)=v_cursor_epoch and r.id<v_cursor_id)
  ), page_all as (
    select * from keyed where creator_batch_rank<=greatest(v_creator_max,1) and category_batch_rank<=greatest(v_category_max,1)
    order by case when p_target_id is not null and id=p_target_id then 0 else 1 end,rank_score desc,created_at desc,id desc limit v_limit+1
  ), page as (
    select * from page_all order by case when p_target_id is not null and id=p_target_id then 0 else 1 end,rank_score desc,created_at desc,id desc limit v_limit
  ), inserted as (
    insert into public.social_feed_session_items(session_id,post_id,position,rank_score,recommendation_reason)
    select v_session,p.id,(v_start_pos+(row_number() over(order by case when p_target_id is not null and p.id=p_target_id then 0 else 1 end,p.rank_score desc,p.created_at desc,p.id desc)-1))::integer,p.rank_score,p.recommendation_reason
    from page p on conflict(session_id,post_id) do nothing returning post_id
  )
  select jsonb_build_object(
    'items',coalesce(jsonb_agg(to_jsonb(page)-'rank_score'-'creator_batch_rank'-'category_batch_rank'-'aggregate_watch_ms'-'completion_count'-'share_count'-'interest_affinity'-'commerce_affinity'-'stored_creator_affinity'-'dynamic_creator_affinity'-'creator_seen'-'category_seen' order by case when p_target_id is not null and page.id=p_target_id then 0 else 1 end,page.rank_score desc,page.created_at desc,page.id desc),'[]'::jsonb),
    'has_more',(select count(*) from page_all)>v_limit,
    'next_cursor',(select rank_score::text||'|'||extract(epoch from created_at)::text||'|'||id::text from page order by rank_score asc,created_at asc,id asc limit 1),
    'session_id',v_session,'feed',v_feed,'algorithm_version',3
  ) into v_result from page;
  update public.social_feed_sessions set last_activity_at=now() where id=v_session;
  return coalesce(v_result,jsonb_build_object('items','[]'::jsonb,'has_more',false,'next_cursor',null,'session_id',v_session,'feed',v_feed,'algorithm_version',3));
end $$;

-- Missing server-side Jobs recommendation surface. Search relevance remains mandatory/dominant when a query exists.
create or replace function public.get_jobs_feed_v2(
  p_cursor text default null,
  p_limit integer default null,
  p_search text default null,
  p_categories text[] default null,
  p_job_types text[] default null,
  p_work_setups text[] default null,
  p_career_levels text[] default null,
  p_region text default null,
  p_salary_min integer default null,
  p_salary_max integer default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid:=auth.uid(); v_limit integer:=30; v_search_w numeric:=40; v_cat_w numeric:=14; v_skills_w numeric:=20; v_location_w numeric:=8;
  v_apply_w numeric:=18; v_employer_w numeric:=8; v_fresh_w numeric:=10; v_explore numeric:=8;
  v_cursor_score numeric; v_cursor_epoch numeric; v_cursor_id uuid; v_result jsonb;
begin
  select jobs_page_size,jobs_search_weight,jobs_category_affinity_weight,jobs_skills_weight,jobs_location_weight,
         jobs_application_history_weight,jobs_employer_affinity_weight,jobs_freshness_weight,jobs_exploration_percentage
  into v_limit,v_search_w,v_cat_w,v_skills_w,v_location_w,v_apply_w,v_employer_w,v_fresh_w,v_explore
  from public.algorithm_settings where is_singleton=true limit 1;
  v_limit:=least(greatest(coalesce(p_limit,v_limit,30),5),50);
  if p_cursor is not null and p_cursor<>'' then begin
    v_cursor_score:=split_part(p_cursor,'|',1)::numeric;
    v_cursor_epoch:=split_part(p_cursor,'|',2)::numeric;
    v_cursor_id:=split_part(p_cursor,'|',3)::uuid;
  exception when others then raise exception 'Invalid jobs cursor'; end; end if;

  with base as (
    select j.*,
      u.full_name employer_name,u.avatar_url employer_avatar,coalesce(u.is_verified,false) employer_verified,
      case when coalesce(btrim(p_search),'')='' then .50
        when lower(j.title)=lower(btrim(p_search)) then 1
        when lower(j.title) like lower(btrim(p_search))||'%' then .92
        when j.title ilike '%'||btrim(p_search)||'%' then .84
        when j.category ilike '%'||btrim(p_search)||'%' then .68
        when coalesce(j.description,'') ilike '%'||btrim(p_search)||'%' then .50
        when exists(select 1 from unnest(coalesce(j.requirements,'{}'::text[])) req where req ilike '%'||btrim(p_search)||'%') then .58
        else 0 end::numeric search_relevance,
      case when v_uid is null then 0 else least(1,greatest(0,coalesce((ip.job_scores->>j.category)::numeric,0)/100)) end::numeric category_affinity,
      case when v_uid is null then 0 else least(1,greatest(0,coalesce((ip.job_employer_scores->>j.employer_id::text)::numeric,0)/100)) end::numeric employer_affinity,
      case when v_uid is null or viewer.id is null or cardinality(coalesce(viewer.skills,'{}'::text[]))=0 then 0 else least(1,
        (select count(*)::numeric from unnest(viewer.skills) skill where
          j.title ilike '%'||skill||'%' or coalesce(j.description,'') ilike '%'||skill||'%' or
          exists(select 1 from unnest(coalesce(j.requirements,'{}'::text[])) req where req ilike '%'||skill||'%')
        )/greatest(cardinality(viewer.skills),1)) end::numeric skill_match,
      case when v_uid is null or viewer.id is null then 0
        when lower(coalesce(j.work_setup,''))='remote' then .75
        when coalesce(viewer.location,'')<>'' and coalesce(j.region,'') ilike '%'||viewer.location||'%' then 1
        else 0 end::numeric location_match,
      case when v_uid is null then 0 else least(1,(select count(*)::numeric/3 from public.job_applications ja join public.jobs oldj on oldj.id=ja.job_id where ja.applicant_id=v_uid and oldj.category=j.category and ja.created_at>=now()-interval '365 days')) end::numeric application_affinity,
      greatest(0,1-extract(epoch from(now()-j.created_at))/2592000.0)::numeric freshness,
      least(1,ln(1+(select count(*) from public.job_applications ja where ja.job_id=j.id))/ln(21))::numeric popularity
    from public.jobs j
    join public.users u on u.id=j.employer_id
    left join public.user_interest_profiles ip on ip.user_id=v_uid
    left join public.users viewer on viewer.id=v_uid
    where j.status='active' and (j.application_deadline is null or j.application_deadline>=current_date)
      and coalesce(u.account_status,'active') not in ('banned','suspended','deleted','disabled')
      and (p_categories is null or cardinality(p_categories)=0 or j.category=any(p_categories))
      and (p_job_types is null or cardinality(p_job_types)=0 or j.job_type=any(p_job_types))
      and (p_work_setups is null or cardinality(p_work_setups)=0 or j.work_setup=any(p_work_setups))
      and (p_career_levels is null or cardinality(p_career_levels)=0 or j.career_level=any(p_career_levels))
      and (p_region is null or btrim(p_region)='' or coalesce(j.region,'') ilike '%'||btrim(p_region)||'%' or lower(coalesce(j.work_setup,''))='remote')
      and (p_salary_min is null or j.salary_max>=p_salary_min)
      and (p_salary_max is null or j.salary_min<=p_salary_max)
      and (coalesce(btrim(p_search),'')='' or j.title ilike '%'||btrim(p_search)||'%' or j.category ilike '%'||btrim(p_search)||'%' or coalesce(j.description,'') ilike '%'||btrim(p_search)||'%' or exists(select 1 from unnest(coalesce(j.requirements,'{}'::text[])) req where req ilike '%'||btrim(p_search)||'%'))
      and (v_uid is null or not exists(select 1 from public.user_blocks b where (b.blocker_id=v_uid and b.blocked_id=j.employer_id) or (b.blocker_id=j.employer_id and b.blocked_id=v_uid)))
  ), ranked as (
    select b.*,
      (b.search_relevance*v_search_w + b.category_affinity*v_cat_w + b.skill_match*v_skills_w + b.location_match*v_location_w
       + b.application_affinity*v_apply_w + b.employer_affinity*v_employer_w + b.freshness*v_fresh_w + b.popularity*5
       + case when mod(abs(hashtextextended(b.id::text||coalesce(v_uid::text,'anon')||current_date::text,0)),100)<v_explore then greatest(v_explore*.35,1) else 0 end
       + case when b.employer_verified then 3 else 0 end)::numeric rank_score,
      case when b.application_affinity>=.55 then 'Matches your job interests'
           when b.skill_match>=.45 then 'Matches your skills'
           when b.category_affinity>=.55 then 'Based on your job activity'
           when b.freshness>=.8 then 'Fresh opportunity'
           else 'Recommended job' end recommendation_reason
    from base b
  ), keyed as (
    select * from ranked where v_cursor_score is null or rank_score<v_cursor_score
      or (rank_score=v_cursor_score and extract(epoch from created_at)<v_cursor_epoch)
      or (rank_score=v_cursor_score and extract(epoch from created_at)=v_cursor_epoch and id<v_cursor_id)
  ), page_all as (
    select * from keyed order by rank_score desc,created_at desc,id desc limit v_limit+1
  ), page as (
    select * from page_all order by rank_score desc,created_at desc,id desc limit v_limit
  )
  select jsonb_build_object(
    'items',coalesce(jsonb_agg(to_jsonb(page)-'rank_score'-'search_relevance'-'category_affinity'-'employer_affinity'-'skill_match'-'location_match'-'application_affinity'-'freshness'-'popularity' order by rank_score desc,created_at desc,id desc),'[]'::jsonb),
    'has_more',(select count(*) from page_all)>v_limit,
    'next_cursor',(select rank_score::text||'|'||extract(epoch from created_at)::text||'|'||id::text from page order by rank_score asc,created_at asc,id asc limit 1),
    'personalized',(v_uid is not null and exists(select 1 from public.user_interest_profiles where user_id=v_uid and (job_interaction_count>0 or interaction_count>0))),
    'algorithm_version',2
  ) into v_result from page;
  return coalesce(v_result,jsonb_build_object('items','[]'::jsonb,'has_more',false,'next_cursor',null,'personalized',false,'algorithm_version',2));
end $$;
revoke all on function public.get_jobs_feed_v2(text,integer,text,text[],text[],text[],text[],text,integer,integer) from public;
grant execute on function public.get_jobs_feed_v2(text,integer,text,text[],text[],text[],text[],text,integer,integer) to anon,authenticated,service_role;

-- Preserve list_communities signature while making Recommended truly user-specific and Popular truly global.
create or replace function public.list_communities(p_mode text default 'discover',p_query text default null,p_limit integer default 30)
returns jsonb
language plpgsql
stable security definer
set search_path=public
as $$
declare
  v_uid uuid:=auth.uid(); v_result jsonb; v_mode text:=lower(coalesce(p_mode,'discover'));
  v_interest_w numeric:=20; v_friend_w numeric:=12; v_activity_w numeric:=10; v_growth_w numeric:=8; v_fresh_w numeric:=6; v_explore numeric:=10;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select communities_interest_weight,communities_friend_weight,communities_activity_weight,communities_growth_weight,communities_freshness_weight,communities_exploration_percentage
  into v_interest_w,v_friend_w,v_activity_w,v_growth_w,v_fresh_w,v_explore
  from public.algorithm_settings where is_singleton=true limit 1;

  with base as (
    select c.id,c.public_id,c.name,c.slug,c.description,c.avatar_url,c.banner_url,c.visibility,c.category,c.country,c.location,
      c.member_count,c.post_count,c.is_verified,c.is_featured,c.created_at,m.role viewer_role,m.state viewer_state,
      least(1,greatest(0,coalesce((ip.scores->>c.category)::numeric,0)/100))::numeric interest_affinity,
      least(1,(select count(*)::numeric/3 from public.community_members cm
        where cm.community_id=c.id and cm.state='active' and cm.user_id<>v_uid
          and exists(select 1 from public.user_follows f1 join public.user_follows f2 on f2.follower_id=f1.following_id and f2.following_id=f1.follower_id where f1.follower_id=v_uid and f1.following_id=cm.user_id)
      ))::numeric friend_affinity,
      least(1,(ln(1+greatest(c.member_count,0))+ln(1+greatest(c.post_count,0)))/12)::numeric activity_score,
      least(1,(select count(*)::numeric/20 from public.community_members cm where cm.community_id=c.id and cm.state='active' and cm.joined_at>=now()-interval '30 days'))::numeric growth_score,
      greatest(0,1-extract(epoch from(now()-c.created_at))/7776000.0)::numeric freshness_score
    from public.communities c
    left join public.community_members m on m.community_id=c.id and m.user_id=v_uid
    left join public.user_interest_profiles ip on ip.user_id=v_uid
    where public.community_can_view(c.id,v_uid) and c.status in ('active','restricted')
      and (p_query is null or trim(p_query)='' or not exists(
        select 1 from unnest(regexp_split_to_array(lower(trim(p_query)),'\s+')) term
        where lower(concat_ws(' ',c.name,c.slug,c.public_id,coalesce(c.description,''),coalesce(c.category,''),coalesce(c.location,''))) not like '%'||term||'%'
      ))
      and (v_mode in ('discover','recommended','popular','new') or (v_mode='mine' and m.state='active') or (v_mode='requests' and public.community_has_role(c.id,array['owner','admin','moderator']::text[],v_uid)))
      and (v_mode<>'recommended' or coalesce(m.state,'')<>'active')
  ), scored as (
    select b.*,
      (b.interest_affinity*v_interest_w+b.friend_affinity*v_friend_w+b.activity_score*v_activity_w+b.growth_score*v_growth_w+b.freshness_score*v_fresh_w
       +case when b.is_verified then 2 else 0 end
       +case when mod(abs(hashtextextended(b.id::text||v_uid::text||current_date::text,0)),100)<v_explore then greatest(v_explore*.3,1) else 0 end)::numeric personalized_score
    from base b
  ), ordered as (
    select * from scored
    order by
      case when v_mode='recommended' then personalized_score end desc nulls last,
      case when v_mode='popular' then activity_score+growth_score end desc nulls last,
      case when v_mode='new' then extract(epoch from created_at) end desc nulls last,
      case when v_mode in ('discover','mine','requests') then (case when is_featured then 1 else 0 end) end desc nulls last,
      member_count desc,created_at desc
    limit least(greatest(coalesce(p_limit,30),1),60)
  )
  select coalesce(jsonb_agg(to_jsonb(ordered)-'interest_affinity'-'friend_affinity'-'activity_score'-'growth_score'-'freshness_score'-'personalized_score'),'[]'::jsonb)
  into v_result from ordered;
  return v_result;
end $$;

-- Existing recommendation health now reports the new third-graph/job surface without exposing private affinity values.
create or replace function public.get_recommendation_system_diagnostics()
returns jsonb
language plpgsql stable security definer
set search_path=public,extensions
as $$
declare v_uid uuid:=auth.uid(); s public.algorithm_settings%rowtype;
begin
  if v_uid is null or not public.is_admin(v_uid) then raise exception 'Admin access required' using errcode='42501'; end if;
  select * into s from public.algorithm_settings where is_singleton=true limit 1;
  return jsonb_build_object(
    'interest_profiles_total',(select count(*) from public.user_interest_profiles),
    'interest_profiles_pending',(select count(*) from public.user_interest_profiles where needs_recompute=true),
    'profiles_recomputed_24h',(select count(*) from public.user_interest_profiles where last_recomputed_at>=now()-interval '24 hours'),
    'job_profiles_recomputed_24h',(select count(*) from public.user_interest_profiles where last_job_recomputed_at>=now()-interval '24 hours'),
    'marketplace_feed_v2',to_regprocedure('public.get_marketplace_feed_v2(text,integer,text,text,numeric,numeric,text,boolean,numeric,text)') is not null,
    'jobs_feed_v2',to_regprocedure('public.get_jobs_feed_v2(text,integer,text,text[],text[],text[],text[],text,integer,integer)') is not null,
    'social_feed_v2',exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='get_social_feed_v2'),
    'promotion_delivery_v2',exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='get_promotion_delivery_v2'),
    'canonical_source','algorithm_settings',
    'legacy_marketplace_sync',exists(select 1 from pg_trigger where tgname='trg_sync_marketplace_weights_from_algorithm' and tgenabled<>'D'),
    'interest_cron_active',exists(select 1 from cron.job where jobname='dright-interest-learning-15m' and active=true),
    'listing_intelligence_cron_active',exists(select 1 from cron.job where jobname='dright-listing-intelligence-5m' and active=true),
    'storage_cron_active',exists(select 1 from cron.job where jobname='dright-storage-snapshot-daily' and active=true),
    'listing_statistics_count',(select count(*) from public.listing_statistics),
    'listing_scores_count',(select count(*) from public.listing_scores),
    'listing_intelligence_pending',(select count(*) from public.listing_intelligence_dirty),
    'semantic_recommendations_enabled',coalesce(s.semantic_recommendations_enabled,false),
    'embedding_generation_enabled',coalesce(s.embedding_generation_enabled,false),
    'pgvector_available',exists(select 1 from pg_extension where extname='vector'),
    'semantic_indexed',(select count(*) from public.content_embeddings where status='ready' and embedding is not null),
    'semantic_pending',(select count(*) from public.content_embeddings where status='pending'),
    'semantic_failed',(select count(*) from public.content_embeddings where status='failed'),
    'semantic_stale',(select count(*) from public.content_embeddings where status='stale'),
    'algorithm_version',4,'generated_at',now()
  );
end $$;
revoke all on function public.get_recommendation_system_diagnostics() from public,anon;
grant execute on function public.get_recommendation_system_diagnostics() to authenticated;

-- Existing profiles become eligible for job-context recomputation on the normal 15-minute worker.
update public.user_interest_profiles set needs_recompute=true where last_job_recomputed_at is null;
