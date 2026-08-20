/*
# Admin access policies and functions

Admin-only SELECT/UPDATE access to:
- All users (for approving admin requests, viewing balances)
- All products including pending (for approval workflow)
- All payout_records (for processing)
- All withdrawal_requests (for processing)
- All notifications (admin receives notifications for new requests)
- All verifications (for sales verification)
- All admin_logs
*/

-- Create a helper function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin(user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users WHERE id = user_id AND is_admin = true AND admin_status = 'active'
  );
$$;

-- ============================================
-- Admin policies for payout_records
-- ============================================

DROP POLICY IF EXISTS "Admins can manage all payouts" ON payout_records;
CREATE POLICY "Admins can manage all payouts"
ON payout_records FOR ALL
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

-- ============================================
-- Admin policies for withdrawal_requests
-- ============================================

DROP POLICY IF EXISTS "Admins can manage all withdrawals" ON withdrawal_requests;
CREATE POLICY "Admins can manage all withdrawals"
ON withdrawal_requests FOR ALL
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

-- ============================================
-- Admin policies for products (approve products)
-- ============================================

DROP POLICY IF EXISTS "Admins can view all products" ON products;
CREATE POLICY "Admins can view all products"
ON products FOR SELECT
TO authenticated
USING (true); -- Everyone can read products now, filtered client-side

DROP POLICY IF EXISTS "Admins can approve products" ON products;
CREATE POLICY "Admins can approve products"
ON products FOR UPDATE
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

-- ============================================
-- Admin policies for users (manage admins, view balances)
-- ============================================

DROP POLICY IF EXISTS "Admins can read all users" ON users;
CREATE POLICY "Admins can read all users"
ON users FOR SELECT
TO authenticated
USING (is_admin(auth.uid()) OR auth.uid() = id);

DROP POLICY IF EXISTS "Admins can update all users" ON users;
CREATE POLICY "Admins can update all users"
ON users FOR UPDATE
TO authenticated
USING (is_admin(auth.uid()) OR auth.uid() = id)
WITH CHECK (is_admin(auth.uid()) OR auth.uid() = id);

-- ============================================
-- Admin policies for verifications
-- ============================================

DROP POLICY IF EXISTS "Promoters can read own verifications" ON verifications;
CREATE POLICY "Promoters can read own verifications"
ON verifications FOR SELECT
TO authenticated
USING (auth.uid() = promoter_id OR is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can verify submissions" ON verifications;
CREATE POLICY "Admins can verify submissions"
ON verifications FOR UPDATE
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

-- ============================================
-- Admin policies for notifications
-- ============================================

-- Admin receives notifications for new withdrawal requests, product approvals, etc.
-- We'll create admin notifications with user_id = admin's id

-- ============================================
-- Admin policies for admin_logs
-- ============================================

DROP POLICY IF EXISTS "Admins can read admin logs" ON admin_logs;
CREATE POLICY "Admins can read admin logs"
ON admin_logs FOR SELECT
TO authenticated
USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can write admin logs" ON admin_logs;
CREATE POLICY "Admins can write admin logs"
ON admin_logs FOR INSERT
TO authenticated
WITH CHECK (is_admin(auth.uid()));

-- ============================================
-- Sales records policies update - admins can read all
-- ============================================

DROP POLICY IF EXISTS "Promoters can read own sales records" ON sales_records;
CREATE POLICY "Promoters can read own sales records"
ON sales_records FOR SELECT
TO authenticated
USING (auth.uid() = promoter_id OR is_admin(auth.uid()));

-- ============================================
-- Referral links - admins can read all
-- ============================================

DROP POLICY IF EXISTS "Promoters can read own referral link" ON referral_links;
CREATE POLICY "Promoters can read own referral link"
ON referral_links FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR is_admin(auth.uid()));