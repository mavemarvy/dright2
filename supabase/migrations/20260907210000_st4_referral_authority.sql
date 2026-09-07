-- ST-4A: Server-authoritative referral identity, relationship, statistics and withdrawal state.
-- Reuses the existing DRIGHT2 referral tables and RPC names. No second referral system is created.

-- =============================================================================
-- 1. Extend existing referral rewards for authoritative order attribution/reversals.
-- =============================================================================
ALTER TABLE public.referral_rewards
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS platform_fee_basis numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reward_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reversed_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversal_reason text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.referral_rewards
  DROP CONSTRAINT IF EXISTS referral_rewards_status_check;
ALTER TABLE public.referral_rewards
  ADD CONSTRAINT referral_rewards_status_check
  CHECK (status IN ('pending','confirmed','expired','paid','reversed'));

ALTER TABLE public.referral_rewards
  DROP CONSTRAINT IF EXISTS referral_rewards_reversed_amount_check;
ALTER TABLE public.referral_rewards
  ADD CONSTRAINT referral_rewards_reversed_amount_check
  CHECK (reversed_amount >= 0 AND reversed_amount <= reward_amount);

-- The schema snapshot has no referral relationship/reward rows, so these indexes
-- establish the intended one-chain / one-reward-per-level invariant directly.
CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_relationships_referred_level_unique
  ON public.referral_relationships(referred_id, level);
CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_rewards_user_type_level_unique
  ON public.referral_rewards(referred_user_id, reward_type, level);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_order
  ON public.referral_rewards(order_id);

-- =============================================================================
-- 2. Referral identity is stable. The existing users.referred_by remains canonical.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.guard_user_referral_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_candidate text;
  v_referrer_status text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Generate the permanent referral code on the server for normal signed-in
    -- profile creation. Service jobs may preserve an explicit code when supplied.
    IF auth.uid() IS NOT NULL OR NEW.referral_code IS NULL OR btrim(NEW.referral_code) = '' THEN
      LOOP
        v_candidate := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
        EXIT WHEN NOT EXISTS (
          SELECT 1 FROM public.users WHERE referral_code = v_candidate
        );
      END LOOP;
      NEW.referral_code := v_candidate;
    ELSE
      NEW.referral_code := upper(btrim(NEW.referral_code));
    END IF;

    IF NEW.referred_by IS NOT NULL THEN
      IF NEW.referred_by = NEW.id THEN
        INSERT INTO public.referral_fraud_logs(referrer_id, referred_user_id, reason, details)
        VALUES(NEW.referred_by, NEW.id, 'self_referral', jsonb_build_object('source', 'user_profile_insert'));
        NEW.referred_by := NULL;
      ELSE
        SELECT account_status
        INTO v_referrer_status
        FROM public.users
        WHERE id = NEW.referred_by;

        IF NOT FOUND OR coalesce(v_referrer_status, '') <> 'ACTIVE' THEN
          INSERT INTO public.referral_fraud_logs(referrer_id, referred_user_id, reason, details)
          VALUES(NEW.referred_by, NEW.id, 'banned_account', jsonb_build_object('source', 'user_profile_insert'));
          NEW.referred_by := NULL;
        END IF;
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  IF OLD.referral_code IS DISTINCT FROM NEW.referral_code THEN
    RAISE EXCEPTION 'Referral code is immutable after account creation';
  END IF;

  IF OLD.referred_by IS DISTINCT FROM NEW.referred_by THEN
    RAISE EXCEPTION 'Referral sponsor is immutable after account creation';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_user_referral_identity ON public.users;
CREATE TRIGGER trg_guard_user_referral_identity
BEFORE INSERT OR UPDATE OF referral_code, referred_by ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.guard_user_referral_identity();

