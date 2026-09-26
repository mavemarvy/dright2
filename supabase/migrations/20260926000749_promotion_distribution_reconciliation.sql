-- Final promotion distribution reconciliation.
-- Separates delivery strength from budget pace while keeping media budget server-authoritative.

alter table public.promotion_tiers
  add column if not exists spend_pace_multiplier numeric(10,4) not null default 1.0000;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='promotion_tiers_spend_pace_multiplier_check'
      and conrelid='public.promotion_tiers'::regclass
  ) then
    alter table public.promotion_tiers
      add constraint promotion_tiers_spend_pace_multiplier_check
      check (spend_pace_multiplier > 0 and spend_pace_multiplier <= 1000);
  end if;
end $$;

update public.promotion_tiers
set name=case code when 'plus' then 'Premium Ads' else name end,
    pricing_multiplier=1.0000,
    reach_multiplier=case code
      when 'normal' then 1.0000 when 'plus' then 5.0000 when 'platinum' then 25.0000
      else reach_multiplier end,
    spend_pace_multiplier=case code
      when 'normal' then 1.0000 when 'plus' then 5.0000 when 'platinum' then 25.0000
      else spend_pace_multiplier end,
    updated_at=now()
where code in ('normal','plus','platinum');

alter table public.telegram_broadcast_settings
  add column if not exists recommendation_broadcasts_enabled boolean not null default true;

update public.telegram_broadcast_settings
set recommendation_broadcasts_enabled=true
where singleton=true and recommendation_broadcasts_enabled is distinct from true;

create index if not exists promotion_tracking_links_campaign_asset_id_idx
  on public.promotion_tracking_links(campaign_asset_id);
create index if not exists promotion_tracking_links_user_id_idx
  on public.promotion_tracking_links(user_id);

drop policy if exists "Users read own promotion email subscription" on public.promotion_email_subscriptions;
create policy "Users read own promotion email subscription"
on public.promotion_email_subscriptions for select to authenticated
using ((select auth.uid())=user_id);

drop policy if exists "Users create own promotion email subscription" on public.promotion_email_subscriptions;
create policy "Users create own promotion email subscription"
on public.promotion_email_subscriptions for insert to authenticated
with check ((select auth.uid())=user_id);

drop policy if exists "Users update own promotion email subscription" on public.promotion_email_subscriptions;
create policy "Users update own promotion email subscription"
on public.promotion_email_subscriptions for update to authenticated
using ((select auth.uid())=user_id)
with check ((select auth.uid())=user_id);

drop policy if exists "Campaign owners and admins read promotion tracking links" on public.promotion_tracking_links;
create policy "Campaign owners and admins read promotion tracking links"
on public.promotion_tracking_links for select to authenticated
using (
  exists(
    select 1 from public.promotion_campaigns pc
    where pc.id=campaign_id
      and (pc.seller_id=(select auth.uid()) or (select public.is_admin_user()))
  )
);

drop policy if exists "Admins read notification email promotion outbox" on public.notification_email_outbox;
create policy "Admins read notification email promotion outbox"
on public.notification_email_outbox for select to authenticated
using (
  coalesce((select auth.jwt())->>'is_anonymous','false')<>'true'
  and (select public.is_admin_user())
);
grant select on public.notification_email_outbox to authenticated;

-- Add reach to estimated inventory and spend pace to the default daily budget.
do $$
declare v_def text;
begin
  select pg_get_functiondef('public.universal_promotion_financial_authority()'::regprocedure)
  into v_def;

  if strpos(v_def,'*greatest(coalesce(v_tier.reach_multiplier,1),0.01)')=0 then
    v_def:=replace(
      v_def,
      'new.estimated_impressions:=floor((new.media_budget/v_base_cpm)*1000)::integer;',
      'new.estimated_impressions:=floor((new.media_budget/v_base_cpm)*1000*greatest(coalesce(v_tier.reach_multiplier,1),0.01))::integer;'
    );
  end if;

  if strpos(v_def,'''tier_spend_pace_multiplier''')=0 then
    v_def:=replace(
      v_def,
      '''tier_reach_multiplier'',v_tier.reach_multiplier,',
      '''tier_reach_multiplier'',v_tier.reach_multiplier,'||
      chr(10)||'      ''tier_spend_pace_multiplier'',v_tier.spend_pace_multiplier,'
    );
  end if;

  v_def:=replace(
    v_def,
    'if new.daily_budget is null then new.daily_budget:=round(new.media_budget/greatest(new.duration_days,1),2); end if;',
    'if new.daily_budget is null then new.daily_budget:=least(new.media_budget,greatest(0.01,round((new.media_budget/greatest(new.duration_days,1))*greatest(coalesce(v_tier.spend_pace_multiplier,1),0.01),2))); end if;'
  );
  execute v_def;
