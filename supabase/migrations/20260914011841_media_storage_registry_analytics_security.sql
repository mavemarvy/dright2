-- DRIGHT2 media/storage scalability: canonical registry, policies, monitoring,
-- snapshots, review-only orphan detection, and private chat attachments.

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references public.users(id) on delete set null,
  provider text not null default 'supabase' check (provider in ('supabase','cloudinary','stream','external')),
  bucket text,
  object_path text,
  provider_id text,
  media_type text not null default 'other' check (media_type in ('image','video','audio','document','archive','other')),
  mime_type text,
  original_filename text,
  bytes bigint not null default 0 check (bytes>=0),
  width integer check (width is null or width>0),
  height integer check (height is null or height>0),
  duration_ms bigint check (duration_ms is null or duration_ms>=0),
  aspect_ratio numeric,
  checksum text,
  original_asset_id uuid references public.media_assets(id) on delete set null,
  variant_type text not null default 'original',
  status text not null default 'active' check (status in ('uploading','active','failed','deleted','orphan_candidate')),
  processing_status text not null default 'ready' check (processing_status in ('pending','processing','ready','failed','not_applicable')),
  visibility text not null default 'private' check (visibility in ('public','private','participants','admin')),
  feature text not null default 'general',
  reference_table text,
  reference_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists media_assets_provider_object_uidx on public.media_assets(provider,bucket,object_path) where object_path is not null and deleted_at is null;
create index if not exists media_assets_owner_feature_idx on public.media_assets(owner_user_id,feature,created_at desc) where deleted_at is null;
create index if not exists media_assets_reference_idx on public.media_assets(reference_table,reference_id) where reference_id is not null and deleted_at is null;
create index if not exists media_assets_status_idx on public.media_assets(status,processing_status,created_at desc);
alter table public.media_assets enable row level security;
drop policy if exists media_assets_read on public.media_assets;
create policy media_assets_read on public.media_assets for select to authenticated using (
  owner_user_id=auth.uid() or visibility='public' or public.is_admin(auth.uid())
);
drop policy if exists media_assets_insert_own on public.media_assets;
create policy media_assets_insert_own on public.media_assets for insert to authenticated with check (owner_user_id=auth.uid());
drop policy if exists media_assets_update_own on public.media_assets;
create policy media_assets_update_own on public.media_assets for update to authenticated using (owner_user_id=auth.uid() or public.is_admin(auth.uid())) with check (owner_user_id=auth.uid() or public.is_admin(auth.uid()));
drop policy if exists media_assets_delete_admin on public.media_assets;
create policy media_assets_delete_admin on public.media_assets for delete to authenticated using (public.is_admin(auth.uid()));

create table if not exists public.media_storage_policies (
  feature text primary key,
  bucket text,
  provider text not null default 'supabase',
  max_file_size_bytes bigint not null check(max_file_size_bytes>0),
  allowed_mime_types text[] not null default '{}'::text[],
  allowed_extensions text[] not null default '{}'::text[],
  max_image_width integer,
  max_image_height integer,
  max_video_duration_seconds integer,
  max_video_height integer,
  compression_policy jsonb not null default '{}'::jsonb,
  quality_preset text not null default 'standard' check(quality_preset in ('data_saver','standard','high','original')),
  visibility text not null default 'private' check(visibility in ('public','private','participants','admin')),
  retention_days integer,
  per_user_quota_bytes bigint,
  per_role_quota_bytes jsonb not null default '{}'::jsonb,
  upload_rate_limit_per_hour integer not null default 60,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null
);
alter table public.media_storage_policies enable row level security;
drop policy if exists media_storage_policies_read on public.media_storage_policies;
create policy media_storage_policies_read on public.media_storage_policies for select to authenticated using (true);
drop policy if exists media_storage_policies_admin_write on public.media_storage_policies;
create policy media_storage_policies_admin_write on public.media_storage_policies for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

