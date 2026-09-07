alter table public.marketer_social_analysis_snapshots
  add column if not exists username text,
  add column if not exists verification_type text not null default 'initial',
  add column if not exists analysis_status text not null default 'completed',
  add column if not exists engagement_estimate numeric,
  add column if not exists authenticity_score numeric,
  add column if not exists bot_risk_score numeric,
  add column if not exists fraud_risk_score numeric,
  add column if not exists profile_health_score numeric,
  add column if not exists identity_confidence numeric,
  add column if not exists research_confidence numeric,
  add column if not exists data_source text,
  add column if not exists evidence_summary text,
  add column if not exists raw_analysis_reference jsonb;

alter table public.marketer_profile_deep_research
  add column if not exists providers_used jsonb not null default '[]'::jsonb,
  add column if not exists search_sources jsonb not null default '[]'::jsonb,
  add column if not exists failure_category text,
  add column if not exists evidence_count integer not null default 0,
  add column if not exists confidence numeric,
  add column if not exists summary text,
  add column if not exists recommendation text,
  add column if not exists limitations jsonb not null default '[]'::jsonb;

alter table public.system_config
  add column if not exists marketer_ranking_weights jsonb not null default '{"sales":45,"trust":20,"growth":15,"customer_quality":10,"reliability":10}'::jsonb,
  add column if not exists marketer_monitoring_thresholds jsonb not null default '{"follower_drop_info_pct":10,"follower_drop_medium_pct":25,"follower_drop_high_pct":50,"follower_spike_pct":200}'::jsonb,
  add column if not exists marketer_reward_rules jsonb not null default '{"top_weekly_limit":10,"exclude_suspended":true,"exclude_restricted":true,"exclude_high_risk":true,"exclude_critical_unresolved_signal":true}'::jsonb;

create table if not exists public.marketer_monitoring_signals (
  id uuid primary key default gen_random_uuid(),
  marketer_id uuid not null references public.users(id) on delete cascade,
  profile_url text not null,
  platform text,
  signal_type text not null,
  severity text not null check (severity in ('info','low','medium','high','critical')),
  confidence numeric,
  description text not null,
  previous_value jsonb,
  current_value jsonb,
  evidence_reference jsonb,
  status text not null default 'open' check (status in ('open','resolved','dismissed','escalated')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.users(id)
);

alter table public.marketer_monitoring_signals enable row level security;

create index if not exists idx_marketer_monitoring_signals_marketer_created
  on public.marketer_monitoring_signals(marketer_id, created_at desc);
create index if not exists idx_marketer_monitoring_signals_profile_created
  on public.marketer_monitoring_signals(marketer_id, profile_url, created_at desc);
create index if not exists idx_marketer_monitoring_signals_status
  on public.marketer_monitoring_signals(status, severity, created_at desc);

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='marketer_monitoring_signals' and policyname='marketer_monitoring_signals_admin_select') then
    create policy marketer_monitoring_signals_admin_select on public.marketer_monitoring_signals for select to authenticated using (exists (select 1 from public.users u where u.id=auth.uid() and u.is_admin=true and lower(coalesce(u.admin_status,''))='active' and coalesce(u.admin_role,u.role)=any(array['super_admin','sales_team_manager','sales_marketing_admin','advertising_admin','ai_admin','system_admin','marketplace_admin','moderator'])));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='marketer_monitoring_signals' and policyname='marketer_monitoring_signals_admin_insert') then
    create policy marketer_monitoring_signals_admin_insert on public.marketer_monitoring_signals for insert to authenticated with check (exists (select 1 from public.users u where u.id=auth.uid() and u.is_admin=true and lower(coalesce(u.admin_status,''))='active' and coalesce(u.admin_role,u.role)=any(array['super_admin','sales_team_manager','sales_marketing_admin','advertising_admin','ai_admin','system_admin','marketplace_admin','moderator'])));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='marketer_monitoring_signals' and policyname='marketer_monitoring_signals_admin_update') then
    create policy marketer_monitoring_signals_admin_update on public.marketer_monitoring_signals for update to authenticated using (exists (select 1 from public.users u where u.id=auth.uid() and u.is_admin=true and lower(coalesce(u.admin_status,''))='active' and coalesce(u.admin_role,u.role)=any(array['super_admin','sales_team_manager','sales_marketing_admin','advertising_admin','ai_admin','system_admin','marketplace_admin','moderator']))) with check (exists (select 1 from public.users u where u.id=auth.uid() and u.is_admin=true and lower(coalesce(u.admin_status,''))='active' and coalesce(u.admin_role,u.role)=any(array['super_admin','sales_team_manager','sales_marketing_admin','advertising_admin','ai_admin','system_admin','marketplace_admin','moderator'])));
  end if;
end $$;