end $$;

-- Stop delivery after the campaign reaches its pace-adjusted daily budget.
do $$
declare v_def text;
begin
  select pg_get_functiondef('public.get_promotion_delivery_v2(text,integer)'::regprocedure)
  into v_def;
  if strpos(v_def,'cs.stat_date=current_date')=0 then
    v_def:=replace(
      v_def,
      'and coalesce(pc.actual_spend,0)<pc.media_budget',
      'and coalesce(pc.actual_spend,0)<pc.media_budget'||
      chr(10)||
      '      and coalesce((select cs.spend from public.campaign_statistics cs where cs.campaign_id=pc.id and cs.stat_date=current_date),0) < coalesce(pc.daily_budget,pc.media_budget)'
    );
  end if;
  execute v_def;
end $$;

create or replace function public.admin_update_promotion_tier_pacing(
  p_code text,p_spend_pace_multiplier numeric
)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare v_row public.promotion_tiers%rowtype;
begin
  if not public.is_admin_user() then raise exception 'Admin access required'; end if;
  if p_spend_pace_multiplier is null or p_spend_pace_multiplier<=0 or p_spend_pace_multiplier>1000 then
    raise exception 'Spend pace multiplier must be greater than 0 and at most 1000';
  end if;
  update public.promotion_tiers
  set spend_pace_multiplier=p_spend_pace_multiplier,updated_at=now(),updated_by=auth.uid()
  where code=lower(btrim(p_code))
  returning * into v_row;
  if not found then raise exception 'Promotion tier not found'; end if;
  return to_jsonb(v_row);
end $$;
revoke all on function public.admin_update_promotion_tier_pacing(text,numeric) from public,anon;
grant execute on function public.admin_update_promotion_tier_pacing(text,numeric) to authenticated;

create or replace function public.get_admin_promotion_distribution_config()
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin_user() then raise exception 'Admin access required'; end if;
  return jsonb_build_object(
    'placements',coalesce((select jsonb_agg(to_jsonb(ap) order by ap.sort_order,ap.code) from public.ad_placements ap),'[]'::jsonb),
    'tiers',coalesce((select jsonb_agg(to_jsonb(pt) order by pt.tier_rank,pt.code) from public.promotion_tiers pt),'[]'::jsonb),
    'tier_placements',coalesce((select jsonb_agg(to_jsonb(ptp) order by ptp.tier_code,ptp.placement_code) from public.promotion_tier_placements ptp),'[]'::jsonb),
    'settings',(select to_jsonb(pds) from public.promotion_distribution_settings pds where singleton=true),
    'promotion_email_subscribers',(select count(*) from public.promotion_email_subscriptions where subscribed=true),
    'telegram_private_subscribers',(select count(*) from public.telegram_broadcast_subscribers where is_active=true),
    'external_analytics',jsonb_build_object(
      'telegram_deliveries',(select count(*) from public.telegram_broadcast_deliveries d join public.telegram_broadcast_campaigns b on b.id=d.campaign_id where b.source_type='promotion' and d.status='sent'),
      'email_deliveries',(select count(*) from public.notification_email_outbox o where o.notification_type='promotion_ad' and o.status='sent'),
      'telegram_clicks',(select coalesce(sum(click_count),0) from public.promotion_tracking_links where placement_code='external_platforms'),
      'email_clicks',(select coalesce(sum(click_count),0) from public.promotion_tracking_links where placement_code='email')
    )
  );
end $$;
revoke all on function public.get_admin_promotion_distribution_config() from public,anon;
grant execute on function public.get_admin_promotion_distribution_config() to authenticated;

