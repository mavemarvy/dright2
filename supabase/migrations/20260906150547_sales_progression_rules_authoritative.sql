
create table if not exists public.sales_progression_rules (
  stage_key text primary key,
  stage_label text not null,
  weekly_target integer not null default 0 check (weekly_target >= 0),
  required_success_streak integer not null default 1 check (required_success_streak >= 1),
  required_total_sales integer null check (required_total_sales >= 0),
  downgrade_after_failures integer not null default 1 check (downgrade_after_failures >= 1),
  next_stage_key text null,
  downgrade_stage_key text null,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint sales_progression_rules_next_fk foreign key (next_stage_key) references public.sales_progression_rules(stage_key) deferrable initially deferred,
  constraint sales_progression_rules_down_fk foreign key (downgrade_stage_key) references public.sales_progression_rules(stage_key) deferrable initially deferred
);

alter table public.sales_progression_rules enable row level security;

drop policy if exists "authenticated_read_sales_progression_rules" on public.sales_progression_rules;
create policy "authenticated_read_sales_progression_rules"
on public.sales_progression_rules for select
to authenticated
using (true);

insert into public.sales_progression_rules
(stage_key,stage_label,weekly_target,required_success_streak,required_total_sales,downgrade_after_failures,next_stage_key,downgrade_stage_key,active)
values
('marketer_0','Marketer 0',10,1,null,1,'marketer_1',null,true),
('marketer_1','Marketer 1',50,1,null,1,'marketer_2','marketer_0',true),
('marketer_2','Marketer 2',200,1,null,1,'marketer_3','marketer_1',true),
('marketer_3','Marketer 3',250,1,null,1,'marketer_4','marketer_2',true),
('marketer_4','Marketer 4',350,1,null,1,'marketer_5','marketer_3',true),
('marketer_5','Marketer 5',500,1,null,1,'advertiser_a','marketer_4',true),
('advertiser_a','Advertiser A',500,1,null,1,'advertiser_b','marketer_5',true),
('advertiser_b','Advertiser B',500,1,null,1,'advertiser_c','advertiser_a',true),
('advertiser_c','Advertiser C',600,1,null,1,'advertiser_pro','advertiser_b',true),
('advertiser_pro','Advertiser Pro',1000,1,null,1,'advertiser_super','advertiser_c',true),
('advertiser_super','Advertiser Super',1000,1,null,1,'partnership','advertiser_pro',true),
('partnership','Partnership',4000,1,null,1,null,'advertiser_super',true)
on conflict (stage_key) do nothing;
