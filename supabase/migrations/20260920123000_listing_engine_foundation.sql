-- DRIGHT2 Listing Engine Foundation
-- Additive-only migration. This migration intentionally does NOT alter:
-- products, jobs, orders, sales_team_*, promotion_*, commission_splits,
-- commission_rate_rules, platform_accounts, ledger tables, or existing fee columns.

begin;

create table if not exists public.marketplace_engine_settings (
  id boolean primary key default true check (id),
  taxonomy_enabled boolean not null default false,
  dynamic_forms_enabled boolean not null default false,
  seller_commission_policy_enabled boolean not null default false,
  legacy_fallback_enabled boolean not null default true,
  engine_version integer not null default 1 check (engine_version >= 1),
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null
);

create table if not exists public.marketplace_listing_types (
  code text primary key,
  label text not null,
  description text,
  legacy_entity_table text,
  legacy_type_value text,
  is_enabled boolean not null default true,
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_listing_types_code_chk check (code = upper(code))
);

create table if not exists public.marketplace_taxonomy_categories (
  id uuid primary key default gen_random_uuid(),
  listing_type_code text not null references public.marketplace_listing_types(code) on update cascade on delete restrict,
  parent_id uuid references public.marketplace_taxonomy_categories(id) on delete restrict,
  name text not null,
  slug text not null,
  description text,
  icon text,
  image_url text,
  sort_order integer not null default 100,
  is_leaf boolean not null default false,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_taxonomy_no_self_parent_chk check (parent_id is null or parent_id <> id),
  constraint marketplace_taxonomy_slug_chk check (length(trim(slug)) > 0)
);

create unique index if not exists marketplace_taxonomy_parent_slug_uidx
  on public.marketplace_taxonomy_categories (
    listing_type_code,
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(slug)
  );

create index if not exists marketplace_taxonomy_children_idx
  on public.marketplace_taxonomy_categories(listing_type_code, parent_id, sort_order)
  where is_active = true;

create table if not exists public.marketplace_attribute_definitions (
  id uuid primary key default gen_random_uuid(),
  listing_type_code text not null references public.marketplace_listing_types(code) on update cascade on delete restrict,
  category_id uuid references public.marketplace_taxonomy_categories(id) on delete cascade,
  attribute_key text not null,
  label text not null,
  input_type text not null default 'text',
  is_required boolean not null default false,
  is_searchable boolean not null default false,
  is_filterable boolean not null default false,
  is_sortable boolean not null default false,
  is_comparable boolean not null default false,
  show_on_card boolean not null default false,
  show_on_details boolean not null default true,
  options jsonb not null default '[]'::jsonb,
  validation jsonb not null default '{}'::jsonb,
  sort_order integer not null default 100,
  schema_version integer not null default 1 check (schema_version >= 1),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_attribute_key_chk check (attribute_key ~ '^[a-z][a-z0-9_]*$'),
  constraint marketplace_attribute_input_type_chk check (
    input_type in (
      'text','textarea','number','currency','select','multi_select','radio',
      'checkbox','toggle','date','datetime','location','image','file','video',
      'url','email','phone','range','tags','json'
    )
  )
);

create unique index if not exists marketplace_attribute_scope_key_uidx
  on public.marketplace_attribute_definitions (
    listing_type_code,
    coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid),
    attribute_key,
    schema_version
  );

create index if not exists marketplace_attribute_lookup_idx
  on public.marketplace_attribute_definitions(listing_type_code, category_id, sort_order)
  where is_active = true;

create table if not exists public.marketplace_listing_extensions (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  listing_type_code text not null references public.marketplace_listing_types(code) on update cascade on delete restrict,
  category_id uuid references public.marketplace_taxonomy_categories(id) on delete set null,
  schema_version integer not null default 1 check (schema_version >= 1),
  attributes jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(entity_type, entity_id),
  constraint marketplace_listing_extensions_entity_type_chk check (entity_type ~ '^[a-z][a-z0-9_]*$')
);

create index if not exists marketplace_listing_extensions_category_idx
  on public.marketplace_listing_extensions(listing_type_code, category_id);

create table if not exists public.marketplace_seller_commission_policies (
  id uuid primary key default gen_random_uuid(),
  listing_type_code text not null references public.marketplace_listing_types(code) on update cascade on delete restrict,
  category_id uuid references public.marketplace_taxonomy_categories(id) on delete cascade,
  commission_kind text not null default 'affiliate',
  default_percentage numeric(6,3) not null default 10,
  min_percentage numeric(6,3) not null default 0,
  max_percentage numeric(6,3) not null default 100,
  allow_seller_override boolean not null default true,
  priority integer not null default 100,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_seller_commission_kind_chk check (commission_kind = 'affiliate'),
  constraint marketplace_seller_commission_bounds_chk check (
    min_percentage >= 0
    and max_percentage <= 100
    and min_percentage <= default_percentage
    and default_percentage <= max_percentage
  )
);

