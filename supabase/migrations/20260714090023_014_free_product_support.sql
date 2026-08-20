/*
# Add free product support: is_free, stock_quantity, initial_stock columns

1. Changes to `products` table
- `is_free` (boolean, default false) — flags a product as free (price=0, no commission)
- `stock_quantity` (integer, nullable) — remaining inventory; null = unlimited
- `initial_stock` (integer, nullable) — original stock for display; null = unlimited

2. Security
- No RLS policy changes; existing policies still apply.
- No data loss: all new columns are nullable or have safe defaults.
*/

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_free boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS stock_quantity integer,
  ADD COLUMN IF NOT EXISTS initial_stock integer;
