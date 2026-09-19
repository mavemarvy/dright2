do $migration$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  select p.oid
    into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'process_verified_guest_order'
  order by p.oid desc
  limit 1;

  if v_oid is null then
    raise exception 'process_verified_guest_order function not found';
  end if;

  v_def := pg_get_functiondef(v_oid);
  v_new := replace(
    v_def,
    'v_seller_amount:=greatest(0,coalesce(g.base_price,0)-v_commission);',
    'v_seller_amount:=greatest(0,coalesce(g.total_amount,0)-coalesce(g.platform_fee_amount,0)-v_commission);'
  );

  if v_new = v_def then
    raise exception 'Expected guest seller earnings expression was not found; migration not applied';
  end if;

  execute v_new;
end
$migration$;
