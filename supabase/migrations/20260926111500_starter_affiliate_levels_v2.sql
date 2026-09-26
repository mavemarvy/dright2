begin;

create table if not exists public.dright_affiliate_levels(
  level_number integer primary key check(level_number between 0 and 10),
  title text not null,
  sales_to_next integer not null default 0 check(sales_to_next between 0 and 1000000000),
  product_limit integer null check(product_limit is null or product_limit between 1 and 1000000),
  starter_only boolean not null default false,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id)
);

insert into public.dright_affiliate_levels(level_number,title,sales_to_next,product_limit,starter_only,sort_order)
values
  (0,'Starter Affiliate',20,1,true,0),
  (1,'Pro Affiliate I',30,5,false,1),
  (2,'Pro Affiliate II',50,20,false,2),
  (3,'Growth Affiliate',100,100,false,3),
  (4,'Advanced Affiliate',150,250,false,4),
  (5,'Elite Affiliate',250,500,false,5),
  (6,'Premier Affiliate',400,1000,false,6),
  (7,'Expert Affiliate',600,2500,false,7),
  (8,'Master Affiliate',1000,5000,false,8),
  (9,'Platinum Affiliate',1500,10000,false,9),
  (10,'Super Affiliate',0,null,false,10)
on conflict(level_number) do nothing;

alter table public.dright_affiliate_levels enable row level security;

drop policy if exists dright_affiliate_levels_public_read on public.dright_affiliate_levels;
create policy dright_affiliate_levels_public_read
on public.dright_affiliate_levels for select
to anon,authenticated
using(true);

grant select on public.dright_affiliate_levels to anon,authenticated;

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
    and v_new_user_cohort
    and v_has_affiliate
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
    'new_user_cohort',v_new_user_cohort,
    'seller_exempt',v_has_seller and coalesce(v_settings.seller_profile_exempt,true),
    'selected_profiles',coalesce(v_profiles,'{}'::text[]),
    'levels',v_levels
  );
end;
$function$;

revoke all on function public.get_dright_affiliate_level_state(uuid) from public;
grant execute on function public.get_dright_affiliate_level_state(uuid) to anon,authenticated;

create or replace function public.get_my_dright_starter_affiliate_progress()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $function$
declare
  v_uid uuid:=auth.uid();
  v_settings public.dright_starter_affiliate_challenge_settings%rowtype;
  v_state jsonb;
