/*
# Security Fixes: Mutable Search Path, Extension Location, and EXECUTE Grants

## Summary
This migration addresses three categories of security findings:
1. **Function Search Path Mutable** (17 functions) — pins each function's search_path to `public` so a malicious user cannot hijack unqualified object references.
2. **Extension in Public** (`pg_trgm`) — moves the extension from `public` to the `extensions` schema where it belongs.
3. **Public/Signed-In Users Can Execute SECURITY DEFINER Function** (147 functions) — revokes `EXECUTE` from `anon` on all 147 SECURITY DEFINER functions, and additionally revokes from `authenticated` on the 35 functions not called from the frontend. The remaining 112 functions keep `authenticated` EXECUTE so the signed-in app continues to work. Edge functions use the service role key which bypasses EXECUTE checks, so they are unaffected.

## Changes

### 1. Fix Mutable Search Paths (17 functions)
Each function gets `ALTER FUNCTION ... SET search_path = public` to lock the search path.

### 2. Move pg_trgm Extension
- Create `extensions` schema if it does not exist.
- Move `pg_trgm` extension from `public` to `extensions` schema.

### 3. Revoke EXECUTE Grants
- Revoke `EXECUTE` from `anon` on all 147 SECURITY DEFINER functions.
- Revoke `EXECUTE` from `authenticated` on 35 functions not called from the frontend.
- The 112 functions called from the frontend keep `authenticated` EXECUTE.

## Important Notes
- No data is lost; no tables or columns are changed.
- Edge functions use the service role key and bypass EXECUTE checks, so they are unaffected.
- The `extensions` schema is already in the database's default search_path, so existing queries using pg_trgm operators continue to work.
*/

-- ============================================================
-- 1. Fix Mutable Search Paths on 17 functions
-- ============================================================

ALTER FUNCTION public.increment_sales_counts(user_id uuid) SET search_path = public;
ALTER FUNCTION public.increment_referral_clicks(p_referrer_id uuid) SET search_path = public;
ALTER FUNCTION public.increment_referral_conversions(p_referrer_id uuid) SET search_path = public;
ALTER FUNCTION public.add_affiliate_earnings(p_user_id uuid, p_amount numeric) SET search_path = public;
ALTER FUNCTION public.expire_referral_rewards() SET search_path = public;
ALTER FUNCTION public.refresh_referral_stats(p_user_id uuid) SET search_path = public;
ALTER FUNCTION public.generate_receipt_number() SET search_path = public;
ALTER FUNCTION public.generate_refund_number() SET search_path = public;
ALTER FUNCTION public.generate_ledger_entry_id() SET search_path = public;
ALTER FUNCTION public.get_platform_financial_summary() SET search_path = public;
ALTER FUNCTION public.get_user_transaction_history(p_user_id uuid, p_status text, p_category text, p_date_from timestamp with time zone, p_date_to timestamp with time zone, p_search text, p_limit integer, p_offset integer) SET search_path = public;
ALTER FUNCTION public.search_platform_transactions(p_search text, p_status text, p_category text, p_user_id uuid, p_date_from timestamp with time zone, p_date_to timestamp with time zone, p_limit integer, p_offset integer) SET search_path = public;
ALTER FUNCTION public.check_duplicate_payment_attempt(p_user_id uuid, p_amount numeric, p_purpose text, p_window_minutes integer) SET search_path = public;
ALTER FUNCTION public.cms_set_updated_at() SET search_path = public;
ALTER FUNCTION public.content_set_updated_at() SET search_path = public;
ALTER FUNCTION public.update_banner_updated_at() SET search_path = public;
ALTER FUNCTION public.update_updated_at() SET search_path = public;

-- ============================================================
-- 2. Move pg_trgm extension from public to extensions schema
-- ============================================================

CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;

-- ============================================================
-- 3. Revoke EXECUTE on SECURITY DEFINER functions
-- ============================================================

