-- Paystack verification hardening:
-- 1) allow reversal_pending while Paystack refunds are queued,
-- 2) force transactional payment/refund emails,
-- 3) emit one payment confirmation only after financial processing completes.

ALTER TABLE public.paystack_transactions
  DROP CONSTRAINT IF EXISTS paystack_transactions_status_check;

ALTER TABLE public.paystack_transactions
  ADD CONSTRAINT paystack_transactions_status_check
  CHECK (status = ANY (ARRAY[
    'initialized'::text,
    'pending'::text,
    'success'::text,
    'failed'::text,
    'abandoned'::text,
    'reversed'::text,
    'reversal_pending'::text
  ]));

CREATE OR REPLACE FUNCTION public.should_email_notification(
  p_user_id uuid,
  p_notification_type text,
  p_category text,
  p_priority text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_global_email boolean := true;
  v_category_enabled boolean := true;
  v_type_email boolean := true;
  v_settings record;
  v_pref record;
BEGIN
  IF p_user_id IS NULL THEN RETURN false; END IF;

  SELECT delivery_channels, category_toggles
  INTO v_settings
  FROM public.notification_user_settings
  WHERE user_id = p_user_id;

  IF found THEN
    IF v_settings.delivery_channels ? 'email' THEN
      v_global_email := coalesce((v_settings.delivery_channels->>'email')::boolean, true);
    END IF;
    IF p_category IS NOT NULL AND v_settings.category_toggles ? p_category THEN
      v_category_enabled := coalesce((v_settings.category_toggles->>p_category)::boolean, true);
    END IF;
  END IF;

  SELECT email_enabled, delivery_channels
  INTO v_pref
  FROM public.notification_preferences
  WHERE user_id = p_user_id
    AND notification_type = p_notification_type;

  IF found THEN
    v_type_email := coalesce(v_pref.email_enabled, true);
    IF v_pref.delivery_channels ? 'email' THEN
      v_type_email := v_type_email
        AND coalesce((v_pref.delivery_channels->>'email')::boolean, true);
    END IF;
  END IF;

  IF p_priority = 'critical'
     OR p_category IN ('security','wallet','orders')
     OR p_notification_type IN (
       'payment_success',
       'payment_refund_pending',
       'payment_refund_attention',
       'payment_refund_processed',
       'payout',
       'affiliate_commission',
       'referral_commission',
       'wallet_deposit',
       'wallet_withdrawal',
       'new_order',
       'order_status'
     ) THEN
    RETURN true;
  END IF;

  RETURN v_global_email AND v_category_enabled AND v_type_email;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_paystack_success()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_type text;
  v_category text;
  v_title text;
  v_amount numeric;
BEGIN
  IF new.status <> 'success' OR new.processed_at IS NULL OR new.user_id IS NULL THEN
    RETURN new;
  END IF;

  IF tg_op='UPDATE'
     AND old.status='success'
     AND old.processed_at IS NOT NULL THEN
    RETURN new;
  END IF;

  BEGIN
    v_amount := NULLIF(new.metadata->>'authoritative_amount','')::numeric;
  EXCEPTION WHEN others THEN
    v_amount := NULL;
  END;
  v_amount := COALESCE(v_amount, new.amount, 0);

  IF new.purpose='wallet_funding' OR new.purpose='advertiser_funding' THEN
    v_type:='wallet_deposit';
    v_category:='wallet';
    v_title:='Wallet funding successful';
  ELSIF new.purpose IN ('product_purchase','escrow') THEN
    v_type:='payment_success';
    v_category:='orders';
    v_title:='Payment confirmed';
  ELSIF new.purpose ILIKE '%promotion%' THEN
    v_type:='payment_success';
    v_category:='orders';
    v_title:='Promotion payment confirmed';
  ELSE
    v_type:='payment_success';
    v_category:='wallet';
    v_title:='Payment confirmed';
  END IF;

  INSERT INTO public.notifications(
    user_id,title,message,notification_type,related_id,category,priority,
    metadata,group_key,is_read,is_archived,is_deleted
  )
  SELECT
    new.user_id,
    v_title,
    'DRIGHT confirmed your payment of ' || trim(to_char(v_amount,'FM999999999990.00'))
      || CASE WHEN nullif(new.currency,'') IS NOT NULL THEN ' ' || upper(new.currency) ELSE '' END || '.',
    v_type,
    coalesce(new.reference_id,new.id),
    v_category,
    'high',
    jsonb_build_object(
      'paystack_transaction_id',new.id,
      'reference',new.reference,
      'purpose',new.purpose,
      'amount',v_amount,
      'currency',new.currency,
      'channel',new.channel,
      'event_module','payment',
      'event_type','payment_confirmed',
      'action_url',CASE
        WHEN new.purpose IN ('wallet_funding','advertiser_funding') THEN '/wallet'
        WHEN new.purpose ILIKE '%promotion%' THEN '/promote'
        ELSE '/my-orders'
      END
    ),
    'paystack-success:' || new.id::text,
    false,false,false
  WHERE NOT EXISTS(
    SELECT 1 FROM public.notifications n
    WHERE n.group_key='paystack-success:' || new.id::text
      AND n.user_id=new.user_id
      AND n.is_deleted=false
  );

  RETURN new;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_paystack_success ON public.paystack_transactions;

CREATE TRIGGER trg_notify_paystack_success
AFTER INSERT OR UPDATE OF status, processed_at ON public.paystack_transactions
FOR EACH ROW
EXECUTE FUNCTION public.notify_paystack_success();
