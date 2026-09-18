/*\n# Enterprise Admin RBAC + Reputation & Review System\n\nThis migration implements:\n1. Admin role-based access control (RBAC) with 5 distinct admin roles\n2. Global announcements and site settings (Super Admin)\n3. Automated reputation & review system with trigger logic\n4. Ban appeals system\n5. Support tickets, fraud reports, and internal settlements tracking\n\n## 1. User Model Updates (ALTER TABLE users)\nNew columns:\n- `admin_role` (text, nullable) — one of: 'super_admin', 'support_admin', 'trust_safety_admin', 'qa_admin', 'finance_admin'. Null for non-admin users.\n- `account_status` (text, default 'ACTIVE') — one of: 'ACTIVE', 'LOCKED', 'BANNED'.\n- `total_reviews` (int, default 0) — total number of reviews received.\n- `average_rating` (numeric(3,2), default 0) — average star rating (0-5).\n- `one_star_count` (int, default 0) — count of 1-star reviews received.\n- `account_locks_count` (int, default 0) — number of times account has been auto-locked.\n\n## 2. Product Model Updates (ALTER TABLE products)\n- `total_reviews` (int, default 0)\n- `average_rating` (numeric(3,2), default 0)\n- `one_star_count` (int, default 0)\n- `is_hidden` (boolean, default false) — when true, product is hidden from marketplace buyers.\n\n## 3. New Table: reviews\nUsers can rate products, sellers, and sales teams (1-5 stars + text).\n- `id`, `reviewer_id` (FK users), `target_type` ('product'|'seller'|'sales_team'),\n  `target_id` (uuid — product or user ID), `rating` (1-5), `review_text`, `created_at`.\n\n## 4. New Table: global_announcements\nSuper Admin publishes news/promos/updates shown on user dashboard.\n- `id`, `title`, `message`, `type` ('news'|'promo'|'update'), `is_active`, `created_by`, `created_at`.\n\n## 5. New Table: site_settings\nSingleton row for global site configuration.\n- `id`, `singleton` (unique), `site_name`, `favicon_url`, `logo_url`, `maintenance_mode`.\n\n## 6. New Table: ban_appeals\nBanned users can submit appeals
 QA Admin reviews.\n- `id`, `user_id` (FK users), `appeal_text`, `status` ('pending'|'approved'|'denied'),\n  `reviewed_by` (FK users), `reviewed_at`, `created_at`.\n\n## 7. New Table: support_tickets\nSupport Admin manages user feedback/tickets.\n- `id`, `user_id` (FK users), `subject`, `message`, `status` ('open'|'resolved'|'closed'),\n  `priority` ('low'|'medium'|'high'), `admin_reply`, `replied_by`, `replied_at`, `created_at`.\n\n## 8. New Table: fraud_reports\nTrust & Safety Admin reviews fraud reports.\n- `id`, `reporter_id` (FK users), `reported_id` (FK users, nullable), `report_type`,\n  `description`, `status` ('pending'|'investigating'|'resolved'|'dismissed'),\n  `reviewed_by`, `reviewed_at`, `created_at`.\n\n## 9. New Table: internal_settlements\nFinance Admin approves task/sales payment routing.\n- `id`, `seller_id` (FK users), `product_id` (FK products, nullable), `sale_id` (FK sales_records, nullable),\n  `amount`, `settlement_type` ('task_payment'|'sales_commission'|'sales_team_payment'),\n  `status` ('pending'|'approved'|'rejected'), `approved_by`, `approved_at`, `created_at`.\n\n## 10. Security\n- RLS enabled on all new tables.\n- Reviews: authenticated users can read all, insert own
 users can update/delete own reviews.\n- Announcements: all authenticated can read active
 only super_admin can write.\n- Site settings: all authenticated can read
 only super_admin can write.\n- Ban appeals: users can read own, insert own
 QA admin can read all and update.\n- Support tickets: users can read own, insert own
 support_admin can read all and update.\n- Fraud reports: reporter can read own
 trust_safety_admin can read all and update.\n- Internal settlements: finance_admin can read all and update
 sellers can read own.\n\n## 11. Important Notes\n1. Existing admins get 'super_admin' role by default during backfill.\n2. account_status defaults to 'ACTIVE' for all existing users.\n3. The review trigger logic is implemented in an edge function (create-review).\n4. When account is LOCKED/BANNED, the app layer prevents new affiliate links, contracts, and withdrawals.\n5. is_hidden on products allows admin to hide products without deleting them.\n*/\n\n-- =========================================================\n-- 1. ALTER users: add admin_role, account_status, reputation fields\n-- =========================================================\nDO $$ BEGIN\n  ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_role text
