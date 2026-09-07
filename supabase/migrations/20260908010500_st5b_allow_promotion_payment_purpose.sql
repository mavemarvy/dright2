-- ST-5B follow-up: allow the existing Paystack transaction ledger to carry
-- the server-authoritative promotion_campaign purpose.

ALTER TABLE public.paystack_transactions
  DROP CONSTRAINT IF EXISTS paystack_transactions_purpose_check;

ALTER TABLE public.paystack_transactions
  ADD CONSTRAINT paystack_transactions_purpose_check
  CHECK (purpose = ANY (ARRAY[
    'wallet_funding'::text,
    'product_purchase'::text,
    'subscription'::text,
    'escrow'::text,
    'advertiser_funding'::text,
    'affiliate_subscription'::text,
    'vendor_subscription'::text,
    'promotion_campaign'::text
  ]));
