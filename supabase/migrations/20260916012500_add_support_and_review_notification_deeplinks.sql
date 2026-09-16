-- Make support/review notifications actionable in the existing notification UI.

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
    select u.id from public.users u
    where u.is_admin = true
      and lower(coalesce(u.admin_status,'')) = 'active'
      and u.admin_role = any (array['super_admin','platform_admin','customer_support','customer_success','support_admin','ai_support_manager']::text[])
  loop
    v_recipients := array_append(v_recipients, v_admin.id);
    insert into public.notifications(user_id,title,message,notification_type,related_id,category,priority,is_read,metadata,group_key,actor_id)
    values (
      v_admin.id,'New support ticket ' || new.ticket_number,new.subject,'admin_notice',new.id,'admin',
      case when new.priority='urgent' then 'critical' when new.priority='high' then 'high' else 'normal' end,false,
      jsonb_build_object('ticket_number',new.ticket_number,'ticket_status',new.status,'channel',new.channel,'event_type','ticket_created','action_url','/admin/tickets'),
      'support-ticket:' || new.id::text,new.user_id
    );
  end loop;
  if cardinality(v_recipients) > 0 then
    insert into public.notification_event_log(event_type,module,actor_id,recipient_ids,priority,category,group_key,metadata,processed)
    values ('admin.support_ticket_created','admin',new.user_id,v_recipients,
      case when new.priority='urgent' then 'critical' when new.priority='high' then 'high' else 'normal' end,
      'admin','support-ticket:' || new.id::text,
      jsonb_build_object('ticket_id',new.id,'ticket_number',new.ticket_number,'subject',new.subject,'channel',new.channel,'action_url','/admin/tickets'),true);
  end if;
  return new;
end;
$$;

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
      insert into public.notifications(user_id,title,message,notification_type,related_id,category,priority,is_read,metadata,group_key,actor_id)
      values (v_ticket.user_id,'Support replied to ' || v_ticket.ticket_number,left(new.message,240),'admin_notice',new.ticket_id,'admin','high',false,
        jsonb_build_object('ticket_number',v_ticket.ticket_number,'event_type','admin_reply','channel',new.channel,'action_url','/help#support'),
        'support-reply:' || new.id::text,new.author_id);
      v_recipients := array[v_ticket.user_id];
    end if;
  else
    update public.support_tickets
    set status = case when status in ('resolved','closed') then 'open' else 'pending_support' end,
        updated_at = now(),last_activity_at = now()
    where id = new.ticket_id;

    if v_ticket.assigned_admin_id is not null and public.is_support_staff(v_ticket.assigned_admin_id) then
      insert into public.notifications(user_id,title,message,notification_type,related_id,category,priority,is_read,metadata,group_key,actor_id)
      values (v_ticket.assigned_admin_id,'Customer replied to ' || v_ticket.ticket_number,left(new.message,240),'admin_notice',new.ticket_id,'admin','high',false,
        jsonb_build_object('ticket_number',v_ticket.ticket_number,'event_type','customer_reply','channel',new.channel,'action_url','/admin/tickets'),
        'support-reply:' || new.id::text,new.author_id);
      v_recipients := array[v_ticket.assigned_admin_id];
    else
      for v_admin in
        select u.id from public.users u
        where u.is_admin=true and lower(coalesce(u.admin_status,''))='active'
          and u.admin_role = any (array['super_admin','platform_admin','customer_support','customer_success','support_admin','ai_support_manager']::text[])
      loop
        v_recipients := array_append(v_recipients, v_admin.id);
        insert into public.notifications(user_id,title,message,notification_type,related_id,category,priority,is_read,metadata,group_key,actor_id)
        values (v_admin.id,'Customer replied to ' || v_ticket.ticket_number,left(new.message,240),'admin_notice',new.ticket_id,'admin','high',false,
          jsonb_build_object('ticket_number',v_ticket.ticket_number,'event_type','customer_reply','channel',new.channel,'action_url','/admin/tickets'),
          'support-reply:' || new.id::text,new.author_id);
      end loop;
    end if;
  end if;

  if cardinality(v_recipients) > 0 and not new.is_internal then
    insert into public.notification_event_log(event_type,module,actor_id,recipient_ids,priority,category,group_key,metadata,processed)
    values (case when new.author_role='admin' then 'admin.support_ticket_update' else 'admin.support_customer_reply' end,
      'admin',new.author_id,v_recipients,'high','admin','support-reply:' || new.id::text,
      jsonb_build_object('ticket_id',new.ticket_id,'ticket_number',v_ticket.ticket_number,'reply_id',new.id,'channel',new.channel,
        'action_url',case when new.author_role='admin' then '/help#support' else '/admin/tickets' end),true);
  end if;
  return new;
