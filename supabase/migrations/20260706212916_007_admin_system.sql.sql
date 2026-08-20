/*
# Admin system - roles, balances, approvals, withdrawals, notifications

1. Purpose
- Implements admin role system (first admin auto-approved, others need approval)
- Product approval workflow (products pending until admin approves)
- Sales payout recording (commissions added to user balance after verification)
- Withdrawal requests (users request payout, admin approves/rejects)
- Notification system for admin and user alerts

2. Schema Changes
*/

-- ============================================
-- 1. Add admin fields and balance to users table
-- ============================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_status text DEFAULT 'active'; -- 'pending', 'active', 'suspended'
ALTER TABLE users ADD COLUMN IF NOT EXISTS balance numeric(12, 2) DEFAULT 0.00;

-- First user to register as admin becomes the super admin (approved)
-- We'll handle this client-side: if no admins exist, first admin signup is auto-approved

-- ============================================
-- 2. Add approval status to products table
-- ============================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'pending'; -- 'pending', 'approved', 'rejected'
ALTER TABLE products ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Update policy: pending products only visible to uploader and admins
DROP POLICY IF EXISTS "All promoters can view active products" ON products;
CREATE POLICY "Promoters can view approved products"
ON products FOR SELECT
TO authenticated
USING (approval_status = 'approved' OR auth.uid() = uploaded_by);

-- Update policy: only admins can approve products
-- We'll handle approval via a secure edge function or service role

-- ============================================
-- 3. Create payout_records table
-- ============================================

CREATE TABLE IF NOT EXISTS payout_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sales_record_id uuid REFERENCES sales_records(id) ON DELETE SET NULL,
  verification_id uuid REFERENCES verifications(id) ON DELETE SET NULL,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  amount numeric(10, 2) NOT NULL,
  payout_type text NOT NULL, -- 'commission', 'affiliate_sale', 'product_sale'
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'paid'
  admin_approval_percentage numeric(5, 2) DEFAULT 100.00,
  notes text,
  processed_by uuid REFERENCES auth.users(id),
  processed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payout_records_user_id ON payout_records(user_id);
CREATE INDEX IF NOT EXISTS idx_payout_records_status ON payout_records(status);
CREATE INDEX IF NOT EXISTS idx_payout_records_created_at ON payout_records(created_at DESC);

ALTER TABLE payout_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own payout records" ON payout_records;
CREATE POLICY "Users can read own payout records"
ON payout_records FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- ============================================
-- 4. Create withdrawal_requests table
-- ============================================

CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(10, 2) NOT NULL,
  payment_method text, -- 'bank_transfer', 'paypal', 'mobile_money', etc.
  account_details text NOT NULL, -- Encrypted or masked payment info
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'paid', 'cancelled'
  admin_notes text,
  processed_by uuid REFERENCES auth.users(id),
  processed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_user_id ON withdrawal_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status ON withdrawal_requests(status);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_created_at ON withdrawal_requests(created_at DESC);

ALTER TABLE withdrawal_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own withdrawal requests" ON withdrawal_requests;
CREATE POLICY "Users can read own withdrawal requests"
ON withdrawal_requests FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create withdrawal requests" ON withdrawal_requests;
CREATE POLICY "Users can create withdrawal requests"
ON withdrawal_requests FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- ============================================
-- 5. Create notifications table
-- ============================================

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  notification_type text NOT NULL, -- 'withdrawal', 'payout', 'product_approval', 'admin_request', etc.
  related_id uuid, -- ID of related entity (withdrawal request, product, etc.)
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own notifications" ON notifications;
CREATE POLICY "Users can read own notifications"
ON notifications FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications"
ON notifications FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ============================================
-- 6. Create admin_logs table for audit trail
-- ============================================

CREATE TABLE IF NOT EXISTS admin_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  target_id uuid,
  target_type text,
  details jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_logs_admin_id ON admin_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_action_type ON admin_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON admin_logs(created_at DESC);

-- Admin logs only readable by admins (we'll enforce in app)
ALTER TABLE admin_logs ENABLE ROW LEVEL SECURITY;