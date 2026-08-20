/*
# Financial Center: Platform Accounting, Transaction History, Refund Center, Audit Logs

## Overview
This migration builds the complete Financial Center infrastructure for DRIGHT.
It extends the existing transaction system and adds platform-level accounting tables.

## 1. Extended Columns on cc_transactions
Adds columns to support full transaction history with receipt numbers, gateway info,
device/IP tracking, currency conversion, and relational links.

## 2. New Tables

### platform_accounts
Separate platform-level balances (operating, escrow, settlement, reserve, refund,
marketing, tax). Single-row-per-account-type design. Immutable balance changes only
through platform_ledger_entries.

### platform_ledger_entries
Platform-level double-entry ledger. Every money movement at the platform level
generates a debit + credit pair. No entry can ever be deleted.

### refund_records
Dedicated refund tracking center with reason, approver, timeline, and status workflow.

### financial_audit_logs
Every financial action (admin manual credit/debit, refund approval, withdrawal
processing, escrow release) records who/what/when/device/IP for compliance.

### transaction_receipts
Receipt/invoice generation with QR verification codes for every transaction.

## 3. Security
- RLS enabled on all new tables.
- Platform accounts and platform ledger: admin-only access.
- Refund records: admin + owner (user can see own refund status).
- Audit logs: admin-only.
- Receipts: owner + admin.

## 4. Indexes
- Indexes on all frequently-queried columns (user_id, status, date, category, reference).
*/

-- ============================================================
-- 1. EXTEND cc_transactions
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cc_transactions' AND column_name = 'reference') THEN
    ALTER TABLE cc_transactions ADD COLUMN reference text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cc_transactions' AND column_name = 'receipt_number') THEN
    ALTER TABLE cc_transactions ADD COLUMN receipt_number text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cc_transactions' AND column_name = 'currency') THEN
    ALTER TABLE cc_transactions ADD COLUMN currency text DEFAULT 'NGN';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cc_transactions' AND column_name = 'exchange_rate') THEN
    ALTER TABLE cc_transactions ADD COLUMN exchange_rate numeric DEFAULT 1.0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cc_transactions' AND column_name = 'gateway') THEN
    ALTER TABLE cc_transactions ADD COLUMN gateway text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cc_transactions' AND column_name = 'balance_before') THEN
    ALTER TABLE cc_transactions ADD COLUMN balance_before numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cc_transactions' AND column_name = 'status') THEN
    ALTER TABLE cc_transactions ADD COLUMN status text DEFAULT 'completed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cc_transactions' AND column_name = 'category') THEN
    ALTER TABLE cc_transactions ADD COLUMN category text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cc_transactions' AND column_name = 'notes') THEN
    ALTER TABLE cc_transactions ADD COLUMN notes text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cc_transactions' AND column_name = 'payment_provider') THEN
    ALTER TABLE cc_transactions ADD COLUMN payment_provider text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cc_transactions' AND column_name = 'device_info') THEN
    ALTER TABLE cc_transactions ADD COLUMN device_info text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cc_transactions' AND column_name = 'ip_address') THEN
    ALTER TABLE cc_transactions ADD COLUMN ip_address inet;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cc_transactions' AND column_name = 'country') THEN
    ALTER TABLE cc_transactions ADD COLUMN country text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cc_transactions' AND column_name = 'browser') THEN
    ALTER TABLE cc_transactions ADD COLUMN browser text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cc_transactions' AND column_name = 'related_order_id') THEN
    ALTER TABLE cc_transactions ADD COLUMN related_order_id uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cc_transactions' AND column_name = 'related_escrow_id') THEN
    ALTER TABLE cc_transactions ADD COLUMN related_escrow_id uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cc_transactions' AND column_name = 'related_subscription_id') THEN
    ALTER TABLE cc_transactions ADD COLUMN related_subscription_id uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cc_transactions' AND column_name = 'related_withdrawal_id') THEN
    ALTER TABLE cc_transactions ADD COLUMN related_withdrawal_id uuid;
  END IF;
END $$;

