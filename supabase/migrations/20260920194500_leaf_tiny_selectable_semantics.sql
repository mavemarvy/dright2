begin;

-- Leaf is a taxonomy level (depth 5), while Tiny is optional (depth 6).
-- A Leaf-level node remains selectable even when Tiny discovery nodes exist below it.
with recursive tree as (
  select c.id,c.parent_id,0::integer as depth
  from public.marketplace_taxonomy_categories c
  where c.parent_id is null
  union all
  select child.id,child.parent_id,parent.depth+1
  from public.marketplace_taxonomy_categories child
  join tree parent on parent.id=child.parent_id
)
update public.marketplace_taxonomy_categories c
set is_leaf=true,updated_at=now()
from tree t
where c.id=t.id and t.depth=5 and c.is_active=true;

commit;