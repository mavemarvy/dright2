/* Compatibility bridge for newer module audit writers while preserving DRIGHT2's existing admin_activity_logs table. */
ALTER TABLE public.admin_activity_logs ADD COLUMN IF NOT EXISTS resource_type text;
ALTER TABLE public.admin_activity_logs ADD COLUMN IF NOT EXISTS resource_id uuid;

CREATE OR REPLACE FUNCTION public.sync_admin_activity_resource_aliases()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=public,pg_temp
AS $$
BEGIN
  IF NEW.target_type IS NULL AND NEW.resource_type IS NOT NULL THEN NEW.target_type := NEW.resource_type; END IF;
  IF NEW.resource_type IS NULL AND NEW.target_type IS NOT NULL THEN NEW.resource_type := NEW.target_type; END IF;
  IF NEW.target_id IS NULL AND NEW.resource_id IS NOT NULL THEN NEW.target_id := NEW.resource_id::text; END IF;
  IF NEW.resource_id IS NULL AND NEW.target_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    NEW.resource_id := NEW.target_id::uuid;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_admin_activity_resource_aliases ON public.admin_activity_logs;
CREATE TRIGGER trg_sync_admin_activity_resource_aliases
BEFORE INSERT OR UPDATE ON public.admin_activity_logs
FOR EACH ROW EXECUTE FUNCTION public.sync_admin_activity_resource_aliases();