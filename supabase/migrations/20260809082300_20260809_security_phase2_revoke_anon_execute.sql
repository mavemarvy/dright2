/*
# Security Hardening Phase 2: Revoke anon execute on admin functions

## Purpose
The security advisor flagged that the new SECURITY DEFINER functions are
callable by the anon role. Revoke EXECUTE from anon and public, keep it
granted only to authenticated.

## Functions Secured
- has_capability(text)
- grant_capability(uuid, text)
- revoke_capability(uuid, text)
- assign_admin_role(uuid, uuid, text[])
- suspend_admin(uuid, text)
- approve_admin(uuid, uuid)
- reject_admin(uuid, text)
- request_admin_status()
- has_rbac_permission(text, text)
- is_super_admin()
- is_admin_user()
- is_admin(uuid)
*/

REVOKE EXECUTE ON FUNCTION public.has_capability(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.grant_capability(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.revoke_capability(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.assign_admin_role(uuid, uuid, text[]) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.suspend_admin(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.approve_admin(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.reject_admin(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.request_admin_status() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_rbac_permission(text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_admin_user() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon, public;