create or replace function public.get_promotion_external_summary(p_seller_id uuid default null)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_uid uuid:=auth.uid();
  v_is_admin boolean:=false;
  v_seller uuid;
  v_all boolean:=false;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select coalesce(u.is_admin,false) into v_is_admin from public.users u where u.id=v_uid;
  if p_seller_id is null and v_is_admin then
    v_all:=true;v_seller:=null;
  else
    v_seller:=coalesce(p_seller_id,v_uid);
    if v_seller is distinct from v_uid and not v_is_admin then raise exception 'Not authorized'; end if;
  end if;

  return jsonb_build_object(
    'telegram_deliveries',coalesce((
      select count(*) from public.telegram_broadcast_deliveries d
      join public.telegram_broadcast_campaigns b on b.id=d.campaign_id and b.source_type='promotion'
      join public.promotion_campaigns pc on pc.id::text=b.source_id
      where d.status='sent' and (v_all or pc.seller_id=v_seller)
    ),0),
    'telegram_clicks',coalesce((
      select sum(tl.click_count) from public.promotion_tracking_links tl
      join public.promotion_campaigns pc on pc.id=tl.campaign_id
      where tl.placement_code='external_platforms' and (v_all or pc.seller_id=v_seller)
    ),0),
    'email_deliveries',coalesce((
      select count(*) from public.notification_email_outbox o
      join public.promotion_campaigns pc on pc.id::text=o.metadata->>'promotion_campaign_id'
      where o.notification_type='promotion_ad' and o.status='sent' and (v_all or pc.seller_id=v_seller)
    ),0),
    'email_clicks',coalesce((
      select sum(tl.click_count) from public.promotion_tracking_links tl
      join public.promotion_campaigns pc on pc.id=tl.campaign_id
      where tl.placement_code='email' and (v_all or pc.seller_id=v_seller)
    ),0)
  );
end $$;
revoke all on function public.get_promotion_external_summary(uuid) from public,anon;
grant execute on function public.get_promotion_external_summary(uuid) to authenticated;

-- Support both branded /r/:token and direct redirect callers.
create or replace function public.record_promotion_tracking_click(
  p_token uuid,p_ip_hash text,p_user_agent_hash text,p_record boolean default true
)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_link public.promotion_tracking_links%rowtype;
  v_duplicate boolean:=false;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service role required'; end if;
  select * into v_link from public.promotion_tracking_links where token=p_token for update;
  if not found then return jsonb_build_object('found',false,'success',false); end if;
  if v_link.expires_at is not null and v_link.expires_at<=now() then
    return jsonb_build_object('found',true,'success',false,'expired',true,'destination',v_link.destination_url,'destination_url',v_link.destination_url);
  end if;

  if coalesce(p_record,true) then
    select exists(
      select 1 from public.promotion_tracking_clicks c
      where c.token=p_token and c.created_at>=now()-interval '30 seconds'
        and ((nullif(p_ip_hash,'') is not null and c.ip_hash=p_ip_hash)
          or (nullif(p_user_agent_hash,'') is not null and c.user_agent_hash=p_user_agent_hash))
    ) into v_duplicate;

    if not v_duplicate then
      insert into public.promotion_tracking_clicks(token,ip_hash,user_agent_hash)
      values(p_token,nullif(p_ip_hash,''),nullif(p_user_agent_hash,''));
      update public.promotion_tracking_links
      set click_count=click_count+1,last_clicked_at=now()
      where token=p_token;
      insert into public.campaign_events(
        campaign_id,listing_id,user_id,event_type,metadata,is_fraudulent,created_at
      ) values(
        v_link.campaign_id,v_link.listing_id,v_link.user_id,'click',
        jsonb_build_object(
          'placement',v_link.placement_code,'campaign_asset_id',v_link.campaign_asset_id,
          'tracking_token',v_link.token,'external_source',v_link.destination_type
        ),false,now()
      );
    end if;
  end if;

  return jsonb_build_object(
    'found',true,'success',true,'expired',false,
    'recorded',coalesce(p_record,true) and not v_duplicate,'duplicate',v_duplicate,
    'destination',v_link.destination_url,'destination_url',v_link.destination_url
  );
end $$;
revoke all on function public.record_promotion_tracking_click(uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.record_promotion_tracking_click(uuid,text,text,boolean) to service_role;

-- Promotional emails use the branded DRIGHT redirect route.
do $$
declare v_def text;
begin
  select pg_get_functiondef('public.enqueue_promotion_email_campaign(uuid)'::regprocedure)
  into v_def;
  v_def:=replace(
    v_def,
    '''action_url'',''https://vtiardblxpaeekbfvhjo.supabase.co/functions/v1/promotion-click-redirect?token=''||tl.token::text',
    '''action_url'',''/r/''||tl.token::text'
  );
  execute v_def;
end $$;
