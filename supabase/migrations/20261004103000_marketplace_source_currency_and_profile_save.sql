-- DRIGHT marketplace source-currency semantics and safe self-profile updates.
-- The live database was updated first; this migration keeps preview/new environments in sync.

alter table public.site_settings
  add column if not exists default_currency text not null default 'USD',
  add column if not exists force_default_currency boolean not null default false;

update public.site_settings
set default_currency='USD'
where singleton=true
  and (default_currency is null or default_currency !~ '^[A-Z]{3}$');

create or replace function public.update_my_profile_settings(
  p_full_name text,
  p_phone text,
  p_account_number text,
  p_location text,
  p_preferred_currency text
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_currency text:=upper(trim(coalesce(p_preferred_currency,'USD')));
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if v_currency !~ '^[A-Z]{3}$' then raise exception 'invalid preferred currency'; end if;

  update public.users
  set full_name=nullif(trim(coalesce(p_full_name,'')),''),
      phone=nullif(trim(coalesce(p_phone,'')),''),
      account_number=nullif(trim(coalesce(p_account_number,'')),''),
      location=nullif(trim(coalesce(p_location,'')),''),
      preferred_currency=v_currency,
      updated_at=now()
  where id=v_uid;

  if not found then raise exception 'user profile not found'; end if;

  insert into public.user_currency_preferences(user_id,currency,updated_at)
  values(v_uid,v_currency,now())
  on conflict(user_id) do update
    set currency=excluded.currency,updated_at=excluded.updated_at;

  return jsonb_build_object('success',true,'preferred_currency',v_currency);
end;
$$;

revoke all on function public.update_my_profile_settings(text,text,text,text,text) from public,anon;
grant execute on function public.update_my_profile_settings(text,text,text,text,text) to authenticated;

create or replace function public.set_my_preferred_currency(p_currency text)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_currency text:=upper(trim(coalesce(p_currency,'')));
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if v_currency !~ '^[A-Z]{3}$' then raise exception 'invalid preferred currency'; end if;

  update public.users
  set preferred_currency=v_currency,updated_at=now()
  where id=v_uid;

  if not found then raise exception 'user profile not found'; end if;

  insert into public.user_currency_preferences(user_id,currency,updated_at)
  values(v_uid,v_currency,now())
  on conflict(user_id) do update
    set currency=excluded.currency,updated_at=excluded.updated_at;

  return jsonb_build_object('success',true,'currency',v_currency);
end;
$$;

revoke all on function public.set_my_preferred_currency(text) from public,anon;
grant execute on function public.set_my_preferred_currency(text) to authenticated;

-- Preserve old unmarked listing amounts in the uploader's actual preferred currency.
update public.products p
set specifications=coalesce(p.specifications,'{}'::jsonb)
    || jsonb_build_object(
      'price_currency',upper(coalesce(u.preferred_currency,'USD')),
      'source_currency',upper(coalesce(u.preferred_currency,'USD'))
    ),
    updated_at=now()
from public.users u
where u.id=p.uploaded_by
  and not (coalesce(p.specifications,'{}'::jsonb) ? 'price_currency')
  and not (coalesce(p.specifications,'{}'::jsonb) ? 'source_currency')
  and upper(coalesce(u.preferred_currency,'USD')) ~ '^[A-Z]{3}$';
