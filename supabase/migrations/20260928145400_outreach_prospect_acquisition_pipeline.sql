create table if not exists public.outreach_acquisition_runs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  segment text not null default 'general',
  status text not null default 'running' check (status in ('running','completed','paused','failed')),
  source_type text not null default 'web_research',
  source_query text,
  discovered_count bigint not null default 0,
  qualified_count bigint not null default 0,
  duplicate_count bigint not null default 0,
  invalid_count bigint not null default 0,
  queued_count bigint not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.outreach_prospects (
  id uuid primary key default gen_random_uuid(),
  company_name text,
  contact_name text,
  email text not null,
  email_normalized text generated always as (lower(btrim(email))) stored,
  website_url text,
  source_url text not null,
  source_type text not null default 'public_business_web',
  country text,
  segment text not null default 'general',
  qualification_status text not null default 'discovered'
    check (qualification_status in ('discovered','qualified','rejected','queued','contacted','replied','unsubscribed','invalid')),
  verification_status text not null default 'public_verified'
    check (verification_status in ('unknown','public_verified','invalid','bounced')),
  public_business_contact boolean not null default true,
  qualification_score integer not null default 50 check (qualification_score between 0 and 100),
  acquisition_run_id uuid references public.outreach_acquisition_runs(id) on delete set null,
  campaign_id uuid references public.outreach_campaigns(id) on delete set null,
  campaign_recipient_id uuid references public.outreach_campaign_recipients(id) on delete set null,
  discovered_at timestamptz not null default now(),
  verified_at timestamptz,
  last_queued_at timestamptz,
  last_contacted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists outreach_prospects_email_unique on public.outreach_prospects(email_normalized);
create index if not exists outreach_prospects_status_segment_idx on public.outreach_prospects(qualification_status,segment,qualification_score desc,created_at);
create index if not exists outreach_prospects_run_idx on public.outreach_prospects(acquisition_run_id,qualification_status);
create index if not exists outreach_prospects_campaign_idx on public.outreach_prospects(campaign_id,qualification_status);

alter table public.outreach_acquisition_runs enable row level security;
alter table public.outreach_prospects enable row level security;

drop policy if exists "active admins manage outreach acquisition runs" on public.outreach_acquisition_runs;
create policy "active admins manage outreach acquisition runs"
on public.outreach_acquisition_runs for all
using (exists (select 1 from public.users u where u.id=auth.uid() and u.is_admin=true and u.admin_status='active'))
with check (exists (select 1 from public.users u where u.id=auth.uid() and u.is_admin=true and u.admin_status='active'));

drop policy if exists "active admins manage outreach prospects" on public.outreach_prospects;
create policy "active admins manage outreach prospects"
on public.outreach_prospects for all
using (exists (select 1 from public.users u where u.id=auth.uid() and u.is_admin=true and u.admin_status='active'))
with check (exists (select 1 from public.users u where u.id=auth.uid() and u.is_admin=true and u.admin_status='active'));

create or replace function public.recount_outreach_acquisition_run(p_run_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.outreach_acquisition_runs r
  set discovered_count=coalesce((select count(*)::bigint from public.outreach_prospects p where p.acquisition_run_id=r.id),0),
      qualified_count=coalesce((select count(*)::bigint from public.outreach_prospects p where p.acquisition_run_id=r.id and p.qualification_status='qualified'),0),
      queued_count=coalesce((select count(*)::bigint from public.outreach_prospects p where p.acquisition_run_id=r.id and p.qualification_status in ('queued','contacted','replied')),0),
      updated_at=now()
  where r.id=p_run_id;
end $$;

revoke all on function public.recount_outreach_acquisition_run(uuid) from public;
grant execute on function public.recount_outreach_acquisition_run(uuid) to service_role,authenticated;

create or replace function public.import_outreach_prospects(p_run_id uuid,p_rows jsonb)
returns table(inserted_count bigint,duplicate_count bigint,invalid_count bigint)
language plpgsql security definer set search_path=public as $$
declare
  v_is_admin boolean:=false; v_requested bigint:=0; v_valid bigint:=0; v_before bigint:=0; v_after bigint:=0;
begin
  select exists(select 1 from public.users u where u.id=auth.uid() and u.is_admin=true and u.admin_status='active') into v_is_admin;
  if not v_is_admin then raise exception 'Active admin access required'; end if;
  if jsonb_typeof(p_rows)<>'array' then raise exception 'p_rows must be a JSON array'; end if;
  v_requested:=jsonb_array_length(p_rows);
  if v_requested>5000 then raise exception 'Maximum 5000 prospects per import chunk'; end if;
  select count(*) into v_before from public.outreach_prospects;

  with rows as (
    select lower(btrim(x.email)) email,nullif(btrim(x.company_name),'') company_name,
      nullif(btrim(x.contact_name),'') contact_name,nullif(btrim(x.website_url),'') website_url,
      nullif(btrim(x.source_url),'') source_url,coalesce(nullif(btrim(x.source_type),''),'public_business_web') source_type,
      nullif(btrim(x.country),'') country,coalesce(nullif(btrim(x.segment),''),'general') segment,
      coalesce(x.qualification_score,50) qualification_score,coalesce(x.metadata,'{}'::jsonb) metadata
    from jsonb_to_recordset(p_rows) as x(email text,company_name text,contact_name text,website_url text,source_url text,source_type text,country text,segment text,qualification_score integer,metadata jsonb)
  ), valid as (
    select * from rows where email is not null and position('@' in email)>1 and source_url is not null and qualification_score between 0 and 100
  )
  insert into public.outreach_prospects(company_name,contact_name,email,website_url,source_url,source_type,country,segment,qualification_status,verification_status,public_business_contact,qualification_score,acquisition_run_id,verified_at,metadata)
  select company_name,contact_name,email,website_url,source_url,source_type,country,segment,
    case when qualification_score>=60 then 'qualified' else 'discovered' end,'public_verified',true,qualification_score,p_run_id,now(),metadata
  from valid
  on conflict (email_normalized) do nothing;

  select count(*) into v_after from public.outreach_prospects;
  select count(*) into v_valid
  from jsonb_to_recordset(p_rows) as x(email text,source_url text,qualification_score integer)
  where x.email is not null and position('@' in x.email)>1 and x.source_url is not null and coalesce(x.qualification_score,50) between 0 and 100;

  update public.outreach_acquisition_runs
  set duplicate_count=duplicate_count+greatest(v_valid-(v_after-v_before),0),
      invalid_count=invalid_count+greatest(v_requested-v_valid,0),updated_at=now()
  where id=p_run_id;

  perform public.recount_outreach_acquisition_run(p_run_id);
  return query select greatest(v_after-v_before,0)::bigint,greatest(v_valid-(v_after-v_before),0)::bigint,greatest(v_requested-v_valid,0)::bigint;
end $$;

revoke all on function public.import_outreach_prospects(uuid,jsonb) from public;
grant execute on function public.import_outreach_prospects(uuid,jsonb) to authenticated;

create or replace function public.queue_qualified_outreach_prospects(p_campaign_id uuid,p_limit integer default 1000)
returns table(queued_count bigint,skipped_count bigint)
language plpgsql security definer set search_path=public as $$
declare
  v_is_admin boolean:=false; v_segment text; v_limit integer:=greatest(1,least(coalesce(p_limit,1000),5000)); v_candidates bigint:=0; v_queued bigint:=0;
begin
  select exists(select 1 from public.users u where u.id=auth.uid() and u.is_admin=true and u.admin_status='active') into v_is_admin;
  if not v_is_admin then raise exception 'Active admin access required'; end if;
  select segment into v_segment from public.outreach_campaigns where id=p_campaign_id;
  if v_segment is null then raise exception 'Campaign not found'; end if;

  with candidate_rows as (
    select p.* from public.outreach_prospects p
    where p.qualification_status='qualified' and p.verification_status='public_verified' and p.public_business_contact=true
      and (v_segment='general' or p.segment=v_segment)
      and not exists(select 1 from public.marketing_email_suppressions s where lower(s.recipient_email)=p.email_normalized and s.unsubscribed_at is not null)
      and not exists(select 1 from public.outreach_campaign_recipients r where r.campaign_id=p_campaign_id and r.recipient_email_normalized=p.email_normalized)
    order by p.qualification_score desc,p.created_at asc limit v_limit
  ), inserted as (
    insert into public.outreach_campaign_recipients(campaign_id,recipient_email,prospect_name,company_name,role_segment,status,scheduled_for,metadata)
    select p_campaign_id,email,contact_name,company_name,segment,'scheduled',now(),jsonb_build_object('source_url',source_url,'prospect_id',id,'qualification_score',qualification_score)
    from candidate_rows
    on conflict (campaign_id,recipient_email_normalized) do nothing
    returning id,recipient_email_normalized
  )
  select count(*) into v_queued from inserted;

  select count(*) into v_candidates from public.outreach_prospects p
  where p.qualification_status='qualified' and p.verification_status='public_verified' and p.public_business_contact=true
    and (v_segment='general' or p.segment=v_segment);

  update public.outreach_prospects p
  set qualification_status='queued',campaign_id=p_campaign_id,campaign_recipient_id=r.id,last_queued_at=now(),updated_at=now()
  from public.outreach_campaign_recipients r
  where r.campaign_id=p_campaign_id and r.recipient_email_normalized=p.email_normalized and p.qualification_status='qualified';

  perform public.recount_outreach_campaign(p_campaign_id);
  return query select v_queued::bigint,greatest(v_candidates-v_queued,0)::bigint;
end $$;

revoke all on function public.queue_qualified_outreach_prospects(uuid,integer) from public;
grant execute on function public.queue_qualified_outreach_prospects(uuid,integer) to authenticated;

create or replace view public.outreach_prospect_dashboard as
select count(*)::bigint total_prospects,
  count(*) filter(where qualification_status='qualified')::bigint qualified,
  count(*) filter(where qualification_status='queued')::bigint queued,
  count(*) filter(where qualification_status='contacted')::bigint contacted,
  count(*) filter(where qualification_status='replied')::bigint replied,
  count(*) filter(where qualification_status='unsubscribed')::bigint unsubscribed,
  count(*) filter(where qualification_status='invalid')::bigint invalid
from public.outreach_prospects;
