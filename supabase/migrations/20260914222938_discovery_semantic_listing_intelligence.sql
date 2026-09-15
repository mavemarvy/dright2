-- DRIGHT2 discovery intelligence completion: additive/backwards-compatible
create extension if not exists vector with schema extensions;

-- Canonical algorithm configuration remains public.algorithm_settings.
alter table public.algorithm_settings
  add column if not exists semantic_recommendations_enabled boolean not null default false,
  add column if not exists embedding_generation_enabled boolean not null default false,
  add column if not exists semantic_provider text not null default 'openai',
  add column if not exists semantic_embedding_model text not null default 'text-embedding-3-small',
  add column if not exists semantic_embedding_dimensions integer not null default 1536,
  add column if not exists semantic_embedding_version integer not null default 1,
  add column if not exists semantic_similarity_weight numeric not null default 12,
  add column if not exists semantic_min_similarity numeric not null default 0.35,
  add column if not exists semantic_candidate_limit integer not null default 40,
  add column if not exists semantic_cold_start_weight numeric not null default 18,
  add column if not exists semantic_search_weight numeric not null default 18,
  add column if not exists semantic_marketplace_weight numeric not null default 12,
  add column if not exists semantic_social_weight numeric not null default 6,
  add column if not exists semantic_jobs_weight numeric not null default 16,
  add column if not exists semantic_services_weight numeric not null default 14,
  add column if not exists semantic_courses_weight numeric not null default 14,
  add column if not exists semantic_communities_weight numeric not null default 10,
  add column if not exists semantic_promotion_weight numeric not null default 6,
  add column if not exists embedding_daily_request_limit integer not null default 1000,
  add column if not exists embedding_monthly_request_limit integer not null default 10000,
  add column if not exists embedding_estimated_cost_per_million_tokens numeric not null default 0,
  add column if not exists semantic_rollout_percentage numeric not null default 100;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='algorithm_semantic_similarity_range') then
    alter table public.algorithm_settings add constraint algorithm_semantic_similarity_range check (semantic_min_similarity between 0 and 1);
  end if;
  if not exists (select 1 from pg_constraint where conname='algorithm_semantic_rollout_range') then
    alter table public.algorithm_settings add constraint algorithm_semantic_rollout_range check (semantic_rollout_percentage between 0 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname='algorithm_semantic_limits_positive') then
    alter table public.algorithm_settings add constraint algorithm_semantic_limits_positive check (semantic_candidate_limit between 1 and 200 and semantic_embedding_dimensions between 1 and 4096 and embedding_daily_request_limit >= 0 and embedding_monthly_request_limit >= 0);
  end if;
end $$;

create table if not exists public.content_embeddings (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  embedding extensions.vector(1536),
  embedding_provider text not null default 'openai',
  embedding_model text not null default 'text-embedding-3-small',
  embedding_dimensions integer not null default 1536,
  embedding_version integer not null default 1,
  content_hash text,
  source_text_hash text,
  status text not null default 'pending',
  attempts integer not null default 0,
  next_attempt_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  embedded_at timestamptz,
  constraint content_embeddings_entity_type_check check (entity_type in ('product','service','course','job','task','store','creator','profile','post','community','news','campaign')),
  constraint content_embeddings_status_check check (status in ('pending','processing','ready','failed','stale','disabled')),
  constraint content_embeddings_dimensions_check check (embedding_dimensions = 1536),
  unique(entity_type, entity_id, embedding_model, embedding_version)
);
create index if not exists idx_content_embeddings_entity on public.content_embeddings(entity_type, entity_id);
create index if not exists idx_content_embeddings_queue on public.content_embeddings(status, next_attempt_at, updated_at) where status in ('pending','failed','stale');
create index if not exists idx_content_embeddings_hnsw_cosine on public.content_embeddings using hnsw (embedding extensions.vector_cosine_ops) where embedding is not null and status='ready';
alter table public.content_embeddings enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='content_embeddings' and policyname='admins_read_content_embeddings') then
    create policy admins_read_content_embeddings on public.content_embeddings for select to authenticated using (public.is_admin(auth.uid()));
  end if;
