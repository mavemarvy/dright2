alter table public.outreach_campaign_recipients
  add column if not exists recipient_email_normalized text generated always as (lower(btrim(recipient_email))) stored;

drop index if exists outreach_campaign_recipients_campaign_email_unique;
create unique index if not exists outreach_campaign_recipients_campaign_email_normalized_unique
  on public.outreach_campaign_recipients(campaign_id,recipient_email_normalized);

update public.outreach_campaigns c
set created_by=coalesce(c.created_by,(
  select o.user_id from public.notification_email_outbox o
  where o.campaign_id=c.id and o.user_id is not null
  order by o.created_at asc limit 1
))
where c.created_by is null;

create or replace function public.import_outreach_campaign_recipients(
  p_campaign_id uuid,p_rows jsonb,p_scheduled_for timestamptz default now()
)
returns table(inserted_count bigint,skipped_count bigint)
language plpgsql security definer set search_path=public as $$
declare
  v_is_admin boolean:=false; v_requested bigint:=0; v_before bigint:=0; v_after bigint:=0; v_capacity bigint:=0;
begin
  select exists(select 1 from public.users u where u.id=auth.uid() and u.is_admin=true and u.admin_status='active') into v_is_admin;
  if not v_is_admin then raise exception 'Active admin access required'; end if;
  if jsonb_typeof(p_rows)<>'array' then raise exception 'p_rows must be a JSON array'; end if;
  v_requested:=jsonb_array_length(p_rows);
  if v_requested=0 then return query select 0::bigint,0::bigint; return; end if;
  if v_requested>5000 then raise exception 'Maximum 5000 recipients per import chunk'; end if;

  select max_audience_size into v_capacity from public.outreach_campaigns where id=p_campaign_id;
  if v_capacity is null then raise exception 'Campaign not found'; end if;
  select count(*) into v_before from public.outreach_campaign_recipients where campaign_id=p_campaign_id;
  if v_before>=v_capacity then raise exception 'Campaign audience capacity reached'; end if;

  with rows as (
    select lower(btrim(x.email)) email,nullif(btrim(x.prospect_name),'') prospect_name,
      nullif(btrim(x.company_name),'') company_name,
      coalesce(nullif(btrim(x.role_segment),''),'general') role_segment,
      coalesce(x.metadata,'{}'::jsonb) metadata
    from jsonb_to_recordset(p_rows) as x(email text,prospect_name text,company_name text,role_segment text,metadata jsonb)
    where x.email is not null and position('@' in x.email)>1
  ), deduped as (
    select distinct on(email) email,prospect_name,company_name,role_segment,metadata from rows
    where not exists(
      select 1 from public.marketing_email_suppressions s
      where lower(s.recipient_email)=rows.email and s.unsubscribed_at is not null
    )
    order by email
    limit greatest(0,least(5000,(v_capacity-v_before)::int))
  )
  insert into public.outreach_campaign_recipients(campaign_id,recipient_email,prospect_name,company_name,role_segment,status,scheduled_for,metadata)
  select p_campaign_id,email,prospect_name,company_name,role_segment,'scheduled',coalesce(p_scheduled_for,now()),metadata
  from deduped
  on conflict (campaign_id,recipient_email_normalized) do nothing;

  select count(*) into v_after from public.outreach_campaign_recipients where campaign_id=p_campaign_id;
  perform public.recount_outreach_campaign(p_campaign_id);
  return query select greatest(v_after-v_before,0)::bigint,greatest(v_requested-(v_after-v_before),0)::bigint;
end $$;

revoke all on function public.import_outreach_campaign_recipients(uuid,jsonb,timestamptz) from public;
grant execute on function public.import_outreach_campaign_recipients(uuid,jsonb,timestamptz) to authenticated;