create unique index if not exists marketplace_seller_commission_scope_uidx
  on public.marketplace_seller_commission_policies (
    listing_type_code,
    coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid),
    commission_kind,
    priority
  );

create index if not exists marketplace_seller_commission_lookup_idx
  on public.marketplace_seller_commission_policies(listing_type_code, category_id, priority)
  where is_active = true;

create or replace function public.marketplace_engine_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_marketplace_engine_settings_updated_at on public.marketplace_engine_settings;
create trigger trg_marketplace_engine_settings_updated_at
before update on public.marketplace_engine_settings
for each row execute function public.marketplace_engine_touch_updated_at();

drop trigger if exists trg_marketplace_listing_types_updated_at on public.marketplace_listing_types;
create trigger trg_marketplace_listing_types_updated_at
before update on public.marketplace_listing_types
for each row execute function public.marketplace_engine_touch_updated_at();

drop trigger if exists trg_marketplace_taxonomy_categories_updated_at on public.marketplace_taxonomy_categories;
create trigger trg_marketplace_taxonomy_categories_updated_at
before update on public.marketplace_taxonomy_categories
for each row execute function public.marketplace_engine_touch_updated_at();

drop trigger if exists trg_marketplace_attribute_definitions_updated_at on public.marketplace_attribute_definitions;
create trigger trg_marketplace_attribute_definitions_updated_at
before update on public.marketplace_attribute_definitions
for each row execute function public.marketplace_engine_touch_updated_at();

drop trigger if exists trg_marketplace_listing_extensions_updated_at on public.marketplace_listing_extensions;
create trigger trg_marketplace_listing_extensions_updated_at
before update on public.marketplace_listing_extensions
for each row execute function public.marketplace_engine_touch_updated_at();

drop trigger if exists trg_marketplace_seller_commission_policies_updated_at on public.marketplace_seller_commission_policies;
create trigger trg_marketplace_seller_commission_policies_updated_at
before update on public.marketplace_seller_commission_policies
for each row execute function public.marketplace_engine_touch_updated_at();

insert into public.marketplace_engine_settings(id)
values (true)
on conflict (id) do nothing;

insert into public.marketplace_listing_types
  (code, label, description, legacy_entity_table, legacy_type_value, sort_order)
values
  ('PHYSICAL', 'Physical Product', 'Tangible product listing.', 'products', 'PHYSICAL', 10),
  ('DIGITAL', 'Digital Product', 'Downloadable or digitally delivered product.', 'products', 'DIGITAL', 20),
  ('SERVICE', 'Service', 'Professional or packaged service listing.', 'products', 'SERVICE', 30),
  ('COURSE', 'Course', 'Structured learning or coaching listing.', 'products', 'COURSE', 40),
  ('JOB', 'Job', 'Employment or recruitment listing.', 'jobs', 'JOB', 50),
  ('TASK', 'Task', 'Short-duration digital or local task.', null, 'TASK', 60),
  ('PRODUCT', 'Product', 'Generic product compatibility type.', 'products', 'PRODUCT', 90),
  ('CAMPAIGN', 'Campaign', 'Compatibility type for campaign surfaces. Existing promotion authority remains separate.', 'promotion_campaigns', 'CAMPAIGN', 100)
on conflict (code) do nothing;

-- Seller-facing affiliate commission policy only.
-- This table does NOT replace commission_rate_rules and does NOT modify
-- admin_task_percent, sales_team_task_percent, platform/admin accounting, or payout logic.
insert into public.marketplace_seller_commission_policies
  (listing_type_code, default_percentage, min_percentage, max_percentage, allow_seller_override, priority, metadata)
values
  ('PHYSICAL', 10, 0, 100, true, 100, '{"compatibility":"preserve-current-product-range"}'::jsonb),
  ('DIGITAL', 10, 0, 100, true, 100, '{"compatibility":"preserve-current-product-range"}'::jsonb),
  ('SERVICE', 10, 0, 100, true, 100, '{"compatibility":"preserve-current-product-range"}'::jsonb),
  ('COURSE', 10, 0, 100, true, 100, '{"compatibility":"preserve-current-product-range"}'::jsonb),
  ('PRODUCT', 10, 0, 100, true, 100, '{"compatibility":"preserve-current-product-range"}'::jsonb),
  ('JOB', 10, 0, 70, true, 100, '{"note":"initial job maximum requested for configurable listing commissions"}'::jsonb),
  ('TASK', 10, 0, 70, true, 100, '{"note":"initial task maximum; admin-configurable later"}'::jsonb)
