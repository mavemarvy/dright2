/*
# Database Optimization Phase 3: Audit Trails

## Purpose
Add database-level audit logging for sensitive actions using existing
audit tables (financial_audit_logs, admin_activity_logs). No business logic
changes — triggers fire automatically on row changes.

## Audit Actions Covered
1. Wallet balance changes (cc_wallets) → financial_audit_logs
2. Withdrawal request status changes (withdrawal_requests) → financial_audit_logs
3. Withdrawal queue status changes (withdrawal_queue) → financial_audit_logs
4. Escrow payment status changes (escrow_payments) → financial_audit_logs
5. Payout record changes (payout_records) → financial_audit_logs
6. Paystack transaction status changes (paystack_transactions) → financial_audit_logs
7. Admin role/permission changes (users.is_admin, admin_status, rbac_role_id) → admin_activity_logs
8. Admin permissions changes (admin_permissions) → admin_activity_logs

## Triggers Added (8 trigger pairs = 16 triggers)
1. trg_audit_cc_wallets_update — after UPDATE on cc_wallets
2. trg_audit_withdrawal_requests_update — after UPDATE on withdrawal_requests
3. trg_audit_withdrawal_queue_update — after UPDATE on withdrawal_queue
4. trg_audit_escrow_payments_update — after UPDATE on escrow_payments
5. trg_audit_payout_records_update — after UPDATE on payout_records
6. trg_audit_paystack_tx_update — after UPDATE on paystack_transactions
7. trg_audit_users_admin_fields_update — after UPDATE on users (admin fields only)
8. trg_audit_admin_permissions_insert — after INSERT on admin_permissions
*/

