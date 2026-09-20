begin;

create or replace function public.get_public_dright_starter_signup_policy()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_product_enabled boolean:=false;
  v_profiles text[]:='{}'::text[];
begin
  select coalesce(is_enabled,false) and coalesce(public_visible,false)
    into v_product_enabled
  from public.dright_starter_product_settings
  where singleton=true;

  if not coalesce(v_product_enabled,false) then
    return jsonb_build_object(
      'starter_product_required',false,
      'required_profiles','[]'::jsonb
    );
  end if;

  select coalesce(array_agg(distinct profile_value order by profile_value),'{}'::text[])
  into v_profiles
  from (
    select case r.role_key
      when 'freelancer' then 'service_provider'
      when 'affiliate_marketer' then 'affiliate'
      when 'employer' then 'employer'
      when 'task_creator' then 'task_creator'
      when 'task_completer' then 'task_worker'
      else null
    end as profile_value
    from public.platform_access_role_rules r
    where r.requires_subscription=true
      and r.role_key<>'buyer'
    union all
    select 'marketer'
    where exists(
      select 1 from public.platform_access_role_rules
      where role_key='affiliate_marketer' and requires_subscription=true
    )
  ) mapped
  where profile_value is not null;

  return jsonb_build_object(
    'starter_product_required',true,
    'required_profiles',to_jsonb(v_profiles)
  );
end;
$$;

revoke all on function public.get_public_dright_starter_signup_policy() from public;
grant execute on function public.get_public_dright_starter_signup_policy() to anon,authenticated,service_role;

comment on function public.get_public_dright_starter_signup_policy() is
  'Public-safe signup policy: exposes only which onboarding profile values require verified Starter access. Buyer remains free.';

commit;