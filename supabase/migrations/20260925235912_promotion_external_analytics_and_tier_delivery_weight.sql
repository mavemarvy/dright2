
-- Promotion delivery ranking and advertiser/admin external analytics.

do $$
declare v_def text;
begin
  select pg_get_functiondef('public.get_promotion_delivery_v2(text,integer)'::regprocedure)
  into v_def;

  if strpos(v_def,'pc.quality_score,pt.tier_rank,pt.reach_multiplier,coalesce(cp.actual_spend,0) placement_spend')=0 then
    v_def:=replace(
      v_def,
      'pc.quality_score,pt.tier_rank,coalesce(cp.actual_spend,0) placement_spend',
      'pc.quality_score,pt.tier_rank,pt.reach_multiplier,coalesce(cp.actual_spend,0) placement_spend'
    );
  end if;

  if strpos(v_def,'greatest(coalesce(c.reach_multiplier,1),0.01)')=0 then
    v_def:=replace(
      v_def,
      '(1 + least(c.tier_rank,3)*.08)',
      'greatest(coalesce(c.reach_multiplier,1),0.01)'
    );
  end if;

  execute v_def;
end $$;

create or replace function public.get_promotion_analytics(p_promotion_id uuid,p_days integer default 30)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_uid uuid:=auth.uid();
  v_is_admin boolean:=false;
  v_campaign public.promotion_campaigns%rowtype;
  v_start timestamptz:=now()-make_interval(days=>greatest(1,least(coalesce(p_days,30),365)));
  v_revenue numeric:=0;
  v_telegram_deliveries bigint:=0;
  v_email_deliveries bigint:=0;
  v_telegram_clicks bigint:=0;
  v_email_clicks bigint:=0;
begin
  select * into v_campaign from public.promotion_campaigns where id=p_promotion_id;
  if not found then raise exception 'Promotion campaign not found'; end if;

  if coalesce(auth.role(),'')<>'service_role' then
    if v_uid is null then raise exception 'Authentication required'; end if;
    select coalesce(u.is_admin,false) into v_is_admin from public.users u where u.id=v_uid;
    if v_campaign.seller_id is distinct from v_uid and not coalesce(v_is_admin,false) then
      raise exception 'Not authorized to view this campaign';
    end if;
  end if;

  select coalesce(sum(cs.sales_revenue),0)
  into v_revenue
  from public.campaign_statistics cs
  where cs.campaign_id=p_promotion_id and cs.stat_date>=v_start::date;

  select count(*)
  into v_telegram_deliveries
  from public.telegram_broadcast_deliveries d
  join public.telegram_broadcast_campaigns b on b.id=d.campaign_id
  where b.source_type='promotion'
    and b.source_id=p_promotion_id::text
    and d.status='sent';

  select count(*)
  into v_email_deliveries
  from public.notification_email_outbox o
  where o.notification_type='promotion_ad'
    and o.metadata->>'promotion_campaign_id'=p_promotion_id::text
    and o.status='sent';

  select coalesce(sum(click_count),0)
  into v_telegram_clicks
  from public.promotion_tracking_links
  where campaign_id=p_promotion_id and placement_code='external_platforms';

  select coalesce(sum(click_count),0)
  into v_email_clicks
  from public.promotion_tracking_links
  where campaign_id=p_promotion_id and placement_code='email';

  return jsonb_build_object(
    'campaign_id',v_campaign.id,
    'status',v_campaign.status,
    'tier',v_campaign.tier_code,
    'media_budget',coalesce(v_campaign.media_budget,v_campaign.budget,0),
    'total_payable',coalesce(v_campaign.total_payable,v_campaign.budget,0),
    'money_spent',coalesce(v_campaign.actual_spend,0),
    'remaining_budget',greatest(0,coalesce(v_campaign.media_budget,v_campaign.budget,0)-coalesce(v_campaign.actual_spend,0)),
    'impressions',coalesce(v_campaign.actual_impressions,0),
    'reach',coalesce(v_campaign.actual_reach,0),
    'clicks',coalesce(v_campaign.actual_clicks,0),
    'conversions',coalesce(v_campaign.actual_conversions,0),
    'ctr',case when coalesce(v_campaign.actual_impressions,0)>0 then round(v_campaign.actual_clicks::numeric/v_campaign.actual_impressions*100,2) else 0 end,
    'cpc',case when coalesce(v_campaign.actual_clicks,0)>0 then round(v_campaign.actual_spend/v_campaign.actual_clicks,2) else 0 end,
    'cpa',case when coalesce(v_campaign.actual_conversions,0)>0 then round(v_campaign.actual_spend/v_campaign.actual_conversions,2) else 0 end,
    'revenue_generated',v_revenue,
    'roas',case when coalesce(v_campaign.actual_spend,0)>0 then round(v_revenue/v_campaign.actual_spend,2) else 0 end,
    'external_distribution',jsonb_build_object(
      'telegram_deliveries',v_telegram_deliveries,
      'telegram_clicks',v_telegram_clicks,
      'telegram_native_view_count_available',false,
      'email_deliveries',v_email_deliveries,
      'email_clicks',v_email_clicks
    ),
    'assets',coalesce((
      select jsonb_agg(jsonb_build_object(
        'campaign_asset_id',ca.id,'asset_type',ca.asset_type,'asset_id',ca.asset_id,
        'title',ca.title_snapshot,'allocation_amount',ca.allocation_amount,
        'spend',ca.actual_spend,'impressions',ca.actual_impressions,'clicks',ca.actual_clicks,'conversions',ca.actual_conversions
      ) order by ca.sort_order)
      from public.campaign_assets ca where ca.campaign_id=p_promotion_id
    ),'[]'::jsonb),
    'placements',coalesce((
      select jsonb_agg(jsonb_build_object(
        'placement',cp.placement_code,'tier',cp.tier_code,
        'placement_fee',cp.placement_fee,'placement_fee_percent',cp.placement_fee_percent,
        'spend',cp.actual_spend,'impressions',cp.actual_impressions,'clicks',cp.actual_clicks,'conversions',cp.actual_conversions
      ) order by ap.sort_order)
      from public.campaign_placements cp
      left join public.ad_placements ap on ap.code=cp.placement_code
      where cp.campaign_id=p_promotion_id
    ),'[]'::jsonb),
    'daily_breakdown',coalesce((
      select jsonb_agg(jsonb_build_object(
        'date',cs.stat_date,'impressions',cs.impressions,'clicks',cs.clicks,
        'conversions',cs.conversions,'reach',cs.reach,'spend',cs.spend,'revenue',cs.sales_revenue
      ) order by cs.stat_date)
      from public.campaign_statistics cs
      where cs.campaign_id=p_promotion_id and cs.stat_date>=v_start::date
    ),'[]'::jsonb)
  );
end $$;
