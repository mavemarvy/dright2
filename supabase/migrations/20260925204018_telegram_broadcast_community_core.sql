create table if not exists public.telegram_broadcast_chats (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null unique,
  chat_type text not null check (chat_type in ('group','supergroup','channel','private')),
  title text,
  username text,
  bot_status text not null default 'member',
  bot_permissions jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  publish_enabled boolean not null default true,
  moderation_enabled boolean not null default false,
  welcome_enabled boolean not null default true,
  join_requests_enabled boolean not null default true,
  request_invite_link text,
  discovered_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists telegram_broadcast_chats_type_active_idx
  on public.telegram_broadcast_chats(chat_type,is_active);

create table if not exists public.telegram_broadcast_subscribers (
  telegram_user_id text primary key,
  private_chat_id text not null unique,
  username text,
  first_name text,
  last_name text,
  is_active boolean not null default true,
  subscribed_news boolean not null default true,
  subscribed_promotions boolean not null default true,
  subscribed_recommendations boolean not null default true,
  categories text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.telegram_broadcast_join_requests (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null,
  telegram_user_id text not null,
  username text,
  first_name text,
  last_name text,
  status text not null default 'pending' check (status in ('pending','approved','declined','cancelled')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  unique(chat_id,telegram_user_id,status)
);

create index if not exists telegram_broadcast_join_requests_pending_idx
  on public.telegram_broadcast_join_requests(chat_id,requested_at desc)
  where status='pending';

create table if not exists public.telegram_broadcast_welcome_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null,
  telegram_user_id text not null,
  message_id text not null,
  acknowledged_at timestamptz,
  deleted_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique(chat_id,message_id)
);

create index if not exists telegram_broadcast_welcome_expiry_idx
  on public.telegram_broadcast_welcome_messages(expires_at)
  where deleted_at is null;

create table if not exists public.telegram_broadcast_campaigns (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('news','promotion','product','recommendation','admin')),
  source_id text,
  title text,
  body text,
  media_url text,
  media_type text,
  cta_label text,
  cta_url text,
  status text not null default 'queued' check (status in ('draft','queued','sending','sent','partial','failed','cancelled')),
  audience jsonb not null default '{"chats":"all","subscribers":[]}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text unique,
  created_by uuid references public.users(id) on delete set null,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  stats jsonb not null default '{}'::jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists telegram_broadcast_campaigns_queue_idx
  on public.telegram_broadcast_campaigns(status,queued_at);

create table if not exists public.telegram_broadcast_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.telegram_broadcast_campaigns(id) on delete cascade,
  destination_type text not null check (destination_type in ('chat','subscriber')),
  destination_id text not null,
  status text not null default 'queued' check (status in ('queued','sent','failed','skipped')),
  telegram_message_id text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  error_code text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique(campaign_id,destination_type,destination_id)
);

create index if not exists telegram_broadcast_deliveries_campaign_idx
  on public.telegram_broadcast_deliveries(campaign_id,status);

create table if not exists public.telegram_broadcast_moderation_events (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null,
  telegram_user_id text,
  message_id text,
  action text not null check (action in ('deleted','warned','support_redirect','ignored')),
  reason text,
  matched_term text,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.telegram_broadcast_settings (
  singleton boolean primary key default true check (singleton),
  support_bot_username text not null default 'DrightSupportBot',
  welcome_enabled boolean not null default true,
  welcome_template text not null default 'Welcome, {name}, to {chat}. Please keep the community useful and respectful. For account disputes, allegations, payments, orders, withdrawals, verification, or private support, use @DrightSupportBot.',
  welcome_delete_after_seconds integer not null default 180 check (welcome_delete_after_seconds between 30 and 86400),
  moderation_enabled boolean not null default true,
  delete_blocked_messages boolean not null default true,
  blocked_terms text[] not null default '{}'::text[],
  support_redirect_terms text[] not null default array['fraud','scam','stole','stolen','stealing','chargeback','dispute','allegation'],
  auto_create_join_request_link boolean not null default true,
  private_broadcasts_enabled boolean not null default true,
  news_broadcasts_enabled boolean not null default true,
  promotion_broadcasts_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null
);

insert into public.telegram_broadcast_settings(singleton)
values (true)
on conflict(singleton) do nothing;

alter table public.telegram_broadcast_chats enable row level security;
alter table public.telegram_broadcast_subscribers enable row level security;
alter table public.telegram_broadcast_join_requests enable row level security;
alter table public.telegram_broadcast_welcome_messages enable row level security;
alter table public.telegram_broadcast_campaigns enable row level security;
alter table public.telegram_broadcast_deliveries enable row level security;
alter table public.telegram_broadcast_moderation_events enable row level security;
alter table public.telegram_broadcast_settings enable row level security;

drop policy if exists "Admins manage telegram broadcast chats" on public.telegram_broadcast_chats;
create policy "Admins manage telegram broadcast chats" on public.telegram_broadcast_chats
  for all to authenticated using ((select public.is_admin_user())) with check ((select public.is_admin_user()));
drop policy if exists "Admins manage telegram broadcast subscribers" on public.telegram_broadcast_subscribers;
create policy "Admins manage telegram broadcast subscribers" on public.telegram_broadcast_subscribers
  for all to authenticated using ((select public.is_admin_user())) with check ((select public.is_admin_user()));
drop policy if exists "Admins manage telegram broadcast join requests" on public.telegram_broadcast_join_requests;
create policy "Admins manage telegram broadcast join requests" on public.telegram_broadcast_join_requests
  for all to authenticated using ((select public.is_admin_user())) with check ((select public.is_admin_user()));
drop policy if exists "Admins manage telegram broadcast welcome messages" on public.telegram_broadcast_welcome_messages;
create policy "Admins manage telegram broadcast welcome messages" on public.telegram_broadcast_welcome_messages
  for all to authenticated using ((select public.is_admin_user())) with check ((select public.is_admin_user()));
drop policy if exists "Admins manage telegram broadcast campaigns" on public.telegram_broadcast_campaigns;
create policy "Admins manage telegram broadcast campaigns" on public.telegram_broadcast_campaigns
  for all to authenticated using ((select public.is_admin_user())) with check ((select public.is_admin_user()));
drop policy if exists "Admins manage telegram broadcast deliveries" on public.telegram_broadcast_deliveries;
create policy "Admins manage telegram broadcast deliveries" on public.telegram_broadcast_deliveries
  for all to authenticated using ((select public.is_admin_user())) with check ((select public.is_admin_user()));
drop policy if exists "Admins manage telegram moderation events" on public.telegram_broadcast_moderation_events;
create policy "Admins manage telegram moderation events" on public.telegram_broadcast_moderation_events
  for all to authenticated using ((select public.is_admin_user())) with check ((select public.is_admin_user()));
drop policy if exists "Admins manage telegram broadcast settings" on public.telegram_broadcast_settings;
create policy "Admins manage telegram broadcast settings" on public.telegram_broadcast_settings
  for all to authenticated using ((select public.is_admin_user())) with check ((select public.is_admin_user()));

alter table public.promotion_distribution_settings
  add column if not exists external_platforms_enabled boolean not null default true,
  add column if not exists external_platforms_label text not null default 'Publish Promotion to External Platforms';

insert into public.ad_placements(
  code,name,description,enabled,minimum_tier_rank,contextual,premium,surcharge,
  density_organic_interval,frequency_cap,frequency_window_hours,
  supported_asset_types,supported_goals,creative_types,preview_key,sort_order
) values (
  'external_platforms','Publish Promotion to External Platforms',
  'Publish an approved promotion to DRIGHT-managed external community and subscriber destinations.',
  true,1,false,true,0,999,1,24,
  array['product','service','course','job','campaign','store','profile','sales_team'],
  '{}'::text[],array['external_post'],'external_platforms',340
)
on conflict(code) do update set
  name=excluded.name, description=excluded.description, enabled=excluded.enabled,
  minimum_tier_rank=excluded.minimum_tier_rank, premium=excluded.premium,
  supported_asset_types=excluded.supported_asset_types,
  creative_types=excluded.creative_types, preview_key=excluded.preview_key,
  sort_order=excluded.sort_order, updated_at=now();

insert into public.promotion_tier_placements(tier_code,placement_code,is_included,surcharge_override)
values
  ('normal','external_platforms',true,null),
  ('plus','external_platforms',true,null),
  ('platinum','external_platforms',true,null)
on conflict(tier_code,placement_code) do update set is_included=true;

create or replace function public.enqueue_external_promotion_broadcast()
returns trigger language plpgsql set search_path=public as $$
declare v_assets jsonb;
begin
  if new.status='active'
     and new.payment_status='paid'
     and new.moderation_status='approved'
     and 'external_platforms'=any(coalesce(new.placements,'{}'::text[]))
  then
    select coalesce(jsonb_agg(jsonb_build_object(
      'campaign_asset_id',ca.id,'asset_type',ca.asset_type,'asset_id',ca.asset_id,
      'title',ca.title_snapshot,'image_url',ca.image_snapshot,'destination',ca.destination_snapshot
    ) order by ca.sort_order,ca.created_at),'[]'::jsonb)
    into v_assets
    from public.campaign_assets ca
    where ca.campaign_id=new.id and ca.status='eligible';

    insert into public.telegram_broadcast_campaigns(
      source_type,source_id,title,body,status,audience,payload,idempotency_key,created_by
    ) values (
      'promotion',new.id::text,'Sponsored on DRIGHT',
      'A promoted DRIGHT listing is ready for external publication.','queued',
      '{"chats":"all","subscribers":["promotions"]}'::jsonb,
      jsonb_build_object(
        'promotion_campaign_id',new.id,'seller_id',new.seller_id,'tier_code',new.tier_code,
        'goal',new.goal,'billing_currency',new.billing_currency,'assets',v_assets
      ),
      'promotion:'||new.id::text,new.reviewed_by
    )
    on conflict(idempotency_key) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enqueue_external_promotion_broadcast on public.promotion_campaigns;
create trigger trg_enqueue_external_promotion_broadcast
after insert or update of status,payment_status,moderation_status,placements
on public.promotion_campaigns
for each row execute function public.enqueue_external_promotion_broadcast();

do $$ begin alter publication supabase_realtime add table public.telegram_broadcast_chats; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.telegram_broadcast_join_requests; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.telegram_broadcast_campaigns; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.telegram_broadcast_deliveries; exception when duplicate_object then null; end $$;
