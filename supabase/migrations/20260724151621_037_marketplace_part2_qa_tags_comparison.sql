-- Product Q&A
CREATE TABLE IF NOT EXISTS product_qa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  asker_id uuid REFERENCES users(id) ON DELETE SET NULL,
  question text NOT NULL,
  answer text,
  answered_by uuid REFERENCES users(id) ON DELETE SET NULL,
  answered_at timestamptz,
  is_approved boolean NOT NULL DEFAULT true,
  helpful_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE product_qa ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_qa" ON product_qa FOR SELECT TO anon, authenticated USING (is_approved = true);
CREATE POLICY "insert_qa" ON product_qa FOR INSERT TO authenticated WITH CHECK (auth.uid() = asker_id);
CREATE POLICY "update_qa" ON product_qa FOR UPDATE TO authenticated USING (auth.uid() = answered_by OR auth.uid() = asker_id);
CREATE POLICY "delete_qa" ON product_qa FOR DELETE TO authenticated USING (auth.uid() = asker_id);

-- Product tags
CREATE TABLE IF NOT EXISTS product_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tag text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, tag)
);
ALTER TABLE product_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_tags" ON product_tags FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert_tags" ON product_tags FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "delete_tags" ON product_tags FOR DELETE TO authenticated USING (true);

-- Product comparison sessions
CREATE TABLE IF NOT EXISTS product_comparisons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  session_key text,
  product_ids text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE product_comparisons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_comparisons" ON product_comparisons FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert_comparisons" ON product_comparisons FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "update_comparisons" ON product_comparisons FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "delete_comparisons" ON product_comparisons FOR DELETE TO anon, authenticated USING (true);

-- Review helpful votes
CREATE TABLE IF NOT EXISTS review_helpful_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, user_id)
);
ALTER TABLE review_helpful_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_helpful" ON review_helpful_votes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert_helpful" ON review_helpful_votes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_helpful" ON review_helpful_votes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Add extra columns to products if missing
ALTER TABLE products ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS condition text DEFAULT 'new';
ALTER TABLE products ADD COLUMN IF NOT EXISTS specifications jsonb DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS faqs jsonb DEFAULT '[]';
ALTER TABLE products ADD COLUMN IF NOT EXISTS old_price numeric(12,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS discount_percent integer;
ALTER TABLE products ADD COLUMN IF NOT EXISTS flash_sale_ends_at timestamptz;
ALTER TABLE products ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_featured boolean DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_sponsored boolean DEFAULT false;

-- Add is_verified and store_description to users if missing
ALTER TABLE users ADD COLUMN IF NOT EXISTS store_description text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS response_rate integer DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avg_response_time_hours integer DEFAULT 24;
ALTER TABLE users ADD COLUMN IF NOT EXISTS languages text[] DEFAULT '{"English"}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS joined_at timestamptz DEFAULT now();
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at timestamptz DEFAULT now();
ALTER TABLE users ADD COLUMN IF NOT EXISTS followers_count integer DEFAULT 0;
