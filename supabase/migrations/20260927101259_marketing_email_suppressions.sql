create table if not exists public.marketing_email_suppressions (
  id uuid primary key default gen_random_uuid(),
  recipient_email text not null,
  unsubscribe_token uuid not null unique default gen_random_uuid(),
  source text not null default 'email',
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists marketing_email_suppressions_recipient_email_lower_idx
  on public.marketing_email_suppressions (lower(recipient_email));

alter table public.marketing_email_suppressions enable row level security;
revoke all on table public.marketing_email_suppressions from anon, authenticated;
