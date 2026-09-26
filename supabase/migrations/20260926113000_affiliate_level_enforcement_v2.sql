begin;

alter table public.dright_starter_affiliate_challenge_settings
  add column if not exists apply_levels_to_existing_affiliates boolean not null default true;

update public.dright_starter_affiliate_challenge_settings
set apply_levels_to_existing_affiliates=true
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
    'apply_levels_to_existing_affiliates',s.apply_levels_to_existing_affiliates,
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

  v_target:=coalesce((p_settings->>'target_sales')::integer,v_target);
  v_new_enabled:=coalesce((p_settings->>'enabled')::boolean,v_old_enabled);
  v_base_level:=coalesce((p_settings->>'base_level_number')::integer,v_base_level);
  v_unlock_level:=coalesce((p_settings->>'unlock_level_number')::integer,v_unlock_level);

  if v_target<1 or v_target>1000000000 then
    raise exception 'Starter affiliate target sales must be between 1 and 1000000000';
  end if;
  if v_base_level<0 or v_base_level>1000 or v_unlock_level<0 or v_unlock_level>1000 then
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
      apply_levels_to_existing_affiliates=coalesce((p_settings->>'apply_levels_to_existing_affiliates')::boolean,apply_levels_to_existing_affiliates),
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

create or replace function public.get_dright_affiliate_level_state(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $function$
declare
  v_sales integer:=0;
  v_level record;
  v_next record;
  v_entry integer:=0;
  v_next_total integer:=0;
  v_sales_in_level integer:=0;
  v_remaining integer:=0;
  v_percent integer:=100;
  v_settings public.dright_starter_affiliate_challenge_settings%rowtype;
  v_profiles text[]:='{}'::text[];
  v_has_affiliate boolean:=false;
  v_has_seller boolean:=false;
  v_user_created timestamptz;
  v_new_user_cohort boolean:=false;
  v_applies boolean:=false;
  v_levels jsonb:='[]'::jsonb;
begin
  select * into v_settings
  from public.dright_starter_affiliate_challenge_settings
  where singleton=true;

  if p_user_id is not null then
    select count(*)::integer
    into v_sales
    from public.dright_starter_purchases p
    where p.referrer_id=p_user_id
      and p.payment_status='success'
      and p.processed_at is not null;

    select u.created_at into v_user_created
    from public.users u
    where u.id=p_user_id;

    select coalesce(pp.intended_profiles,'{}'::text[])
    into v_profiles
    from public.user_private_profiles pp
    where pp.user_id=p_user_id;

    select exists(
      select 1 from unnest(coalesce(v_profiles,'{}'::text[])) x
      where regexp_replace(lower(trim(x)),'[^a-z0-9]+','_','g')
        in ('affiliate','affiliate_marketer','affiliate_marketing','marketer')
    ) into v_has_affiliate;

    select exists(
      select 1 from unnest(coalesce(v_profiles,'{}'::text[])) x
      where regexp_replace(lower(trim(x)),'[^a-z0-9]+','_','g')
        in ('seller','vendor','product_seller','digital_seller')
    ) into v_has_seller;
  end if;

  v_new_user_cohort:=v_user_created is not null
    and v_settings.applies_from is not null
    and v_user_created>=v_settings.applies_from;

  v_applies:=coalesce(v_settings.enabled,false)
    and coalesce(v_settings.restrict_marketplace_until_complete,true)
    and v_has_affiliate
    and (coalesce(v_settings.apply_levels_to_existing_affiliates,true) or v_new_user_cohort)
    and not (coalesce(v_settings.seller_profile_exempt,true) and v_has_seller);

  with calculated as (
    select
      l.*,
      coalesce(sum(l.sales_to_next) over(
        order by l.level_number
        rows between unbounded preceding and 1 preceding
      ),0)::integer as entry_sales,
      coalesce(sum(l.sales_to_next) over(
        order by l.level_number
        rows between unbounded preceding and current row
      ),0)::integer as cumulative_after
    from public.dright_affiliate_levels l
  )
  select *
  into v_level
  from calculated
  where entry_sales<=v_sales
  order by level_number desc
  limit 1;

  if v_level.level_number is null then
    select l.*,0::integer as entry_sales,l.sales_to_next::integer as cumulative_after
    into v_level
    from public.dright_affiliate_levels l
    where l.level_number=0;
  end if;

  select l.*
  into v_next
  from public.dright_affiliate_levels l
  where l.level_number>v_level.level_number
  order by l.level_number
  limit 1;

  v_entry:=coalesce(v_level.entry_sales,0);
  v_sales_in_level:=greatest(v_sales-v_entry,0);

  if v_next.level_number is null or coalesce(v_level.sales_to_next,0)<=0 then
    v_next_total:=v_sales;
    v_remaining:=0;
    v_percent:=100;
  else
    v_next_total:=v_entry+v_level.sales_to_next;
    v_remaining:=greatest(v_next_total-v_sales,0);
    v_percent:=least(100,greatest(0,floor((v_sales_in_level::numeric/greatest(v_level.sales_to_next,1))*100)::integer));
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'level_number',q.level_number,
    'title',q.title,
    'sales_to_next',q.sales_to_next,
    'product_limit',q.product_limit,
    'starter_only',q.starter_only,
    'entry_sales',q.entry_sales,
    'cumulative_after',q.cumulative_after,
    'is_current',q.level_number=v_level.level_number,
    'is_unlocked',q.entry_sales<=v_sales
  ) order by q.level_number),'[]'::jsonb)
  into v_levels
  from (
    select
      l.*,
      coalesce(sum(l.sales_to_next) over(
        order by l.level_number
        rows between unbounded preceding and 1 preceding
      ),0)::integer as entry_sales,
      coalesce(sum(l.sales_to_next) over(
        order by l.level_number
        rows between unbounded preceding and current row
      ),0)::integer as cumulative_after
    from public.dright_affiliate_levels l
  ) q;

  return jsonb_build_object(
    'sales',v_sales,
    'current_level_number',v_level.level_number,
    'current_level_label',v_level.title,
    'current_level_entry_sales',v_entry,
    'sales_in_current_level',v_sales_in_level,
    'sales_required_this_level',coalesce(v_level.sales_to_next,0),
    'next_level_number',v_next.level_number,
    'next_level_label',v_next.title,
    'next_level_total_sales',case when v_next.level_number is null then null else v_next_total end,
    'remaining_sales',v_remaining,
    'progress_percent',v_percent,
    'product_limit',v_level.product_limit,
    'starter_only',coalesce(v_level.starter_only,false),
    'max_level',v_next.level_number is null,
    'challenge_enabled',coalesce(v_settings.enabled,false),
    'access_rules_apply',v_applies,
    'apply_levels_to_existing_affiliates',coalesce(v_settings.apply_levels_to_existing_affiliates,true),
    'new_user_cohort',v_new_user_cohort,
    'seller_exempt',v_has_seller and coalesce(v_settings.seller_profile_exempt,true),
    'selected_profiles',coalesce(v_profiles,'{}'::text[]),
    'levels',v_levels
  );
