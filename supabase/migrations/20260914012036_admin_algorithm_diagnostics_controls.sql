create or replace function public.get_recommendation_system_diagnostics()
returns jsonb language plpgsql stable security definer set search_path='public' as $$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null or not public.is_admin(v_uid) then raise exception 'Admin access required' using errcode='42501'; end if;
  return jsonb_build_object(
    'interest_profiles_total',(select count(*) from public.user_interest_profiles),
    'interest_profiles_pending',(select count(*) from public.user_interest_profiles where needs_recompute=true),
    'profiles_recomputed_24h',(select count(*) from public.user_interest_profiles where last_recomputed_at>=now()-interval '24 hours'),
    'marketplace_feed_v2',to_regprocedure('public.get_marketplace_feed_v2(text,integer,text,text,numeric,numeric,text,boolean,numeric,text)') is not null,
    'canonical_source','algorithm_settings',
    'legacy_marketplace_sync',exists(select 1 from pg_trigger where tgname='trg_sync_marketplace_weights_from_algorithm' and tgenabled<>'D'),
    'interest_cron_active',exists(select 1 from cron.job where jobname='dright-interest-learning-15m' and active=true),
    'storage_cron_active',exists(select 1 from cron.job where jobname='dright-storage-snapshot-daily' and active=true),
    'algorithm_version',2,
    'generated_at',now()
  );
end $$;
revoke all on function public.get_recommendation_system_diagnostics() from public,anon;
grant execute on function public.get_recommendation_system_diagnostics() to authenticated,service_role;

create or replace function public.admin_process_interest_profiles(p_limit integer default 100)
returns integer language plpgsql security definer set search_path='public' as $$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null or not public.is_admin(v_uid) then raise exception 'Admin access required' using errcode='42501'; end if;
  return public.process_dirty_interest_profiles(greatest(1,least(coalesce(p_limit,100),500)));
end $$;
revoke all on function public.admin_process_interest_profiles(integer) from public,anon;
grant execute on function public.admin_process_interest_profiles(integer) to authenticated,service_role;

create unique index if not exists media_assets_provider_id_uidx on public.media_assets(provider,provider_id) where provider_id is not null and deleted_at is null;