-- ============================================================
-- Helper function: log_financial_audit
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_financial_audit(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_before_state jsonb,
  p_after_state jsonb,
  p_description text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.financial_audit_logs (
    action, entity_type, entity_id,
    actor_id, actor_role, actor_name,
    before_state, after_state, description,
    ip_address
  )
  VALUES (
    p_action, p_entity_type, p_entity_id,
    auth.uid(), NULL, NULL,
    p_before_state, p_after_state, p_description,
    NULL
  );
END;
$function$;

-- ============================================================
-- Helper function: log_admin_activity
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_admin_activity(
  p_action text,
  p_target_type text,
  p_target_id text,
  p_details jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.admin_activity_logs (
    admin_id, action, target_type, target_id, details, ip_address
  )
  VALUES (
    auth.uid(), p_action, p_target_type, p_target_id, p_details, NULL
  );
END;
$function$;

-- ============================================================
-- 1. Audit: cc_wallets balance changes
-- ============================================================
CREATE OR REPLACE FUNCTION public.audit_cc_wallets_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.balance IS DISTINCT FROM OLD.balance THEN
    PERFORM public.log_financial_audit(
      'wallet_balance_change',
    'cc_wallets',
      NEW.id,
      jsonb_build_object('balance', OLD.balance, 'user_id', OLD.user_id),
      jsonb_build_object('balance', NEW.balance, 'user_id', NEW.user_id),
      'Wallet balance updated from ' || OLD.balance || ' to ' || NEW.balance
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_audit_cc_wallets_update
  AFTER UPDATE ON public.cc_wallets
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_cc_wallets_update();

-- ============================================================
-- 2. Audit: withdrawal_requests status changes
-- ============================================================
CREATE OR REPLACE FUNCTION public.audit_withdrawal_requests_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.log_financial_audit(
      'withdrawal_status_change',
      'withdrawal_requests',
      NEW.id,
      jsonb_build_object('status', OLD.status, 'amount', OLD.amount, 'user_id', OLD.user_id),
      jsonb_build_object('status', NEW.status, 'amount', NEW.amount, 'user_id', NEW.user_id),
      'Withdrawal request status changed from ' || OLD.status || ' to ' || NEW.status
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_audit_withdrawal_requests_update
  AFTER UPDATE ON public.withdrawal_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_withdrawal_requests_update();

-- ============================================================
-- 3. Audit: withdrawal_queue status changes
-- ============================================================
CREATE OR REPLACE FUNCTION public.audit_withdrawal_queue_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.log_financial_audit(
      'withdrawal_queue_status_change',
      'withdrawal_queue',
      NEW.id,
      jsonb_build_object('status', OLD.status, 'amount', OLD.amount, 'user_id', OLD.user_id),
      jsonb_build_object('status', NEW.status, 'amount', NEW.amount, 'user_id', NEW.user_id),
      'Withdrawal queue status changed from ' || OLD.status || ' to ' || NEW.status
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_audit_withdrawal_queue_update
  AFTER UPDATE ON public.withdrawal_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_withdrawal_queue_update();

-- ============================================================
-- 4. Audit: escrow_payments status changes
-- ============================================================
CREATE OR REPLACE FUNCTION public.audit_escrow_payments_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.log_financial_audit(
      'escrow_status_change',
      'escrow_payments',
      NEW.id,
      jsonb_build_object('status', OLD.status, 'order_id', OLD.order_id, 'amount', OLD.amount),
      jsonb_build_object('status', NEW.status, 'order_id', NEW.order_id, 'amount', NEW.amount),
      'Escrow payment status changed from ' || OLD.status || ' to ' || NEW.status
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_audit_escrow_payments_update
  AFTER UPDATE ON public.escrow_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_escrow_payments_update();

-- ============================================================
-- 5. Audit: payout_records status changes
-- ============================================================
CREATE OR REPLACE FUNCTION public.audit_payout_records_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.log_financial_audit(
      'payout_status_change',
      'payout_records',
      NEW.id,
      jsonb_build_object('status', OLD.status, 'amount', OLD.amount, 'user_id', OLD.user_id),
      jsonb_build_object('status', NEW.status, 'amount', NEW.amount, 'user_id', NEW.user_id),
      'Payout record status changed from ' || OLD.status || ' to ' || NEW.status
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_audit_payout_records_update
  AFTER UPDATE ON public.payout_records
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_payout_records_update();

-- ============================================================
-- 6. Audit: paystack_transactions status changes
-- ============================================================
CREATE OR REPLACE FUNCTION public.audit_paystack_tx_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.log_financial_audit(
      'paystack_tx_status_change',
      'paystack_transactions',
      NEW.id,
      jsonb_build_object('status', OLD.status, 'amount', OLD.amount, 'reference', OLD.reference, 'user_id', OLD.user_id),
      jsonb_build_object('status', NEW.status, 'amount', NEW.amount, 'reference', NEW.reference, 'user_id', NEW.user_id),
      'Paystack transaction status changed from ' || OLD.status || ' to ' || NEW.status
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_audit_paystack_tx_update
  AFTER UPDATE ON public.paystack_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_paystack_tx_update();

-- ============================================================
-- 7. Audit: users admin field changes (is_admin, admin_status, rbac_role_id)
-- ============================================================
CREATE OR REPLACE FUNCTION public.audit_users_admin_fields_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (NEW.is_admin IS DISTINCT FROM OLD.is_admin)
     OR (NEW.admin_status IS DISTINCT FROM OLD.admin_status)
     OR (NEW.rbac_role_id IS DISTINCT FROM OLD.rbac_role_id)
     OR (NEW.admin_verification_status IS DISTINCT FROM OLD.admin_verification_status)
  THEN
    PERFORM public.log_admin_activity(
      'admin_role_change',
      'users',
      OLD.id::text,
      jsonb_build_object(
        'is_admin', OLD.is_admin,
        'admin_status', OLD.admin_status,
        'rbac_role_id', OLD.rbac_role_id,
        'admin_verification_status', OLD.admin_verification_status,
        'new_is_admin', NEW.is_admin,
        'new_admin_status', NEW.admin_status,
        'new_rbac_role_id', NEW.rbac_role_id,
        'new_admin_verification_status', NEW.admin_verification_status
      )
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_audit_users_admin_fields_update
  AFTER UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_users_admin_fields_update();

-- ============================================================
-- 8. Audit: admin_permissions insert
-- ============================================================
CREATE OR REPLACE FUNCTION public.audit_admin_permissions_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.log_admin_activity(
    'permission_granted',
    'admin_permissions',
    NEW.admin_id::text,
    jsonb_build_object('permission_id', NEW.permission_id, 'granted_by', NEW.granted_by)
  );
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_audit_admin_permissions_insert
  AFTER INSERT ON public.admin_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_admin_permissions_insert();

-- ============================================================
-- Revoke execute from anon/public on audit helper functions
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.log_financial_audit(text, text, uuid, jsonb, jsonb, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.log_admin_activity(text, text, text, jsonb) FROM anon, public;
