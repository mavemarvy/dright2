-- ST-7 — Financial reconciliation and payment-boundary hardening.
-- No new ledger is introduced. Existing Paystack, orders, wallets, ledger_entries,
-- commission_splits, refunds, promotions and sales-team contracts remain canonical.

-- Strengthen the original public processor signature: every service-side call must
-- agree with the locked canonical Paystack row. Metadata used downstream comes from
-- that row rather than caller-supplied browser-derived values.
CREATE OR REPLACE FUNCTION public.process_paystack_payment(
  p_reference text,
  p_user_id uuid,
  p_amount numeric,
  p_purpose text,
  p_reference_id uuid,
  p_metadata jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  v_tx public.paystack_transactions%ROWTYPE;
  v_currency text;
BEGIN
  IF COALESCE(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Payment processing requires service_role';
  END IF;

  SELECT * INTO v_tx
  FROM public.paystack_transactions
  WHERE reference=p_reference
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Canonical Paystack transaction not found'; END IF;
  IF v_tx.user_id IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'Payment user mismatch'; END IF;
  IF v_tx.purpose IS DISTINCT FROM p_purpose THEN RAISE EXCEPTION 'Payment purpose mismatch'; END IF;
  IF v_tx.reference_id IS DISTINCT FROM p_reference_id THEN RAISE EXCEPTION 'Payment reference target mismatch'; END IF;
  IF abs(COALESCE(v_tx.amount,0)-COALESCE(p_amount,0)) > 0.01 THEN RAISE EXCEPTION 'Payment amount mismatch'; END IF;
  IF v_tx.status <> 'success' THEN RAISE EXCEPTION 'Paystack transaction is not verified successful'; END IF;

  IF p_purpose='sales_team_contract' THEN
    v_currency:=upper(v_tx.currency);
    RETURN public.process_verified_sales_team_contract_payment(
      p_reference,p_user_id,v_tx.amount,v_currency,'paystack'
    );
  END IF;

  RETURN public.process_paystack_payment_core_st6(
    p_reference,p_user_id,v_tx.amount,v_tx.purpose,v_tx.reference_id,COALESCE(v_tx.metadata,'{}'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.process_paystack_payment(text,uuid,numeric,text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.process_paystack_payment(text,uuid,numeric,text,uuid,jsonb) TO service_role;

-- Classify pre-authoritative successful transactions. This is audit metadata only;
-- it does NOT credit a wallet, complete an order, or fabricate provider verification.
UPDATE public.paystack_transactions
SET metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object(
      'reconciliation_state','legacy_success_requires_gateway_reverification',
      'reconciliation_flagged_at',now()
    ),
    updated_at=now()
WHERE status='success'
  AND processed_at IS NULL
  AND created_at < timestamptz '2026-09-06 00:00:00+00'
  AND COALESCE(metadata->>'reconciliation_state','')='';

CREATE OR REPLACE FUNCTION public.get_financial_reconciliation_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  v_role text:=COALESCE(auth.role(),'');
  v_uid uuid:=auth.uid();
  v_is_admin boolean:=false;
  v_result jsonb;
BEGIN
  IF v_role <> 'service_role' THEN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
    SELECT COALESCE(u.is_admin,false) INTO v_is_admin FROM public.users u WHERE u.id=v_uid;
    IF NOT COALESCE(v_is_admin,false) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  END IF;

  SELECT jsonb_build_object(
    'generated_at',now(),
    'status',CASE WHEN
      (SELECT count(*) FROM public.paystack_transactions WHERE status='success' AND processed_at IS NULL AND COALESCE(metadata->>'reconciliation_state','') <> 'legacy_success_requires_gateway_reverification')=0
      AND (SELECT count(*) FROM public.paystack_transactions pt LEFT JOIN public.orders o ON o.id=pt.reference_id WHERE pt.purpose IN ('product_purchase','escrow') AND pt.status='success' AND pt.processed_at IS NOT NULL AND (o.id IS NULL OR o.status<>'COMPLETED' OR abs(COALESCE(o.final_price,0)-COALESCE(pt.amount,0))>0.01))=0
      AND (SELECT count(*) FROM public.orders o LEFT JOIN public.paystack_transactions pt ON pt.reference_id=o.id AND pt.purpose IN ('product_purchase','escrow') AND pt.status='success' AND pt.processed_at IS NOT NULL WHERE o.status='COMPLETED' AND NOT o.is_free_order AND pt.id IS NULL)=0
      AND (SELECT count(*) FROM public.promotion_campaigns pc LEFT JOIN public.paystack_transactions pt ON pt.reference=pc.payment_id AND pt.purpose='promotion_campaign' WHERE pc.payment_status='paid' AND (pt.id IS NULL OR pt.status<>'success' OR pt.processed_at IS NULL OR pt.reference_id IS DISTINCT FROM pc.id OR abs(COALESCE(pt.amount,0)-COALESCE(pc.budget,0))>0.01 OR upper(COALESCE(pt.currency,''))<>upper(COALESCE(pc.billing_currency,''))))=0
      AND (SELECT count(*) FROM public.sales_team_contracts c LEFT JOIN public.paystack_transactions pt ON pt.reference=c.payment_id AND pt.purpose='sales_team_contract' WHERE c.payment_status='paid' AND (pt.id IS NULL OR pt.status<>'success' OR pt.processed_at IS NULL OR pt.reference_id IS DISTINCT FROM c.id OR abs(COALESCE(pt.amount,0)-COALESCE(c.total_amount,0))>0.01 OR upper(COALESCE(pt.currency,''))<>upper(COALESCE(c.billing_currency,''))))=0
      THEN 'healthy' ELSE 'attention_required' END,
    'paystack',jsonb_build_object(
      'successful_total',(SELECT count(*) FROM public.paystack_transactions WHERE status='success'),
      'processed_successful',(SELECT count(*) FROM public.paystack_transactions WHERE status='success' AND processed_at IS NOT NULL),
      'unprocessed_successful_current',(SELECT count(*) FROM public.paystack_transactions WHERE status='success' AND processed_at IS NULL AND COALESCE(metadata->>'reconciliation_state','') <> 'legacy_success_requires_gateway_reverification'),
      'legacy_success_requires_gateway_reverification',(SELECT count(*) FROM public.paystack_transactions WHERE status='success' AND processed_at IS NULL AND metadata->>'reconciliation_state'='legacy_success_requires_gateway_reverification'),
      'duplicate_reference_groups',(SELECT count(*) FROM (SELECT reference FROM public.paystack_transactions GROUP BY reference HAVING count(*)>1) d),
      'duplicate_gateway_reference_groups',(SELECT count(*) FROM (SELECT paystack_reference FROM public.paystack_transactions WHERE paystack_reference IS NOT NULL GROUP BY paystack_reference HAVING count(*)>1) d)
    ),
    'orders',jsonb_build_object(
      'completed_paid_without_processed_payment',(SELECT count(*) FROM public.orders o LEFT JOIN public.paystack_transactions pt ON pt.reference_id=o.id AND pt.purpose IN ('product_purchase','escrow') AND pt.status='success' AND pt.processed_at IS NOT NULL WHERE o.status='COMPLETED' AND NOT o.is_free_order AND pt.id IS NULL),
      'processed_payment_order_mismatch',(SELECT count(*) FROM public.paystack_transactions pt LEFT JOIN public.orders o ON o.id=pt.reference_id WHERE pt.purpose IN ('product_purchase','escrow') AND pt.status='success' AND pt.processed_at IS NOT NULL AND (o.id IS NULL OR o.status<>'COMPLETED' OR abs(COALESCE(o.final_price,0)-COALESCE(pt.amount,0))>0.01)),
      'legacy_success_pending_order',(SELECT count(*) FROM public.paystack_transactions pt JOIN public.orders o ON o.id=pt.reference_id WHERE pt.purpose IN ('product_purchase','escrow') AND pt.status='success' AND pt.processed_at IS NULL AND metadata->>'reconciliation_state'='legacy_success_requires_gateway_reverification' AND o.status<>'COMPLETED')
    ),
    'wallets',jsonb_build_object(
      'negative_balance_rows',(SELECT count(*) FROM public.cc_wallets w WHERE COALESCE(w.balance,0)<0 OR COALESCE(w.escrow_balance,0)<0 OR COALESCE(w.pending_balance,0)<0 OR COALESCE(w.locked_balance,0)<0 OR COALESCE(w.referral_balance,0)<0 OR COALESCE(w.affiliate_balance,0)<0 OR COALESCE(w.creator_balance,0)<0 OR COALESCE(w.advertiser_budget,0)<0 OR COALESCE(w.seller_earnings,0)<0),
      'ledger_latest_balance_mismatches',(
        SELECT count(*) FROM (
          SELECT DISTINCT ON (le.wallet_id,le.account) le.wallet_id,le.account,le.balance_after
          FROM public.ledger_entries le ORDER BY le.wallet_id,le.account,le.created_at DESC,le.id DESC
        ) x JOIN public.cc_wallets w ON w.id=x.wallet_id
        WHERE abs(COALESCE(x.balance_after,0)-COALESCE(CASE x.account
          WHEN 'balance' THEN w.balance WHEN 'escrow_balance' THEN w.escrow_balance WHEN 'pending_balance' THEN w.pending_balance
          WHEN 'locked_balance' THEN w.locked_balance WHEN 'referral_balance' THEN w.referral_balance WHEN 'affiliate_balance' THEN w.affiliate_balance
          WHEN 'creator_balance' THEN w.creator_balance WHEN 'advertiser_budget' THEN w.advertiser_budget WHEN 'seller_earnings' THEN w.seller_earnings ELSE x.balance_after END,0))>0.01
      )
    ),
    'commissions',jsonb_build_object(
      'distributed_without_completed_order',(SELECT count(*) FROM public.commission_splits cs LEFT JOIN public.orders o ON o.id=cs.order_id WHERE cs.status='distributed' AND (o.id IS NULL OR o.status<>'COMPLETED')),
      'distributed_without_ledger',(SELECT count(*) FROM public.commission_splits cs WHERE cs.status='distributed' AND cs.ledger_entry_id IS NULL),
      'over_reversed_splits',(SELECT count(*) FROM public.commission_splits cs WHERE COALESCE(cs.reversed_amount,0)>COALESCE(cs.amount,0)+0.01)
    ),
    'refunds',jsonb_build_object(
      'completed_not_financially_processed',(SELECT count(*) FROM public.refund_records r WHERE r.status='completed' AND r.financial_processed_at IS NULL),
      'financially_processed_without_completion',(SELECT count(*) FROM public.refund_records r WHERE r.financial_processed_at IS NOT NULL AND r.status<>'completed')
    ),
    'promotions',jsonb_build_object(
      'paid_payment_mismatches',(SELECT count(*) FROM public.promotion_campaigns pc LEFT JOIN public.paystack_transactions pt ON pt.reference=pc.payment_id AND pt.purpose='promotion_campaign' WHERE pc.payment_status='paid' AND (pt.id IS NULL OR pt.status<>'success' OR pt.processed_at IS NULL OR pt.reference_id IS DISTINCT FROM pc.id OR abs(COALESCE(pt.amount,0)-COALESCE(pc.budget,0))>0.01 OR upper(COALESCE(pt.currency,''))<>upper(COALESCE(pc.billing_currency,''))))
    ),
    'sales_team_contracts',jsonb_build_object(
      'paid_payment_mismatches',(SELECT count(*) FROM public.sales_team_contracts c LEFT JOIN public.paystack_transactions pt ON pt.reference=c.payment_id AND pt.purpose='sales_team_contract' WHERE c.payment_status='paid' AND (pt.id IS NULL OR pt.status<>'success' OR pt.processed_at IS NULL OR pt.reference_id IS DISTINCT FROM c.id OR abs(COALESCE(pt.amount,0)-COALESCE(c.total_amount,0))>0.01 OR upper(COALESCE(pt.currency,''))<>upper(COALESCE(c.billing_currency,''))))
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_financial_reconciliation_health() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_financial_reconciliation_health() TO authenticated,service_role;
