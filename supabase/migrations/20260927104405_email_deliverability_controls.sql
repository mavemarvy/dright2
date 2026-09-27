create table if not exists public.email_delivery_settings (
  singleton boolean primary key default true check (singleton = true),
  marketing_send_enabled boolean not null default false,
  marketing_domain text not null default 'mail.dright.store',
  marketing_from_name text not null default 'DRIGHT Partnerships',
  marketing_from_email text not null default 'partnerships@mail.dright.store',
  marketing_reply_to text not null default 'partnerships@dright.store',
  marketing_domain_verified boolean not null default false,
  marketing_hourly_cap integer not null default 2 check (marketing_hourly_cap between 1 and 500),
  marketing_daily_cap integer not null default 5 check (marketing_daily_cap between 1 and 50000),
  warmup_stage text not null default 'setup'
    check (warmup_stage in ('setup','stage_1','stage_2','stage_3','stage_4','established')),
  warmup_started_at timestamptz,
  notes text,
  updated_at timestamptz not null default now()
);

insert into public.email_delivery_settings (
  singleton, marketing_send_enabled, marketing_domain, marketing_from_name,
  marketing_from_email, marketing_reply_to, marketing_domain_verified,
  marketing_hourly_cap, marketing_daily_cap, warmup_stage, notes
) values (
  true, false, 'mail.dright.store', 'DRIGHT Partnerships',
  'partnerships@mail.dright.store', 'partnerships@dright.store', false,
  2, 5, 'setup',
  'Marketing outreach is paused until the dedicated Resend subdomain is DNS-verified and deliverability-tested.'
)
on conflict (singleton) do nothing;

alter table public.email_delivery_settings enable row level security;
revoke all on table public.email_delivery_settings from anon, authenticated;
