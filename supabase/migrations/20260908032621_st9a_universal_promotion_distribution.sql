-- DRIGHT2 ST-9A: universal promotion tiers, placements, bulk attribution and friendly delivery controls

create table if not exists public.promotion_tiers (
  code text primary key,
  name text not null,
  description text,
  tier_rank integer not null check (tier_rank between 1 and 100),
  is_enabled boolean not null default true,
  pricing_multiplier numeric(8,4) not null default 1 check (pricing_multiplier > 0),
  reach_multiplier numeric(8,4) not null default 1 check (reach_multiplier > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
alter table public.promotion_tiers enable row level security;
drop policy if exists promotion_tiers_public_read on public.promotion_tiers;
create policy promotion_tiers_public_read on public.promotion_tiers for select to anon, authenticated using (true);
drop policy if exists promotion_tiers_admin_write on public.promotion_tiers;
create policy promotion_tiers_admin_write on public.promotion_tiers for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
grant select on public.promotion_tiers to anon, authenticated;
grant insert, update, delete on public.promotion_tiers to authenticated;

insert into public.promotion_tiers(code,name,description,tier_rank,is_enabled,pricing_multiplier,reach_multiplier)
values
 ('normal','Normal Ads','Contextual advertising in the most relevant DRIGHT discovery surfaces.',1,true,1.0000,1.0000),
 ('plus','Plus Ads','Normal inventory plus additional recommendation, notification and discovery inventory.',2,true,1.1500,1.2500),
 ('platinum','Platinum Ads','Normal and Plus inventory plus premium DRIGHT-owned discovery and communication surfaces.',3,true,1.3000,1.5000)
on conflict (code) do nothing;

create table if not exists public.ad_placements (
  code text primary key,
  name text not null,
  description text,
  enabled boolean not null default true,
  minimum_tier_rank integer not null default 1 check (minimum_tier_rank between 1 and 100),
  contextual boolean not null default false,
  premium boolean not null default false,
  surcharge numeric(12,2) not null default 0 check (surcharge >= 0),
  density_organic_interval integer not null default 8 check (density_organic_interval >= 1),
  frequency_cap integer not null default 3 check (frequency_cap >= 1),
  frequency_window_hours integer not null default 24 check (frequency_window_hours >= 1),
  supported_asset_types text[] not null default array[]::text[],
  supported_goals text[] not null default array[]::text[],
  creative_types text[] not null default array['card']::text[],
  preview_key text not null default 'card',
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
alter table public.ad_placements enable row level security;
drop policy if exists ad_placements_public_read on public.ad_placements;
create policy ad_placements_public_read on public.ad_placements for select to anon, authenticated using (true);
drop policy if exists ad_placements_admin_write on public.ad_placements;
create policy ad_placements_admin_write on public.ad_placements for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
grant select on public.ad_placements to anon, authenticated;
grant insert, update, delete on public.ad_placements to authenticated;

insert into public.ad_placements(code,name,description,enabled,minimum_tier_rank,contextual,premium,surcharge,density_organic_interval,frequency_cap,frequency_window_hours,supported_asset_types,creative_types,preview_key,sort_order)
values
 ('marketplace','Marketplace','Contextual sponsored marketplace inventory.',true,1,true,false,0,8,3,24,array['product','service','course','store']::text[],array['card','image']::text[],'marketplace_card',10),
 ('search','Search','Relevant sponsored search results.',true,1,true,false,0,10,3,24,array['product','service','course','job','campaign','sales_team','profile','store']::text[],array['card']::text[],'search_result',20),
 ('category','Category','Sponsored category discovery.',true,1,true,false,0,8,3,24,array['product','service','course','job','campaign']::text[],array['card']::text[],'category_card',30),
 ('product_detail','Related Listings','Sponsored related-listing inventory.',true,1,true,false,0,8,2,24,array['product','service','course']::text[],array['card']::text[],'related_listing',40),
 ('jobs','Jobs','Contextual sponsored job discovery.',true,1,true,false,0,8,3,24,array['job']::text[],array['card']::text[],'job_card',50),
 ('course_feed','Courses','Contextual sponsored course discovery.',true,1,true,false,0,8,3,24,array['course']::text[],array['card']::text[],'course_card',60),
 ('service_feed','Services','Contextual sponsored service discovery.',true,1,true,false,0,8,3,24,array['service']::text[],array['card']::text[],'service_card',70),
 ('campaign_feed','Campaigns & Tasks','Contextual sponsored creator/task discovery.',true,1,true,false,0,8,3,24,array['campaign']::text[],array['card']::text[],'campaign_card',80),
 ('sales_team_discovery','Sales Team Discovery','Sponsored professional Sales Team discovery.',true,1,true,false,0,8,3,24,array['sales_team']::text[],array['profile_card']::text[],'sales_team_profile',90),
 ('profile_discovery','Professional Discovery','Sponsored professional profile discovery.',true,1,true,false,0,8,3,24,array['profile']::text[],array['profile_card']::text[],'profile_card',100),
 ('store','Store Discovery','Sponsored stores and store-linked discovery.',true,2,false,false,0,8,3,24,array['store','product']::text[],array['card','banner']::text[],'store_card',200),
 ('feed','Discovery Feed','Sponsored posts within the DRIGHT information/discovery feed.',true,2,false,false,0,8,3,24,array['product','service','course','job','campaign','store','profile','sales_team']::text[],array['post','image','video']::text[],'feed_post',210),
 ('recommendations','Recommended','Relevant sponsored recommendations.',true,2,false,false,0,8,2,24,array['product','service','course','job','campaign','store','profile','sales_team']::text[],array['card']::text[],'recommendation_card',220),
 ('suggestions','Suggested','Relevant sponsored suggestions.',true,2,false,false,0,8,2,24,array['product','service','course','job','campaign','store','profile','sales_team']::text[],array['card']::text[],'suggestion_card',230),
 ('trending','Sponsored Trending','Paid inventory adjacent to, but separate from, organic trending.',true,2,false,false,0,8,2,24,array['product','service','course','job','campaign','store','profile','sales_team']::text[],array['card']::text[],'trending_card',240),
 ('notifications','Sponsored Notifications','Highly capped, clearly labelled sponsored notification inventory.',true,2,false,true,0,20,1,24,array['product','service','course','job','campaign','store','profile','sales_team']::text[],array['notification']::text[],'notification',250),
 ('login_gallery','Login Discovery Gallery','Dismissible ecommerce-style DRIGHT promotional discovery gallery.',true,2,false,true,0,20,2,24,array['product','service','course','job','campaign','store','profile','sales_team']::text[],array['gallery','image']::text[],'login_gallery',260),
 ('flyer','Floating Flyer','Compact non-blocking promotional flyer inventory.',true,2,false,true,0,20,2,24,array['product','service','course','job','campaign','store','profile','sales_team']::text[],array['banner','image']::text[],'floating_flyer',270),
 ('leaderboard','Leaderboard & Information','Sponsored cards separated from verified organic leaderboard positions.',true,2,false,true,0,8,2,24,array['sales_team','profile','product','job','campaign','store']::text[],array['post','card']::text[],'leaderboard_post',280),
 ('community_discovery','Community Discovery','Reserved for the DRIGHT community entity when that system is production-ready.',false,2,false,false,0,8,2,24,array['community']::text[],array['card']::text[],'community_card',290),
 ('announcement_feed','Sponsored Announcements','Sponsored announcement posts, distinct from official platform announcements.',true,3,false,true,0,8,2,24,array['product','service','course','job','campaign','store','profile','sales_team']::text[],array['post','image','video']::text[],'announcement_post',300),
 ('announcement_banner','Announcement Banner','Premium sponsored banner/flyer inventory.',true,3,false,true,0,10,2,24,array['product','service','course','job','campaign','store','profile','sales_team']::text[],array['banner','image']::text[],'announcement_banner',310),
 ('news','DRIGHT News Sponsored','Sponsored content clearly separated from editorial/platform news.',true,3,false,true,0,10,2,24,array['product','service','course','job','campaign','store','profile','sales_team']::text[],array['post','card']::text[],'news_sponsored',320),
 ('email','Subscriber Email','Reserved for consented DRIGHT marketing email subscribers.',false,3,false,true,0,999,1,168,array['product','service','course','job','campaign','store','profile','sales_team']::text[],array['email']::text[],'email_promotion',330)
on conflict (code) do nothing;

create table if not exists public.promotion_tier_placements (
  tier_code text not null references public.promotion_tiers(code) on delete cascade,
  placement_code text not null references public.ad_placements(code) on delete cascade,
  is_included boolean not null default true,
  surcharge_override numeric(12,2),
  created_at timestamptz not null default now(),
  primary key(tier_code, placement_code),
  check (surcharge_override is null or surcharge_override >= 0)
);
alter table public.promotion_tier_placements enable row level security;
drop policy if exists promotion_tier_placements_public_read on public.promotion_tier_placements;
create policy promotion_tier_placements_public_read on public.promotion_tier_placements for select to anon, authenticated using (true);
drop policy if exists promotion_tier_placements_admin_write on public.promotion_tier_placements;
create policy promotion_tier_placements_admin_write on public.promotion_tier_placements for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
grant select on public.promotion_tier_placements to anon, authenticated;
grant insert, update, delete on public.promotion_tier_placements to authenticated;
insert into public.promotion_tier_placements(tier_code, placement_code, is_included)
select t.code, p.code, true from public.promotion_tiers t join public.ad_placements p on t.tier_rank >= p.minimum_tier_rank
on conflict (tier_code, placement_code) do nothing;

create table if not exists public.promotion_distribution_settings (
  singleton boolean primary key default true check (singleton = true),
  max_bulk_assets integer not null default 20 check (max_bulk_assets between 1 and 100),
  max_login_gallery_slides integer not null default 5 check (max_login_gallery_slides between 1 and 20),
  login_gallery_session_cap integer not null default 1 check (login_gallery_session_cap >= 0),
  sponsored_notification_daily_cap integer not null default 1 check (sponsored_notification_daily_cap >= 0),
  default_pacing text not null default 'even' check (default_pacing in ('even','accelerated')),
  minimum_quality_score numeric(6,4) not null default 0.2500 check (minimum_quality_score between 0 and 1),
  platform_fee_percent numeric(8,4) not null default 0 check (platform_fee_percent between 0 and 100),
  tax_percent numeric(8,4) not null default 0 check (tax_percent between 0 and 100),
  email_ad_placement_status text not null default 'disabled' check (email_ad_placement_status in ('disabled','available','maintenance')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
insert into public.promotion_distribution_settings(singleton) values(true) on conflict(singleton) do nothing;
alter table public.promotion_distribution_settings enable row level security;
drop policy if exists promotion_distribution_settings_public_read on public.promotion_distribution_settings;
create policy promotion_distribution_settings_public_read on public.promotion_distribution_settings for select to anon, authenticated using (true);
drop policy if exists promotion_distribution_settings_admin_write on public.promotion_distribution_settings;
create policy promotion_distribution_settings_admin_write on public.promotion_distribution_settings for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
grant select on public.promotion_distribution_settings to anon, authenticated;
grant update on public.promotion_distribution_settings to authenticated;

alter table public.promotion_campaigns
  add column if not exists tier_code text,
  add column if not exists owner_profile_type text not null default 'seller',
  add column if not exists media_budget numeric(12,2),
  add column if not exists placement_fee_total numeric(12,2) not null default 0,
  add column if not exists platform_fee numeric(12,2) not null default 0,
  add column if not exists tax_amount numeric(12,2) not null default 0,
  add column if not exists total_payable numeric(12,2),
  add column if not exists pacing_mode text not null default 'even',
  add column if not exists daily_budget numeric(12,2),
  add column if not exists allow_comments boolean not null default true,
  add column if not exists quality_score numeric(6,4) not null default 1,
  add column if not exists moderation_status text not null default 'approved';

alter table public.promotion_campaigns disable trigger trg_guard_promotion_campaign_write;
alter table public.promotion_campaigns disable trigger trg_guard_promotion_campaign_placements;
alter table public.promotion_campaigns disable trigger trg_promotion_campaigns_updated_at;
update public.promotion_campaigns pc
set tier_code = case
      when coalesce(pc.placements,array[]::text[]) && array['announcement_feed','announcement_banner','news','email']::text[] then 'platinum'
      when coalesce(pc.placements,array[]::text[]) && array['feed','recommendations','notifications','leaderboard','store','suggestions','trending','login_gallery','flyer','community_discovery']::text[] then 'plus'
      else 'normal'
    end,
    media_budget = coalesce(media_budget,budget),
    total_payable = coalesce(total_payable,budget)
where tier_code is null or media_budget is null or total_payable is null;
alter table public.promotion_campaigns enable trigger trg_guard_promotion_campaign_write;
alter table public.promotion_campaigns enable trigger trg_guard_promotion_campaign_placements;
alter table public.promotion_campaigns enable trigger trg_promotion_campaigns_updated_at;

alter table public.promotion_campaigns alter column tier_code set default 'normal';
alter table public.promotion_campaigns alter column tier_code set not null;
alter table public.promotion_campaigns alter column media_budget set not null;
alter table public.promotion_campaigns alter column total_payable set not null;
alter table public.promotion_campaigns drop constraint if exists promotion_campaigns_placements_check;
alter table public.promotion_campaigns drop constraint if exists promotion_campaigns_tier_code_fkey;
alter table public.promotion_campaigns add constraint promotion_campaigns_tier_code_fkey foreign key(tier_code) references public.promotion_tiers(code);
alter table public.promotion_campaigns drop constraint if exists promotion_campaigns_pacing_mode_check;
alter table public.promotion_campaigns add constraint promotion_campaigns_pacing_mode_check check (pacing_mode in ('even','accelerated'));
alter table public.promotion_campaigns drop constraint if exists promotion_campaigns_financial_components_check;
alter table public.promotion_campaigns add constraint promotion_campaigns_financial_components_check check (media_budget >= 0 and placement_fee_total >= 0 and platform_fee >= 0 and tax_amount >= 0 and total_payable >= 0);
alter table public.promotion_campaigns drop constraint if exists promotion_campaigns_quality_score_check;
alter table public.promotion_campaigns add constraint promotion_campaigns_quality_score_check check (quality_score between 0 and 1);
create index if not exists idx_promotion_campaigns_tier_status on public.promotion_campaigns(tier_code,status,payment_status,end_date);

create table if not exists public.campaign_assets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.promotion_campaigns(id) on delete cascade,
  asset_type text not null,
  asset_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  allocation_amount numeric(12,2) not null default 0 check (allocation_amount >= 0),
  allocation_percent numeric(8,4) not null default 0 check (allocation_percent between 0 and 100),
  title_snapshot text,
  destination_snapshot text,
  status text not null default 'eligible' check (status in ('eligible','paused','ineligible','completed')),
  sort_order integer not null default 0,
  actual_spend numeric(12,2) not null default 0,
  actual_impressions integer not null default 0,
  actual_clicks integer not null default 0,
  actual_conversions integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(campaign_id,asset_type,asset_id)
);
create index if not exists idx_campaign_assets_campaign on public.campaign_assets(campaign_id,status,sort_order);
create index if not exists idx_campaign_assets_asset on public.campaign_assets(asset_type,asset_id);
alter table public.campaign_assets enable row level security;
drop policy if exists campaign_assets_owner_read on public.campaign_assets;
create policy campaign_assets_owner_read on public.campaign_assets for select to authenticated using (owner_id=auth.uid() or public.is_admin(auth.uid()));
grant select on public.campaign_assets to authenticated;

create table if not exists public.campaign_placements (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.promotion_campaigns(id) on delete cascade,
  placement_code text not null references public.ad_placements(code),
  tier_code text not null references public.promotion_tiers(code),
  budget_allocation numeric(12,2),
  placement_fee numeric(12,2) not null default 0,
  pricing_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'enabled' check (status in ('enabled','paused','disabled','completed')),
  actual_spend numeric(12,2) not null default 0,
  actual_impressions integer not null default 0,
  actual_clicks integer not null default 0,
  actual_conversions integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(campaign_id,placement_code)
);
create index if not exists idx_campaign_placements_campaign on public.campaign_placements(campaign_id,status);
create index if not exists idx_campaign_placements_delivery on public.campaign_placements(placement_code,status,tier_code);
alter table public.campaign_placements enable row level security;
drop policy if exists campaign_placements_owner_read on public.campaign_placements;
create policy campaign_placements_owner_read on public.campaign_placements for select to authenticated using (exists(select 1 from public.promotion_campaigns pc where pc.id=campaign_id and (pc.seller_id=auth.uid() or public.is_admin(auth.uid()))));
grant select on public.campaign_placements to authenticated;

create table if not exists public.promotion_creatives (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.promotion_campaigns(id) on delete cascade,
  campaign_asset_id uuid references public.campaign_assets(id) on delete cascade,
  creative_type text not null default 'card',
  headline text,
  description text,
  media_url text,
  cta_label text,
  allow_comments boolean not null default true,
  moderation_status text not null default 'pending' check (moderation_status in ('pending','approved','rejected')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_promotion_creatives_campaign on public.promotion_creatives(campaign_id,campaign_asset_id);
alter table public.promotion_creatives enable row level security;
drop policy if exists promotion_creatives_owner_all on public.promotion_creatives;
create policy promotion_creatives_owner_all on public.promotion_creatives for all to authenticated using (created_by=auth.uid() or public.is_admin(auth.uid())) with check (created_by=auth.uid() or public.is_admin(auth.uid()));
grant select,insert,update,delete on public.promotion_creatives to authenticated;

create table if not exists public.promotion_engagements (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.promotion_campaigns(id) on delete cascade,
  campaign_asset_id uuid references public.campaign_assets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  engagement_type text not null check (engagement_type in ('like','favorite')),
  placement text not null,
  created_at timestamptz not null default now(),
  unique(campaign_id,campaign_asset_id,user_id,engagement_type)
);
alter table public.promotion_engagements enable row level security;
drop policy if exists promotion_engagements_read on public.promotion_engagements;
create policy promotion_engagements_read on public.promotion_engagements for select to authenticated using (true);
drop policy if exists promotion_engagements_own_insert on public.promotion_engagements;
create policy promotion_engagements_own_insert on public.promotion_engagements for insert to authenticated with check (user_id=auth.uid() and exists(select 1 from public.promotion_campaigns pc where pc.id=campaign_id and pc.status='active' and pc.payment_status='paid'));
drop policy if exists promotion_engagements_own_delete on public.promotion_engagements;
create policy promotion_engagements_own_delete on public.promotion_engagements for delete to authenticated using (user_id=auth.uid());
grant select,insert,delete on public.promotion_engagements to authenticated;

create table if not exists public.promotion_comments (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.promotion_campaigns(id) on delete cascade,
  campaign_asset_id uuid references public.campaign_assets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  placement text not null,
  moderation_status text not null default 'visible' check (moderation_status in ('visible','hidden','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_promotion_comments_campaign on public.promotion_comments(campaign_id,campaign_asset_id,created_at desc);
alter table public.promotion_comments enable row level security;
drop policy if exists promotion_comments_visible_read on public.promotion_comments;
create policy promotion_comments_visible_read on public.promotion_comments for select to authenticated using (moderation_status='visible' or user_id=auth.uid() or public.is_admin(auth.uid()));
drop policy if exists promotion_comments_own_insert on public.promotion_comments;
create policy promotion_comments_own_insert on public.promotion_comments for insert to authenticated with check (user_id=auth.uid() and exists(select 1 from public.promotion_campaigns pc where pc.id=campaign_id and pc.status='active' and pc.payment_status='paid' and pc.allow_comments=true));
drop policy if exists promotion_comments_own_update on public.promotion_comments;
create policy promotion_comments_own_update on public.promotion_comments for update to authenticated using (user_id=auth.uid() or public.is_admin(auth.uid())) with check (user_id=auth.uid() or public.is_admin(auth.uid()));
grant select,insert,update on public.promotion_comments to authenticated;

create table if not exists public.promotion_feedback (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.promotion_campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  feedback_type text not null check (feedback_type in ('hide','not_relevant','report')),
  placement text,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists idx_promotion_feedback_user_campaign on public.promotion_feedback(user_id,campaign_id,created_at desc);
alter table public.promotion_feedback enable row level security;
drop policy if exists promotion_feedback_own_read on public.promotion_feedback;
create policy promotion_feedback_own_read on public.promotion_feedback for select to authenticated using (user_id=auth.uid() or public.is_admin(auth.uid()));
drop policy if exists promotion_feedback_own_insert on public.promotion_feedback;
create policy promotion_feedback_own_insert on public.promotion_feedback for insert to authenticated with check (user_id=auth.uid());
grant select,insert on public.promotion_feedback to authenticated;

alter table public.sponsored_listing_logs add column if not exists campaign_asset_id uuid references public.campaign_assets(id) on delete set null;
alter table public.sponsored_listing_logs add column if not exists session_id text;
alter table public.sponsored_listing_logs add column if not exists view_context jsonb not null default '{}'::jsonb;
create index if not exists idx_sponsored_logs_frequency_user on public.sponsored_listing_logs(user_id,campaign_id,placement,created_at desc);
create index if not exists idx_sponsored_logs_frequency_session on public.sponsored_listing_logs(session_id,campaign_id,placement,created_at desc) where session_id is not null;

insert into public.campaign_assets(campaign_id,asset_type,asset_id,owner_id,allocation_amount,allocation_percent,title_snapshot,destination_snapshot,sort_order)
select pc.id,
       case lower(pc.listing_type) when 'service' then 'service' when 'course' then 'course' when 'job' then 'job' else lower(pc.listing_type) end,
       pc.listing_id, pc.seller_id, coalesce(pc.media_budget,pc.budget), 100, null,
       case when lower(pc.listing_type) in ('product','service','course') then '/product/'||pc.listing_id::text when lower(pc.listing_type)='job' then '/jobs/'||pc.listing_id::text else null end,
       0
from public.promotion_campaigns pc
on conflict(campaign_id,asset_type,asset_id) do nothing;

insert into public.campaign_placements(campaign_id,placement_code,tier_code,placement_fee,pricing_snapshot)
select pc.id, pcode, pc.tier_code, 0, jsonb_build_object('legacy_backfill',true,'captured_at',now())
from public.promotion_campaigns pc
cross join lateral unnest(coalesce(pc.placements,array['marketplace']::text[])) pcode
join public.ad_placements ap on ap.code=pcode
on conflict(campaign_id,placement_code) do nothing;

revoke insert,update,delete,truncate on public.campaign_assets from anon,authenticated;
revoke insert,update,delete,truncate on public.campaign_placements from anon,authenticated;