-- Add CHECK constraint on status (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cc_transactions_status_check') THEN
    ALTER TABLE cc_transactions ADD CONSTRAINT cc_transactions_status_check
    CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'cancelled'::text, 'refunded'::text, 'reversed'::text, 'disputed'::text]));
  END IF;
END $$;

-- Add indexes for transaction history queries
CREATE INDEX IF NOT EXISTS idx_cc_transactions_user_id ON cc_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_cc_transactions_status ON cc_transactions(status);
CREATE INDEX IF NOT EXISTS idx_cc_transactions_category ON cc_transactions(category);
CREATE INDEX IF NOT EXISTS idx_cc_transactions_created_at ON cc_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cc_transactions_reference ON cc_transactions(reference);
CREATE INDEX IF NOT EXISTS idx_cc_transactions_receipt_number ON cc_transactions(receipt_number);
CREATE INDEX IF NOT EXISTS idx_cc_transactions_type ON cc_transactions(type);

-- ============================================================
-- 2. PLATFORM ACCOUNTS
-- ============================================================

CREATE TABLE IF NOT EXISTS platform_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_type text NOT NULL UNIQUE,
  account_name text NOT NULL,
  balance numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'NGN',
  description text,
  is_locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_accounts_type_check CHECK (
    account_type = ANY (ARRAY[
      'operating'::text, 'escrow'::text, 'settlement'::text,
      'reserve'::text, 'refund'::text, 'marketing'::text, 'tax'::text
    ])
  )
);

-- Seed default accounts if they don't exist
INSERT INTO platform_accounts (account_type, account_name, description) VALUES
  ('operating', 'Operating Balance', 'Main platform operating funds'),
  ('escrow', 'Escrow Balance', 'Funds held in escrow for pending transactions'),
  ('settlement', 'Settlement Balance', 'Funds awaiting settlement to sellers/creators'),
  ('reserve', 'Reserve Balance', 'Platform reserve for contingencies'),
  ('refund', 'Refund Balance', 'Funds reserved for pending refunds'),
  ('marketing', 'Marketing Balance', 'Advertising and promotional budget'),
  ('tax', 'Tax Balance', 'Withheld tax liabilities')
ON CONFLICT (account_type) DO NOTHING;

ALTER TABLE platform_accounts ENABLE ROW LEVEL SECURITY;

-- Admin-only access to platform accounts
DROP POLICY IF EXISTS "platform_accounts_admin_read" ON platform_accounts;
CREATE POLICY "platform_accounts_admin_read" ON platform_accounts FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

DROP POLICY IF EXISTS "platform_accounts_admin_update" ON platform_accounts;
CREATE POLICY "platform_accounts_admin_update" ON platform_accounts FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

-- ============================================================
-- 3. PLATFORM LEDGER ENTRIES (Double-Entry)
-- ============================================================

CREATE TABLE IF NOT EXISTS platform_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id text NOT NULL UNIQUE,
  transaction_id uuid,
  debit_account text NOT NULL,
  credit_account text NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'NGN',
  exchange_rate numeric NOT NULL DEFAULT 1.0,
  debit_balance_before numeric,
  debit_balance_after numeric,
  credit_balance_before numeric,
  credit_balance_after numeric,
  reference_type text,
  reference_id uuid,
  description text NOT NULL,
  created_by uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_ledger_transaction ON platform_ledger_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_platform_ledger_debit ON platform_ledger_entries(debit_account);
CREATE INDEX IF NOT EXISTS idx_platform_ledger_credit ON platform_ledger_entries(credit_account);
CREATE INDEX IF NOT EXISTS idx_platform_ledger_created ON platform_ledger_entries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_ledger_ref_type ON platform_ledger_entries(reference_type);

ALTER TABLE platform_ledger_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_ledger_admin_read" ON platform_ledger_entries;
CREATE POLICY "platform_ledger_admin_read" ON platform_ledger_entries FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

-- ============================================================
-- 4. REFUND RECORDS
-- ============================================================

