-- DRIGHT — Product view counter RPC
-- Increments view_count on products table atomically.
-- Called from the client when a product detail page or quick view is opened.

CREATE OR REPLACE FUNCTION increment_product_view(p_product_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE products
  SET view_count = COALESCE(view_count, 0) + 1
  WHERE id = p_product_id;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_product_view(uuid) TO authenticated, anon;
