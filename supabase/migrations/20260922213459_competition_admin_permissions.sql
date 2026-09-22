begin;

create or replace function public.monthly_growth_competition_admin_allowed()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select auth.uid() is not null and (
    public.is_super_admin() is true
    or public.has_dright_permission('cms','manage') is true
    or public.has_dright_permission('referrals','manage') is true
    or public.has_dright_permission('referrals','rewards_manage') is true
    or public.has_dright_permission('affiliates','manage') is true
    or public.has_dright_permission('affiliates','fraud_review') is true
    or public.has_dright_permission('payments','manage') is true
    or public.has_rbac_permission('payouts','manage') is true
  );
$$;

revoke all on function public.monthly_growth_competition_admin_allowed() from public,anon;
grant execute on function public.monthly_growth_competition_admin_allowed() to authenticated,service_role;

commit;
