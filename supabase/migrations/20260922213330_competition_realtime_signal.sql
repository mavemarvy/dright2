begin;

create table if not exists public.monthly_growth_realtime_signal (
  singleton boolean primary key default true check (singleton),
  version bigint not null default 0,
  pulse_at timestamptz not null default now(),
  source_table text
);

insert into public.monthly_growth_realtime_signal(singleton)
values(true)
on conflict(singleton) do nothing;

alter table public.monthly_growth_realtime_signal enable row level security;

drop policy if exists monthly_growth_realtime_signal_read on public.monthly_growth_realtime_signal;
create policy monthly_growth_realtime_signal_read
on public.monthly_growth_realtime_signal
for select
to anon,authenticated
using (true);

revoke insert,update,delete,truncate,references,trigger
on public.monthly_growth_realtime_signal
from anon,authenticated;
grant select on public.monthly_growth_realtime_signal to anon,authenticated;

create or replace function public.bump_monthly_growth_realtime_signal()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.monthly_growth_realtime_signal
  set version=version+1,
      pulse_at=clock_timestamp(),
      source_table=TG_TABLE_NAME
  where singleton=true;
  return null;
end;
$$;

revoke all on function public.bump_monthly_growth_realtime_signal() from public,anon,authenticated;

do $$
declare
  t text;
  trigger_name text;
begin
  foreach t in array array[
    'monthly_growth_challenge_settings',
    'monthly_growth_challenge_snapshots',
    'monthly_growth_challenge_awards',
    'referral_relationships',
    'orders',
    'products',
    'commission_splits',
    'dright_starter_purchases'
  ]
  loop
    trigger_name:='trg_monthly_growth_signal_'||t;
    execute format('drop trigger if exists %I on public.%I',trigger_name,t);
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each statement execute function public.bump_monthly_growth_realtime_signal()',
      trigger_name,t
    );
  end loop;
end $$;

do $$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
     and not exists(
       select 1 from pg_publication_tables
       where pubname='supabase_realtime'
         and schemaname='public'
         and tablename='monthly_growth_realtime_signal'
     ) then
    alter publication supabase_realtime add table public.monthly_growth_realtime_signal;
  end if;
end $$;

commit;
