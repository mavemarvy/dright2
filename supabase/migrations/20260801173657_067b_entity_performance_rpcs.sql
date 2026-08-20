-- JOB PERFORMANCE
CREATE OR REPLACE FUNCTION get_job_performance(
  p_job_id UUID,
  p_days INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start TIMESTAMP := now() - (p_days || ' days')::INTERVAL;
BEGIN
  RETURN jsonb_build_object(
    'views', (SELECT count(*) FROM analytics_events WHERE entity_id = p_job_id AND entity_type = 'job' AND event_type = 'job_view' AND created_at >= v_start),
    'unique_visitors', (SELECT count(DISTINCT COALESCE(viewer_id::text, session_id)) FROM analytics_events WHERE entity_id = p_job_id AND entity_type = 'job' AND event_type = 'job_view' AND created_at >= v_start),
    'applications', (SELECT count(*) FROM analytics_events WHERE entity_id = p_job_id AND entity_type = 'job' AND event_type = 'job_apply' AND created_at >= v_start),
    'shortlisted', (SELECT count(*) FROM analytics_events WHERE entity_id = p_job_id AND entity_type = 'job' AND event_type = 'job_shortlisted' AND created_at >= v_start),
    'interviewed', (SELECT count(*) FROM analytics_events WHERE entity_id = p_job_id AND entity_type = 'job' AND event_type = 'job_interviewed' AND created_at >= v_start),
    'accepted', (SELECT count(*) FROM analytics_events WHERE entity_id = p_job_id AND entity_type = 'job' AND event_type = 'job_accepted' AND created_at >= v_start),
    'rejected', (SELECT count(*) FROM analytics_events WHERE entity_id = p_job_id AND entity_type = 'job' AND event_type = 'job_rejected' AND created_at >= v_start),
    'employer_response_time', (SELECT COALESCE(ROUND(avg((metadata->>'hours')::numeric)), 0) FROM analytics_events WHERE entity_id = p_job_id AND entity_type = 'job' AND event_type = 'employer_response' AND metadata->>'hours' IS NOT NULL AND created_at >= v_start),
    'average_salary', (SELECT COALESCE(ROUND(avg((metadata->>'salary')::numeric)), 0) FROM analytics_events WHERE entity_id = p_job_id AND entity_type = 'job' AND event_type = 'job_apply' AND metadata->>'salary' IS NOT NULL AND created_at >= v_start),
    'location_interest', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('city', city, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT city, count(*) AS cnt FROM analytics_events WHERE entity_id = p_job_id AND entity_type = 'job' AND event_type = 'job_view' AND city IS NOT NULL AND created_at >= v_start GROUP BY city ORDER BY cnt DESC LIMIT 10) t
    ),
    'ctr', (
      SELECT CASE WHEN count(*) > 0 THEN ROUND((count(*) FILTER (WHERE event_type = 'job_apply')::numeric / count(*) * 100), 2) ELSE 0 END
      FROM analytics_events WHERE entity_id = p_job_id AND entity_type = 'job' AND event_type IN ('job_view','job_apply') AND created_at >= v_start
    ),
    'conversion', (
      SELECT CASE WHEN count(*) > 0 THEN ROUND((count(*) FILTER (WHERE event_type = 'job_accepted')::numeric / count(*) * 100), 2) ELSE 0 END
      FROM analytics_events WHERE entity_id = p_job_id AND entity_type = 'job' AND event_type IN ('job_view','job_accepted') AND created_at >= v_start
    ),
    'referral_traffic', (SELECT count(*) FROM analytics_events WHERE entity_id = p_job_id AND entity_type = 'job' AND event_type = 'job_view' AND source = 'referral' AND created_at >= v_start),
    'promotion_performance', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('source', source, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT source, count(*) AS cnt FROM analytics_events WHERE entity_id = p_job_id AND entity_type = 'job' AND event_type = 'job_view' AND source NOT IN ('direct','organic') AND created_at >= v_start GROUP BY source ORDER BY cnt DESC) t
    ),
    'daily_views', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d::date, 'count', cnt) ORDER BY d), '[]'::jsonb)
      FROM (SELECT date_trunc('day', created_at) AS d, count(*) AS cnt FROM analytics_events WHERE entity_id = p_job_id AND entity_type = 'job' AND event_type = 'job_view' AND created_at >= v_start GROUP BY d ORDER BY d) t
    ),
    'daily_applications', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d::date, 'count', cnt) ORDER BY d), '[]'::jsonb)
      FROM (SELECT date_trunc('day', created_at) AS d, count(*) AS cnt FROM analytics_events WHERE entity_id = p_job_id AND entity_type = 'job' AND event_type = 'job_apply' AND created_at >= v_start GROUP BY d ORDER BY d) t
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_job_performance TO authenticated;
GRANT EXECUTE ON FUNCTION get_job_performance TO anon;

