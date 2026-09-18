-- DRIGHT dual-channel notification delivery:
-- Supabase Realtime/in-app + Resend email, durable outbox/retries,
-- social bridge, grouped view alerts, and automatic preference seeding.

begin;

-- ---------------------------------------------------------------------------
-- 1) Secure the legacy social notification insert boundary.
-- SECURITY DEFINER social functions bypass RLS; browser clients may only create
-- a follow notification after the corresponding follow relationship exists.
-- ---------------------------------------------------------------------------
drop policy if exists insert_social_notif on public.social_notifications;
drop policy if exists insert_follow_social_notif on public.social_notifications;

create policy insert_follow_social_notif
on public.social_notifications
for insert
to authenticated
with check (
  auth.uid() is not null
  and actor_id = auth.uid()
  and user_id <> auth.uid()
  and notification_type = 'follow'
  and entity_type = 'user'
  and entity_id = auth.uid()
  and exists (
    select 1
    from public.user_follows uf
    where uf.follower_id = auth.uid()
      and uf.following_id = social_notifications.user_id
  )
);

-- ---------------------------------------------------------------------------
-- 2) Email outbox. Browser roles cannot read or mutate it.
-- ---------------------------------------------------------------------------
create table if not exists public.notification_email_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid references public.notifications(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  recipient_email text not null,
  notification_type text not null,
  category text not null default 'system',
  priority text not null default 'normal',
  subject text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending','sending','retry','sent','failed','skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  provider text not null default 'resend',
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  unique(notification_id)
);

alter table public.notification_email_outbox enable row level security;
revoke all on table public.notification_email_outbox from public, anon, authenticated;
grant all on table public.notification_email_outbox to service_role;

create index if not exists idx_notification_email_outbox_pending
  on public.notification_email_outbox(status, next_attempt_at, created_at)
  where status in ('pending','retry');

create index if not exists idx_notification_email_outbox_user
  on public.notification_email_outbox(user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 3) Notification preferences. Existing explicit choices are preserved.
-- New/missing users default to Supabase in-app + Resend email.
-- ---------------------------------------------------------------------------
create or replace function public.seed_dual_notification_preferences(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_type text;
begin
  insert into public.notification_user_settings (
    user_id,
    delivery_channels,
    category_toggles,
    quiet_hours_critical_bypass,
    reminder_frequency,
    ai_summaries_enabled,
    ai_summary_frequency
  )
  values (
    p_user_id,
    '{"in_app":true,"email":true,"push":true,"sms":false}'::jsonb,
    '{}'::jsonb,
    true,
    'daily',
    true,
    'daily'
  )
  on conflict (user_id) do nothing;

  foreach v_type in array array[
    'new_order','order_status','affiliate_commission','referral_commission',
    'referral_signup','wallet_deposit','wallet_withdrawal','payout',
    'security_alert','new_follower','social_reaction','social_comment',
    'social_reply','social_mention','chat_mention','new_review',
    'promotion','marketing_update','product_view','profile_view',
    'new_message','chat_message','service_booking','job_application',
    'admin_notice','announcement','system_alert','product_approval',
    'edit_approved','edit_rejected','store_update','low_stock'
  ] loop
    insert into public.notification_preferences (
      user_id,
      notification_type,
      in_app_enabled,
      email_enabled,
      delivery_channels
    )
    values (
      p_user_id,
      v_type,
      true,
      true,
      '{"in_app":true,"email":true,"push":true,"sms":false}'::jsonb
    )
    on conflict (user_id, notification_type) do nothing;
  end loop;
end;
$$;

revoke all on function public.seed_dual_notification_preferences(uuid) from public, anon, authenticated;
grant execute on function public.seed_dual_notification_preferences(uuid) to service_role;

do $$
declare r record;
begin
  for r in select id from public.users loop
    perform public.seed_dual_notification_preferences(r.id);
  end loop;
end $$;

create or replace function public.seed_dual_notification_preferences_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.seed_dual_notification_preferences(new.id);
  return new;
end;
$$;

drop trigger if exists trg_seed_dual_notification_preferences on public.users;
create trigger trg_seed_dual_notification_preferences
after insert on public.users
for each row execute function public.seed_dual_notification_preferences_trigger();

-- ---------------------------------------------------------------------------
-- 4) Decide whether an email channel should receive a notification.
-- Security/payment/order messages are transactional and bypass marketing/social
-- opt-outs; other categories respect both global and per-type switches.
-- ---------------------------------------------------------------------------
create or replace function public.should_email_notification(
  p_user_id uuid,
  p_notification_type text,
  p_category text,
  p_priority text
)
returns boolean
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_global_email boolean := true;
  v_category_enabled boolean := true;
  v_type_email boolean := true;
  v_settings record;
  v_pref record;
