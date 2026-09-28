alter table public.marketing_email_suppressions
  add column if not exists suppression_reason text,
  add column if not exists provider_event text;

alter table public.outreach_campaigns
  add column if not exists delivered_count bigint not null default 0,
  add column if not exists bounced_count bigint not null default 0,
  add column if not exists complained_count bigint not null default 0;

alter table public.outreach_campaign_recipients
  add column if not exists delivered_at timestamptz,
  add column if not exists bounced_at timestamptz,
  add column if not exists complained_at timestamptz;

create table if not exists public.outreach_delivery_webhook_config (
  singleton boolean primary key default true check (singleton=true),
  resend_webhook_id text,
  signing_secret text,
  endpoint_url text,
  enabled boolean not null default false,
  configured_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.outreach_delivery_webhook_config(singleton)
values(true)
on conflict(singleton) do nothing;

revoke all on table public.outreach_delivery_webhook_config from anon, authenticated;

create or replace function public.recount_outreach_campaign(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target bigint := 0;
  v_scheduled bigint := 0;
  v_queued bigint := 0;
  v_sent bigint := 0;
  v_failed bigint := 0;
  v_skipped bigint := 0;
  v_replied bigint := 0;
  v_unsubscribed bigint := 0;
  v_delivered bigint := 0;
  v_bounced bigint := 0;
  v_complained bigint := 0;
begin
  select
    count(*)::bigint,
    count(*) filter (where status='scheduled')::bigint,
    count(*) filter (where status='queued')::bigint,
    count(*) filter (where status='sent')::bigint,
    count(*) filter (where status='failed')::bigint,
    count(*) filter (where status='skipped')::bigint,
    count(*) filter (where status='replied')::bigint,
    count(*) filter (where status='unsubscribed')::bigint,
    count(*) filter (where delivered_at is not null)::bigint,
    count(*) filter (where bounced_at is not null)::bigint,
    count(*) filter (where complained_at is not null)::bigint
  into
    v_target,v_scheduled,v_queued,v_sent,v_failed,v_skipped,v_replied,v_unsubscribed,
    v_delivered,v_bounced,v_complained
  from public.outreach_campaign_recipients
  where campaign_id=p_campaign_id;

  update public.outreach_campaigns
  set target_count=v_target,
      scheduled_count=v_scheduled,
      queued_count=v_queued,
      sent_count=v_sent,
      failed_count=v_failed,
      skipped_count=v_skipped,
      replied_count=v_replied,
      unsubscribed_count=v_unsubscribed,
      delivered_count=v_delivered,
      bounced_count=v_bounced,
      complained_count=v_complained,
      remaining_count=(v_scheduled+v_queued),
      status=case
        when status in ('cancelled','paused','draft') then status
        when v_target>0 and (v_scheduled+v_queued)=0 then 'completed'
        else status
      end,
      last_recount_at=now(),
      updated_at=now()
  where id=p_campaign_id;
end;
$$;

revoke all on function public.recount_outreach_campaign(uuid) from public;
grant execute on function public.recount_outreach_campaign(uuid) to service_role;