-- 3a. Revoke EXECUTE from anon on ALL 147 SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.activate_campaign(p_campaign_id uuid, p_payment_id text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.add_affiliate_earnings(p_user_id uuid, p_amount numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.add_commission_split(p_escrow_id uuid, p_recipient_id uuid, p_recipient_role text, p_amount numeric, p_percentage numeric, p_balance_field text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.add_reward_to_wallet(p_user_id uuid, p_reward_type text, p_amount numeric, p_description text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_force_lockout(p_user_id uuid, p_reason text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_freeze_wallet(p_admin_id uuid, p_wallet_id uuid, p_freeze boolean, p_reason text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_auth_activity(p_limit integer, p_offset integer, p_event_type text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_manual_adjustment(p_admin_id uuid, p_user_id uuid, p_wallet_id uuid, p_type text, p_amount numeric, p_description text, p_balance_field text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_reset_login_attempts(p_email text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_unlock_account(p_user_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.ai_product_optimization_score(p_product_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.auto_version_prompt() FROM anon;
REVOKE EXECUTE ON FUNCTION public.award_badge(p_user_id uuid, p_badge_type text, p_badge_name text, p_description text, p_icon text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_trust_score(p_user_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_duplicate_payment_attempt(p_user_id uuid, p_amount numeric, p_purpose text, p_window_minutes integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_velocity(p_user_id uuid, p_action text, p_window_minutes integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_dispute(p_buyer_id uuid, p_seller_id uuid, p_reason text, p_product_id uuid, p_transaction_id uuid, p_description text, p_claim_amount numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_escrow_payment(p_order_id uuid, p_buyer_id uuid, p_seller_id uuid, p_amount numeric, p_platform_fee numeric, p_seller_earnings numeric, p_auto_release_hours integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_invoice(p_user_id uuid, p_amount numeric, p_currency text, p_invoice_type text, p_order_id uuid, p_subscription_id uuid, p_line_items jsonb, p_billing_details jsonb, p_discount_amount numeric, p_tax_amount numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_pin_recovery_token(p_user_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_withdrawal_request(p_user_id uuid, p_amount numeric, p_bank_account_id uuid, p_pin_verified boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.expire_campaigns() FROM anon;
REVOKE EXECUTE ON FUNCTION public.expire_referral_rewards() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_coupon_code(p_prefix text, p_length integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_invoice_number() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_recovery_codes(p_user_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_analytics(p_days integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_analytics_v2(p_days integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_financial_dashboard() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_intelligence_v2(p_days integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_payment_security_summary() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_trust_center_summary() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_affiliate_analytics(p_affiliate_id uuid, p_days integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_affiliate_deep_analytics(p_affiliate_id uuid, p_days integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_affiliate_score(p_affiliate_id uuid, p_days integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_ai_conversation_messages(p_conversation_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_ai_conversations(p_assistant_type text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_ai_marketplace_usage_summary() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_ai_memory(p_scope text, p_memory_type text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_ai_prompt_by_key(p_key text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_ai_provider_config() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_ai_rate_limits_for_tier(p_tier text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_ai_usage_daily(p_days integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_ai_usage_monthly(p_months integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_ai_user_usage_summary(p_user_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_analytics_alerts(p_seller_id uuid, p_days integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_auth_activity(p_limit integer, p_offset integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_buyer_analytics(p_buyer_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_buyer_analytics_v2(p_buyer_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_competitor_benchmarking(p_seller_id uuid, p_days integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_course_performance(p_course_id uuid, p_days integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_creator_campaign_analytics(p_campaign_id uuid, p_days integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_creator_campaign_analytics_v2(p_campaign_id uuid, p_days integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_customer_journey(p_seller_id uuid, p_entity_id uuid, p_days integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_daily_activity_v2(p_days integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_entity_analytics(p_entity_type text, p_entity_id uuid, p_days integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_executive_kpis() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_financial_dashboard(p_seller_id uuid, p_days integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_financial_summary() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_following_feed(p_limit integer, p_offset integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_fraud_detection(p_seller_id uuid, p_days integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_fraud_events(p_user_id uuid, p_limit integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_funnel_analytics(p_seller_id uuid, p_days integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_heatmap_analytics(p_seller_id uuid, p_days integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_heatmap_data(p_seller_id uuid, p_entity_id uuid, p_days integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_job_performance(p_job_id uuid, p_days integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_leaderboard(p_category text, p_period text, p_limit integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_live_leaderboards(p_category text, p_period text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_marketplace_analytics() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_marketplace_scores(p_entity_type text, p_entity_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_moderation_queue(p_status text, p_limit integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_mutual_friends(p_user_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_mutual_friends_count(p_user_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_payment_analytics() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_payment_security_status(p_user_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_platform_financial_summary() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_prediction_engine(p_entity_type text, p_entity_id uuid, p_window text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_product_analytics_detail(p_product_id uuid, p_days integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_product_performance_detail(p_product_id uuid, p_days integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_product_view_count(p_product_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_product_view_sources(p_product_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_product_view_sources_v2(p_product_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_profile_analytics(p_profile_id uuid, p_days integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_promotion_analytics(p_promotion_id uuid, p_days integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_recommendation_ai(p_seller_id uuid, p_entity_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_recovery_codes_status(p_user_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_referral_intelligence(p_user_id uuid, p_days integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_referral_program_analytics(p_user_id uuid, p_days integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_search_analytics(p_days integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_seller_analytics(p_seller_id uuid, p_days integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_seller_analytics_v2(p_seller_id uuid, p_days integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_seller_product_performance(p_seller_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_seller_product_performance_ranged(p_seller_id uuid, p_days integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_seller_product_performance_v2(p_seller_id uuid, p_days integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_seller_products_performance(p_seller_id uuid, p_days integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_service_performance(p_service_id uuid, p_days integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_social_analytics(p_user_id uuid, p_days integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_sponsored_listings(p_placement text, p_limit integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_suggested_users(p_limit integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_trending_engine(p_scope text, p_seller_id uuid, p_limit integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_trust_score(p_user_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_badges(p_user_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_risk_score(p_user_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_transaction_history(p_user_id uuid, p_status text, p_category text, p_date_from timestamp with time zone, p_date_to timestamp with time zone, p_search text, p_limit integer, p_offset integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_wallet_balances(p_user_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_wallet_summary(p_user_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_wallet_transactions(p_user_id uuid, p_limit integer, p_offset integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_cache_hits(p_cache_key text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_conversation_stats(p_conversation_id uuid, p_tokens integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_product_sales(p_product_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_product_view(p_product_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_referral_clicks(p_referrer_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_referral_conversions(p_referrer_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_sales_counts(user_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin(user_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_admin_activity(p_action text, p_target_type text, p_target_id text, p_details jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_auth_activity(p_event_type text, p_success boolean, p_reason text, p_user_agent text, p_device_fingerprint text, p_country text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_invoice_paid(p_invoice_id uuid, p_payment_reference text, p_payment_provider text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.moderate_product_content(p_product_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_paystack_payment(p_reference text, p_user_id uuid, p_amount numeric, p_purpose text, p_reference_id uuid, p_metadata jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_wallet_transaction(p_user_id uuid, p_wallet_id uuid, p_type text, p_amount numeric, p_description text, p_reference_type text, p_reference_id uuid, p_metadata jsonb, p_balance_field text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_fraud_event(p_user_id uuid, p_alert_type text, p_severity text, p_description text, p_metadata jsonb, p_ip_address text, p_country text, p_device_fingerprint text, p_browser text, p_action_type text, p_risk_delta integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_login_attempt(p_email text, p_success boolean, p_user_agent text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.redeem_coupon(p_code text, p_user_id uuid, p_amount numeric, p_listing_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refresh_referral_stats(p_user_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.release_escrow(p_escrow_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reset_login_attempts(p_email text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reset_payment_pin(p_user_id uuid, p_new_pin_hash text, p_pin_length integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.resolve_bank_account(p_account_number text, p_bank_code text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.save_ai_conversation(p_assistant_type text, p_title text, p_messages jsonb, p_context jsonb, p_conversation_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.save_ai_memory(p_key text, p_value jsonb, p_user_id uuid, p_memory_type text, p_scope text, p_confidence numeric, p_source text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.search_ai_memory(p_query text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.search_platform_transactions(p_search text, p_status text, p_category text, p_user_id uuid, p_date_from timestamp with time zone, p_date_to timestamp with time zone, p_limit integer, p_offset integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.search_users(p_query text, p_limit integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_payment_pin(p_user_id uuid, p_pin_hash text, p_pin_length integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_product_stats(p_product_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.track_analytics_event(p_event_type text, p_entity_type text, p_entity_id uuid, p_seller_id uuid, p_session_id text, p_device_hash text, p_browser text, p_country text, p_city text, p_referrer text, p_source text, p_metadata jsonb, p_is_bot boolean, p_device_type text, p_os text, p_browser_name text, p_state text, p_language text, p_timezone text, p_session_duration integer, p_is_bounce boolean, p_keywords text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.unlock_payment_pin(p_user_id uuid, p_admin_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_banner_updated_at() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_moderation_status(p_id uuid, p_status text, p_note text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_payment_auth_rules(p_user_id uuid, p_rules jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.validate_coupon(p_code text, p_user_id uuid, p_amount numeric, p_listing_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.verify_payment_pin(p_user_id uuid, p_pin_hash text, p_context text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.verify_pin_recovery_token(p_token text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.verify_recovery_code(p_user_id uuid, p_code text) FROM anon;

-- 3b. Revoke EXECUTE from authenticated on 35 functions NOT called from frontend
-- (edge functions use service role key which bypasses EXECUTE checks)
REVOKE EXECUTE ON FUNCTION public.add_commission_split(p_escrow_id uuid, p_recipient_id uuid, p_recipient_role text, p_amount numeric, p_percentage numeric, p_balance_field text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_version_prompt() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.calculate_trust_score(p_user_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.check_duplicate_payment_attempt(p_user_id uuid, p_amount numeric, p_purpose text, p_window_minutes integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_escrow_payment(p_order_id uuid, p_buyer_id uuid, p_seller_id uuid, p_amount numeric, p_platform_fee numeric, p_seller_earnings numeric, p_auto_release_hours integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_campaigns() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_invoice_number() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_ai_conversation_messages(p_conversation_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_ai_conversations(p_assistant_type text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_ai_usage_monthly(p_months integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_ai_user_usage_summary(p_user_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_course_performance(p_course_id uuid, p_days integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_following_feed(p_limit integer, p_offset integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_heatmap_analytics(p_seller_id uuid, p_days integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_job_performance(p_job_id uuid, p_days integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_payment_analytics() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_product_view_count(p_product_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_product_view_sources(p_product_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_seller_product_performance(p_seller_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_seller_product_performance_ranged(p_seller_id uuid, p_days integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_service_performance(p_service_id uuid, p_days integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_product_sales(p_product_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_product_view(p_product_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_sales_counts(user_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin(user_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin_user() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.process_paystack_payment(p_reference text, p_user_id uuid, p_amount numeric, p_purpose text, p_reference_id uuid, p_metadata jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.release_escrow(p_escrow_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.save_ai_conversation(p_assistant_type text, p_title text, p_messages jsonb, p_context jsonb, p_conversation_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.search_users(p_query text, p_limit integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_product_stats(p_product_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.track_analytics_event(p_event_type text, p_entity_type text, p_entity_id uuid, p_seller_id uuid, p_session_id text, p_device_hash text, p_browser text, p_country text, p_city text, p_referrer text, p_source text, p_metadata jsonb, p_is_bot boolean, p_device_type text, p_os text, p_browser_name text, p_state text, p_language text, p_timezone text, p_session_duration integer, p_is_bounce boolean, p_keywords text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_banner_updated_at() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_recovery_code(p_user_id uuid, p_code text) FROM authenticated;
