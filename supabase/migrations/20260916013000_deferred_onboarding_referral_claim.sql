-- Deferred signup questionnaires, user onboarding center, and durable referral claiming.
-- This migration keeps questionnaires/KYC deferrable while preserving eligibility gates.

-- -----------------------------------------------------------------------------
-- Referral integrity and signup attribution
-- -----------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS referral_relationships_unique_path
  ON public.referral_relationships(referrer_id, referred_id, level);

CREATE OR REPLACE FUNCTION public.ensure_user_referral_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_candidate text;
  v_attempt integer := 0;
BEGIN
  IF NEW.referral_code IS NOT NULL AND btrim(NEW.referral_code) <> '' THEN
    NEW.referral_code := upper(btrim(NEW.referral_code));
    RETURN NEW;
  END IF;

  LOOP
    v_candidate := upper(substr(md5(NEW.id::text || ':' || v_attempt::text), 1, 10));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.referral_code = v_candidate AND u.id <> NEW.id
    );
    v_attempt := v_attempt + 1;
    IF v_attempt > 20 THEN
      RAISE EXCEPTION 'could not allocate referral code';
    END IF;
  END LOOP;

  NEW.referral_code := v_candidate;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_user_referral_code ON public.users;
CREATE TRIGGER trg_ensure_user_referral_code
BEFORE INSERT OR UPDATE OF referral_code ON public.users
FOR EACH ROW EXECUTE FUNCTION public.ensure_user_referral_code();

UPDATE public.users
SET referral_code = NULL
WHERE referral_code IS NULL OR btrim(referral_code) = '';

