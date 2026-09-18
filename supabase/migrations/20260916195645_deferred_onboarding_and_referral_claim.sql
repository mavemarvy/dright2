-- Allow onboarding questionnaires/KYC documents to be deferred while keeping eligibility gates authoritative.

CREATE UNIQUE INDEX IF NOT EXISTS referral_relationships_unique_chain
  ON public.referral_relationships(referrer_id, referred_id, level);

CREATE OR REPLACE FUNCTION public.questionnaire_answers_complete(
  p_questionnaire_id uuid,
  p_answers jsonb DEFAULT '{}'::jsonb
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  q public.questionnaire_questions%ROWTYPE;
  v_actual jsonb;
  v_expected jsonb;
  v_visible boolean;
BEGIN
  FOR q IN
    SELECT * FROM public.questionnaire_questions
    WHERE questionnaire_id=p_questionnaire_id AND is_active=true
    ORDER BY sort_order
  LOOP
    v_visible:=true;
    IF coalesce(q.conditional_rules,'{}'::jsonb) ? 'question_key' THEN
      v_actual:=coalesce(p_answers,'{}'::jsonb)->(q.conditional_rules->>'question_key');
      v_expected:=q.conditional_rules->'equals';
      v_visible := v_actual IS NOT DISTINCT FROM v_expected;
    END IF;
    IF v_visible AND q.is_required THEN
      v_actual:=coalesce(p_answers,'{}'::jsonb)->q.question_key;
      IF v_actual IS NULL OR v_actual='null'::jsonb OR v_actual='""'::jsonb OR v_actual='[]'::jsonb THEN
        RETURN false;
      END IF;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.questionnaire_answers_complete(uuid,jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.save_my_questionnaire(
  p_profile_type text,
  p_answers jsonb DEFAULT '{}'::jsonb,
  p_submit boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_uid uuid:=auth.uid();
  v_private public.user_private_profiles%ROWTYPE;
  v_q public.questionnaire_definitions%ROWTYPE;
  v_submission uuid;
  v_complete boolean;
  v_status text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT * INTO v_private FROM public.user_private_profiles WHERE user_id=v_uid;
  IF v_private.user_id IS NULL THEN RAISE EXCEPTION 'onboarding profile is not initialized'; END IF;
  IF NOT (p_profile_type = ANY(coalesce(v_private.intended_profiles,'{}'::text[]))) THEN
    RAISE EXCEPTION 'profile type is not enabled for this account';
  END IF;

  SELECT * INTO v_q FROM public.questionnaire_definitions
  WHERE applicable_profile_type=p_profile_type AND is_active=true
  ORDER BY version DESC LIMIT 1;
  IF v_q.id IS NULL THEN RETURN jsonb_build_object('ok',true,'required',false); END IF;

  v_complete:=public.questionnaire_answers_complete(v_q.id,coalesce(p_answers,'{}'::jsonb));
  IF p_submit AND NOT v_complete THEN RAISE EXCEPTION 'complete all required questionnaire answers before submitting'; END IF;
  v_status:=CASE WHEN p_submit THEN 'submitted' ELSE 'draft' END;

  SELECT id INTO v_submission
  FROM public.questionnaire_submissions
  WHERE user_id=v_uid AND profile_type=p_profile_type AND questionnaire_id=v_q.id
    AND status IN('draft','submitted','reopened','returned_for_changes','more_information_required')
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

  IF v_submission IS NULL THEN
    INSERT INTO public.questionnaire_submissions(user_id,profile_type,questionnaire_id,questionnaire_version,status,submitted_at)
    VALUES(v_uid,p_profile_type,v_q.id,v_q.version,v_status,CASE WHEN p_submit THEN now() ELSE NULL END)
    RETURNING id INTO v_submission;
  ELSE
    UPDATE public.questionnaire_submissions
    SET status=v_status,
        submitted_at=CASE WHEN p_submit THEN now() ELSE submitted_at END,
        reviewer_id=CASE WHEN p_submit THEN NULL ELSE reviewer_id END,
        reviewed_at=CASE WHEN p_submit THEN NULL ELSE reviewed_at END,
        updated_at=now()
    WHERE id=v_submission;
  END IF;

  INSERT INTO public.questionnaire_answers(submission_id,question_id,question_key,answer_value,question_snapshot)
  SELECT v_submission,qq.id,qq.question_key,coalesce(p_answers->qq.question_key,'null'::jsonb),
    jsonb_build_object('question_key',qq.question_key,'label',qq.label,'description',qq.description,'answer_type',qq.answer_type,
      'options',qq.options,'required',qq.is_required,'sort_order',qq.sort_order,'conditional_rules',qq.conditional_rules,
      'validation_rules',qq.validation_rules,'questionnaire_key',v_q.questionnaire_key,'questionnaire_version',v_q.version)
  FROM public.questionnaire_questions qq
  WHERE qq.questionnaire_id=v_q.id AND qq.is_active=true
  ON CONFLICT(submission_id,question_key) DO UPDATE
    SET question_id=EXCLUDED.question_id,answer_value=EXCLUDED.answer_value,question_snapshot=EXCLUDED.question_snapshot,updated_at=now();

  IF p_submit THEN
    BEGIN
      PERFORM public.recalculate_user_eligibility(v_uid,p_profile_type,'general');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN jsonb_build_object('ok',true,'required',true,'submission_id',v_submission,'status',v_status,'complete',v_complete);
END;
$$;

REVOKE ALL ON FUNCTION public.save_my_questionnaire(text,jsonb,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_my_questionnaire(text,jsonb,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_questionnaire_answers(p_submission_id uuid)
RETURNS TABLE(question_key text, answer_value jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
  SELECT qa.question_key,qa.answer_value
  FROM public.questionnaire_answers qa
  JOIN public.questionnaire_submissions qs ON qs.id=qa.submission_id
  WHERE qs.id=p_submission_id AND qs.user_id=auth.uid()
  ORDER BY qa.created_at,qa.question_key;
$$;
REVOKE ALL ON FUNCTION public.get_my_questionnaire_answers(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_questionnaire_answers(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_signup_onboarding(
  p_username text,
  p_country_iso2 text,
  p_country_calling_code text,
  p_date_of_birth date,
  p_intended_profiles text[],
  p_interests text[],
  p_answers jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_uid uuid:=auth.uid();
  v_profile text;
  v_rule public.age_eligibility_rules%ROWTYPE;
  v_q public.questionnaire_definitions%ROWTYPE;
  v_profile_answers jsonb;
  v_username text;
  v_min_age integer;
  v_complete boolean;
  v_all_complete boolean:=true;
  v_deferred text[]:='{}'::text[];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text,0));
  IF p_country_iso2 IS NULL OR upper(p_country_iso2)!~'^[A-Z]{2}$' THEN RAISE EXCEPTION 'valid ISO country is required'; END IF;
  IF p_date_of_birth IS NULL OR p_date_of_birth>current_date THEN RAISE EXCEPTION 'valid date of birth is required'; END IF;
  IF p_intended_profiles IS NULL OR cardinality(p_intended_profiles)=0 THEN RAISE EXCEPTION 'at least one intended profile is required'; END IF;

  v_username:=public.set_own_username(p_username);
  FOREACH v_profile IN ARRAY p_intended_profiles LOOP
    SELECT * INTO v_rule FROM public.age_eligibility_rules WHERE profile_type=v_profile AND is_active=true;
    IF v_rule.profile_type IS NOT NULL THEN
      v_min_age:=v_rule.minimum_age;
      IF jsonb_typeof(v_rule.country_overrides->upper(p_country_iso2))='number' THEN
        v_min_age:=(v_rule.country_overrides->>upper(p_country_iso2))::integer;
      END IF;
      IF public.dright_age_on(p_date_of_birth)<v_min_age THEN RAISE EXCEPTION 'minimum age requirement not satisfied for %',v_profile; END IF;
    END IF;
  END LOOP;

  INSERT INTO public.user_private_profiles(user_id,country_iso2,country_calling_code,date_of_birth,intended_profiles,interests,onboarding_status,onboarding_completed_at)
  VALUES(v_uid,upper(p_country_iso2),p_country_calling_code,p_date_of_birth,p_intended_profiles,coalesce(p_interests,'{}'::text[]),'in_progress',NULL)
  ON CONFLICT(user_id) DO UPDATE SET
    country_iso2=EXCLUDED.country_iso2,country_calling_code=EXCLUDED.country_calling_code,date_of_birth=EXCLUDED.date_of_birth,
    intended_profiles=EXCLUDED.intended_profiles,interests=EXCLUDED.interests,onboarding_status='in_progress',onboarding_completed_at=NULL,updated_at=now();

  FOREACH v_profile IN ARRAY p_intended_profiles LOOP
    SELECT * INTO v_q FROM public.questionnaire_definitions
    WHERE applicable_profile_type=v_profile AND is_active=true ORDER BY version DESC LIMIT 1;
    IF v_q.id IS NULL THEN CONTINUE; END IF;
    v_profile_answers:=coalesce(p_answers->v_q.questionnaire_key,'{}'::jsonb);
    v_complete:=public.questionnaire_answers_complete(v_q.id,v_profile_answers);
    PERFORM public.save_my_questionnaire(v_profile,v_profile_answers,v_complete);
    IF NOT v_complete THEN
      v_all_complete:=false;
      v_deferred:=array_append(v_deferred,v_q.questionnaire_key);
    END IF;
  END LOOP;

  UPDATE public.user_private_profiles
  SET onboarding_status=CASE WHEN v_all_complete THEN 'submitted' ELSE 'in_progress' END,
      onboarding_completed_at=CASE WHEN v_all_complete THEN now() ELSE NULL END,
      updated_at=now()
  WHERE user_id=v_uid;

  RETURN jsonb_build_object('ok',true,'username',v_username,
    'onboarding_status',CASE WHEN v_all_complete THEN 'submitted' ELSE 'in_progress' END,
    'deferred_questionnaires',to_jsonb(v_deferred));
END;
$$;

REVOKE ALL ON FUNCTION public.submit_signup_onboarding(text,text,text,date,text[],text[],jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_signup_onboarding(text,text,text,date,text[],text[],jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_onboarding_checklist()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_uid uuid:=auth.uid();
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT jsonb_build_object(
    'location',u.location,
    'location_verified',coalesce(u.location_verified,false),
    'verification_level',coalesce(u.verification_level,'unverified'),
    'country_iso2',upp.country_iso2,
    'intended_profiles',coalesce(to_jsonb(upp.intended_profiles),'["buyer"]'::jsonb),
    'onboarding_status',coalesce(upp.onboarding_status,'in_progress'),
    'kyc_status',coalesce((SELECT kp.status FROM public.kyc_profiles kp WHERE kp.user_id=v_uid AND kp.is_deleted=false ORDER BY kp.updated_at DESC LIMIT 1),'not_started'),
    'kyc_expires_at',(SELECT kp.expires_at FROM public.kyc_profiles kp WHERE kp.user_id=v_uid AND kp.is_deleted=false ORDER BY kp.updated_at DESC LIMIT 1),
    'professional_documents_count',(SELECT count(*) FROM public.professional_documents pd WHERE pd.user_id=v_uid AND pd.is_deleted=false),
    'questionnaires',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'questionnaire_id',qd.id,'questionnaire_key',qd.questionnaire_key,'name',qd.name,'profile_type',qd.applicable_profile_type,
        'version',qd.version,'submission_id',latest.id,'status',coalesce(latest.status,'not_started'),'submitted_at',latest.submitted_at,
        'user_visible_reason',latest.user_visible_reason
      ) ORDER BY qd.applicable_profile_type,qd.name)
      FROM public.questionnaire_definitions qd
      LEFT JOIN LATERAL (
        SELECT qs.id,qs.status,qs.submitted_at,qs.user_visible_reason
        FROM public.questionnaire_submissions qs
        WHERE qs.user_id=v_uid AND qs.questionnaire_id=qd.id
        ORDER BY qs.created_at DESC LIMIT 1
      ) latest ON true
      WHERE qd.is_active=true AND qd.applicable_profile_type=ANY(coalesce(upp.intended_profiles,ARRAY['buyer']::text[]))
    ),'[]'::jsonb)
  ) INTO v_result
  FROM public.users u
  LEFT JOIN public.user_private_profiles upp ON upp.user_id=u.id
  WHERE u.id=v_uid;
  RETURN coalesce(v_result,'{}'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_onboarding_checklist() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_onboarding_checklist() TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_signup_referral()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth','pg_temp'
AS $$
DECLARE
  v_uid uuid:=auth.uid();
  v_code text;
  v_referrer uuid;
  v_existing uuid;
  v_link_id uuid;
  v_parent2 uuid;
  v_parent3 uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT nullif(btrim(raw_user_meta_data->>'signup_referral_code'),'') INTO v_code FROM auth.users WHERE id=v_uid;
  IF v_code IS NULL THEN RETURN jsonb_build_object('ok',true,'claimed',false,'reason','no_referral_code'); END IF;

  SELECT rtl.owner_id,rtl.link_id INTO v_referrer,v_link_id
  FROM public.resolve_tracking_link(v_code,NULL) rtl LIMIT 1;
  IF v_referrer IS NULL THEN
    SELECT id INTO v_referrer FROM public.users WHERE referral_code=v_code LIMIT 1;
  END IF;
  IF v_referrer IS NULL THEN RETURN jsonb_build_object('ok',true,'claimed',false,'reason','referral_not_found'); END IF;
  IF v_referrer=v_uid THEN RETURN jsonb_build_object('ok',true,'claimed',false,'reason','self_referral_ignored'); END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text||':referral',0));
  SELECT referred_by INTO v_existing FROM public.users WHERE id=v_uid FOR UPDATE;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok',true,'claimed',v_existing=v_referrer,'already_claimed',true,'referrer_id',v_existing);
  END IF;

  UPDATE public.users SET referred_by=v_referrer WHERE id=v_uid;
  INSERT INTO public.referrals(referrer_id,referred_user_id,referral_code,is_successful)
  VALUES(v_referrer,v_uid,v_code,true)
  ON CONFLICT(referred_user_id) DO NOTHING;

  INSERT INTO public.referral_relationships(referrer_id,referred_id,level)
  VALUES(v_referrer,v_uid,1) ON CONFLICT(referrer_id,referred_id,level) DO NOTHING;

  SELECT referred_by INTO v_parent2 FROM public.users WHERE id=v_referrer;
  IF v_parent2 IS NOT NULL AND v_parent2<>v_uid AND v_parent2<>v_referrer THEN
    INSERT INTO public.referral_relationships(referrer_id,referred_id,level)
    VALUES(v_parent2,v_uid,2) ON CONFLICT(referrer_id,referred_id,level) DO NOTHING;
    SELECT referred_by INTO v_parent3 FROM public.users WHERE id=v_parent2;
    IF v_parent3 IS NOT NULL AND v_parent3<>v_uid AND v_parent3<>v_referrer AND v_parent3<>v_parent2 THEN
      INSERT INTO public.referral_relationships(referrer_id,referred_id,level)
      VALUES(v_parent3,v_uid,3) ON CONFLICT(referrer_id,referred_id,level) DO NOTHING;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok',true,'claimed',true,'referrer_id',v_referrer,'tracking_link_id',v_link_id);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_signup_referral() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_signup_referral() TO authenticated;