CREATE TABLE IF NOT EXISTS refund_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_number text NOT NULL UNIQUE,
  transaction_id uuid NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  order_id uuid,
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'NGN',
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  approver_id uuid,
  approved_at timestamptz,
  processed_at timestamptz,
  completed_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text,
  refund_method text,
  gateway_reference text,
  timeline jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT refund_records_status_check CHECK (
    status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'processing'::text, 'completed'::text, 'cancelled'::text])
  )
);

CREATE INDEX IF NOT EXISTS idx_refund_records_user ON refund_records(user_id);
CREATE INDEX IF NOT EXISTS idx_refund_records_status ON refund_records(status);
CREATE INDEX IF NOT EXISTS idx_refund_records_transaction ON refund_records(transaction_id);
CREATE INDEX IF NOT EXISTS idx_refund_records_created ON refund_records(created_at DESC);

ALTER TABLE refund_records ENABLE ROW LEVEL SECURITY;

-- Users can see their own refunds
DROP POLICY IF EXISTS "refund_records_owner_read" ON refund_records;
CREATE POLICY "refund_records_owner_read" ON refund_records FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- Admins can see all refunds
DROP POLICY IF EXISTS "refund_records_admin_read" ON refund_records;
CREATE POLICY "refund_records_admin_read" ON refund_records FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

-- Admins can update refund status
DROP POLICY IF EXISTS "refund_records_admin_update" ON refund_records;
CREATE POLICY "refund_records_admin_update" ON refund_records FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

-- Users can create refund requests for their own transactions
DROP POLICY IF EXISTS "refund_records_owner_insert" ON refund_records;
CREATE POLICY "refund_records_owner_insert" ON refund_records FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 5. FINANCIAL AUDIT LOGS
-- ============================================================

CREATE TABLE IF NOT EXISTS financial_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  actor_id uuid NOT NULL,
  actor_role text,
  actor_name text,
  before_state jsonb,
  after_state jsonb,
  description text,
  ip_address inet,
  user_agent text,
  device_info text,
  country text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financial_audit_actor ON financial_audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_financial_audit_entity ON financial_audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_financial_audit_action ON financial_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_financial_audit_created ON financial_audit_logs(created_at DESC);

ALTER TABLE financial_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "financial_audit_admin_read" ON financial_audit_logs;
CREATE POLICY "financial_audit_admin_read" ON financial_audit_logs FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

DROP POLICY IF EXISTS "financial_audit_admin_insert" ON financial_audit_logs;
CREATE POLICY "financial_audit_admin_insert" ON financial_audit_logs FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

-- ============================================================
-- 6. TRANSACTION RECEIPTS
-- ============================================================

