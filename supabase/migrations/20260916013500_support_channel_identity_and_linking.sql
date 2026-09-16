-- Foundation for safely linking external support channels (Telegram first)
-- to a DRIGHT account without exposing auth credentials to the external channel.

create table if not exists public.support_channel_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  channel text not null,
  external_user_id text not null,
  external_chat_id text,
  external_username text,
  status text not null default 'active',
  linked_at timestamptz not null default now(),
  verified_at timestamptz not null default now(),
  last_seen_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_channel_identities_channel_check check (channel in ('telegram','whatsapp','email','sms')),
  constraint support_channel_identities_status_check check (status in ('active','revoked')),
  constraint support_channel_identity_external_unique unique (channel, external_user_id),
  constraint support_channel_identity_user_unique unique (user_id, channel)
);

create table if not exists public.support_channel_link_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  channel text not null,
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint support_channel_link_codes_channel_check check (channel in ('telegram','whatsapp','email','sms')),
  constraint support_channel_link_codes_attempts_check check (attempts between 0 and 20)
);

create index if not exists idx_support_channel_identities_user on public.support_channel_identities(user_id, channel, status);
create index if not exists idx_support_channel_link_codes_user on public.support_channel_link_codes(user_id, channel, expires_at desc);
create index if not exists idx_support_channel_link_codes_expiry on public.support_channel_link_codes(expires_at) where used_at is null;

alter table public.support_channel_identities enable row level security;
alter table public.support_channel_link_codes enable row level security;

drop policy if exists support_channel_identities_select on public.support_channel_identities;
drop policy if exists support_channel_identities_update on public.support_channel_identities;
drop policy if exists support_channel_link_codes_select on public.support_channel_link_codes;

create policy support_channel_identities_select
on public.support_channel_identities for select to authenticated
using (user_id = auth.uid() or public.is_support_staff(auth.uid()));

create policy support_channel_identities_update
on public.support_channel_identities for update to authenticated
using (user_id = auth.uid() or public.is_support_staff(auth.uid()))
with check (user_id = auth.uid() or public.is_support_staff(auth.uid()));

create policy support_channel_link_codes_select
on public.support_channel_link_codes for select to authenticated
using (user_id = auth.uid());

revoke insert, delete on public.support_channel_identities from authenticated;
revoke insert, update, delete on public.support_channel_link_codes from authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='support_channel_identities'
  ) then
    execute 'alter publication supabase_realtime add table public.support_channel_identities';
  end if;
end $$;