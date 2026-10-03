-- Extend secure guest entitlement access with physical-delivery handoff.

DROP FUNCTION IF EXISTS public.get_guest_access(uuid);

CREATE OR REPLACE FUNCTION public.get_guest_access(p_token uuid)
RETURNS TABLE(
  entitlement_id uuid,
  guest_order_id uuid,
  product_id uuid,
  product_name text,
  product_type text,
  image_url text,
  course_slug text,
  course_access_path text,
  delivery_type text,
  download_file_url text,
  access_link text,
  recipient_email text,
  recipient_name text,
  shipping_required boolean,
  shipping_address text,
  starts_at timestamptz,
  expires_at timestamptz,
  days_remaining integer,
  active boolean,
  claimed boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
  SELECT
    e.id,e.guest_order_id,p.id,p.name,p.product_type,p.image_url,
    nullif(p.specifications->>'course_slug',''),
    nullif(p.specifications->>'course_access_path',''),
    d.delivery_type,d.download_file_url,d.access_link,
    e.recipient_email,e.recipient_name,
    upper(coalesce(p.product_type,''))='PHYSICAL' AND nullif(btrim(coalesce(g.shipping_address,'')),'') IS NULL,
    g.shipping_address,
    e.starts_at,e.expires_at,
    greatest(0,ceil(extract(epoch from (e.expires_at-now()))/86400.0)::integer),
    (
      g.payment_status='success'
      AND g.processed_at IS NOT NULL
      AND e.revoked_at IS NULL
      AND e.claimed_user_id IS NULL
      AND now() < e.expires_at
    ) AS active,
    e.claimed_user_id IS NOT NULL AS claimed
  FROM public.guest_access_entitlements e
  JOIN public.guest_orders g ON g.id=e.guest_order_id
  JOIN public.products p ON p.id=e.listing_id
  LEFT JOIN public.digital_product_details d ON d.product_id=p.id
  WHERE e.access_token=p_token
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_guest_access(uuid) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.set_guest_shipping_address(
  p_token uuid,
  p_shipping_address text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_order uuid;
  v_address text := btrim(coalesce(p_shipping_address,''));
BEGIN
  IF length(v_address) < 8 THEN
    RAISE EXCEPTION 'Please enter a complete shipping address';
  END IF;
  IF length(v_address) > 1000 THEN
    RAISE EXCEPTION 'Shipping address is too long';
  END IF;

  SELECT e.guest_order_id INTO v_order
  FROM public.guest_access_entitlements e
  JOIN public.guest_orders g ON g.id=e.guest_order_id
  JOIN public.products p ON p.id=e.listing_id
  WHERE e.access_token=p_token
    AND upper(coalesce(p.product_type,''))='PHYSICAL'
    AND g.payment_status='success'
    AND g.processed_at IS NOT NULL
    AND e.revoked_at IS NULL
    AND e.claimed_user_id IS NULL
    AND now()<e.expires_at
  FOR UPDATE OF e;

  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Guest access is invalid, expired, or does not require shipping';
  END IF;

  UPDATE public.guest_orders
  SET shipping_address=v_address,
      metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object('shipping_pending',false,'shipping_address_confirmed_at',now()),
      updated_at=now()
  WHERE id=v_order;

  RETURN jsonb_build_object('success',true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_guest_shipping_address(uuid,text) TO anon,authenticated;
