-- Progression rule maintenance helpers
create or replace function public.set_sales_progression_rule_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_sales_progression_rules_updated_at on public.sales_progression_rules;
create trigger trg_sales_progression_rules_updated_at
before update on public.sales_progression_rules
for each row execute function public.set_sales_progression_rule_updated_at();

-- The admin-sales-team server action progression_rule_update must be the only
-- client-facing write path. It updates updated_by from the authenticated admin.
