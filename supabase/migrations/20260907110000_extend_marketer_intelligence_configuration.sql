alter table public.system_config
  add column if not exists marketer_intelligence_config jsonb not null default '{"weights":{"sales":45,"trust":20,"growth":15,"customer_quality":10,"reliability":10},"follower_drop_thresholds":{"info":10,"medium":25,"high":50},"follower_spike_percent":200,"monitoring_intervals_days":{"HEALTHY":30,"WATCH":14,"AT_RISK":7,"FLAGGED":0,"UNKNOWN":30},"reward_rules":{"top_weekly_limit":10,"block_restricted":true,"block_suspended":true,"block_high_risk":true,"block_critical_signal":true}}'::jsonb;

create index if not exists idx_marketer_social_snapshots_profile_history
  on public.marketer_social_analysis_snapshots(applicant_id, profile_url, analyzed_at desc);

create index if not exists idx_marketer_deep_research_profile_history
  on public.marketer_profile_deep_research(applicant_id, profile_url, created_at desc);

create index if not exists idx_leaderboard_snapshots_marketer_weekly
  on public.leaderboard_snapshots(category, period, snapshot_date desc);

create index if not exists idx_sales_records_promoter_period
  on public.sales_records(promoter_id, sale_date desc)
  where status = 'paid';