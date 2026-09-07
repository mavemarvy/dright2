-- ST-4C: Close remaining referral-authority gaps without creating a second system.
-- 1) Normal browser-created profiles derive users.referred_by from the referral code
--    stored in auth signup metadata, never from a browser-selected sponsor UUID.
-- 2) Referral withdrawal capacity is revalidated on admin/status/amount updates.

-- =============================================================================
-- 1. Resolve signup sponsor server-side from auth.users.raw_user_meta_data.
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
  v_signup_code text;
  v_resolved_referrer uuid;
  v_auth_role text := coalesce(auth.role(), '');
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Permanent referral codes are generated server-side for normal browser
    -- profile creation. Internal/service jobs may preserve an explicit code.
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

    IF v_auth_role IN ('authenticated', 'anon') OR auth.uid() IS NOT NULL THEN
      -- Browser-supplied NEW.referred_by is never authoritative. The referral
      -- code is captured before auth signup and stored in auth metadata; this
      -- trigger resolves the canonical sponsor entirely on the server.
      NEW.referred_by := NULL;

      SELECT nullif(upper(btrim(coalesce(au.raw_user_meta_data->>'signup_referral_code', ''))), '')
      INTO v_signup_code
      FROM auth.users au
      WHERE au.id = NEW.id;

      IF v_signup_code IS NOT NULL THEN
        -- Prefer the permanent account referral code.
        SELECT u.id
        INTO v_resolved_referrer
        FROM public.users u
        WHERE upper(u.referral_code) = v_signup_code
          AND coalesce(u.account_status, '') = 'ACTIVE'
        LIMIT 1;

        -- Product-specific/generic affiliate tracking links can also be the
        -- signup entry point. Sales Team / advertiser / partnership links must
        -- not become the permanent signup-referral chain.
        IF v_resolved_referrer IS NULL THEN
          SELECT u.id
          INTO v_resolved_referrer
          FROM public.referral_links rl
          JOIN public.users u ON u.id = rl.user_id
          WHERE upper(rl.unique_code) = v_signup_code
            AND coalesce(rl.source_type, 'affiliate') = 'affiliate'
            AND coalesce(u.account_status, '') = 'ACTIVE'
          ORDER BY rl.created_at ASC, rl.id ASC
          LIMIT 1;
        END IF;

        IF v_resolved_referrer IS NOT NULL AND v_resolved_referrer <> NEW.id THEN
          NEW.referred_by := v_resolved_referrer;
        END IF;
      END IF;
    ELSE
      -- Trusted internal/service inserts retain compatibility with an explicit
      -- referred_by, while still enforcing active/non-self sponsor validity.
      IF NEW.referred_by IS NOT NULL THEN
        IF NEW.referred_by = NEW.id THEN
          NEW.referred_by := NULL;
        ELSE
          SELECT account_status
          INTO v_referrer_status
          FROM public.users
          WHERE id = NEW.referred_by;

          IF NOT FOUND OR coalesce(v_referrer_status, '') <> 'ACTIVE' THEN
            NEW.referred_by := NULL;
          END IF;
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

REVOKE ALL ON FUNCTION public.guard_user_referral_identity() FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 2. Revalidate referral withdrawal state/capacity on every consequential update.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.guard_referral_withdrawal_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_earned numeric := 0;
  v_other_reserved numeric := 0;
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Referral withdrawal owner is immutable';
  END IF;

  IF OLD.status = 'paid' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.method IS DISTINCT FROM OLD.method THEN
      RAISE EXCEPTION 'Paid referral withdrawals are immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.amount IS NULL OR NEW.amount < 5 THEN
    RAISE EXCEPTION 'Minimum referral withdrawal is $5';
  END IF;

  IF NEW.method NOT IN ('paystack','bank','crypto') THEN
    RAISE EXCEPTION 'Unsupported referral withdrawal method';
  END IF;

  IF NEW.status IN ('pending','approved','paid') THEN
    -- Serialize all reservation/state changes for this user. This prevents an
    -- approval or amount edit from outracing another withdrawal or a refund.
    PERFORM pg_advisory_xact_lock(
      hashtextextended('referral-withdrawal:' || NEW.user_id::text, 0)
    );

    SELECT coalesce(sum(greatest(0, reward_amount - coalesce(reversed_amount, 0))), 0)
    INTO v_earned
    FROM public.referral_rewards
    WHERE referrer_id = NEW.user_id
      AND status IN ('confirmed','paid');

    SELECT coalesce(sum(amount), 0)
    INTO v_other_reserved
    FROM public.referral_withdrawals
    WHERE user_id = NEW.user_id
      AND id <> OLD.id
      AND status IN ('pending','approved','paid');

    IF v_other_reserved + NEW.amount > v_earned + 0.000001 THEN
      RAISE EXCEPTION 'Referral withdrawal exceeds currently available earnings';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_referral_withdrawal_update ON public.referral_withdrawals;
CREATE TRIGGER trg_guard_referral_withdrawal_update
BEFORE UPDATE OF user_id, amount, method, status ON public.referral_withdrawals
FOR EACH ROW
EXECUTE FUNCTION public.guard_referral_withdrawal_update();

REVOKE ALL ON FUNCTION public.guard_referral_withdrawal_update() FROM PUBLIC, anon, authenticated;