on conflict do nothing;

create or replace function public.resolve_marketplace_seller_commission_policy(
  p_listing_type_code text,
  p_category_id uuid default null
)
returns table (
  policy_id uuid,
  listing_type_code text,
  category_id uuid,
  commission_kind text,
  default_percentage numeric,
  min_percentage numeric,
  max_percentage numeric,
  allow_seller_override boolean,
  priority integer
)
language sql
stable
set search_path = public
as $$
  with recursive category_chain as (
    select c.id, c.parent_id, 0 as distance
    from public.marketplace_taxonomy_categories c
    where p_category_id is not null and c.id = p_category_id

    union all

    select parent.id, parent.parent_id, chain.distance + 1
    from public.marketplace_taxonomy_categories parent
    join category_chain chain on chain.parent_id = parent.id
  ),
  candidates as (
    select
      p.*,
      case
        when p.category_id is null then 1000000
        else coalesce(chain.distance, 999999)
      end as category_distance
    from public.marketplace_seller_commission_policies p
    left join category_chain chain on chain.id = p.category_id
    where p.is_active = true
      and p.listing_type_code = upper(p_listing_type_code)
      and p.commission_kind = 'affiliate'
      and (
        p.category_id is null
        or chain.id is not null
      )
  )
  select
    c.id,
    c.listing_type_code,
    c.category_id,
    c.commission_kind,
    c.default_percentage,
    c.min_percentage,
    c.max_percentage,
    c.allow_seller_override,
    c.priority
  from candidates c
  order by
    (c.category_id is not null) desc,
    c.category_distance asc,
    c.priority asc,
    c.created_at desc
  limit 1;
$$;

comment on table public.marketplace_engine_settings is
  'Feature switches for the additive DRIGHT2 listing engine. Defaults keep current legacy behavior active.';
comment on table public.marketplace_listing_extensions is
  'Optional taxonomy/schema metadata keyed to existing listing records without altering protected legacy listing tables.';
comment on table public.marketplace_seller_commission_policies is
  'Seller-facing affiliate commission bounds/defaults only. Not authoritative payout distribution and not Admin/Sales Team/platform fee logic.';
comment on function public.resolve_marketplace_seller_commission_policy(text, uuid) is
  'Resolves seller-facing affiliate commission UI policy using nearest category ancestor then listing-type fallback. Does not distribute money.';

alter table public.marketplace_engine_settings enable row level security;
alter table public.marketplace_listing_types enable row level security;
alter table public.marketplace_taxonomy_categories enable row level security;
alter table public.marketplace_attribute_definitions enable row level security;
alter table public.marketplace_listing_extensions enable row level security;
alter table public.marketplace_seller_commission_policies enable row level security;

revoke all on public.marketplace_engine_settings from anon, authenticated;
revoke all on public.marketplace_listing_types from anon, authenticated;
revoke all on public.marketplace_taxonomy_categories from anon, authenticated;
revoke all on public.marketplace_attribute_definitions from anon, authenticated;
revoke all on public.marketplace_listing_extensions from anon, authenticated;
revoke all on public.marketplace_seller_commission_policies from anon, authenticated;

grant select on public.marketplace_engine_settings to anon, authenticated;
grant select on public.marketplace_listing_types to anon, authenticated;
grant select on public.marketplace_taxonomy_categories to anon, authenticated;
grant select on public.marketplace_attribute_definitions to anon, authenticated;
grant select on public.marketplace_seller_commission_policies to anon, authenticated;

grant all on public.marketplace_engine_settings to service_role;
grant all on public.marketplace_listing_types to service_role;
grant all on public.marketplace_taxonomy_categories to service_role;
grant all on public.marketplace_attribute_definitions to service_role;
grant all on public.marketplace_listing_extensions to service_role;
grant all on public.marketplace_seller_commission_policies to service_role;

create policy marketplace_engine_settings_read
  on public.marketplace_engine_settings
  for select to anon, authenticated
  using (true);

create policy marketplace_listing_types_read
  on public.marketplace_listing_types
  for select to anon, authenticated
  using (is_enabled = true);

create policy marketplace_taxonomy_categories_read
  on public.marketplace_taxonomy_categories
  for select to anon, authenticated
  using (is_active = true);

create policy marketplace_attribute_definitions_read
  on public.marketplace_attribute_definitions
  for select to anon, authenticated
  using (is_active = true);

create policy marketplace_seller_commission_policies_read
  on public.marketplace_seller_commission_policies
  for select to anon, authenticated
  using (is_active = true);

revoke all on function public.resolve_marketplace_seller_commission_policy(text, uuid) from public;
grant execute on function public.resolve_marketplace_seller_commission_policy(text, uuid) to anon, authenticated, service_role;

commit;
