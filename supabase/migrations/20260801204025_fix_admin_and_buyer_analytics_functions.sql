-- Fix get_admin_analytics_v2: remove wallet_transactions reference
DO $$
DECLARE
  r RECORD;
  new_def TEXT;
BEGIN
  FOR r IN
    SELECT oid, proname, pg_get_functiondef(oid) as def
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
    AND proname = 'get_admin_analytics_v2'
  LOOP
    new_def := r.def;
    -- wallet_transactions doesn't exist - replace with 0
    new_def := replace(new_def, '(SELECT COALESCE(sum(amount), 0) FROM wallet_transactions WHERE type = ''deposit'' AND status = ''completed'')', '0');
    EXECUTE new_def;
    RAISE NOTICE 'Fixed function: %', r.proname;
  END LOOP;
END;
$$;

-- Fix get_admin_intelligence_v2: last_seen -> last_active_at, referral_earnings -> 0, country on users -> location
DO $$
DECLARE
  r RECORD;
  new_def TEXT;
BEGIN
  FOR r IN
    SELECT oid, proname, pg_get_functiondef(oid) as def
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
    AND proname = 'get_admin_intelligence_v2'
  LOOP
    new_def := r.def;
    new_def := replace(new_def, 'last_seen', 'last_active_at');
    -- referral_earnings doesn't exist - replace the CAC subquery
    new_def := replace(new_def, '(SELECT COALESCE(sum(amount), 0) FROM referral_earnings WHERE created_at >= v_start)', '0');
    -- country on users doesn't exist - use location instead
    new_def := replace(new_def, 'FROM (SELECT country, count(*) AS cnt FROM users WHERE country IS NOT NULL GROUP BY country ORDER BY cnt DESC LIMIT 10) t', 'FROM (SELECT location AS country, count(*) AS cnt FROM users WHERE location IS NOT NULL GROUP BY location ORDER BY cnt DESC LIMIT 10) t');
    EXECUTE new_def;
    RAISE NOTICE 'Fixed function: %', r.proname;
  END LOOP;
END;
$$;

-- Fix get_buyer_analytics_v2: remove entity_type on wishlist, wallet_transactions, referral_earnings, wallet_balances
DO $$
DECLARE
  r RECORD;
  new_def TEXT;
BEGIN
  FOR r IN
    SELECT oid, proname, pg_get_functiondef(oid) as def
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
    AND proname = 'get_buyer_analytics_v2'
  LOOP
    new_def := r.def;
    -- wishlist has no entity_type column - remove those saved_services/saved_courses queries
    new_def := replace(new_def, '''saved_products'',    (SELECT count(*) FROM wishlist WHERE user_id = p_buyer_id AND entity_type = ''product'')', '''saved_products'',    (SELECT count(*) FROM wishlist WHERE user_id = p_buyer_id)');
    new_def := replace(new_def, '''saved_services'',    (SELECT count(*) FROM wishlist WHERE user_id = p_buyer_id AND entity_type = ''service'')', '''saved_services'',    0');
    new_def := replace(new_def, '''saved_courses'',     (SELECT count(*) FROM wishlist WHERE user_id = p_buyer_id AND entity_type = ''course'')', '''saved_courses'',     0');
    -- analytics_events has entity_type column but the query uses ae.entity_type = 'product' which is fine
    -- wallet_transactions doesn't exist - replace reward_history
    new_def := replace(new_def, '''reward_history'',    (
SELECT COALESCE(jsonb_agg(jsonb_build_object(''id'', id, ''amount'', amount, ''type'', type, ''created_at'', created_at) ORDER BY created_at DESC), ''[]''::jsonb)
FROM wallet_transactions WHERE user_id = p_buyer_id
)', '''reward_history'',    ''[]''::jsonb');
    -- referral_earnings doesn't exist
    new_def := replace(new_def, '''referral_earnings'', (SELECT COALESCE(sum(amount), 0) FROM referral_earnings WHERE user_id = p_buyer_id)', '''referral_earnings'', 0');
    -- wallet_balances doesn't exist
    new_def := replace(new_def, '''wallet_balance'',    (SELECT COALESCE(balance, 0) FROM wallet_balances WHERE user_id = p_buyer_id)', '''wallet_balance'',    0');
    EXECUTE new_def;
    RAISE NOTICE 'Fixed function: %', r.proname;
  END LOOP;
END;
$$;