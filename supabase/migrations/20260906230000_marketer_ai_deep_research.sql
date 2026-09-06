-- DRIGHT AI deep research for marketer profile verification
alter table public.users
  add column if not exists marketer_deep_research jsonb not null default '[]'::jsonb;

create table if not exists public.marketer_profile_deep_research (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.users(id) on delete cascade,
  profile_url text not null,
  platform text,
  status text not null default 'completed',
  research jsonb not null default '{}'::jsonb,
  requested_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_marketer_profile_deep_research_applicant_created
  on public.marketer_profile_deep_research(applicant_id, created_at desc);

alter table public.marketer_profile_deep_research enable row level security;

drop policy if exists marketer_profile_deep_research_admin_service on public.marketer_profile_deep_research;
create policy marketer_profile_deep_research_admin_service
on public.marketer_profile_deep_research
for all
to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and coalesce(u.is_admin,false) = true
      and lower(coalesce(u.admin_status,'')) = 'active'
  )
)
with check (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and coalesce(u.is_admin,false) = true
      and lower(coalesce(u.admin_status,'')) = 'active'
  )
);

comment on column public.users.marketer_deep_research is
'Admin-triggered AI deep research reports. Estimates risk from available evidence and must not be treated as proof of bot/non-bot status.';