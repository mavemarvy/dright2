
create or replace function public.mark_listing_intelligence_dirty()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_id uuid;
begin
  if tg_table_name='products' then
    v_id:=case when tg_op='DELETE' then old.id else new.id end;
  elsif tg_table_name='listing_events' then
    v_id:=case when tg_op='DELETE' then old.listing_id else new.listing_id end;
  else
    v_id:=null;
  end if;

  if v_id is not null then
    insert into public.listing_intelligence_dirty(listing_id,dirty_at,reason)
    values(v_id,now(),tg_table_name)
    on conflict(listing_id) do update
      set dirty_at=excluded.dirty_at,reason=excluded.reason;
  end if;

  return case when tg_op='DELETE' then old else new end;
end;
$$;
