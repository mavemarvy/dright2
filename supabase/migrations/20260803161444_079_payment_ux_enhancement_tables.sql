/*\n# Payment UX Enhancement Tables\n\n## New Tables\n- `payment_invoices` — generated invoices for orders, downloadable by buyer/seller/admin\n- `abandoned_payments` — tracks unfinished payments for recovery on next login\n- `payment_webhook_logs` — detailed webhook event logging with headers, payload, signature\n- `payment_preferences` — per-user gateway selection memory, recent amounts, last bank\n*/\n\n-- ============================================================\n-- payment_invoices\n-- ============================================================\nCREATE TABLE IF NOT EXISTS payment_invoices (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  invoice_number text UNIQUE NOT NULL,\n  order_id uuid,\n  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,\n  seller_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,\n  invoice_type text NOT NULL DEFAULT 'sale' CHECK (invoice_type IN ('sale','refund','subscription','wallet_funding','payout')),\n  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','overdue','cancelled','draft')),\n  currency text NOT NULL DEFAULT 'NGN',\n  subtotal numeric(12,2) NOT NULL DEFAULT 0,\n  discount numeric(12,2) NOT NULL DEFAULT 0,\n  coupon_code text,\n  referral_discount numeric(12,2) NOT NULL DEFAULT 0,\n  platform_fee numeric(12,2) NOT NULL DEFAULT 0,\n  escrow_fee numeric(12,2) NOT NULL DEFAULT 0,\n  total numeric(12,2) NOT NULL DEFAULT 0,\n  items jsonb NOT NULL DEFAULT '[]'::jsonb,\n  buyer_name text,\n  buyer_email text,\n  seller_name text,\n  seller_email text,\n  payment_reference text,\n  payment_method text,\n  paid_at timestamptz,\n  due_at timestamptz,\n  notes text,\n  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,\n  created_at timestamptz DEFAULT now(),\n  updated_at timestamptz DEFAULT now()\n)
\n\nALTER TABLE payment_invoices ENABLE ROW LEVEL SECURITY
\n\nDROP POLICY IF EXISTS "select_own_invoices" ON payment_invoices
\nCREATE POLICY "select_own_invoices"\n  ON payment_invoices FOR SELECT\n  TO authenticated USING (auth.uid() = user_id OR auth.uid() = seller_id)
\n\nDROP POLICY IF EXISTS "insert_own_invoices" ON payment_invoices
\nCREATE POLICY "insert_own_invoices"\n  ON payment_invoices FOR INSERT\n  TO authenticated WITH CHECK (auth.uid() = user_id)
\n\nDROP POLICY IF EXISTS "update_own_invoices" ON payment_invoices
\nCREATE POLICY "update_own_invoices"\n  ON payment_invoices FOR UPDATE\n  TO authenticated USING (auth.uid() = user_id OR auth.uid() = seller_id) WITH CHECK (auth.uid() = user_id OR auth.uid() = seller_id)
\n\nDROP POLICY IF EXISTS "admin_all_invoices" ON payment_invoices
\nCREATE POLICY "admin_all_invoices"\n  ON payment_invoices FOR ALL\n  TO authenticated USING (\n    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND (users.is_admin = true OR users.admin_status = 'approved'))\n  )
\n\nCREATE INDEX IF NOT EXISTS idx_invoices_user ON payment_invoices(user_id)
\nCREATE INDEX IF NOT EXISTS idx_invoices_order ON payment_invoices(order_id)
\nCREATE INDEX IF NOT EXISTS idx_invoices_number ON payment_invoices(invoice_number)
\nCREATE INDEX IF NOT EXISTS idx_invoices_status ON payment_invoices(status)
\n\n-- ============================================================\n-- abandoned_payments\n-- ============================================================\nCREATE TABLE IF NOT EXISTS abandoned_payments (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,\n  reference text NOT NULL,\n  amount numeric(12,2) NOT NULL,\n  currency text NOT NULL DEFAULT 'NGN',\n  purpose text NOT NULL DEFAULT 'product_purchase',\n  order_id uuid,\n  product_name text,\n  provider text,\n  status text NOT NULL DEFAULT 'abandoned' CHECK (status IN ('abandoned','recovered','expired','completed')),\n  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,\n  recovery_shown boolean NOT NULL DEFAULT false,\n  created_at timestamptz DEFAULT now(),\n  updated_at timestamptz DEFAULT now()\n)
\n\nALTER TABLE abandoned_payments ENABLE ROW LEVEL SECURITY
\n\nDROP POLICY IF EXISTS "select_own_abandoned" ON abandoned_payments
\nCREATE POLICY "select_own_abandoned"\n  ON abandoned_payments FOR SELECT\n  TO authenticated USING (auth.uid() = user_id)
\n\nDROP POLICY IF EXISTS "insert_own_abandoned" ON abandoned_payments
\nCREATE POLICY "insert_own_abandoned"\n  ON abandoned_payments FOR INSERT\n  TO authenticated WITH CHECK (auth.uid() = user_id)
\n\nDROP POLICY IF EXISTS "update_own_abandoned" ON abandoned_payments
\nCREATE POLICY "update_own_abandoned"\n  ON payment_invoices FOR UPDATE\n  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)
\n\nDROP POLICY IF EXISTS "update_own_abandoned" ON abandoned_payments
\nCREATE POLICY "update_own_abandoned"\n  ON abandoned_payments FOR UPDATE\n  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)
\n\nDROP POLICY IF EXISTS "delete_own_abandoned" ON abandoned_payments
\nCREATE POLICY "delete_own_abandoned"\n  ON abandoned_payments FOR DELETE\n  TO authenticated USING (auth.uid() = user_id)
\n\nCREATE INDEX IF NOT EXISTS idx_abandoned_user ON abandoned_payments(user_id, status)
\nCREATE INDEX IF NOT EXISTS idx_abandoned_status ON abandoned_payments(status)
\n\n-- ============================================================\n-- payment_webhook_logs\n-- ============================================================\nCREATE TABLE IF NOT EXISTS payment_webhook_logs (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  provider text NOT NULL DEFAULT 'paystack',\n  event_type text,\n  reference text,\n  status text,\n  headers jsonb,\n  payload jsonb,\n  ip_address text,\n  signature text,\n  signature_verified boolean NOT NULL DEFAULT false,\n  processed boolean NOT NULL DEFAULT false,\n  duration_ms int,\n  retry_count int NOT NULL DEFAULT 0,\n  error_message text,\n  created_at timestamptz DEFAULT now()\n)
\n\nALTER TABLE payment_webhook_logs ENABLE ROW LEVEL SECURITY
\n\nDROP POLICY IF EXISTS "admin_all_webhook_logs" ON payment_webhook_logs
\nCREATE POLICY "admin_all_webhook_logs"\n  ON payment_webhook_logs FOR SELECT\n  TO authenticated USING (\n    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND (users.is_admin = true OR users.admin_status = 'approved'))\n  )
\n\nDROP POLICY IF EXISTS "admin_insert_webhook_logs" ON payment_webhook_logs
\nCREATE POLICY "admin_insert_webhook_logs"\n  ON payment_webhook_logs FOR INSERT\n  TO authenticated WITH CHECK (\n    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND (users.is_admin = true OR users.admin_status = 'approved'))\n  )
\n\nCREATE INDEX IF NOT EXISTS idx_webhook_reference ON payment_webhook_logs(reference)
\nCREATE INDEX IF NOT EXISTS idx_webhook_provider ON payment_webhook_logs(provider, created_at DESC)
\nCREATE INDEX IF NOT EXISTS idx_webhook_status ON payment_webhook_logs(status, created_at DESC)
\n\n-- ============================================================\n-- payment_preferences — per-user gateway/amount memory\n-- ============================================================\nCREATE TABLE IF NOT EXISTS payment_preferences (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  user_id uuid UNIQUE NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,\n  last_gateway text,\n  last_funding_amount numeric(12,2),\n  last_bank_account_id uuid,\n  recent_amounts jsonb NOT NULL DEFAULT '[]'::jsonb,\n  amount_frequency jsonb NOT NULL DEFAULT '{}'::jsonb,\n  preferred_currency text DEFAULT 'NGN',\n  detected_country text DEFAULT 'NG',\n  created_at timestamptz DEFAULT now(),\n  updated_at timestamptz DEFAULT now()\n)
\n\nALTER TABLE payment_preferences ENABLE ROW LEVEL SECURITY
\n\nDROP POLICY IF EXISTS "select_own_preferences" ON payment_preferences
\nCREATE POLICY "select_own_preferences"\n  ON payment_preferences FOR SELECT\n  TO authenticated USING (auth.uid() = user_id)
\n\nDROP POLICY IF EXISTS "insert_own_preferences" ON payment_preferences
\nCREATE POLICY "insert_own_preferences"\n  ON payment_preferences FOR INSERT\n  TO authenticated WITH CHECK (auth.uid() = user_id)
\n\nDROP POLICY IF EXISTS "update_own_preferences" ON payment_preferences
\nCREATE POLICY "update_own_preferences"\n  ON payment_preferences FOR UPDATE\n  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)
\n\n-- ============================================================\n-- generate_invoice_number RPC\n-- ============================================================\nCREATE OR REPLACE FUNCTION generate_invoice_number()\nRETURNS text\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = public\nAS $$\nDECLARE\n  v_seq int
\n  v_number text
\nBEGIN\n  SELECT COALESCE(MAX(seq), 0) + 1 INTO v_seq\n  FROM (\n    SELECT (substring(invoice_number from 'INV-(\\d+)$'))::int AS seq\n    FROM payment_invoices\n    WHERE invoice_number ~ '^INV-\\d+$'\n  ) s
\n\n  v_number := 'INV-' || lpad(v_seq::text, 6, '0')
\n  RETURN v_number
\nEND
\n$$
\n\nGRANT EXECUTE ON FUNCTION generate_invoice_number TO authenticated
\n\n-- ============================================================\n-- get_payment_analytics RPC — for admin dashboard\n-- ============================================================\nCREATE OR REPLACE FUNCTION get_payment_analytics()\nRETURNS jsonb\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = public\nAS $$\nDECLARE\n  v_today date := CURRENT_DATE
\n  v_todays_revenue numeric
\n  v_todays_count int
\n  v_todays_failed int
\n  v_todays_abandoned int
\n  v_todays_escrow numeric
\n  v_total_revenue numeric
\n  v_success_count int
\n  v_total_count int
\n  v_success_rate numeric
\n  v_avg_amount numeric
\nBEGIN\n  SELECT COALESCE(SUM(amount), 0) INTO v_todays_revenue\n  FROM paystack_transactions WHERE status = 'success' AND DATE(created_at) = v_today
\n\n  SELECT COUNT(*) INTO v_todays_count\n  FROM paystack_transactions WHERE DATE(created_at) = v_today
\n\n  SELECT COUNT(*) INTO v_todays_failed\n  FROM paystack_transactions WHERE status = 'failed' AND DATE(created_at) = v_today
\n\n  SELECT COUNT(*) INTO v_todays_abandoned\n  FROM paystack_transactions WHERE status IN ('abandoned','initialized') AND DATE(created_at) = v_today
\n\n  SELECT COALESCE(SUM(amount), 0) INTO v_todays_escrow\n  FROM escrow_payments WHERE DATE(held_at) = v_today AND status = 'held'
\n\n  SELECT COALESCE(SUM(amount), 0) INTO v_total_revenue\n  FROM paystack_transactions WHERE status = 'success'
\n\n  SELECT COUNT(*) INTO v_success_count\n  FROM paystack_transactions WHERE status = 'success'
\n\n  SELECT COUNT(*) INTO v_total_count\n  FROM paystack_transactions
\n\n  IF v_total_count > 0 THEN\n    v_success_rate := ROUND(v_success_count::numeric / v_total_count * 100, 2)
\n  ELSE\n    v_success_rate := 0
\n  END IF
\n\n  IF v_success_count > 0 THEN\n    SELECT ROUND(AVG(amount), 2) INTO v_avg_amount\n    FROM paystack_transactions WHERE status = 'success'
\n  ELSE\n    v_avg_amount := 0
\n  END IF
\n\n  RETURN jsonb_build_object(\n    'todays_revenue', v_todays_revenue,\n    'todays_count', v_todays_count,\n    'todays_failed', v_todays_failed,\n    'todays_abandoned', v_todays_abandoned,\n    'todays_escrow', v_todays_escrow,\n    'total_revenue', v_total_revenue,\n    'success_rate', v_success_rate,\n    'avg_amount', v_avg_amount\n  )
\nEND
\n$$
\n\nGRANT EXECUTE ON FUNCTION get_payment_analytics TO authenticated
\n