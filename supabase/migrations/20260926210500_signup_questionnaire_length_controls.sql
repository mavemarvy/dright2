create table if not exists public.signup_onboarding_settings (
  singleton boolean primary key default true check (singleton),
  questionnaire_mode text not null default 'brief'
    check (questionnaire_mode in ('off','minimal','brief','full')),
  show_interests_during_signup boolean not null default false,
  show_documents_during_signup boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid null references public.users(id) on delete set null
);

comment on table public.signup_onboarding_settings is
  'Global DRIGHT2 signup-length policy. Questionnaires omitted from signup remain available in Settings and keep their full definitions/history.';

insert into public.signup_onboarding_settings (
  singleton,
  questionnaire_mode,
  show_interests_during_signup,
  show_documents_during_signup
)
values (true,'brief',false,false)
on conflict (singleton) do nothing;

alter table public.signup_onboarding_settings enable row level security;

drop policy if exists signup_onboarding_settings_public_read on public.signup_onboarding_settings;
create policy signup_onboarding_settings_public_read
on public.signup_onboarding_settings
for select
to anon, authenticated
using (singleton = true);

create or replace function public.set_signup_onboarding_settings(
  p_questionnaire_mode text,
  p_show_interests_during_signup boolean,
  p_show_documents_during_signup boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_previous public.signup_onboarding_settings%rowtype;
  v_row public.signup_onboarding_settings%rowtype;
  v_mode text := lower(coalesce(btrim(p_questionnaire_mode),''));
begin
  if auth.uid() is null or not public.has_dright_permission('site_settings','manage') then
    raise exception 'insufficient_privilege' using errcode='42501';
  end if;

  if v_mode not in ('off','minimal','brief','full') then
    raise exception 'Invalid questionnaire mode' using errcode='22023';
  end if;

  select * into v_previous
  from public.signup_onboarding_settings
  where singleton=true;

  insert into public.signup_onboarding_settings (
    singleton,
    questionnaire_mode,
    show_interests_during_signup,
    show_documents_during_signup,
    updated_at,
    updated_by
  )
  values (
    true,
    v_mode,
    coalesce(p_show_interests_during_signup,false),
    coalesce(p_show_documents_during_signup,false),
    now(),
    auth.uid()
  )
  on conflict (singleton) do update set
    questionnaire_mode=excluded.questionnaire_mode,
    show_interests_during_signup=excluded.show_interests_during_signup,
    show_documents_during_signup=excluded.show_documents_during_signup,
    updated_at=excluded.updated_at,
    updated_by=excluded.updated_by
  returning * into v_row;

  if v_previous.questionnaire_mode is distinct from v_row.questionnaire_mode
     or v_previous.show_interests_during_signup is distinct from v_row.show_interests_during_signup
     or v_previous.show_documents_during_signup is distinct from v_row.show_documents_during_signup then
    perform public.log_admin_activity(
      'signup_onboarding_settings_changed',
      'signup_onboarding_settings',
      'global',
      jsonb_build_object(
        'previous', jsonb_build_object(
          'questionnaire_mode',v_previous.questionnaire_mode,
          'show_interests_during_signup',v_previous.show_interests_during_signup,
          'show_documents_during_signup',v_previous.show_documents_during_signup
        ),
        'current', jsonb_build_object(
          'questionnaire_mode',v_row.questionnaire_mode,
          'show_interests_during_signup',v_row.show_interests_during_signup,
          'show_documents_during_signup',v_row.show_documents_during_signup
        )
      )
    );
  end if;

  return jsonb_build_object(
    'questionnaire_mode',v_row.questionnaire_mode,
    'show_interests_during_signup',v_row.show_interests_during_signup,
    'show_documents_during_signup',v_row.show_documents_during_signup,
    'updated_at',v_row.updated_at,
    'updated_by',v_row.updated_by
  );
end;
$$;

revoke all on function public.set_signup_onboarding_settings(text,boolean,boolean) from public;
grant execute on function public.set_signup_onboarding_settings(text,boolean,boolean) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='signup_onboarding_settings'
  ) then
    alter publication supabase_realtime add table public.signup_onboarding_settings;
  end if;
end $$;