-- SERVICE PERFORMANCE
CREATE OR REPLACE FUNCTION get_service_performance(
  p_service_id UUID,
  p_days INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start TIMESTAMP := now() - (p_days || ' days')::INTERVAL;
BEGIN
  RETURN jsonb_build_object(
    'views', (SELECT count(*) FROM analytics_events WHERE entity_id = p_service_id AND entity_type = 'service' AND event_type = 'service_view' AND created_at >= v_start),
    'unique_visitors', (SELECT count(DISTINCT COALESCE(viewer_id::text, session_id)) FROM analytics_events WHERE entity_id = p_service_id AND entity_type = 'service' AND event_type = 'service_view' AND created_at >= v_start),
    'orders', (SELECT count(*) FROM orders WHERE product_id = p_service_id AND created_at >= v_start),
    'completed_orders', (SELECT count(*) FROM orders WHERE product_id = p_service_id AND status = 'COMPLETED' AND created_at >= v_start),
    'cancelled_orders', (SELECT count(*) FROM orders WHERE product_id = p_service_id AND status = 'CANCELLED' AND created_at >= v_start),
    'average_delivery_time', (SELECT COALESCE(ROUND(avg((metadata->>'hours')::numeric)), 0) FROM analytics_events WHERE entity_id = p_service_id AND event_type = 'service_delivered' AND metadata->>'hours' IS NOT NULL AND created_at >= v_start),
    'average_rating', (SELECT COALESCE(ROUND(avg(rating), 2), 0) FROM product_reviews WHERE product_id = p_service_id),
    'repeat_customers', (
      SELECT count(*) FROM (
        SELECT buyer_id FROM orders WHERE product_id = p_service_id AND status = 'COMPLETED' AND created_at >= v_start
        GROUP BY buyer_id HAVING count(*) > 1
      ) t
    ),
    'revenue', (SELECT COALESCE(sum(final_price), 0) FROM orders WHERE product_id = p_service_id AND status = 'COMPLETED' AND created_at >= v_start),
    'conversion', (
      SELECT CASE WHEN count(*) > 0 THEN ROUND((count(*) FILTER (WHERE event_type = 'purchase')::numeric / count(*) * 100), 2) ELSE 0 END
      FROM analytics_events WHERE entity_id = p_service_id AND event_type IN ('service_view','purchase') AND created_at >= v_start
    ),
    'chats_started', (SELECT count(*) FROM analytics_events WHERE entity_id = p_service_id AND event_type = 'chat_started' AND created_at >= v_start),
    'response_time', (SELECT COALESCE(ROUND(avg((metadata->>'minutes')::numeric)), 0) FROM analytics_events WHERE entity_id = p_service_id AND event_type = 'chat_response' AND metadata->>'minutes' IS NOT NULL AND created_at >= v_start),
    'customer_satisfaction', (SELECT COALESCE(ROUND(avg(rating), 2), 0) FROM product_reviews WHERE product_id = p_service_id),
    'refund_rate', (
      SELECT CASE WHEN count(*) > 0 THEN ROUND((count(*) FILTER (WHERE status = 'CANCELLED')::numeric / count(*) * 100), 2) ELSE 0 END
      FROM orders WHERE product_id = p_service_id AND created_at >= v_start
    ),
    'daily_views', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d::date, 'count', cnt) ORDER BY d), '[]'::jsonb)
      FROM (SELECT date_trunc('day', created_at) AS d, count(*) AS cnt FROM analytics_events WHERE entity_id = p_service_id AND entity_type = 'service' AND event_type = 'service_view' AND created_at >= v_start GROUP BY d ORDER BY d) t
    ),
    'daily_revenue', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d::date, 'revenue', rev) ORDER BY d), '[]'::jsonb)
      FROM (SELECT date_trunc('day', created_at) AS d, COALESCE(sum(final_price), 0) AS rev FROM orders WHERE product_id = p_service_id AND status = 'COMPLETED' AND created_at >= v_start GROUP BY d ORDER BY d) t
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_service_performance TO authenticated;
GRANT EXECUTE ON FUNCTION get_service_performance TO anon;

