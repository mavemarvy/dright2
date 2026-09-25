-- Percentage-based promotion placements, tier delivery controls, and external analytics.

alter table public.ad_placements
  add column if not exists surcharge_percent numeric(8,4) not null default 1.0000;
alter table public.ad_placements drop constraint if exists ad_placements_surcharge_percent_check;
alter table public.ad_placements add constraint ad_placements_surcharge_percent_check
  check (surcharge_percent >= 0 and surcharge_percent <= 100);

alter table public.promotion_tier_placements
  add column if not exists surcharge_override_percent numeric(8,4);
alter table public.promotion_tier_placements
  drop constraint if exists promotion_tier_placements_surcharge_override_percent_check;
alter table public.promotion_tier_placements
  add constraint promotion_tier_placements_surcharge_override_percent_check
  check (surcharge_override_percent is null or (surcharge_override_percent >= 0 and surcharge_override_percent <= 100));

alter table public.promotion_tiers
  add column if not exists spend_pace_multiplier numeric(10,4) not null default 1.0000;
alter table public.promotion_tiers drop constraint if exists promotion_tiers_spend_pace_multiplier_check;
alter table public.promotion_tiers add constraint promotion_tiers_spend_pace_multiplier_check
  check (spend_pace_multiplier > 0 and spend_pace_multiplier <= 100);

update public.ad_placements
set surcharge_percent=1.0000,surcharge=0,updated_at=now();

update public.ad_placements
set enabled=true,
    description='Promotional email to DRIGHT users who have explicitly allowed marketing email. Delivery uses the configured DRIGHT email provider and consent rules.',
    surcharge_percent=1.0000,updated_at=now()
where code='email';

update public.ad_placements
set enabled=true,
    description='Sponsored community discovery for eligible DRIGHT communities.',
    surcharge_percent=1.0000,updated_at=now()
where code='community_discovery';

update public.ad_placements
set supported_asset_types=(
  select array_agg(distinct x order by x)
  from unnest(coalesce(supported_asset_types,'{}'::text[])||array['community']::text[]) x
), updated_at=now()
where code in('email','external_platforms');

update public.ad_placements
set minimum_tier_rank=1,premium=false,updated_at=now()
where enabled=true;

update public.promotion_distribution_settings
set email_ad_placement_status='available',updated_at=now()
where singleton=true;

update public.promotion_tiers
set name=case code when 'normal' then 'Normal Ads' when 'plus' then 'Premium Ads' when 'platinum' then 'Platinum Ads' else name end,
    description=case code
      when 'normal' then 'Standard DRIGHT promotion delivery with normal visibility and pacing.'
      when 'plus' then 'Premium DRIGHT promotion delivery with stronger ranking, visibility and faster pacing.'
      when 'platinum' then 'Highest DRIGHT promotion delivery priority, visibility and pacing.'
      else description end,
    pricing_multiplier=1.0000,
    reach_multiplier=case code when 'normal' then 1.0000 when 'plus' then 5.0000 when 'platinum' then 25.0000 else reach_multiplier end,
    spend_pace_multiplier=case code when 'normal' then 1.0000 when 'plus' then 5.0000 when 'platinum' then 25.0000 else spend_pace_multiplier end,
    updated_at=now()
where code in('normal','plus','platinum');

insert into public.promotion_tier_placements(
  tier_code,placement_code,is_included,surcharge_override,surcharge_override_percent
)
select t.code,p.code,true,null,null
from public.promotion_tiers t
cross join public.ad_placements p
where t.code in('normal','plus','platinum') and t.is_enabled=true and p.enabled=true
on conflict(tier_code,placement_code) do update
set is_included=true,surcharge_override=null,surcharge_override_percent=null;

