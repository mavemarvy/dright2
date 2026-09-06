-- DRIGHT2: automatic multi-platform social/professional profile analysis for Marketer applications.
-- This is analysis metadata only; the existing users.social_media_links remains the source of submitted links.

alter table public.users
  add column if not exists marketer_social_analysis jsonb not null default '[]'::jsonb;

create table if not exists public.marketer_social_analysis_snapshots (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.users(id) on delete cascade,
  profile_url text not null,
  platform text not null,
  analysis jsonb not null default '{}'::jsonb,
  analyzed_at timestamptz not null default now()
);

create index if not exists idx_marketer_social_analysis_snapshots_applicant
  on public.marketer_social_analysis_snapshots(applicant_id, analyzed_at desc);

alter table public.marketer_social_analysis_snapshots enable row level security;

-- Analysis is written by the server-side Edge Function using the service role.
-- Do not expose raw snapshot rows directly to ordinary authenticated users.
drop policy if exists "marketer_social_analysis_snapshots_no_direct_access" on public.marketer_social_analysis_snapshots;

create policy "marketer_social_analysis_snapshots_no_direct_access"
  on public.marketer_social_analysis_snapshots
  for all
  to authenticated
  using (false)
  with check (false);
