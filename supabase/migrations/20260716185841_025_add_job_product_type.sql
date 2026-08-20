-- Add JOB to product_type CHECK constraint
ALTER TABLE products DROP CONSTRAINT IF EXISTS product_type_check;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_product_type_check;

ALTER TABLE products ADD CONSTRAINT product_type_check
  CHECK (product_type IN ('DIGITAL', 'SERVICE', 'COURSE', 'JOB'));