CREATE OR REPLACE FUNCTION public.apply_signup_referral(p_user_id uuid, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth','pg_temp'
AS $$
DECLARE
  v_code text := nullif(btrim(p_code), '');
  v_referrer uuid;
  v_existing uuid;
  v_link_id uuid;
  v_parent2 uuid;
  v_parent3 uuid;
BEGIN
  IF p_user_id IS NULL OR v_code IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'claimed', false, 'reason', 'no_referral_code');
  END IF;

  SELECT rtl.owner_id, rtl.link_id
    INTO v_referrer, v_link_id
  FROM public.resolve_tracking_link(v_code, NULL) rtl
  LIMIT 1;

  IF v_referrer IS NULL THEN
    SELECT u.id INTO v_referrer
    FROM public.users u
    WHERE upper(u.referral_code) = upper(v_code)
      AND upper(coalesce(u.account_status, 'ACTIVE')) = 'ACTIVE'
    LIMIT 1;
  END IF;

  IF v_referrer IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'claimed', false, 'reason', 'referral_not_found');
  END IF;
  IF v_referrer = p_user_id THEN
    RETURN jsonb_build_object('ok', true, 'claimed', false, 'reason', 'self_referral_ignored');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':referral', 0));

  SELECT u.referred_by INTO v_existing
  FROM public.users u
  WHERE u.id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'claimed', false, 'reason', 'profile_not_ready');
  END IF;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'claimed', v_existing = v_referrer,
      'already_claimed', true,
      'referrer_id', v_existing
    );
  END IF;

  UPDATE public.users
  SET referred_by = v_referrer
  WHERE id = p_user_id AND referred_by IS NULL;

  INSERT INTO public.referrals(referrer_id, referred_user_id, referral_code, is_successful)
  VALUES(v_referrer, p_user_id, v_code, true)
  ON CONFLICT(referred_user_id) DO NOTHING;

  INSERT INTO public.referral_relationships(referrer_id, referred_id, level)
  VALUES(v_referrer, p_user_id, 1)
  ON CONFLICT(referrer_id, referred_id, level) DO NOTHING;

  SELECT referred_by INTO v_parent2 FROM public.users WHERE id = v_referrer;
  IF v_parent2 IS NOT NULL AND v_parent2 <> p_user_id AND v_parent2 <> v_referrer THEN
    INSERT INTO public.referral_relationships(referrer_id, referred_id, level)
    VALUES(v_parent2, p_user_id, 2)
    ON CONFLICT(referrer_id, referred_id, level) DO NOTHING;

    SELECT referred_by INTO v_parent3 FROM public.users WHERE id = v_parent2;
    IF v_parent3 IS NOT NULL
       AND v_parent3 <> p_user_id
       AND v_parent3 <> v_referrer
       AND v_parent3 <> v_parent2 THEN
      INSERT INTO public.referral_relationships(referrer_id, referred_id, level)
      VALUES(v_parent3, p_user_id, 3)
      ON CONFLICT(referrer_id, referred_id, level) DO NOTHING;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'claimed', true,
    'referrer_id', v_referrer,
    'tracking_link_id', v_link_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_signup_referral(uuid,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_signup_referral()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth','pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_code text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT nullif(btrim(raw_user_meta_data->>'signup_referral_code'), '')
    INTO v_code
  FROM auth.users
  WHERE id = v_uid;
  RETURN public.apply_signup_referral(v_uid, v_code);
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_signup_referral() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_signup_referral() FROM anon;

CREATE OR REPLACE FUNCTION public.claim_signup_referral_after_profile_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth','pg_temp'
AS $$
DECLARE
  v_code text;
BEGIN
  SELECT nullif(btrim(raw_user_meta_data->>'signup_referral_code'), '')
    INTO v_code
  FROM auth.users
  WHERE id = NEW.id;

  IF v_code IS NOT NULL THEN
    PERFORM public.apply_signup_referral(NEW.id, v_code);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_claim_signup_referral_after_profile_insert ON public.users;
CREATE TRIGGER trg_claim_signup_referral_after_profile_insert
AFTER INSERT ON public.users
FOR EACH ROW EXECUTE FUNCTION public.claim_signup_referral_after_profile_insert();

-- Ensure canonical generic links exist for users whose referral code was repaired.
INSERT INTO public.referral_links(user_id, unique_code, source_type)
SELECT u.id, u.referral_code, 'affiliate'
FROM public.users u
WHERE u.referral_code IS NOT NULL
  AND NOT (coalesce(u.is_admin, false) AND coalesce(u.admin_status, '') = 'active')
  AND NOT EXISTS (
    SELECT 1 FROM public.referral_links rl
    WHERE rl.user_id = u.id
      AND rl.product_id IS NULL
      AND coalesce(rl.source_type, 'affiliate') = 'affiliate'
      AND rl.campaign_id IS NULL
      AND rl.sales_team_id IS NULL
  )
ON CONFLICT DO NOTHING;

-- Backfill durable signup attribution for existing accounts that still have the signup code.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT u.id, au.raw_user_meta_data->>'signup_referral_code' AS code
    FROM public.users u
    JOIN auth.users au ON au.id = u.id
    WHERE u.referred_by IS NULL
      AND nullif(btrim(au.raw_user_meta_data->>'signup_referral_code'), '') IS NOT NULL
  LOOP
    PERFORM public.apply_signup_referral(r.id, r.code);
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- Deferred questionnaire onboarding
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.questionnaire_answers_complete(
  p_questionnaire_id uuid,
  p_answers jsonb
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  q public.questionnaire_questions%ROWTYPE;
  v_answer jsonb;
  v_condition_key text;
  v_condition_expected jsonb;
  v_condition_actual jsonb;
BEGIN
  FOR q IN
    SELECT * FROM public.questionnaire_questions
    WHERE questionnaire_id = p_questionnaire_id
      AND is_active = true
      AND is_required = true
    ORDER BY sort_order
  LOOP
    v_condition_key := nullif(q.conditional_rules->>'question_key', '');
    IF v_condition_key IS NOT NULL AND q.conditional_rules ? 'equals' THEN
      v_condition_expected := q.conditional_rules->'equals';
      v_condition_actual := coalesce(p_answers, '{}'::jsonb)->v_condition_key;
      IF v_condition_actual IS DISTINCT FROM v_condition_expected THEN
        CONTINUE;
      END IF;
    END IF;

    v_answer := coalesce(p_answers, '{}'::jsonb)->q.question_key;
    IF v_answer IS NULL
       OR v_answer = 'null'::jsonb
       OR v_answer = '""'::jsonb
       OR v_answer = '[]'::jsonb THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.questionnaire_answers_complete(uuid,jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.refresh_user_onboarding_status(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_profiles text[];
  v_incomplete integer := 0;
  v_status text;
BEGIN
  SELECT intended_profiles INTO v_profiles
  FROM public.user_private_profiles
  WHERE user_id = p_user_id;

  IF v_profiles IS NULL OR cardinality(v_profiles) = 0 THEN
    RETURN 'in_progress';
  END IF;

  WITH active_defs AS (
    SELECT DISTINCT ON (qd.applicable_profile_type)
      qd.id, qd.applicable_profile_type, qd.version
    FROM public.questionnaire_definitions qd
    WHERE qd.is_active = true
      AND qd.applicable_profile_type = ANY(v_profiles)
    ORDER BY qd.applicable_profile_type, qd.version DESC
  ), latest AS (
    SELECT ad.id,
      (
        SELECT qs.status
        FROM public.questionnaire_submissions qs
        WHERE qs.user_id = p_user_id
          AND qs.questionnaire_id = ad.id
          AND qs.questionnaire_version = ad.version
        ORDER BY qs.created_at DESC
        LIMIT 1
      ) AS status
    FROM active_defs ad
  )
  SELECT count(*) FILTER (
    WHERE status IS NULL OR status NOT IN ('submitted','under_review','approved')
  ) INTO v_incomplete
  FROM latest;

  v_status := CASE WHEN v_incomplete = 0 THEN 'completed' ELSE 'in_progress' END;

  UPDATE public.user_private_profiles
  SET onboarding_status = v_status,
      onboarding_completed_at = CASE WHEN v_status = 'completed' THEN coalesce(onboarding_completed_at, now()) ELSE NULL END,
      updated_at = now()
  WHERE user_id = p_user_id;

  RETURN v_status;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_user_onboarding_status(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_my_questionnaire_answers(
  p_questionnaire_id uuid,
  p_answers jsonb DEFAULT '{}'::jsonb,
  p_submit boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_q public.questionnaire_definitions%ROWTYPE;
  v_private public.user_private_profiles%ROWTYPE;
  v_submission uuid;
  v_status text;
  v_complete boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO v_q
  FROM public.questionnaire_definitions
  WHERE id = p_questionnaire_id AND is_active = true;
  IF v_q.id IS NULL THEN RAISE EXCEPTION 'questionnaire not found'; END IF;

  SELECT * INTO v_private
  FROM public.user_private_profiles
  WHERE user_id = v_uid;
  IF v_private.user_id IS NULL THEN RAISE EXCEPTION 'onboarding profile not found'; END IF;
  IF NOT (v_q.applicable_profile_type = ANY(v_private.intended_profiles)) THEN
    RAISE EXCEPTION 'questionnaire is not applicable to this account';
  END IF;

  v_complete := public.questionnaire_answers_complete(v_q.id, coalesce(p_answers, '{}'::jsonb));
  IF p_submit AND NOT v_complete THEN
    RAISE EXCEPTION 'complete all required questionnaire answers before submitting';
  END IF;
  v_status := CASE WHEN p_submit THEN 'submitted' ELSE 'draft' END;

  SELECT qs.id INTO v_submission
  FROM public.questionnaire_submissions qs
  WHERE qs.user_id = v_uid
    AND qs.questionnaire_id = v_q.id
    AND qs.questionnaire_version = v_q.version
    AND qs.reviewed_at IS NULL
    AND qs.status IN ('draft','submitted','reopened','returned_for_changes','more_information_required')
  ORDER BY qs.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_submission IS NULL THEN
    INSERT INTO public.questionnaire_submissions(
      user_id, profile_type, questionnaire_id, questionnaire_version, status, submitted_at
    ) VALUES(
      v_uid, v_q.applicable_profile_type, v_q.id, v_q.version, v_status,
      CASE WHEN p_submit THEN now() ELSE NULL END
    ) RETURNING id INTO v_submission;
  ELSE
    UPDATE public.questionnaire_submissions
    SET status = v_status,
        submitted_at = CASE WHEN p_submit THEN now() ELSE submitted_at END,
        reviewed_at = NULL,
        reviewer_id = NULL,
        user_visible_reason = CASE WHEN p_submit THEN NULL ELSE user_visible_reason END,
        updated_at = now()
    WHERE id = v_submission;
  END IF;

  INSERT INTO public.questionnaire_answers(
    submission_id, question_id, question_key, answer_value, question_snapshot
  )
  SELECT
    v_submission,
    qq.id,
    qq.question_key,
    coalesce(coalesce(p_answers, '{}'::jsonb)->qq.question_key, 'null'::jsonb),
    jsonb_build_object(
      'question_key', qq.question_key,
      'label', qq.label,
      'description', qq.description,
      'answer_type', qq.answer_type,
      'options', qq.options,
      'required', qq.is_required,
      'sort_order', qq.sort_order,
      'conditional_rules', qq.conditional_rules,
      'validation_rules', qq.validation_rules,
      'questionnaire_key', v_q.questionnaire_key,
      'questionnaire_version', v_q.version
    )
  FROM public.questionnaire_questions qq
  WHERE qq.questionnaire_id = v_q.id AND qq.is_active = true
  ON CONFLICT(submission_id, question_key)
  DO UPDATE SET
    question_id = EXCLUDED.question_id,
    answer_value = EXCLUDED.answer_value,
    question_snapshot = EXCLUDED.question_snapshot,
    updated_at = now();

  PERFORM public.refresh_user_onboarding_status(v_uid);

  RETURN jsonb_build_object(
    'ok', true,
    'submission_id', v_submission,
    'status', v_status,
    'complete', v_complete
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_my_questionnaire_answers(uuid,jsonb,boolean) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.save_my_questionnaire_answers(uuid,jsonb,boolean) FROM anon;

CREATE OR REPLACE FUNCTION public.submit_signup_onboarding(
  p_username text,
  p_country_iso2 text,
  p_country_calling_code text,
  p_date_of_birth date,
  p_intended_profiles text[],
  p_interests text[],
  p_answers jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile text;
  v_rule public.age_eligibility_rules%ROWTYPE;
  v_q public.questionnaire_definitions%ROWTYPE;
  v_profile_answers jsonb;
  v_username text;
  v_min_age integer;
  v_complete boolean;
  v_deferred integer := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text,0));
  IF p_country_iso2 IS NULL OR upper(p_country_iso2)!~'^[A-Z]{2}$' THEN RAISE EXCEPTION 'valid ISO country is required'; END IF;
  IF p_date_of_birth IS NULL OR p_date_of_birth>current_date THEN RAISE EXCEPTION 'valid date of birth is required'; END IF;
  IF p_intended_profiles IS NULL OR cardinality(p_intended_profiles)=0 THEN RAISE EXCEPTION 'at least one intended profile is required'; END IF;

  v_username := public.set_own_username(p_username);

  FOREACH v_profile IN ARRAY p_intended_profiles LOOP
    SELECT * INTO v_rule
    FROM public.age_eligibility_rules
    WHERE profile_type=v_profile AND is_active=true;
    IF v_rule.profile_type IS NOT NULL THEN
      v_min_age := v_rule.minimum_age;
      IF jsonb_typeof(v_rule.country_overrides->upper(p_country_iso2))='number' THEN
        v_min_age := (v_rule.country_overrides->>upper(p_country_iso2))::integer;
      END IF;
      IF public.dright_age_on(p_date_of_birth)<v_min_age THEN
        RAISE EXCEPTION 'minimum age requirement not satisfied for %',v_profile;
      END IF;
    END IF;
  END LOOP;

  INSERT INTO public.user_private_profiles(
    user_id,country_iso2,country_calling_code,date_of_birth,intended_profiles,interests,onboarding_status,onboarding_completed_at
  ) VALUES(
    v_uid,upper(p_country_iso2),p_country_calling_code,p_date_of_birth,p_intended_profiles,coalesce(p_interests,'{}'::text[]),'in_progress',NULL
  )
  ON CONFLICT(user_id) DO UPDATE SET
    country_iso2=EXCLUDED.country_iso2,
    country_calling_code=EXCLUDED.country_calling_code,
    date_of_birth=EXCLUDED.date_of_birth,
    intended_profiles=EXCLUDED.intended_profiles,
    interests=EXCLUDED.interests,
    onboarding_status='in_progress',
    onboarding_completed_at=NULL,
    updated_at=now();

  FOREACH v_profile IN ARRAY p_intended_profiles LOOP
    SELECT * INTO v_q
    FROM public.questionnaire_definitions
    WHERE applicable_profile_type=v_profile AND is_active=true
    ORDER BY version DESC LIMIT 1;
    IF v_q.id IS NULL THEN CONTINUE; END IF;

    v_profile_answers := coalesce(p_answers->v_q.questionnaire_key,'{}'::jsonb);
    v_complete := public.questionnaire_answers_complete(v_q.id, v_profile_answers);
    PERFORM public.save_my_questionnaire_answers(v_q.id, v_profile_answers, v_complete);
    IF NOT v_complete THEN v_deferred := v_deferred + 1; END IF;
  END LOOP;

  PERFORM public.refresh_user_onboarding_status(v_uid);

  RETURN jsonb_build_object(
    'ok',true,
    'username',v_username,
    'onboarding_status',(SELECT onboarding_status FROM public.user_private_profiles WHERE user_id=v_uid),
    'deferred_questionnaires',v_deferred
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_signup_onboarding(text,text,text,date,text[],text[],jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_onboarding_center()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public','auth','pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_private public.user_private_profiles%ROWTYPE;
  v_user public.users%ROWTYPE;
  v_kyc public.kyc_profiles%ROWTYPE;
  v_kyc_required boolean := false;
  v_questionnaires jsonb := '[]'::jsonb;
  v_prof_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO v_private FROM public.user_private_profiles WHERE user_id=v_uid;
  SELECT * INTO v_user FROM public.users WHERE id=v_uid;
  SELECT * INTO v_kyc FROM public.kyc_profiles
    WHERE user_id=v_uid AND is_deleted=false
    ORDER BY updated_at DESC LIMIT 1;

  IF v_private.user_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.kyc_rules kr
      WHERE kr.is_deleted=false
        AND coalesce(kr.is_required,false)=true
        AND kr.user_type = ANY(v_private.intended_profiles)
    ) INTO v_kyc_required;

    WITH active_defs AS (
      SELECT DISTINCT ON (qd.applicable_profile_type)
        qd.id, qd.questionnaire_key, qd.name, qd.description,
        qd.applicable_profile_type, qd.version
      FROM public.questionnaire_definitions qd
      WHERE qd.is_active=true
        AND qd.applicable_profile_type = ANY(v_private.intended_profiles)
      ORDER BY qd.applicable_profile_type, qd.version DESC
    ), current_rows AS (
      SELECT ad.*,
        qs.id AS submission_id,
        qs.status,
        qs.submitted_at,
        qs.user_visible_reason,
        coalesce((
          SELECT jsonb_object_agg(qa.question_key, qa.answer_value)
          FROM public.questionnaire_answers qa
          WHERE qa.submission_id=qs.id
        ),'{}'::jsonb) AS answers
      FROM active_defs ad
      LEFT JOIN LATERAL (
        SELECT s.id,s.status,s.submitted_at,s.user_visible_reason
        FROM public.questionnaire_submissions s
        WHERE s.user_id=v_uid
          AND s.questionnaire_id=ad.id
          AND s.questionnaire_version=ad.version
        ORDER BY s.created_at DESC
        LIMIT 1
      ) qs ON true
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'questionnaire_id',id,
      'questionnaire_key',questionnaire_key,
      'name',name,
      'description',description,
      'profile_type',applicable_profile_type,
      'version',version,
      'submission_id',submission_id,
      'status',coalesce(status,'not_started'),
      'submitted_at',submitted_at,
      'user_visible_reason',user_visible_reason,
      'answers',answers
    ) ORDER BY profile_type),'[]'::jsonb)
    INTO v_questionnaires
    FROM current_rows;
  END IF;

  SELECT count(*) INTO v_prof_count
  FROM public.professional_documents pd
  WHERE pd.user_id=v_uid AND pd.is_deleted=false AND pd.status<>'replaced';

  RETURN jsonb_build_object(
    'private_profile', CASE WHEN v_private.user_id IS NULL THEN NULL ELSE jsonb_build_object(
      'country_iso2',v_private.country_iso2,
      'country_calling_code',v_private.country_calling_code,
      'date_of_birth',v_private.date_of_birth,
      'intended_profiles',v_private.intended_profiles,
      'interests',v_private.interests,
      'onboarding_status',v_private.onboarding_status,
      'onboarding_completed_at',v_private.onboarding_completed_at
    ) END,
    'location',v_user.location,
    'location_verified',coalesce(v_user.location_verified,false),
    'verification_level',coalesce(v_user.verification_level,'unverified'),
    'kyc_required',v_kyc_required,
    'kyc_status',coalesce(v_kyc.status,'not_started'),
    'kyc_level',coalesce(v_kyc.verification_level,v_user.verification_level,'unverified'),
    'kyc_expires_at',v_kyc.expires_at,
    'questionnaires',v_questionnaires,
    'professional_documents_count',v_prof_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_onboarding_center() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_onboarding_center() FROM anon;

-- Draft questionnaires are incomplete for eligibility; submitted/under-review/approved are complete enough to proceed to review gates.
CREATE OR REPLACE FUNCTION public.recalculate_user_eligibility(p_user_id uuid, p_profile_type text, p_action_key text DEFAULT 'general'::text)
RETURNS public.user_eligibility
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth','pg_temp'
AS $$
DECLARE
  v_private public.user_private_profiles%ROWTYPE;
  v_user public.users%ROWTYPE;
  v_age_rule public.age_eligibility_rules%ROWTYPE;
  v_kyc_rule public.kyc_rules%ROWTYPE;
  v_kyc public.kyc_profiles%ROWTYPE;
  v_reasons jsonb:='[]'::jsonb;
  v_ok boolean:=true;
  v_more boolean:=false;
  v_status text;
  v_q_status text;
  v_email_verified boolean:=false;
  v_row public.user_eligibility%ROWTYPE;
  v_min_age integer;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id AND NOT public.has_dright_permission('eligibility','recalculate') THEN RAISE EXCEPTION 'permission denied'; END IF;
  SELECT * INTO v_user FROM public.users WHERE id=p_user_id;
  IF v_user.id IS NULL THEN RAISE EXCEPTION 'user not found'; END IF;
  SELECT * INTO v_private FROM public.user_private_profiles WHERE user_id=p_user_id;
  SELECT * INTO v_age_rule FROM public.age_eligibility_rules WHERE profile_type=p_profile_type AND is_active=true;
  SELECT * INTO v_kyc_rule FROM public.kyc_rules WHERE user_type=p_profile_type AND is_deleted=false LIMIT 1;
  SELECT * INTO v_kyc FROM public.kyc_profiles WHERE user_id=p_user_id AND is_deleted=false AND (user_type=p_profile_type OR p_profile_type=ANY(applicable_profile_types)) ORDER BY updated_at DESC LIMIT 1;
  SELECT qs.status INTO v_q_status FROM public.questionnaire_submissions qs WHERE qs.user_id=p_user_id AND qs.profile_type=p_profile_type ORDER BY qs.created_at DESC LIMIT 1;
  SELECT(email_confirmed_at IS NOT NULL) INTO v_email_verified FROM auth.users WHERE id=p_user_id;

  IF v_private.date_of_birth IS NULL THEN
    v_ok:=false;v_more:=true;v_reasons:=v_reasons||jsonb_build_array(jsonb_build_object('key','age','ok',false,'message','Date of birth is required'));
  ELSE
    v_min_age:=coalesce(v_age_rule.minimum_age,0);
    IF v_age_rule.profile_type IS NOT NULL AND jsonb_typeof(v_age_rule.country_overrides->v_private.country_iso2)='number' THEN v_min_age:=(v_age_rule.country_overrides->>v_private.country_iso2)::integer;END IF;
    IF public.dright_age_on(v_private.date_of_birth)<v_min_age THEN
      v_ok:=false;v_reasons:=v_reasons||jsonb_build_array(jsonb_build_object('key','age','ok',false,'message','Minimum age requirement is not satisfied'));
    ELSE
      v_reasons:=v_reasons||jsonb_build_array(jsonb_build_object('key','age','ok',true,'message','Minimum age satisfied'));
    END IF;
  END IF;

  IF v_q_status IS NULL OR v_q_status NOT IN('submitted','under_review','approved') THEN
    v_ok:=false;v_more:=true;
    v_reasons:=v_reasons||jsonb_build_array(jsonb_build_object('key','questionnaire','ok',false,'message','Required questionnaire is incomplete or needs changes','status',coalesce(v_q_status,'not_started')));
  ELSE
    v_reasons:=v_reasons||jsonb_build_array(jsonb_build_object('key','questionnaire','ok',true,'message','Questionnaire completed','status',v_q_status));
  END IF;

  IF coalesce(v_kyc_rule.is_required,false) THEN
    IF v_kyc.status='approved' AND (v_kyc.expires_at IS NULL OR v_kyc.expires_at>now()) THEN
      v_reasons:=v_reasons||jsonb_build_array(jsonb_build_object('key','kyc','ok',true,'message','KYC verified'));
    ELSE
      v_ok:=false;v_more:=true;v_reasons:=v_reasons||jsonb_build_array(jsonb_build_object('key','kyc','ok',false,'message','Required KYC is not verified','status',coalesce(v_kyc.status,'not_started')));
    END IF;
  ELSE
    v_reasons:=v_reasons||jsonb_build_array(jsonb_build_object('key','kyc','ok',true,'message','KYC not required for this profile action'));
  END IF;

  IF NOT v_email_verified THEN
    v_ok:=false;v_more:=true;v_reasons:=v_reasons||jsonb_build_array(jsonb_build_object('key','email','ok',false,'message','Email verification required'));
  ELSE
    v_reasons:=v_reasons||jsonb_build_array(jsonb_build_object('key','email','ok',true,'message','Email verified'));
  END IF;

  IF v_user.account_status<>'ACTIVE' THEN
    v_ok:=false;v_reasons:=v_reasons||jsonb_build_array(jsonb_build_object('key','account','ok',false,'message','Account has an active restriction','status',v_user.account_status));
  ELSE
    v_reasons:=v_reasons||jsonb_build_array(jsonb_build_object('key','account','ok',true,'message','No blocking account restriction'));
  END IF;

  v_status:=CASE WHEN v_ok THEN 'eligible' WHEN v_more THEN 'more_information_required' ELSE 'ineligible' END;
  INSERT INTO public.user_eligibility(user_id,profile_type,action_key,status,reasons,calculated_at,calculated_by)
  VALUES(p_user_id,p_profile_type,coalesce(nullif(p_action_key,''),'general'),v_status,v_reasons,now(),'rules')
  ON CONFLICT(user_id,profile_type,action_key)
  DO UPDATE SET status=EXCLUDED.status,reasons=EXCLUDED.reasons,calculated_at=now(),calculated_by='rules'
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;
