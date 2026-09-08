-- ST-7B — make legacy gateway-review exceptions explicit in financial health.
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
  v_current_issues bigint;
  v_legacy_count bigint;
  v_result jsonb;
BEGIN
  IF v_role <> 'service_role' THEN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
    SELECT COALESCE(u.is_admin,false) INTO v_is_admin FROM public.users u WHERE u.id=v_uid;
    IF NOT COALESCE(v_is_admin,false) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  END IF;

  SELECT count(*) INTO v_legacy_count
  FROM public.paystack_transactions
  WHERE status='success' AND processed_at IS NULL
    AND metadata->>'reconciliation_state'='legacy_success_requires_gateway_reverification';

  SELECT
    (SELECT count(*) FROM public.paystack_transactions WHERE status='success' AND processed_at IS NULL AND COALESCE(metadata->>'reconciliation_state','') <> 'legacy_success_requires_gateway_reverification')
    + (SELECT count(*) FROM public.paystack_transactions pt LEFT JOIN public.orders o ON o.id=pt.reference_id WHERE pt.purpose IN ('product_purchase','escrow') AND pt.status='success' AND pt.processed_at IS NOT NULL AND (o.id IS NULL OR o.status<>'COMPLETED' OR abs(COALESCE(o.final_price,0)-COALESCE(pt.amount,0))>0.01))
    + (SELECT count(*) FROM public.orders o LEFT JOIN public.paystack_transactions pt ON pt.reference_id=o.id AND pt.purpose IN ('product_purchase','escrow') AND pt.status='success' AND pt.processed_at IS NOT NULL WHERE o.status='COMPLETED' AND NOT o.is_free_order AND pt.id IS NULL)
    + (SELECT count(*) FROM public.promotion_campaigns pc LEFT JOIN public.paystack_transactions pt ON pt.reference=pc.payment_id AND pt.purpose='promotion_campaign' WHERE pc.payment_status='paid' AND (pt.id IS NULL OR pt.status<>'success' OR pt.processed_at IS NULL OR pt.reference_id IS DISTINCT FROM pc.id OR abs(COALESCE(pt.amount,0)-COALESCE(pc.budget,0))>0.01 OR upper(COALESCE(pt.currency,''))<>upper(COALESCE(pc.billing_currency,''))))
    + (SELECT count(*) FROM public.sales_team_contracts c LEFT JOIN public.paystack_transactions pt ON pt.reference=c.payment_id AND pt.purpose='sales_team_contract' WHERE c.payment_status='paid' AND (pt.id IS NULL OR pt.status<>'success' OR pt.processed_at IS NULL OR pt.reference_id IS DISTINCT FROM c.id OR abs(COALESCE(pt.amount,0)-COALESCE(c.total_amount,0))>0.01 OR upper(COALESCE(pt.currency,''))<>upper(COALESCE(c.billing_currency,''))))
    + (SELECT count(*) FROM public.refund_records r WHERE r.status='completed' AND r.financial_processed_at IS NULL)
    + (SELECT count(*) FROM public.commission_splits cs WHERE cs.status='distributed' AND cs.ledger_entry_id IS NULL)
  INTO v_current_issues;

  SELECT jsonb_build_object(
    'generated_at',now(),
    'status',CASE WHEN v_current_issues>0 THEN 'attention_required' WHEN v_legacy_count>0 THEN 'healthy_with_legacy_review' ELSE 'healthy' END,
    'current_issue_count',v_current_issues,
    'legacy_review_required',v_legacy_count>0,
    'paystack',jsonb_build_object(
      'successful_total',(SELECT count(*) FROM public.paystack_transactions WHERE status='success'),
      'processed_successful',(SELECT count(*) FROM public.paystack_transactions WHERE status='success' AND processed_at IS NOT NULL),
      'unprocessed_successful_current',(SELECT count(*) FROM public.paystack_transactions WHERE status='success' AND processed_at IS NULL AND COALESCE(metadata->>'reconciliation_state','') <> 'legacy_success_requires_gateway_reverification'),
      'legacy_success_requires_gateway_reverification',v_legacy_count,
      'duplicate_reference_groups',(SELECT count(*) FROM (SELECT reference FROM public.paystack_transactions GROUP BY reference HAVING count(*)>1) d),
      'duplicate_gateway_reference_groups',(SELECT count(*) FROM (SELECT paystack_reference FROM public.paystack_transactions WHERE paystack_reference IS NOT NULL GROUP BY paystack_reference HAVING count(*)>1) d)
    ),
    'orders',jsonb_build_object(
      'completed_paid_without_processed_payment',(SELECT count(*) FROM public.orders o LEFT JOIN public.paystack_transactions pt ON pt.reference_id=o.id AND pt.purpose IN ('product_purchase','escrow') AND pt.status='success' AND pt.processed_at IS NOT NULL WHERE o.status='COMPLETED' AND NOT o.is_free_order AND pt.id IS NULL),
      'processed_payment_order_mismatch',(SELECT count(*) FROM public.paystack_transactions pt LEFT JOIN public.orders o ON o.id=pt.reference_id WHERE pt.purpose IN ('product_purchase','escrow') AND pt.status='success' AND pt.processed_at IS NOT NULL AND (o.id IS NULL OR o.status<>'COMPLETED' OR abs(COALESCE(o.final_price,0)-COALESCE(pt.amount,0))>0.01)),
      'legacy_success_pending_order',(SELECT count(*) FROM public.paystack_transactions pt JOIN public.orders o ON o.id=pt.reference_id WHERE pt.purpose IN ('product_purchase','escrow') AND pt.status='success' AND pt.processed_at IS NULL AND pt.metadata->>'reconciliation_state'='legacy_success_requires_gateway_reverification' AND o.status<>'COMPLETED')
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
