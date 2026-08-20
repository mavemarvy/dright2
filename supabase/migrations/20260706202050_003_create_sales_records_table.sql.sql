/*
# Create sales_records table

1. Purpose
- Records each successful sale attributed to a promoter.
- Tracks buyer name, product sold, commission earned, and payment status.

2. New Tables
- `sales_records`
  - `id` (uuid, primary key)
  - `promoter_id` (uuid, not null, references auth.users)
  - `buyer_name` (text, not null)
  - `product_name` (text, not null)
  - `commission_amount` (numeric, not null)
  - `status` (text, default 'pending') - 'pending', 'paid'
  - `sale_date` (date, default current date)
  - `created_at` (timestamptz, default now())

3. Security (RLS)
- Enable RLS.
- Promoters can view only their own sales records.
- INSERT policy allows promoters to create records for themselves.
- Status updates may be handled by admin or edge functions.

4. Notes
- Commission amounts stored as numeric for precision.
- sale_date defaults to the current date when the record is created.
*/

CREATE TABLE IF NOT EXISTS sales_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promoter_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  buyer_name text NOT NULL,
  product_name text NOT NULL,
  commission_amount numeric(10, 2) NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  sale_date date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_records_promoter_id ON sales_records(promoter_id);
CREATE INDEX IF NOT EXISTS idx_sales_records_status ON sales_records(status);
CREATE INDEX IF NOT EXISTS idx_sales_records_sale_date ON sales_records(sale_date);

ALTER TABLE sales_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Promoters can read own sales records" ON sales_records;
CREATE POLICY "Promoters can read own sales records"
ON sales_records FOR SELECT
TO authenticated
USING (auth.uid() = promoter_id);

DROP POLICY IF EXISTS "Promoters can insert own sales records" ON sales_records;
CREATE POLICY "Promoters can insert own sales records"
ON sales_records FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = promoter_id);