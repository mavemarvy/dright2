/* Server-authoritative helpers for Admin > Users > User Detail. */
CREATE OR REPLACE FUNCTION public.get_admin_user_identity_summary(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp
AS $$
DECLARE v_user public.users%ROWTYPE; v_private jsonb:=NULL; v_auth jsonb:=NULL;
BEGIN
 IF NOT public.has_dright_permission('users','view') THEN RAISE EXCEPTION 'permission denied'; END IF;
 SELECT * INTO v_user FROM public.users WHERE id=p_user_id; IF v_user.id IS NULL THEN RAISE EXCEPTION 'user not found'; END IF;
 IF public.has_dright_permission('users','view_sensitive') THEN
   SELECT to_jsonb(p) INTO v_private FROM public.user_private_profiles p WHERE p.user_id=p_user_id;
   SELECT jsonb_build_object('email_verified',a.email_confirmed_at IS NOT NULL,'phone_verified',a.phone_confirmed_at IS NOT NULL,'last_sign_in_at',a.last_sign_in_at,'auth_created_at',a.created_at) INTO v_auth FROM auth.users a WHERE a.id=p_user_id;
 END IF;
 RETURN jsonb_build_object('user',jsonb_build_object('id',v_user.id,'email',v_user.email,'phone',v_user.phone,'full_name',v_user.full_name,'username',v_user.username,'avatar_url',v_user.avatar_url,'location',v_user.location,'created_at',v_user.created_at,'updated_at',v_user.updated_at,'account_status',v_user.account_status,'is_admin',v_user.is_admin,'admin_status',v_user.admin_status,'admin_role',v_user.admin_role,'rbac_role_id',v_user.rbac_role_id,'total_sales_count',v_user.total_sales_count,'average_rating',v_user.average_rating),'private_profile',v_private,'auth',v_auth);
END;$$;
REVOKE ALL ON FUNCTION public.get_admin_user_identity_summary(uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.get_admin_user_identity_summary(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.assign_badge_to_user(p_user_id uuid,p_badge_id uuid,p_reason text DEFAULT NULL,p_expires_at timestamptz DEFAULT NULL)
RETURNS public.badge_assignments LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_row public.badge_assignments%ROWTYPE;
BEGIN
 IF NOT public.has_dright_permission('badges','assign') THEN RAISE EXCEPTION 'permission denied'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_user_id) THEN RAISE EXCEPTION 'user not found'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.badges WHERE id=p_badge_id AND is_active=true AND is_deleted=false) THEN RAISE EXCEPTION 'badge unavailable'; END IF;
 INSERT INTO public.badge_assignments(badge_id,user_id,assigned_by,reason,expires_at,is_active,is_deleted)
 VALUES(p_badge_id,p_user_id,auth.uid(),nullif(trim(coalesce(p_reason,'')),''),p_expires_at,true,false) RETURNING * INTO v_row;
 INSERT INTO public.admin_activity_logs(admin_id,action,resource_type,resource_id,details) VALUES(auth.uid(),'badge_assigned','user',p_user_id,jsonb_build_object('badge_id',p_badge_id,'assignment_id',v_row.id,'reason',p_reason));
 INSERT INTO public.notifications(user_id,title,message,notification_type,related_id,category,priority,metadata)
 SELECT p_user_id,'New DRIGHT badge','A verified badge was added to your DRIGHT profile.','badge_assigned',v_row.id,'account','normal',jsonb_build_object('badge_id',p_badge_id)
 WHERE NOT EXISTS(SELECT 1 FROM public.badge_assignments old WHERE old.user_id=p_user_id AND old.badge_id=p_badge_id AND old.id<>v_row.id AND old.is_active=true AND old.is_deleted=false);
 RETURN v_row;
END;$$;
REVOKE ALL ON FUNCTION public.assign_badge_to_user(uuid,uuid,text,timestamptz) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.assign_badge_to_user(uuid,uuid,text,timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_badge_assignment(p_assignment_id uuid,p_reason text)
RETURNS public.badge_assignments LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_row public.badge_assignments%ROWTYPE;
BEGIN
 IF NOT public.has_dright_permission('badges','assign') THEN RAISE EXCEPTION 'permission denied'; END IF;
 IF nullif(trim(coalesce(p_reason,'')),'') IS NULL THEN RAISE EXCEPTION 'reason required'; END IF;
 UPDATE public.badge_assignments SET is_active=false,updated_at=now() WHERE id=p_assignment_id AND is_deleted=false RETURNING * INTO v_row;
 IF v_row.id IS NULL THEN RAISE EXCEPTION 'badge assignment not found'; END IF;
 INSERT INTO public.admin_activity_logs(admin_id,action,resource_type,resource_id,details) VALUES(auth.uid(),'badge_revoked','user',v_row.user_id,jsonb_build_object('assignment_id',v_row.id,'badge_id',v_row.badge_id,'reason',p_reason));
 RETURN v_row;
END;$$;
REVOKE ALL ON FUNCTION public.revoke_badge_assignment(uuid,text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.revoke_badge_assignment(uuid,text) TO authenticated;