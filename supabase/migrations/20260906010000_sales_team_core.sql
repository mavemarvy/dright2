create table if not exists public.sales_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  description text,
  status text not null default 'active' check (status in ('active','inactive','suspended','archived')),
  manager_id uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_team_members (
  id uuid primary key default gen_random_uuid(),
  sales_team_id uuid not null references public.sales_teams(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  member_role text not null default 'member' check (member_role in ('member','lead','manager')),
  marketer_level integer not null default 3 check (marketer_level between 3 and 5),
  status text not null default 'active' check (status in ('active','inactive','suspended')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sales_team_id, user_id)
);

create index if not exists idx_sales_team_members_user on public.sales_team_members(user_id);
create index if not exists idx_sales_team_members_team_status on public.sales_team_members(sales_team_id,status);

create table if not exists public.sales_team_settings (
  id boolean primary key default true check (id),
  default_member_level integer not null default 3 check (default_member_level between 3 and 5),
  require_active_team_for_attribution boolean not null default true,
  allow_product_specific_links boolean not null default true,
  allow_campaign_links boolean not null default true,
  max_active_teams_per_member integer not null default 1 check (max_active_teams_per_member between 1 and 20),
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.sales_team_settings(id) values(true) on conflict (id) do nothing;

create unique index if not exists idx_sales_team_one_active_membership
on public.sales_team_members(user_id)
where status='active';

create or replace function public.sales_team_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at=now(); return new; end $$;

drop trigger if exists trg_sales_teams_updated_at on public.sales_teams;
create trigger trg_sales_teams_updated_at before update on public.sales_teams for each row execute function public.sales_team_touch_updated_at();
drop trigger if exists trg_sales_team_members_updated_at on public.sales_team_members;
create trigger trg_sales_team_members_updated_at before update on public.sales_team_members for each row execute function public.sales_team_touch_updated_at();

alter table public.sales_teams enable row level security;
alter table public.sales_team_members enable row level security;
alter table public.sales_team_settings enable row level security;

revoke all on public.sales_teams from anon, authenticated;
revoke all on public.sales_team_members from anon, authenticated;
revoke all on public.sales_team_settings from anon, authenticated;
grant all on public.sales_teams to service_role;
grant all on public.sales_team_members to service_role;
grant all on public.sales_team_settings to service_role;
