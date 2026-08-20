/*
# Security Hardening Phase 2: RBAC Identity & Capability System

## Purpose
1. Create `user_capabilities` table — dynamic capability tracking per user
2. Create `user_roles` table — maps users to RBAC roles (many-to-many)
3. Change default `users.role` from 'promoter' to 'user' — no more promoter identity
4. Update the CHECK constraint on users.role to include 'user'
5. Add admin invitation flow columns
6. Add helper functions for capability checks and admin workflow

## Tables Created
- user_capabilities: tracks which capabilities each user has unlocked
- user_roles: maps users to RBAC roles (many-to-many)

## Tables Modified
- users: change role default from 'promoter' to 'user', update CHECK constraint
- users: add admin_verification_status, admin_rejection_reason columns

## New Functions
- has_capability(p_capability text)
- grant_capability(p_user_id uuid, p_capability text)
- revoke_capability(p_user_id uuid, p_capability text)
- assign_admin_role(p_user_id uuid, p_role_id uuid, p_permissions text[])
- suspend_admin(p_user_id uuid, p_reason text)
- approve_admin(p_user_id uuid, p_role_id uuid)
- reject_admin(p_user_id uuid, p_reason text)
- request_admin_status()
*/

-- ============================================================
-- 1. Drop old CHECK constraint and create new one with 'user' value
-- ============================================================
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check_affiliate;

ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role = ANY (ARRAY['admin', 'affiliate', 'marketer', 'advertiser', 'customer', 'promoter', 'user']));

-- ============================================================
-- 2. Change users.role default from 'promoter' to 'user'
-- ============================================================
ALTER TABLE public.users ALTER COLUMN role SET DEFAULT 'user';

-- Update existing users who have 'promoter' to 'user'
UPDATE public.users SET role = 'user' WHERE role = 'promoter';

-- ============================================================
-- 3. Add admin invitation flow columns
-- ============================================================
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS admin_verification_status text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS admin_rejection_reason text DEFAULT NULL;

-- ============================================================
-- 4. Create user_capabilities table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  capability text NOT NULL CHECK (
    capability IN (
      'buyer', 'seller', 'affiliate', 'advertiser',
      'creator', 'task_participant', 'vendor', 'task_clipper'
    )
  ),
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE(user_id, capability)
);

CREATE INDEX idx_user_capabilities_user_id ON public.user_capabilities(user_id);
CREATE INDEX idx_user_capabilities_capability ON public.user_capabilities(capability);

ALTER TABLE public.user_capabilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_capabilities" ON public.user_capabilities
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "admin_select_capabilities" ON public.user_capabilities
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

CREATE POLICY "admin_insert_capabilities" ON public.user_capabilities
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

CREATE POLICY "admin_update_capabilities" ON public.user_capabilities
  FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "admin_delete_capabilities" ON public.user_capabilities
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- ============================================================
-- 5. Create user_roles table (many-to-many user → roles)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE(user_id, role_id)
);

CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_role_id ON public.user_roles(role_id);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_user_roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "admin_select_user_roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

CREATE POLICY "admin_insert_user_roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

