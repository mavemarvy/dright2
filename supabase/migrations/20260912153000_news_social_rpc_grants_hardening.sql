-- Explicitly remove anonymous execution from DRIGHT News social/admin RPCs.
REVOKE EXECUTE ON FUNCTION public.admin_create_global_content_v2(text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text[],text,text,text,text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_update_global_content_v2(uuid,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text[],text,text,text,text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_global_content_engagement(uuid[]) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_global_content_reaction(uuid,text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.toggle_global_content_save(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_global_content_comment(uuid,text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_own_global_content_comment(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_global_content_comments(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dismiss_global_content_banner(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_global_content_banners() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_global_content_comments(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_moderate_global_content_comment(uuid,text,text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_global_content_view(uuid) FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_create_global_content_v2(text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text[],text,text,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_global_content_v2(uuid,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text[],text,text,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_global_content_engagement(uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_global_content_reaction(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.toggle_global_content_save(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_global_content_comment(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_own_global_content_comment(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_global_content_comments(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dismiss_global_content_banner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_global_content_banners() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_global_content_comments(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_moderate_global_content_comment(uuid,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_global_content_view(uuid) TO authenticated, service_role;
