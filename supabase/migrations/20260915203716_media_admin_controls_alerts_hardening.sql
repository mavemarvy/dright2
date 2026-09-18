create or replace function public.can_manage_media_config(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1 from public.users u
    where u.id=p_user_id
      and u.is_admin=true
      and u.admin_status='active'
      and u.admin_role in ('super_admin','technical_admin','system_config_admin')
  );
$$;
revoke all on function public.can_manage_media_config(uuid) from public;
grant execute on function public.can_manage_media_config(uuid) to authenticated, service_role;

drop policy if exists media_storage_policies_admin_write on public.media_storage_policies;
create policy media_storage_policies_admin_write on public.media_storage_policies
for all to authenticated
using (public.can_manage_media_config(auth.uid()))
with check (public.can_manage_media_config(auth.uid()));

drop policy if exists storage_monitor_admin_all on public.storage_monitor_settings;
create policy storage_monitor_admin_all on public.storage_monitor_settings
for all to authenticated
using (public.can_manage_media_config(auth.uid()))
with check (public.can_manage_media_config(auth.uid()));

drop policy if exists storage_orphans_admin_all on public.storage_orphan_candidates;
create policy storage_orphans_admin_all on public.storage_orphan_candidates
for all to authenticated
using (public.can_manage_media_config(auth.uid()))
with check (public.can_manage_media_config(auth.uid()));

create or replace function public.register_supabase_media_asset(
  p_feature text,
  p_bucket text,
  p_object_path text,
  p_reference_table text default null,
  p_reference_id uuid default null,
  p_visibility text default null
)
returns uuid
language plpgsql
security definer
set search_path=public,storage
as $$
declare
  v_uid uuid:=auth.uid();
  v_obj storage.objects%rowtype;
  v_policy public.media_storage_policies%rowtype;
  v_id uuid;
  v_mime text;
  v_bytes bigint;
  v_kind text;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into v_policy from public.media_storage_policies where feature=p_feature and enabled=true limit 1;
  if not found then raise exception 'Media feature is not enabled'; end if;
  if v_policy.provider<>'supabase' or v_policy.bucket is distinct from p_bucket then raise exception 'Feature/provider mismatch'; end if;
  select * into v_obj from storage.objects where bucket_id=p_bucket and name=p_object_path limit 1;
  if not found then raise exception 'Storage object not found'; end if;
  if v_obj.owner is distinct from v_uid then raise exception 'Object ownership mismatch' using errcode='42501'; end if;
  v_mime:=coalesce(v_obj.metadata->>'mimetype','application/octet-stream');
  v_bytes:=case when coalesce(v_obj.metadata->>'size','')~'^\d+$' then (v_obj.metadata->>'size')::bigint else 0 end;
  if v_policy.max_file_size_bytes is not null and v_bytes>v_policy.max_file_size_bytes then raise exception 'File exceeds configured feature limit'; end if;
  if cardinality(coalesce(v_policy.allowed_mime_types,'{}'::text[]))>0 and not (v_mime=any(v_policy.allowed_mime_types)) then raise exception 'MIME type not permitted'; end if;
  v_kind:=case when v_mime like 'image/%' then 'image' when v_mime like 'video/%' then 'video' when v_mime like 'audio/%' then 'audio' when v_mime='application/pdf' or v_mime like 'text/%' then 'document' else 'other' end;
  insert into public.media_assets(owner_user_id,provider,bucket,object_path,media_type,mime_type,original_filename,bytes,status,processing_status,visibility,feature,reference_table,reference_id,metadata)
  values(v_uid,'supabase',p_bucket,p_object_path,v_kind,v_mime,regexp_replace(p_object_path,'^.*/',''),v_bytes,'active','ready',coalesce(p_visibility,v_policy.visibility),p_feature,p_reference_table,p_reference_id,jsonb_build_object('storage_object_id',v_obj.id))
  on conflict(provider,bucket,object_path) where deleted_at is null
  do update set feature=excluded.feature,reference_table=coalesce(excluded.reference_table,public.media_assets.reference_table),reference_id=coalesce(excluded.reference_id,public.media_assets.reference_id),mime_type=excluded.mime_type,bytes=excluded.bytes,status='active',processing_status='ready',visibility=excluded.visibility,updated_at=now()
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.register_supabase_media_asset(text,text,text,text,uuid,text) from public;
grant execute on function public.register_supabase_media_asset(text,text,text,text,uuid,text) to authenticated,service_role;

create or replace function public.get_storage_media_analytics()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,storage
as $$
declare
  v_uid uuid:=auth.uid(); v_current bigint:=0; v_objects bigint:=0; v_7 bigint; v_30 bigint; v_included bigint; v_daily numeric; v_result jsonb;
  v_storage_price numeric;
