/*
# Update products table: expand approval_status constraint for suspended/removed

1. Changes
- Drop the existing approval_status CHECK constraint (if any) and add a new one
  that allows: 'pending', 'approved', 'rejected', 'suspended', 'removed'
- 'suspended' = admin temporarily hid the product from the marketplace (is_hidden=true)
- 'removed' = admin permanently deleted the product from the marketplace (is_hidden=true, is_active=false)

2. Security
- No RLS policy changes needed; existing policies still apply.
*/

DO $$
BEGIN
  -- Try to drop existing constraint if it exists
  BEGIN
    ALTER TABLE products DROP CONSTRAINT IF EXISTS products_approval_status_check;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END $$;

ALTER TABLE products ADD CONSTRAINT products_approval_status_check
  CHECK (approval_status = ANY (ARRAY['pending', 'approved', 'rejected', 'suspended', 'removed']));
