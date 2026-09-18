-- DRIGHT secure email-code support for Auth/PIN recovery.
-- Auth OTPs are issued by Supabase Auth; PIN OTPs are service-generated,
-- short-lived and consumed atomically.

begin;

create table if not exists public.auth_email_code_requests (
  id uuid primary key default gen_random_uuid(),
  email_hash text not null,
  purpose text not null check (purpose in ('password_reset','account_verification')),
  success boolean not null default false,
  ip_hash text,
  error_code text,
  created_at timestamptz not null default now()
);

alter table public.auth_email_code_requests enable row level security;
revoke all on table public.auth_email_code_requests from public, anon, authenticated;
grant all on table public.auth_email_code_requests to service_role;
create index if not exists idx_auth_email_code_requests_rate
  on public.auth_email_code_requests(email_hash, purpose, created_at desc);

create table if not exists public.payment_pin_email_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.payment_pin_email_codes enable row level security;
revoke all on table public.payment_pin_email_codes from public, anon, authenticated;
grant all on table public.payment_pin_email_codes to service_role;
create index if not exists idx_payment_pin_email_codes_active
  on public.payment_pin_email_codes(user_id, created_at desc)
  where used_at is null;

create or replace function public.consume_payment_pin_email_code(
  p_code_id uuid,
  p_user_id uuid,
  p_new_pin_hash text,
  p_pin_length integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code public.payment_pin_email_codes%rowtype;
begin
  if current_user <> 'service_role' then
    raise exception 'Service role required';
  end if;

  if p_pin_length < 4 or p_pin_length > 8
     or p_new_pin_hash is null
     or length(p_new_pin_hash) < 32 then
    return jsonb_build_object('success',false,'error','Invalid PIN payload');
  end if;

  select *
  into v_code
  from public.payment_pin_email_codes
  where id = p_code_id
    and user_id = p_user_id
  for update;

  if not found
     or v_code.used_at is not null
     or v_code.expires_at <= now()
     or v_code.attempts >= 5 then
    return jsonb_build_object('success',false,'error','Code expired or unavailable');
  end if;

  update public.payment_security
  set pin_hash = p_new_pin_hash,
      pin_length = p_pin_length,
      is_locked = false,
      failed_attempts = 0,
      locked_until = null,
      last_pin_change = now(),
      updated_at = now(),
      auth_rules = coalesce(auth_rules,'{}'::jsonb) - 'force_reset_required'
  where user_id = p_user_id
    and is_active = true;

  if not found then
    return jsonb_build_object('success',false,'error','Payment PIN is not configured');
  end if;

  update public.payment_pin_email_codes
  set used_at = now()
  where user_id = p_user_id
    and used_at is null;

  delete from public.payment_authorizations
  where user_id = p_user_id;

  insert into public.payment_security_logs(user_id,event_type,description)
  values (p_user_id,'pin_recovered','Payment PIN reset with an emailed verification code');

  return jsonb_build_object('success',true);
end;
$$;

revoke all on function public.consume_payment_pin_email_code(uuid,uuid,text,integer)
  from public, anon, authenticated;
grant execute on function public.consume_payment_pin_email_code(uuid,uuid,text,integer)
  to service_role;

-- Do not email a notification whose purpose is to tell the signed-in user that
-- a secret code was sent by email. The code itself is never stored in metadata.
drop trigger if exists trg_queue_notification_email on public.notifications;
create trigger trg_queue_notification_email
after insert on public.notifications
for each row
when (coalesce(new.metadata->>'email_suppressed','false') <> 'true')
execute function public.queue_notification_email();

commit;