end $$;
revoke all on public.content_embeddings from public, anon, authenticated;
grant select on public.content_embeddings to authenticated;
grant all on public.content_embeddings to service_role;

create or replace function public.build_semantic_source_text(p_entity_type text, p_entity_id uuid)
returns text language plpgsql stable security definer set search_path=public as $$
declare v_text text;
begin
  case lower(p_entity_type)
    when 'product' then select concat_ws(E'\n',p.name,p.description,'Category: '||p.category,case when coalesce(array_length(p.tags,1),0)>0 then 'Tags: '||array_to_string(p.tags,', ') end,case when p.brand is not null then 'Brand: '||p.brand end,case when p.condition is not null then 'Condition: '||p.condition end) into v_text from public.products p where p.id=p_entity_id;
    when 'service' then select concat_ws(E'\n',p.name,p.description,'Service category: '||p.category,case when coalesce(array_length(p.tags,1),0)>0 then 'Tags: '||array_to_string(p.tags,', ') end) into v_text from public.products p where p.id=p_entity_id;
    when 'course' then select concat_ws(E'\n',p.name,p.description,'Course category: '||p.category,case when coalesce(array_length(p.tags,1),0)>0 then 'Topics: '||array_to_string(p.tags,', ') end) into v_text from public.products p where p.id=p_entity_id;
    when 'job' then select concat_ws(E'\n',j.title,j.description,'Category: '||j.category,'Work setup: '||j.work_setup,'Career level: '||j.career_level,case when coalesce(array_length(j.requirements,1),0)>0 then 'Requirements: '||array_to_string(j.requirements,', ') end,case when coalesce(array_length(j.responsibilities,1),0)>0 then 'Responsibilities: '||array_to_string(j.responsibilities,', ') end) into v_text from public.jobs j where j.id=p_entity_id;
    when 'community' then select concat_ws(E'\n',c.name,c.description,'Category: '||coalesce(c.category,''),'Location: '||coalesce(c.location,'')) into v_text from public.communities c where c.id=p_entity_id;
    when 'post' then select concat_ws(E'\n',sp.body,'Category: '||coalesce(sp.category,''),case when coalesce(array_length(sp.topic_tags,1),0)>0 then 'Topics: '||array_to_string(sp.topic_tags,', ') end) into v_text from public.social_posts sp where sp.id=p_entity_id;
    when 'news' then select concat_ws(E'\n',sp.body,'Category: '||coalesce(sp.category,''),case when coalesce(array_length(sp.topic_tags,1),0)>0 then 'Topics: '||array_to_string(sp.topic_tags,', ') end) into v_text from public.social_posts sp where sp.id=p_entity_id and sp.source_type='news';
    when 'creator' then select concat_ws(E'\n','Creator @'||coalesce(u.username,''),u.bio,'Profession: '||coalesce(u.profession,'')) into v_text from public.users u where u.id=p_entity_id;
    when 'profile' then select concat_ws(E'\n','@'||coalesce(u.username,''),u.bio,'Profession: '||coalesce(u.profession,'')) into v_text from public.users u where u.id=p_entity_id;
    else v_text:=null;
  end case;
  return nullif(left(regexp_replace(coalesce(v_text,''),E'[\t\r ]+',' ','g'),12000),'');
end $$;
revoke all on function public.build_semantic_source_text(text,uuid) from public,anon,authenticated;
grant execute on function public.build_semantic_source_text(text,uuid) to service_role;

