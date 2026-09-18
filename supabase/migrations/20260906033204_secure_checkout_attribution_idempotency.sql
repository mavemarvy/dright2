-- ST-1G: make checkout identity reusable and race-safe.
-- Existing orders already carry the attribution chain; this adds only the uniqueness guard.
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_checkout_id_unique
  ON public.orders(checkout_id)
  WHERE checkout_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_referral_link_id
  ON public.orders(referral_link_id)
  WHERE referral_link_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_tracking_code
  ON public.orders(tracking_code)
  WHERE tracking_code IS NOT NULL;