begin
  if v_uid is null or not public.is_admin(v_uid) then raise exception 'Admin access required' using errcode='42501'; end if;
  select count(*),coalesce(sum(case when coalesce(metadata->>'size','')~'^\d+$' then (metadata->>'size')::bigint else 0 end),0) into v_objects,v_current from storage.objects;
  select sum(total_bytes) into v_7 from public.storage_usage_snapshots where snapshot_date=(select max(snapshot_date) from public.storage_usage_snapshots where snapshot_date<=current_date-7);
  select sum(total_bytes) into v_30 from public.storage_usage_snapshots where snapshot_date=(select max(snapshot_date) from public.storage_usage_snapshots where snapshot_date<=current_date-30);
  select included_storage_bytes,estimated_storage_price_per_gb into v_included,v_storage_price from public.storage_monitor_settings where singleton=true;
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
    'estimated_monthly_storage_cost',case when v_storage_price is null then null else round((v_current::numeric/1073741824)*v_storage_price,2) end,
    'buckets',(select coalesce(jsonb_agg(jsonb_build_object('bucket',b.id,'public',b.public,'file_size_limit',b.file_size_limit,'allowed_mime_types',b.allowed_mime_types,'object_count',coalesce(s.object_count,0),'total_bytes',coalesce(s.total_bytes,0),'average_bytes',coalesce(s.average_bytes,0),'largest_file_bytes',coalesce(s.largest_file_bytes,0),'percent_of_total',case when v_current>0 then round(coalesce(s.total_bytes,0)::numeric/v_current*100,2) else 0 end) order by coalesce(s.total_bytes,0) desc),'[]'::jsonb) from storage.buckets b left join lateral(select count(*) object_count,coalesce(sum(case when coalesce(o.metadata->>'size','')~'^\d+$' then (o.metadata->>'size')::bigint else 0 end),0) total_bytes,coalesce(avg(case when coalesce(o.metadata->>'size','')~'^\d+$' then (o.metadata->>'size')::bigint else 0 end),0)::bigint average_bytes,coalesce(max(case when coalesce(o.metadata->>'size','')~'^\d+$' then (o.metadata->>'size')::bigint else 0 end),0) largest_file_bytes from storage.objects o where o.bucket_id=b.id)s on true),
    'by_media_type',(select jsonb_build_object('images',coalesce(sum(case when coalesce(metadata->>'mimetype','') like 'image/%' then case when coalesce(metadata->>'size','')~'^\d+$' then (metadata->>'size')::bigint else 0 end else 0 end),0),'video',coalesce(sum(case when coalesce(metadata->>'mimetype','') like 'video/%' then case when coalesce(metadata->>'size','')~'^\d+$' then (metadata->>'size')::bigint else 0 end else 0 end),0),'audio',coalesce(sum(case when coalesce(metadata->>'mimetype','') like 'audio/%' then case when coalesce(metadata->>'size','')~'^\d+$' then (metadata->>'size')::bigint else 0 end else 0 end),0),'documents',coalesce(sum(case when coalesce(metadata->>'mimetype','') like 'application/%' or coalesce(metadata->>'mimetype','') like 'text/%' then case when coalesce(metadata->>'size','')~'^\d+$' then (metadata->>'size')::bigint else 0 end else 0 end),0)) from storage.objects),
    'by_feature',(select coalesce(jsonb_agg(jsonb_build_object('feature',feature,'asset_count',asset_count,'total_bytes',total_bytes) order by total_bytes desc),'[]'::jsonb) from (select coalesce(feature,'legacy_unclassified') feature,count(*) asset_count,coalesce(sum(bytes),0) total_bytes from public.media_assets where deleted_at is null group by coalesce(feature,'legacy_unclassified')) f),
    'history',(select coalesce(jsonb_agg(to_jsonb(h) order by snapshot_date),'[]'::jsonb) from (select snapshot_date,sum(total_bytes)::bigint total_bytes,sum(object_count)::bigint object_count,sum(video_bytes)::bigint video_bytes,sum(image_bytes)::bigint image_bytes from public.storage_usage_snapshots where snapshot_date>=current_date-30 group by snapshot_date order by snapshot_date) h),
    'largest_assets',(select coalesce(jsonb_agg(jsonb_build_object('bucket',bucket_id,'path',name,'bytes',bytes,'mime_type',mime_type) order by bytes desc),'[]'::jsonb) from (select bucket_id,name,case when coalesce(metadata->>'size','')~'^\d+$' then (metadata->>'size')::bigint else 0 end bytes,metadata->>'mimetype' mime_type from storage.objects order by case when coalesce(metadata->>'size','')~'^\d+$' then (metadata->>'size')::bigint else 0 end desc limit 20) la),
    'settings',(select to_jsonb(s) from public.storage_monitor_settings s where singleton=true),
    'orphan_candidates',(select count(*) from public.storage_orphan_candidates where state in ('detected','review')),
    'policy_count',(select count(*) from public.media_storage_policies where enabled=true),
    'generated_at',now()
  ) into v_result;
  return v_result;
end $$;