begin
  select * into v_settings
  from public.dright_starter_affiliate_challenge_settings
  where singleton=true;

  v_state:=public.get_dright_affiliate_level_state(v_uid);

  return jsonb_build_object(
    'authenticated',v_uid is not null,
    'enabled',coalesce(v_settings.enabled,false),
    'applies',coalesce((v_state->>'access_rules_apply')::boolean,false),
    'sales',coalesce((v_state->>'sales')::integer,0),
    'target_sales',coalesce((v_state->>'next_level_total_sales')::integer,(v_state->>'sales')::integer,0),
    'remaining_sales',coalesce((v_state->>'remaining_sales')::integer,0),
    'progress_percent',coalesce((v_state->>'progress_percent')::integer,0),
    'completed',coalesce((v_state->>'max_level')::boolean,false),
    'base_level_label',(select title from public.dright_affiliate_levels where level_number=0),
    'base_level_number',0,
    'unlock_label',coalesce(v_state->>'next_level_label',v_state->>'current_level_label'),
    'unlock_level_number',coalesce((v_state->>'next_level_number')::integer,(v_state->>'current_level_number')::integer),
    'current_level_label',v_state->>'current_level_label',
    'current_level_number',coalesce((v_state->>'current_level_number')::integer,0),
    'current_level_entry_sales',coalesce((v_state->>'current_level_entry_sales')::integer,0),
    'sales_in_current_level',coalesce((v_state->>'sales_in_current_level')::integer,0),
    'sales_required_this_level',coalesce((v_state->>'sales_required_this_level')::integer,0),
    'next_level_label',v_state->>'next_level_label',
    'next_level_number',case when v_state->'next_level_number'='null'::jsonb then null else (v_state->>'next_level_number')::integer end,
    'next_level_total_sales',case when v_state->'next_level_total_sales'='null'::jsonb then null else (v_state->>'next_level_total_sales')::integer end,
    'product_limit',case when v_state->'product_limit'='null'::jsonb then null else (v_state->>'product_limit')::integer end,
    'starter_only',coalesce((v_state->>'starter_only')::boolean,false),
    'max_level',coalesce((v_state->>'max_level')::boolean,false),
    'levels',coalesce(v_state->'levels','[]'::jsonb),
    'description_template',v_settings.description_template,
    'restrict_marketplace_until_complete',false,
    'allow_own_listings_while_restricted',coalesce(v_settings.allow_own_listings_while_restricted,true),
    'marketplace_limited',false,
    'affiliate_access_limited',coalesce((v_state->>'access_rules_apply')::boolean,false),
    'selected_profiles',coalesce(v_state->'selected_profiles','[]'::jsonb),
    'seller_exempt',coalesce((v_state->>'seller_exempt')::boolean,false),
    'new_user_cohort',coalesce((v_state->>'new_user_cohort')::boolean,false),
    'applies_from',v_settings.applies_from
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
begin
  v_state:=public.get_dright_affiliate_level_state(p_user_id);
  return jsonb_build_object(
    'enabled',coalesce((v_state->>'challenge_enabled')::boolean,false),
    'sales',coalesce((v_state->>'sales')::integer,0),
    'current_level_label',v_state->>'current_level_label',
    'current_level_number',coalesce((v_state->>'current_level_number')::integer,0),
    'next_level_label',v_state->>'next_level_label',
    'next_level_number',case when v_state->'next_level_number'='null'::jsonb then null else (v_state->>'next_level_number')::integer end,
    'next_level_total_sales',case when v_state->'next_level_total_sales'='null'::jsonb then null else (v_state->>'next_level_total_sales')::integer end,
    'remaining_sales',coalesce((v_state->>'remaining_sales')::integer,0),
    'progress_percent',coalesce((v_state->>'progress_percent')::integer,0),
    'product_limit',case when v_state->'product_limit'='null'::jsonb then null else (v_state->>'product_limit')::integer end,
    'starter_only',coalesce((v_state->>'starter_only')::boolean,false),
    'max_level',coalesce((v_state->>'max_level')::boolean,false)
  );
end;
$function$;

revoke all on function public.get_public_dright_affiliate_level(uuid) from public;
grant execute on function public.get_public_dright_affiliate_level(uuid) to anon,authenticated;

create or replace function public.can_user_affiliate_product(p_user_id uuid,p_product_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path=public
as $function$
declare
  v_state jsonb;
  v_limit integer;
  v_starter_only boolean:=false;
  v_enforced boolean:=false;
  v_rank integer;
  v_is_starter boolean:=false;
  v_eligible boolean:=false;
begin
  if p_user_id is null or p_product_id is null then return false; end if;

  select
    (p.sku='DRIGHT-STARTER-ACCESS' or coalesce(p.specifications->>'system_product_kind','')='dright_starter_access'),
    (
      coalesce(p.affiliate_commission_percent,p.commission_rate,0)>0
      or p.sku='DRIGHT-STARTER-ACCESS'
      or coalesce(p.specifications->>'system_product_kind','')='dright_starter_access'
    )
  into v_is_starter,v_eligible
  from public.products p
  where p.id=p_product_id
    and p.is_active=true
    and coalesce(p.is_hidden,false)=false
    and p.approval_status='approved';

  if not coalesce(v_eligible,false) then return false; end if;

  v_state:=public.get_dright_affiliate_level_state(p_user_id);
  v_enforced:=coalesce((v_state->>'access_rules_apply')::boolean,false);
  if not v_enforced then return true; end if;

  v_starter_only:=coalesce((v_state->>'starter_only')::boolean,false);
  if v_starter_only then return v_is_starter; end if;

  if v_state->'product_limit'='null'::jsonb then return true; end if;
  v_limit:=greatest(coalesce((v_state->>'product_limit')::integer,0),0);
  if v_limit<=0 then return false; end if;

  with ranked as (
    select p.id,
      row_number() over(
        order by
          case when p.sku='DRIGHT-STARTER-ACCESS' or coalesce(p.specifications->>'system_product_kind','')='dright_starter_access' then 0 else 1 end,
          coalesce(p.total_sales,0) desc,
          greatest(coalesce(p.affiliate_commission_percent,0),coalesce(p.commission_rate,0)) desc,
          p.created_at desc,
          p.id
      )::integer as rn
    from public.products p
    where p.is_active=true
      and coalesce(p.is_hidden,false)=false
      and p.approval_status='approved'
      and (
        coalesce(p.affiliate_commission_percent,p.commission_rate,0)>0
        or p.sku='DRIGHT-STARTER-ACCESS'
        or coalesce(p.specifications->>'system_product_kind','')='dright_starter_access'
      )
  )
  select rn into v_rank from ranked where id=p_product_id;

  return coalesce(v_rank,2147483647)<=v_limit;
end;
$function$;

revoke all on function public.can_user_affiliate_product(uuid,uuid) from public;
grant execute on function public.can_user_affiliate_product(uuid,uuid) to anon,authenticated;

create or replace function public.get_my_affiliate_catalog_access(p_product_ids uuid[] default null)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $function$
declare
  v_uid uuid:=auth.uid();
  v_state jsonb;
  v_accessible uuid[]:='{}'::uuid[];
  v_locked uuid[]:='{}'::uuid[];
  v_eligible uuid[]:='{}'::uuid[];
begin
  if v_uid is null then
    return jsonb_build_object(
      'authenticated',false,
      'accessible_product_ids','[]'::jsonb,
      'locked_product_ids','[]'::jsonb,
      'affiliate_eligible_product_ids','[]'::jsonb
    );
  end if;

  v_state:=public.get_dright_affiliate_level_state(v_uid);

  with requested as (
    select p.id
    from public.products p
    where (p_product_ids is null or p.id=any(p_product_ids))
      and p.is_active=true
      and coalesce(p.is_hidden,false)=false
      and p.approval_status='approved'
      and (
        coalesce(p.affiliate_commission_percent,p.commission_rate,0)>0
        or p.sku='DRIGHT-STARTER-ACCESS'
        or coalesce(p.specifications->>'system_product_kind','')='dright_starter_access'
      )
  )
  select
    coalesce(array_agg(id),'{}'::uuid[])
  into v_eligible
  from requested;

  select coalesce(array_agg(id),'{}'::uuid[])
  into v_accessible
  from unnest(v_eligible) id
  where public.can_user_affiliate_product(v_uid,id);

  select coalesce(array_agg(id),'{}'::uuid[])
  into v_locked
  from unnest(v_eligible) id
  where not public.can_user_affiliate_product(v_uid,id);

  return v_state || jsonb_build_object(
    'authenticated',true,
    'accessible_product_ids',to_jsonb(v_accessible),
    'locked_product_ids',to_jsonb(v_locked),
    'affiliate_eligible_product_ids',to_jsonb(v_eligible)
  );
end;
$function$;

revoke all on function public.get_my_affiliate_catalog_access(uuid[]) from public;
grant execute on function public.get_my_affiliate_catalog_access(uuid[]) to authenticated;

create or replace function public.admin_get_dright_affiliate_levels()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $function$
begin
  if auth.uid() is null or not public.has_dright_permission('subscriptions','manage') then
    raise exception 'Subscription management permission required';
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'level_number',q.level_number,
      'title',q.title,
      'sales_to_next',q.sales_to_next,
      'product_limit',q.product_limit,
      'starter_only',q.starter_only,
      'entry_sales',q.entry_sales,
      'cumulative_after',q.cumulative_after
    ) order by q.level_number),'[]'::jsonb)
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
    ) q
  );