create or replace function public.queue_content_embedding(p_entity_type text,p_entity_id uuid,p_force boolean default false)
returns uuid language plpgsql security definer set search_path=public as $$
declare s public.algorithm_settings%rowtype; v_text text; v_hash text; v_id uuid; v_status text;
begin
  select * into s from public.algorithm_settings where is_singleton=true limit 1;
  if not found then return null; end if;
  if s.semantic_embedding_dimensions<>1536 then raise exception 'Configured embedding dimensions (%) do not match current vector schema (1536)',s.semantic_embedding_dimensions; end if;
  v_text:=public.build_semantic_source_text(lower(p_entity_type),p_entity_id); if v_text is null then return null; end if;
  v_hash:=md5(v_text); v_status:=case when s.embedding_generation_enabled then 'pending' else 'stale' end;
  insert into public.content_embeddings(entity_type,entity_id,embedding_provider,embedding_model,embedding_dimensions,embedding_version,content_hash,source_text_hash,status,next_attempt_at,metadata)
  values(lower(p_entity_type),p_entity_id,s.semantic_provider,s.semantic_embedding_model,s.semantic_embedding_dimensions,s.semantic_embedding_version,v_hash,v_hash,v_status,case when s.embedding_generation_enabled then now() else null end,jsonb_build_object('source_length',length(v_text)))
  on conflict(entity_type,entity_id,embedding_model,embedding_version) do update set embedding_provider=excluded.embedding_provider,content_hash=excluded.content_hash,source_text_hash=excluded.source_text_hash,status=case when public.content_embeddings.content_hash=excluded.content_hash and public.content_embeddings.status='ready' and not p_force then 'ready' when s.embedding_generation_enabled then 'pending' else 'stale' end,next_attempt_at=case when s.embedding_generation_enabled then now() else null end,last_error=null,updated_at=now()
  where p_force or public.content_embeddings.content_hash is distinct from excluded.content_hash or public.content_embeddings.status in ('failed','stale','disabled') returning id into v_id;
  return v_id;
