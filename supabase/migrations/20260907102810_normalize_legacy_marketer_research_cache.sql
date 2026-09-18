update public.users u
set marketer_deep_research = (
  select coalesce(jsonb_agg(
    case
      when elem->>'status'='failed' and jsonb_array_length(coalesce(elem->'search_evidence','[]'::jsonb))>0
      then jsonb_set(elem,'{status}','"partial"'::jsonb,true)
      else elem
    end
  ),'[]'::jsonb)
  from jsonb_array_elements(coalesce(u.marketer_deep_research,'[]'::jsonb)) elem
), updated_at=now()
where jsonb_typeof(u.marketer_deep_research)='array'
  and exists (
    select 1 from jsonb_array_elements(u.marketer_deep_research) e
    where e->>'status'='failed' and jsonb_array_length(coalesce(e->'search_evidence','[]'::jsonb))>0
  );