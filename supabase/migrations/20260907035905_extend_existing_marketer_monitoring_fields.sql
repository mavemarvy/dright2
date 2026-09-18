alter table public.users
  add column if not exists marketer_monitoring_status text not null default 'HEALTHY',
  add column if not exists marketer_last_verified_at timestamptz,
  add column if not exists marketer_next_verification_due_at timestamptz,
  add column if not exists marketer_monitoring_flags jsonb not null default '[]'::jsonb;
create index if not exists idx_users_marketer_monitoring_status on public.users(marketer_monitoring_status);
create index if not exists idx_marketer_social_snapshots_applicant_analyzed on public.marketer_social_analysis_snapshots(applicant_id, analyzed_at desc);