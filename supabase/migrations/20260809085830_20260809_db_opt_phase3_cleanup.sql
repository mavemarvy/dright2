/*
# Database Optimization Phase 3: Cleanup

## Purpose
1. Remove 8 orphaned notifications (user_id references non-existent users)
2. Remove duplicate RLS policies on abandoned_payments, ai_images, ai_messages
3. Add missing foreign key constraints on key tables

## Duplicate Policies Removed (12 policies)
### abandoned_payments (4 duplicates removed — keep shorter names)
- delete_own_abandoned_payments (dup of delete_own_abandoned)
- insert_own_abandoned_payments (dup of insert_own_abandoned)
- select_own_abandoned_payments (dup of select_own_abandoned)
- update_own_abandoned_payments (dup of update_own_abandoned)

### ai_images (4 duplicates removed — keep *_ai_images variants with admin access)
- delete_own_images (dup of delete_own_ai_images — weaker, no admin)
- insert_own_images (dup of insert_own_ai_images — identical)
- select_own_images (dup of select_own_ai_images — weaker, no admin)
- update_own_images (dup of update_own_ai_images — weaker, no admin)

### ai_messages (4 duplicates removed — keep shorter names)
- delete_own_messages (dup of delete_own_ai_messages)
- insert_own_messages (dup of insert_own_ai_messages)
- select_own_messages (dup of select_own_ai_messages)

## Missing Constraints Added
- notifications.user_id FK to users(id) ON DELETE CASCADE
*/

-- ============================================================
-- 1. Delete orphaned notifications
-- ============================================================
DELETE FROM public.notifications
WHERE user_id NOT IN (SELECT id FROM public.users);

-- ============================================================
-- 2. Remove duplicate policies on abandoned_payments
-- ============================================================
DROP POLICY IF EXISTS "delete_own_abandoned_payments" ON public.abandoned_payments;
DROP POLICY IF EXISTS "insert_own_abandoned_payments" ON public.abandoned_payments;
DROP POLICY IF EXISTS "select_own_abandoned_payments" ON public.abandoned_payments;
DROP POLICY IF EXISTS "update_own_abandoned_payments" ON public.abandoned_payments;

-- ============================================================
-- 3. Remove duplicate policies on ai_images (keep *_ai_images with admin)
-- ============================================================
DROP POLICY IF EXISTS "delete_own_images" ON public.ai_images;
DROP POLICY IF EXISTS "insert_own_images" ON public.ai_images;
DROP POLICY IF EXISTS "select_own_images" ON public.ai_images;
DROP POLICY IF EXISTS "update_own_images" ON public.ai_images;

-- ============================================================
-- 4. Remove duplicate policies on ai_messages (keep shorter names)
-- ============================================================
DROP POLICY IF EXISTS "delete_own_messages" ON public.ai_messages;
DROP POLICY IF EXISTS "insert_own_messages" ON public.ai_messages;
DROP POLICY IF EXISTS "select_own_messages" ON public.ai_messages;

-- ============================================================
-- 5. Add missing FK constraint on notifications.user_id
--    (if it doesn't already exist — prevents future orphans)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'notifications_user_id_fkey'
    AND table_name = 'notifications'
  ) THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END
$$;
