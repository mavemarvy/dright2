-- ST-6C — conversion-time sales-team attribution guard.
-- Enforces paid contract + active membership at the canonical orders boundary so
-- stale or forged sales-team links cannot survive into checkout regardless of writer.

CREATE OR REPLACE FUNCTION public.guard_order_sales_team_attribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  v_contract public.sales_team_contracts%ROWTYPE;
  v_membership public.sales_team_members%ROWTYPE;
BEGIN
  IF NEW.source_type IS DISTINCT FROM 'sales_team' THEN
    RETURN NEW;
  END IF;

  IF NEW.referrer_id IS NULL
     OR NEW.referral_link_id IS NULL
     OR NEW.sales_team_id IS NULL
     OR NEW.team_member_id IS NULL
     OR NEW.product_id IS NULL
     OR NEW.seller_id IS NULL THEN
    RAISE EXCEPTION 'Incomplete sales team attribution';
  END IF;

  IF NEW.team_member_id IS DISTINCT FROM NEW.referrer_id THEN
    RAISE EXCEPTION 'Sales team member must match attributed referrer';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.referral_links rl
    WHERE rl.id=NEW.referral_link_id
      AND rl.user_id=NEW.referrer_id
      AND rl.product_id=NEW.product_id
      AND rl.source_type='sales_team'
      AND rl.sales_team_id=NEW.sales_team_id
      AND rl.team_member_id=NEW.team_member_id
      AND rl.team_lead_id IS NOT DISTINCT FROM NEW.team_lead_id
  ) THEN
    RAISE EXCEPTION 'Canonical sales team tracking link does not match order attribution';
  END IF;

  SELECT c.* INTO v_contract
  FROM public.sales_team_contracts c
  WHERE c.sales_team_id=NEW.referrer_id
    AND c.product_id=NEW.product_id
    AND c.seller_id=NEW.seller_id
    AND c.status='active'
    AND c.payment_status='paid'
    AND c.payment_verified_at IS NOT NULL
    AND c.expires_at>now()
    AND c.selected_tier LIKE 'Mkt L%'
  ORDER BY c.starts_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active paid sales team contract is valid for this order';
  END IF;

  SELECT stm.* INTO v_membership
  FROM public.sales_team_members stm
  JOIN public.sales_teams st ON st.id=stm.sales_team_id
  WHERE stm.sales_team_id=NEW.sales_team_id
    AND stm.user_id=NEW.team_member_id
    AND stm.status='active'
    AND st.status='active'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attributed sales team member is not active in the canonical team';
  END IF;

  IF NEW.team_lead_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.sales_team_members lead
    WHERE lead.sales_team_id=NEW.sales_team_id
      AND lead.user_id=NEW.team_lead_id
      AND lead.status='active'
      AND lead.member_role IN ('lead','manager')
  ) THEN
    RAISE EXCEPTION 'Attributed sales team lead is not active in the canonical team';
  END IF;

  IF NEW.source_level IS DISTINCT FROM v_contract.selected_tier THEN
    RAISE EXCEPTION 'Sales team attribution tier does not match paid contract';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_order_sales_team_attribution ON public.orders;
CREATE TRIGGER trg_guard_order_sales_team_attribution
BEFORE INSERT OR UPDATE OF source_type,referrer_id,referral_link_id,sales_team_id,team_member_id,team_lead_id,source_level,product_id,seller_id
ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.guard_order_sales_team_attribution();

REVOKE ALL ON FUNCTION public.guard_order_sales_team_attribution() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_order_sales_team_attribution() TO service_role;
