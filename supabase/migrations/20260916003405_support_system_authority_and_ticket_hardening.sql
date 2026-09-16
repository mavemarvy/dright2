-- DRIGHT2 support system authority + ticket hardening

create or replace function public.is_support_staff(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = p_user_id
      and u.is_admin = true
      and lower(coalesce(u.admin_status, '')) = 'active'
      and u.admin_role = any (array[
        'super_admin','platform_admin','customer_support','customer_success',
        'support_admin','ai_support_manager'
      ]::text[])
  );
$$;

revoke all on function public.is_support_staff(uuid) from public;
grant execute on function public.is_support_staff(uuid) to authenticated, service_role;

alter table public.support_tickets
  add column if not exists ticket_number text,
  add column if not exists department_id uuid,
  add column if not exists assigned_admin_id uuid,
  add column if not exists category text not null default 'general',
  add column if not exists channel text not null default 'web',
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists last_activity_at timestamptz not null default now(),
  add column if not exists first_response_at timestamptz,
  add column if not exists resolved_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists escalation_level integer not null default 0,
  add column if not exists ai_handled boolean not null default false,
  add column if not exists ai_summary text,
  add column if not exists external_thread_id text,
  add column if not exists external_message_id text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='support_tickets_department_id_fkey') then
    alter table public.support_tickets
      add constraint support_tickets_department_id_fkey foreign key (department_id)
      references public.support_departments(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname='support_tickets_assigned_admin_id_fkey') then
    alter table public.support_tickets
      add constraint support_tickets_assigned_admin_id_fkey foreign key (assigned_admin_id)
      references public.users(id) on delete set null;
  end if;
end $$;

alter table public.support_tickets drop constraint if exists support_tickets_status_check;
alter table public.support_tickets
  add constraint support_tickets_status_check
  check (status = any (array['open','pending_support','pending_customer','escalated','resolved','closed']::text[]));

alter table public.support_tickets drop constraint if exists support_tickets_priority_check;
alter table public.support_tickets
  add constraint support_tickets_priority_check
  check (priority = any (array['low','medium','high','urgent']::text[]));

alter table public.support_tickets drop constraint if exists support_tickets_channel_check;
alter table public.support_tickets
  add constraint support_tickets_channel_check
  check (channel = any (array['web','in_app','ai','email','sms','whatsapp','telegram','phone']::text[]));

alter table public.support_tickets drop constraint if exists support_tickets_escalation_level_check;
alter table public.support_tickets
  add constraint support_tickets_escalation_level_check check (escalation_level between 0 and 5);

update public.support_tickets
set ticket_number = 'DR-' || to_char(created_at, 'YYMMDD') || '-' || upper(substr(replace(id::text,'-',''),1,8))
where ticket_number is null;

create unique index if not exists idx_support_tickets_ticket_number
  on public.support_tickets(ticket_number) where ticket_number is not null;
create index if not exists idx_support_tickets_assigned_admin on public.support_tickets(assigned_admin_id, status, last_activity_at desc);
create index if not exists idx_support_tickets_user_activity on public.support_tickets(user_id, last_activity_at desc);
create index if not exists idx_support_tickets_queue on public.support_tickets(status, priority, last_activity_at desc);
create index if not exists idx_support_tickets_department on public.support_tickets(department_id, status);

alter table public.ticket_replies
  add column if not exists channel text not null default 'web',
  add column if not exists is_internal boolean not null default false,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table public.ticket_replies drop constraint if exists ticket_replies_channel_check;
alter table public.ticket_replies
  add constraint ticket_replies_channel_check
  check (channel = any (array['web','in_app','ai','email','sms','whatsapp','telegram','phone']::text[]));
create index if not exists idx_ticket_replies_ticket_created on public.ticket_replies(ticket_id, created_at);

create or replace function public.set_support_ticket_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ticket_number is null or btrim(new.ticket_number) = '' then
    new.ticket_number := 'DR-' || to_char(coalesce(new.created_at, now()), 'YYMMDD') || '-' || upper(substr(replace(new.id::text,'-',''),1,8));
  end if;
  new.updated_at := coalesce(new.updated_at, now());
  new.last_activity_at := coalesce(new.last_activity_at, now());
  return new;
end;
$$;

revoke all on function public.set_support_ticket_defaults() from public;

drop trigger if exists trg_support_ticket_defaults on public.support_tickets;
create trigger trg_support_ticket_defaults
before insert on public.support_tickets
for each row execute function public.set_support_ticket_defaults();

alter table public.support_tickets enable row level security;
alter table public.ticket_replies enable row level security;

drop policy if exists "insert_own_ticket" on public.support_tickets;
drop policy if exists "select_own_tickets" on public.support_tickets;
drop policy if exists "support_admin_all_tickets" on public.support_tickets;
drop policy if exists "support_tickets_select" on public.support_tickets;
drop policy if exists "support_tickets_insert" on public.support_tickets;
drop policy if exists "support_tickets_update_staff" on public.support_tickets;

