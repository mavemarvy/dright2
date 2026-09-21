begin;

create or replace function public.get_public_dright_starter_signup_policy()
returns jsonb
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select jsonb_build_object(
    'starter_product_required',false,
    'required_profiles','[]'::jsonb,
    'starter_funnel_payment_required',true,
    'standard_signup_available',true
  );
$$;

revoke all on function public.get_public_dright_starter_signup_policy() from public;
grant execute on function public.get_public_dright_starter_signup_policy() to anon,authenticated,service_role;

commit;