CREATE TABLE IF NOT EXISTS transaction_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number text NOT NULL UNIQUE,
  transaction_id uuid NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  receipt_type text NOT NULL DEFAULT 'receipt',
  qr_code_data text,
  pdf_path text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transaction_receipts_user ON transaction_receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_transaction_receipts_transaction ON transaction_receipts(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_receipts_number ON transaction_receipts(receipt_number);

ALTER TABLE transaction_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "receipts_owner_read" ON transaction_receipts;
CREATE POLICY "receipts_owner_read" ON transaction_receipts FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "receipts_admin_read" ON transaction_receipts;
CREATE POLICY "receipts_admin_read" ON transaction_receipts FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

DROP POLICY IF EXISTS "receipts_owner_insert" ON transaction_receipts;
CREATE POLICY "receipts_owner_insert" ON transaction_receipts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 7. RPC: Generate receipt number
-- ============================================================

CREATE OR REPLACE FUNCTION generate_receipt_number()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  new_num text;
  seq_val bigint;
BEGIN
  SELECT nextval('receipt_number_seq') INTO seq_val;
  new_num := 'DRT-RCP-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(seq_val::text, 6, '0');
  RETURN new_num;
END;
$$;

-- Create sequence if not exists
CREATE SEQUENCE IF NOT EXISTS receipt_number_seq START 1;

-- ============================================================
-- 8. RPC: Generate refund number
-- ============================================================

CREATE OR REPLACE FUNCTION generate_refund_number()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  new_num text;
  seq_val bigint;
BEGIN
  SELECT nextval('refund_number_seq') INTO seq_val;
  new_num := 'DRT-RFD-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(seq_val::text, 6, '0');
  RETURN new_num;
END;
$$;

CREATE SEQUENCE IF NOT EXISTS refund_number_seq START 1;

-- ============================================================
-- 9. RPC: Generate platform ledger entry ID
-- ============================================================

CREATE OR REPLACE FUNCTION generate_ledger_entry_id()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  new_id text;
  seq_val bigint;
BEGIN
  SELECT nextval('ledger_entry_seq') INTO seq_val;
  new_id := 'DRT-LED-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(seq_val::text, 8, '0');
  RETURN new_id;
END;
$$;

CREATE SEQUENCE IF NOT EXISTS ledger_entry_seq START 1;

-- ============================================================
-- 10. RPC: Get platform financial summary
-- ============================================================

CREATE OR REPLACE FUNCTION get_platform_financial_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'accounts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'account_type', account_type,
        'account_name', account_name,
        'balance', balance,
        'currency', currency,
        'is_locked', is_locked
      ))
      FROM platform_accounts
    ), '[]'::jsonb),
    'total_wallet_funds', COALESCE((SELECT SUM(balance) FROM cc_wallets WHERE is_frozen = false), 0),
    'total_escrow', COALESCE((SELECT SUM(escrow_balance) FROM cc_wallets), 0),
    'total_pending_balance', COALESCE((SELECT SUM(pending_balance) FROM cc_wallets), 0),
    'total_locked', COALESCE((SELECT SUM(locked_balance) FROM cc_wallets), 0),
    'total_referral', COALESCE((SELECT SUM(referral_balance) FROM cc_wallets), 0),
    'total_affiliate', COALESCE((SELECT SUM(affiliate_balance) FROM cc_wallets), 0),
    'total_creator', COALESCE((SELECT SUM(creator_balance) FROM cc_wallets), 0),
    'total_advertiser', COALESCE((SELECT SUM(advertiser_budget) FROM cc_wallets), 0),
    'total_seller_earnings', COALESCE((SELECT SUM(seller_earnings) FROM cc_wallets), 0),
    'pending_withdrawals', COALESCE((
      SELECT COUNT(*) FROM withdrawal_requests WHERE status = 'pending'
    ), 0),
    'pending_withdrawals_amount', COALESCE((
      SELECT COALESCE(SUM(amount), 0) FROM withdrawal_requests WHERE status = 'pending'
    ), 0),
    'pending_refunds', COALESCE((
      SELECT COUNT(*) FROM refund_records WHERE status IN ('pending', 'approved', 'processing')
    ), 0),
    'pending_refunds_amount', COALESCE((
      SELECT COALESCE(SUM(amount), 0) FROM refund_records WHERE status IN ('pending', 'approved', 'processing')
    ), 0),
    'total_transactions', COALESCE((SELECT COUNT(*) FROM cc_transactions), 0),
    'completed_transactions', COALESCE((SELECT COUNT(*) FROM cc_transactions WHERE status = 'completed'), 0),
    'failed_transactions', COALESCE((SELECT COUNT(*) FROM cc_transactions WHERE status = 'failed'), 0),
    'pending_transactions', COALESCE((SELECT COUNT(*) FROM cc_transactions WHERE status IN ('pending', 'processing')), 0)
  ) INTO result;
  
  RETURN result;
END;
$$;

-- Grant execute to authenticated
GRANT EXECUTE ON FUNCTION get_platform_financial_summary() TO authenticated;

-- ============================================================
-- 11. RPC: Get user transaction history with filters
-- ============================================================

