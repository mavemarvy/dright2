alter table public.email_delivery_settings
  add column if not exists adaptive_warmup_enabled boolean not null default true,
  add column if not exists adaptive_min_sample integer not null default 20,
  add column if not exists adaptive_max_hourly_cap integer not null default 500,
  add column if not exists adaptive_max_daily_cap integer not null default 5000,
  add column if not exists good_bounce_rate numeric(6,5) not null default 0.02000,
  add column if not exists pause_bounce_rate numeric(6,5) not null default 0.05000,
  add column if not exists good_complaint_rate numeric(6,5) not null default 0.00100,
  add column if not exists pause_complaint_rate numeric(6,5) not null default 0.00300,
  add column if not exists last_adaptive_check_at timestamptz,
  add column if not exists last_bounce_rate numeric(8,6),
  add column if not exists last_complaint_rate numeric(8,6);

create or replace function public.adjust_outreach_warmup_limits()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  s public.email_delivery_settings%rowtype;
  v_sample bigint:=0;
  v_bounced bigint:=0;
  v_complained bigint:=0;
  v_bounce_rate numeric:=0;
  v_complaint_rate numeric:=0;
  v_new_hourly integer;
  v_new_daily integer;
  v_action text:='unchanged';
begin
  select * into s from public.email_delivery_settings where singleton=true;
  if not found or not s.adaptive_warmup_enabled then
    return jsonb_build_object('action','disabled');
  end if;

  select
    count(*) filter(where provider_message_id is not null)::bigint,
    count(*) filter(where bounced_at is not null)::bigint,
    count(*) filter(where complained_at is not null)::bigint
  into v_sample,v_bounced,v_complained
  from public.outreach_campaign_recipients
  where created_at >= now()-interval '7 days';

  if v_sample>0 then
    v_bounce_rate:=v_bounced::numeric/v_sample::numeric;
    v_complaint_rate:=v_complained::numeric/v_sample::numeric;
  end if;

  v_new_hourly:=s.marketing_hourly_cap;
  v_new_daily:=s.marketing_daily_cap;

  if v_sample >= s.adaptive_min_sample then
    if v_complaint_rate >= s.pause_complaint_rate or v_bounce_rate >= s.pause_bounce_rate then
      v_new_hourly:=greatest(1,floor(s.marketing_hourly_cap*0.5)::integer);
      v_new_daily:=greatest(5,floor(s.marketing_daily_cap*0.5)::integer);
      v_action:='reduced';
    elsif v_complaint_rate <= s.good_complaint_rate and v_bounce_rate <= s.good_bounce_rate then
      v_new_hourly:=least(s.adaptive_max_hourly_cap,greatest(s.marketing_hourly_cap+1,ceil(s.marketing_hourly_cap*1.5)::integer));
      v_new_daily:=least(s.adaptive_max_daily_cap,greatest(s.marketing_daily_cap+5,ceil(s.marketing_daily_cap*1.5)::integer));
      v_action:=case when v_new_hourly>s.marketing_hourly_cap or v_new_daily>s.marketing_daily_cap then 'increased' else 'at_max' end;
    end if;
  else
    v_action:='waiting_for_sample';
  end if;

  update public.email_delivery_settings
  set marketing_hourly_cap=v_new_hourly,
      marketing_daily_cap=v_new_daily,
      last_adaptive_check_at=now(),
      last_bounce_rate=v_bounce_rate,
      last_complaint_rate=v_complaint_rate,
      notes=coalesce(notes,'') || E'\nAdaptive warm-up check: ' || now()::text ||
        ' sample=' || v_sample::text ||
        ' bounce=' || round(v_bounce_rate*100,3)::text || '%' ||
        ' complaint=' || round(v_complaint_rate*100,3)::text || '%' ||
        ' action=' || v_action,
      updated_at=now()
  where singleton=true;

  return jsonb_build_object(
    'action',v_action,
    'sample',v_sample,
    'bounce_rate',v_bounce_rate,
    'complaint_rate',v_complaint_rate,
    'hourly_cap',v_new_hourly,
    'daily_cap',v_new_daily
  );
end;
$$;

revoke all on function public.adjust_outreach_warmup_limits() from public;
grant execute on function public.adjust_outreach_warmup_limits() to service_role;

do $$
declare v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname='outreach-adaptive-warmup-every-6-hours' limit 1;
  if v_jobid is not null then perform cron.unschedule(v_jobid); end if;
  perform cron.schedule(
    'outreach-adaptive-warmup-every-6-hours',
    '17 */6 * * *',
    $cron$select public.adjust_outreach_warmup_limits();$cron$
  );
end $$;
