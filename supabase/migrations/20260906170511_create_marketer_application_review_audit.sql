create table if not exists public.marketer_application_review_audit (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.users(id) on delete cascade,
  reviewer_id uuid not null references public.users(id) on delete restrict,
  decision text not null check (decision in ('approved','rejected','needs_changes')),
  note text,
  social_links_snapshot jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_marketer_application_review_audit_applicant on public.marketer_application_review_audit(applicant_id, created_at desc);
create index if not exists idx_marketer_application_review_audit_reviewer on public.marketer_application_review_audit(reviewer_id, created_at desc);
alter table public.marketer_application_review_audit enable row level security;