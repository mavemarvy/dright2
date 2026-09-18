create table if not exists public.support_channel_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid null references public.support_tickets(id) on delete set null,
  reply_id uuid null references public.ticket_replies(id) on delete set null,
  user_id uuid null references public.users(id) on delete set null,
  channel text not null,
  direction text not null,
  status text not null,
  external_chat_id text null,
  external_message_id text null,
  provider text null,
  attempt_count integer not null default 1,
  error_code text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  delivered_at timestamptz null,
  constraint support_channel_delivery_logs_channel_check check (channel in ('telegram','whatsapp','email','sms','in_app')),
  constraint support_channel_delivery_logs_direction_check check (direction in ('inbound','outbound')),
  constraint support_channel_delivery_logs_status_check check (status in ('received','queued','sent','failed','skipped')),
  constraint support_channel_delivery_logs_attempt_count_check check (attempt_count >= 1)
);

create index if not exists support_channel_delivery_logs_ticket_idx
  on public.support_channel_delivery_logs(ticket_id, created_at desc);
create index if not exists support_channel_delivery_logs_user_idx
  on public.support_channel_delivery_logs(user_id, created_at desc);
create index if not exists support_channel_delivery_logs_channel_status_idx
  on public.support_channel_delivery_logs(channel, status, created_at desc);

alter table public.support_channel_delivery_logs enable row level security;

drop policy if exists "Support staff can view delivery logs" on public.support_channel_delivery_logs;
create policy "Support staff can view delivery logs"
  on public.support_channel_delivery_logs
  for select
  to authenticated
  using (public.is_support_staff(auth.uid()));

revoke insert, update, delete on public.support_channel_delivery_logs from authenticated;
grant select on public.support_channel_delivery_logs to authenticated;
