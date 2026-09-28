-- Large-scale DRIGHT outreach campaign scheduler.
alter table public.notification_email_outbox
  add column if not exists campaign_id uuid,
  add column if not exists campaign_recipient_id uuid;

create table if not exists public.outreach_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  segment text not null default 'general',
  status text not null default 'draft'
    check (status in ('draft','scheduled','running','paused','completed','cancelled')),
  source_type text not null default 'manual',
  source_label text,
  subject_override text,
  headline_override text,
  body_override text,
  cta_label_override text,
  cta_url_override text,
  start_at timestamptz,
  stop_at timestamptz,
  hourly_limit integer not null default 100 check (hourly_limit between 1 and 1000000),
  daily_limit integer not null default 1000 check (daily_limit between 1 and 100000000),
  adaptive_throttle boolean not null default true,
  max_audience_size bigint not null default 100000000 check (max_audience_size between 1 and 100000000),
  target_count bigint not null default 0,
  scheduled_count bigint not null default 0,
  queued_count bigint not null default 0,
  sent_count bigint not null default 0,
  failed_count bigint not null default 0,
  skipped_count bigint not null default 0,
  replied_count bigint not null default 0,
  unsubscribed_count bigint not null default 0,
  remaining_count bigint not null default 0,
  last_dispatch_at timestamptz,
  last_recount_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.outreach_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.outreach_campaigns(id) on delete cascade,
  recipient_email text not null,
  prospect_name text,
  company_name text,
  role_segment text not null default 'general',
  status text not null default 'scheduled'
    check (status in ('scheduled','queued','sent','failed','skipped','unsubscribed','replied')),
  scheduled_for timestamptz not null default now(),
  outbox_id uuid references public.notification_email_outbox(id) on delete set null,
  provider_message_id text,
  attempts integer not null default 0,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists outreach_campaign_recipients_campaign_email_unique
  on public.outreach_campaign_recipients (campaign_id, lower(recipient_email));
create index if not exists outreach_campaign_recipients_dispatch_idx
  on public.outreach_campaign_recipients (campaign_id,status,scheduled_for,created_at);
create index if not exists outreach_campaign_recipients_email_idx
  on public.outreach_campaign_recipients (lower(recipient_email));
create index if not exists notification_email_outbox_campaign_status_idx
  on public.notification_email_outbox (campaign_id,status,created_at);

alter table public.notification_email_outbox drop constraint if exists notification_email_outbox_campaign_id_fkey;
alter table public.notification_email_outbox
  add constraint notification_email_outbox_campaign_id_fkey
  foreign key (campaign_id) references public.outreach_campaigns(id) on delete set null;
alter table public.notification_email_outbox drop constraint if exists notification_email_outbox_campaign_recipient_id_fkey;
alter table public.notification_email_outbox
  add constraint notification_email_outbox_campaign_recipient_id_fkey
  foreign key (campaign_recipient_id) references public.outreach_campaign_recipients(id) on delete set null;