end;
$$;

create or replace function public.notify_review_report_created()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_admin record;
  v_recipients uuid[] := '{}'::uuid[];
begin
  for v_admin in
    select u.id from public.users u
    where u.is_admin=true
      and lower(coalesce(u.admin_status,''))='active'
      and u.admin_role = any(array['super_admin','platform_admin','marketplace_admin','marketplace_moderator','qa_admin','trust_safety_admin']::text[])
  loop
    v_recipients := array_append(v_recipients,v_admin.id);
    insert into public.notifications(user_id,title,message,notification_type,related_id,category,priority,is_read,metadata,group_key,actor_id)
    values (v_admin.id,'Review reported','A marketplace review was reported for moderation. Reason: ' || new.reason,
      'new_review',new.review_id,'reviews','high',false,
      jsonb_build_object('event_type','review_reported','report_id',new.id,'review_id',new.review_id,'reason',new.reason,'action_url','/admin/reviews'),
      'review-report:' || new.id::text,new.reporter_id);
  end loop;
  if cardinality(v_recipients)>0 then
    insert into public.notification_event_log(event_type,module,actor_id,recipient_ids,priority,category,group_key,metadata,processed)
    values ('review.review_reported','review',new.reporter_id,v_recipients,'high','reviews','review-report:' || new.id::text,
      jsonb_build_object('report_id',new.id,'review_id',new.review_id,'reason',new.reason,'action_url','/admin/reviews'),true);
  end if;
  return new;
end;
$$;

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
  if new.channel <> 'in_app' or new.log_type <> 'message' then return new; end if;
  select * into v_contact from public.customer_contacts where id = new.contact_id and is_deleted = false;
  if not found then return new; end if;
  select coalesce(nullif(full_name,''), nullif(username,''), 'DRIGHT Support') into v_staff_name from public.users where id = new.staff_id;

  insert into public.notifications(user_id,title,message,notification_type,related_id,category,priority,is_read,metadata,group_key,actor_id)
  values (new.user_id,coalesce(nullif(v_contact.subject,''),'Message from DRIGHT Support'),left(new.content,500),'admin_notice',
    coalesce(v_contact.support_ticket_id,new.contact_id),'admin','normal',false,
    jsonb_build_object('event_type','customer_care_in_app_message','contact_id',new.contact_id,'contact_log_id',new.id,
      'support_ticket_id',v_contact.support_ticket_id,'staff_name',coalesce(v_staff_name,'DRIGHT Support'),'action_url','/help#support'),
    'customer-care-log:' || new.id::text,new.staff_id);

  insert into public.notification_event_log(event_type,module,actor_id,recipient_ids,priority,category,group_key,metadata,processed)
  values ('admin.customer_care_message','admin',new.staff_id,array[new.user_id],'normal','admin','customer-care-log:' || new.id::text,
    jsonb_build_object('contact_id',new.contact_id,'contact_log_id',new.id,'support_ticket_id',v_contact.support_ticket_id,'action_url','/help#support'),true);

  insert into public.customer_timelines(user_id,event_type,event_category,event_title,event_description,event_data,related_entity_type,related_entity_id,performed_by,created_by)
  values (new.user_id,'customer_care_in_app_message','support','DRIGHT Support sent an in-app message',left(new.content,1000),
    jsonb_build_object('contact_id',new.contact_id,'contact_log_id',new.id,'support_ticket_id',v_contact.support_ticket_id),
    case when v_contact.support_ticket_id is not null then 'support_ticket' else 'customer_contact' end,
    coalesce(v_contact.support_ticket_id,new.contact_id),new.staff_id,new.staff_id);
  return new;
end;
$$;