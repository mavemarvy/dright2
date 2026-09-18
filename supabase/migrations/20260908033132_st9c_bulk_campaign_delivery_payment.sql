-- DRIGHT2 ST-9C: atomic bulk campaign creation, delivery rotation/frequency caps, and total-payable payment authority.

create or replace function public.create_universal_promotion_campaign(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid:=auth.uid();
  v_tier text:=lower(coalesce(p_payload->>'tier','normal'));
  v_goal text:=coalesce(p_payload->>'goal','more_views');
  v_audience text:=coalesce(p_payload->>'audience_type','everyone');
  v_owner_profile text:=lower(coalesce(p_payload->>'owner_profile_type','seller'));
  v_pacing text;
  v_budget numeric:=coalesce(nullif(p_payload->>'budget','')::numeric,0);
  v_duration integer:=coalesce(nullif(p_payload->>'duration_days','')::integer,1);
  v_daily numeric:=nullif(p_payload->>'daily_budget','')::numeric;
  v_assets jsonb:=coalesce(p_payload->'assets','[]'::jsonb);
  v_placements text[];
  v_count integer;
  v_max integer;
  v_primary jsonb;
  v_primary_type text;
  v_primary_id uuid;
  v_campaign public.promotion_campaigns%rowtype;
  v_asset jsonb;
  v_idx bigint;
  v_alloc numeric;
  v_alloc_sum numeric:=0;
  v_supplied integer;
  v_title text;
  v_subtitle text;
  v_image text;
  v_destination text;
  v_asset_type text;
  v_asset_id uuid;
  v_placement text;
  v_fee numeric;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select max_bulk_assets,default_pacing into v_max,v_pacing from public.promotion_distribution_settings where singleton=true;
  if p_payload ? 'pacing_mode' then v_pacing:=lower(coalesce(nullif(p_payload->>'pacing_mode',''),v_pacing)); end if;
  if jsonb_typeof(v_assets)<>'array' then raise exception 'Campaign assets must be an array'; end if;
  v_count:=jsonb_array_length(v_assets);
  if v_count<1 or v_count>coalesce(v_max,20) then raise exception 'Campaign asset count is outside configured bulk limits'; end if;
  if v_budget<=0 then raise exception 'Promotion budget must be greater than zero'; end if;
  if v_duration<1 or v_duration>90 then raise exception 'Promotion duration must be between 1 and 90 days'; end if;

  select coalesce(array_agg(distinct lower(value) order by lower(value)),array[]::text[])
  into v_placements
  from jsonb_array_elements_text(coalesce(p_payload->'placements','[]'::jsonb));
  if cardinality(v_placements)=0 then raise exception 'At least one promotion placement is required'; end if;

  v_primary:=v_assets->0;
  v_primary_type:=lower(coalesce(v_primary->>'asset_type',''));
  v_primary_id:=(v_primary->>'asset_id')::uuid;

  for v_asset,v_idx in select value,ordinality from jsonb_array_elements(v_assets) with ordinality loop
    v_asset_type:=lower(coalesce(v_asset->>'asset_type',''));
    v_asset_id:=(v_asset->>'asset_id')::uuid;
    if not public.promotion_asset_is_owned(v_uid,v_asset_type,v_asset_id) then
      raise exception 'Campaign contains an asset the authenticated user cannot promote';
    end if;
    if exists(
      select 1
      from unnest(v_placements) p(code)
      left join public.ad_placements ap on ap.code=p.code
      left join public.promotion_tier_placements ptp on ptp.tier_code=v_tier and ptp.placement_code=p.code and ptp.is_included=true
      where ap.code is null or ap.enabled=false or ptp.placement_code is null or not(v_asset_type=any(ap.supported_asset_types))
    ) then raise exception 'A selected placement does not support one or more selected asset types'; end if;
  end loop;

  select count(*) into v_supplied
  from jsonb_array_elements(v_assets) x
  where nullif(x->>'allocation_amount','') is not null;
  if v_supplied not in(0,v_count) then raise exception 'Provide allocation for every asset or use equal allocation'; end if;
  if v_supplied=v_count then
    select coalesce(sum((x->>'allocation_amount')::numeric),0) into v_alloc_sum from jsonb_array_elements(v_assets) x;
    if abs(v_alloc_sum-v_budget)>0.01 then raise exception 'Asset allocations must equal the campaign media budget'; end if;
  end if;

  insert into public.promotion_campaigns(
    seller_id,listing_id,listing_type,goal,audience_type,audience_country,audience_state,audience_city,audience_category,audience_interests,audience_followers_only,
    budget,media_budget,duration_days,placements,tier_code,owner_profile_type,pacing_mode,daily_budget,allow_comments,status,payment_status
  ) values(
    v_uid,v_primary_id,v_primary_type,v_goal,v_audience,
    nullif(p_payload->>'audience_country',''),nullif(p_payload->>'audience_state',''),nullif(p_payload->>'audience_city',''),nullif(p_payload->>'audience_category',''),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'audience_interests','[]'::jsonb))),array[]::text[]),
    coalesce(nullif(p_payload->>'audience_followers_only','')::boolean,false),
    v_budget,v_budget,v_duration,v_placements,v_tier,v_owner_profile,v_pacing,v_daily,coalesce(nullif(p_payload->>'allow_comments','')::boolean,true),'pending','pending'
  ) returning * into v_campaign;

  v_alloc_sum:=0;
  for v_asset,v_idx in select value,ordinality from jsonb_array_elements(v_assets) with ordinality loop
    v_asset_type:=lower(v_asset->>'asset_type');
    v_asset_id:=(v_asset->>'asset_id')::uuid;
    if v_supplied=v_count then
      v_alloc:=(v_asset->>'allocation_amount')::numeric;
    elsif v_idx=v_count then
      v_alloc:=round(v_budget-v_alloc_sum,2);
    else
      v_alloc:=round(v_budget/v_count,2);
    end if;
    v_alloc_sum:=v_alloc_sum+v_alloc;
    v_title:=null; v_subtitle:=null; v_image:=null; v_destination:=null;
    if v_asset_type in('product','service','course') then
      select p.name,p.category,p.image_url,'/product/'||p.id::text into v_title,v_subtitle,v_image,v_destination from public.products p where p.id=v_asset_id;
    elsif v_asset_type='job' then
      select j.title,j.company_name,null,'/jobs?job='||j.id::text into v_title,v_subtitle,v_image,v_destination from public.jobs j where j.id=v_asset_id;
    elsif v_asset_type='campaign' then
      select c.name,c.task_type,null,'/creator-campaigns?campaign='||c.id::text into v_title,v_subtitle,v_image,v_destination from public.cc_campaigns c where c.id=v_asset_id;
    elsif v_asset_type='store' then
      select coalesce(nullif(u.store_title,''),coalesce(u.full_name,'DRIGHT')||'''s Store'),'Store',u.store_banner_url,'/shop/'||u.id::text into v_title,v_subtitle,v_image,v_destination from public.users u where u.id=v_asset_id;
    else
      select coalesce(u.full_name,u.username,'Professional profile'),coalesce(u.profession,'Professional profile'),u.avatar_url,'/profile' into v_title,v_subtitle,v_image,v_destination from public.users u where u.id=v_asset_id;
    end if;
    insert into public.campaign_assets(campaign_id,asset_type,asset_id,owner_id,allocation_amount,allocation_percent,title_snapshot,image_snapshot,destination_snapshot,sort_order)
    values(v_campaign.id,v_asset_type,v_asset_id,v_uid,v_alloc,round((v_alloc/v_budget)*100,4),v_title,v_image,v_destination,v_idx::integer-1);
  end loop;

  foreach v_placement in array v_placements loop
    select coalesce(ptp.surcharge_override,ap.surcharge)
    into v_fee
    from public.ad_placements ap
    join public.promotion_tier_placements ptp on ptp.placement_code=ap.code and ptp.tier_code=v_tier and ptp.is_included=true
    where ap.code=v_placement and ap.enabled=true;
    if v_fee is null then raise exception 'Selected placement is not available for this tier'; end if;
    insert into public.campaign_placements(campaign_id,placement_code,tier_code,placement_fee,pricing_snapshot)
    values(v_campaign.id,v_placement,v_tier,v_fee,jsonb_build_object('placement_fee',v_fee,'tier_code',v_tier,'captured_at',now()));
  end loop;

  return jsonb_build_object(
    'campaign_id',v_campaign.id,
    'status',v_campaign.status,
    'payment_status',v_campaign.payment_status,
    'tier',v_campaign.tier_code,
    'media_budget',v_campaign.media_budget,
    'placement_fee_total',v_campaign.placement_fee_total,
    'platform_fee',v_campaign.platform_fee,
    'tax_amount',v_campaign.tax_amount,
    'total_payable',v_campaign.total_payable,
    'currency',v_campaign.billing_currency
  );
end $$;
revoke all on function public.create_universal_promotion_campaign(jsonb) from public,anon;
grant execute on function public.create_universal_promotion_campaign(jsonb) to authenticated;

create or replace function public.get_sponsored_listings(p_placement text,p_limit integer default 5)
returns table(listing_id uuid,campaign_id uuid,listing_type text,goal text)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_place text:=lower(btrim(coalesce(p_placement,'marketplace')));
  v_limit integer:=greatest(1,least(coalesce(p_limit,5),50));
  v_viewer uuid:=auth.uid();
  v_cap integer;
  v_window integer;
  v_min_quality numeric;
begin
  select ap.frequency_cap,ap.frequency_window_hours into v_cap,v_window from public.ad_placements ap where ap.code=v_place and ap.enabled=true;
  if v_cap is null then return; end if;
  select minimum_quality_score into v_min_quality from public.promotion_distribution_settings where singleton=true;
  return query
  select ca.asset_id,pc.id,ca.asset_type,pc.goal
  from public.promotion_campaigns pc
  join public.promotion_tiers pt on pt.code=pc.tier_code and pt.is_enabled=true
  join public.campaign_placements cp on cp.campaign_id=pc.id and cp.placement_code=v_place and cp.status='enabled'
  join public.ad_placements ap on ap.code=cp.placement_code and ap.enabled=true
  join public.campaign_assets ca on ca.campaign_id=pc.id and ca.status='eligible' and ca.asset_type=any(ap.supported_asset_types)
  where pc.status='active' and pc.payment_status='paid' and pc.payment_verified_at is not null
    and pc.start_date<=now() and pc.end_date>now()
    and coalesce(pc.actual_spend,0)<pc.media_budget
    and pc.quality_score>=coalesce(v_min_quality,0)
    and public.promotion_viewer_is_eligible(pc.id,v_viewer)
    and (v_viewer is null or not exists(select 1 from public.promotion_feedback pf where pf.user_id=v_viewer and pf.campaign_id=pc.id and pf.feedback_type in('hide','not_relevant')))
    and (v_viewer is null or (select count(*) from public.sponsored_listing_logs sl where sl.user_id=v_viewer and sl.campaign_id=pc.id and sl.placement=v_place and sl.created_at>=now()-make_interval(hours=>v_window))<v_cap)
  order by pc.quality_score desc,pt.tier_rank desc,(coalesce(cp.actual_spend,0)/greatest(pc.media_budget,0.01)) asc,md5(pc.id::text||date_trunc('hour',now())::text||coalesce(v_viewer::text,''))
  limit v_limit;
end $$;
grant execute on function public.get_sponsored_listings(text,integer) to anon,authenticated;

create or replace function public.get_promotion_delivery_v2(p_placement text,p_limit integer default 5)
returns table(campaign_id uuid,campaign_asset_id uuid,asset_type text,asset_id uuid,tier_code text,goal text,placement text,title text,description text,image_url text,cta_label text,destination text,allow_comments boolean,seller_id uuid,sponsored_label text)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_place text:=lower(btrim(coalesce(p_placement,'marketplace')));
  v_limit integer:=greatest(1,least(coalesce(p_limit,5),20));
  v_viewer uuid:=auth.uid();
  v_cap integer;
  v_window integer;
  v_min_quality numeric;
begin
  select ap.frequency_cap,ap.frequency_window_hours into v_cap,v_window from public.ad_placements ap where ap.code=v_place and ap.enabled=true;
  if v_cap is null then return; end if;
  select minimum_quality_score into v_min_quality from public.promotion_distribution_settings where singleton=true;
  return query
  select pc.id,ca.id,ca.asset_type,ca.asset_id,pc.tier_code,pc.goal,v_place,
         coalesce(cr.headline,ca.title_snapshot),cr.description,coalesce(cr.media_url,ca.image_snapshot),coalesce(cr.cta_label,'Learn More'),ca.destination_snapshot,pc.allow_comments,pc.seller_id,'Sponsored'::text
  from public.promotion_campaigns pc
  join public.promotion_tiers pt on pt.code=pc.tier_code and pt.is_enabled=true
  join public.campaign_placements cp on cp.campaign_id=pc.id and cp.placement_code=v_place and cp.status='enabled'
  join public.ad_placements ap on ap.code=cp.placement_code and ap.enabled=true
  join public.campaign_assets ca on ca.campaign_id=pc.id and ca.status='eligible' and ca.asset_type=any(ap.supported_asset_types)
  left join lateral(
    select c.headline,c.description,c.media_url,c.cta_label
    from public.promotion_creatives c
    where c.campaign_id=pc.id and (c.campaign_asset_id=ca.id or c.campaign_asset_id is null) and c.moderation_status='approved'
    order by (c.campaign_asset_id=ca.id) desc,c.created_at desc
    limit 1
  ) cr on true
  where pc.status='active' and pc.payment_status='paid' and pc.payment_verified_at is not null
    and pc.start_date<=now() and pc.end_date>now()
    and coalesce(pc.actual_spend,0)<pc.media_budget
    and pc.quality_score>=coalesce(v_min_quality,0)
    and public.promotion_viewer_is_eligible(pc.id,v_viewer)
    and (v_viewer is null or not exists(select 1 from public.promotion_feedback pf where pf.user_id=v_viewer and pf.campaign_id=pc.id and pf.feedback_type in('hide','not_relevant')))
    and (v_viewer is null or (select count(*) from public.sponsored_listing_logs sl where sl.user_id=v_viewer and sl.campaign_id=pc.id and sl.placement=v_place and sl.created_at>=now()-make_interval(hours=>v_window))<v_cap)
  order by pc.quality_score desc,pt.tier_rank desc,(coalesce(cp.actual_spend,0)/greatest(pc.media_budget,0.01)) asc,md5(pc.id::text||date_trunc('hour',now())::text||coalesce(v_viewer::text,''))
  limit v_limit;
end $$;
grant execute on function public.get_promotion_delivery_v2(text,integer) to anon,authenticated;

-- Reconcile payment verification to total payable while preserving budget as media spend.
do $payment$
declare vdef text;
begin
  select pg_get_functiondef(p.oid) into vdef
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='process_verified_promotion_payment' limit 1;
  if vdef is not null then
    vdef:=replace(vdef,
      'abs(coalesce(v_campaign.budget, 0) - p_amount) > 0.01',
      'abs(coalesce(v_campaign.total_payable, v_campaign.budget, 0) - p_amount) > 0.01');
    vdef:=replace(vdef,'Verified amount does not match campaign budget','Verified amount does not match campaign total payable');
    execute vdef;
  end if;

  select pg_get_functiondef(p.oid) into vdef
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='get_financial_reconciliation_health' limit 1;
  if vdef is not null then
    vdef:=replace(vdef,'COALESCE(pc.budget,0)','COALESCE(pc.total_payable,pc.budget,0)');
    execute vdef;
  end if;
end $payment$;