\n  ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'ACTIVE'
\n  ALTER TABLE users ADD COLUMN IF NOT EXISTS total_reviews int NOT NULL DEFAULT 0
\n  ALTER TABLE users ADD COLUMN IF NOT EXISTS average_rating numeric(3,2) NOT NULL DEFAULT 0
\n  ALTER TABLE users ADD COLUMN IF NOT EXISTS one_star_count int NOT NULL DEFAULT 0
\n  ALTER TABLE users ADD COLUMN IF NOT EXISTS account_locks_count int NOT NULL DEFAULT 0
\nEND $$
\n\n-- CHECK constraints\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_admin_role_check') THEN\n    ALTER TABLE users ADD CONSTRAINT users_admin_role_check CHECK (\n      admin_role IS NULL OR admin_role IN ('super_admin', 'support_admin', 'trust_safety_admin', 'qa_admin', 'finance_admin')\n    )
\n  END IF
\nEND $$
\n\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_account_status_check') THEN\n    ALTER TABLE users ADD CONSTRAINT users_account_status_check CHECK (\n      account_status IN ('ACTIVE', 'LOCKED', 'BANNED')\n    )
\n  END IF
\nEND $$
\n\n-- Backfill: existing admins get super_admin role\nUPDATE users SET admin_role = 'super_admin' WHERE is_admin = true AND admin_role IS NULL
\n\n-- =========================================================\n-- 2. ALTER products: add reputation + visibility fields\n-- =========================================================\nDO $$ BEGIN\n  ALTER TABLE products ADD COLUMN IF NOT EXISTS total_reviews int NOT NULL DEFAULT 0
\n  ALTER TABLE products ADD COLUMN IF NOT EXISTS average_rating numeric(3,2) NOT NULL DEFAULT 0
\n  ALTER TABLE products ADD COLUMN IF NOT EXISTS one_star_count int NOT NULL DEFAULT 0
\n  ALTER TABLE products ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false
\nEND $$
\n\n-- =========================================================\n-- 3. CREATE reviews table\n-- =========================================================\nCREATE TABLE IF NOT EXISTS reviews (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  reviewer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  target_type text NOT NULL CHECK (target_type IN ('product', 'seller', 'sales_team')),\n  target_id uuid NOT NULL,\n  rating int NOT NULL CHECK (rating >= 1 AND rating <= 5),\n  review_text text,\n  created_at timestamptz NOT NULL DEFAULT now()\n)
\n\nCREATE INDEX IF NOT EXISTS idx_reviews_target ON reviews(target_type, target_id)
\nCREATE INDEX IF NOT EXISTS idx_reviews_reviewer ON reviews(reviewer_id)
\n\nALTER TABLE reviews ENABLE ROW LEVEL SECURITY
\n\nDROP POLICY IF EXISTS "read_all_reviews" ON reviews
\nCREATE POLICY "read_all_reviews" ON reviews FOR SELECT\n  TO authenticated USING (true)
\n\nDROP POLICY IF EXISTS "insert_own_review" ON reviews
\nCREATE POLICY "insert_own_review" ON reviews FOR INSERT\n  TO authenticated WITH CHECK (auth.uid() = reviewer_id)
\n\nDROP POLICY IF EXISTS "update_own_review" ON reviews
\nCREATE POLICY "update_own_review" ON reviews FOR UPDATE\n  TO authenticated USING (auth.uid() = reviewer_id) WITH CHECK (auth.uid() = reviewer_id)
\n\nDROP POLICY IF EXISTS "delete_own_review" ON reviews
\nCREATE POLICY "delete_own_review" ON reviews FOR DELETE\n  TO authenticated USING (auth.uid() = reviewer_id)
\n\n-- Admin full access\nDROP POLICY IF EXISTS "admin_all_reviews" ON reviews
\nCREATE POLICY "admin_all_reviews" ON reviews FOR ALL\n  TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()))
\n\n-- =========================================================\n-- 4. CREATE global_announcements table\n-- =========================================================\nCREATE TABLE IF NOT EXISTS global_announcements (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  title text NOT NULL,\n  message text NOT NULL,\n  type text NOT NULL DEFAULT 'news' CHECK (type IN ('news', 'promo', 'update')),\n  is_active boolean NOT NULL DEFAULT true,\n  created_by uuid REFERENCES users(id) ON DELETE SET NULL,\n  created_at timestamptz NOT NULL DEFAULT now()\n)
\n\nALTER TABLE global_announcements ENABLE ROW LEVEL SECURITY
\n\nDROP POLICY IF EXISTS "read_announcements" ON global_announcements
\nCREATE POLICY "read_announcements" ON global_announcements FOR SELECT\n  TO authenticated USING (true)
\n\nDROP POLICY IF EXISTS "admin_write_announcements" ON global_announcements
\nCREATE POLICY "admin_write_announcements" ON global_announcements FOR ALL\n  TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()))
\n\n-- =========================================================\n-- 5. CREATE site_settings table (singleton)\n-- =========================================================\nCREATE TABLE IF NOT EXISTS site_settings (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  singleton boolean NOT NULL DEFAULT true UNIQUE,\n  site_name text NOT NULL DEFAULT 'AffiliateHub',\n  favicon_url text,\n  logo_url text,\n  maintenance_mode boolean NOT NULL DEFAULT false,\n  updated_at timestamptz NOT NULL DEFAULT now(),\n  updated_by uuid REFERENCES users(id) ON DELETE SET NULL\n)
\n\nALTER TABLE site_settings ENABLE ROW LEVEL SECURITY
\n\nDROP POLICY IF EXISTS "read_site_settings" ON site_settings
\nCREATE POLICY "read_site_settings" ON site_settings FOR SELECT\n  TO authenticated USING (true)
\n\nDROP POLICY IF EXISTS "admin_write_site_settings" ON site_settings
\nCREATE POLICY "admin_write_site_settings" ON site_settings FOR ALL\n  TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()))
\n\nINSERT INTO site_settings (singleton) VALUES (true) ON CONFLICT (singleton) DO NOTHING
\n\n-- =========================================================\n-- 6. CREATE ban_appeals table\n-- =========================================================\nCREATE TABLE IF NOT EXISTS ban_appeals (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  appeal_text text NOT NULL,\n  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),\n  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,\n  reviewed_at timestamptz,\n  created_at timestamptz NOT NULL DEFAULT now()\n)
\n\nCREATE INDEX IF NOT EXISTS idx_ban_appeals_user ON ban_appeals(user_id)
\nCREATE INDEX IF NOT EXISTS idx_ban_appeals_status ON ban_appeals(status)
\n\nALTER TABLE ban_appeals ENABLE ROW LEVEL SECURITY
\n\n-- Users can read their own appeals and insert new ones\nDROP POLICY IF EXISTS "select_own_appeals" ON ban_appeals
\nCREATE POLICY "select_own_appeals" ON ban_appeals FOR SELECT\n  TO authenticated USING (auth.uid() = user_id)
\n\nDROP POLICY IF EXISTS "insert_own_appeal" ON ban_appeals
\nCREATE POLICY "insert_own_appeal" ON ban_appeals FOR INSERT\n  TO authenticated WITH CHECK (auth.uid() = user_id)
\n\n-- QA Admin can read all and update\nDROP POLICY IF EXISTS "qa_admin_all_appeals" ON ban_appeals
\nCREATE POLICY "qa_admin_all_appeals" ON ban_appeals FOR ALL\n  TO authenticated USING (\n    public.is_admin(auth.uid()) AND (\n      SELECT admin_role FROM users WHERE id = auth.uid()\n    ) = 'qa_admin'\n  ) WITH CHECK (\n    public.is_admin(auth.uid()) AND (\n      SELECT admin_role FROM users WHERE id = auth.uid()\n    ) = 'qa_admin'\n  )
\n\n-- Super Admin can also access\nDROP POLICY IF EXISTS "super_admin_all_appeals" ON ban_appeals
\nCREATE POLICY "super_admin_all_appeals" ON ban_appeals FOR ALL\n  TO authenticated USING (\n    public.is_admin(auth.uid()) AND (\n      SELECT admin_role FROM users WHERE id = auth.uid()\n    ) = 'super_admin'\n  ) WITH CHECK (\n    public.is_admin(auth.uid()) AND (\n      SELECT admin_role FROM users WHERE id = auth.uid()\n    ) = 'super_admin'\n  )
\n\n-- =========================================================\n-- 7. CREATE support_tickets table\n-- =========================================================\nCREATE TABLE IF NOT EXISTS support_tickets (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  subject text NOT NULL,\n  message text NOT NULL,\n  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'closed')),\n  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),\n  admin_reply text,\n  replied_by uuid REFERENCES users(id) ON DELETE SET NULL,\n  replied_at timestamptz,\n  created_at timestamptz NOT NULL DEFAULT now()\n)
\n\nCREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id)
\nCREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status)
\n\nALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY
\n\nDROP POLICY IF EXISTS "select_own_tickets" ON support_tickets
\nCREATE POLICY "select_own_tickets" ON support_tickets FOR SELECT\n  TO authenticated USING (auth.uid() = user_id)
\n\nDROP POLICY IF EXISTS "insert_own_ticket" ON support_tickets
\nCREATE POLICY "insert_own_ticket" ON support_tickets FOR INSERT\n  TO authenticated WITH CHECK (auth.uid() = user_id)
\n\n-- Support Admin and Super Admin can read all and update\nDROP POLICY IF EXISTS "support_admin_all_tickets" ON support_tickets
\nCREATE POLICY "support_admin_all_tickets" ON support_tickets FOR ALL\n  TO authenticated USING (\n    public.is_admin(auth.uid()) AND (\n      SELECT admin_role FROM users WHERE id = auth.uid()\n    ) IN ('support_admin', 'super_admin')\n  ) WITH CHECK (\n    public.is_admin(auth.uid()) AND (\n      SELECT admin_role FROM users WHERE id = auth.uid()\n    ) IN ('support_admin', 'super_admin')\n  )
\n\n-- =========================================================\n-- 8. CREATE fraud_reports table\n-- =========================================================\nCREATE TABLE IF NOT EXISTS fraud_reports (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  reported_id uuid REFERENCES users(id) ON DELETE SET NULL,\n  report_type text NOT NULL,\n  description text NOT NULL,\n  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'investigating', 'resolved', 'dismissed')),\n  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,\n  reviewed_at timestamptz,\n  created_at timestamptz NOT NULL DEFAULT now()\n)
\n\nCREATE INDEX IF NOT EXISTS idx_fraud_reports_reporter ON fraud_reports(reporter_id)
\nCREATE INDEX IF NOT EXISTS idx_fraud_reports_status ON fraud_reports(status)
\n\nALTER TABLE fraud_reports ENABLE ROW LEVEL SECURITY
\n\nDROP POLICY IF EXISTS "select_own_fraud_reports" ON fraud_reports
\nCREATE POLICY "select_own_fraud_reports" ON fraud_reports FOR SELECT\n  TO authenticated USING (auth.uid() = reporter_id)
\n\nDROP POLICY IF EXISTS "insert_own_fraud_report" ON fraud_reports
\nCREATE POLICY "insert_own_fraud_report" ON fraud_reports FOR INSERT\n  TO authenticated WITH CHECK (auth.uid() = reporter_id)
\n\n-- Trust & Safety Admin and Super Admin can read all and update\nDROP POLICY IF EXISTS "trust_admin_all_fraud" ON fraud_reports
\nCREATE POLICY "trust_admin_all_fraud" ON fraud_reports FOR ALL\n  TO authenticated USING (\n    public.is_admin(auth.uid()) AND (\n      SELECT admin_role FROM users WHERE id = auth.uid()\n    ) IN ('trust_safety_admin', 'super_admin')\n  ) WITH CHECK (\n    public.is_admin(auth.uid()) AND (\n      SELECT admin_role FROM users WHERE id = auth.uid()\n    ) IN ('trust_safety_admin', 'super_admin')\n  )
\n\n-- =========================================================\n-- 9. CREATE internal_settlements table\n-- =========================================================\nCREATE TABLE IF NOT EXISTS internal_settlements (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  seller_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  product_id uuid REFERENCES products(id) ON DELETE SET NULL,\n  sale_id uuid REFERENCES sales_records(id) ON DELETE SET NULL,\n  amount numeric(12,2) NOT NULL DEFAULT 0,\n  settlement_type text NOT NULL CHECK (settlement_type IN ('task_payment', 'sales_commission', 'sales_team_payment')),\n  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),\n  approved_by uuid REFERENCES users(id) ON DELETE SET NULL,\n  approved_at timestamptz,\n  created_at timestamptz NOT NULL DEFAULT now()\n)
\n\nCREATE INDEX IF NOT EXISTS idx_settlements_seller ON internal_settlements(seller_id)
\nCREATE INDEX IF NOT EXISTS idx_settlements_status ON internal_settlements(status)
\n\nALTER TABLE internal_settlements ENABLE ROW LEVEL SECURITY
\n\n-- Sellers can read their own settlements\nDROP POLICY IF EXISTS "select_own_settlements" ON internal_settlements
\nCREATE POLICY "select_own_settlements" ON internal_settlements FOR SELECT\n  TO authenticated USING (auth.uid() = seller_id)
\n\n-- Finance Admin and Super Admin can read all and update\nDROP POLICY IF EXISTS "finance_admin_all_settlements" ON internal_settlements
\nCREATE POLICY "finance_admin_all_settlements" ON internal_settlements FOR ALL\n  TO authenticated USING (\n    public.is_admin(auth.uid()) AND (\n      SELECT admin_role FROM users WHERE id = auth.uid()\n    ) IN ('finance_admin', 'super_admin')\n  ) WITH CHECK (\n    public.is_admin(auth.uid()) AND (\n      SELECT admin_role FROM users WHERE id = auth.uid()\n    ) IN ('finance_admin', 'super_admin')\n  )
