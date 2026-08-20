/*
# Update process_paystack_payment RPC for stronger idempotency

1. Modified Functions
- `process_paystack_payment`: Now uses SELECT ... FOR UPDATE to lock the transaction row during processing, preventing race conditions between concurrent webhook and verify-endpoint calls. Also sets `processed_at` timestamp on successful processing. Adds audit logging via analytics_events.
2. Notes
- The RPC remains SECURITY DEFINER with search_path = public.
- All existing wallet crediting, ledger entry, and transaction history logic preserved.
- Idempotency is now enforced at two levels: (1) status check, (2) processed_at check, (3) row-level lock.
*/

CREATE OR REPLACE FUNCTION public.process_paystack_payment(
  p_reference text,
  p_user_id uuid,
  p_amount numeric,
  p_purpose text DEFAULT 'wallet_funding',
  p_reference_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tx RECORD;
  v_wallet_id uuid;
  v_result jsonb;
BEGIN
  -- Lock the transaction row to prevent concurrent processing
  SELECT * INTO v_tx FROM paystack_transactions WHERE reference = p_reference FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction not found');
  END IF;

  -- Idempotency: already processed
  IF v_tx.status = 'success' AND v_tx.processed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'message', 'Already processed', 'idempotent', true);
  END IF;

  -- Mark as success
  UPDATE paystack_transactions
  SET status = 'success', paid_at = COALESCE(paid_at, now()), processed_at = now(), updated_at = now()
  WHERE reference = p_reference AND status != 'success';

  -- Get or create wallet
  SELECT id INTO v_wallet_id FROM cc_wallets WHERE user_id = p_user_id;
  IF v_wallet_id IS NULL THEN
    INSERT INTO cc_wallets (user_id) VALUES (p_user_id) RETURNING id INTO v_wallet_id;
  END IF;

  -- Credit wallet based on purpose
  IF p_purpose = 'wallet_funding' OR p_purpose = 'advertiser_funding' THEN
    SELECT process_wallet_transaction(
      p_user_id, v_wallet_id, 'credit', p_amount,
      'Wallet funding via card', 'deposit', p_reference, p_metadata, 'balance'
    ) INTO v_result;
  ELSIF p_purpose = 'product_purchase' OR p_purpose = 'escrow' THEN
    SELECT process_wallet_transaction(
      p_user_id, v_wallet_id, 'credit', p_amount,
      'Payment for order', 'deposit', p_reference, p_metadata, 'escrow_balance'
    ) INTO v_result;
  ELSIF p_purpose = 'subscription' OR p_purpose = 'affiliate_subscription' OR p_purpose = 'vendor_subscription' THEN
    SELECT process_wallet_transaction(
      p_user_id, v_wallet_id, 'credit', p_amount,
      'Subscription payment', 'deposit', p_reference, p_metadata, 'balance'
    ) INTO v_result;
  ELSE
    SELECT process_wallet_transaction(
      p_user_id, v_wallet_id, 'credit', p_amount,
      'Payment received', 'deposit', p_reference, p_metadata, 'balance'
    ) INTO v_result;
  END IF;

  -- Audit log via analytics_events
  INSERT INTO analytics_events (event_type, entity_type, entity_id, seller_id, viewer_id, metadata)
  VALUES (
    'payment_processed',
    'paystack_transaction',
    v_tx.id,
    p_user_id,
    p_user_id,
    jsonb_build_object('reference', p_reference, 'amount', p_amount, 'purpose', p_purpose, 'source', 'rpc')
  );

  RETURN jsonb_build_object('success', true, 'wallet_result', v_result, 'processed_at', now());
END;
$function$;