create or replace function public.recount_outreach_campaign(p_campaign_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  v_target bigint:=0; v_scheduled bigint:=0; v_queued bigint:=0; v_sent bigint:=0;
  v_failed bigint:=0; v_skipped bigint:=0; v_replied bigint:=0; v_unsubscribed bigint:=0;
begin
  select count(*)::bigint,
    count(*) filter(where status='scheduled')::bigint,
    count(*) filter(where status='queued')::bigint,
    count(*) filter(where status='sent')::bigint,
    count(*) filter(where status='failed')::bigint,
    count(*) filter(where status='skipped')::bigint,
    count(*) filter(where status='replied')::bigint,
    count(*) filter(where status='unsubscribed')::bigint
  into v_target,v_scheduled,v_queued,v_sent,v_failed,v_skipped,v_replied,v_unsubscribed
  from public.outreach_campaign_recipients where campaign_id=p_campaign_id;

  update public.outreach_campaigns
  set target_count=v_target,scheduled_count=v_scheduled,queued_count=v_queued,sent_count=v_sent,
      failed_count=v_failed,skipped_count=v_skipped,replied_count=v_replied,unsubscribed_count=v_unsubscribed,
      remaining_count=(v_scheduled+v_queued),
      status=case when status in ('cancelled','paused','draft') then status
                  when v_target>0 and (v_scheduled+v_queued)=0 then 'completed' else status end,
      last_recount_at=now(),updated_at=now()
  where id=p_campaign_id;
end $$;

revoke all on function public.recount_outreach_campaign(uuid) from public;
grant execute on function public.recount_outreach_campaign(uuid) to service_role;

create or replace view public.outreach_campaign_dashboard as
select c.*,
  case when c.target_count>0 then round((c.sent_count::numeric/c.target_count::numeric)*100,2) else 0::numeric end as sent_percent,
  case when c.target_count>0 then round(((c.sent_count+c.failed_count+c.skipped_count+c.unsubscribed_count)::numeric/c.target_count::numeric)*100,2) else 0::numeric end as processed_percent
from public.outreach_campaigns c;

alter table public.outreach_campaigns enable row level security;
alter table public.outreach_campaign_recipients enable row level security;

drop policy if exists "active admins manage outreach campaigns" on public.outreach_campaigns;
create policy "active admins manage outreach campaigns" on public.outreach_campaigns for all
using (exists(select 1 from public.users u where u.id=auth.uid() and u.is_admin=true and u.admin_status='active'))
with check (exists(select 1 from public.users u where u.id=auth.uid() and u.is_admin=true and u.admin_status='active'));

drop policy if exists "active admins manage outreach campaign recipients" on public.outreach_campaign_recipients;
create policy "active admins manage outreach campaign recipients" on public.outreach_campaign_recipients for all
using (exists(select 1 from public.users u where u.id=auth.uid() and u.is_admin=true and u.admin_status='active'))
with check (exists(select 1 from public.users u where u.id=auth.uid() and u.is_admin=true and u.admin_status='active'));

with existing as (
  select id from public.outreach_campaigns where name='DRIGHT Affiliate Launch — September 28, 2026' limit 1
), created as (
  insert into public.outreach_campaigns(name,segment,status,source_type,source_label,start_at,hourly_limit,daily_limit,adaptive_throttle,metadata)
  select 'DRIGHT Affiliate Launch — September 28, 2026','affiliate','running','qualified_research',
    'Initial qualified affiliate / creator partnership batch',now(),100,1000,true,'{"launch_batch":true}'::jsonb
  where not exists(select 1 from existing) returning id
), campaign as (
  select id from existing union all select id from created limit 1
)
insert into public.outreach_campaign_recipients(campaign_id,recipient_email,prospect_name,company_name,role_segment,status,scheduled_for,outbox_id,provider_message_id,last_error)
select campaign.id,o.recipient_email,
  case lower(o.recipient_email)
    when 'hello@tima.agency' then 'TIMA team' when 'hello@kynetico.net' then 'Kynetico team'
    when 'contact@diglancers.com' then 'Diglancers team' when 'info@trendupp.com' then 'Trendupp team'
    when 'hello@chainfren.com' then 'Chainfren team' else null end,
  case lower(o.recipient_email)
    when 'hello@tima.agency' then 'TIMA' when 'hello@kynetico.net' then 'Kynetico'
    when 'contact@diglancers.com' then 'Diglancers' when 'info@trendupp.com' then 'Trendupp'
    when 'hello@chainfren.com' then 'Chainfren' else null end,
  'affiliate',
  case when o.status='sent' then 'sent' when o.status in('pending','retry','sending') then 'queued'
       when o.status='failed' then 'failed' when o.status='skipped' then 'skipped' else 'queued' end,
  coalesce(o.next_attempt_at,o.created_at,now()),o.id,o.provider_message_id,o.last_error
from public.notification_email_outbox o cross join campaign
where lower(o.recipient_email) in('hello@tima.agency','hello@kynetico.net','contact@diglancers.com','info@trendupp.com','hello@chainfren.com')
on conflict (campaign_id,lower(recipient_email)) do nothing;

with campaign as (
  select id from public.outreach_campaigns where name='DRIGHT Affiliate Launch — September 28, 2026' limit 1
)
update public.notification_email_outbox o
set campaign_id=campaign.id,campaign_recipient_id=r.id
from campaign join public.outreach_campaign_recipients r on r.campaign_id=campaign.id
where lower(o.recipient_email)=lower(r.recipient_email)
  and lower(o.recipient_email) in('hello@tima.agency','hello@kynetico.net','contact@diglancers.com','info@trendupp.com','hello@chainfren.com');

select public.recount_outreach_campaign(id)
from public.outreach_campaigns where name='DRIGHT Affiliate Launch — September 28, 2026';