create policy "support_tickets_select"
on public.support_tickets for select to authenticated
using (user_id = auth.uid() or public.is_support_staff(auth.uid()));

create policy "support_tickets_insert"
on public.support_tickets for insert to authenticated
with check (user_id = auth.uid());

create policy "support_tickets_update_staff"
on public.support_tickets for update to authenticated
using (public.is_support_staff(auth.uid()))
with check (public.is_support_staff(auth.uid()));

drop policy if exists "Users insert own ticket replies" on public.ticket_replies;
drop policy if exists "Users read own ticket replies" on public.ticket_replies;
drop policy if exists "ticket_replies_select" on public.ticket_replies;
drop policy if exists "ticket_replies_insert" on public.ticket_replies;

create policy "ticket_replies_select"
on public.ticket_replies for select to authenticated
using (
  exists (
    select 1 from public.support_tickets t
    where t.id = ticket_replies.ticket_id
      and (t.user_id = auth.uid() or public.is_support_staff(auth.uid()))
  )
);

create policy "ticket_replies_insert"
on public.ticket_replies for insert to authenticated
with check (
  author_id = auth.uid()
  and (
    (
      author_role = 'user'
      and is_internal = false
      and exists (
        select 1 from public.support_tickets t
        where t.id = ticket_replies.ticket_id and t.user_id = auth.uid()
      )
    )
    or
    (author_role = 'admin' and public.is_support_staff(auth.uid()))
  )
);

create or replace function public.notify_support_ticket_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin record;
  v_recipients uuid[] := '{}'::uuid[];
begin
  for v_admin in
    select u.id
    from public.users u
    where u.is_admin = true
      and lower(coalesce(u.admin_status,'')) = 'active'
      and u.admin_role = any (array['super_admin','platform_admin','customer_support','customer_success','support_admin','ai_support_manager']::text[])
  loop
    v_recipients := array_append(v_recipients, v_admin.id);
    insert into public.notifications(
      user_id,title,message,notification_type,related_id,category,priority,is_read,metadata,group_key,actor_id
    ) values (
      v_admin.id,
      'New support ticket ' || new.ticket_number,
      new.subject,
      'support_ticket',
      new.id,
      'admin',
      case when new.priority='urgent' then 'critical' when new.priority='high' then 'high' else 'normal' end,
      false,
      jsonb_build_object('ticket_number',new.ticket_number,'ticket_status',new.status,'channel',new.channel,'event_type','ticket_created'),
      'support-ticket:' || new.id::text,
      new.user_id
    );
  end loop;

  if cardinality(v_recipients) > 0 then
    insert into public.notification_event_log(event_type,module,actor_id,recipient_ids,priority,category,group_key,metadata,processed)
    values(
      'admin.support_ticket_created','admin',new.user_id,v_recipients,
      case when new.priority='urgent' then 'critical' when new.priority='high' then 'high' else 'normal' end,
      'admin','support-ticket:' || new.id::text,
      jsonb_build_object('ticket_id',new.id,'ticket_number',new.ticket_number,'subject',new.subject,'channel',new.channel),
      true
    );
  end if;
  return new;
end;
$$;

revoke all on function public.notify_support_ticket_created() from public;

drop trigger if exists trg_notify_support_ticket_created on public.support_tickets;
create trigger trg_notify_support_ticket_created
after insert on public.support_tickets
for each row execute function public.notify_support_ticket_created();

create or replace function public.process_support_ticket_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.support_tickets%rowtype;
  v_admin record;
  v_recipients uuid[] := '{}'::uuid[];
