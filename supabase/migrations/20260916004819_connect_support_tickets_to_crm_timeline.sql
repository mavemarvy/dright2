create or replace function public.log_support_ticket_created_timeline()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  insert into public.customer_timelines(
    user_id,event_type,event_category,event_title,event_description,event_data,
    related_entity_type,related_entity_id,performed_by,created_by
  ) values (
    new.user_id,
    'support_ticket_created',
    'support',
    'Support ticket ' || coalesce(new.ticket_number, '') || ' created',
    new.subject,
    jsonb_build_object('ticket_number',new.ticket_number,'status',new.status,'priority',new.priority,'channel',new.channel,'department_id',new.department_id),
    'support_ticket',new.id,new.user_id,new.user_id
  );
  return new;
end;
$$;
revoke all on function public.log_support_ticket_created_timeline() from public;

drop trigger if exists trg_support_ticket_created_timeline on public.support_tickets;
create trigger trg_support_ticket_created_timeline
after insert on public.support_tickets
for each row execute function public.log_support_ticket_created_timeline();

create or replace function public.log_support_reply_timeline()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_ticket public.support_tickets%rowtype;
begin
  if new.is_internal then return new; end if;
  select * into v_ticket from public.support_tickets where id=new.ticket_id;
  if not found then return new; end if;

  insert into public.customer_timelines(
    user_id,event_type,event_category,event_title,event_description,event_data,
    related_entity_type,related_entity_id,performed_by,created_by
  ) values (
    v_ticket.user_id,
    case when new.author_role='admin' then 'support_agent_reply' else 'support_customer_reply' end,
    'support',
    case when new.author_role='admin' then 'DRIGHT Support replied' else 'Customer replied to support' end,
    left(new.message,1000),
    jsonb_build_object('ticket_number',v_ticket.ticket_number,'ticket_id',v_ticket.id,'reply_id',new.id,'author_role',new.author_role,'channel',new.channel),
    'support_ticket',v_ticket.id,new.author_id,new.author_id
  );
  return new;
end;
$$;
revoke all on function public.log_support_reply_timeline() from public;

drop trigger if exists trg_support_reply_timeline on public.ticket_replies;
create trigger trg_support_reply_timeline
after insert on public.ticket_replies
for each row execute function public.log_support_reply_timeline();

create or replace function public.log_support_status_timeline()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if old.status is not distinct from new.status then return new; end if;
  insert into public.customer_timelines(
    user_id,event_type,event_category,event_title,event_description,event_data,
    related_entity_type,related_entity_id,performed_by,created_by
  ) values (
    new.user_id,
    'support_ticket_status_changed',
    'support',
    'Support ticket status changed',
    'Ticket ' || coalesce(new.ticket_number,new.id::text) || ' changed from ' || old.status || ' to ' || new.status,
    jsonb_build_object('ticket_number',new.ticket_number,'old_status',old.status,'new_status',new.status,'assigned_admin_id',new.assigned_admin_id),
    'support_ticket',new.id,auth.uid(),auth.uid()
  );
  return new;
end;
$$;
revoke all on function public.log_support_status_timeline() from public;

drop trigger if exists trg_support_status_timeline on public.support_tickets;
create trigger trg_support_status_timeline
after update of status on public.support_tickets
for each row execute function public.log_support_status_timeline();
