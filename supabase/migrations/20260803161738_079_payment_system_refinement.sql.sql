/*
# Payment System Refinement - Phase 6.5

## New Tables
- abandoned_payments — saves pending payments when user closes browser
- invoices — generated before/after payment, downloadable by buyer/seller/admin
- webhook_logs — stores headers, payload, provider, IP, signature, verified, duration, retry count
- payment_analytics — aggregated daily metrics
- user_payment_preferences — gateway selection memory
*/

-- ============================================================
-- abandoned_payments
-- ============================================================
CREATE TABLE IF NOT EXISTS abandoned_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reference text NOT NULL,
  purpose text NOT NULL DEFAULT 'product_purchase',
  amount numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'NGN',
  product_id text,
  product_name text,
  order_id text,
  provider text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  recovered_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE abandoned_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_abandoned_payments" ON abandoned_payments;
CREATE POLICY "select_own_abandoned_payments"
  ON abandoned_payments FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_abandoned_payments" ON abandoned_payments;
CREATE POLICY "insert_own_abandoned_payments"
  ON abandoned_payments FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_abandoned_payments" ON abandoned_payments;
CREATE POLICY "update_own_abandoned_payments"
  ON abandoned_payments FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_abandoned_payments" ON abandoned_payments;
CREATE POLICY "delete_own_abandoned_payments"
  ON abandoned_payments FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_abandoned_payments_user ON abandoned_payments(user_id, status);

-- ============================================================
-- invoices
-- ============================================================
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text UNIQUE NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid,
  subscription_id uuid,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'NGN',
  tax_amount numeric(12,2) DEFAULT 0,
  discount_amount numeric(12,2) DEFAULT 0,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  invoice_type text NOT NULL DEFAULT 'product',
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  billing_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  payment_reference text,
  payment_provider text,
  paid_at timestamptz,
  due_date timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_invoices" ON invoices;
CREATE POLICY "select_own_invoices"
  ON invoices FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_invoices" ON invoices;
CREATE POLICY "insert_own_invoices"
  ON invoices FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_invoices" ON invoices;
CREATE POLICY "update_own_invoices"
  ON invoices FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "admin_all_invoices" ON invoices;
CREATE POLICY "admin_all_invoices"
  ON invoices FOR ALL
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND (users.is_admin = true OR users.admin_status = 'approved'))
  );

CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);

-- ============================================================
-- webhook_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'paystack',
  event_type text,
  reference text,
  headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  signature text,
  verified boolean NOT NULL DEFAULT false,
  processed boolean NOT NULL DEFAULT false,
  duration_ms int,
  retry_count int NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_webhook_logs" ON webhook_logs;
CREATE POLICY "admin_all_webhook_logs"
  ON webhook_logs FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND (users.is_admin = true OR users.admin_status = 'approved'))
  );

CREATE INDEX IF NOT EXISTS idx_webhook_logs_provider ON webhook_logs(provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_reference ON webhook_logs(reference);

-- ============================================================
-- payment_analytics (daily aggregated)
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_date date NOT NULL,
  total_revenue numeric(12,2) NOT NULL DEFAULT 0,
  total_escrow numeric(12,2) NOT NULL DEFAULT 0,
  total_failed numeric(12,2) NOT NULL DEFAULT 0,
  total_refunds numeric(12,2) NOT NULL DEFAULT 0,
  total_abandoned numeric(12,2) NOT NULL DEFAULT 0,
  total_withdrawals numeric(12,2) NOT NULL DEFAULT 0,
  total_wallet_funding numeric(12,2) NOT NULL DEFAULT 0,
  total_subscription_revenue numeric(12,2) NOT NULL DEFAULT 0,
  payment_count int NOT NULL DEFAULT 0,
  failed_count int NOT NULL DEFAULT 0,
  abandoned_count int NOT NULL DEFAULT 0,
  avg_processing_time_ms int,
  gateway_stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  top_methods jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  UNIQUE(metric_date)
);

ALTER TABLE payment_analytics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_payment_analytics" ON payment_analytics;
CREATE POLICY "admin_all_payment_analytics"
  ON payment_analytics FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND (users.is_admin = true OR users.admin_status = 'approved'))
  );

-- ============================================================
-- user_payment_preferences (gateway selection memory)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_payment_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  last_gateway text,
  last_amount numeric(12,2),
  last_bank_account_id uuid,
  last_funding_amount numeric(12,2),
  preferred_currency text NOT NULL DEFAULT 'NGN',
  recent_amounts jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_payment_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_payment_prefs" ON user_payment_preferences;
CREATE POLICY "select_own_payment_prefs"
  ON user_payment_preferences FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "upsert_own_payment_prefs" ON user_payment_preferences;
