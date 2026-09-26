begin;

create or replace function public.get_public_dright_affiliate_level(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $function$
declare
  v_settings public.dright_starter_affiliate_challenge_settings%rowtype;
  v_sales integer:=0;
  v_completed boolean:=false;
begin
  select * into v_settings
  from public.dright_starter_affiliate_challenge_settings
  where singleton=true;

  select count(*)::integer
  into v_sales
  from public.dright_starter_purchases p
  where p.referrer_id=p_user_id
    and p.payment_status='success'
    and p.processed_at is not null;

  v_completed:=v_sales>=coalesce(v_settings.target_sales,20);

  return jsonb_build_object(
    'enabled',coalesce(v_settings.enabled,false),
    'sales',v_sales,
    'target_sales',coalesce(v_settings.target_sales,20),
    'remaining_sales',greatest(coalesce(v_settings.target_sales,20)-v_sales,0),
    'completed',v_completed,
    'current_level_label',case when v_completed then v_settings.unlock_label else v_settings.base_level_label end,
    'current_level_number',case when v_completed then v_settings.unlock_level_number else v_settings.base_level_number end,
    'next_level_label',case when v_completed then null else v_settings.unlock_label end
  );
end;
$function$;

revoke all on function public.get_public_dright_affiliate_level(uuid) from public;
grant execute on function public.get_public_dright_affiliate_level(uuid) to anon,authenticated;

comment on function public.get_public_dright_affiliate_level(uuid) is
  'Returns the public Starter-based affiliate level and verified Starter-sale progress used on affiliate profile surfaces.';

commit;
