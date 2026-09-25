-- DRIGHT promotion distribution upgrade: percentage placement add-ons,
-- Normal/Premium/Platinum delivery strength, Email/Community delivery,
-- external tracking and seller/admin analytics.

alter table public.ad_placements
  add column if not exists surcharge_percent numeric(8,4) not null default 1;
alter table public.promotion_tier_placements
  add column if not exists surcharge_percent_override numeric(8,4);
alter table public.campaign_placements
  add column if not exists placement_fee_percent numeric(8,4) not null default 0;
alter table public.promotion_distribution_settings
  add column if not exists email_ads_enabled boolean not null default true,
  add column if not exists community_ads_enabled boolean not null default true;

alter table public.telegram_broadcast_settings
  add column if not exists recommendation_broadcasts_enabled boolean not null default true;
update public.telegram_broadcast_settings set recommendation_broadcasts_enabled=true where singleton=true;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='ad_placements_surcharge_percent_check' and conrelid='public.ad_placements'::regclass) then
    alter table public.ad_placements add constraint ad_placements_surcharge_percent_check
      check (surcharge_percent >= 0 and surcharge_percent <= 100);
  end if;
  if not exists (select 1 from pg_constraint where conname='promotion_tier_placements_surcharge_percent_override_check' and conrelid='public.promotion_tier_placements'::regclass) then
    alter table public.promotion_tier_placements add constraint promotion_tier_placements_surcharge_percent_override_check
      check (surcharge_percent_override is null or (surcharge_percent_override >= 0 and surcharge_percent_override <= 100));
  end if;
end $$;

update public.ad_placements set surcharge_percent=1,updated_at=now();
update public.ad_placements set enabled=true,minimum_tier_rank=1,updated_at=now()
where code in ('email','community_discovery');
update public.promotion_distribution_settings
set email_ad_placement_status='available',email_ads_enabled=true,community_ads_enabled=true,updated_at=now()
where singleton=true;
update public.promotion_tiers
set name=case code when 'plus' then 'Premium Ads' else name end,
    pricing_multiplier=1,
    reach_multiplier=case code when 'normal' then 1 when 'plus' then 5 when 'platinum' then 25 else reach_multiplier end,
    updated_at=now()
where code in ('normal','plus','platinum');

insert into public.promotion_tier_placements(tier_code,placement_code,is_included)
select t.code,p.code,true
from public.promotion_tiers t cross join public.ad_placements p
where t.code in ('normal','plus','platinum')
on conflict(tier_code,placement_code) do update set is_included=true;

update public.ad_placements
set supported_asset_types=case when 'community'=any(supported_asset_types) then supported_asset_types else array_append(supported_asset_types,'community'::text) end,
    updated_at=now()
where code in ('marketplace','search','category','store','feed','recommendations','suggestions','trending','notifications','login_gallery','flyer','leaderboard','community_discovery','announcement_feed','announcement_banner','news','email','external_platforms','profile_discovery');

