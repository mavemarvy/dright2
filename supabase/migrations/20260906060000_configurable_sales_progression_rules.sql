-- Configurable Sales Team progression rules
create table if not exists public.sales_progression_rules (
  stage_key text primary key,
  stage_label text not null,
  weekly_target integer not null check (weekly_target >= 0),
  required_success_streak integer not null default 1 check (required_success_streak >= 1),
  required_total_sales integer,
  downgrade_after_failures integer not null default 4 check (downgrade_after_failures >= 1),
  next_stage_key text,
  downgrade_stage_key text,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into public.sales_progression_rules
(stage_key,stage_label,weekly_target,required_success_streak,required_total_sales,downgrade_after_failures,next_stage_key,downgrade_stage_key)
values
('marketer_0','Marketer 0',10,1,null,4,'marketer_1',null),
('marketer_1','Marketer 1',50,1,null,4,'marketer_2',null),
('marketer_2','Marketer 2',200,1,null,4,'marketer_3',null),
('marketer_3','Marketer 3',250,1,null,4,'marketer_4',null),
('marketer_4','Marketer 4',350,1,null,4,'marketer_5',null),
('marketer_5','Marketer 5',500,2,null,4,'advertiser_a',null),
('advertiser_a','Advertiser A',500,4,5000,4,'advertiser_b','marketer_5'),
('advertiser_b','Advertiser B',500,4,10000,4,'advertiser_c','advertiser_a'),
('advertiser_c','Advertiser C',600,4,50000,4,'advertiser_pro','advertiser_b'),
('advertiser_pro','Advertiser Pro',1000,4,50000,4,'advertiser_super','advertiser_b'),
('advertiser_super','Advertiser Super',1000,4,100000,4,'partnership','advertiser_pro'),
('partnership','Partnership',4000,4,null,4,null,'advertiser_super')
on conflict (stage_key) do nothing;

create or replace function public.get_sales_progression_rule(p_stage_key text)
returns public.sales_progression_rules
language sql stable security definer set search_path=public
as $$ select * from public.sales_progression_rules where stage_key=p_stage_key and active=true limit 1 $$;

alter table public.sales_progression_rules enable row level security;
revoke all on public.sales_progression_rules from anon;
grant select on public.sales_progression_rules to authenticated, service_role;
grant all on public.sales_progression_rules to service_role;

-- Admin writes must continue through the existing admin-sales-team server function.
-- Each rule change must update updated_at/updated_by and be audit logged.
