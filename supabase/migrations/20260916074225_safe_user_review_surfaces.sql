/* Column-safe user read surfaces. Achievement-evidence portion is applied after its table is created. */
DROP POLICY IF EXISTS questionnaire_submissions_own_read ON public.questionnaire_submissions;
DROP POLICY IF EXISTS questionnaire_review_events_own_read ON public.questionnaire_review_events;

CREATE OR REPLACE FUNCTION public.get_my_questionnaire_submissions()
RETURNS TABLE(id uuid, profile_type text, questionnaire_id uuid, questionnaire_version integer,status text, submitted_at timestamptz, reviewed_at timestamptz,user_visible_reason text, created_at timestamptz, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$
  SELECT s.id,s.profile_type,s.questionnaire_id,s.questionnaire_version,s.status,s.submitted_at,s.reviewed_at,s.user_visible_reason,s.created_at,s.updated_at
  FROM public.questionnaire_submissions s WHERE s.user_id=auth.uid() ORDER BY s.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.get_my_questionnaire_submissions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_questionnaire_submissions() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_questionnaire_review_events(p_submission_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid, submission_id uuid, action text, previous_status text, new_status text,user_visible_reason text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$
  SELECT e.id,e.submission_id,e.action,e.previous_status,e.new_status,e.user_visible_reason,e.created_at
  FROM public.questionnaire_review_events e
  JOIN public.questionnaire_submissions s ON s.id=e.submission_id
  WHERE s.user_id=auth.uid() AND (p_submission_id IS NULL OR e.submission_id=p_submission_id)
  ORDER BY e.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.get_my_questionnaire_review_events(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_questionnaire_review_events(uuid) TO authenticated;

DROP POLICY IF EXISTS kyc_submissions_own_read ON public.kyc_submissions;
DROP POLICY IF EXISTS kyc_documents_own_read ON public.kyc_documents;

CREATE OR REPLACE FUNCTION public.get_my_kyc_submissions(p_profile_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid, profile_id uuid, user_id uuid, status text, provider_id uuid,rejection_reason text, submitted_at timestamptz, reviewed_at timestamptz,version integer, created_at timestamptz, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$
  SELECT s.id,s.profile_id,s.user_id,s.status,s.provider_id,s.rejection_reason,s.submitted_at,s.reviewed_at,s.version,s.created_at,s.updated_at
  FROM public.kyc_submissions s
  WHERE s.user_id=auth.uid() AND s.is_deleted=false AND (p_profile_id IS NULL OR s.profile_id=p_profile_id)
  ORDER BY s.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.get_my_kyc_submissions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_kyc_submissions(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_kyc_documents(p_submission_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid, submission_id uuid, user_id uuid, doc_type text, doc_url text,storage_bucket text, storage_path text, doc_name text, doc_mime_type text,doc_size_bytes bigint, status text, issuing_country text, document_number_last4 text,document_side text, expires_at timestamptz, replaced_by uuid, user_visible_reason text,reviewed_at timestamptz, review_source text, metadata jsonb, version integer,created_at timestamptz, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$
  SELECT d.id,d.submission_id,d.user_id,d.doc_type,d.doc_url,d.storage_bucket,d.storage_path,d.doc_name,d.doc_mime_type,d.doc_size_bytes,d.status,d.issuing_country,d.document_number_last4,d.document_side,d.expires_at,d.replaced_by,d.user_visible_reason,d.reviewed_at,d.review_source,d.metadata,d.version,d.created_at,d.updated_at
  FROM public.kyc_documents d
  WHERE d.user_id=auth.uid() AND d.is_deleted=false AND (p_submission_id IS NULL OR d.submission_id=p_submission_id)
  ORDER BY d.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.get_my_kyc_documents(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_kyc_documents(uuid) TO authenticated;

REVOKE ALL ON public.kyc_review_user_history FROM authenticated;
CREATE OR REPLACE FUNCTION public.get_my_kyc_review_history(p_limit integer DEFAULT 50)
RETURNS TABLE(id uuid, submission_id uuid, action text, user_visible_reason text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$
  SELECT r.id,r.submission_id,r.action,r.notes,r.created_at
  FROM public.kyc_reviews r JOIN public.kyc_submissions s ON s.id=r.submission_id
  WHERE s.user_id=auth.uid() AND r.is_deleted=false
  ORDER BY r.created_at DESC LIMIT greatest(1,least(coalesce(p_limit,50),200));
$$;
REVOKE ALL ON FUNCTION public.get_my_kyc_review_history(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_kyc_review_history(integer) TO authenticated;

DROP POLICY IF EXISTS professional_document_reviews_own_read ON public.professional_document_reviews;
CREATE OR REPLACE FUNCTION public.get_my_professional_document_reviews(p_document_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid,document_id uuid,decision text,new_status text,user_visible_reason text,created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$
  SELECT r.id,r.document_id,r.decision,r.new_status,r.user_visible_reason,r.created_at
  FROM public.professional_document_reviews r
  WHERE r.user_id=auth.uid() AND (p_document_id IS NULL OR r.document_id=p_document_id)
  ORDER BY r.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.get_my_professional_document_reviews(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_professional_document_reviews(uuid) TO authenticated;