-- Normalize affiliate attribution before immutable order snapshots are created.
-- Self-referral (buyer or seller) is removed and cannot earn affiliate commission.

CREATE OR REPLACE FUNCTION public.normalize_marketplace_order_attribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
  IF lower(coalesce(new.source_type,'')) = 'affiliate' AND new.referrer_id IS NOT NULL THEN
    IF new.referrer_id IS NOT DISTINCT FROM new.buyer_id
       OR new.referrer_id IS NOT DISTINCT FROM new.seller_id THEN
      new.referrer_id := NULL;
      new.referrer_role := NULL;
      new.referral_link_id := NULL;
      new.tracking_code := NULL;
      new.source_type := NULL;
      new.source_level := NULL;
      new.affiliate_commission_amount := 0;
    ELSE
      new.referrer_role := 'affiliate';
    END IF;
  END IF;

  RETURN new;
END;
$function$;

DROP TRIGGER IF EXISTS trg_00_normalize_marketplace_order_attribution ON public.orders;

CREATE TRIGGER trg_00_normalize_marketplace_order_attribution
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.normalize_marketplace_order_attribution();

-- Repair only unpaid legacy rows. The immutable-snapshot guard is temporarily
-- disabled for this one migration and immediately restored.
ALTER TABLE public.orders DISABLE TRIGGER trg_guard_order_financial_attribution_snapshot;

UPDATE public.orders
SET
  referrer_id = NULL,
  referrer_role = NULL,
  referral_link_id = NULL,
  tracking_code = NULL,
  source_type = NULL,
  source_level = NULL,
  affiliate_commission_amount = 0
WHERE upper(coalesce(status,'')) = 'PENDING'
  AND lower(coalesce(source_type,'')) = 'affiliate'
  AND referrer_id IS NOT NULL
  AND (referrer_id = buyer_id OR referrer_id = seller_id);

UPDATE public.orders
SET referrer_role = 'affiliate'
WHERE upper(coalesce(status,'')) = 'PENDING'
  AND lower(coalesce(source_type,'')) = 'affiliate'
  AND referrer_id IS NOT NULL
  AND referrer_id IS DISTINCT FROM buyer_id
  AND referrer_id IS DISTINCT FROM seller_id
  AND coalesce(referrer_role,'') NOT IN ('affiliate','marketer','advertiser','admin');

ALTER TABLE public.orders ENABLE TRIGGER trg_guard_order_financial_attribution_snapshot;
