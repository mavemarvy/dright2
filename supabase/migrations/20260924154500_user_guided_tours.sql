create table if not exists public.user_tour_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  tour_key text not null,
  tour_version integer not null default 1 check (tour_version > 0),
  status text not null default 'started' check (status in ('started', 'completed', 'skipped')),
  current_step integer not null default 0 check (current_step >= 0),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  skipped_at timestamptz,
  last_seen_at timestamptz not null default now(),
  primary key (user_id, tour_key, tour_version)
);

alter table public.user_tour_progress enable row level security;

create policy "Users can read own tour progress"
  on public.user_tour_progress
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create own tour progress"
  on public.user_tour_progress
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own tour progress"
  on public.user_tour_progress
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.user_tour_progress to authenticated;

comment on table public.user_tour_progress is
  'User-side DRIGHT guided-tour completion state. Admin routes do not use this table.';