create or replace function public.evaluate_storage_alerts()
returns integer
language plpgsql
security definer
set search_path=public,storage
as $$
declare
  v_total bigint; v_count_objects bigint; v_video bigint; v_quota bigint; v_pct numeric; v_threshold numeric; v_count integer:=0; v_added integer:=0;
  v_prev_total bigint; v_prev_count bigint; v_prev_video bigint; v_growth_limit numeric:=100; v_growth_pct numeric; v_avg numeric; v_prev_avg numeric;
begin
  select count(*),coalesce(sum(case when coalesce(metadata->>'size','')~'^\d+$' then (metadata->>'size')::bigint else 0 end),0),coalesce(sum(case when coalesce(metadata->>'mimetype','') like 'video/%' and coalesce(metadata->>'size','')~'^\d+$' then (metadata->>'size')::bigint else 0 end),0)
  into v_count_objects,v_total,v_video from storage.objects;
  select included_storage_bytes,unusual_daily_growth_percent,(select min(x) from unnest(warning_thresholds) x where x<=case when included_storage_bytes>0 then v_total::numeric/included_storage_bytes*100 else -1 end order by x desc limit 1)
  into v_quota,v_growth_limit,v_threshold from public.storage_monitor_settings where singleton=true;
  select sum(total_bytes),sum(object_count),sum(video_bytes) into v_prev_total,v_prev_count,v_prev_video from public.storage_usage_snapshots where snapshot_date=(select max(snapshot_date) from public.storage_usage_snapshots where snapshot_date<current_date);
  if coalesce(v_quota,0)>0 and v_threshold is not null then
    v_pct:=v_total::numeric/v_quota*100;
    insert into public.notifications(user_id,title,message,notification_type,category,priority,metadata,group_key)
    select u.id,'Storage capacity warning','DRIGHT storage is at approximately '||round(v_pct,1)||'% of the configured included quota.','system','system',case when v_pct>=95 then 'high' else 'normal' end,jsonb_build_object('storage_percent',round(v_pct,2),'total_bytes',v_total,'quota_bytes',v_quota,'threshold',v_threshold),'storage-capacity-'||v_threshold::text||'-'||current_date::text
    from public.users u where u.is_admin=true and u.admin_status='active' and not exists(select 1 from public.notifications n where n.user_id=u.id and n.group_key='storage-capacity-'||v_threshold::text||'-'||current_date::text);
    get diagnostics v_added=row_count; v_count:=v_count+v_added;
  end if;
  if coalesce(v_prev_total,0)>0 and coalesce(v_growth_limit,0)>0 then
    v_growth_pct:=(v_total-v_prev_total)::numeric/v_prev_total*100;
    if v_growth_pct>=v_growth_limit then
      insert into public.notifications(user_id,title,message,notification_type,category,priority,metadata,group_key)
      select u.id,'Unusual storage growth','Storage grew by approximately '||round(v_growth_pct,1)||'% since the previous daily snapshot.','system','system','normal',jsonb_build_object('growth_percent',round(v_growth_pct,2),'previous_bytes',v_prev_total,'current_bytes',v_total),'storage-growth-'||current_date::text
      from public.users u where u.is_admin=true and u.admin_status='active' and not exists(select 1 from public.notifications n where n.user_id=u.id and n.group_key='storage-growth-'||current_date::text);
      get diagnostics v_added=row_count; v_count:=v_count+v_added;
    end if;
    if coalesce(v_prev_video,0)>0 and (v_video-v_prev_video)::numeric/v_prev_video*100>=v_growth_limit then
      insert into public.notifications(user_id,title,message,notification_type,category,priority,metadata,group_key)
      select u.id,'Video storage spike','Video storage growth exceeded the configured unusual-growth threshold.','system','system','normal',jsonb_build_object('previous_video_bytes',v_prev_video,'current_video_bytes',v_video),'video-storage-spike-'||current_date::text
      from public.users u where u.is_admin=true and u.admin_status='active' and not exists(select 1 from public.notifications n where n.user_id=u.id and n.group_key='video-storage-spike-'||current_date::text);
      get diagnostics v_added=row_count; v_count:=v_count+v_added;
    end if;
    v_avg:=case when v_count_objects>0 then v_total::numeric/v_count_objects else 0 end;
    v_prev_avg:=case when coalesce(v_prev_count,0)>0 then v_prev_total::numeric/v_prev_count else 0 end;
    if v_prev_avg>0 and (v_avg-v_prev_avg)/v_prev_avg*100>=v_growth_limit then
      insert into public.notifications(user_id,title,message,notification_type,category,priority,metadata,group_key)
      select u.id,'Average upload size increased','Average stored object size increased sharply compared with the previous daily snapshot.','system','system','normal',jsonb_build_object('previous_average_bytes',round(v_prev_avg),'current_average_bytes',round(v_avg)),'storage-average-size-'||current_date::text
      from public.users u where u.is_admin=true and u.admin_status='active' and not exists(select 1 from public.notifications n where n.user_id=u.id and n.group_key='storage-average-size-'||current_date::text);
      get diagnostics v_added=row_count; v_count:=v_count+v_added;
    end if;
  end if;
  return v_count;
end $$;
