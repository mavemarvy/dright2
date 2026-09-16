/* User-side KYC operations that preserve server authority over ownership and status. */

CREATE OR REPLACE FUNCTION public.get_public_kyc_requirements()
RETURNS TABLE(user_type text,is_required boolean,required_for_action text,description text,required_document_types text[],required_checks text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$
  SELECT r.user_type,r.is_required,r.required_for_action,r.description,r.required_document_types,r.required_checks
  FROM public.kyc_rules r WHERE r.is_deleted=false;
$$;
REVOKE ALL ON FUNCTION public.get_public_kyc_requirements() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_kyc_requirements() TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.start_kyc_submission(p_profile_id uuid,p_provider_id uuid DEFAULT NULL)
RETURNS public.kyc_submissions
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_uid uuid:=auth.uid();v_profile public.kyc_profiles%ROWTYPE;v_version integer;v_row public.kyc_submissions%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT * INTO v_profile FROM public.kyc_profiles WHERE id=p_profile_id AND user_id=v_uid AND is_deleted=false FOR UPDATE;
  IF v_profile.id IS NULL THEN RAISE EXCEPTION 'KYC profile not found'; END IF;
  SELECT coalesce(max(version),0)+1 INTO v_version FROM public.kyc_submissions WHERE profile_id=p_profile_id;
  INSERT INTO public.kyc_submissions(profile_id,user_id,status,provider_id,version,created_by,updated_by)
  VALUES(p_profile_id,v_uid,'pending',p_provider_id,v_version,v_uid,v_uid) RETURNING * INTO v_row;
  UPDATE public.kyc_profiles SET status='submitted',updated_by=v_uid,updated_at=now() WHERE id=p_profile_id;
  INSERT INTO public.kyc_audit_logs(user_id,action,entity_type,entity_id,metadata)
  VALUES(v_uid,'submission_started','kyc_submission',v_row.id,jsonb_build_object('version',v_version));
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.start_kyc_submission(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_kyc_submission(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.register_kyc_document(
  p_submission_id uuid,
  p_doc_type text,
  p_storage_path text,
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_issuing_country text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL,
  p_replaces_document_id uuid DEFAULT NULL
) RETURNS public.kyc_documents
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_uid uuid:=auth.uid();v_submission public.kyc_submissions%ROWTYPE;v_version integer;v_row public.kyc_documents%ROWTYPE;v_old public.kyc_documents%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT * INTO v_submission FROM public.kyc_submissions WHERE id=p_submission_id AND user_id=v_uid AND is_deleted=false;
  IF v_submission.id IS NULL THEN RAISE EXCEPTION 'submission not found'; END IF;
  IF p_mime_type NOT IN ('application/pdf','image/jpeg','image/png','image/webp') THEN RAISE EXCEPTION 'unsupported document type'; END IF;
  IF p_size_bytes IS NULL OR p_size_bytes<=0 OR p_size_bytes>20971520 THEN RAISE EXCEPTION 'document size exceeds the 20MB limit'; END IF;
  IF p_storage_path IS NULL OR p_storage_path !~ ('^'||v_uid::text||'/'||p_submission_id::text||'/') THEN RAISE EXCEPTION 'invalid storage path'; END IF;
  IF p_issuing_country IS NOT NULL AND upper(p_issuing_country) !~ '^[A-Z]{2}$' THEN RAISE EXCEPTION 'invalid issuing country'; END IF;

  IF p_replaces_document_id IS NOT NULL THEN
    SELECT * INTO v_old FROM public.kyc_documents WHERE id=p_replaces_document_id AND user_id=v_uid AND submission_id=p_submission_id AND is_deleted=false FOR UPDATE;
    IF v_old.id IS NULL THEN RAISE EXCEPTION 'document to replace was not found'; END IF;
    IF v_old.doc_type<>p_doc_type THEN RAISE EXCEPTION 'replacement document type mismatch'; END IF;
  END IF;

  SELECT coalesce(max(version),0)+1 INTO v_version FROM public.kyc_documents WHERE submission_id=p_submission_id AND doc_type=p_doc_type;
  INSERT INTO public.kyc_documents(
    submission_id,user_id,doc_type,doc_url,doc_name,doc_mime_type,doc_size_bytes,status,version,
    storage_bucket,storage_path,issuing_country,expires_at,created_by,updated_by
  ) VALUES(
    p_submission_id,v_uid,p_doc_type,p_storage_path,p_original_name,p_mime_type,p_size_bytes,'pending',v_version,
    'kyc-docs',p_storage_path,CASE WHEN p_issuing_country IS NULL THEN NULL ELSE upper(p_issuing_country) END,p_expires_at,v_uid,v_uid
  ) RETURNING * INTO v_row;

  IF v_old.id IS NOT NULL THEN
    UPDATE public.kyc_documents SET status='replaced',replaced_by=v_row.id,updated_by=v_uid,updated_at=now() WHERE id=v_old.id;
  END IF;

  INSERT INTO public.kyc_audit_logs(user_id,action,entity_type,entity_id,metadata)
  VALUES(v_uid,CASE WHEN v_old.id IS NULL THEN 'document_uploaded' ELSE 'document_replaced' END,'kyc_document',v_row.id,
    jsonb_build_object('doc_type',p_doc_type,'version',v_version,'replaced_document_id',v_old.id));
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.register_kyc_document(uuid,text,text,text,text,bigint,text,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_kyc_document(uuid,text,text,text,text,bigint,text,timestamptz,uuid) TO authenticated;

-- Permit cleanup only for an unregistered orphan owned by the uploader. Registered originals remain immutable.
DROP POLICY IF EXISTS users_delete_unregistered_kyc_uploads ON storage.objects;
CREATE POLICY users_delete_unregistered_kyc_uploads ON storage.objects
FOR DELETE TO authenticated USING (
  bucket_id='kyc-docs' AND owner=auth.uid()
  AND NOT EXISTS (SELECT 1 FROM public.kyc_documents d WHERE d.storage_bucket='kyc-docs' AND d.storage_path=storage.objects.name AND d.is_deleted=false)
);
