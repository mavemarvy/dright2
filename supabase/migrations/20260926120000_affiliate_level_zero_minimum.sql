begin;

create or replace function public.admin_update_dright_affiliate_levels(p_levels jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_item jsonb;
  v_level integer;
  v_title text;
  v_sales integer;
  v_limit integer;
  v_starter_only boolean;
  v_seen integer[]:='{}'::integer[];
begin
  if auth.uid() is null or not public.has_dright_permission('subscriptions','manage') then
    raise exception 'Subscription management permission required';
  end if;

  if jsonb_typeof(p_levels)<>'array' or jsonb_array_length(p_levels)<>11 then
    raise exception 'Affiliate level configuration must contain levels 0 through 10';
  end if;

  for v_item in select value from jsonb_array_elements(p_levels)
  loop
    v_level:=(v_item->>'level_number')::integer;
    v_title:=trim(coalesce(v_item->>'title',''));
    v_sales:=greatest(coalesce((v_item->>'sales_to_next')::integer,0),0);
    v_limit:=case
      when v_item ? 'product_limit' and v_item->'product_limit'<>'null'::jsonb
        then (v_item->>'product_limit')::integer
      else null
    end;
    v_starter_only:=coalesce((v_item->>'starter_only')::boolean,false);

    if v_level<0 or v_level>10 or v_level=any(v_seen) then
      raise exception 'Affiliate levels must uniquely contain 0 through 10';
    end if;
    if v_title='' then raise exception 'Every affiliate level requires a title'; end if;
    if v_sales>1000000000 then raise exception 'Sales requirement is too large'; end if;
    if v_limit is not null and (v_limit<1 or v_limit>1000000) then
      raise exception 'Product limit must be between 1 and 1000000, or unlimited';
    end if;

    if v_level=0 then
      v_sales:=greatest(v_sales,1);
      v_starter_only:=true;
      v_limit:=1;
    elsif v_level=10 then
      v_sales:=0;
    end if;

    v_seen:=array_append(v_seen,v_level);

    insert into public.dright_affiliate_levels(
      level_number,title,sales_to_next,product_limit,starter_only,sort_order,updated_at,updated_by
    )
    values(v_level,v_title,v_sales,v_limit,v_starter_only,v_level,now(),auth.uid())
    on conflict(level_number) do update
    set title=excluded.title,
        sales_to_next=excluded.sales_to_next,
        product_limit=excluded.product_limit,
        starter_only=excluded.starter_only,
        sort_order=excluded.sort_order,
        updated_at=now(),
        updated_by=auth.uid();
  end loop;

  if not (select array_agg(x order by x)=array[0,1,2,3,4,5,6,7,8,9,10] from unnest(v_seen) x) then
    raise exception 'Affiliate levels must contain every level from 0 through 10';
  end if;

  update public.dright_starter_affiliate_challenge_settings
  set target_sales=(select sales_to_next from public.dright_affiliate_levels where level_number=0),
      base_level_label=(select title from public.dright_affiliate_levels where level_number=0),
      base_level_number=0,
      unlock_label=(select title from public.dright_affiliate_levels where level_number=1),
      unlock_level_number=1,
      updated_at=now(),
      updated_by=auth.uid()
  where singleton=true;

  insert into public.admin_logs(admin_id,action_type,target_type,details)
  values(
    auth.uid(),
    'dright_affiliate_levels_update',
    'dright_affiliate_levels',
    jsonb_build_object('levels',public.admin_get_dright_affiliate_levels())
  );

  return public.admin_get_dright_affiliate_levels();
end;
$function$;

commit;