end $$;
revoke all on function public.queue_content_embedding(text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.queue_content_embedding(text,uuid,boolean) to service_role;

create or replace function public.mark_product_embedding_dirty() returns trigger language plpgsql security definer set search_path=public as $$ declare v_type text; begin v_type:=case upper(coalesce(new.product_type,'PHYSICAL')) when 'SERVICE' then 'service' when 'COURSE' then 'course' else 'product' end; perform public.queue_content_embedding(v_type,new.id,false); return new; end $$;
create or replace function public.mark_job_embedding_dirty() returns trigger language plpgsql security definer set search_path=public as $$ begin perform public.queue_content_embedding('job',new.id,false); return new; end $$;
create or replace function public.mark_community_embedding_dirty() returns trigger language plpgsql security definer set search_path=public as $$ begin perform public.queue_content_embedding('community',new.id,false); return new; end $$;
create or replace function public.mark_social_embedding_dirty() returns trigger language plpgsql security definer set search_path=public as $$ begin perform public.queue_content_embedding(case when new.source_type='news' then 'news' else 'post' end,new.id,false); return new; end $$;
drop trigger if exists trg_semantic_products on public.products;
create trigger trg_semantic_products after insert or update of name,description,category,tags,brand,condition,product_type on public.products for each row execute function public.mark_product_embedding_dirty();
drop trigger if exists trg_semantic_jobs on public.jobs;
create trigger trg_semantic_jobs after insert or update of title,description,category,work_setup,career_level,requirements,responsibilities on public.jobs for each row execute function public.mark_job_embedding_dirty();
drop trigger if exists trg_semantic_communities on public.communities;
create trigger trg_semantic_communities after insert or update of name,description,category,location on public.communities for each row execute function public.mark_community_embedding_dirty();
drop trigger if exists trg_semantic_social_posts on public.social_posts;
create trigger trg_semantic_social_posts after insert or update of body,category,topic_tags,source_type on public.social_posts for each row execute function public.mark_social_embedding_dirty();

create or replace function public.match_semantic_entities(p_query_embedding extensions.vector(1536),p_entity_types text[] default null,p_match_threshold numeric default null,p_match_count integer default null)
returns table(entity_type text,entity_id uuid,similarity numeric,metadata jsonb) language plpgsql stable security definer set search_path=public,extensions as $$
declare s public.algorithm_settings%rowtype; v_uid uuid:=auth.uid(); v_threshold numeric; v_limit integer;
begin
  select * into s from public.algorithm_settings where is_singleton=true limit 1; if not coalesce(s.semantic_recommendations_enabled,false) then return; end if;
  v_threshold:=greatest(0,least(1,coalesce(p_match_threshold,s.semantic_min_similarity,0.35))); v_limit:=greatest(1,least(200,coalesce(p_match_count,s.semantic_candidate_limit,40)));
  return query select e.entity_type,e.entity_id,(1-(e.embedding<=>p_query_embedding))::numeric,e.metadata from public.content_embeddings e
  where e.status='ready' and e.embedding is not null and (p_entity_types is null or e.entity_type=any(p_entity_types)) and (1-(e.embedding<=>p_query_embedding))>=v_threshold
    and ((e.entity_type in ('product','service','course') and exists(select 1 from public.products p where p.id=e.entity_id and p.is_active=true and coalesce(p.is_hidden,false)=false and p.approval_status='approved' and not exists(select 1 from public.user_blocks b where v_uid is not null and ((b.blocker_id=v_uid and b.blocked_id=p.uploaded_by) or (b.blocker_id=p.uploaded_by and b.blocked_id=v_uid)))))
      or (e.entity_type='job' and exists(select 1 from public.jobs j where j.id=e.entity_id and j.status='active' and (j.application_deadline is null or j.application_deadline>=current_date) and not exists(select 1 from public.user_blocks b where v_uid is not null and ((b.blocker_id=v_uid and b.blocked_id=j.employer_id) or (b.blocker_id=j.employer_id and b.blocked_id=v_uid)))))
      or (e.entity_type='community' and exists(select 1 from public.communities c where c.id=e.entity_id and c.status='active' and (c.visibility='public' or exists(select 1 from public.community_members cm where cm.community_id=c.id and cm.user_id=v_uid and cm.state='active'))))
      or (e.entity_type in ('post','news') and exists(select 1 from public.social_posts sp where sp.id=e.entity_id and sp.is_active=true and coalesce(sp.moderation_status,'approved') in ('approved','clean','active') and public.social_can_view_post(sp.id,v_uid)))
      or (e.entity_type in ('creator','profile') and exists(select 1 from public.users u where u.id=e.entity_id and coalesce(u.account_status,'active')='active' and not exists(select 1 from public.user_blocks b where v_uid is not null and ((b.blocker_id=v_uid and b.blocked_id=u.id) or (b.blocker_id=u.id and b.blocked_id=v_uid))))))
  order by e.embedding<=>p_query_embedding limit v_limit;
end $$;
revoke all on function public.match_semantic_entities(extensions.vector,text[],numeric,integer) from public;
grant execute on function public.match_semantic_entities(extensions.vector,text[],numeric,integer) to authenticated,service_role;

create or replace function public.get_semantic_engine_status() returns jsonb language plpgsql stable security definer set search_path=public,extensions as $$
declare v_uid uuid:=auth.uid(); s public.algorithm_settings%rowtype;
begin
  if v_uid is null or not public.is_admin(v_uid) then raise exception 'Admin access required' using errcode='42501'; end if; select * into s from public.algorithm_settings where is_singleton=true limit 1;
  return jsonb_build_object('pgvector_available',exists(select 1 from pg_extension where extname='vector'),'semantic_recommendations_enabled',coalesce(s.semantic_recommendations_enabled,false),'embedding_generation_enabled',coalesce(s.embedding_generation_enabled,false),'provider',s.semantic_provider,'model',s.semantic_embedding_model,'dimensions',s.semantic_embedding_dimensions,'version',s.semantic_embedding_version,'indexed_entities',(select count(*) from public.content_embeddings where status='ready' and embedding is not null),'pending_embeddings',(select count(*) from public.content_embeddings where status='pending'),'failed_embeddings',(select count(*) from public.content_embeddings where status='failed'),'stale_embeddings',(select count(*) from public.content_embeddings where status='stale'),'last_successful_embedding',(select max(embedded_at) from public.content_embeddings where status='ready'),'generated_today',(select count(*) from public.ai_usage where feature='semantic-embedding' and success=true and created_at>=current_date),'generated_this_month',(select count(*) from public.ai_usage where feature='semantic-embedding' and success=true and created_at>=date_trunc('month',now())),'failed_this_month',(select count(*) from public.ai_usage where feature='semantic-embedding' and success=false and created_at>=date_trunc('month',now())));
end $$;
revoke all on function public.get_semantic_engine_status() from public,anon; grant execute on function public.get_semantic_engine_status() to authenticated;

create or replace function public.admin_queue_semantic_reindex(p_entity_type text default null,p_status text default null) returns integer language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_count integer:=0; r record;
begin
 if v_uid is null or not public.is_admin(v_uid) then raise exception 'Admin access required' using errcode='42501'; end if;
 for r in select x.entity_type,x.entity_id from (select case upper(coalesce(p.product_type,'PHYSICAL')) when 'SERVICE' then 'service' when 'COURSE' then 'course' else 'product' end entity_type,p.id entity_id from public.products p where p.is_active=true union all select 'job',j.id from public.jobs j where j.status='active' union all select 'community',c.id from public.communities c where c.status='active' union all select case when sp.source_type='news' then 'news' else 'post' end,sp.id from public.social_posts sp where sp.is_active=true) x where (p_entity_type is null or x.entity_type=lower(p_entity_type)) and (p_status is null or exists(select 1 from public.content_embeddings e where e.entity_type=x.entity_type and e.entity_id=x.entity_id and e.status=p_status)) loop perform public.queue_content_embedding(r.entity_type,r.entity_id,true); v_count:=v_count+1; end loop;
 return v_count;
end $$;
revoke all on function public.admin_queue_semantic_reindex(text,text) from public,anon; grant execute on function public.admin_queue_semantic_reindex(text,text) to authenticated;

create table if not exists public.listing_intelligence_dirty(listing_id uuid primary key,dirty_at timestamptz not null default now(),reason text);
alter table public.listing_intelligence_dirty enable row level security; revoke all on public.listing_intelligence_dirty from public,anon,authenticated; grant all on public.listing_intelligence_dirty to service_role;
create or replace function public.mark_listing_intelligence_dirty() returns trigger language plpgsql security definer set search_path=public as $$ declare v_id uuid; begin v_id:=case tg_table_name when 'listing_events' then coalesce(new.listing_id,old.listing_id) when 'products' then coalesce(new.id,old.id) else null end; if v_id is not null then insert into public.listing_intelligence_dirty(listing_id,dirty_at,reason) values(v_id,now(),tg_table_name) on conflict(listing_id) do update set dirty_at=excluded.dirty_at,reason=excluded.reason; end if; return coalesce(new,old); end $$;
drop trigger if exists trg_listing_events_intelligence_dirty on public.listing_events; create trigger trg_listing_events_intelligence_dirty after insert or update or delete on public.listing_events for each row execute function public.mark_listing_intelligence_dirty();
drop trigger if exists trg_products_intelligence_dirty on public.products; create trigger trg_products_intelligence_dirty after insert or update of total_sales,view_count,total_reviews,average_rating,is_active,is_hidden,approval_status,updated_at on public.products for each row execute function public.mark_listing_intelligence_dirty();

-- Server-side statistics/DDS aggregation; normalized rates and bounded scores.
create or replace function public.refresh_listing_intelligence(p_listing_ids uuid[] default null) returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer:=0;
begin
 with targets as (select p.* from public.products p where p_listing_ids is null or p.id=any(p_listing_ids)),ev as (select le.listing_id,count(*) filter(where le.event_type in ('impression','visible_impression','qualified_impression','open'))::int impressions,count(distinct coalesce(le.user_id::text,le.session_id)) filter(where le.event_type in ('impression','visible_impression','qualified_impression','open'))::int unique_impressions,count(*) filter(where le.event_type in ('click','open','product_click','entity_click'))::int clicks,count(distinct coalesce(le.user_id::text,le.session_id)) filter(where le.event_type in ('click','open','product_click','entity_click'))::int unique_clicks,count(*) filter(where le.event_type in ('favorite','save','wishlist'))::int favorites,count(*) filter(where le.event_type='share')::int shares,count(*) filter(where le.event_type in ('message','contact','chat','service_inquiry'))::int messages,count(*) filter(where le.event_type='purchase')::int purchases,count(*) filter(where le.created_at>=now()-interval '1 hour')::numeric velocity_1h,count(*) filter(where le.created_at>=now()-interval '24 hours')::numeric velocity_24h,count(*) filter(where le.created_at>=now()-interval '7 days')::numeric velocity_7d,count(*) filter(where le.created_at>=now()-interval '30 days')::numeric velocity_30d,avg(case when coalesce(le.metadata->>'dwell_ms',le.metadata->>'duration_ms','')~'^[0-9]+(\.[0-9]+)?$' then coalesce(le.metadata->>'dwell_ms',le.metadata->>'duration_ms')::numeric/1000 end) avg_view_s from public.listing_events le where p_listing_ids is null or le.listing_id=any(p_listing_ids) group by le.listing_id),up as (insert into public.listing_statistics(listing_id,listing_type,total_impressions,unique_impressions,total_clicks,unique_clicks,ctr,total_favorites,total_shares,total_messages,total_purchases,completed_orders,conversion_rate,avg_view_duration_seconds,avg_rating,total_reviews,rating_confidence,refund_rate,dispute_rate,velocity_1h,velocity_24h,velocity_7d,velocity_30d,updated_at) select t.id,'product',greatest(coalesce(e.impressions,0),coalesce(t.view_count,0)),coalesce(e.unique_impressions,0),coalesce(e.clicks,0),coalesce(e.unique_clicks,0),case when greatest(coalesce(e.impressions,0),coalesce(t.view_count,0))>0 then least(1,coalesce(e.clicks,0)::numeric/greatest(coalesce(e.impressions,0),coalesce(t.view_count,0))) else 0 end,coalesce(e.favorites,0),coalesce(e.shares,0),coalesce(e.messages,0),coalesce(e.purchases,0),greatest(coalesce(t.total_sales,0),coalesce(e.purchases,0)),case when greatest(coalesce(e.impressions,0),coalesce(t.view_count,0))>0 then least(1,greatest(coalesce(t.total_sales,0),coalesce(e.purchases,0))::numeric/greatest(coalesce(e.impressions,0),coalesce(t.view_count,0))) else 0 end,e.avg_view_s,coalesce(t.average_rating,0),coalesce(t.total_reviews,0),case when coalesce(t.total_reviews,0)>0 then (coalesce(t.average_rating,0)/5.0)*(t.total_reviews::numeric/(t.total_reviews+5.0)) else 0 end,0,0,coalesce(e.velocity_1h,0),coalesce(e.velocity_24h,0),coalesce(e.velocity_7d,0),coalesce(e.velocity_30d,0),now() from targets t left join ev e on e.listing_id=t.id on conflict(listing_id) do update set total_impressions=excluded.total_impressions,unique_impressions=excluded.unique_impressions,total_clicks=excluded.total_clicks,unique_clicks=excluded.unique_clicks,ctr=excluded.ctr,total_favorites=excluded.total_favorites,total_shares=excluded.total_shares,total_messages=excluded.total_messages,total_purchases=excluded.total_purchases,completed_orders=excluded.completed_orders,conversion_rate=excluded.conversion_rate,avg_view_duration_seconds=excluded.avg_view_duration_seconds,avg_rating=excluded.avg_rating,total_reviews=excluded.total_reviews,rating_confidence=excluded.rating_confidence,velocity_1h=excluded.velocity_1h,velocity_24h=excluded.velocity_24h,velocity_7d=excluded.velocity_7d,velocity_30d=excluded.velocity_30d,updated_at=now() returning listing_id),features as (select st.*,p.created_at,u.is_verified,u.verification_status,least(100,100*least(1,st.ctr)*0.50+100*least(1,st.total_favorites::numeric/greatest(st.total_impressions,1))*0.20+100*least(1,st.total_shares::numeric/greatest(st.total_impressions,1))*0.15+100*least(1,st.total_messages::numeric/greatest(st.total_impressions,1))*0.15) engagement,least(100,100*st.conversion_rate) conversion,least(100,100*st.rating_confidence) rating,greatest(0,100-(extract(epoch from(now()-coalesce(p.created_at,now())))/86400.0)*(100.0/30.0)) freshness,least(100,10*ln(1+st.velocity_1h)+8*ln(1+st.velocity_24h)+5*ln(1+st.velocity_7d)+3*ln(1+st.velocity_30d)) velocity,case when coalesce(u.is_verified,false) or u.verification_status='verified' then 100 else 55 end trust from public.listing_statistics st join targets p on p.id=st.listing_id left join public.users u on u.id=p.uploaded_by),cfg as (select * from public.algorithm_settings where is_singleton=true limit 1),scored as (select f.*,c.*,least(100,f.velocity*0.55+f.engagement*0.25+f.conversion*0.20) trend,greatest(1,c.click_weight+c.conversion_weight+c.rating_weight+c.freshness_weight+c.velocity_weight+c.trust_weight) denom from features f cross join cfg c)
 insert into public.listing_scores(listing_id,listing_type,dds_score,relevance_score,engagement_score,conversion_score,rating_score,freshness_score,velocity_score,trust_score,trending_score,is_trending,trending_tier,calculated_at) select listing_id,'product',round(((engagement*click_weight+conversion*conversion_weight+rating*rating_weight+freshness*freshness_weight+velocity*velocity_weight+trust*trust_weight)/denom)::numeric,4),round(engagement::numeric,4),round(engagement::numeric,4),round(conversion::numeric,4),round(rating::numeric,4),round(freshness::numeric,4),round(velocity::numeric,4),round(trust::numeric,4),round(trend::numeric,4),trend>=trending_threshold,case when trend>=80 then 'hot' when trend>=65 then 'rising' when trend>=trending_threshold then 'emerging' else null end,now() from scored on conflict(listing_id) do update set dds_score=excluded.dds_score,relevance_score=excluded.relevance_score,engagement_score=excluded.engagement_score,conversion_score=excluded.conversion_score,rating_score=excluded.rating_score,freshness_score=excluded.freshness_score,velocity_score=excluded.velocity_score,trust_score=excluded.trust_score,trending_score=excluded.trending_score,is_trending=excluded.is_trending,trending_tier=excluded.trending_tier,calculated_at=now(); get diagnostics v_count=row_count; return v_count;
end $$;
revoke all on function public.refresh_listing_intelligence(uuid[]) from public,anon,authenticated; grant execute on function public.refresh_listing_intelligence(uuid[]) to service_role;
create or replace function public.process_dirty_listing_intelligence(p_limit integer default 250) returns integer language plpgsql security definer set search_path=public as $$ declare v_ids uuid[]; v_processed integer:=0; begin select array_agg(listing_id) into v_ids from(select listing_id from public.listing_intelligence_dirty order by dirty_at asc limit greatest(1,least(p_limit,1000)))q; if coalesce(array_length(v_ids,1),0)=0 then return 0; end if; perform public.refresh_listing_intelligence(v_ids); delete from public.listing_intelligence_dirty where listing_id=any(v_ids); v_processed:=array_length(v_ids,1); return v_processed; end $$;
revoke all on function public.process_dirty_listing_intelligence(integer) from public,anon,authenticated; grant execute on function public.process_dirty_listing_intelligence(integer) to service_role;

alter table public.recommendation_logs add column if not exists position integer,add column if not exists surface text not null default 'marketplace',add column if not exists reason text,add column if not exists algorithm_version integer not null default 2,add column if not exists session_id text,add column if not exists converted boolean not null default false,add column if not exists metadata jsonb not null default '{}'::jsonb;
create index if not exists idx_rec_logs_surface_time on public.recommendation_logs(surface,created_at desc);

create or replace function public.get_recommendation_system_diagnostics() returns jsonb language plpgsql stable security definer set search_path=public,extensions as $$ declare v_uid uuid:=auth.uid(); s public.algorithm_settings%rowtype; begin if v_uid is null or not public.is_admin(v_uid) then raise exception 'Admin access required' using errcode='42501'; end if; select * into s from public.algorithm_settings where is_singleton=true limit 1; return jsonb_build_object('interest_profiles_total',(select count(*) from public.user_interest_profiles),'interest_profiles_pending',(select count(*) from public.user_interest_profiles where needs_recompute=true),'profiles_recomputed_24h',(select count(*) from public.user_interest_profiles where last_recomputed_at>=now()-interval '24 hours'),'marketplace_feed_v2',to_regprocedure('public.get_marketplace_feed_v2(text,integer,text,text,numeric,numeric,text,boolean,numeric,text)') is not null,'social_feed_v2',exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='get_social_feed_v2'),'promotion_delivery_v2',exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='get_promotion_delivery_v2'),'canonical_source','algorithm_settings','legacy_marketplace_sync',exists(select 1 from pg_trigger where tgname='trg_sync_marketplace_weights_from_algorithm' and tgenabled<>'D'),'interest_cron_active',exists(select 1 from cron.job where jobname='dright-interest-learning-15m' and active=true),'listing_intelligence_cron_active',exists(select 1 from cron.job where jobname='dright-listing-intelligence-5m' and active=true),'storage_cron_active',exists(select 1 from cron.job where jobname='dright-storage-snapshot-daily' and active=true),'listing_statistics_count',(select count(*) from public.listing_statistics),'listing_scores_count',(select count(*) from public.listing_scores),'listing_intelligence_pending',(select count(*) from public.listing_intelligence_dirty),'semantic_recommendations_enabled',coalesce(s.semantic_recommendations_enabled,false),'embedding_generation_enabled',coalesce(s.embedding_generation_enabled,false),'pgvector_available',exists(select 1 from pg_extension where extname='vector'),'semantic_indexed',(select count(*) from public.content_embeddings where status='ready' and embedding is not null),'semantic_pending',(select count(*) from public.content_embeddings where status='pending'),'semantic_failed',(select count(*) from public.content_embeddings where status='failed'),'semantic_stale',(select count(*) from public.content_embeddings where status='stale'),'algorithm_version',3,'generated_at',now()); end $$;
revoke all on function public.get_recommendation_system_diagnostics() from public,anon; grant execute on function public.get_recommendation_system_diagnostics() to authenticated;

