begin;

alter table public.dright_starter_affiliate_challenge_settings
  add column if not exists applies_from timestamptz not null default now();

-- The feature was introduced for new users. Existing accounts before this migration are grandfathered.
update public.dright_starter_affiliate_challenge_settings
set applies_from = now(),
    updated_at = now()
where singleton=true;

create or replace function public.get_public_dright_starter_affiliate_challenge()
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select jsonb_build_object(
    'enabled',s.enabled,
    'target_sales',s.target_sales,
    'unlock_label',s.unlock_label,
    'description_template',s.description_template,
    'restrict_marketplace_until_complete',s.restrict_marketplace_until_complete,
    'allow_own_listings_while_restricted',s.allow_own_listings_while_restricted,
    'seller_profile_exempt',s.seller_profile_exempt,
    'applies_from',s.applies_from
  )
  from public.dright_starter_affiliate_challenge_settings s
  where s.singleton=true;
$$;

revoke all on function public.get_public_dright_starter_affiliate_challenge() from public;
grant execute on function public.get_public_dright_starter_affiliate_challenge() to anon,authenticated,service_role;

create or replace function public.get_my_dright_starter_affiliate_progress()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_uid uuid := auth.uid();
  v_settings public.dright_starter_affiliate_challenge_settings%rowtype;
  v_profiles text[] := '{}'::text[];
  v_has_affiliate boolean := false;
  v_has_seller boolean := false;
  v_sales integer := 0;
  v_applies boolean := false;
  v_completed boolean := false;
  v_user_created timestamptz;
  v_new_user_cohort boolean := false;
begin
  select * into v_settings
  from public.dright_starter_affiliate_challenge_settings
  where singleton=true;

  if v_uid is null then
    return jsonb_build_object(
      'authenticated',false,
      'enabled',coalesce(v_settings.enabled,false),
      'applies',false,
      'sales',0,
      'target_sales',coalesce(v_settings.target_sales,20),
      'completed',false,
      'marketplace_limited',false,
      'new_user_cohort',false
    );
  end if;

  select u.created_at into v_user_created
  from public.users u
  where u.id=v_uid;

  v_new_user_cohort := v_user_created is not null
    and v_settings.applies_from is not null
    and v_user_created >= v_settings.applies_from;

  select coalesce(intended_profiles,'{}'::text[])
  into v_profiles
  from public.user_private_profiles
  where user_id=v_uid;

  select exists (
    select 1
    from unnest(coalesce(v_profiles,'{}'::text[])) p
    where regexp_replace(lower(trim(p)),'[^a-z0-9]+','_','g')
      in ('affiliate','affiliate_marketer','affiliate_marketing','marketer')
  ) into v_has_affiliate;

  select exists (
    select 1
    from unnest(coalesce(v_profiles,'{}'::text[])) p
    where regexp_replace(lower(trim(p)),'[^a-z0-9]+','_','g')
      in ('seller','vendor','product_seller','digital_seller')
  ) into v_has_seller;

  select count(*)::integer
  into v_sales
  from public.dright_starter_purchases p
  where p.referrer_id=v_uid
    and p.payment_status='success'
    and p.processed_at is not null;

  v_applies := coalesce(v_settings.enabled,false)
    and v_new_user_cohort
    and v_has_affiliate
    and not (coalesce(v_settings.seller_profile_exempt,true) and v_has_seller);

  v_completed := v_sales >= coalesce(v_settings.target_sales,20);

  return jsonb_build_object(
    'authenticated',true,
    'enabled',coalesce(v_settings.enabled,false),
    'applies',v_applies,
    'sales',v_sales,
    'target_sales',coalesce(v_settings.target_sales,20),
    'remaining_sales',greatest(coalesce(v_settings.target_sales,20)-v_sales,0),
    'completed',v_completed,
    'unlock_label',v_settings.unlock_label,
    'description_template',v_settings.description_template,
    'restrict_marketplace_until_complete',coalesce(v_settings.restrict_marketplace_until_complete,false),
    'allow_own_listings_while_restricted',coalesce(v_settings.allow_own_listings_while_restricted,true),
    'marketplace_limited',v_applies
      and coalesce(v_settings.restrict_marketplace_until_complete,false)
      and not v_completed,
    'selected_profiles',coalesce(v_profiles,'{}'::text[]),
    'seller_exempt',v_has_seller and coalesce(v_settings.seller_profile_exempt,true),
    'new_user_cohort',v_new_user_cohort,
    'applies_from',v_settings.applies_from
  );
end;
$$;

revoke all on function public.get_my_dright_starter_affiliate_progress() from public,anon;
grant execute on function public.get_my_dright_starter_affiliate_progress() to authenticated,service_role;

create or replace function public.admin_update_dright_starter_affiliate_challenge(
  p_settings jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_target integer;
  v_old_enabled boolean;
  v_new_enabled boolean;
begin
  if auth.uid() is null or not public.has_dright_permission('subscriptions','manage') then
    raise exception 'Subscription management permission required';
  end if;

  select target_sales,enabled into v_target,v_old_enabled
  from public.dright_starter_affiliate_challenge_settings
  where singleton=true;

  v_target := coalesce((p_settings->>'target_sales')::integer,v_target);
  v_new_enabled := coalesce((p_settings->>'enabled')::boolean,v_old_enabled);

  if v_target < 1 or v_target > 100000 then
    raise exception 'Starter affiliate target sales must be between 1 and 100000';
  end if;

  update public.dright_starter_affiliate_challenge_settings
  set enabled=v_new_enabled,
      target_sales=v_target,
      unlock_label=coalesce(nullif(trim(p_settings->>'unlock_label'),''),unlock_label),
      description_template=coalesce(nullif(trim(p_settings->>'description_template'),''),description_template),
      restrict_marketplace_until_complete=coalesce((p_settings->>'restrict_marketplace_until_complete')::boolean,restrict_marketplace_until_complete),
      allow_own_listings_while_restricted=coalesce((p_settings->>'allow_own_listings_while_restricted')::boolean,allow_own_listings_while_restricted),
      seller_profile_exempt=coalesce((p_settings->>'seller_profile_exempt')::boolean,seller_profile_exempt),
      applies_from=case
        when v_new_enabled=true and coalesce(v_old_enabled,false)=false then now()
        else applies_from
      end,
      updated_at=now(),
      updated_by=auth.uid()
  where singleton=true;

  return public.admin_get_dright_starter_affiliate_challenge();
end;
$$;

revoke all on function public.admin_update_dright_starter_affiliate_challenge(jsonb) from public,anon;
grant execute on function public.admin_update_dright_starter_affiliate_challenge(jsonb) to authenticated,service_role;

commit;