/* Final authority/privacy layer for signup, questionnaires, KYC, professional docs, achievements and Admin Users. */

CREATE OR REPLACE FUNCTION public.has_dright_permission(p_module text,p_action text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user public.users%ROWTYPE;v_override boolean;v_has_override boolean:=false;v_role_id uuid;
BEGIN
 SELECT * INTO v_user FROM public.users WHERE id=auth.uid();
 IF v_user.id IS NULL OR v_user.is_admin IS DISTINCT FROM true OR v_user.admin_status IS DISTINCT FROM 'active' THEN RETURN false; END IF;
 IF v_user.admin_role='super_admin' THEN RETURN true; END IF;
 SELECT ap.is_granted,true INTO v_override,v_has_override FROM public.admin_permissions ap JOIN public.permissions p ON p.id=ap.permission_id WHERE ap.admin_id=auth.uid() AND p.module=p_module AND p.action=p_action AND p.is_active=true AND p.is_deleted=false LIMIT 1;
 IF v_has_override THEN RETURN coalesce(v_override,false); END IF;
 v_role_id:=v_user.rbac_role_id;
 IF v_role_id IS NULL AND v_user.admin_role IS NOT NULL THEN SELECT id INTO v_role_id FROM public.roles WHERE slug=v_user.admin_role AND is_deleted=false AND is_archived=false LIMIT 1; END IF;
 RETURN EXISTS(SELECT 1 FROM public.role_permissions rp JOIN public.permissions p ON p.id=rp.permission_id WHERE rp.role_id=v_role_id AND p.module=p_module AND p.action=p_action AND p.is_active=true AND p.is_deleted=false);
END;$$;
REVOKE ALL ON FUNCTION public.has_dright_permission(text,text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.has_dright_permission(text,text) TO authenticated;

/* Secure resumable signup draft. No direct table policies: the raw token is the one-time capability. */
CREATE TABLE IF NOT EXISTS public.pending_signup_onboarding(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),token_hash text NOT NULL UNIQUE,email_normalized text NOT NULL,username text NOT NULL,country_iso2 text NOT NULL,country_calling_code text,date_of_birth date NOT NULL,intended_profiles text[] NOT NULL,interests text[] NOT NULL DEFAULT '{}'::text[],answers jsonb NOT NULL DEFAULT '{}'::jsonb,expires_at timestamptz NOT NULL DEFAULT(now()+interval '24 hours'),claimed_by uuid REFERENCES public.users(id),claimed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),CHECK(country_iso2 ~ '^[A-Z]{2}$'),CHECK(cardinality(intended_profiles)>0)
);
CREATE INDEX IF NOT EXISTS idx_pending_signup_expiry ON public.pending_signup_onboarding(expires_at) WHERE claimed_at IS NULL;
ALTER TABLE public.pending_signup_onboarding ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.save_signup_onboarding_draft(p_token text,p_email text,p_username text,p_country_iso2 text,p_country_calling_code text,p_date_of_birth date,p_intended_profiles text[],p_interests text[],p_answers jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE v_hash text;v_email text:=lower(trim(coalesce(p_email,'')));
BEGIN
 IF length(coalesce(p_token,''))<40 THEN RAISE EXCEPTION 'invalid onboarding token'; END IF;
 IF v_email='' OR position('@' in v_email)<2 THEN RAISE EXCEPTION 'valid email required'; END IF;
 IF p_country_iso2 IS NULL OR upper(p_country_iso2)!~'^[A-Z]{2}$' THEN RAISE EXCEPTION 'valid country required'; END IF;
 IF p_date_of_birth IS NULL OR p_date_of_birth>current_date THEN RAISE EXCEPTION 'valid date of birth required'; END IF;
 IF p_intended_profiles IS NULL OR cardinality(p_intended_profiles)=0 THEN RAISE EXCEPTION 'at least one intended profile required'; END IF;
 v_hash:=encode(extensions.digest(p_token,'sha256'),'hex');
 DELETE FROM public.pending_signup_onboarding WHERE claimed_at IS NULL AND expires_at<now()-interval '7 days';
 INSERT INTO public.pending_signup_onboarding(token_hash,email_normalized,username,country_iso2,country_calling_code,date_of_birth,intended_profiles,interests,answers,expires_at)
 VALUES(v_hash,v_email,p_username,upper(p_country_iso2),p_country_calling_code,p_date_of_birth,p_intended_profiles,coalesce(p_interests,'{}'::text[]),coalesce(p_answers,'{}'::jsonb),now()+interval '24 hours')
 ON CONFLICT(token_hash) DO UPDATE SET email_normalized=EXCLUDED.email_normalized,username=EXCLUDED.username,country_iso2=EXCLUDED.country_iso2,country_calling_code=EXCLUDED.country_calling_code,date_of_birth=EXCLUDED.date_of_birth,intended_profiles=EXCLUDED.intended_profiles,interests=EXCLUDED.interests,answers=EXCLUDED.answers,expires_at=EXCLUDED.expires_at,updated_at=now() WHERE public.pending_signup_onboarding.claimed_at IS NULL;
 RETURN jsonb_build_object('ok',true,'expires_at',now()+interval '24 hours');
END;$$;
REVOKE ALL ON FUNCTION public.save_signup_onboarding_draft(text,text,text,text,text,date,text[],text[],jsonb) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.save_signup_onboarding_draft(text,text,text,text,text,date,text[],text[],jsonb) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.submit_signup_onboarding(p_username text,p_country_iso2 text,p_country_calling_code text,p_date_of_birth date,p_intended_profiles text[],p_interests text[],p_answers jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_uid uuid:=auth.uid();v_profile text;v_rule public.age_eligibility_rules%ROWTYPE;v_q public.questionnaire_definitions%ROWTYPE;v_question public.questionnaire_questions%ROWTYPE;v_submission uuid;v_profile_answers jsonb;v_answer jsonb;v_username text;v_min_age integer;
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
     IF jsonb_typeof(v_rule.country_overrides->upper(p_country_iso2))='number' THEN v_min_age:=(v_rule.country_overrides->>upper(p_country_iso2))::integer; END IF;
     IF public.dright_age_on(p_date_of_birth)<v_min_age THEN RAISE EXCEPTION 'minimum age requirement not satisfied for %',v_profile; END IF;
   END IF;
 END LOOP;
 INSERT INTO public.user_private_profiles(user_id,country_iso2,country_calling_code,date_of_birth,intended_profiles,interests,onboarding_status,onboarding_completed_at)
 VALUES(v_uid,upper(p_country_iso2),p_country_calling_code,p_date_of_birth,p_intended_profiles,coalesce(p_interests,'{}'::text[]),'submitted',now())
 ON CONFLICT(user_id) DO UPDATE SET country_iso2=EXCLUDED.country_iso2,country_calling_code=EXCLUDED.country_calling_code,date_of_birth=EXCLUDED.date_of_birth,intended_profiles=EXCLUDED.intended_profiles,interests=EXCLUDED.interests,onboarding_status='submitted',onboarding_completed_at=now(),updated_at=now();
 FOREACH v_profile IN ARRAY p_intended_profiles LOOP
   SELECT * INTO v_q FROM public.questionnaire_definitions WHERE applicable_profile_type=v_profile AND is_active=true ORDER BY version DESC LIMIT 1;
   IF v_q.id IS NULL THEN CONTINUE; END IF;
   v_profile_answers:=coalesce(p_answers->v_q.questionnaire_key,'{}'::jsonb);
   FOR v_question IN SELECT * FROM public.questionnaire_questions WHERE questionnaire_id=v_q.id AND is_active=true ORDER BY sort_order LOOP
     v_answer:=v_profile_answers->v_question.question_key;
     IF v_question.is_required AND (v_answer IS NULL OR v_answer='null'::jsonb OR v_answer='""'::jsonb OR v_answer='[]'::jsonb) THEN RAISE EXCEPTION 'required questionnaire answer missing: %',v_question.question_key; END IF;
   END LOOP;
   SELECT id INTO v_submission FROM public.questionnaire_submissions WHERE user_id=v_uid AND profile_type=v_profile AND questionnaire_id=v_q.id AND questionnaire_version=v_q.version AND reviewed_at IS NULL AND status IN('draft','submitted') ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
   IF v_submission IS NULL THEN
     INSERT INTO public.questionnaire_submissions(user_id,profile_type,questionnaire_id,questionnaire_version,status,submitted_at) VALUES(v_uid,v_profile,v_q.id,v_q.version,'submitted',now()) RETURNING id INTO v_submission;
   ELSE
     UPDATE public.questionnaire_submissions SET status='submitted',submitted_at=now(),updated_at=now() WHERE id=v_submission;
   END IF;
   INSERT INTO public.questionnaire_answers(submission_id,question_id,question_key,answer_value,question_snapshot)
   SELECT v_submission,qq.id,qq.question_key,coalesce(v_profile_answers->qq.question_key,'null'::jsonb),jsonb_build_object('question_key',qq.question_key,'label',qq.label,'description',qq.description,'answer_type',qq.answer_type,'options',qq.options,'required',qq.is_required,'sort_order',qq.sort_order,'conditional_rules',qq.conditional_rules,'validation_rules',qq.validation_rules,'questionnaire_key',v_q.questionnaire_key,'questionnaire_version',v_q.version)
   FROM public.questionnaire_questions qq WHERE qq.questionnaire_id=v_q.id AND qq.is_active=true
   ON CONFLICT(submission_id,question_key) DO UPDATE SET question_id=EXCLUDED.question_id,answer_value=EXCLUDED.answer_value,question_snapshot=EXCLUDED.question_snapshot,updated_at=now();
   v_submission:=NULL;
 END LOOP;
 RETURN jsonb_build_object('ok',true,'username',v_username,'onboarding_status','submitted');
END;$$;
REVOKE ALL ON FUNCTION public.submit_signup_onboarding(text,text,text,date,text[],text[],jsonb) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.submit_signup_onboarding(text,text,text,date,text[],text[],jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_signup_onboarding(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,extensions,pg_temp AS $$
DECLARE v_uid uuid:=auth.uid();v_hash text;v_email text;v_draft public.pending_signup_onboarding%ROWTYPE;v_result jsonb;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
 v_hash:=encode(extensions.digest(p_token,'sha256'),'hex');
 SELECT lower(email) INTO v_email FROM auth.users WHERE id=v_uid;
 SELECT * INTO v_draft FROM public.pending_signup_onboarding WHERE token_hash=v_hash AND email_normalized=v_email FOR UPDATE;
 IF v_draft.id IS NULL THEN RAISE EXCEPTION 'pending onboarding was not found for this account'; END IF;
 IF v_draft.claimed_at IS NOT NULL THEN
   IF v_draft.claimed_by=v_uid THEN RETURN jsonb_build_object('ok',true,'already_claimed',true); END IF;
   RAISE EXCEPTION 'pending onboarding already claimed';
 END IF;
 IF v_draft.expires_at<=now() THEN RAISE EXCEPTION 'pending onboarding expired'; END IF;
 v_result:=public.submit_signup_onboarding(v_draft.username,v_draft.country_iso2,v_draft.country_calling_code,v_draft.date_of_birth,v_draft.intended_profiles,v_draft.interests,v_draft.answers);
 UPDATE public.pending_signup_onboarding SET claimed_by=v_uid,claimed_at=now(),updated_at=now() WHERE id=v_draft.id;
 RETURN v_result||jsonb_build_object('claimed',true);
END;$$;
REVOKE ALL ON FUNCTION public.claim_signup_onboarding(text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.claim_signup_onboarding(text) TO authenticated;

DROP POLICY IF EXISTS user_private_profiles_own_insert ON public.user_private_profiles;
DROP POLICY IF EXISTS user_private_profiles_own_update ON public.user_private_profiles;

CREATE OR REPLACE FUNCTION public.review_questionnaire_submission(p_submission_id uuid,p_action text,p_user_visible_reason text DEFAULT NULL,p_internal_note text DEFAULT NULL)
RETURNS public.questionnaire_submissions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_old text;v_new text;v_row public.questionnaire_submissions%ROWTYPE;
BEGIN
 IF NOT public.has_dright_permission('questionnaires','review') THEN RAISE EXCEPTION 'permission denied'; END IF;
 IF p_action NOT IN('under_review','approved','more_information_required','returned_for_changes','rejected','reopened') THEN RAISE EXCEPTION 'invalid review action'; END IF;
 IF p_action IN('more_information_required','returned_for_changes','rejected') AND nullif(trim(coalesce(p_user_visible_reason,'')),'') IS NULL THEN RAISE EXCEPTION 'user-visible reason is required'; END IF;
 SELECT status INTO v_old FROM public.questionnaire_submissions WHERE id=p_submission_id FOR UPDATE; IF v_old IS NULL THEN RAISE EXCEPTION 'submission not found'; END IF; v_new:=p_action;
 UPDATE public.questionnaire_submissions SET status=v_new,reviewer_id=auth.uid(),reviewed_at=now(),user_visible_reason=p_user_visible_reason,internal_notes=p_internal_note,updated_at=now() WHERE id=p_submission_id RETURNING * INTO v_row;
 INSERT INTO public.questionnaire_review_events(submission_id,reviewer_id,action,previous_status,new_status,user_visible_reason,internal_note) VALUES(p_submission_id,auth.uid(),p_action,v_old,v_new,p_user_visible_reason,p_internal_note);
 INSERT INTO public.admin_activity_logs(admin_id,action,resource_type,resource_id,details) VALUES(auth.uid(),'questionnaire_'||p_action,'questionnaire_submission',p_submission_id,jsonb_build_object('previous_status',v_old,'new_status',v_new));
 INSERT INTO public.notifications(user_id,title,message,notification_type,related_id,category,priority,metadata) VALUES(v_row.user_id,'Application review update',CASE WHEN v_new='approved' THEN 'Your '||replace(v_row.profile_type,'_',' ')||' application was approved.' WHEN v_new IN('rejected','returned_for_changes','more_information_required') THEN 'Your '||replace(v_row.profile_type,'_',' ')||' application requires attention. '||coalesce(p_user_visible_reason,'') ELSE 'Your application review status changed to '||replace(v_new,'_',' ')||'.' END,'application_review_update',v_row.id,'account',CASE WHEN v_new IN('rejected','returned_for_changes','more_information_required') THEN 'high' ELSE 'normal' END,jsonb_build_object('profile_type',v_row.profile_type,'status',v_new));
 RETURN v_row;
END;$$;
REVOKE ALL ON FUNCTION public.review_questionnaire_submission(uuid,text,text,text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.review_questionnaire_submission(uuid,text,text,text) TO authenticated;
DROP POLICY IF EXISTS questionnaire_submissions_admin_update ON public.questionnaire_submissions;

/* Column-safe KYC profile surface and RPC-only mutation path. */
CREATE OR REPLACE FUNCTION public.get_my_kyc_profile()
RETURNS TABLE(id uuid,user_id uuid,user_type text,applicable_profile_types text[],status text,provider_id uuid,verification_level text,expires_at timestamptz,last_reviewed_at timestamptz,created_at timestamptz,updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT p.id,p.user_id,p.user_type,p.applicable_profile_types,p.status,p.provider_id,p.verification_level,p.expires_at,p.last_reviewed_at,p.created_at,p.updated_at FROM public.kyc_profiles p WHERE p.user_id=auth.uid() AND p.is_deleted=false LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_my_kyc_profile() FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.get_my_kyc_profile() TO authenticated;
DROP POLICY IF EXISTS kyc_profiles_own_read ON public.kyc_profiles;
DROP POLICY IF EXISTS kyc_profiles_own_insert ON public.kyc_profiles;
DROP POLICY IF EXISTS kyc_submissions_own_insert ON public.kyc_submissions;
DROP POLICY IF EXISTS kyc_documents_own_insert ON public.kyc_documents;
DROP POLICY IF EXISTS kyc_profiles_admin_update ON public.kyc_profiles;
DROP POLICY IF EXISTS kyc_submissions_admin_update ON public.kyc_submissions;
DROP POLICY IF EXISTS kyc_documents_admin_update ON public.kyc_documents;

CREATE OR REPLACE FUNCTION public.required_kyc_documents_for_user(p_user_id uuid)
RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_docs text[];
BEGIN
 IF auth.uid() IS DISTINCT FROM p_user_id AND coalesce(auth.role(),'')<>'service_role' AND NOT public.has_dright_permission('kyc','view') THEN RAISE EXCEPTION 'permission denied'; END IF;
 SELECT coalesce(array_agg(DISTINCT doc ORDER BY doc),'{}'::text[]) INTO v_docs FROM public.user_private_profiles upp JOIN public.kyc_rules r ON r.user_type=ANY(upp.intended_profiles) AND r.is_deleted=false AND r.is_required=true CROSS JOIN LATERAL unnest(r.required_document_types) doc WHERE upp.user_id=p_user_id;
 RETURN coalesce(v_docs,'{}'::text[]);
END;$$;
REVOKE ALL ON FUNCTION public.required_kyc_documents_for_user(uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.required_kyc_documents_for_user(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_kyc_submission_authoritative(p_submission_id uuid,p_action text,p_user_visible_reason text DEFAULT NULL,p_internal_note text DEFAULT NULL)
RETURNS public.kyc_submissions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_row public.kyc_submissions%ROWTYPE;v_old text;v_new text;v_perm text;v_required text[];
BEGIN
 IF p_action NOT IN('approved','rejected','more_info_requested','under_review') THEN RAISE EXCEPTION 'invalid action'; END IF;
 v_perm:=CASE WHEN p_action='approved' THEN 'verify' WHEN p_action='rejected' THEN 'reject' WHEN p_action='more_info_requested' THEN 'request_resubmission' ELSE 'review' END;
 IF NOT public.has_dright_permission('kyc',v_perm) THEN RAISE EXCEPTION 'permission denied'; END IF;
 IF p_action IN('rejected','more_info_requested') AND nullif(trim(coalesce(p_user_visible_reason,'')),'') IS NULL THEN RAISE EXCEPTION 'user-visible reason is required'; END IF;
 SELECT * INTO v_row FROM public.kyc_submissions WHERE id=p_submission_id AND is_deleted=false FOR UPDATE; IF v_row.id IS NULL THEN RAISE EXCEPTION 'submission not found'; END IF; v_old:=v_row.status;v_new:=CASE WHEN p_action='more_info_requested' THEN 'more_info_required' ELSE p_action END;
 v_required:=public.required_kyc_documents_for_user(v_row.user_id);
 IF p_action='approved' AND cardinality(v_required)>0 THEN
   PERFORM public.recalculate_kyc_submission(p_submission_id); SELECT * INTO v_row FROM public.kyc_submissions WHERE id=p_submission_id; IF v_row.status<>'approved' THEN RAISE EXCEPTION 'required KYC checks are not complete'; END IF;
 ELSE
   UPDATE public.kyc_submissions SET status=v_new,reviewer_id=auth.uid(),reviewer_notes=p_internal_note,rejection_reason=CASE WHEN v_new IN('rejected','more_info_required') THEN p_user_visible_reason ELSE NULL END,reviewed_at=now(),updated_by=auth.uid(),updated_at=now() WHERE id=p_submission_id RETURNING * INTO v_row;
 END IF;
 INSERT INTO public.kyc_reviews(submission_id,reviewer_id,action,notes,internal_notes) VALUES(p_submission_id,auth.uid(),p_action,p_user_visible_reason,p_internal_note);
 INSERT INTO public.kyc_audit_logs(user_id,admin_id,action,entity_type,entity_id,metadata) VALUES(v_row.user_id,auth.uid(),'submission_'||p_action,'kyc_submission',v_row.id,jsonb_build_object('previous_status',v_old,'new_status',v_row.status));
 PERFORM public.recalculate_kyc_profile(v_row.profile_id);
 INSERT INTO public.notifications(user_id,title,message,notification_type,related_id,category,priority,metadata) VALUES(v_row.user_id,'KYC review update',CASE WHEN v_row.status='approved' THEN 'Your identity verification is complete.' WHEN v_row.status='rejected' THEN 'Your verification was not approved. '||coalesce(p_user_visible_reason,'Review the verification center for details.') WHEN v_row.status='more_info_required' THEN 'More verification information is required. '||coalesce(p_user_visible_reason,'') ELSE 'Your verification is under review.' END,'kyc_status',v_row.id,'security',CASE WHEN v_row.status IN('rejected','more_info_required') THEN 'high' ELSE 'normal' END,jsonb_build_object('status',v_row.status));
 RETURN v_row;
END;$$;
REVOKE ALL ON FUNCTION public.review_kyc_submission_authoritative(uuid,text,text,text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.review_kyc_submission_authoritative(uuid,text,text,text) TO authenticated;

/* Professional document registration is server-authoritative. */
CREATE OR REPLACE FUNCTION public.register_professional_document(p_profile_type text,p_document_type text,p_title text,p_storage_path text,p_original_file_name text,p_mime_type text,p_size_bytes bigint,p_replaces_document_id uuid DEFAULT NULL)
RETURNS public.professional_documents LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,storage,pg_temp AS $$
DECLARE v_uid uuid:=auth.uid();v_version integer;v_row public.professional_documents%ROWTYPE;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
 IF p_document_type NOT IN('cv','resume','certificate','qualification','portfolio','business_registration','professional_license','media_kit','other') THEN RAISE EXCEPTION 'unsupported professional document type'; END IF;
 IF p_mime_type NOT IN('application/pdf','image/jpeg','image/png','image/webp') OR p_size_bytes IS NULL OR p_size_bytes<=0 OR p_size_bytes>20971520 THEN RAISE EXCEPTION 'invalid professional document'; END IF;
 IF p_storage_path IS NULL OR p_storage_path!~('^'||v_uid::text||'/') THEN RAISE EXCEPTION 'invalid storage path'; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='professional-docs' AND o.name=p_storage_path AND o.owner=v_uid) THEN RAISE EXCEPTION 'uploaded object not found'; END IF;
 IF p_replaces_document_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.professional_documents d WHERE d.id=p_replaces_document_id AND d.user_id=v_uid AND d.document_type=p_document_type AND d.is_deleted=false) THEN RAISE EXCEPTION 'replacement document not found'; END IF;
 SELECT coalesce(max(version),0)+1 INTO v_version FROM public.professional_documents WHERE user_id=v_uid AND document_type=p_document_type AND is_deleted=false;
 INSERT INTO public.professional_documents(user_id,profile_type,document_type,title,storage_bucket,storage_path,original_file_name,mime_type,size_bytes,version,replaces_document_id,status) VALUES(v_uid,p_profile_type,p_document_type,coalesce(nullif(trim(p_title),''),p_original_file_name),'professional-docs',p_storage_path,p_original_file_name,p_mime_type,p_size_bytes,v_version,p_replaces_document_id,'submitted') RETURNING * INTO v_row;
 INSERT INTO public.admin_activity_logs(admin_id,action,resource_type,resource_id,details) SELECT v_uid,'professional_document_submitted','professional_document',v_row.id,jsonb_build_object('user_id',v_uid,'document_type',p_document_type,'version',v_version) WHERE EXISTS(SELECT 1 FROM public.users WHERE id=v_uid AND is_admin=true);
 RETURN v_row;
END;$$;
REVOKE ALL ON FUNCTION public.register_professional_document(text,text,text,text,text,text,bigint,uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.register_professional_document(text,text,text,text,text,text,bigint,uuid) TO authenticated;
DROP POLICY IF EXISTS professional_documents_own_insert ON public.professional_documents;
DROP POLICY IF EXISTS professional_documents_admin_update ON public.professional_documents;

CREATE OR REPLACE FUNCTION public.review_professional_document(p_document_id uuid,p_decision text,p_user_visible_reason text DEFAULT NULL,p_internal_note text DEFAULT NULL,p_checklist jsonb DEFAULT '{}'::jsonb)
RETURNS public.professional_documents LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_doc public.professional_documents%ROWTYPE;v_old text;
BEGIN
 IF NOT public.has_dright_permission('professional_documents','review') THEN RAISE EXCEPTION 'permission denied'; END IF;
 IF p_decision NOT IN('under_review','verified','rejected','needs_resubmission','expired') THEN RAISE EXCEPTION 'invalid decision'; END IF;
 IF p_decision IN('rejected','needs_resubmission','expired') AND nullif(trim(coalesce(p_user_visible_reason,'')),'') IS NULL THEN RAISE EXCEPTION 'reason required'; END IF;
 SELECT * INTO v_doc FROM public.professional_documents WHERE id=p_document_id AND is_deleted=false FOR UPDATE; IF v_doc.id IS NULL THEN RAISE EXCEPTION 'document not found'; END IF;v_old:=v_doc.status;
 UPDATE public.professional_documents SET status=p_decision,user_visible_reason=p_user_visible_reason,reviewer_id=auth.uid(),reviewed_at=now(),updated_at=now() WHERE id=p_document_id RETURNING * INTO v_doc;
 INSERT INTO public.professional_document_reviews(document_id,user_id,reviewer_id,previous_status,decision,new_status,user_visible_reason,internal_note,checklist) VALUES(v_doc.id,v_doc.user_id,auth.uid(),v_old,p_decision,p_decision,p_user_visible_reason,p_internal_note,coalesce(p_checklist,'{}'::jsonb));
 INSERT INTO public.admin_activity_logs(admin_id,action,resource_type,resource_id,details) VALUES(auth.uid(),'professional_document_'||p_decision,'professional_document',v_doc.id,jsonb_build_object('user_id',v_doc.user_id,'previous_status',v_old));
 INSERT INTO public.notifications(user_id,title,message,notification_type,related_id,category,priority,metadata) VALUES(v_doc.user_id,'Professional document review update',CASE WHEN p_decision='verified' THEN 'Your '||replace(v_doc.document_type,'_',' ')||' was verified.' ELSE 'Your '||replace(v_doc.document_type,'_',' ')||' requires attention. '||coalesce(p_user_visible_reason,'') END,'professional_document_review',v_doc.id,'account',CASE WHEN p_decision='verified' THEN 'normal' ELSE 'high' END,jsonb_build_object('status',p_decision,'document_type',v_doc.document_type));
 RETURN v_doc;
END;$$;
REVOKE ALL ON FUNCTION public.review_professional_document(uuid,text,text,text,jsonb) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.review_professional_document(uuid,text,text,text,jsonb) TO authenticated;

/* Achievement evidence registration + column-safe review history. */
CREATE OR REPLACE FUNCTION public.register_achievement_evidence(p_user_achievement_id uuid,p_achievement_id uuid,p_title text,p_description text,p_evidence_type text,p_external_url text,p_storage_path text,p_original_file_name text,p_mime_type text,p_size_bytes bigint)
RETURNS public.achievement_evidence LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,storage,pg_temp AS $$
DECLARE v_uid uuid:=auth.uid();v_row public.achievement_evidence%ROWTYPE;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
 IF p_evidence_type NOT IN('document','image','certificate','portfolio','external_link','platform_record','other') THEN RAISE EXCEPTION 'invalid evidence type'; END IF;
 IF p_user_achievement_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.user_achievements ua WHERE ua.id=p_user_achievement_id AND ua.user_id=v_uid) THEN RAISE EXCEPTION 'achievement does not belong to user'; END IF;
 IF p_evidence_type='external_link' THEN IF p_external_url IS NULL OR p_external_url!~*'^https?://' THEN RAISE EXCEPTION 'valid evidence URL required'; END IF;
 ELSIF p_evidence_type<>'platform_record' THEN
   IF p_mime_type NOT IN('application/pdf','image/jpeg','image/png','image/webp') OR p_size_bytes IS NULL OR p_size_bytes<=0 OR p_size_bytes>20971520 THEN RAISE EXCEPTION 'invalid evidence file'; END IF;
   IF p_storage_path IS NULL OR p_storage_path!~('^'||v_uid::text||'/') OR NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='achievement-evidence' AND o.name=p_storage_path AND o.owner=v_uid) THEN RAISE EXCEPTION 'uploaded evidence object not found'; END IF;
 END IF;
 INSERT INTO public.achievement_evidence(user_id,user_achievement_id,achievement_id,title,description,evidence_type,external_url,storage_bucket,storage_path,original_file_name,mime_type,size_bytes,status) VALUES(v_uid,p_user_achievement_id,p_achievement_id,p_title,p_description,p_evidence_type,p_external_url,CASE WHEN p_storage_path IS NULL THEN NULL ELSE 'achievement-evidence' END,p_storage_path,p_original_file_name,p_mime_type,p_size_bytes,'submitted') RETURNING * INTO v_row;
 RETURN v_row;
END;$$;
REVOKE ALL ON FUNCTION public.register_achievement_evidence(uuid,uuid,text,text,text,text,text,text,text,bigint) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.register_achievement_evidence(uuid,uuid,text,text,text,text,text,text,text,bigint) TO authenticated;
DROP POLICY IF EXISTS achievement_evidence_own_insert ON public.achievement_evidence;
DROP POLICY IF EXISTS achievement_evidence_admin_update ON public.achievement_evidence;
DROP POLICY IF EXISTS achievement_evidence_reviews_own_read ON public.achievement_evidence_reviews;
DROP POLICY IF EXISTS user_achievements_admin_update ON public.user_achievements;
CREATE OR REPLACE FUNCTION public.get_my_achievement_evidence_reviews(p_evidence_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid,evidence_id uuid,decision text,new_status text,user_visible_reason text,created_at timestamptz) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT r.id,r.evidence_id,r.decision,r.new_status,r.user_visible_reason,r.created_at FROM public.achievement_evidence_reviews r WHERE r.user_id=auth.uid() AND (p_evidence_id IS NULL OR r.evidence_id=p_evidence_id) ORDER BY r.created_at DESC; $$;
REVOKE ALL ON FUNCTION public.get_my_achievement_evidence_reviews(uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.get_my_achievement_evidence_reviews(uuid) TO authenticated;

/* Badge mutations must go through audited RPCs. */
DROP POLICY IF EXISTS badge_assignments_manage_authorized ON public.badge_assignments;
CREATE OR REPLACE FUNCTION public.assign_badge_to_user(p_user_id uuid,p_badge_id uuid,p_reason text DEFAULT NULL,p_expires_at timestamptz DEFAULT NULL)
RETURNS public.badge_assignments LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_row public.badge_assignments%ROWTYPE;v_was_active boolean:=false;
BEGIN
 IF NOT public.has_dright_permission('badges','assign') THEN RAISE EXCEPTION 'permission denied'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_user_id) THEN RAISE EXCEPTION 'user not found'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.badges WHERE id=p_badge_id AND is_active=true AND is_deleted=false) THEN RAISE EXCEPTION 'badge unavailable'; END IF;
 SELECT is_active AND NOT is_deleted INTO v_was_active FROM public.badge_assignments WHERE user_id=p_user_id AND badge_id=p_badge_id;
 INSERT INTO public.badge_assignments(badge_id,user_id,assigned_by,reason,expires_at,is_active,is_deleted) VALUES(p_badge_id,p_user_id,auth.uid(),nullif(trim(coalesce(p_reason,'')),''),p_expires_at,true,false)
 ON CONFLICT(badge_id,user_id) DO UPDATE SET assigned_by=EXCLUDED.assigned_by,reason=EXCLUDED.reason,expires_at=EXCLUDED.expires_at,is_active=true,is_deleted=false,updated_at=now() RETURNING * INTO v_row;
 INSERT INTO public.admin_activity_logs(admin_id,action,resource_type,resource_id,details) VALUES(auth.uid(),'badge_assigned','user',p_user_id,jsonb_build_object('badge_id',p_badge_id,'assignment_id',v_row.id,'reason',p_reason));
 IF NOT coalesce(v_was_active,false) THEN INSERT INTO public.notifications(user_id,title,message,notification_type,related_id,category,priority,metadata) VALUES(p_user_id,'New DRIGHT badge','A verified badge was added to your DRIGHT profile.','badge_assigned',v_row.id,'account','normal',jsonb_build_object('badge_id',p_badge_id)); END IF;
 RETURN v_row;
END;$$;
REVOKE ALL ON FUNCTION public.assign_badge_to_user(uuid,uuid,text,timestamptz) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.assign_badge_to_user(uuid,uuid,text,timestamptz) TO authenticated;

/* Growth components are private to the user and authorized admins. */
DROP POLICY IF EXISTS user_growth_scores_public_read ON public.user_growth_scores;
CREATE POLICY user_growth_scores_own_admin_read ON public.user_growth_scores FOR SELECT TO authenticated USING(user_id=auth.uid() OR public.has_dright_permission('users','view') OR public.has_dright_permission('badges','manage_ranking'));
CREATE OR REPLACE FUNCTION public.recalculate_user_growth_score(p_user_id uuid)
RETURNS public.user_growth_scores LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_verified numeric:=0;v_badges numeric:=0;v_trust numeric:=0;v_sales numeric:=0;v_rating numeric:=0;v_score numeric:=0;v_components jsonb;v_row public.user_growth_scores%ROWTYPE;v_weight numeric;v_cap numeric;
BEGIN
 IF auth.uid() IS DISTINCT FROM p_user_id AND NOT public.has_dright_permission('badges','manage_ranking') AND NOT public.has_dright_permission('users','view') THEN RAISE EXCEPTION 'permission denied'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_user_id) THEN RAISE EXCEPTION 'user not found'; END IF;
 SELECT count(*) INTO v_verified FROM public.user_achievements WHERE user_id=p_user_id AND verification_status IN('verified','system_verified');
 SELECT count(*) INTO v_badges FROM public.badge_assignments WHERE user_id=p_user_id AND is_active=true AND is_deleted=false AND (expires_at IS NULL OR expires_at>now());
 SELECT coalesce((SELECT score FROM public.trust_scores WHERE user_id=p_user_id),0) INTO v_trust;
 SELECT coalesce(total_sales_count,0),coalesce(average_rating,0) INTO v_sales,v_rating FROM public.users WHERE id=p_user_id;
 SELECT weight,cap INTO v_weight,v_cap FROM public.growth_ranking_rules WHERE metric_key='verified_achievements' AND is_active=true;v_score:=v_score+least(v_verified*coalesce(v_weight,0),coalesce(v_cap,999999));
 SELECT weight,cap INTO v_weight,v_cap FROM public.growth_ranking_rules WHERE metric_key='active_badges' AND is_active=true;v_score:=v_score+least(v_badges*coalesce(v_weight,0),coalesce(v_cap,999999));
 SELECT weight,cap INTO v_weight,v_cap FROM public.growth_ranking_rules WHERE metric_key='trust_score' AND is_active=true;v_score:=v_score+least(v_trust*coalesce(v_weight,0),coalesce(v_cap,999999));
 SELECT weight,cap INTO v_weight,v_cap FROM public.growth_ranking_rules WHERE metric_key='completed_sales' AND is_active=true;v_score:=v_score+least(v_sales*coalesce(v_weight,0),coalesce(v_cap,999999));
 SELECT weight,cap INTO v_weight,v_cap FROM public.growth_ranking_rules WHERE metric_key='rating_quality' AND is_active=true;v_score:=v_score+least(v_rating*coalesce(v_weight,0),coalesce(v_cap,999999));
 v_components:=jsonb_build_object('verified_achievements',v_verified,'active_badges',v_badges,'trust_score',v_trust,'completed_sales',v_sales,'average_rating',v_rating,'explanation','Score uses DRIGHT platform facts and verified evidence; no AI-only approval signal is used.');
 INSERT INTO public.user_growth_scores(user_id,score,growth_level,components,calculated_at) VALUES(p_user_id,v_score,CASE WHEN v_score>=250 THEN 'established' WHEN v_score>=120 THEN 'growing' WHEN v_score>=40 THEN 'developing' ELSE 'emerging' END,v_components,now()) ON CONFLICT(user_id) DO UPDATE SET score=EXCLUDED.score,growth_level=EXCLUDED.growth_level,components=EXCLUDED.components,calculated_at=now() RETURNING * INTO v_row; RETURN v_row;
END;$$;
REVOKE ALL ON FUNCTION public.recalculate_user_growth_score(uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.recalculate_user_growth_score(uuid) TO authenticated;

/* Explainable eligibility understands the normalized multi-profile KYC identity. */
CREATE OR REPLACE FUNCTION public.recalculate_user_eligibility(p_user_id uuid,p_profile_type text,p_action_key text DEFAULT 'general')
RETURNS public.user_eligibility LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE v_private public.user_private_profiles%ROWTYPE;v_user public.users%ROWTYPE;v_age_rule public.age_eligibility_rules%ROWTYPE;v_kyc_rule public.kyc_rules%ROWTYPE;v_kyc public.kyc_profiles%ROWTYPE;v_reasons jsonb:='[]'::jsonb;v_ok boolean:=true;v_more boolean:=false;v_status text;v_q_status text;v_email_verified boolean:=false;v_row public.user_eligibility%ROWTYPE;v_min_age integer;
BEGIN
 IF auth.uid() IS DISTINCT FROM p_user_id AND NOT public.has_dright_permission('eligibility','recalculate') THEN RAISE EXCEPTION 'permission denied'; END IF;
 SELECT * INTO v_user FROM public.users WHERE id=p_user_id;IF v_user.id IS NULL THEN RAISE EXCEPTION 'user not found'; END IF;
 SELECT * INTO v_private FROM public.user_private_profiles WHERE user_id=p_user_id; SELECT * INTO v_age_rule FROM public.age_eligibility_rules WHERE profile_type=p_profile_type AND is_active=true; SELECT * INTO v_kyc_rule FROM public.kyc_rules WHERE user_type=p_profile_type AND is_deleted=false LIMIT 1; SELECT * INTO v_kyc FROM public.kyc_profiles WHERE user_id=p_user_id AND is_deleted=false AND (user_type=p_profile_type OR p_profile_type=ANY(applicable_profile_types)) ORDER BY updated_at DESC LIMIT 1; SELECT qs.status INTO v_q_status FROM public.questionnaire_submissions qs WHERE qs.user_id=p_user_id AND qs.profile_type=p_profile_type ORDER BY qs.created_at DESC LIMIT 1; SELECT(email_confirmed_at IS NOT NULL) INTO v_email_verified FROM auth.users WHERE id=p_user_id;
 IF v_private.date_of_birth IS NULL THEN v_ok:=false;v_more:=true;v_reasons:=v_reasons||jsonb_build_array(jsonb_build_object('key','age','ok',false,'message','Date of birth is required')); ELSE v_min_age:=coalesce(v_age_rule.minimum_age,0);IF v_age_rule.profile_type IS NOT NULL AND jsonb_typeof(v_age_rule.country_overrides->v_private.country_iso2)='number' THEN v_min_age:=(v_age_rule.country_overrides->>v_private.country_iso2)::integer;END IF;IF public.dright_age_on(v_private.date_of_birth)<v_min_age THEN v_ok:=false;v_reasons:=v_reasons||jsonb_build_array(jsonb_build_object('key','age','ok',false,'message','Minimum age requirement is not satisfied'));ELSE v_reasons:=v_reasons||jsonb_build_array(jsonb_build_object('key','age','ok',true,'message','Minimum age satisfied'));END IF;END IF;
 IF v_q_status IS NULL THEN v_ok:=false;v_more:=true;v_reasons:=v_reasons||jsonb_build_array(jsonb_build_object('key','questionnaire','ok',false,'message','Required questionnaire is missing'));ELSIF v_q_status IN('rejected','returned_for_changes','more_information_required') THEN v_ok:=false;v_more:=true;v_reasons:=v_reasons||jsonb_build_array(jsonb_build_object('key','questionnaire','ok',false,'message','Questionnaire requires review or changes','status',v_q_status));ELSE v_reasons:=v_reasons||jsonb_build_array(jsonb_build_object('key','questionnaire','ok',true,'message','Questionnaire completed','status',v_q_status));END IF;
 IF coalesce(v_kyc_rule.is_required,false) THEN IF v_kyc.status='approved' AND (v_kyc.expires_at IS NULL OR v_kyc.expires_at>now()) THEN v_reasons:=v_reasons||jsonb_build_array(jsonb_build_object('key','kyc','ok',true,'message','KYC verified'));ELSE v_ok:=false;v_more:=true;v_reasons:=v_reasons||jsonb_build_array(jsonb_build_object('key','kyc','ok',false,'message','Required KYC is not verified','status',coalesce(v_kyc.status,'not_started')));END IF;ELSE v_reasons:=v_reasons||jsonb_build_array(jsonb_build_object('key','kyc','ok',true,'message','KYC not required for this profile action'));END IF;
 IF NOT v_email_verified THEN v_ok:=false;v_more:=true;v_reasons:=v_reasons||jsonb_build_array(jsonb_build_object('key','email','ok',false,'message','Email verification required'));ELSE v_reasons:=v_reasons||jsonb_build_array(jsonb_build_object('key','email','ok',true,'message','Email verified'));END IF;
 IF v_user.account_status<>'ACTIVE' THEN v_ok:=false;v_reasons:=v_reasons||jsonb_build_array(jsonb_build_object('key','account','ok',false,'message','Account has an active restriction','status',v_user.account_status));ELSE v_reasons:=v_reasons||jsonb_build_array(jsonb_build_object('key','account','ok',true,'message','No blocking account restriction'));END IF;
 v_status:=CASE WHEN v_ok THEN 'eligible' WHEN v_more THEN 'more_information_required' ELSE 'ineligible' END;
 INSERT INTO public.user_eligibility(user_id,profile_type,action_key,status,reasons,calculated_at,calculated_by) VALUES(p_user_id,p_profile_type,coalesce(nullif(p_action_key,''),'general'),v_status,v_reasons,now(),'rules') ON CONFLICT(user_id,profile_type,action_key) DO UPDATE SET status=EXCLUDED.status,reasons=EXCLUDED.reasons,calculated_at=now(),calculated_by='rules' RETURNING * INTO v_row;RETURN v_row;
END;$$;
REVOKE ALL ON FUNCTION public.recalculate_user_eligibility(uuid,text,text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.recalculate_user_eligibility(uuid,text,text) TO authenticated;

/* Paginated Admin Users summary; avoids browser select('*') and N+1 status queries. */
CREATE OR REPLACE FUNCTION public.get_admin_users_page(p_search text DEFAULT NULL,p_role_filter text DEFAULT 'all',p_page integer DEFAULT 1,p_page_size integer DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_rows jsonb;v_total bigint;v_admins bigint;v_members bigint;v_balance numeric;v_page integer:=greatest(coalesce(p_page,1),1);v_size integer:=least(greatest(coalesce(p_page_size,25),1),100);v_q text:=lower(trim(coalesce(p_search,'')));
BEGIN
 IF NOT public.has_dright_permission('users','view') THEN RAISE EXCEPTION 'permission denied'; END IF;
 SELECT count(*),count(*) FILTER(WHERE u.is_admin=true AND u.admin_status='active'),count(*) FILTER(WHERE coalesce(u.is_admin,false)=false),coalesce(sum(u.balance),0) INTO v_total,v_admins,v_members,v_balance FROM public.users u WHERE (v_q='' OR lower(coalesce(u.email,'')) LIKE '%'||v_q||'%' OR lower(coalesce(u.username,'')) LIKE '%'||v_q||'%' OR lower(coalesce(u.full_name,'')) LIKE '%'||v_q||'%' OR lower(coalesce(u.phone,'')) LIKE '%'||v_q||'%') AND (p_role_filter='all' OR (p_role_filter='admins' AND u.is_admin=true) OR (p_role_filter='promoters' AND coalesce(u.is_admin,false)=false));
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC),'[]'::jsonb) INTO v_rows FROM (
  SELECT u.id,u.email,u.username,u.full_name,u.phone,u.is_admin,u.admin_status,u.account_status,u.balance,u.created_at,
    (SELECT kp.status FROM public.kyc_profiles kp WHERE kp.user_id=u.id AND kp.is_deleted=false ORDER BY kp.updated_at DESC LIMIT 1) AS kyc_status,
    (SELECT qs.status FROM public.questionnaire_submissions qs WHERE qs.user_id=u.id ORDER BY qs.created_at DESC LIMIT 1) AS questionnaire_status,
    (SELECT ue.status FROM public.user_eligibility ue WHERE ue.user_id=u.id ORDER BY ue.calculated_at DESC LIMIT 1) AS eligibility_status,
    (SELECT count(*) FROM public.badge_assignments ba WHERE ba.user_id=u.id AND ba.is_active=true AND ba.is_deleted=false AND (ba.expires_at IS NULL OR ba.expires_at>now())) AS active_badges,
    (SELECT gs.score FROM public.user_growth_scores gs WHERE gs.user_id=u.id) AS growth_score,
    (SELECT gs.growth_level FROM public.user_growth_scores gs WHERE gs.user_id=u.id) AS growth_level
  FROM public.users u
  WHERE (v_q='' OR lower(coalesce(u.email,'')) LIKE '%'||v_q||'%' OR lower(coalesce(u.username,'')) LIKE '%'||v_q||'%' OR lower(coalesce(u.full_name,'')) LIKE '%'||v_q||'%' OR lower(coalesce(u.phone,'')) LIKE '%'||v_q||'%') AND (p_role_filter='all' OR (p_role_filter='admins' AND u.is_admin=true) OR (p_role_filter='promoters' AND coalesce(u.is_admin,false)=false))
  ORDER BY u.created_at DESC LIMIT v_size OFFSET((v_page-1)*v_size)
 ) x;
 RETURN jsonb_build_object('rows',v_rows,'page',v_page,'page_size',v_size,'total',v_total,'summary',jsonb_build_object('admins',v_admins,'members',v_members,'total_balance',v_balance));
END;$$;
REVOKE ALL ON FUNCTION public.get_admin_users_page(text,text,integer,integer) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.get_admin_users_page(text,text,integer,integer) TO authenticated;