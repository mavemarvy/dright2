begin;

create or replace function public.admin_upsert_listing_allowance_rule(p_rule jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid:=nullif(p_rule->>'id','')::uuid;
  v_scope text:=lower(coalesce(p_rule->>'scope_type','global'));
  v_listing_type text;
  v_category_id uuid;
  v_role_key text;
  v_user_id uuid;
  v_row public.listing_allowance_rules%rowtype;
begin
  if auth.uid() is null or not public.has_dright_permission('subscriptions','manage') then
    raise exception 'Subscription management permission required';
  end if;

  if v_scope not in ('global','listing_type','category','role','user') then
    raise exception 'Invalid rule scope';
  end if;

  if coalesce((p_rule->>'free_allowance')::integer,-1)<0 then
    raise exception 'Allowance cannot be negative';
  end if;

  -- Normalize fields so stale UI values cannot create contradictory scopes.
  v_listing_type := case
    when v_scope in ('listing_type','category','role','user')
      then nullif(upper(trim(p_rule->>'listing_type_code')),'')
    else null
  end;
  v_category_id := case
    when v_scope='category' then nullif(p_rule->>'category_id','')::uuid
    else null
  end;
  v_role_key := case
    when v_scope='role' then nullif(lower(trim(p_rule->>'role_key')),'')
    else null
  end;
  v_user_id := case
    when v_scope='user' then nullif(p_rule->>'user_id','')::uuid
    else null
  end;

  if v_scope='listing_type' and v_listing_type is null then
    raise exception 'Listing type is required';
  end if;
  if v_scope='category' and v_category_id is null then
    raise exception 'Category is required';
  end if;
  if v_scope='role' and v_role_key is null then
    raise exception 'Role key is required';
  end if;
  if v_scope='user' and v_user_id is null then
    raise exception 'User is required';
  end if;

  if v_id is null then
    insert into public.listing_allowance_rules(
      name,scope_type,listing_type_code,category_id,role_key,user_id,
      free_allowance,priority,is_active,created_by,updated_by
    )
    values(
      coalesce(nullif(trim(p_rule->>'name'),''),'Listing allowance rule'),
      v_scope,v_listing_type,v_category_id,v_role_key,v_user_id,
      (p_rule->>'free_allowance')::integer,
      coalesce((p_rule->>'priority')::integer,100),
      coalesce((p_rule->>'is_active')::boolean,true),
      auth.uid(),auth.uid()
    )
    returning * into v_row;
  else
    update public.listing_allowance_rules
    set name=coalesce(nullif(trim(p_rule->>'name'),''),name),
        scope_type=v_scope,
        listing_type_code=v_listing_type,
        category_id=v_category_id,
        role_key=v_role_key,
        user_id=v_user_id,
        free_allowance=(p_rule->>'free_allowance')::integer,
        priority=coalesce((p_rule->>'priority')::integer,priority),
        is_active=coalesce((p_rule->>'is_active')::boolean,is_active),
        updated_at=now(),
        updated_by=auth.uid()
    where id=v_id
    returning * into v_row;

    if not found then raise exception 'Listing allowance rule not found'; end if;
  end if;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.admin_upsert_listing_allowance_rule(jsonb) from public,anon;
grant execute on function public.admin_upsert_listing_allowance_rule(jsonb) to authenticated,service_role;

commit;