create table if not exists public.promotion_email_subscriptions(
  user_id uuid primary key references public.users(id) on delete cascade,
  subscribed boolean not null default false,
  consent_source text not null default 'notification_preferences',
  consented_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.promotion_email_subscriptions enable row level security;
drop policy if exists "Users read own promotion email subscription" on public.promotion_email_subscriptions;
create policy "Users read own promotion email subscription" on public.promotion_email_subscriptions for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists "Users create own promotion email subscription" on public.promotion_email_subscriptions;
create policy "Users create own promotion email subscription" on public.promotion_email_subscriptions for insert to authenticated with check ((select auth.uid())=user_id);
drop policy if exists "Users update own promotion email subscription" on public.promotion_email_subscriptions;
create policy "Users update own promotion email subscription" on public.promotion_email_subscriptions for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
grant select,insert,update on public.promotion_email_subscriptions to authenticated;

create table if not exists public.promotion_tracking_links(
  token uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.promotion_campaigns(id) on delete cascade,
  campaign_asset_id uuid references public.campaign_assets(id) on delete cascade,
  listing_id uuid not null,
  placement_code text not null,
  destination_url text not null,
  destination_type text not null,
  destination_id text not null,
  user_id uuid references public.users(id) on delete set null,
  click_count bigint not null default 0,
  last_clicked_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique(campaign_id,campaign_asset_id,placement_code,destination_type,destination_id)
);
create index if not exists promotion_tracking_links_campaign_idx on public.promotion_tracking_links(campaign_id,placement_code);
alter table public.promotion_tracking_links enable row level security;
drop policy if exists "Campaign owners and admins read promotion tracking links" on public.promotion_tracking_links;
create policy "Campaign owners and admins read promotion tracking links"
on public.promotion_tracking_links for select to authenticated
using (exists(select 1 from public.promotion_campaigns pc where pc.id=campaign_id and (pc.seller_id=(select auth.uid()) or (select public.is_admin_user()))));

create table if not exists public.promotion_tracking_clicks(
  id uuid primary key default gen_random_uuid(),
  token uuid not null references public.promotion_tracking_links(token) on delete cascade,
  ip_hash text,
  user_agent_hash text,
  created_at timestamptz not null default now()
);
create index if not exists promotion_tracking_clicks_token_created_idx on public.promotion_tracking_clicks(token,created_at desc);
alter table public.promotion_tracking_clicks enable row level security;

create unique index if not exists notification_email_outbox_promotion_unique
on public.notification_email_outbox(user_id,((metadata->>'promotion_campaign_id')))
where notification_type='promotion_ad';


CREATE OR REPLACE FUNCTION public.admin_update_promotion_distribution_settings(p_email_ads_enabled boolean, p_community_ads_enabled boolean, p_external_platforms_enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_row public.promotion_distribution_settings%rowtype;
begin
  if not public.is_admin_user() then raise exception 'Admin access required'; end if;

  update public.promotion_distribution_settings
  set email_ads_enabled=coalesce(p_email_ads_enabled,email_ads_enabled),
      community_ads_enabled=coalesce(p_community_ads_enabled,community_ads_enabled),
      external_platforms_enabled=coalesce(p_external_platforms_enabled,external_platforms_enabled),
      email_ad_placement_status=case
        when coalesce(p_email_ads_enabled,email_ads_enabled) then 'available'
        else 'disabled'
      end,
      updated_at=now(),
      updated_by=auth.uid()
  where singleton=true
  returning * into v_row;

  update public.ad_placements
  set enabled=v_row.email_ads_enabled,updated_at=now(),updated_by=auth.uid()
  where code='email';

  update public.ad_placements
  set enabled=v_row.community_ads_enabled,updated_at=now(),updated_by=auth.uid()
  where code='community_discovery';

  update public.ad_placements
  set enabled=v_row.external_platforms_enabled,updated_at=now(),updated_by=auth.uid()
  where code='external_platforms';

  return to_jsonb(v_row);
end
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_promotion_placement(p_code text, p_enabled boolean, p_surcharge_percent numeric, p_minimum_tier_rank integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_row public.ad_placements%rowtype;
begin
  if not public.is_admin_user() then raise exception 'Admin access required'; end if;
  if p_surcharge_percent is null or p_surcharge_percent<0 or p_surcharge_percent>100 then
    raise exception 'Placement percentage must be between 0 and 100';
  end if;

  update public.ad_placements
  set enabled=coalesce(p_enabled,enabled),
      surcharge_percent=p_surcharge_percent,
      minimum_tier_rank=coalesce(p_minimum_tier_rank,minimum_tier_rank),
      updated_at=now(),
      updated_by=auth.uid()
  where code=lower(btrim(p_code))
  returning * into v_row;

  if not found then raise exception 'Placement not found'; end if;

  if v_row.code='email' then
    update public.promotion_distribution_settings
    set email_ads_enabled=v_row.enabled,
        email_ad_placement_status=case when v_row.enabled then 'available' else 'disabled' end,
        updated_at=now(),updated_by=auth.uid()
    where singleton=true;
  elsif v_row.code='community_discovery' then
    update public.promotion_distribution_settings
    set community_ads_enabled=v_row.enabled,
        updated_at=now(),updated_by=auth.uid()
    where singleton=true;
  elsif v_row.code='external_platforms' then
    update public.promotion_distribution_settings
    set external_platforms_enabled=v_row.enabled,
        updated_at=now(),updated_by=auth.uid()
    where singleton=true;
  end if;

  return to_jsonb(v_row);
end
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_promotion_tier(p_code text, p_is_enabled boolean, p_pricing_multiplier numeric, p_reach_multiplier numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_row public.promotion_tiers%rowtype;
begin
  if not public.is_admin_user() then raise exception 'Admin access required'; end if;
  if p_pricing_multiplier is null or p_pricing_multiplier<=0 or p_pricing_multiplier>100 then
    raise exception 'Pricing multiplier must be greater than 0 and at most 100';
  end if;
  if p_reach_multiplier is null or p_reach_multiplier<=0 or p_reach_multiplier>1000 then
    raise exception 'Reach multiplier must be greater than 0 and at most 1000';
  end if;

  update public.promotion_tiers
  set is_enabled=coalesce(p_is_enabled,is_enabled),
      pricing_multiplier=p_pricing_multiplier,
      reach_multiplier=p_reach_multiplier,
      updated_at=now(),
      updated_by=auth.uid()
  where code=lower(btrim(p_code))
  returning * into v_row;

  if not found then raise exception 'Promotion tier not found'; end if;
  return to_jsonb(v_row);
end
$function$;

CREATE OR REPLACE FUNCTION public.create_universal_promotion_campaign(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_percent numeric;
  v_fee numeric;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  select max_bulk_assets,default_pacing
  into v_max,v_pacing
  from public.promotion_distribution_settings
  where singleton=true;

  if p_payload ? 'pacing_mode' then
    v_pacing:=lower(coalesce(nullif(p_payload->>'pacing_mode',''),v_pacing));
  end if;

  if jsonb_typeof(v_assets)<>'array' then raise exception 'Campaign assets must be an array'; end if;
  v_count:=jsonb_array_length(v_assets);
  if v_count<1 or v_count>coalesce(v_max,20) then
    raise exception 'Campaign asset count is outside configured bulk limits';
  end if;
  if v_budget<=0 then raise exception 'Promotion budget must be greater than zero'; end if;
  if v_duration<1 or v_duration>90 then raise exception 'Promotion duration must be between 1 and 90 days'; end if;

  select coalesce(array_agg(distinct lower(value) order by lower(value)),array[]::text[])
  into v_placements
  from jsonb_array_elements_text(coalesce(p_payload->'placements','[]'::jsonb));

  if cardinality(v_placements)=0 then raise exception 'At least one promotion placement is required'; end if;

  v_primary:=v_assets->0;
  v_primary_type:=lower(coalesce(v_primary->>'asset_type',''));
  v_primary_id:=(v_primary->>'asset_id')::uuid;

  for v_asset,v_idx in
    select value,ordinality from jsonb_array_elements(v_assets) with ordinality
  loop
    v_asset_type:=lower(coalesce(v_asset->>'asset_type',''));
    v_asset_id:=(v_asset->>'asset_id')::uuid;

    if not public.promotion_asset_is_owned(v_uid,v_asset_type,v_asset_id) then
      raise exception 'Campaign contains an asset the authenticated user cannot promote';
    end if;

    if exists(
      select 1
      from unnest(v_placements) p(code)
      left join public.ad_placements ap on ap.code=p.code
      left join public.promotion_tier_placements ptp
        on ptp.tier_code=v_tier
       and ptp.placement_code=p.code
       and ptp.is_included=true
      where ap.code is null
         or ap.enabled=false
         or ptp.placement_code is null
         or not(v_asset_type=any(ap.supported_asset_types))
    ) then
      raise exception 'A selected placement does not support one or more selected asset types';
    end if;
  end loop;

  select count(*) into v_supplied
  from jsonb_array_elements(v_assets) x
  where nullif(x->>'allocation_amount','') is not null;

  if v_supplied not in(0,v_count) then
    raise exception 'Provide allocation for every asset or use equal allocation';
  end if;

  if v_supplied=v_count then
    select coalesce(sum((x->>'allocation_amount')::numeric),0)
    into v_alloc_sum
    from jsonb_array_elements(v_assets) x;
    if abs(v_alloc_sum-v_budget)>0.01 then
      raise exception 'Asset allocations must equal the campaign media budget';
    end if;
  end if;

  insert into public.promotion_campaigns(
    seller_id,listing_id,listing_type,goal,audience_type,
    audience_country,audience_state,audience_city,audience_category,
    audience_interests,audience_followers_only,
    budget,media_budget,duration_days,placements,tier_code,owner_profile_type,
    pacing_mode,daily_budget,allow_comments,status,payment_status
  ) values(
    v_uid,v_primary_id,v_primary_type,v_goal,v_audience,
    nullif(p_payload->>'audience_country',''),
    nullif(p_payload->>'audience_state',''),
    nullif(p_payload->>'audience_city',''),
    nullif(p_payload->>'audience_category',''),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'audience_interests','[]'::jsonb))),array[]::text[]),
    coalesce(nullif(p_payload->>'audience_followers_only','')::boolean,false),
    v_budget,v_budget,v_duration,v_placements,v_tier,v_owner_profile,v_pacing,v_daily,
    coalesce(nullif(p_payload->>'allow_comments','')::boolean,true),
    'pending','pending'
  )
  returning * into v_campaign;

  v_alloc_sum:=0;
  for v_asset,v_idx in
    select value,ordinality from jsonb_array_elements(v_assets) with ordinality
  loop
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
      select p.name,p.category,p.image_url,'/product/'||p.id::text
      into v_title,v_subtitle,v_image,v_destination
      from public.products p where p.id=v_asset_id;
    elsif v_asset_type='job' then
      select j.title,j.company_name,null,'/jobs?job='||j.id::text
      into v_title,v_subtitle,v_image,v_destination
      from public.jobs j where j.id=v_asset_id;
    elsif v_asset_type='campaign' then
      select c.name,c.task_type,null,'/creator-campaigns?campaign='||c.id::text
      into v_title,v_subtitle,v_image,v_destination
      from public.cc_campaigns c where c.id=v_asset_id;
    elsif v_asset_type='community' then
      select c.name,c.category,coalesce(c.banner_url,c.avatar_url),'/communities/'||c.slug
      into v_title,v_subtitle,v_image,v_destination
      from public.communities c where c.id=v_asset_id;
    elsif v_asset_type='store' then
      select coalesce(nullif(u.store_title,''),coalesce(u.full_name,'DRIGHT')||'''s Store'),
             'Store',u.store_banner_url,'/shop/'||u.id::text
      into v_title,v_subtitle,v_image,v_destination
      from public.users u where u.id=v_asset_id;
    else
      select coalesce(u.full_name,u.username,'Professional profile'),
             coalesce(u.profession,'Professional profile'),
             u.avatar_url,'/profile/'||u.id::text
      into v_title,v_subtitle,v_image,v_destination
      from public.users u where u.id=v_asset_id;
    end if;

    insert into public.campaign_assets(
      campaign_id,asset_type,asset_id,owner_id,allocation_amount,allocation_percent,
      title_snapshot,image_snapshot,destination_snapshot,sort_order
    )
    values(
      v_campaign.id,v_asset_type,v_asset_id,v_uid,v_alloc,
      round((v_alloc/v_budget)*100,4),v_title,v_image,v_destination,v_idx::integer-1
    );
  end loop;

  foreach v_placement in array v_placements loop
    select coalesce(ptp.surcharge_override_percent,ap.surcharge_percent,1.0000)
    into v_percent
    from public.ad_placements ap
    join public.promotion_tier_placements ptp
      on ptp.placement_code=ap.code
     and ptp.tier_code=v_tier
     and ptp.is_included=true
    where ap.code=v_placement and ap.enabled=true;

    if v_percent is null then
      raise exception 'Selected placement is not available for this tier';
    end if;

    v_fee:=round(v_budget*v_percent/100,2);

    insert into public.campaign_placements(
      campaign_id,placement_code,tier_code,placement_fee,pricing_snapshot
    )
    values(
      v_campaign.id,v_placement,v_tier,v_fee,
      jsonb_build_object(
        'pricing_model','percent_of_media_budget',
        'placement_fee_percent',v_percent,
        'media_budget',v_budget,
        'placement_fee',v_fee,
        'tier_code',v_tier,
        'captured_at',now()
      )
    );
  end loop;

  select * into v_campaign from public.promotion_campaigns where id=v_campaign.id;

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
end;
$function$;

CREATE OR REPLACE FUNCTION public.enqueue_promotion_email_campaign(p_campaign_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_campaign public.promotion_campaigns%rowtype;
  v_asset public.campaign_assets%rowtype;
  v_inserted integer:=0;
begin
  select * into v_campaign
  from public.promotion_campaigns
  where id=p_campaign_id;

  if not found
     or v_campaign.status<>'active'
     or v_campaign.payment_status<>'paid'
     or v_campaign.payment_verified_at is null
     or v_campaign.moderation_status<>'approved'
     or not ('email'=any(coalesce(v_campaign.placements,'{}'::text[])))
  then
    return 0;
  end if;

  if not exists(
    select 1 from public.promotion_distribution_settings
    where singleton=true and email_ads_enabled=true and email_ad_placement_status='available'
  ) then
    return 0;
  end if;

  select * into v_asset
  from public.campaign_assets
  where campaign_id=p_campaign_id and status='eligible'
  order by sort_order,created_at
  limit 1;

  if not found or v_asset.destination_snapshot is null then
    return 0;
  end if;

  insert into public.promotion_tracking_links(
    campaign_id,campaign_asset_id,listing_id,placement_code,destination_url,
    destination_type,destination_id,user_id,expires_at
  )
  select
    v_campaign.id,
    v_asset.id,
    v_asset.asset_id,
    'email',
    v_asset.destination_snapshot,
    'email_user',
    s.user_id::text,
    s.user_id,
    v_campaign.end_date
  from public.promotion_email_subscriptions s
  join public.users u on u.id=s.user_id
  where s.subscribed=true
    and nullif(btrim(coalesce(u.email,'')),'') is not null
    and coalesce(u.account_status,'active')='active'
    and exists(
      select 1
      from public.notification_preferences np
      where np.user_id=s.user_id
        and np.notification_type='promotion'
        and np.email_enabled=true
    )
  on conflict(campaign_id,campaign_asset_id,placement_code,destination_type,destination_id)
  do update set
    destination_url=excluded.destination_url,
    user_id=excluded.user_id,
    expires_at=excluded.expires_at;

  insert into public.notification_email_outbox(
    user_id,recipient_email,notification_type,category,priority,subject,message,metadata,status,next_attempt_at
  )
  select
    tl.user_id,
    u.email,
    'promotion_ad',
    'marketing',
    'normal',
    coalesce(v_asset.title_snapshot,'Sponsored on DRIGHT'),
    coalesce(v_asset.title_snapshot,'A promoted DRIGHT listing') || ' is being promoted on DRIGHT. Open it to learn more.',
    jsonb_build_object(
      'promotion_campaign_id',v_campaign.id::text,
      'campaign_asset_id',v_asset.id::text,
      'placement','email',
      'action_url','/r/'||tl.token::text,
      'marketing',true
    ),
    'pending',
    now()
  from public.promotion_tracking_links tl
  join public.users u on u.id=tl.user_id
  where tl.campaign_id=v_campaign.id
    and tl.campaign_asset_id=v_asset.id
    and tl.placement_code='email'
    and tl.destination_type='email_user'
  on conflict do nothing;

  get diagnostics v_inserted=row_count;
  return v_inserted;
end
$function$;

CREATE OR REPLACE FUNCTION public.get_admin_promotion_distribution_config()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_admin_user() then
    raise exception 'Admin access required';
  end if;

  return jsonb_build_object(
    'placements',coalesce((
      select jsonb_agg(to_jsonb(ap) order by ap.sort_order,ap.code)
      from public.ad_placements ap
    ),'[]'::jsonb),
    'tiers',coalesce((
      select jsonb_agg(to_jsonb(pt) order by pt.tier_rank,pt.code)
      from public.promotion_tiers pt
    ),'[]'::jsonb),
    'tier_placements',coalesce((
      select jsonb_agg(to_jsonb(ptp) order by ptp.tier_code,ptp.placement_code)
      from public.promotion_tier_placements ptp
    ),'[]'::jsonb),
    'settings',(select to_jsonb(pds) from public.promotion_distribution_settings pds where singleton=true),
    'promotion_email_subscribers',(select count(*) from public.promotion_email_subscriptions where subscribed=true),
    'telegram_private_subscribers',(select count(*) from public.telegram_broadcast_subscribers where is_active=true),
    'external_analytics',jsonb_build_object(
      'telegram_deliveries',(
        select count(*)
        from public.telegram_broadcast_deliveries d
        join public.telegram_broadcast_campaigns b on b.id=d.campaign_id
        where b.source_type='promotion' and d.status='sent'
      ),
      'email_deliveries',(
        select count(*)
        from public.notification_email_outbox o
        where o.notification_type='promotion_ad' and o.status='sent'
      ),
      'telegram_clicks',(
        select coalesce(sum(click_count),0)
        from public.promotion_tracking_links
        where placement_code='external_platforms'
      ),
      'email_clicks',(
        select coalesce(sum(click_count),0)
        from public.promotion_tracking_links
        where placement_code='email'
      )
    )
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.get_promotion_analytics(p_promotion_id uuid, p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end
$function$;

CREATE OR REPLACE FUNCTION public.get_promotion_delivery_v2(p_placement text, p_limit integer DEFAULT 5)
 RETURNS TABLE(campaign_id uuid, campaign_asset_id uuid, asset_type text, asset_id uuid, tier_code text, goal text, placement text, title text, description text, image_url text, cta_label text, destination text, allow_comments boolean, seller_id uuid, sponsored_label text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_place text:=lower(btrim(coalesce(p_placement,'marketplace')));
  v_limit integer:=greatest(1,least(coalesce(p_limit,5),20));
  v_viewer uuid:=auth.uid();
  v_cap integer;
  v_window integer;
  v_min_quality numeric;
  v_interest_weight numeric:=20;
  v_min_relevance numeric:=.10;
begin
  select ap.frequency_cap,ap.frequency_window_hours
  into v_cap,v_window
  from public.ad_placements ap
  where ap.code=v_place and ap.enabled=true;

  if v_cap is null then return; end if;

  select minimum_quality_score
  into v_min_quality
  from public.promotion_distribution_settings
  where singleton=true;

  select promotion_interest_weight,promotion_min_relevance
  into v_interest_weight,v_min_relevance
  from public.algorithm_settings
  where is_singleton=true
  limit 1;

  return query
  with candidates as (
    select
      pc.id campaign_id,
      ca.id campaign_asset_id,
      ca.asset_type,
      ca.asset_id,
      pc.tier_code,
      pc.goal,
      coalesce(cr.headline,ca.title_snapshot) title,
      cr.description,
      coalesce(cr.media_url,ca.image_snapshot) image_url,
      coalesce(cr.cta_label,'Learn More') cta_label,
      ca.destination_snapshot destination,
      pc.allow_comments,
      pc.seller_id,
      pc.quality_score,
      pt.tier_rank,
      greatest(coalesce(pt.reach_multiplier,1),0.01) delivery_multiplier,
      coalesce(cp.actual_spend,0) placement_spend,
      pc.media_budget,
      greatest(
        case when v_viewer is null then .35 else 0 end,
        case
          when pc.audience_category is not null
           and public.is_allowed_personalization_key(pc.audience_category)
          then coalesce((uip.scores->>pc.audience_category)::numeric,0)/100
          else 0 end,
        case
          when prod.category is not null
           and public.is_allowed_personalization_key(prod.category)
          then coalesce((uip.scores->>prod.category)::numeric,0)/100
          else 0 end,
        coalesce((
          select max(coalesce((uip.scores->>i)::numeric,0)/100)
          from unnest(coalesce(pc.audience_interests,'{}'::text[])) i
          where public.is_allowed_personalization_key(i)
        ),0),
        case
          when pc.audience_category is null
           and cardinality(coalesce(pc.audience_interests,'{}'::text[]))=0
           and prod.category is null
          then .35 else 0 end
      )::numeric relevance_score,
      case
        when pc.goal='more_views'
          then coalesce((pc.pricing_snapshot->>'cost_per_1000_impressions')::numeric,6)
        else coalesce((pc.pricing_snapshot->>'cost_per_click')::numeric,.15)
          * 1000
          * greatest(
              case when pc.actual_impressions>0
                then pc.actual_clicks::numeric/pc.actual_impressions
                else 0 end,
              coalesce((pc.pricing_snapshot->>'default_ctr')::numeric,.02)
            )
      end::numeric expected_ecpm
    from public.promotion_campaigns pc
    join public.promotion_tiers pt
      on pt.code=pc.tier_code and pt.is_enabled=true
    join public.campaign_placements cp
      on cp.campaign_id=pc.id
     and cp.placement_code=v_place
     and cp.status='enabled'
    join public.ad_placements ap
      on ap.code=cp.placement_code and ap.enabled=true
    join public.campaign_assets ca
      on ca.campaign_id=pc.id
     and ca.status='eligible'
     and ca.asset_type=any(ap.supported_asset_types)
    left join public.products prod
      on ca.asset_type in ('product','service','course') and prod.id=ca.asset_id
    left join public.user_interest_profiles uip
      on uip.user_id=v_viewer
    left join lateral(
      select c.headline,c.description,c.media_url,c.cta_label
      from public.promotion_creatives c
      where c.campaign_id=pc.id
        and (c.campaign_asset_id=ca.id or c.campaign_asset_id is null)
        and c.moderation_status='approved'
      order by (c.campaign_asset_id=ca.id) desc,c.created_at desc
      limit 1
    ) cr on true
    where pc.status='active'
      and pc.payment_status='paid'
      and pc.payment_verified_at is not null
      and pc.moderation_status='approved'
      and pc.start_date<=now()
      and pc.end_date>now()
      and coalesce(pc.actual_spend,0)<pc.media_budget
      and coalesce((
        select cs.spend
        from public.campaign_statistics cs
        where cs.campaign_id=pc.id and cs.stat_date=current_date
      ),0) < coalesce(pc.daily_budget,pc.media_budget)
      and pc.quality_score>=coalesce(v_min_quality,0)
      and public.promotion_viewer_is_eligible(pc.id,v_viewer)
      and (
        v_viewer is null
        or not exists(
          select 1
          from public.promotion_feedback pf
          where pf.user_id=v_viewer
            and pf.campaign_id=pc.id
            and pf.feedback_type in('hide','not_relevant')
        )
      )
      and (
        v_viewer is null
        or not exists(
          select 1
          from public.user_blocks b
          where (b.blocker_id=v_viewer and b.blocked_id=pc.seller_id)
             or (b.blocker_id=pc.seller_id and b.blocked_id=v_viewer)
        )
      )
      and (
        v_viewer is null
        or (
          select count(*)
          from public.sponsored_listing_logs sl
          where sl.user_id=v_viewer
            and sl.campaign_id=pc.id
            and sl.placement=v_place
            and sl.created_at>=now()-make_interval(hours=>v_window)
        )<v_cap
      )
  )
  select
    c.campaign_id,c.campaign_asset_id,c.asset_type,c.asset_id,c.tier_code,c.goal,
    v_place,c.title,c.description,c.image_url,c.cta_label,c.destination,
    c.allow_comments,c.seller_id,'Sponsored'::text
  from candidates c
  where v_viewer is null
     or c.relevance_score>=coalesce(v_min_relevance,.10)
     or not exists(
       select 1 from public.user_interest_profiles u
       where u.user_id=v_viewer and u.interaction_count>0
     )
  order by (
      c.expected_ecpm
      * greatest(c.delivery_multiplier,.01)
      * (0.5+least(greatest(c.quality_score,0),1))
      * (1 + c.relevance_score*least(greatest(coalesce(v_interest_weight,20),0),100)/100)
    ) desc,
    (c.placement_spend/greatest(c.media_budget,.01)) asc,
    md5(c.campaign_id::text||date_trunc('hour',now())::text||coalesce(v_viewer::text,''))
  limit v_limit;
end;
$function$;

CREATE OR REPLACE FUNCTION public.promotion_asset_is_owned(p_user_id uuid, p_asset_type text, p_asset_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  elsif v_type='community' then
    return exists(select 1 from public.communities c where c.id=p_asset_id and c.owner_id=p_user_id and lower(coalesce(c.status,'active'))='active');
  elsif v_type='store' then
    return p_asset_id=p_user_id and exists(select 1 from public.users u where u.id=p_user_id and nullif(btrim(coalesce(u.store_title,'')),'') is not null);
  elsif v_type='profile' then
    return p_asset_id=p_user_id and exists(select 1 from public.users u where u.id=p_user_id and coalesce(u.account_status,'active')='active');
  elsif v_type='sales_team' then
    return p_asset_id=p_user_id and exists(select 1 from public.users u where u.id=p_user_id and coalesce(u.account_status,'active')='active' and (coalesce(u.marketer_status,'')='approved' or coalesce(u.advertiser_status,'')='approved'));
  end if;
  return false;
end
$function$;

CREATE OR REPLACE FUNCTION public.record_promotion_tracking_click(p_token uuid, p_ip_hash text, p_user_agent_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_link public.promotion_tracking_links%rowtype;
  v_campaign public.promotion_campaigns%rowtype;
  v_duplicate boolean:=false;
  v_should_count boolean:=false;
begin
  select * into v_link
  from public.promotion_tracking_links
  where token=p_token
  for update;

  if not found then
    return jsonb_build_object('success',false,'error','TRACKING_LINK_NOT_FOUND');
  end if;

  if v_link.expires_at is not null and v_link.expires_at < now() then
    return jsonb_build_object(
      'success',true,
      'tracked',false,
      'expired',true,
      'destination',v_link.destination_url
    );
  end if;

  select exists(
    select 1
    from public.promotion_tracking_clicks c
    where c.token=v_link.token
      and c.created_at >= now()-interval '5 seconds'
      and coalesce(c.ip_hash,'')=coalesce(p_ip_hash,'')
      and coalesce(c.user_agent_hash,'')=coalesce(p_user_agent_hash,'')
  ) into v_duplicate;

  if not v_duplicate then
    insert into public.promotion_tracking_clicks(token,ip_hash,user_agent_hash)
    values(v_link.token,nullif(p_ip_hash,''),nullif(p_user_agent_hash,''));

    update public.promotion_tracking_links
    set click_count=click_count+1,
        last_clicked_at=now()
    where token=v_link.token;

    select * into v_campaign
    from public.promotion_campaigns
    where id=v_link.campaign_id;

    v_should_count :=
      found
      and v_campaign.status='active'
      and v_campaign.payment_status='paid'
      and v_campaign.payment_verified_at is not null
      and v_campaign.moderation_status='approved'
      and v_campaign.start_date<=now()
      and v_campaign.end_date>now();

    if v_should_count then
      insert into public.campaign_events(
        campaign_id,listing_id,user_id,event_type,metadata,is_fraudulent,fraud_reason,created_at
      ) values(
        v_link.campaign_id,
        v_link.listing_id,
        v_link.user_id,
        'click',
        jsonb_build_object(
          'placement',v_link.placement_code,
          'campaign_asset_id',v_link.campaign_asset_id,
          'tracking_token',v_link.token,
          'destination_type',v_link.destination_type,
          'source','promotion_tracking_redirect'
        ),
        false,
        null,
        now()
      );
    end if;
  end if;

  return jsonb_build_object(
    'success',true,
    'tracked',not v_duplicate and v_should_count,
    'duplicate',v_duplicate,
    'destination',v_link.destination_url,
    'placement',v_link.placement_code
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.trigger_enqueue_promotion_email_campaign()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.enqueue_promotion_email_campaign(new.id);
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION public.universal_promotion_financial_authority()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role text:=coalesce(auth.role(),'');
  v_is_admin boolean:=false;
  v_tier public.promotion_tiers%rowtype;
  v_settings public.promotion_distribution_settings%rowtype;
  v_pricing public.promotion_pricing%rowtype;
  v_placement_percent_total numeric:=0;
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

  if tg_op='INSERT' or (tg_op='UPDATE' and (new.tier_code is distinct from old.tier_code or new.placements is distinct from old.placements or new.budget is distinct from old.budget)) then
    new.media_budget:=new.budget;

    select coalesce(sum(coalesce(ptp.surcharge_percent_override,ap.surcharge_percent)),0)
    into v_placement_percent_total
    from unnest(new.placements) p(code)
    join public.ad_placements ap on ap.code=p.code and ap.enabled=true
    join public.promotion_tier_placements ptp
      on ptp.tier_code=new.tier_code
     and ptp.placement_code=p.code
     and ptp.is_included=true;

    new.placement_fee_total:=round(new.media_budget * v_placement_percent_total / 100,2);
    new.platform_fee:=round((new.media_budget+new.placement_fee_total)*coalesce(v_settings.platform_fee_percent,0)/100,2);
    v_subtotal:=new.media_budget+new.placement_fee_total+new.platform_fee;
    new.tax_amount:=round(v_subtotal*coalesce(v_settings.tax_percent,0)/100,2);
    new.total_payable:=round(v_subtotal+new.tax_amount,2);

    v_base_cpm:=coalesce(v_pricing.cost_per_1000_impressions,0)*greatest(coalesce(v_tier.pricing_multiplier,1),0.0001);
    if v_base_cpm<=0 then raise exception 'Promotion CPM must be greater than zero'; end if;

    new.estimated_impressions:=floor((new.media_budget/v_base_cpm)*1000*greatest(coalesce(v_tier.reach_multiplier,1),0.01))::integer;
    new.estimated_clicks:=floor(new.estimated_impressions*greatest(0,coalesce(v_pricing.default_ctr,0)))::integer;
    new.estimated_reach:=least(new.estimated_impressions,floor(new.estimated_impressions*0.70)::integer);
    new.estimated_conversions:=floor(new.estimated_clicks*greatest(0,coalesce(v_pricing.default_conversion_rate,0)))::integer;

    new.pricing_snapshot:=coalesce(new.pricing_snapshot,'{}'::jsonb)||jsonb_build_object(
      'tier_code',new.tier_code,
      'tier_pricing_multiplier',v_tier.pricing_multiplier,
      'tier_reach_multiplier',v_tier.reach_multiplier,
      'media_budget',new.media_budget,
      'placement_fee_percent_total',v_placement_percent_total,
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
end
$function$;


drop trigger if exists trg_enqueue_promotion_email_campaign on public.promotion_campaigns;
create trigger trg_enqueue_promotion_email_campaign
after insert or update of status,payment_status,moderation_status,placements
on public.promotion_campaigns
for each row execute function public.trigger_enqueue_promotion_email_campaign();

revoke all on function public.enqueue_promotion_email_campaign(uuid) from public,anon,authenticated;
revoke all on function public.trigger_enqueue_promotion_email_campaign() from public,anon,authenticated;
revoke all on function public.record_promotion_tracking_click(uuid,text,text) from public,anon,authenticated;
grant execute on function public.record_promotion_tracking_click(uuid,text,text) to service_role;

revoke all on function public.get_admin_promotion_distribution_config() from public,anon;
grant execute on function public.get_admin_promotion_distribution_config() to authenticated;
revoke all on function public.admin_update_promotion_placement(text,boolean,numeric,integer) from public,anon;
grant execute on function public.admin_update_promotion_placement(text,boolean,numeric,integer) to authenticated;
revoke all on function public.admin_update_promotion_tier(text,boolean,numeric,numeric) from public,anon;
grant execute on function public.admin_update_promotion_tier(text,boolean,numeric,numeric) to authenticated;
revoke all on function public.admin_update_promotion_distribution_settings(boolean,boolean,boolean) from public,anon;
grant execute on function public.admin_update_promotion_distribution_settings(boolean,boolean,boolean) to authenticated;