REVOKE ALL ON FUNCTION public.guard_user_referral_identity() FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 3. Build the existing 3-level relationship cache only from users.referred_by.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.sync_referral_relationships_for_user(p_referred_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_l1 uuid;
  v_l2 uuid;
  v_l3 uuid;
BEGIN
  SELECT referred_by INTO v_l1
  FROM public.users
  WHERE id = p_referred_id;

  IF v_l1 IS NULL OR v_l1 = p_referred_id THEN
    RETURN;
  END IF;

  SELECT referred_by INTO v_l2
  FROM public.users
  WHERE id = v_l1;

  IF v_l2 = p_referred_id OR v_l2 = v_l1 THEN
    v_l2 := NULL;
  END IF;

  IF v_l2 IS NOT NULL THEN
    SELECT referred_by INTO v_l3
    FROM public.users
    WHERE id = v_l2;

    IF v_l3 = p_referred_id OR v_l3 = v_l1 OR v_l3 = v_l2 THEN
      v_l3 := NULL;
    END IF;
  ELSE
    v_l3 := NULL;
  END IF;

  INSERT INTO public.referral_relationships(referrer_id, referred_id, level)
  VALUES(v_l1, p_referred_id, 1)
  ON CONFLICT (referred_id, level) DO UPDATE
    SET referrer_id = EXCLUDED.referrer_id;

  IF v_l2 IS NOT NULL THEN
    INSERT INTO public.referral_relationships(referrer_id, referred_id, level)
    VALUES(v_l2, p_referred_id, 2)
    ON CONFLICT (referred_id, level) DO UPDATE
      SET referrer_id = EXCLUDED.referrer_id;
  ELSE
    DELETE FROM public.referral_relationships
    WHERE referred_id = p_referred_id AND level = 2;
  END IF;

  IF v_l3 IS NOT NULL THEN
    INSERT INTO public.referral_relationships(referrer_id, referred_id, level)
    VALUES(v_l3, p_referred_id, 3)
    ON CONFLICT (referred_id, level) DO UPDATE
      SET referrer_id = EXCLUDED.referrer_id;
  ELSE
    DELETE FROM public.referral_relationships
    WHERE referred_id = p_referred_id AND level = 3;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_new_user_referral_relationships()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.referred_by IS NOT NULL THEN
    PERFORM public.sync_referral_relationships_for_user(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_new_user_referral_relationships ON public.users;
CREATE TRIGGER trg_sync_new_user_referral_relationships
AFTER INSERT ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_new_user_referral_relationships();

REVOKE ALL ON FUNCTION public.sync_referral_relationships_for_user(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_new_user_referral_relationships() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_referral_relationships_for_user(uuid) TO service_role;

-- Backfill the derived relationship cache from the permanent users.referred_by chain.
DO $block$
DECLARE
  v_user record;
BEGIN
  FOR v_user IN
    SELECT id FROM public.users WHERE referred_by IS NOT NULL
  LOOP
    PERFORM public.sync_referral_relationships_for_user(v_user.id);
  END LOOP;
END;
$block$;

-- =============================================================================
-- 4. Keep the user's generic affiliate referral link code identical to the
--    permanent users.referral_code. Product/campaign/team links keep their own code.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.canonicalize_generic_referral_link_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_code text;
BEGIN
  IF NEW.product_id IS NULL
     AND coalesce(NEW.source_type, 'affiliate') = 'affiliate'
     AND NEW.campaign_id IS NULL
     AND NEW.sales_team_id IS NULL THEN
    SELECT referral_code INTO v_code
    FROM public.users
    WHERE id = NEW.user_id;

    IF v_code IS NOT NULL THEN
      NEW.unique_code := v_code;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_canonicalize_generic_referral_link_code ON public.referral_links;
CREATE TRIGGER trg_canonicalize_generic_referral_link_code
BEFORE INSERT ON public.referral_links
FOR EACH ROW
EXECUTE FUNCTION public.canonicalize_generic_referral_link_code();

REVOKE ALL ON FUNCTION public.canonicalize_generic_referral_link_code() FROM PUBLIC, anon, authenticated;

-- Repair only the oldest generic affiliate link per user, avoiding code collisions.
UPDATE public.referral_links rl
SET unique_code = u.referral_code
FROM public.users u
WHERE rl.user_id = u.id
  AND u.referral_code IS NOT NULL
  AND rl.product_id IS NULL
  AND coalesce(rl.source_type, 'affiliate') = 'affiliate'
  AND rl.campaign_id IS NULL
  AND rl.sales_team_id IS NULL
  AND rl.unique_code IS DISTINCT FROM u.referral_code
  AND rl.id = (
    SELECT r2.id
    FROM public.referral_links r2
    WHERE r2.user_id = rl.user_id
      AND r2.product_id IS NULL
      AND coalesce(r2.source_type, 'affiliate') = 'affiliate'
      AND r2.campaign_id IS NULL
      AND r2.sales_team_id IS NULL
    ORDER BY r2.created_at ASC, r2.id ASC
    LIMIT 1
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.referral_links collision
    WHERE collision.id <> rl.id
      AND collision.unique_code = u.referral_code
  );

-- =============================================================================
-- 5. Sensitive referral state becomes read-only to browsers.
-- =============================================================================
DROP POLICY IF EXISTS "refrel_select_own" ON public.referral_relationships;
DROP POLICY IF EXISTS "refrel_insert_own" ON public.referral_relationships;
DROP POLICY IF EXISTS "st4_refrel_select" ON public.referral_relationships;
CREATE POLICY "st4_refrel_select"
ON public.referral_relationships FOR SELECT TO authenticated
USING (
  auth.uid() = referrer_id
  OR auth.uid() = referred_id
  OR public.is_admin_user()
);

DROP POLICY IF EXISTS "refrew_select_own" ON public.referral_rewards;
DROP POLICY IF EXISTS "refrew_insert_own" ON public.referral_rewards;
DROP POLICY IF EXISTS "refrew_update_own" ON public.referral_rewards;
DROP POLICY IF EXISTS "st4_refrew_select" ON public.referral_rewards;
CREATE POLICY "st4_refrew_select"
ON public.referral_rewards FOR SELECT TO authenticated
USING (auth.uid() = referrer_id OR public.is_admin_user());

DROP POLICY IF EXISTS "refstats_select_own" ON public.referral_stats;
DROP POLICY IF EXISTS "refstats_upsert_own" ON public.referral_stats;
DROP POLICY IF EXISTS "refstats_update_own" ON public.referral_stats;
DROP POLICY IF EXISTS "st4_refstats_read" ON public.referral_stats;
-- Aggregate referral leaderboard values are intentionally readable by signed-in
-- users; writes remain server-only.
CREATE POLICY "st4_refstats_read"
ON public.referral_stats FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "reffraud_select_admin" ON public.referral_fraud_logs;
DROP POLICY IF EXISTS "reffraud_insert_auth" ON public.referral_fraud_logs;
DROP POLICY IF EXISTS "st4_reffraud_select_admin" ON public.referral_fraud_logs;
CREATE POLICY "st4_reffraud_select_admin"
ON public.referral_fraud_logs FOR SELECT TO authenticated
USING (public.is_admin_user());

-- =============================================================================
-- 6. Server-derived statistics. Preserve the old RPC name for the current UI,
--    but restrict callers to themselves (or admins/service role).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.referral_withdrawable_amount_internal(p_user_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_earned numeric := 0;
  v_reserved numeric := 0;
BEGIN
  SELECT coalesce(sum(greatest(0, reward_amount - coalesce(reversed_amount, 0))), 0)
  INTO v_earned
  FROM public.referral_rewards
  WHERE referrer_id = p_user_id
    AND status IN ('confirmed','paid');

  SELECT coalesce(sum(amount), 0)
  INTO v_reserved
  FROM public.referral_withdrawals
  WHERE user_id = p_user_id
    AND status IN ('pending','approved','paid');

  RETURN greatest(0, v_earned - v_reserved);
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_referral_stats_internal(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total int := 0;
  v_active int := 0;
  v_total_earned numeric := 0;
  v_pending numeric := 0;
  v_withdrawable numeric := 0;
BEGIN
  SELECT count(*)
  INTO v_total
  FROM public.referral_relationships
  WHERE referrer_id = p_user_id AND level = 1;

  SELECT count(DISTINCT rel.referred_id)
  INTO v_active
  FROM public.referral_relationships rel
  WHERE rel.referrer_id = p_user_id
    AND rel.level = 1
    AND EXISTS (
      SELECT 1
      FROM public.referral_rewards rw
      WHERE rw.referrer_id = p_user_id
        AND rw.referred_user_id = rel.referred_id
        AND rw.status IN ('pending','confirmed','paid')
        AND greatest(0, rw.reward_amount - coalesce(rw.reversed_amount, 0)) > 0
    );

  SELECT
    coalesce(sum(greatest(0, reward_amount - coalesce(reversed_amount, 0)))
      FILTER (WHERE status IN ('confirmed','paid')), 0),
    coalesce(sum(greatest(0, reward_amount - coalesce(reversed_amount, 0)))
      FILTER (WHERE status = 'pending'), 0)
  INTO v_total_earned, v_pending
  FROM public.referral_rewards
  WHERE referrer_id = p_user_id;

  v_withdrawable := public.referral_withdrawable_amount_internal(p_user_id);

  INSERT INTO public.referral_stats(
    user_id,
    total_referrals,
    active_referrals,
    total_earned,
    pending_earnings,
    withdrawable_earnings
  )
  VALUES(
    p_user_id,
    v_total,
    v_active,
    v_total_earned,
    v_pending,
    v_withdrawable
  )
  ON CONFLICT (user_id) DO UPDATE SET
    total_referrals = EXCLUDED.total_referrals,
    active_referrals = EXCLUDED.active_referrals,
    total_earned = EXCLUDED.total_earned,
    pending_earnings = EXCLUDED.pending_earnings,
    withdrawable_earnings = EXCLUDED.withdrawable_earnings;
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_referral_stats(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL
     AND auth.uid() IS DISTINCT FROM p_user_id
     AND NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Not authorized to refresh another user referral statistics';
  END IF;

  PERFORM public.refresh_referral_stats_internal(p_user_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.expire_referral_rewards()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    UPDATE public.referral_rewards
    SET status = 'expired', updated_at = now()
    WHERE status = 'pending'
      AND expires_at IS NOT NULL
      AND expires_at < now();
  ELSE
    UPDATE public.referral_rewards
    SET status = 'expired', updated_at = now()
    WHERE referrer_id = v_uid
      AND status = 'pending'
      AND expires_at IS NOT NULL
      AND expires_at < now();

    PERFORM public.refresh_referral_stats_internal(v_uid);
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.referral_withdrawable_amount_internal(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_referral_stats_internal(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_referral_stats(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.expire_referral_rewards() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.referral_withdrawable_amount_internal(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_referral_stats_internal(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_referral_stats(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expire_referral_rewards() TO authenticated, service_role;

-- Historical raw-balance helper must never be callable by a browser.
REVOKE ALL ON FUNCTION public.add_affiliate_earnings(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_affiliate_earnings(uuid, numeric) TO service_role;

-- Signup is not a paid affiliate conversion. Current signup code may still call
-- this compatibility RPC, but browser execution is intentionally denied; the
-- call returns an error object and does not break profile creation.
REVOKE ALL ON FUNCTION public.increment_referral_conversions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_referral_conversions(uuid) TO service_role;

-- =============================================================================
-- 7. Atomic referral withdrawal reservation using the existing table.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.guard_referral_withdrawal_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_available numeric := 0;
  v_role text := coalesce(auth.role(), '');
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Cannot request a referral withdrawal for another user';
  END IF;

  IF NEW.amount IS NULL OR NEW.amount < 5 THEN
    RAISE EXCEPTION 'Minimum referral withdrawal is $5';
  END IF;

  IF NEW.method NOT IN ('paystack','bank','crypto') THEN
    RAISE EXCEPTION 'Unsupported referral withdrawal method';
  END IF;

  IF v_role <> 'service_role' AND coalesce(NEW.status, 'pending') <> 'pending' THEN
    RAISE EXCEPTION 'New referral withdrawals must start as pending';
  END IF;

  NEW.status := coalesce(NEW.status, 'pending');

  -- Serialize requests per user so two simultaneous browser requests cannot
  -- reserve the same earnings.
  PERFORM pg_advisory_xact_lock(hashtextextended('referral-withdrawal:' || NEW.user_id::text, 0));

  v_available := public.referral_withdrawable_amount_internal(NEW.user_id);
  IF NEW.amount > v_available + 0.000001 THEN
    RAISE EXCEPTION 'Amount exceeds withdrawable referral earnings';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_referral_stats_after_withdrawal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.refresh_referral_stats_internal(coalesce(NEW.user_id, OLD.user_id));
  RETURN coalesce(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_referral_withdrawal_insert ON public.referral_withdrawals;
CREATE TRIGGER trg_guard_referral_withdrawal_insert
BEFORE INSERT ON public.referral_withdrawals
FOR EACH ROW
EXECUTE FUNCTION public.guard_referral_withdrawal_insert();

DROP TRIGGER IF EXISTS trg_refresh_referral_stats_after_withdrawal_insert ON public.referral_withdrawals;
CREATE TRIGGER trg_refresh_referral_stats_after_withdrawal_insert
AFTER INSERT ON public.referral_withdrawals
FOR EACH ROW
EXECUTE FUNCTION public.refresh_referral_stats_after_withdrawal();

DROP TRIGGER IF EXISTS trg_refresh_referral_stats_after_withdrawal_update ON public.referral_withdrawals;
CREATE TRIGGER trg_refresh_referral_stats_after_withdrawal_update
AFTER UPDATE OF status, amount ON public.referral_withdrawals
FOR EACH ROW
EXECUTE FUNCTION public.refresh_referral_stats_after_withdrawal();

REVOKE ALL ON FUNCTION public.guard_referral_withdrawal_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_referral_stats_after_withdrawal() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "refwd_select_own" ON public.referral_withdrawals;
DROP POLICY IF EXISTS "refwd_insert_own" ON public.referral_withdrawals;
DROP POLICY IF EXISTS "st4_refwd_select" ON public.referral_withdrawals;
DROP POLICY IF EXISTS "st4_refwd_insert" ON public.referral_withdrawals;
DROP POLICY IF EXISTS "st4_refwd_admin_manage" ON public.referral_withdrawals;

CREATE POLICY "st4_refwd_select"
ON public.referral_withdrawals FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.is_admin_user());

CREATE POLICY "st4_refwd_insert"
ON public.referral_withdrawals FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND status = 'pending');

CREATE POLICY "st4_refwd_admin_manage"
ON public.referral_withdrawals FOR UPDATE TO authenticated
USING (public.is_admin_user())
WITH CHECK (public.is_admin_user());

-- Refresh current cached rows using the new non-user-authoritative formula.
DO $block$
DECLARE
  v_user record;
BEGIN
  FOR v_user IN SELECT user_id FROM public.referral_stats
  LOOP
    PERFORM public.refresh_referral_stats_internal(v_user.user_id);
  END LOOP;
END;
$block$;
