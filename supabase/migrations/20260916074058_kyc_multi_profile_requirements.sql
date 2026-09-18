/* One DRIGHT identity may have many capabilities. Keep one normalized KYC profile and evaluate the union of applicable rules. */
ALTER TABLE public.kyc_profiles ADD COLUMN IF NOT EXISTS applicable_profile_types text[] NOT NULL DEFAULT '{}'::text[];
UPDATE public.kyc_profiles SET applicable_profile_types=ARRAY[user_type] WHERE cardinality(applicable_profile_types)=0;
CREATE OR REPLACE FUNCTION public.required_kyc_documents_for_user(p_user_id uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$
  SELECT coalesce(array_agg(DISTINCT doc ORDER BY doc),'{}'::text[])
  FROM public.user_private_profiles upp
  JOIN public.kyc_rules r ON r.user_type=ANY(upp.intended_profiles) AND r.is_deleted=false AND r.is_required=true
  CROSS JOIN LATERAL unnest(r.required_document_types) doc
  WHERE upp.user_id=p_user_id;
$$;
REVOKE ALL ON FUNCTION public.required_kyc_documents_for_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.required_kyc_documents_for_user(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.recalculate_kyc_submission(p_submission_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_submission public.kyc_submissions%ROWTYPE;v_required text[];v_missing integer:=0;v_problem integer:=0;v_new text;
BEGIN
  SELECT * INTO v_submission FROM public.kyc_submissions WHERE id=p_submission_id FOR UPDATE;
  IF v_submission.id IS NULL THEN RAISE EXCEPTION 'submission not found'; END IF;
  v_required:=public.required_kyc_documents_for_user(v_submission.user_id);
  IF cardinality(v_required)=0 THEN RETURN v_submission.status; END IF;
  SELECT count(*) INTO v_missing FROM unnest(v_required) req
  WHERE NOT EXISTS (SELECT 1 FROM public.kyc_documents d WHERE d.submission_id=p_submission_id AND d.doc_type=req AND d.is_deleted=false AND d.status='verified' AND (d.expires_at IS NULL OR d.expires_at>now()));
  SELECT count(*) INTO v_problem FROM public.kyc_documents d WHERE d.submission_id=p_submission_id AND d.doc_type=ANY(v_required) AND d.is_deleted=false AND d.status IN ('rejected','needs_resubmission','unreadable','expired','suspected_fraud');
  IF v_problem>0 THEN v_new:='more_info_required'; ELSIF v_missing=0 THEN v_new:='approved'; ELSE v_new:='under_review'; END IF;
  UPDATE public.kyc_submissions SET status=v_new,updated_at=now(),reviewed_at=CASE WHEN v_new='approved' THEN now() ELSE reviewed_at END WHERE id=p_submission_id;
  RETURN v_new;
END;
$$;
REVOKE ALL ON FUNCTION public.recalculate_kyc_submission(uuid) FROM PUBLIC;
CREATE OR REPLACE FUNCTION public.create_kyc_profile_for_current_user(p_primary_type text,p_profile_types text[] DEFAULT NULL)
RETURNS public.kyc_profiles LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_uid uuid:=auth.uid();v_row public.kyc_profiles%ROWTYPE;v_types text[];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  v_types:=coalesce(p_profile_types,(SELECT intended_profiles FROM public.user_private_profiles WHERE user_id=v_uid),ARRAY[p_primary_type]);
  INSERT INTO public.kyc_profiles(user_id,user_type,status,applicable_profile_types,created_by,updated_by)
  VALUES(v_uid,p_primary_type,'pending_submission',v_types,v_uid,v_uid)
  ON CONFLICT(user_id) DO UPDATE SET applicable_profile_types=EXCLUDED.applicable_profile_types,updated_by=v_uid,updated_at=now()
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.create_kyc_profile_for_current_user(text,text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_kyc_profile_for_current_user(text,text[]) TO authenticated;