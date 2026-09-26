begin;

create table if not exists public.ai_master_settings(
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default true,
  disabled_message text not null default 'AI features are temporarily turned off by DRIGHT.',
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id)
);

insert into public.ai_master_settings(singleton)
values(true)
on conflict(singleton) do nothing;

alter table public.ai_master_settings enable row level security;

drop policy if exists ai_master_settings_read on public.ai_master_settings;
create policy ai_master_settings_read
on public.ai_master_settings
for select
to anon,authenticated
using(true);

grant select on public.ai_master_settings to anon,authenticated;

create or replace function public.get_ai_master_status()
returns jsonb
language sql
stable
security definer
set search_path=public
as $function$
  select jsonb_build_object(
    'enabled',enabled,
    'disabled_message',disabled_message,
    'updated_at',updated_at
  )
  from public.ai_master_settings
  where singleton=true;
$function$;

revoke all on function public.get_ai_master_status() from public;
grant execute on function public.get_ai_master_status() to anon,authenticated;

create or replace function public.admin_set_ai_master_enabled(
  p_enabled boolean,
  p_disabled_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_row public.ai_master_settings%rowtype;
begin
  if auth.uid() is null or not public.has_dright_permission('ai','manage') then
    raise exception 'AI management permission required';
  end if;

  update public.ai_master_settings
  set enabled=coalesce(p_enabled,false),
      disabled_message=coalesce(nullif(trim(p_disabled_message),''),disabled_message),
      updated_at=now(),
      updated_by=auth.uid()
  where singleton=true
  returning * into v_row;

  insert into public.admin_logs(admin_id,action_type,target_type,details)
  values(
    auth.uid(),
    'ai_master_toggle_update',
    'ai_master_settings',
    jsonb_build_object('enabled',v_row.enabled,'disabled_message',v_row.disabled_message)
  );

  return jsonb_build_object(
    'enabled',v_row.enabled,
    'disabled_message',v_row.disabled_message,
    'updated_at',v_row.updated_at
  );
end;
$function$;

revoke all on function public.admin_set_ai_master_enabled(boolean,text) from public;
grant execute on function public.admin_set_ai_master_enabled(boolean,text) to authenticated;

alter table public.dright_starter_affiliate_challenge_settings
  add column if not exists base_level_label text not null default 'Affiliate Level 0',
  add column if not exists base_level_number integer not null default 0,
  add column if not exists unlock_level_number integer not null default 1;

update public.dright_starter_affiliate_challenge_settings
set base_level_label=coalesce(nullif(trim(base_level_label),''),'Affiliate Level 0'),
    base_level_number=coalesce(base_level_number,0),
    unlock_level_number=coalesce(unlock_level_number,1)
where singleton=true;

create or replace function public.get_public_dright_starter_affiliate_challenge()
returns jsonb
language sql
stable
security definer
set search_path=public
as $function$
  select jsonb_build_object(
    'enabled',s.enabled,
    'target_sales',s.target_sales,
    'base_level_label',s.base_level_label,
    'base_level_number',s.base_level_number,
    'unlock_label',s.unlock_label,
    'unlock_level_number',s.unlock_level_number,
    'description_template',s.description_template,
    'restrict_marketplace_until_complete',s.restrict_marketplace_until_complete,
    'allow_own_listings_while_restricted',s.allow_own_listings_while_restricted,
    'seller_profile_exempt',s.seller_profile_exempt,
    'applies_from',s.applies_from
  )
  from public.dright_starter_affiliate_challenge_settings s
  where s.singleton=true;
$function$;

create or replace function public.admin_update_dright_starter_affiliate_challenge(p_settings jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_target integer;
  v_old_enabled boolean;
  v_new_enabled boolean;
  v_base_level integer;
  v_unlock_level integer;
begin
  if auth.uid() is null or not public.has_dright_permission('subscriptions','manage') then
    raise exception 'Subscription management permission required';
  end if;

  select target_sales,enabled,base_level_number,unlock_level_number
  into v_target,v_old_enabled,v_base_level,v_unlock_level
  from public.dright_starter_affiliate_challenge_settings
  where singleton=true;

  v_target := coalesce((p_settings->>'target_sales')::integer,v_target);
  v_new_enabled := coalesce((p_settings->>'enabled')::boolean,v_old_enabled);
  v_base_level := coalesce((p_settings->>'base_level_number')::integer,v_base_level);
  v_unlock_level := coalesce((p_settings->>'unlock_level_number')::integer,v_unlock_level);

  if v_target < 1 or v_target > 100000 then
    raise exception 'Starter affiliate target sales must be between 1 and 100000';
  end if;
  if v_base_level < 0 or v_base_level > 1000 or v_unlock_level < 0 or v_unlock_level > 1000 then
    raise exception 'Affiliate levels must be between 0 and 1000';
  end if;

  update public.dright_starter_affiliate_challenge_settings
  set enabled=v_new_enabled,
      target_sales=v_target,
      base_level_label=coalesce(nullif(trim(p_settings->>'base_level_label'),''),base_level_label),
      base_level_number=v_base_level,
      unlock_label=coalesce(nullif(trim(p_settings->>'unlock_label'),''),unlock_label),
      unlock_level_number=v_unlock_level,
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
$function$;

create or replace function public.get_my_dright_starter_affiliate_progress()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $function$
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
  v_target integer := 20;
  v_remaining integer := 20;
  v_percent integer := 0;
begin
  select * into v_settings
  from public.dright_starter_affiliate_challenge_settings
  where singleton=true;

  v_target:=coalesce(v_settings.target_sales,20);

  if v_uid is null then
    return jsonb_build_object(
      'authenticated',false,
      'enabled',coalesce(v_settings.enabled,false),
      'applies',false,
      'sales',0,
      'target_sales',v_target,
      'remaining_sales',v_target,
      'progress_percent',0,
      'completed',false,
      'base_level_label',v_settings.base_level_label,
      'base_level_number',v_settings.base_level_number,
      'unlock_label',v_settings.unlock_label,
      'unlock_level_number',v_settings.unlock_level_number,
      'current_level_label',v_settings.base_level_label,
      'current_level_number',v_settings.base_level_number,
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

  v_completed := v_sales >= v_target;
  v_remaining := greatest(v_target-v_sales,0);
  v_percent := case when v_target<=0 then 100 else least(100,floor((v_sales::numeric/v_target::numeric)*100)::integer) end;

  return jsonb_build_object(
    'authenticated',true,
    'enabled',coalesce(v_settings.enabled,false),
    'applies',v_applies,
    'sales',v_sales,
    'target_sales',v_target,
    'remaining_sales',v_remaining,
    'progress_percent',v_percent,
    'completed',v_completed,
    'base_level_label',v_settings.base_level_label,
    'base_level_number',v_settings.base_level_number,
    'unlock_label',v_settings.unlock_label,
    'unlock_level_number',v_settings.unlock_level_number,
    'current_level_label',case when v_completed then v_settings.unlock_label else v_settings.base_level_label end,
    'current_level_number',case when v_completed then v_settings.unlock_level_number else v_settings.base_level_number end,
    'next_level_label',case when v_completed then null else v_settings.unlock_label end,
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
$function$;

comment on table public.ai_master_settings is
  'Global kill switch for all DRIGHT AI user/admin features. Individual provider settings remain unchanged so AI can be restored without losing provider configuration.';

commit;