create table if not exists public.promotion_external_deliveries(
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.promotion_campaigns(id) on delete cascade,
  campaign_asset_id uuid references public.campaign_assets(id) on delete set null,
  seller_id uuid not null references public.users(id) on delete cascade,
  placement_code text not null references public.ad_placements(code) on update cascade,
  channel text not null check(channel in('telegram_group','telegram_channel','telegram_private','email')),
  recipient_user_id uuid references public.users(id) on delete set null,
  destination_key text,
  idempotency_key text not null unique,
  status text not null default 'queued' check(status in('queued','sent','failed','skipped')),
  provider text,
  provider_message_id text,
  audience_size_snapshot integer not null default 0 check(audience_size_snapshot>=0),
  delivered_count integer not null default 0 check(delivered_count>=0),
  tracked_clicks integer not null default 0 check(tracked_clicks>=0),
  tracking_token uuid not null default gen_random_uuid() unique,
  destination_url text not null,
  metadata jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  last_clicked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_promotion_external_deliveries_campaign on public.promotion_external_deliveries(campaign_id,created_at desc);
create index if not exists idx_promotion_external_deliveries_seller on public.promotion_external_deliveries(seller_id,created_at desc);
create index if not exists idx_promotion_external_deliveries_recipient on public.promotion_external_deliveries(recipient_user_id,created_at desc);
create index if not exists idx_promotion_external_deliveries_channel_status on public.promotion_external_deliveries(channel,status,created_at desc);

alter table public.promotion_external_deliveries enable row level security;
drop policy if exists promotion_external_deliveries_admin_read on public.promotion_external_deliveries;
create policy promotion_external_deliveries_admin_read on public.promotion_external_deliveries
for select to authenticated using((select public.is_admin_user()));
revoke all on table public.promotion_external_deliveries from anon,authenticated;
grant select on table public.promotion_external_deliveries to authenticated;
grant all on table public.promotion_external_deliveries to service_role;

create or replace function public.get_promotion_external_analytics(p_campaign_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_uid uuid:=auth.uid();
  v_campaign public.promotion_campaigns%rowtype;
  v_is_admin boolean:=false;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_campaign from public.promotion_campaigns where id=p_campaign_id;
  if not found then raise exception 'Promotion campaign not found'; end if;
  select coalesce(u.is_admin,false) into v_is_admin from public.users u where u.id=v_uid;
  if v_campaign.seller_id<>v_uid and not coalesce(v_is_admin,false) then
    raise exception 'Not authorized to view promotion analytics';
  end if;

  with by_channel as(
    select channel,count(*)::int delivery_count,
      coalesce(sum(delivered_count),0)::int delivered,
      coalesce(sum(audience_size_snapshot),0)::int estimated_reach,
      coalesce(sum(tracked_clicks),0)::int clicks
    from public.promotion_external_deliveries
    where campaign_id=p_campaign_id and status in('sent','queued')
    group by channel
  )
  select jsonb_build_object(
    'campaign_id',p_campaign_id,
    'delivered',coalesce(sum(delivered),0),
    'estimated_reach',coalesce(sum(estimated_reach),0),
    'tracked_clicks',coalesce(sum(clicks),0),
    'channels',coalesce(jsonb_agg(jsonb_build_object(
      'channel',channel,'deliveries',delivery_count,'delivered',delivered,
      'estimated_reach',estimated_reach,'tracked_clicks',clicks
    ) order by channel),'[]'::jsonb)
  ) into v_result from by_channel;

  return coalesce(v_result,jsonb_build_object(
    'campaign_id',p_campaign_id,'delivered',0,'estimated_reach',0,'tracked_clicks',0,'channels','[]'::jsonb
  ));
end $$;
revoke all on function public.get_promotion_external_analytics(uuid) from public,anon;
grant execute on function public.get_promotion_external_analytics(uuid) to authenticated,service_role;

create or replace function public.get_admin_promotion_external_analytics()
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.is_admin_user() then raise exception 'Admin access required'; end if;
  with by_channel as(
    select channel,count(*)::int deliveries,coalesce(sum(delivered_count),0)::int delivered,
      coalesce(sum(audience_size_snapshot),0)::int estimated_reach,
      coalesce(sum(tracked_clicks),0)::int tracked_clicks
    from public.promotion_external_deliveries group by channel
  ), by_placement as(
    select placement_code,count(*)::int deliveries,coalesce(sum(delivered_count),0)::int delivered,
      coalesce(sum(audience_size_snapshot),0)::int estimated_reach,
      coalesce(sum(tracked_clicks),0)::int tracked_clicks
    from public.promotion_external_deliveries group by placement_code
  )
  select jsonb_build_object(
    'deliveries',(select count(*) from public.promotion_external_deliveries),
    'delivered',coalesce((select sum(delivered_count) from public.promotion_external_deliveries),0),
    'estimated_reach',coalesce((select sum(audience_size_snapshot) from public.promotion_external_deliveries),0),
    'tracked_clicks',coalesce((select sum(tracked_clicks) from public.promotion_external_deliveries),0),
    'failed',(select count(*) from public.promotion_external_deliveries where status='failed'),
    'channels',coalesce((select jsonb_agg(to_jsonb(by_channel) order by channel) from by_channel),'[]'::jsonb),
    'placements',coalesce((select jsonb_agg(to_jsonb(by_placement) order by placement_code) from by_placement),'[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;
revoke all on function public.get_admin_promotion_external_analytics() from public,anon;
grant execute on function public.get_admin_promotion_external_analytics() to authenticated,service_role;
