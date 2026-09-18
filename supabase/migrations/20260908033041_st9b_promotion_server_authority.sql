-- DRIGHT2 ST-9B1: server-authoritative promotion ownership, placement and financial authority.

alter table public.campaign_assets add column if not exists image_snapshot text;

create or replace function public.promotion_asset_is_owned(p_user_id uuid, p_asset_type text, p_asset_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path=public
as $$
declare v_type text:=lower(btrim(coalesce(p_asset_type,'')));
begin
  if p_user_id is null or p_asset_id is null then return false; end if;
  if v_type='product' then
    return exists(select 1 from public.products p where p.id=p_asset_id and p.uploaded_by=p_user_id and coalesce(upper(p.product_type),'DIGITAL') not in ('SERVICE','COURSE'));
  elsif v_type='service' then
    return exists(select 1 from public.products p where p.id=p_asset_id and p.uploaded_by=p_user_id and upper(coalesce(p.product_type,''))='SERVICE');
  elsif v_type='course' then
    return exists(select 1 from public.products p where p.id=p_asset_id and p.uploaded_by=p_user_id and upper(coalesce(p.product_type,''))='COURSE');
  elsif v_type='job' then
    return exists(select 1 from public.jobs j where j.id=p_asset_id and j.employer_id=p_user_id and lower(coalesce(j.status,''))='active');
  elsif v_type='campaign' then
    return exists(select 1 from public.cc_campaigns c where c.id=p_asset_id and c.creator_id=p_user_id and lower(coalesce(c.status,''))='active');
  elsif v_type='store' then
    return p_asset_id=p_user_id and exists(select 1 from public.users u where u.id=p_user_id and nullif(btrim(coalesce(u.store_title,'')),'') is not null);
  elsif v_type='profile' then
    return p_asset_id=p_user_id and exists(select 1 from public.users u where u.id=p_user_id and coalesce(u.account_status,'active')='active');
  elsif v_type='sales_team' then
    return p_asset_id=p_user_id and exists(select 1 from public.users u where u.id=p_user_id and coalesce(u.account_status,'active')='active' and (coalesce(u.marketer_status,'')='approved' or coalesce(u.advertiser_status,'')='approved'));
  end if;
  return false;
end $$;
revoke all on function public.promotion_asset_is_owned(uuid,text,uuid) from public,anon;
grant execute on function public.promotion_asset_is_owned(uuid,text,uuid) to authenticated,service_role;

create or replace function public.get_promotable_assets()
returns table(asset_type text, asset_id uuid, title text, subtitle text, image_url text, status text, destination text, public_id text)
language sql
stable
security definer
set search_path=public
as $$
  with me as (select auth.uid() id)
  select case upper(coalesce(p.product_type,'DIGITAL')) when 'SERVICE' then 'service' when 'COURSE' then 'course' else 'product' end,
         p.id,p.name,p.category,p.image_url,
         case when p.is_active and not coalesce(p.is_hidden,false) and p.approval_status='approved' then 'eligible' else 'not_eligible' end,
         '/product/'||p.id::text,p.id::text
  from public.products p,me where p.uploaded_by=me.id
  union all
  select 'job',j.id,j.title,j.company_name,null,
         case when lower(coalesce(j.status,''))='active' then 'eligible' else 'not_eligible' end,
         '/jobs?job='||j.id::text,j.id::text
  from public.jobs j,me where j.employer_id=me.id
  union all
  select 'campaign',c.id,c.name,c.task_type,null,
         case when lower(coalesce(c.status,''))='active' then 'eligible' else 'not_eligible' end,
         '/creator-campaigns?campaign='||c.id::text,c.id::text
  from public.cc_campaigns c,me where c.creator_id=me.id
  union all
  select 'store',u.id,coalesce(nullif(u.store_title,''),coalesce(u.full_name,'DRIGHT')||'''s Store'),'Store',u.store_banner_url,
         case when nullif(btrim(coalesce(u.store_title,'')),'') is not null then 'eligible' else 'not_eligible' end,
         '/shop/'||u.id::text,u.id::text
  from public.users u,me where u.id=me.id
  union all
  select 'profile',u.id,coalesce(u.full_name,u.username,'Professional profile'),coalesce(u.profession,'Professional profile'),u.avatar_url,'eligible','/profile',u.id::text
  from public.users u,me where u.id=me.id
  union all
  select 'sales_team',u.id,coalesce(u.full_name,u.username,'Sales Team professional'),
         case when u.marketer_status='approved' then 'Marketer '||coalesce(u.marketer_level::text,'') else 'Advertiser '||coalesce(u.advertiser_grade,'') end,
         u.avatar_url,'eligible','/profile',u.id::text
  from public.users u,me where u.id=me.id and (u.marketer_status='approved' or u.advertiser_status='approved');
$$;
revoke all on function public.get_promotable_assets() from public,anon;
grant execute on function public.get_promotable_assets() to authenticated;

-- Expand only the campaign-goal allow list in the existing hardened ST-5 guard.
do $migration$
declare vdef text;
begin
  select pg_get_functiondef(p.oid) into vdef
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='guard_promotion_campaign_write' limit 1;
  if vdef is not null then
    vdef:=replace(
      vdef,
      $old$IF NEW.goal NOT IN ('more_views','more_clicks','more_sales','more_messages','more_job_applications','more_course_enrollments') THEN$old$,
      $new$IF NEW.goal NOT IN ('more_views','more_clicks','more_sales','more_messages','more_job_applications','more_course_enrollments','more_listing_visits','more_store_visits','more_profile_visits','more_community_visits','more_conversions','more_leads','more_qualified_applicants','more_service_inquiries','more_campaign_participation','more_hiring_requests') THEN$new$
    );
    execute vdef;
  end if;
end $migration$;

create or replace function public.guard_promotion_campaign_placements()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_role text:=coalesce(auth.role(),'');
  v_asset_type text:=lower(coalesce(new.listing_type,'product'));
begin
  new.placements:=array(select distinct lower(btrim(x)) from unnest(coalesce(new.placements,array[]::text[])) x where btrim(x)<>'' order by 1);
  if cardinality(new.placements)=0 then raise exception 'At least one promotion placement is required'; end if;
  if not exists(select 1 from public.promotion_tiers t where t.code=lower(coalesce(new.tier_code,'normal')) and t.is_enabled=true) then
    raise exception 'Promotion tier is unavailable';
  end if;
  if exists(
    select 1 from unnest(new.placements) p(code)
    left join public.ad_placements ap on ap.code=p.code
    left join public.promotion_tier_placements ptp on ptp.tier_code=lower(coalesce(new.tier_code,'normal')) and ptp.placement_code=p.code and ptp.is_included=true
    where ap.code is null or ap.enabled=false or ptp.placement_code is null or not (v_asset_type=any(ap.supported_asset_types))
  ) then raise exception 'One or more placements are unavailable for this tier or asset type'; end if;
  if tg_op='UPDATE' and new.placements is distinct from old.placements and v_role<>'service_role' and not(old.status='pending' and old.payment_status='pending') then
    raise exception 'Promotion placements can only be edited before payment';
  end if;
  return new;
end $$;

create or replace function public.universal_promotion_financial_authority()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_role text:=coalesce(auth.role(),'');
  v_is_admin boolean:=false;
  v_tier public.promotion_tiers%rowtype;
  v_settings public.promotion_distribution_settings%rowtype;
  v_pricing public.promotion_pricing%rowtype;
  v_placement_fees numeric:=0;
  v_base_cpm numeric;
  v_subtotal numeric;
begin
  if auth.uid() is not null then
    select coalesce(u.is_admin,false) into v_is_admin from public.users u where u.id=auth.uid();
  end if;

  if tg_op='UPDATE' and v_role<>'service_role' then
    if new.tier_code is distinct from old.tier_code and not(old.status='pending' and old.payment_status='pending') then raise exception 'Promotion tier can only be changed before payment'; end if;
    if new.owner_profile_type is distinct from old.owner_profile_type and not(old.status='pending' and old.payment_status='pending') then raise exception 'Promotion owner profile can only be changed before payment'; end if;
    new.media_budget:=old.media_budget;
    new.placement_fee_total:=old.placement_fee_total;
    new.platform_fee:=old.platform_fee;
    new.tax_amount:=old.tax_amount;
    new.total_payable:=old.total_payable;
    if not v_is_admin then
      new.quality_score:=old.quality_score;
      new.moderation_status:=old.moderation_status;
    end if;
  end if;

  new.tier_code:=lower(coalesce(new.tier_code,'normal'));
  select * into v_tier from public.promotion_tiers where code=new.tier_code and is_enabled=true;
  if not found then raise exception 'Promotion tier is unavailable'; end if;
  select * into v_settings from public.promotion_distribution_settings where singleton=true;
  select * into v_pricing from public.promotion_pricing where is_singleton=true order by updated_at desc limit 1;
  if not found then raise exception 'Promotion pricing is not configured'; end if;

  if tg_op='INSERT' and not public.promotion_asset_is_owned(new.seller_id,lower(new.listing_type),new.listing_id) then
    raise exception 'Promotion asset does not belong to campaign owner or is not eligible';
  end if;

  if tg_op='INSERT' or (tg_op='UPDATE' and (new.tier_code is distinct from old.tier_code or new.placements is distinct from old.placements)) then
    new.media_budget:=new.budget;
    select coalesce(sum(coalesce(ptp.surcharge_override,ap.surcharge)),0) into v_placement_fees
    from unnest(new.placements) p(code)
    join public.ad_placements ap on ap.code=p.code and ap.enabled=true
    join public.promotion_tier_placements ptp on ptp.tier_code=new.tier_code and ptp.placement_code=p.code and ptp.is_included=true;
    new.placement_fee_total:=round(v_placement_fees,2);
    new.platform_fee:=round((new.media_budget+new.placement_fee_total)*coalesce(v_settings.platform_fee_percent,0)/100,2);
    v_subtotal:=new.media_budget+new.placement_fee_total+new.platform_fee;
    new.tax_amount:=round(v_subtotal*coalesce(v_settings.tax_percent,0)/100,2);
    new.total_payable:=round(v_subtotal+new.tax_amount,2);
    v_base_cpm:=coalesce(v_pricing.cost_per_1000_impressions,0)*v_tier.pricing_multiplier;
    if v_base_cpm<=0 then raise exception 'Promotion CPM must be greater than zero'; end if;
    new.estimated_impressions:=floor((new.media_budget/v_base_cpm)*1000)::integer;
    new.estimated_clicks:=floor(new.estimated_impressions*greatest(0,coalesce(v_pricing.default_ctr,0)))::integer;
    new.estimated_reach:=least(new.estimated_impressions,floor(new.estimated_impressions*0.70*v_tier.reach_multiplier)::integer);
    new.estimated_conversions:=floor(new.estimated_clicks*greatest(0,coalesce(v_pricing.default_conversion_rate,0)))::integer;
    new.pricing_snapshot:=coalesce(new.pricing_snapshot,'{}'::jsonb)||jsonb_build_object(
      'tier_code',new.tier_code,
      'tier_pricing_multiplier',v_tier.pricing_multiplier,
      'tier_reach_multiplier',v_tier.reach_multiplier,
      'media_budget',new.media_budget,
      'placement_fee_total',new.placement_fee_total,
      'platform_fee',new.platform_fee,
      'tax_amount',new.tax_amount,
      'total_payable',new.total_payable,
      'platform_fee_percent',coalesce(v_settings.platform_fee_percent,0),
      'tax_percent',coalesce(v_settings.tax_percent,0),
      'captured_at',now()
    );
  end if;

  new.pacing_mode:=lower(coalesce(nullif(new.pacing_mode,''),coalesce(v_settings.default_pacing,'even')));
  if new.pacing_mode not in('even','accelerated') then raise exception 'Unsupported promotion pacing mode'; end if;
  if new.daily_budget is null then new.daily_budget:=round(new.media_budget/greatest(new.duration_days,1),2); end if;
  if new.daily_budget<=0 or new.daily_budget>new.media_budget then raise exception 'Daily promotion budget is invalid'; end if;
  return new;
end $$;

drop trigger if exists trg_zz_universal_promotion_authority on public.promotion_campaigns;
create trigger trg_zz_universal_promotion_authority before insert or update on public.promotion_campaigns
for each row execute function public.universal_promotion_financial_authority();
revoke all on function public.universal_promotion_financial_authority() from public,anon,authenticated;

update public.campaign_assets ca
set title_snapshot=p.name,image_snapshot=p.image_url,destination_snapshot='/product/'||p.id::text
from public.products p
where ca.asset_id=p.id and ca.asset_type in('product','service','course') and (ca.title_snapshot is null or ca.destination_snapshot is null);