begin
  if p_user_id is null then return false; end if;

  select delivery_channels, category_toggles
  into v_settings
  from public.notification_user_settings
  where user_id = p_user_id;

  if found then
    if v_settings.delivery_channels ? 'email' then
      v_global_email := coalesce((v_settings.delivery_channels->>'email')::boolean, true);
    end if;
    if v_settings.category_toggles ? p_category then
      v_category_enabled := coalesce((v_settings.category_toggles->>p_category)::boolean, true);
    end if;
  end if;

  select email_enabled, delivery_channels
  into v_pref
  from public.notification_preferences
  where user_id = p_user_id
    and notification_type = p_notification_type;

  if found then
    v_type_email := coalesce(v_pref.email_enabled, true);
    if v_pref.delivery_channels ? 'email' then
      v_type_email := v_type_email
        and coalesce((v_pref.delivery_channels->>'email')::boolean, true);
    end if;
  end if;

  -- Transactional/security delivery is mandatory. Marketing/social remains
  -- user-controlled.
  if p_priority = 'critical'
     or p_category in ('security','wallet','orders')
     or p_notification_type in (
       'payout','affiliate_commission','referral_commission',
       'wallet_deposit','wallet_withdrawal','new_order','order_status'
     ) then
    return true;
  end if;

  return v_global_email and v_category_enabled and v_type_email;
end;
$$;

revoke all on function public.should_email_notification(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.should_email_notification(uuid,text,text,text) to service_role;

-- ---------------------------------------------------------------------------
-- 5) Queue every eligible main notification for Resend and log the Supabase
-- email channel. The notification row itself is the Supabase/in-app channel.
-- ---------------------------------------------------------------------------
create or replace function public.queue_notification_email()
returns trigger
language plpgsql
security definer
set search_path = public, net, pg_temp
as $$
declare
  v_email text;
  v_outbox_id uuid;
begin
  if coalesce(new.is_deleted,false) or coalesce(new.is_archived,false) then
    return new;
  end if;

  select nullif(trim(email),'')
  into v_email
  from public.users
  where id = new.user_id
    and account_status <> 'BANNED';

  if v_email is null then
    return new;
  end if;

  if public.should_email_notification(
    new.user_id,
    new.notification_type,
    new.category,
    new.priority
  ) is not true then
    return new;
  end if;

  insert into public.notification_email_outbox (
    notification_id,
    user_id,
    recipient_email,
    notification_type,
    category,
    priority,
    subject,
    message,
    metadata
  )
  values (
    new.id,
    new.user_id,
    v_email,
    new.notification_type,
    new.category,
    new.priority,
    new.title,
    new.message,
    coalesce(new.metadata,'{}'::jsonb)
      || jsonb_build_object(
        'notification_id',new.id,
        'actor_id',new.actor_id,
        'related_id',new.related_id
      )
  )
  on conflict (notification_id) do nothing
  returning id into v_outbox_id;

  if v_outbox_id is null then
    return new;
  end if;

  insert into public.notification_delivery_logs (
    notification_id,
    user_id,
    status,
    channel,
    queued_at,
    metadata
  )
  values (
    new.id,
    new.user_id,
    'queued',
    'email',
    now(),
    jsonb_build_object('outbox_id',v_outbox_id,'provider','resend')
  );

  -- Immediate asynchronous dispatch. A cron retry below is the backup.
  perform net.http_post(
    url := 'https://vtiardblxpaeekbfvhjo.supabase.co/functions/v1/notification-email-worker',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object('outbox_id',v_outbox_id),
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

drop trigger if exists trg_queue_notification_email on public.notifications;
create trigger trg_queue_notification_email
after insert on public.notifications
for each row execute function public.queue_notification_email();

-- ---------------------------------------------------------------------------
-- 6) Bridge legacy social notifications into the main Supabase notification
-- center so they get Realtime + email delivery.
-- ---------------------------------------------------------------------------
create or replace function public.bridge_social_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_name text;
  v_title text;
  v_message text;
  v_type text;
  v_category text := 'followers';
  v_priority text := 'normal';