CREATE POLICY "upsert_own_payment_prefs"
  ON user_payment_preferences FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_payment_prefs" ON user_payment_preferences;
CREATE POLICY "update_own_payment_prefs"
  ON user_payment_preferences FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- Add columns to payment_providers
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payment_providers' AND column_name = 'sub_methods') THEN
    ALTER TABLE payment_providers ADD COLUMN sub_methods text[] NOT NULL DEFAULT '{}';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payment_providers' AND column_name = 'rating') THEN
    ALTER TABLE payment_providers ADD COLUMN rating numeric(2,1) NOT NULL DEFAULT 5.0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payment_providers' AND column_name = 'processing_time') THEN
    ALTER TABLE payment_providers ADD COLUMN processing_time text NOT NULL DEFAULT 'Instant';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payment_providers' AND column_name = 'country_priority') THEN
    ALTER TABLE payment_providers ADD COLUMN country_priority jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

UPDATE payment_providers SET
  sub_methods = '{Cards, Bank Transfer, USSD, Mobile Money}',
  rating = 4.9,
  processing_time = 'Instant',
  country_priority = '{"NG": 1, "GH": 1, "KE": 1, "ZA": 1}'
WHERE slug = 'paystack';

UPDATE payment_providers SET
  sub_methods = '{Cards, Wallet}',
  rating = 4.7,
  processing_time = 'Instant',
  country_priority = '{"US": 1, "GB": 2, "IN": 2}'
WHERE slug = 'google_pay';

UPDATE payment_providers SET
  sub_methods = '{Cards, Wallet}',
  rating = 4.8,
  processing_time = 'Instant',
  country_priority = '{"US": 1, "GB": 2}'
WHERE slug = 'apple_pay';

UPDATE payment_providers SET
  sub_methods = '{Cards, Mobile Money, Bank Transfer}',
  rating = 4.6,
  processing_time = 'Instant',
  country_priority = '{"KE": 1, "NG": 2, "GH": 2, "UG": 1, "TZ": 1}'
WHERE slug = 'flutterwave';

UPDATE payment_providers SET
  sub_methods = '{Cards, Bank Transfer, Wallet}',
  rating = 4.8,
  processing_time = 'Instant',
  country_priority = '{"US": 1, "GB": 2, "DE": 2, "FR": 2, "CA": 2, "AU": 2}'
WHERE slug = 'stripe';

UPDATE payment_providers SET
  sub_methods = '{Bank Transfer, Wallet}',
  rating = 4.5,
  processing_time = '1-2 days',
  country_priority = '{"GB": 1, "US": 2, "DE": 2, "FR": 2}'
WHERE slug = 'wise';

-- ============================================================
-- RPCs
-- ============================================================
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq int;
  v_number text;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 9) AS int)), 0) + 1
  INTO v_seq
  FROM invoices
  WHERE invoice_number LIKE 'INV-2026%';

  v_number := 'INV-2026' || lpad(v_seq::text, 6, '0');
  RETURN v_number;
END;
$$;

GRANT EXECUTE ON FUNCTION generate_invoice_number TO authenticated;

CREATE OR REPLACE FUNCTION create_invoice(
  p_user_id uuid,
  p_amount numeric,
  p_currency text DEFAULT 'NGN',
  p_invoice_type text DEFAULT 'product',
  p_order_id uuid DEFAULT NULL,
  p_subscription_id uuid DEFAULT NULL,
  p_line_items jsonb DEFAULT '[]'::jsonb,
  p_billing_details jsonb DEFAULT '{}'::jsonb,
  p_discount_amount numeric DEFAULT 0,
  p_tax_amount numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_number text;
  v_invoice_id uuid;
  v_total numeric;
BEGIN
  v_invoice_number := generate_invoice_number();
  v_total := p_amount - p_discount_amount + p_tax_amount;

  INSERT INTO invoices (
    invoice_number, user_id, order_id, subscription_id,
    amount, currency, discount_amount, tax_amount, total_amount,
    status, invoice_type, line_items, billing_details
  )
  VALUES (
    v_invoice_number, p_user_id, p_order_id, p_subscription_id,
    p_amount, p_currency, p_discount_amount, p_tax_amount, v_total,
    'pending', p_invoice_type, p_line_items, p_billing_details
  )
  RETURNING id INTO v_invoice_id;

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number,
    'total', v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_invoice TO authenticated;

CREATE OR REPLACE FUNCTION mark_invoice_paid(
  p_invoice_id uuid,
  p_payment_reference text,
  p_payment_provider text DEFAULT 'paystack'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE invoices
  SET status = 'paid',
      payment_reference = p_payment_reference,
      payment_provider = p_payment_provider,
      paid_at = now(),
      updated_at = now()
  WHERE id = p_invoice_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION mark_invoice_paid TO authenticated;
