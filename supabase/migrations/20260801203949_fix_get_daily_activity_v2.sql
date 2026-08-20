-- Fix get_daily_activity_v2: ambiguous column d
CREATE OR REPLACE FUNCTION public.get_daily_activity_v2(
  p_days integer DEFAULT 30
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id UUID := auth.uid();
  v_is_admin BOOLEAN;
  v_start TIMESTAMP := now() - (p_days || ' days')::INTERVAL;
BEGIN
  SELECT (is_admin = true AND admin_status = 'active') OR role IN ('admin', 'super_admin', 'moderator')
  INTO v_is_admin FROM users WHERE id = v_admin_id;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  RETURN (
    SELECT jsonb_agg(jsonb_build_object(
      'date', days.d::date,
      'views', COALESCE(v.cnt, 0),
      'purchases', COALESCE(p.cnt, 0),
      'signups', COALESCE(s.cnt, 0)
    ) ORDER BY days.d)
    FROM (
      SELECT generate_series(date_trunc('day', v_start), date_trunc('day', now()), '1 day'::interval) AS d
    ) days
    LEFT JOIN (
      SELECT date_trunc('day', created_at) AS d, count(*) AS cnt
      FROM analytics_events WHERE event_type IN ('product_view','service_view','job_view','course_view','profile_view') AND created_at >= v_start
      GROUP BY 1
    ) v ON v.d = days.d
    LEFT JOIN (
      SELECT date_trunc('day', created_at) AS d, count(*) AS cnt
      FROM analytics_events WHERE event_type = 'purchase' AND created_at >= v_start
      GROUP BY 1
    ) p ON p.d = days.d
    LEFT JOIN (
      SELECT date_trunc('day', created_at) AS d, count(*) AS cnt
      FROM users WHERE created_at >= v_start
      GROUP BY 1
    ) s ON s.d = days.d
  );
END;
$function$;