begin
  if new.user_id is null then return new; end if;

  select coalesce(nullif(full_name,''), nullif(username,''), 'Someone')
  into v_actor_name
  from public.users
  where id = new.actor_id;

  v_actor_name := coalesce(v_actor_name,'Someone');

  case new.notification_type
    when 'follow' then
      v_type := 'new_follower';
      v_title := 'New follower';
      v_message := v_actor_name || ' started following you.';
      v_category := 'followers';
    when 'social_reaction' then
      v_type := 'social_reaction';
      v_title := 'New reaction';
      v_message := v_actor_name || ' reacted to your post.';
      v_category := 'reviews';
    when 'social_comment' then
      v_type := 'social_comment';
      v_title := 'New comment';
      v_message := v_actor_name || ' commented on your post.';
      v_category := 'reviews';
    when 'social_reply' then
      v_type := 'social_reply';
      v_title := 'New reply';
      v_message := v_actor_name || ' replied to your comment.';
      v_category := 'messages';
    when 'social_comment_mention' then
      v_type := 'social_mention';
      v_title := 'You were mentioned';
      v_message := v_actor_name || ' mentioned you in a comment.';
      v_category := 'messages';
    when 'social_mention' then
      v_type := 'social_mention';
      v_title := 'You were mentioned';
      v_message := v_actor_name || ' mentioned you in a post.';
      v_category := 'messages';
    when 'chat_mention' then
      v_type := 'chat_mention';
      v_title := 'You were mentioned';
      v_message := v_actor_name || ' mentioned you in a conversation.';
      v_category := 'messages';
    when 'community_invite' then
      v_type := 'admin_notice';
      v_title := 'Community invitation';
      v_message := v_actor_name || ' invited you to a community.';
      v_category := 'system';
    when 'community_membership_update' then
      v_type := 'admin_notice';
      v_title := 'Community membership updated';
      v_message := 'Your community membership was updated.';
      v_category := 'system';
    else
      v_type := 'system_alert';
      v_title := 'Social update';
      v_message := v_actor_name || ' interacted with you on DRIGHT.';
      v_category := 'system';
  end case;

  insert into public.notifications (
    user_id,
    title,
    message,
    notification_type,
    category,
    priority,
    related_id,
    actor_id,
    metadata,
    group_key,
    is_read,
    is_archived,
    is_deleted
  )
  values (
    new.user_id,
    v_title,
    v_message,
    v_type,
    v_category,
    v_priority,
    new.entity_id,
    new.actor_id,
    coalesce(new.metadata,'{}'::jsonb)
      || jsonb_build_object(
        'social_notification_id',new.id,
        'entity_type',new.entity_type,
        'event_module','social',
        'event_type',new.notification_type
      ),
    'social:' || new.id::text,
    false,
    false,
    false
  );

  return new;
end;
$$;

drop trigger if exists trg_bridge_social_notification on public.social_notifications;
create trigger trg_bridge_social_notification
after insert on public.social_notifications
for each row execute function public.bridge_social_notification();

-- ---------------------------------------------------------------------------
-- 7) Group product/profile view notifications by owner/entity/day.
-- Only the first insert emails; later views increment the existing Supabase
-- notification count.
-- ---------------------------------------------------------------------------
create or replace function public.notify_grouped_view_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_recipient uuid;
  v_group_key text;
  v_existing uuid;
  v_count integer;
  v_title text;
  v_type text;
  v_message text;