insert into public.media_storage_policies(feature,bucket,provider,max_file_size_bytes,allowed_mime_types,allowed_extensions,max_image_width,max_image_height,max_video_duration_seconds,max_video_height,compression_policy,quality_preset,visibility,retention_days,upload_rate_limit_per_hour)
values
 ('avatars','avatars','supabase',10485760,array['image/jpeg','image/png','image/webp','image/gif'],array['jpg','jpeg','png','webp','gif'],4096,4096,null,null,'{"image_presets":{"thumbnail":200,"small":480,"medium":960,"large":1600}}','standard','public',null,30),
 ('product_images','product-images','supabase',26214400,array['image/jpeg','image/png','image/webp','image/gif'],array['jpg','jpeg','png','webp','gif'],8192,8192,null,null,'{"image_presets":{"thumbnail":200,"small":480,"medium":960,"large":2048}}','standard','public',null,120),
 ('product_videos','product-images','supabase',104857600,array['video/mp4','video/webm','video/quicktime'],array['mp4','webm','mov'],null,null,900,2160,'{"streaming_provider":"optional","fallback":"direct"}','standard','public',null,30),
 ('social_images','social-media','supabase',26214400,array['image/jpeg','image/png','image/webp','image/gif'],array['jpg','jpeg','png','webp','gif'],8192,8192,null,null,'{"image_presets":{"thumbnail":200,"small":480,"medium":960,"large":1600}}','standard','private',null,120),
 ('social_videos','social-media','supabase',104857600,array['video/mp4','video/webm','video/quicktime'],array['mp4','webm','mov'],null,null,900,2160,'{"streaming_provider":"optional","fallback":"direct","qualities":[360,480,720,1080]}','standard','private',null,30),
 ('news_media','news-media','supabase',52428800,array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime'],array['jpg','jpeg','png','webp','gif','mp4','webm','mov'],8192,8192,900,2160,'{}','standard','public',null,60),
 ('campaign_media','campaign-media','supabase',52428800,array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime'],array['jpg','jpeg','png','webp','gif','mp4','webm','mov'],8192,8192,300,2160,'{}','standard','public',null,60),
 ('chat_files','chat-attachments','supabase',52428800,array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime','audio/mpeg','audio/mp4','audio/ogg','audio/wav','application/pdf','text/plain','application/zip'],array['jpg','jpeg','png','webp','gif','mp4','webm','mov','mp3','m4a','ogg','wav','pdf','txt','zip'],8192,8192,600,2160,'{}','standard','participants',3650,120),
 ('cms_media','cms-media','supabase',52428800,array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime','audio/mpeg','application/pdf'],array['jpg','jpeg','png','webp','gif','mp4','webm','mov','mp3','pdf'],8192,8192,1800,2160,'{}','high','public',null,120),
 ('seller_portfolio','seller-portfolio','supabase',52428800,array['image/jpeg','image/png','image/webp','video/mp4','video/webm','application/pdf'],array['jpg','jpeg','png','webp','mp4','webm','pdf'],8192,8192,600,2160,'{}','standard','public',null,60),
 ('ai_images','ai-images','supabase',26214400,array['image/jpeg','image/png','image/webp'],array['jpg','jpeg','png','webp'],8192,8192,null,null,'{}','high','public',90,60),
 ('kyc','kyc-docs','supabase',20971520,array['image/jpeg','image/png','image/webp','application/pdf'],array['jpg','jpeg','png','webp','pdf'],8192,8192,null,null,'{}','original','admin',2555,20),
 ('verification','verification-screenshots','supabase',10485760,array['image/jpeg','image/png','image/webp','application/pdf'],array['jpg','jpeg','png','webp','pdf'],8192,8192,null,null,'{}','original','admin',2555,20)
on conflict(feature) do nothing;

-- Conservative bucket-level guards. These do not increase the existing social/news/chat limits.
update storage.buckets set file_size_limit=10485760,allowed_mime_types=array['image/jpeg','image/png','image/webp','image/gif'] where id='avatars';
update storage.buckets set file_size_limit=26214400,allowed_mime_types=array['image/jpeg','image/png','image/webp','image/gif'] where id='product-images';
update storage.buckets set file_size_limit=26214400,allowed_mime_types=array['image/jpeg','image/png','image/webp'] where id='ai-images';
update storage.buckets set file_size_limit=52428800,allowed_mime_types=array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime'] where id='campaign-media';
update storage.buckets set file_size_limit=52428800,allowed_mime_types=array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime','audio/mpeg','application/pdf'] where id='cms-media';
update storage.buckets set file_size_limit=52428800,allowed_mime_types=array['image/jpeg','image/png','image/webp','video/mp4','video/webm','application/pdf'] where id='seller-portfolio';
update storage.buckets set file_size_limit=20971520,allowed_mime_types=array['image/jpeg','image/png','image/webp','application/pdf'] where id='kyc-docs';
update storage.buckets set file_size_limit=10485760,allowed_mime_types=array['image/jpeg','image/png','image/webp','application/pdf'] where id='verification-screenshots';

-- Chat attachments become private without changing object paths or historical database rows.
update storage.buckets set public=false where id='chat-attachments';

create or replace function public.can_access_chat_storage_object(p_name text,p_uid uuid)
returns boolean language plpgsql stable security definer set search_path='public','storage' as $$
declare v_conv uuid; parts text[];
begin
  if p_uid is null then return false; end if;
  if public.is_admin(p_uid) then return true; end if;
  parts:=storage.foldername(p_name);
  if coalesce(array_length(parts,1),0)<2 then return false; end if;
  begin v_conv:=parts[2]::uuid; exception when others then return false; end;
  return exists(select 1 from public.chat_conversations c where c.id=v_conv and (c.customer_id=p_uid or c.seller_id=p_uid));
end $$;
revoke all on function public.can_access_chat_storage_object(text,uuid) from public,anon;
grant execute on function public.can_access_chat_storage_object(text,uuid) to authenticated,service_role;

drop policy if exists chat_attach_read on storage.objects;
drop policy if exists "Users can upload own chat attachments" on storage.objects;
drop policy if exists chat_attach_delete_own on storage.objects;
create policy chat_attach_participant_read on storage.objects for select to authenticated using (
  bucket_id='chat-attachments' and public.can_access_chat_storage_object(name,auth.uid())
);
create policy chat_attach_participant_insert on storage.objects for insert to authenticated with check (
  bucket_id='chat-attachments' and (storage.foldername(name))[3]=auth.uid()::text and public.can_access_chat_storage_object(name,auth.uid())
);
create policy chat_attach_owner_delete on storage.objects for delete to authenticated using (
  bucket_id='chat-attachments' and ((storage.foldername(name))[3]=auth.uid()::text or public.is_admin(auth.uid())) and public.can_access_chat_storage_object(name,auth.uid())
);

create table if not exists public.storage_usage_snapshots (
  id bigint generated by default as identity primary key,
  snapshot_date date not null,
  bucket_id text not null,
  object_count bigint not null default 0,
  total_bytes bigint not null default 0,
  image_bytes bigint not null default 0,
  video_bytes bigint not null default 0,
  audio_bytes bigint not null default 0,
  document_bytes bigint not null default 0,
  archive_bytes bigint not null default 0,
  other_bytes bigint not null default 0,
  largest_file_bytes bigint not null default 0,
  created_at timestamptz not null default now(),
  unique(snapshot_date,bucket_id)
);
create index if not exists storage_usage_snapshots_bucket_date_idx on public.storage_usage_snapshots(bucket_id,snapshot_date desc);
alter table public.storage_usage_snapshots enable row level security;
drop policy if exists storage_snapshots_admin_read on public.storage_usage_snapshots;
create policy storage_snapshots_admin_read on public.storage_usage_snapshots for select to authenticated using(public.is_admin(auth.uid()));

create table if not exists public.storage_monitor_settings (
  singleton boolean primary key default true check(singleton),
  included_storage_bytes bigint,
  warning_thresholds numeric[] not null default array[70,85,95]::numeric[],
  unusual_daily_growth_percent numeric not null default 100,
  orphan_grace_days integer not null default 30,
  estimated_storage_price_per_gb numeric,
  estimated_cached_egress_price_per_gb numeric,
  estimated_image_transform_price numeric,
  estimated_video_provider_price_per_gb numeric,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null
);
insert into public.storage_monitor_settings(singleton) values(true) on conflict(singleton) do nothing;
alter table public.storage_monitor_settings enable row level security;
drop policy if exists storage_monitor_admin_all on public.storage_monitor_settings;
create policy storage_monitor_admin_all on public.storage_monitor_settings for all to authenticated using(public.is_admin(auth.uid())) with check(public.is_admin(auth.uid()));

create table if not exists public.storage_orphan_candidates (
  id bigint generated by default as identity primary key,
  bucket_id text not null,
  object_path text not null,
  bytes bigint not null default 0,
  mime_type text,
  first_detected_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  state text not null default 'detected' check(state in ('detected','review','safe_to_delete','deleted','retained')),
  protected boolean not null default false,
  reason text not null default 'No known DRIGHT database reference was found',
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  unique(bucket_id,object_path)
);
alter table public.storage_orphan_candidates enable row level security;
drop policy if exists storage_orphans_admin_all on public.storage_orphan_candidates;
create policy storage_orphans_admin_all on public.storage_orphan_candidates for all to authenticated using(public.is_admin(auth.uid())) with check(public.is_admin(auth.uid()));

create or replace function public.capture_storage_usage_snapshot(p_date date default current_date)
returns integer language plpgsql security definer set search_path='public','storage' as $$
declare v_count integer;
begin
  insert into public.storage_usage_snapshots(snapshot_date,bucket_id,object_count,total_bytes,image_bytes,video_bytes,audio_bytes,document_bytes,archive_bytes,other_bytes,largest_file_bytes)
  select p_date,o.bucket_id,count(*),
    coalesce(sum(case when coalesce(o.metadata->>'size','')~'^\d+$' then (o.metadata->>'size')::bigint else 0 end),0),
    coalesce(sum(case when coalesce(o.metadata->>'mimetype','') like 'image/%' and coalesce(o.metadata->>'size','')~'^\d+$' then (o.metadata->>'size')::bigint else 0 end),0),
    coalesce(sum(case when coalesce(o.metadata->>'mimetype','') like 'video/%' and coalesce(o.metadata->>'size','')~'^\d+$' then (o.metadata->>'size')::bigint else 0 end),0),
    coalesce(sum(case when coalesce(o.metadata->>'mimetype','') like 'audio/%' and coalesce(o.metadata->>'size','')~'^\d+$' then (o.metadata->>'size')::bigint else 0 end),0),
    coalesce(sum(case when (coalesce(o.metadata->>'mimetype','') like 'application/%' or coalesce(o.metadata->>'mimetype','') like 'text/%') and coalesce(o.metadata->>'mimetype','') not in ('application/zip','application/x-7z-compressed','application/x-rar-compressed') and coalesce(o.metadata->>'size','')~'^\d+$' then (o.metadata->>'size')::bigint else 0 end),0),
    coalesce(sum(case when coalesce(o.metadata->>'mimetype','') in ('application/zip','application/x-7z-compressed','application/x-rar-compressed') and coalesce(o.metadata->>'size','')~'^\d+$' then (o.metadata->>'size')::bigint else 0 end),0),
    coalesce(sum(case when coalesce(o.metadata->>'mimetype','') not like 'image/%' and coalesce(o.metadata->>'mimetype','') not like 'video/%' and coalesce(o.metadata->>'mimetype','') not like 'audio/%' and coalesce(o.metadata->>'mimetype','') not like 'application/%' and coalesce(o.metadata->>'mimetype','') not like 'text/%' and coalesce(o.metadata->>'size','')~'^\d+$' then (o.metadata->>'size')::bigint else 0 end),0),
    coalesce(max(case when coalesce(o.metadata->>'size','')~'^\d+$' then (o.metadata->>'size')::bigint else 0 end),0)
  from storage.objects o group by o.bucket_id
  on conflict(snapshot_date,bucket_id) do update set object_count=excluded.object_count,total_bytes=excluded.total_bytes,image_bytes=excluded.image_bytes,video_bytes=excluded.video_bytes,audio_bytes=excluded.audio_bytes,document_bytes=excluded.document_bytes,archive_bytes=excluded.archive_bytes,other_bytes=excluded.other_bytes,largest_file_bytes=excluded.largest_file_bytes,created_at=now();
  get diagnostics v_count=row_count; return v_count;
end $$;
revoke all on function public.capture_storage_usage_snapshot(date) from public,anon,authenticated;
grant execute on function public.capture_storage_usage_snapshot(date) to service_role;

create or replace function public.scan_storage_orphan_candidates()
returns integer language plpgsql security definer set search_path='public','storage' as $$
declare v_grace integer:=30; v_count integer;
begin
  select orphan_grace_days into v_grace from public.storage_monitor_settings where singleton=true;
  insert into public.storage_orphan_candidates(bucket_id,object_path,bytes,mime_type,last_seen_at,protected)
  select o.bucket_id,o.name,
    case when coalesce(o.metadata->>'size','')~'^\d+$' then (o.metadata->>'size')::bigint else 0 end,
    o.metadata->>'mimetype',now(),o.bucket_id in ('kyc-docs','verification-screenshots')
  from storage.objects o
  where o.created_at<now()-make_interval(days=>greatest(coalesce(v_grace,30),1))
    and not exists(select 1 from public.media_assets m where m.provider='supabase' and m.bucket=o.bucket_id and m.object_path=o.name and m.deleted_at is null)
    and not exists(select 1 from public.chat_message_attachments a where a.storage_path=o.name and o.bucket_id='chat-attachments')
    and not exists(select 1 from public.social_posts sp where sp.media_path=o.name and o.bucket_id='social-media')
    and not exists(select 1 from public.cms_media cm where o.bucket_id='cms-media' and cm.file_url like '%'||o.bucket_id||'/'||o.name||'%')
    and not exists(select 1 from public.global_announcements ga where o.bucket_id='news-media' and ga.media_url like '%'||o.bucket_id||'/'||o.name||'%')
    and not exists(select 1 from public.products p where (p.image_url like '%'||o.bucket_id||'/'||o.name||'%' or coalesce(p.demo_video_url,'') like '%'||o.bucket_id||'/'||o.name||'%'))
    and not exists(select 1 from public.promotion_creatives pc where coalesce(pc.media_url,'') like '%'||o.bucket_id||'/'||o.name||'%')
  on conflict(bucket_id,object_path) do update set bytes=excluded.bytes,mime_type=excluded.mime_type,last_seen_at=now(),protected=excluded.protected;
  get diagnostics v_count=row_count; return v_count;
end $$;
revoke all on function public.scan_storage_orphan_candidates() from public,anon,authenticated;
grant execute on function public.scan_storage_orphan_candidates() to service_role;

create or replace function public.get_storage_media_analytics()
returns jsonb language plpgsql stable security definer set search_path='public','storage' as $$
declare v_uid uuid:=auth.uid(); v_current bigint:=0; v_objects bigint:=0; v_7 bigint; v_30 bigint; v_included bigint; v_daily numeric; v_result jsonb;
begin
  if v_uid is null or not public.is_admin(v_uid) then raise exception 'Admin access required' using errcode='42501'; end if;
  select count(*),coalesce(sum(case when coalesce(metadata->>'size','')~'^\d+$' then (metadata->>'size')::bigint else 0 end),0) into v_objects,v_current from storage.objects;
  select sum(total_bytes) into v_7 from public.storage_usage_snapshots where snapshot_date=(select max(snapshot_date) from public.storage_usage_snapshots where snapshot_date<=current_date-7);
  select sum(total_bytes) into v_30 from public.storage_usage_snapshots where snapshot_date=(select max(snapshot_date) from public.storage_usage_snapshots where snapshot_date<=current_date-30);
  select included_storage_bytes into v_included from public.storage_monitor_settings where singleton=true;
  v_daily:=case when v_30 is null then null else greatest(v_current-v_30,0)::numeric/30 end;
  select jsonb_build_object(
    'total_bytes',v_current,'object_count',v_objects,'media_asset_count',(select count(*) from public.media_assets where deleted_at is null),
    'growth_7d_bytes',case when v_7 is null then null else v_current-v_7 end,
    'growth_30d_bytes',case when v_30 is null then null else v_current-v_30 end,
    'average_daily_growth_bytes',v_daily,
    'estimated_30d_bytes',case when v_daily is null then null else round(v_current+v_daily*30) end,
    'included_storage_bytes',v_included,
    'included_percent_used',case when coalesce(v_included,0)>0 then round(v_current::numeric/v_included*100,2) else null end,
    'estimated_days_until_quota',case when coalesce(v_included,0)>v_current and coalesce(v_daily,0)>0 then round((v_included-v_current)::numeric/v_daily,1) else null end,
    'buckets',(select coalesce(jsonb_agg(jsonb_build_object('bucket',b.id,'public',b.public,'file_size_limit',b.file_size_limit,'allowed_mime_types',b.allowed_mime_types,'object_count',coalesce(s.object_count,0),'total_bytes',coalesce(s.total_bytes,0),'average_bytes',coalesce(s.average_bytes,0),'largest_file_bytes',coalesce(s.largest_file_bytes,0),'percent_of_total',case when v_current>0 then round(coalesce(s.total_bytes,0)::numeric/v_current*100,2) else 0 end) order by coalesce(s.total_bytes,0) desc),'[]'::jsonb) from storage.buckets b left join lateral(select count(*) object_count,coalesce(sum(case when coalesce(o.metadata->>'size','')~'^\d+$' then (o.metadata->>'size')::bigint else 0 end),0) total_bytes,coalesce(avg(case when coalesce(o.metadata->>'size','')~'^\d+$' then (o.metadata->>'size')::bigint else 0 end),0)::bigint average_bytes,coalesce(max(case when coalesce(o.metadata->>'size','')~'^\d+$' then (o.metadata->>'size')::bigint else 0 end),0) largest_file_bytes from storage.objects o where o.bucket_id=b.id)s on true),
    'by_media_type',(select jsonb_build_object('images',coalesce(sum(case when coalesce(metadata->>'mimetype','') like 'image/%' then case when coalesce(metadata->>'size','')~'^\d+$' then (metadata->>'size')::bigint else 0 end else 0 end),0),'video',coalesce(sum(case when coalesce(metadata->>'mimetype','') like 'video/%' then case when coalesce(metadata->>'size','')~'^\d+$' then (metadata->>'size')::bigint else 0 end else 0 end),0),'audio',coalesce(sum(case when coalesce(metadata->>'mimetype','') like 'audio/%' then case when coalesce(metadata->>'size','')~'^\d+$' then (metadata->>'size')::bigint else 0 end else 0 end),0),'documents',coalesce(sum(case when coalesce(metadata->>'mimetype','') like 'application/%' or coalesce(metadata->>'mimetype','') like 'text/%' then case when coalesce(metadata->>'size','')~'^\d+$' then (metadata->>'size')::bigint else 0 end else 0 end),0)) from storage.objects),
    'settings',(select to_jsonb(s) from public.storage_monitor_settings s where singleton=true),
    'orphan_candidates',(select count(*) from public.storage_orphan_candidates where state in ('detected','review')),
    'generated_at',now()
  ) into v_result;
  return v_result;
end $$;
revoke all on function public.get_storage_media_analytics() from public,anon;
grant execute on function public.get_storage_media_analytics() to authenticated,service_role;

create or replace function public.evaluate_storage_alerts()
returns integer language plpgsql security definer set search_path='public','storage' as $$
declare v_total bigint; v_quota bigint; v_pct numeric; v_threshold numeric; v_count integer:=0;
begin
  select coalesce(sum(case when coalesce(metadata->>'size','')~'^\d+$' then (metadata->>'size')::bigint else 0 end),0) into v_total from storage.objects;
  select included_storage_bytes,(select min(x) from unnest(warning_thresholds) x where x<=case when included_storage_bytes>0 then v_total::numeric/included_storage_bytes*100 else -1 end order by x desc limit 1) into v_quota,v_threshold from public.storage_monitor_settings where singleton=true;
  if coalesce(v_quota,0)>0 and v_threshold is not null then
    v_pct:=v_total::numeric/v_quota*100;
    insert into public.notifications(user_id,title,message,notification_type,category,priority,metadata,group_key)
    select u.id,'Storage capacity warning','DRIGHT storage is at approximately '||round(v_pct,1)||'% of the configured included quota.','system','system',case when v_pct>=95 then 'high' else 'normal' end,jsonb_build_object('storage_percent',round(v_pct,2),'total_bytes',v_total,'quota_bytes',v_quota),'storage-capacity-'||current_date::text
    from public.users u where u.is_admin=true and u.admin_status='active'
      and not exists(select 1 from public.notifications n where n.user_id=u.id and n.group_key='storage-capacity-'||current_date::text);
    get diagnostics v_count=row_count;
  end if;
  return v_count;
end $$;
revoke all on function public.evaluate_storage_alerts() from public,anon,authenticated;
grant execute on function public.evaluate_storage_alerts() to service_role;

select public.capture_storage_usage_snapshot(current_date);

do $$ begin
  if not exists(select 1 from cron.job where jobname='dright-storage-snapshot-daily') then
    perform cron.schedule('dright-storage-snapshot-daily','15 1 * * *','select public.capture_storage_usage_snapshot(current_date); select public.scan_storage_orphan_candidates(); select public.evaluate_storage_alerts();');
  end if;
end $$;