end;
$function$;

create or replace function public.get_public_dright_affiliate_level(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $function$
declare
  v_state jsonb;
  v_sales integer;
  v_next_total integer;
  v_max boolean;
begin
  v_state:=public.get_dright_affiliate_level_state(p_user_id);
  v_sales:=coalesce((v_state->>'sales')::integer,0);
  v_next_total:=case when v_state->'next_level_total_sales'='null'::jsonb then v_sales else (v_state->>'next_level_total_sales')::integer end;
  v_max:=coalesce((v_state->>'max_level')::boolean,false);

  return jsonb_build_object(
    'enabled',coalesce((v_state->>'challenge_enabled')::boolean,false),
    'sales',v_sales,
    'target_sales',v_next_total,
    'remaining_sales',coalesce((v_state->>'remaining_sales')::integer,0),
    'completed',v_max,
    'progress_percent',coalesce((v_state->>'progress_percent')::integer,0),
    'current_level_label',v_state->>'current_level_label',
    'current_level_number',coalesce((v_state->>'current_level_number')::integer,0),
    'next_level_label',v_state->>'next_level_label',
    'next_level_number',case when v_state->'next_level_number'='null'::jsonb then null else (v_state->>'next_level_number')::integer end,
    'next_level_total_sales',case when v_state->'next_level_total_sales'='null'::jsonb then null else (v_state->>'next_level_total_sales')::integer end,
    'product_limit',case when v_state->'product_limit'='null'::jsonb then null else (v_state->>'product_limit')::integer end,
    'starter_only',coalesce((v_state->>'starter_only')::boolean,false),
    'max_level',v_max
  );
end;
$function$;

create or replace function public.get_or_create_tracking_link(
  p_user_id uuid,
  p_product_id uuid default null,
  p_source_type text default 'affiliate',
  p_source_level text default null,
  p_campaign_id uuid default null,
  p_sales_team_id uuid default null,
  p_team_member_id uuid default null,
  p_team_lead_id uuid default null
)
returns table(link_id uuid,tracking_code text)
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_id uuid;
  v_code text;
  v_user_code text;
  v_account text;
  v_team_id uuid;
  v_member_id uuid;
  v_lead_id uuid;
  v_level text;
  v_contract public.sales_team_contracts%rowtype;
  v_user public.users%rowtype;
begin
  if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'not authorized'; end if;
  if p_source_type not in ('affiliate','sales_team','advertiser','pro_advertiser','super_advertiser','partnership') then
    raise exception 'invalid source_type';
  end if;

  select * into v_user from public.users where id=p_user_id;
  if not found then raise exception 'user not found'; end if;

  v_account:=coalesce(v_user.account_status,'active');
  if v_account<>'active' then raise exception 'account is not active'; end if;

  v_user_code:=v_user.referral_code;
  if v_user_code is null or length(trim(v_user_code))=0 then raise exception 'user has no referral code'; end if;

  if p_product_id is not null and not exists(
    select 1 from public.products p
    where p.id=p_product_id and p.is_active=true and p.is_hidden=false and p.approval_status='approved'
  ) then
    raise exception 'product is not eligible for tracking';
  end if;

  if p_source_type='affiliate'
     and p_product_id is not null
     and not public.can_user_affiliate_product(p_user_id,p_product_id) then
    raise exception 'This product is not available at your current affiliate level yet';
  end if;

  v_team_id:=null;
  v_member_id:=null;
  v_lead_id:=null;
  v_level:=p_source_level;

  if p_source_type='sales_team' then
    if p_product_id is null then raise exception 'sales team links require a product'; end if;
    select * into v_contract
    from public.sales_team_contracts c
    where c.sales_team_id=p_user_id
      and c.product_id=p_product_id
      and c.status='active'
      and c.payment_status='paid'
      and c.expires_at>now()
      and c.selected_tier like 'Mkt L%'
    order by c.starts_at desc
    limit 1;
    if not found then raise exception 'no active paid sales team contract for this product'; end if;

    select stm.sales_team_id into v_team_id
    from public.sales_team_members stm
    join public.sales_teams st on st.id=stm.sales_team_id
    where stm.user_id=p_user_id and stm.status='active' and st.status='active'
    limit 1;
    if v_team_id is null then raise exception 'active sales team membership required'; end if;

    v_member_id:=p_user_id;
    v_level:=v_contract.selected_tier;

    select stm.user_id into v_lead_id
    from public.sales_team_members stm
    where stm.sales_team_id=v_team_id
      and stm.status='active'
      and stm.member_role in ('lead','manager')
      and stm.user_id<>p_user_id
    order by case when stm.member_role='manager' then 0 else 1 end,stm.joined_at
    limit 1;

    if p_sales_team_id is not null and p_sales_team_id<>v_team_id then raise exception 'sales team mismatch'; end if;
    if p_team_member_id is not null and p_team_member_id<>v_member_id then raise exception 'team member mismatch'; end if;
    if p_team_lead_id is not null and p_team_lead_id is distinct from v_lead_id then raise exception 'team lead mismatch'; end if;
  elsif p_source_type='advertiser' then
    if v_user.advertiser_status<>'approved' or v_user.advertiser_grade not in ('A','B','C') then raise exception 'advertiser source not eligible'; end if;
  elsif p_source_type='pro_advertiser' then
    if v_user.advertiser_status<>'approved' or v_user.advertiser_grade<>'Pro' then raise exception 'pro advertiser source not eligible'; end if;
  elsif p_source_type='super_advertiser' then
    if v_user.advertiser_status<>'approved' or v_user.advertiser_grade<>'Super' then raise exception 'super advertiser source not eligible'; end if;
  elsif p_source_type='partnership' then
    if v_user.advertiser_status<>'approved' or v_user.advertiser_grade<>'Partnership' then raise exception 'partnership source not eligible'; end if;
  end if;

  select id,unique_code into v_id,v_code
  from public.referral_links
  where user_id=p_user_id
    and product_id is not distinct from p_product_id
    and source_type=p_source_type
    and coalesce(source_level,'')=coalesce(v_level,'')
    and campaign_id is not distinct from p_campaign_id
    and sales_team_id is not distinct from v_team_id
    and team_member_id is not distinct from v_member_id
    and team_lead_id is not distinct from v_lead_id
  limit 1;

  if v_id is null then
    v_code:=case
      when p_product_id is null and p_source_type='affiliate' then v_user_code
      else upper(substr(md5(p_user_id::text||coalesce(p_product_id::text,'')||p_source_type||coalesce(v_level,'')||clock_timestamp()::text),1,10))
    end;

    insert into public.referral_links(
      user_id,unique_code,product_id,source_type,source_level,campaign_id,
      sales_team_id,team_member_id,team_lead_id,total_clicks,total_conversions
    )
    values(
      p_user_id,v_code,p_product_id,p_source_type,v_level,p_campaign_id,
      v_team_id,v_member_id,v_lead_id,0,0
    )
    returning id into v_id;
  end if;

  return query select v_id,v_code;
end;
$function$;

comment on column public.dright_starter_affiliate_challenge_settings.apply_levels_to_existing_affiliates is
  'When true, the affiliate-level catalog limits apply to existing affiliate profiles too. When false, only the configured new-user cohort is restricted.';

commit;