CREATE POLICY "admin_update_user_roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "admin_delete_user_roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- ============================================================
-- 6. Create has_capability helper function
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_capability(p_capability text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
SELECT EXISTS (
  SELECT 1
  FROM public.user_capabilities
  WHERE user_id = auth.uid()
    AND capability = p_capability
    AND is_active = true
);
$function$;

-- ============================================================
-- 7. Create grant_capability function (SECURITY DEFINER)
-- ============================================================
CREATE OR REPLACE FUNCTION public.grant_capability(p_user_id uuid, p_capability text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only super admin can grant capabilities';
  END IF;

  INSERT INTO public.user_capabilities (user_id, capability, granted_by)
  VALUES (p_user_id, p_capability, auth.uid())
  ON CONFLICT (user_id, capability) DO UPDATE
    SET is_active = true,
        granted_by = auth.uid(),
        granted_at = now();
END;
$function$;

-- ============================================================
-- 8. Create revoke_capability function (SECURITY DEFINER)
-- ============================================================
CREATE OR REPLACE FUNCTION public.revoke_capability(p_user_id uuid, p_capability text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only super admin can revoke capabilities';
  END IF;

  UPDATE public.user_capabilities
  SET is_active = false
  WHERE user_id = p_user_id AND capability = p_capability;
END;
$function$;

-- ============================================================
-- 9. Create assign_admin_role function (SECURITY DEFINER)
-- ============================================================
CREATE OR REPLACE FUNCTION public.assign_admin_role(
  p_user_id uuid,
  p_role_id uuid,
  p_permissions text[] DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  perm_id uuid;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only super admin can assign admin roles';
  END IF;

  UPDATE public.users
  SET rbac_role_id = p_role_id,
      is_admin = true,
      admin_status = 'active',
      admin_verification_status = 'approved'
  WHERE id = p_user_id;

  INSERT INTO public.user_roles (user_id, role_id, assigned_by)
  VALUES (p_user_id, p_role_id, auth.uid())
  ON CONFLICT (user_id, role_id) DO UPDATE
    SET is_active = true,
        assigned_by = auth.uid(),
        assigned_at = now();

  IF p_permissions IS NOT NULL THEN
    FOREACH perm_id IN ARRAY p_permissions LOOP
      INSERT INTO public.admin_permissions (admin_id, permission_id, granted_by)
      VALUES (p_user_id, perm_id, auth.uid())
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
END;
$function$;

-- ============================================================
-- 10. Create suspend_admin function (SECURITY DEFINER)
-- ============================================================
CREATE OR REPLACE FUNCTION public.suspend_admin(p_user_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only super admin can suspend administrators';
  END IF;

  UPDATE public.users
  SET admin_status = 'suspended',
      admin_rejection_reason = p_reason
  WHERE id = p_user_id;
END;
$function$;

-- ============================================================
-- 11. Create approve_admin function (SECURITY DEFINER)
-- ============================================================
CREATE OR REPLACE FUNCTION public.approve_admin(p_user_id uuid, p_role_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only super admin can approve administrators';
  END IF;

  UPDATE public.users
  SET admin_status = 'active',
      admin_verification_status = 'approved',
      admin_rejection_reason = NULL,
      rbac_role_id = COALESCE(p_role_id, rbac_role_id)
  WHERE id = p_user_id;

  IF p_role_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role_id, assigned_by)
    VALUES (p_user_id, p_role_id, auth.uid())
    ON CONFLICT (user_id, role_id) DO UPDATE
      SET is_active = true,
          assigned_by = auth.uid(),
          assigned_at = now();
  END IF;
END;
$function$;

-- ============================================================
-- 12. Create reject_admin function (SECURITY DEFINER)
-- ============================================================
CREATE OR REPLACE FUNCTION public.reject_admin(p_user_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only super admin can reject administrators';
  END IF;

  UPDATE public.users
  SET admin_status = 'rejected',
      admin_verification_status = 'rejected',
      admin_rejection_reason = p_reason,
      is_admin = false,
      rbac_role_id = NULL
  WHERE id = p_user_id;
END;
$function$;

-- ============================================================
-- 13. Create request_admin_status function
-- ============================================================
CREATE OR REPLACE FUNCTION public.request_admin_status()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.users
  SET admin_status = 'under_review',
      admin_verification_status = 'pending',
      admin_pending_since = now(),
      is_admin = false
  WHERE id = auth.uid();
END;
$function$;

-- ============================================================
-- 14. Update is_admin_user to check admin_verification_status
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
SELECT EXISTS (
  SELECT 1 FROM public.users
  WHERE id = auth.uid()
    AND is_admin = true
    AND admin_status = 'active'
    AND (admin_verification_status IS NULL OR admin_verification_status = 'approved')
);
$function$;

-- ============================================================
-- 15. Grant execute on new functions to authenticated role
-- ============================================================
GRANT EXECUTE ON FUNCTION public.has_capability(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_capability(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_capability(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_admin_role(uuid, uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.suspend_admin(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_admin(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_admin_status() TO authenticated;