do $$ begin if not exists(select 1 from cron.job where jobname='dright-listing-intelligence-5m') then perform cron.schedule('dright-listing-intelligence-5m','*/5 * * * *','select public.process_dirty_listing_intelligence(250);'); end if; end $$;
insert into public.listing_intelligence_dirty(listing_id,dirty_at,reason) select id,now(),'initial_backfill' from public.products on conflict(listing_id) do update set dirty_at=excluded.dirty_at,reason=excluded.reason;
select public.process_dirty_listing_intelligence(1000);

insert into public.content_embeddings(entity_type,entity_id,embedding_provider,embedding_model,embedding_dimensions,embedding_version,content_hash,source_text_hash,status,metadata)
select case upper(coalesce(p.product_type,'PHYSICAL')) when 'SERVICE' then 'service' when 'COURSE' then 'course' else 'product' end,p.id,s.semantic_provider,s.semantic_embedding_model,1536,s.semantic_embedding_version,md5(public.build_semantic_source_text(case upper(coalesce(p.product_type,'PHYSICAL')) when 'SERVICE' then 'service' when 'COURSE' then 'course' else 'product' end,p.id)),md5(public.build_semantic_source_text(case upper(coalesce(p.product_type,'PHYSICAL')) when 'SERVICE' then 'service' when 'COURSE' then 'course' else 'product' end,p.id)),case when s.embedding_generation_enabled then 'pending' else 'stale' end,'{}'::jsonb
from public.products p cross join public.algorithm_settings s where s.is_singleton=true and p.is_active=true and public.build_semantic_source_text(case upper(coalesce(p.product_type,'PHYSICAL')) when 'SERVICE' then 'service' when 'COURSE' then 'course' else 'product' end,p.id) is not null
on conflict(entity_type,entity_id,embedding_model,embedding_version) do nothing;