CREATE OR REPLACE FUNCTION get_user_transaction_history(
  p_user_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
  total_count bigint;
  target_uid uuid;
BEGIN
  -- Use provided user_id or default to caller
  target_uid := COALESCE(p_user_id, auth.uid());
  
  IF target_uid IS NULL THEN
    RETURN jsonb_build_object('transactions', '[]'::jsonb, 'total', 0);
  END IF;
  
  -- Admins can query any user; non-admins can only query themselves
  IF target_uid != auth.uid() THEN
    IF NOT EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin') THEN
      RETURN jsonb_build_object('error', 'unauthorized', 'transactions', '[]'::jsonb, 'total', 0);
    END IF;
  END IF;
  
  SELECT COUNT(*) INTO total_count FROM cc_transactions
  WHERE user_id = target_uid
    AND (p_status IS NULL OR status = p_status)
    AND (p_category IS NULL OR category = p_category)
    AND (p_date_from IS NULL OR created_at >= p_date_from)
    AND (p_date_to IS NULL OR created_at <= p_date_to)
    AND (p_search IS NULL OR 
         reference ILIKE '%' || p_search || '%' OR
         receipt_number ILIKE '%' || p_search || '%' OR
         description ILIKE '%' || p_search || '%' OR
         type ILIKE '%' || p_search || '%');
  
  SELECT COALESCE(jsonb_agg(t ORDER BY t.created_at DESC), '[]'::jsonb) INTO result
  FROM (
    SELECT * FROM cc_transactions
    WHERE user_id = target_uid
      AND (p_status IS NULL OR status = p_status)
      AND (p_category IS NULL OR category = p_category)
      AND (p_date_from IS NULL OR created_at >= p_date_from)
      AND (p_date_to IS NULL OR created_at <= p_date_to)
      AND (p_search IS NULL OR 
           reference ILIKE '%' || p_search || '%' OR
           receipt_number ILIKE '%' || p_search || '%' OR
           description ILIKE '%' || p_search || '%' OR
           type ILIKE '%' || p_search || '%')
    ORDER BY created_at DESC
    LIMIT p_limit OFFSET p_offset
  ) t;
  
  RETURN jsonb_build_object('transactions', result, 'total', total_count);
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_transaction_history TO authenticated;

-- ============================================================
-- 12. RPC: Search platform transactions (admin explorer)
-- ============================================================

CREATE OR REPLACE FUNCTION search_platform_transactions(
  p_search text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
  total_count bigint;
  is_admin boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin') INTO is_admin;
  
  IF NOT is_admin THEN
    RETURN jsonb_build_object('error', 'unauthorized', 'transactions', '[]'::jsonb, 'total', 0);
  END IF;
  
  SELECT COUNT(*) INTO total_count FROM cc_transactions
  WHERE (p_status IS NULL OR status = p_status)
    AND (p_category IS NULL OR category = p_category)
    AND (p_user_id IS NULL OR user_id = p_user_id)
    AND (p_date_from IS NULL OR created_at >= p_date_from)
    AND (p_date_to IS NULL OR created_at <= p_date_to)
    AND (p_search IS NULL OR 
         reference ILIKE '%' || p_search || '%' OR
         receipt_number ILIKE '%' || p_search || '%' OR
         description ILIKE '%' || p_search || '%' OR
         CAST(id AS text) ILIKE '%' || p_search || '%');
  
  SELECT COALESCE(jsonb_agg(t ORDER BY t.created_at DESC), '[]'::jsonb) INTO result
  FROM (
    SELECT t.*, u.email, u.username
    FROM cc_transactions t
    LEFT JOIN users u ON u.id = t.user_id
    WHERE (p_status IS NULL OR t.status = p_status)
      AND (p_category IS NULL OR t.category = p_category)
      AND (p_user_id IS NULL OR t.user_id = p_user_id)
      AND (p_date_from IS NULL OR t.created_at >= p_date_from)
      AND (p_date_to IS NULL OR t.created_at <= p_date_to)
      AND (p_search IS NULL OR 
           t.reference ILIKE '%' || p_search || '%' OR
           t.receipt_number ILIKE '%' || p_search || '%' OR
           t.description ILIKE '%' || p_search || '%' OR
           CAST(t.id AS text) ILIKE '%' || p_search || '%')
    ORDER BY t.created_at DESC
    LIMIT p_limit OFFSET p_offset
  ) t;
  
  RETURN jsonb_build_object('transactions', result, 'total', total_count);
END;
$$;

GRANT EXECUTE ON FUNCTION search_platform_transactions TO authenticated;
