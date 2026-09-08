-- ST-6B — preserve the existing Paystack verification/webhook entry point while
-- dispatching verified sales_team_contract payments to the dedicated adapter.

DO $$
BEGIN
  IF to_regprocedure('public.process_paystack_payment_core_st6(text,uuid,numeric,text,uuid,jsonb)') IS NULL
     AND to_regprocedure('public.process_paystack_payment(text,uuid,numeric,text,uuid,jsonb)') IS NOT NULL THEN
    ALTER FUNCTION public.process_paystack_payment(text,uuid,numeric,text,uuid,jsonb)
      RENAME TO process_paystack_payment_core_st6;
  END IF;
END $$;

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
  v_currency text;
BEGIN
  IF COALESCE(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Payment processing requires service_role';
  END IF;

  IF p_purpose='sales_team_contract' THEN
    SELECT upper(currency) INTO v_currency
    FROM public.paystack_transactions
    WHERE reference=p_reference AND user_id=p_user_id;
    IF v_currency IS NULL THEN
      RAISE EXCEPTION 'Canonical Paystack transaction not found';
    END IF;
    RETURN public.process_verified_sales_team_contract_payment(
      p_reference,p_user_id,p_amount,v_currency,'paystack'
    );
  END IF;

  RETURN public.process_paystack_payment_core_st6(
    p_reference,p_user_id,p_amount,p_purpose,p_reference_id,p_metadata
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_paystack_payment(text,uuid,numeric,text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.process_paystack_payment(text,uuid,numeric,text,uuid,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.process_paystack_payment_core_st6(text,uuid,numeric,text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.process_paystack_payment_core_st6(text,uuid,numeric,text,uuid,jsonb) TO service_role;
