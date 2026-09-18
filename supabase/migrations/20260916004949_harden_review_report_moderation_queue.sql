do $$
begin
  if not exists (select 1 from pg_constraint where conname='review_reports_review_id_fkey') then
    alter table public.review_reports
      add constraint review_reports_review_id_fkey
      foreign key (review_id) references public.reviews(id) on delete cascade;
  end if;
end $$;

create unique index if not exists idx_review_reports_unique_reporter_review
  on public.review_reports(review_id, reporter_id);
create index if not exists idx_review_reports_queue
  on public.review_reports(status, created_at desc);

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
      and u.admin_role = any(array[
        'super_admin','platform_admin','marketplace_admin','marketplace_moderator','qa_admin','trust_safety_admin'
      ]::text[])
  loop
    v_recipients := array_append(v_recipients,v_admin.id);
    insert into public.notifications(
      user_id,title,message,notification_type,related_id,category,priority,is_read,metadata,group_key,actor_id
    ) values (
      v_admin.id,
      'Review reported',
      'A marketplace review was reported for moderation. Reason: ' || new.reason,
      'new_review',new.review_id,'reviews','high',false,
      jsonb_build_object('event_type','review_reported','report_id',new.id,'review_id',new.review_id,'reason',new.reason),
      'review-report:' || new.id::text,
      new.reporter_id
    );
  end loop;
  if cardinality(v_recipients)>0 then
    insert into public.notification_event_log(event_type,module,actor_id,recipient_ids,priority,category,group_key,metadata,processed)
    values(
      'review.review_reported','review',new.reporter_id,v_recipients,'high','reviews',
      'review-report:' || new.id::text,
      jsonb_build_object('report_id',new.id,'review_id',new.review_id,'reason',new.reason),true
    );
  end if;
  return new;
end;
$$;
revoke all on function public.notify_review_report_created() from public;

drop trigger if exists trg_notify_review_report_created on public.review_reports;
create trigger trg_notify_review_report_created
after insert on public.review_reports
for each row execute function public.notify_review_report_created();

create or replace function public.set_review_report_resolution_time()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.status in ('resolved','dismissed') and old.status is distinct from new.status then
    new.resolved_at := coalesce(new.resolved_at,now());
  elsif new.status in ('pending','reviewing') then
    new.resolved_at := null;
  end if;
  return new;
end;
$$;
revoke all on function public.set_review_report_resolution_time() from public;

drop trigger if exists trg_set_review_report_resolution_time on public.review_reports;
create trigger trg_set_review_report_resolution_time
before update of status on public.review_reports
for each row execute function public.set_review_report_resolution_time();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='review_reports'
  ) then
    execute 'alter publication supabase_realtime add table public.review_reports';
  end if;
end $$;