-- COURSE PERFORMANCE
CREATE OR REPLACE FUNCTION get_course_performance(
  p_course_id UUID,
  p_days INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start TIMESTAMP := now() - (p_days || ' days')::INTERVAL;
BEGIN
  RETURN jsonb_build_object(
    'views', (SELECT count(*) FROM analytics_events WHERE entity_id = p_course_id AND entity_type = 'course' AND event_type = 'course_view' AND created_at >= v_start),
    'unique_visitors', (SELECT count(DISTINCT COALESCE(viewer_id::text, session_id)) FROM analytics_events WHERE entity_id = p_course_id AND entity_type = 'course' AND event_type = 'course_view' AND created_at >= v_start),
    'enrollments', (SELECT count(*) FROM analytics_events WHERE entity_id = p_course_id AND entity_type = 'course' AND event_type = 'course_enroll' AND created_at >= v_start),
    'course_completion', (SELECT count(*) FROM analytics_events WHERE entity_id = p_course_id AND entity_type = 'course' AND event_type = 'course_complete' AND created_at >= v_start),
    'average_watch_time', (SELECT COALESCE(ROUND(avg(session_duration)), 0) FROM analytics_events WHERE entity_id = p_course_id AND entity_type = 'course' AND event_type = 'course_view' AND session_duration IS NOT NULL AND created_at >= v_start),
    'quiz_completion', (SELECT count(*) FROM analytics_events WHERE entity_id = p_course_id AND entity_type = 'course' AND event_type = 'quiz_complete' AND created_at >= v_start),
    'downloads', (SELECT count(*) FROM analytics_events WHERE entity_id = p_course_id AND entity_type = 'course' AND event_type = 'download' AND created_at >= v_start),
    'certificates_issued', (SELECT count(*) FROM analytics_events WHERE entity_id = p_course_id AND entity_type = 'course' AND event_type = 'certificate_issued' AND created_at >= v_start),
    'revenue', (SELECT COALESCE(sum(final_price), 0) FROM orders WHERE product_id = p_course_id AND status = 'COMPLETED' AND created_at >= v_start),
    'refunds', (SELECT count(*) FROM orders WHERE product_id = p_course_id AND status = 'CANCELLED' AND created_at >= v_start),
    'student_satisfaction', (SELECT COALESCE(ROUND(avg(rating), 2), 0) FROM product_reviews WHERE product_id = p_course_id),
    'drop_off_points', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('point', point, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT metadata->>'chapter' AS point, count(*) AS cnt FROM analytics_events WHERE entity_id = p_course_id AND entity_type = 'course' AND event_type = 'course_dropoff' AND metadata->>'chapter' IS NOT NULL AND created_at >= v_start GROUP BY metadata->>'chapter' ORDER BY cnt DESC LIMIT 5) t
    ),
    'top_countries', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('country', country, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT country, count(*) AS cnt FROM analytics_events WHERE entity_id = p_course_id AND entity_type = 'course' AND event_type = 'course_enroll' AND country IS NOT NULL AND created_at >= v_start GROUP BY country ORDER BY cnt DESC LIMIT 10) t
    ),
    'top_devices', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('device', device_type, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT device_type, count(*) AS cnt FROM analytics_events WHERE entity_id = p_course_id AND entity_type = 'course' AND event_type = 'course_view' AND device_type IS NOT NULL AND created_at >= v_start GROUP BY device_type) t
    ),
    'daily_views', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d::date, 'count', cnt) ORDER BY d), '[]'::jsonb)
      FROM (SELECT date_trunc('day', created_at) AS d, count(*) AS cnt FROM analytics_events WHERE entity_id = p_course_id AND entity_type = 'course' AND event_type = 'course_view' AND created_at >= v_start GROUP BY d ORDER BY d) t
    ),
    'daily_enrollments', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d::date, 'count', cnt) ORDER BY d), '[]'::jsonb)
      FROM (SELECT date_trunc('day', created_at) AS d, count(*) AS cnt FROM analytics_events WHERE entity_id = p_course_id AND entity_type = 'course' AND event_type = 'course_enroll' AND created_at >= v_start GROUP BY d ORDER BY d) t
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_course_performance TO authenticated;
GRANT EXECUTE ON FUNCTION get_course_performance TO anon;
