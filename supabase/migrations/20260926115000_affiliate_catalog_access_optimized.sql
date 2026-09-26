begin;

create or replace function public.get_my_affiliate_catalog_access(p_product_ids uuid[] default null)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $function$
declare
  v_uid uuid:=auth.uid();
  v_state jsonb;
  v_limit integer;
  v_starter_only boolean:=false;
  v_enforced boolean:=false;
  v_accessible uuid[]:='{}'::uuid[];
  v_locked uuid[]:='{}'::uuid[];
  v_eligible uuid[]:='{}'::uuid[];
begin
  if v_uid is null then
    return jsonb_build_object(
      'authenticated',false,
      'accessible_product_ids','[]'::jsonb,
      'locked_product_ids','[]'::jsonb,
      'affiliate_eligible_product_ids','[]'::jsonb
    );
  end if;

  v_state:=public.get_dright_affiliate_level_state(v_uid);
  v_enforced:=coalesce((v_state->>'access_rules_apply')::boolean,false);
  v_starter_only:=coalesce((v_state->>'starter_only')::boolean,false);
  v_limit:=case
    when v_state->'product_limit'='null'::jsonb then null
    else greatest(coalesce((v_state->>'product_limit')::integer,0),0)
  end;

  with ranked as (
    select
      p.id,
      (
        p.sku='DRIGHT-STARTER-ACCESS'
        or coalesce(p.specifications->>'system_product_kind','')='dright_starter_access'
      ) as is_starter,
      row_number() over(
        order by
          case
            when p.sku='DRIGHT-STARTER-ACCESS'
              or coalesce(p.specifications->>'system_product_kind','')='dright_starter_access'
            then 0 else 1
          end,
          coalesce(p.total_sales,0) desc,
          greatest(coalesce(p.affiliate_commission_percent,0),coalesce(p.commission_rate,0)) desc,
          p.created_at desc,
          p.id
      )::integer as rn
    from public.products p
    where p.is_active=true
      and coalesce(p.is_hidden,false)=false
      and p.approval_status='approved'
      and (
        coalesce(p.affiliate_commission_percent,p.commission_rate,0)>0
        or p.sku='DRIGHT-STARTER-ACCESS'
        or coalesce(p.specifications->>'system_product_kind','')='dright_starter_access'
      )
  ),
  scoped as (
    select r.*,
      case
        when not v_enforced then true
        when v_starter_only then r.is_starter
        when v_limit is null then true
        else r.rn<=v_limit
      end as allowed
    from ranked r
    where p_product_ids is null or r.id=any(p_product_ids)
  )
  select
    coalesce(array_agg(id),'{}'::uuid[]),
    coalesce(array_agg(id) filter(where allowed),'{}'::uuid[]),
    coalesce(array_agg(id) filter(where not allowed),'{}'::uuid[])
  into v_eligible,v_accessible,v_locked
  from scoped;

  return v_state || jsonb_build_object(
    'authenticated',true,
    'accessible_product_ids',to_jsonb(v_accessible),
    'locked_product_ids',to_jsonb(v_locked),
    'affiliate_eligible_product_ids',to_jsonb(v_eligible)
  );
end;
$function$;

revoke all on function public.get_my_affiliate_catalog_access(uuid[]) from public;
grant execute on function public.get_my_affiliate_catalog_access(uuid[]) to authenticated;

comment on function public.get_my_affiliate_catalog_access(uuid[]) is
  'Returns the current affiliate level plus eligible, accessible and locked product IDs. Ranking is calculated once per request for scalable level-based catalog access.';

commit;