begin
  select * into v_ticket from public.support_tickets where id = new.ticket_id for update;
  if not found then return new; end if;

  if new.author_role = 'admin' then
    update public.support_tickets
    set status = case when status in ('resolved','closed') then status else 'pending_customer' end,
        first_response_at = coalesce(first_response_at, now()),
        replied_by = new.author_id,
        replied_at = now(),
        admin_reply = case when new.is_internal then admin_reply else new.message end,
        assigned_admin_id = coalesce(assigned_admin_id, new.author_id),
        updated_at = now(),
        last_activity_at = now()
    where id = new.ticket_id;

    if not new.is_internal then
      insert into public.notifications(
        user_id,title,message,notification_type,related_id,category,priority,is_read,metadata,group_key,actor_id
      ) values (
        v_ticket.user_id,
        'Support replied to ' || v_ticket.ticket_number,
        left(new.message, 240),
        'support_ticket',new.ticket_id,'admin','high',false,
        jsonb_build_object('ticket_number',v_ticket.ticket_number,'event_type','admin_reply','channel',new.channel),
        'support-reply:' || new.id::text,new.author_id
      );
      v_recipients := array[v_ticket.user_id];
    end if;
  else
    update public.support_tickets
    set status = case when status in ('resolved','closed') then 'open' else 'pending_support' end,
        updated_at = now(),
        last_activity_at = now()
    where id = new.ticket_id;

    if v_ticket.assigned_admin_id is not null and public.is_support_staff(v_ticket.assigned_admin_id) then
      insert into public.notifications(
        user_id,title,message,notification_type,related_id,category,priority,is_read,metadata,group_key,actor_id
      ) values (
        v_ticket.assigned_admin_id,
        'Customer replied to ' || v_ticket.ticket_number,
        left(new.message, 240),
        'support_ticket',new.ticket_id,'admin','high',false,
        jsonb_build_object('ticket_number',v_ticket.ticket_number,'event_type','customer_reply','channel',new.channel),
        'support-reply:' || new.id::text,new.author_id
      );
      v_recipients := array[v_ticket.assigned_admin_id];
    else
      for v_admin in
        select u.id from public.users u
        where u.is_admin=true and lower(coalesce(u.admin_status,''))='active'
          and u.admin_role = any (array['super_admin','platform_admin','customer_support','customer_success','support_admin','ai_support_manager']::text[])
      loop
        v_recipients := array_append(v_recipients, v_admin.id);
        insert into public.notifications(
          user_id,title,message,notification_type,related_id,category,priority,is_read,metadata,group_key,actor_id
        ) values (
          v_admin.id,
          'Customer replied to ' || v_ticket.ticket_number,
          left(new.message, 240),
          'support_ticket',new.ticket_id,'admin','high',false,
          jsonb_build_object('ticket_number',v_ticket.ticket_number,'event_type','customer_reply','channel',new.channel),
          'support-reply:' || new.id::text,new.author_id
        );
      end loop;
    end if;
  end if;

  if cardinality(v_recipients) > 0 and not new.is_internal then
    insert into public.notification_event_log(event_type,module,actor_id,recipient_ids,priority,category,group_key,metadata,processed)
    values(
      case when new.author_role='admin' then 'admin.support_ticket_update' else 'admin.support_customer_reply' end,
      'admin',new.author_id,v_recipients,'high','admin','support-reply:' || new.id::text,
      jsonb_build_object('ticket_id',new.ticket_id,'ticket_number',v_ticket.ticket_number,'reply_id',new.id,'channel',new.channel),true
    );
  end if;

  return new;
end;
$$;

revoke all on function public.process_support_ticket_reply() from public;

drop trigger if exists trg_process_support_ticket_reply on public.ticket_replies;
create trigger trg_process_support_ticket_reply
after insert on public.ticket_replies
for each row execute function public.process_support_ticket_reply();

create or replace function public.process_support_ticket_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  if new.status = 'resolved' and old.status is distinct from 'resolved' then
    new.resolved_at := coalesce(new.resolved_at, now());
  elsif new.status <> 'resolved' and old.status = 'resolved' then
    new.resolved_at := null;
  end if;
  if new.status = 'closed' and old.status is distinct from 'closed' then
    new.closed_at := coalesce(new.closed_at, now());
  elsif new.status <> 'closed' and old.status = 'closed' then
    new.closed_at := null;
  end if;
  return new;
end;
$$;
revoke all on function public.process_support_ticket_status_change() from public;

drop trigger if exists trg_support_ticket_status_change on public.support_tickets;
create trigger trg_support_ticket_status_change
before update on public.support_tickets
for each row execute function public.process_support_ticket_status_change();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='support_tickets'
  ) then
    execute 'alter publication supabase_realtime add table public.support_tickets';
  end if;
  if not exists (
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='ticket_replies'
  ) then
    execute 'alter publication supabase_realtime add table public.ticket_replies';
  end if;
end $$;

create or replace function public.get_support_analytics(p_days integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select now() - make_interval(days => greatest(1, least(coalesce(p_days,30), 3650))) as since
  ), scoped as (
    select t.* from public.support_tickets t, bounds b where t.created_at >= b.since
  ), daily as (
    select date_trunc('day', created_at)::date as day, count(*)::int as created
    from scoped group by 1 order by 1
  )
  select jsonb_build_object(
    'tickets_created', (select count(*) from scoped),
    'tickets_resolved', (select count(*) from scoped where status in ('resolved','closed')),
    'open_tickets', (select count(*) from public.support_tickets where status in ('open','pending_support','pending_customer')),
    'escalated_tickets', (select count(*) from public.support_tickets where status='escalated'),
    'avg_first_response_minutes', coalesce((select round(avg(extract(epoch from (first_response_at-created_at))/60.0)::numeric,2) from scoped where first_response_at is not null),0),
    'avg_resolution_minutes', coalesce((select round(avg(extract(epoch from (resolved_at-created_at))/60.0)::numeric,2) from scoped where resolved_at is not null),0),
    'daily_created', coalesce((select jsonb_agg(jsonb_build_object('date',day,'count',created) order by day) from daily),'[]'::jsonb)
  );
$$;
revoke all on function public.get_support_analytics(integer) from public;
grant execute on function public.get_support_analytics(integer) to authenticated, service_role;
