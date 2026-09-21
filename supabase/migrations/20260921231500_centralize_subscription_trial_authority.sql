begin;

create or replace function public.enforce_subscription_plan_trial_authority()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  -- All introductory access trials are centralized in platform_access_settings.
  -- The verified DRIGHT Starter purchase uses platform_access_trial_grants instead.
  new.trial_days := 0;
  return new;
end;
$$;

drop trigger if exists trg_subscription_plan_trial_authority on public.subscription_plans;
create trigger trg_subscription_plan_trial_authority
before insert or update of trial_days
on public.subscription_plans
for each row
execute function public.enforce_subscription_plan_trial_authority();

update public.subscription_plans set trial_days=0 where trial_days<>0;

commit;