end;
$function$;

revoke all on function public.admin_get_dright_affiliate_levels() from public;
grant execute on function public.admin_get_dright_affiliate_levels() to authenticated;

create or replace function public.admin_update_dright_affiliate_levels(p_levels jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_item jsonb;
  v_level integer;
  v_title text;
  v_sales integer;
  v_limit integer;
  v_starter_only boolean;
  v_seen integer[]:='{}'::integer[];
begin
  if auth.uid() is null or not public.has_dright_permission('subscriptions','manage') then
    raise exception 'Subscription management permission required';
  end if;

  if jsonb_typeof(p_levels)<>'array' or jsonb_array_length(p_levels)<>11 then
    raise exception 'Affiliate level configuration must contain levels 0 through 10';
  end if;

  for v_item in select value from jsonb_array_elements(p_levels)
  loop
    v_level:=(v_item->>'level_number')::integer;
    v_title:=trim(coalesce(v_item->>'title',''));
    v_sales:=greatest(coalesce((v_item->>'sales_to_next')::integer,0),0);
    v_limit:=case
      when v_item ? 'product_limit' and v_item->'product_limit'<>'null'::jsonb
        then (v_item->>'product_limit')::integer
      else null
    end;
    v_starter_only:=coalesce((v_item->>'starter_only')::boolean,false);

    if v_level<0 or v_level>10 or v_level=any(v_seen) then
      raise exception 'Affiliate levels must uniquely contain 0 through 10';
    end if;
    if v_title='' then raise exception 'Every affiliate level requires a title'; end if;
    if v_sales>1000000000 then raise exception 'Sales requirement is too large'; end if;
    if v_limit is not null and (v_limit<1 or v_limit>1000000) then
      raise exception 'Product limit must be between 1 and 1000000, or unlimited';
    end if;
    if v_level=10 then v_sales:=0; end if;
    if v_level=0 then
      v_starter_only:=true;
      v_limit:=1;
    end if;

    v_seen:=array_append(v_seen,v_level);

    insert into public.dright_affiliate_levels(
      level_number,title,sales_to_next,product_limit,starter_only,sort_order,updated_at,updated_by
    )
    values(v_level,v_title,v_sales,v_limit,v_starter_only,v_level,now(),auth.uid())
    on conflict(level_number) do update
    set title=excluded.title,
        sales_to_next=excluded.sales_to_next,
        product_limit=excluded.product_limit,
        starter_only=excluded.starter_only,
        sort_order=excluded.sort_order,
        updated_at=now(),
        updated_by=auth.uid();
  end loop;

  if not (select array_agg(x order by x)=array[0,1,2,3,4,5,6,7,8,9,10] from unnest(v_seen) x) then
    raise exception 'Affiliate levels must contain every level from 0 through 10';
  end if;

  update public.dright_starter_affiliate_challenge_settings s
  set target_sales=(select sales_to_next from public.dright_affiliate_levels where level_number=0),
      base_level_label=(select title from public.dright_affiliate_levels where level_number=0),
      base_level_number=0,
      unlock_label=(select title from public.dright_affiliate_levels where level_number=1),
      unlock_level_number=1,
      updated_at=now(),
      updated_by=auth.uid()
  where singleton=true;

  insert into public.admin_logs(admin_id,action_type,target_type,details)
  values(
    auth.uid(),
    'dright_affiliate_levels_update',
    'dright_affiliate_levels',
    jsonb_build_object('levels',public.admin_get_dright_affiliate_levels())
  );

  return public.admin_get_dright_affiliate_levels();
end;
$function$;

revoke all on function public.admin_update_dright_affiliate_levels(jsonb) from public;
grant execute on function public.admin_update_dright_affiliate_levels(jsonb) to authenticated;

-- Buying/browsing stays unrestricted. Only affiliate attribution is level-gated.
create or replace function public.resolve_tracking_link(p_code text,p_product_id uuid default null)
returns table(
  link_id uuid,owner_id uuid,tracking_code text,product_id uuid,source_type text,source_level text,
  campaign_id uuid,sales_team_id uuid,team_member_id uuid,team_lead_id uuid
)
language sql
security definer
set search_path=public
as $function$
  select rl.id,rl.user_id,rl.unique_code,rl.product_id,rl.source_type,rl.source_level,
         rl.campaign_id,rl.sales_team_id,rl.team_member_id,rl.team_lead_id
  from public.referral_links rl
  where rl.unique_code=p_code
    and (p_product_id is null or rl.product_id=p_product_id or rl.product_id is null)
    and (
      p_product_id is null
      or rl.source_type<>'affiliate'
      or public.can_user_affiliate_product(rl.user_id,p_product_id)
    )
  order by case when p_product_id is not null and rl.product_id=p_product_id then 0 else 1 end
  limit 1;
$function$;

comment on table public.dright_affiliate_levels is
  'Admin-configurable Starter affiliate progression from Level 0 through Level 10. Product limits control affiliate-link access only; buyers can still browse and purchase all public marketplace products.';

commit;