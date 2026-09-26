begin;

-- Make the level system the default for affiliate actions, including already-approved
-- affiliates that predate the Starter cohort. Admins can still opt out or re-enable
-- Seller/Vendor exemption from the Starter settings panel.
update public.dright_starter_affiliate_challenge_settings
set seller_profile_exempt=false,
    apply_levels_to_existing_affiliates=true,
    restrict_marketplace_until_complete=true,
    updated_at=now()
where singleton=true;

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
  v_marketer_status text:=null;
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

    select u.created_at,u.marketer_status into v_user_created,v_marketer_status
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

    v_has_affiliate:=v_has_affiliate
      or coalesce(v_marketer_status,'none') in ('approved','active');

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



commit;