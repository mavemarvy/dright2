-- Permit server/service-role financial events to be audited without fabricating a user actor.

ALTER TABLE public.financial_audit_logs
  ALTER COLUMN actor_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.log_financial_audit(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_before_state jsonb,
  p_after_state jsonb,
  p_description text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_role text := NULLIF(auth.role(), '');
  v_actor_name text;
BEGIN
  IF v_actor_id IS NULL THEN
    v_actor_name := 'DRIGHT System';
    v_actor_role := COALESCE(v_actor_role, 'service_role');
  END IF;

  INSERT INTO public.financial_audit_logs (
    action, entity_type, entity_id, actor_id, actor_role, actor_name,
    before_state, after_state, description, ip_address
  )
  VALUES (
    p_action, p_entity_type, p_entity_id, v_actor_id, v_actor_role, v_actor_name,
    p_before_state, p_after_state, p_description, NULL
  );
END;
$function$;
