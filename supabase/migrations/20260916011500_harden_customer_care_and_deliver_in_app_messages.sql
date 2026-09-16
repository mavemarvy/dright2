-- Harden Customer Care so only authorized support staff can act as staff,
-- and make in-app interaction logs produce a real customer notification.

alter table public.customer_contacts
  add column if not exists support_ticket_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='customer_contacts_support_ticket_id_fkey') then
    alter table public.customer_contacts
      add constraint customer_contacts_support_ticket_id_fkey
      foreign key (support_ticket_id) references public.support_tickets(id) on delete set null;
  end if;
end $$;

create index if not exists idx_customer_contacts_support_ticket
  on public.customer_contacts(support_ticket_id) where support_ticket_id is not null;

alter table public.customer_contacts enable row level security;
alter table public.customer_contact_logs enable row level security;

drop policy if exists insert_customer_contacts on public.customer_contacts;
drop policy if exists select_customer_contacts on public.customer_contacts;
drop policy if exists update_customer_contacts on public.customer_contacts;
drop policy if exists delete_customer_contacts on public.customer_contacts;

drop policy if exists insert_contact_logs on public.customer_contact_logs;
drop policy if exists select_contact_logs on public.customer_contact_logs;
drop policy if exists update_contact_logs on public.customer_contact_logs;
drop policy if exists delete_contact_logs on public.customer_contact_logs;

create policy select_customer_contacts
on public.customer_contacts for select to authenticated
using (auth.uid() = user_id or public.is_support_staff(auth.uid()));

create policy insert_customer_contacts
on public.customer_contacts for insert to authenticated
with check (public.is_support_staff(auth.uid()) and staff_id = auth.uid());

create policy update_customer_contacts
on public.customer_contacts for update to authenticated
using (public.is_support_staff(auth.uid()))
with check (public.is_support_staff(auth.uid()));

create policy delete_customer_contacts
on public.customer_contacts for delete to authenticated
using (public.is_support_staff(auth.uid()));

create policy select_contact_logs
on public.customer_contact_logs for select to authenticated
using (auth.uid() = user_id or public.is_support_staff(auth.uid()));

create policy insert_contact_logs
on public.customer_contact_logs for insert to authenticated
with check (
  public.is_support_staff(auth.uid())
  and staff_id = auth.uid()
  and exists (
    select 1 from public.customer_contacts c
    where c.id = customer_contact_logs.contact_id
      and c.user_id = customer_contact_logs.user_id
      and c.is_deleted = false
  )
);

create policy update_contact_logs
on public.customer_contact_logs for update to authenticated
using (public.is_support_staff(auth.uid()))
with check (public.is_support_staff(auth.uid()));

create policy delete_contact_logs
on public.customer_contact_logs for delete to authenticated
using (public.is_support_staff(auth.uid()));

create or replace function public.deliver_customer_care_in_app_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact public.customer_contacts%rowtype;
  v_staff_name text;
begin
  if new.channel <> 'in_app' or new.log_type <> 'message' then
    return new;
  end if;

  select * into v_contact
  from public.customer_contacts
  where id = new.contact_id and is_deleted = false;

  if not found then return new; end if;

  select coalesce(nullif(full_name,''), nullif(username,''), 'DRIGHT Support')
  into v_staff_name
  from public.users
  where id = new.staff_id;

  insert into public.notifications(
    user_id,title,message,notification_type,related_id,category,priority,is_read,
    metadata,group_key,actor_id
  ) values (
    new.user_id,
    coalesce(nullif(v_contact.subject,''), 'Message from DRIGHT Support'),
    left(new.content, 500),
    'support_ticket',
    coalesce(v_contact.support_ticket_id, new.contact_id),
    'admin',
    'normal',
    false,
    jsonb_build_object(
      'event_type','customer_care_in_app_message',
      'contact_id',new.contact_id,
      'contact_log_id',new.id,
      'support_ticket_id',v_contact.support_ticket_id,
      'staff_name',coalesce(v_staff_name,'DRIGHT Support')
    ),
    'customer-care-log:' || new.id::text,
    new.staff_id
  );

  insert into public.notification_event_log(
    event_type,module,actor_id,recipient_ids,priority,category,group_key,metadata,processed
  ) values (
    'admin.customer_care_message','admin',new.staff_id,array[new.user_id],
    'normal','admin','customer-care-log:' || new.id::text,
    jsonb_build_object('contact_id',new.contact_id,'contact_log_id',new.id,'support_ticket_id',v_contact.support_ticket_id),true
  );

  insert into public.customer_timelines(
    user_id,event_type,event_category,event_title,event_description,event_data,
    related_entity_type,related_entity_id,performed_by,created_by
  ) values (
    new.user_id,'customer_care_in_app_message','support','DRIGHT Support sent an in-app message',
    left(new.content,1000),
    jsonb_build_object('contact_id',new.contact_id,'contact_log_id',new.id,'support_ticket_id',v_contact.support_ticket_id),
    case when v_contact.support_ticket_id is not null then 'support_ticket' else 'customer_contact' end,
    coalesce(v_contact.support_ticket_id,new.contact_id),new.staff_id,new.staff_id
  );

  return new;
end;
$$;

revoke all on function public.deliver_customer_care_in_app_message() from public;

drop trigger if exists trg_deliver_customer_care_in_app_message on public.customer_contact_logs;
create trigger trg_deliver_customer_care_in_app_message
after insert on public.customer_contact_logs
for each row execute function public.deliver_customer_care_in_app_message();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='customer_contact_logs'
  ) then
    execute 'alter publication supabase_realtime add table public.customer_contact_logs';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='customer_contacts'
  ) then
    execute 'alter publication supabase_realtime add table public.customer_contacts';
  end if;
end $$;