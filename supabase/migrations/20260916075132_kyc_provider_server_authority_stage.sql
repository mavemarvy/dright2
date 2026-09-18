/* Server-authoritative, credential-free provider operations. Table privilege revocation follows after frontend verification. */
CREATE OR REPLACE FUNCTION public.get_kyc_provider_safe_settings()
RETURNS TABLE(id uuid,provider_id uuid,is_connected boolean,is_enabled boolean,is_active boolean,mode text,health_status text,last_sync_at timestamptz,last_error text,created_at timestamptz,updated_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.has_dright_permission('kyc','manage_providers') THEN RAISE EXCEPTION 'permission denied'; END IF;
 RETURN QUERY SELECT s.id,s.provider_id,s.is_connected,s.is_enabled,s.is_active,s.mode,s.health_status,s.last_sync_at,CASE WHEN s.last_error IS NULL THEN NULL ELSE 'Provider reported an error' END,s.created_at,s.updated_at FROM public.kyc_provider_settings s WHERE s.is_deleted=false ORDER BY s.created_at;
END;$$;
REVOKE ALL ON FUNCTION public.get_kyc_provider_safe_settings() FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.get_kyc_provider_safe_settings() TO authenticated;

CREATE OR REPLACE FUNCTION public.update_kyc_provider_runtime_setting(p_setting_id uuid,p_is_enabled boolean DEFAULT NULL,p_mode text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.has_dright_permission('kyc','manage_providers') THEN RAISE EXCEPTION 'permission denied'; END IF;
 IF p_mode IS NOT NULL AND p_mode NOT IN('sandbox','production') THEN RAISE EXCEPTION 'invalid provider mode'; END IF;
 UPDATE public.kyc_provider_settings SET is_enabled=coalesce(p_is_enabled,is_enabled),mode=coalesce(p_mode,mode),updated_at=now() WHERE id=p_setting_id AND is_deleted=false;
 IF NOT FOUND THEN RAISE EXCEPTION 'provider setting not found'; END IF;
 INSERT INTO public.admin_activity_logs(admin_id,action,resource_type,resource_id,details) VALUES(auth.uid(),'kyc_provider_runtime_updated','kyc_provider_setting',p_setting_id,jsonb_build_object('is_enabled',p_is_enabled,'mode',p_mode));
END;$$;
REVOKE ALL ON FUNCTION public.update_kyc_provider_runtime_setting(uuid,boolean,text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.update_kyc_provider_runtime_setting(uuid,boolean,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_active_kyc_provider_runtime(p_provider_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_setting public.kyc_provider_settings%ROWTYPE;v_provider public.kyc_providers%ROWTYPE;
BEGIN
 IF NOT public.has_dright_permission('kyc','manage_providers') THEN RAISE EXCEPTION 'permission denied'; END IF;
 SELECT * INTO v_provider FROM public.kyc_providers WHERE id=p_provider_id AND is_deleted=false; IF v_provider.id IS NULL THEN RAISE EXCEPTION 'provider not found'; END IF;
 SELECT * INTO v_setting FROM public.kyc_provider_settings WHERE provider_id=p_provider_id AND is_deleted=false; IF v_setting.id IS NULL THEN RAISE EXCEPTION 'provider setting not found'; END IF;
 IF v_provider.slug<>'manual' AND (v_setting.is_connected IS DISTINCT FROM true OR v_setting.is_enabled IS DISTINCT FROM true OR v_setting.health_status IS DISTINCT FROM 'healthy') THEN RAISE EXCEPTION 'automated provider must be enabled, connected and healthy before activation'; END IF;
 UPDATE public.kyc_provider_settings SET is_active=false,updated_at=now() WHERE is_deleted=false AND is_active=true;
 UPDATE public.kyc_provider_settings SET is_active=true,updated_at=now() WHERE id=v_setting.id;
 INSERT INTO public.admin_activity_logs(admin_id,action,resource_type,resource_id,details) VALUES(auth.uid(),'kyc_provider_activated','kyc_provider',p_provider_id,jsonb_build_object('mode',v_setting.mode));
END;$$;
REVOKE ALL ON FUNCTION public.set_active_kyc_provider_runtime(uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.set_active_kyc_provider_runtime(uuid) TO authenticated;