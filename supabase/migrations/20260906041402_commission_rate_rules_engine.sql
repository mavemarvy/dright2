create table if not exists public.commission_rate_rules (
 id uuid primary key default gen_random_uuid(),
 source_type text not null,
 source_level text,
 advertiser_grade text,
 product_id uuid,
 campaign_id uuid,
 percentage numeric(8,4) not null default 0,
 priority integer not null default 100,
 status text not null default 'active',
 starts_at timestamptz,
 ends_at timestamptz,
 created_by uuid,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint commission_rate_rules_source_chk check (source_type in ('affiliate','sales_team','advertiser','pro_advertiser','super_advertiser','partnership')),
 constraint commission_rate_rules_pct_chk check (percentage >= 0 and percentage <= 100),
 constraint commission_rate_rules_status_chk check (status in ('active','inactive'))
);
create index if not exists idx_commission_rate_rules_lookup on public.commission_rate_rules (source_type, source_level, advertiser_grade, product_id, campaign_id, priority);
alter table public.commission_splits add column if not exists rate_rule_id uuid references public.commission_rate_rules(id), add column if not exists rate_basis_amount numeric not null default 0;
create unique index if not exists idx_commission_splits_order_recipient_source on public.commission_splits(order_id, recipient_id, recipient_role, source_type) where order_id is not null;
revoke all on public.commission_rate_rules from anon, authenticated;
grant select on public.commission_rate_rules to service_role;