begin
  if coalesce(new.is_bot,false) then return new; end if;

  if new.event_type in ('product_view','open')
     and new.entity_type = 'product'
     and new.seller_id is not null then
    v_recipient := new.seller_id;
    if new.viewer_id is not null and new.viewer_id = v_recipient then return new; end if;
    v_type := 'product_view';
    v_title := 'Your product is getting views';
    v_group_key := 'product_view:' || v_recipient::text || ':' || coalesce(new.entity_id::text,'unknown')
      || ':' || to_char(current_date,'YYYY-MM-DD');
  elsif new.event_type = 'social_profile_visit'
        and new.seller_id is not null then
    v_recipient := new.seller_id;
    if new.viewer_id is not null and new.viewer_id = v_recipient then return new; end if;
    v_type := 'profile_view';
    v_title := 'Your profile was viewed';
    v_group_key := 'profile_view:' || v_recipient::text || ':' || to_char(current_date,'YYYY-MM-DD');
  else
    return new;
  end if;

  select id, coalesce((metadata->>'count')::integer,1)
  into v_existing, v_count
  from public.notifications
  where user_id = v_recipient
    and group_key = v_group_key
    and is_deleted = false
  order by created_at desc
  limit 1
  for update;

  if v_existing is not null then
    v_count := v_count + 1;
    update public.notifications
    set metadata = coalesce(metadata,'{}'::jsonb)
          || jsonb_build_object('count',v_count,'last_view_at',now()),
        message = case
          when v_type='product_view' then v_count::text || ' views on this product today.'
          else v_count::text || ' profile views today.'
        end,
        is_read = false
    where id = v_existing;
    return new;
  end if;

  v_message := case
    when v_type='product_view' then 'Someone viewed your product. More views today will be grouped here.'
    else 'Someone viewed your profile. More views today will be grouped here.'
  end;

  insert into public.notifications (
    user_id,title,message,notification_type,category,priority,
    related_id,metadata,group_key,is_read,is_archived,is_deleted
  )
  values (
    v_recipient,
    v_title,
    v_message,
    v_type,
    'store',
    'low',
    new.entity_id,
    jsonb_build_object(
      'count',1,
      'event_module','analytics',
      'event_type',new.event_type,
      'first_view_at',now()
    ),
    v_group_key,
    false,false,false
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_grouped_view_event on public.analytics_events;
create trigger trg_notify_grouped_view_event
after insert on public.analytics_events
for each row execute function public.notify_grouped_view_event();

-- ---------------------------------------------------------------------------
-- 8) Security/PIN events also enter the same Supabase + email pipeline.
-- ---------------------------------------------------------------------------
create or replace function public.notify_payment_security_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_title text;
  v_message text;
  v_priority text := 'high';
begin
  if new.user_id is null then return new; end if;

  case new.event_type
    when 'pin_recovered' then
      v_title := 'Payment PIN reset';
      v_message := 'Your DRIGHT payment PIN was reset using a recovery code.';
      v_priority := 'critical';
    when 'pin_changed' then
      v_title := 'Payment PIN changed';
      v_message := 'Your DRIGHT payment PIN was changed.';
      v_priority := 'high';
    when 'pin_locked' then
      v_title := 'Payment PIN locked';
      v_message := coalesce(new.description,'Your payment PIN was locked after failed attempts.');
      v_priority := 'critical';
    else
      return new;
  end case;

  insert into public.notifications (
    user_id,title,message,notification_type,category,priority,
    metadata,group_key,is_read,is_archived,is_deleted
  )
  values (
    new.user_id,
    v_title,
    v_message,
    'security_alert',
    'security',
    v_priority,
    jsonb_build_object(
      'payment_security_log_id',new.id,
      'event_module','security',
      'event_type',new.event_type
    ),
    'payment_security:' || new.id::text,
    false,false,false
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_payment_security_event on public.payment_security_logs;
create trigger trg_notify_payment_security_event
after insert on public.payment_security_logs
for each row execute function public.notify_payment_security_event();

-- ---------------------------------------------------------------------------
-- 9) Retry worker every minute. Immediate trigger above handles normal latency.
-- ---------------------------------------------------------------------------
select cron.schedule(
  'dright-notification-email-retry',
  '* * * * *',
  $cron$
    select net.http_post(
      url := 'https://vtiardblxpaeekbfvhjo.supabase.co/functions/v1/notification-email-worker',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{"mode":"batch"}'::jsonb,
      timeout_milliseconds := 10000
    );
  $cron$
);

commit;
