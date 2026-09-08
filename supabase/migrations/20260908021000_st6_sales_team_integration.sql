-- ST-6 — Sales Team Integration authority hardening.
-- Reuses the existing sales_team_contracts, sales_teams, referral_links and Paystack ledger.

ALTER TABLE public.sales_team_contracts
  ADD COLUMN IF NOT EXISTS selected_tier text,
  ADD COLUMN IF NOT EXISTS task_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS payment_id text,
  ADD COLUMN IF NOT EXISTS payment_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS pricing_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.sales_team_contracts DROP CONSTRAINT IF EXISTS sales_team_contracts_status_check;
ALTER TABLE public.sales_team_contracts ADD CONSTRAINT sales_team_contracts_status_check
  CHECK (status IN ('pending','active','expired','cancelled'));

ALTER TABLE public.sales_team_contracts DROP CONSTRAINT IF EXISTS sales_team_contracts_payment_status_check;
ALTER TABLE public.sales_team_contracts ADD CONSTRAINT sales_team_contracts_payment_status_check
  CHECK (payment_status IN ('pending','paid','failed','refunded','cancelled'));

ALTER TABLE public.sales_team_contracts DROP CONSTRAINT IF EXISTS sales_team_contracts_selected_tier_check;
ALTER TABLE public.sales_team_contracts ADD CONSTRAINT sales_team_contracts_selected_tier_check
  CHECK (selected_tier IS NULL OR selected_tier IN ('Mkt L3','Mkt L4','Mkt L5','Adv A','Adv B','Adv C','Adv Pro','Adv Super','Adv Partnership'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_team_contract_payment_id
  ON public.sales_team_contracts(payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_team_contract_assignment
  ON public.sales_team_contracts(sales_team_id, product_id, status, payment_status, expires_at);
CREATE INDEX IF NOT EXISTS idx_sales_team_contract_seller_product
  ON public.sales_team_contracts(seller_id, product_id, status, payment_status);

-- Existing rows are absent in production today. Keep compatibility if an older environment has rows.
UPDATE public.sales_team_contracts
SET payment_status = CASE WHEN status='active' THEN 'paid' ELSE payment_status END,
    selected_tier = COALESCE(selected_tier, NULLIF((SELECT p.sales_team_tier FROM public.products p WHERE p.id=product_id),'')),
    task_percent = CASE WHEN task_percent=0 THEN COALESCE((SELECT p.sales_team_task_percent FROM public.products p WHERE p.id=product_id),0) ELSE task_percent END,
    billing_currency = COALESCE(NULLIF(billing_currency,''),'USD')
WHERE selected_tier IS NULL OR task_percent=0 OR billing_currency IS NULL OR billing_currency='';

-- Browser roles may read their contracts but cannot create/activate/financially mutate them directly.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.sales_team_contracts FROM anon, authenticated;
DROP POLICY IF EXISTS insert_own_contracts_seller ON public.sales_team_contracts;
DROP POLICY IF EXISTS update_own_contracts_seller ON public.sales_team_contracts;
DROP POLICY IF EXISTS admin_all_access_contracts ON public.sales_team_contracts;
DROP POLICY IF EXISTS select_own_contracts_seller ON public.sales_team_contracts;
CREATE POLICY select_own_contracts_seller ON public.sales_team_contracts
FOR SELECT TO authenticated
USING (auth.uid()=seller_id OR auth.uid()=sales_team_id OR public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.sales_team_contract_interval(p_duration text)
RETURNS interval
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE p_duration WHEN '1_week' THEN interval '7 days' WHEN '2_weeks' THEN interval '14 days' WHEN '1_month' THEN interval '1 month' ELSE NULL END
$$;
REVOKE ALL ON FUNCTION public.sales_team_contract_interval(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_team_contract_interval(text) TO service_role;

CREATE OR REPLACE FUNCTION public.create_sales_team_contract_request(
  p_product_id uuid,
  p_selected_tier text,
  p_duration text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cfg public.system_config%ROWTYPE;
  v_assignee uuid;
  v_amount numeric;
  v_task numeric;
  v_multiplier numeric;
  v_key text;
  v_contract public.sales_team_contracts%ROWTYPE;
  v_existing public.sales_team_contracts%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_duration NOT IN ('1_week','2_weeks','1_month') THEN RAISE EXCEPTION 'Unsupported duration'; END IF;
  IF p_selected_tier NOT IN ('Mkt L3','Mkt L4','Mkt L5','Adv A','Adv B','Adv C','Adv Pro','Adv Super','Adv Partnership') THEN
    RAISE EXCEPTION 'Unsupported sales team tier';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id=p_product_id AND p.uploaded_by=v_uid) THEN
    RAISE EXCEPTION 'Product does not belong to authenticated seller';
  END IF;
  SELECT * INTO v_cfg FROM public.system_config WHERE singleton=true LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sales team pricing is not configured'; END IF;
  v_multiplier := CASE p_duration WHEN '1_week' THEN 1 WHEN '2_weeks' THEN 2 ELSE 4 END;

  IF p_selected_tier LIKE 'Mkt L%' THEN
    v_key := replace(p_selected_tier,'Mkt L','');
    v_amount := COALESCE((v_cfg.marketer_sub_prices->>v_key)::numeric,0) * v_multiplier;
    v_task := COALESCE((v_cfg.marketer_task_pcts->>v_key)::numeric,0);
    SELECT u.id INTO v_assignee
    FROM public.users u
    JOIN public.sales_team_members stm ON stm.user_id=u.id AND stm.status='active'
    JOIN public.sales_teams st ON st.id=stm.sales_team_id AND st.status='active'
    WHERE u.marketer_status='approved'
      AND u.marketer_level=v_key::int
      AND stm.marketer_level=v_key::int
      AND COALESCE(u.account_status,'active')='active'
    ORDER BY (SELECT count(*) FROM public.sales_team_contracts c WHERE c.sales_team_id=u.id AND c.status IN ('pending','active') AND c.expires_at>now()), u.id
    LIMIT 1;
  ELSE
    v_key := replace(p_selected_tier,'Adv ','');
    v_amount := COALESCE((v_cfg.advertiser_sub_prices->>v_key)::numeric,0) * v_multiplier;
    v_task := COALESCE((v_cfg.advertiser_task_pcts->>v_key)::numeric,0);
    SELECT u.id INTO v_assignee
    FROM public.users u
    WHERE u.advertiser_status='approved'
      AND u.advertiser_grade=v_key
      AND COALESCE(u.account_status,'active')='active'
    ORDER BY (SELECT count(*) FROM public.sales_team_contracts c WHERE c.sales_team_id=u.id AND c.status IN ('pending','active') AND c.expires_at>now()), u.id
    LIMIT 1;
  END IF;

  IF v_amount <= 0 OR v_task <= 0 THEN RAISE EXCEPTION 'Sales team pricing is invalid'; END IF;
  IF v_assignee IS NULL THEN RAISE EXCEPTION 'No eligible sales team member is currently available for this tier'; END IF;

  SELECT * INTO v_existing FROM public.sales_team_contracts c
  WHERE c.seller_id=v_uid AND c.product_id=p_product_id
    AND c.status IN ('pending','active')
    AND (c.status='pending' OR c.expires_at>now())
  ORDER BY c.created_at DESC LIMIT 1;
  IF FOUND THEN
    IF v_existing.status='active' THEN RAISE EXCEPTION 'This product already has an active sales team contract'; END IF;
    IF v_existing.selected_tier=p_selected_tier AND v_existing.duration=p_duration THEN
      RETURN jsonb_build_object('success',true,'idempotent',true,'contract_id',v_existing.id,'amount',v_existing.total_amount,'currency',v_existing.billing_currency,'assigned_user_id',v_existing.sales_team_id);
    END IF;
    UPDATE public.sales_team_contracts SET status='cancelled',payment_status='cancelled' WHERE id=v_existing.id;
  END IF;

  INSERT INTO public.sales_team_contracts(
    seller_id,sales_team_id,product_id,duration,total_amount,status,admin_cut_applied,
    starts_at,expires_at,selected_tier,task_percent,billing_currency,payment_status,pricing_snapshot
  ) VALUES (
    v_uid,v_assignee,p_product_id,p_duration,v_amount,'pending',false,
    now(),now()+public.sales_team_contract_interval(p_duration),p_selected_tier,v_task,'USD','pending',
    jsonb_build_object('tier',p_selected_tier,'duration',p_duration,'subscription_amount',v_amount,'task_percent',v_task,'currency','USD','captured_at',now())
  ) RETURNING * INTO v_contract;

  RETURN jsonb_build_object('success',true,'contract_id',v_contract.id,'amount',v_contract.total_amount,'currency',v_contract.billing_currency,'assigned_user_id',v_contract.sales_team_id);
END;
$$;
REVOKE ALL ON FUNCTION public.create_sales_team_contract_request(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sales_team_contract_request(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.process_verified_sales_team_contract_payment(
  p_reference text,
  p_user_id uuid,
  p_amount numeric,
  p_currency text,
  p_provider text DEFAULT 'paystack'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE
  v_tx public.paystack_transactions%ROWTYPE;
  v_contract public.sales_team_contracts%ROWTYPE;
  v_source_type text;
  v_team_id uuid;
  v_lead_id uuid;
  v_code text;
BEGIN
  IF COALESCE(auth.role(),'') <> 'service_role' THEN RAISE EXCEPTION 'Verified contract processing requires service_role'; END IF;
  IF p_provider <> 'paystack' THEN RAISE EXCEPTION 'Unsupported provider'; END IF;
  SELECT * INTO v_tx FROM public.paystack_transactions WHERE reference=p_reference FOR UPDATE;
  IF NOT FOUND OR v_tx.user_id<>p_user_id OR v_tx.purpose<>'sales_team_contract' OR v_tx.status<>'success' THEN
    RAISE EXCEPTION 'Canonical verified sales team transaction not found';
  END IF;
  IF abs(v_tx.amount-p_amount)>0.01 OR upper(v_tx.currency)<>upper(p_currency) THEN RAISE EXCEPTION 'Verified payment does not match canonical transaction'; END IF;
  SELECT * INTO v_contract FROM public.sales_team_contracts WHERE id=v_tx.reference_id FOR UPDATE;
  IF NOT FOUND OR v_contract.seller_id<>p_user_id THEN RAISE EXCEPTION 'Sales team contract does not belong to payer'; END IF;
  IF abs(v_contract.total_amount-p_amount)>0.01 OR upper(v_contract.billing_currency)<>upper(p_currency) THEN RAISE EXCEPTION 'Verified payment does not match canonical contract'; END IF;
  IF v_contract.payment_status='paid' THEN
    IF v_contract.payment_id<>p_reference THEN RAISE EXCEPTION 'Contract is already bound to another payment'; END IF;
    RETURN jsonb_build_object('success',true,'idempotent',true,'contract_id',v_contract.id);
  END IF;
  IF v_contract.status<>'pending' OR v_contract.payment_status<>'pending' THEN RAISE EXCEPTION 'Contract is not awaiting payment'; END IF;
  IF EXISTS (SELECT 1 FROM public.sales_team_contracts c WHERE c.id<>v_contract.id AND c.payment_id=p_reference) THEN RAISE EXCEPTION 'Payment reference already used'; END IF;

  IF v_contract.selected_tier LIKE 'Mkt L%' THEN
    SELECT stm.sales_team_id INTO v_team_id
    FROM public.sales_team_members stm JOIN public.sales_teams st ON st.id=stm.sales_team_id
    WHERE stm.user_id=v_contract.sales_team_id AND stm.status='active' AND st.status='active' LIMIT 1;
    IF v_team_id IS NULL THEN RAISE EXCEPTION 'Assigned marketer is no longer an active sales team member'; END IF;
    SELECT stm.user_id INTO v_lead_id FROM public.sales_team_members stm
    WHERE stm.sales_team_id=v_team_id AND stm.status='active' AND stm.member_role IN ('lead','manager') AND stm.user_id<>v_contract.sales_team_id
    ORDER BY CASE WHEN stm.member_role='manager' THEN 0 ELSE 1 END, stm.joined_at LIMIT 1;
    v_source_type := 'sales_team';
  ELSE
    v_source_type := CASE v_contract.selected_tier
      WHEN 'Adv Pro' THEN 'pro_advertiser' WHEN 'Adv Super' THEN 'super_advertiser'
      WHEN 'Adv Partnership' THEN 'partnership' ELSE 'advertiser' END;
  END IF;

  UPDATE public.sales_team_contracts SET
    status='active',payment_status='paid',payment_id=p_reference,payment_verified_at=now(),
    starts_at=now(),expires_at=now()+public.sales_team_contract_interval(duration)
  WHERE id=v_contract.id;

  UPDATE public.products SET
    sales_team_tier=v_contract.selected_tier,
    sales_team_task_percent=v_contract.task_percent,
    has_dright_sales_team=true
  WHERE id=v_contract.product_id AND uploaded_by=v_contract.seller_id;

  SELECT upper(substr(md5(v_contract.sales_team_id::text||v_contract.product_id::text||v_contract.id::text),1,10)) INTO v_code;
  IF NOT EXISTS (SELECT 1 FROM public.referral_links rl WHERE rl.user_id=v_contract.sales_team_id AND rl.product_id=v_contract.product_id AND rl.source_type=v_source_type) THEN
    INSERT INTO public.referral_links(user_id,unique_code,product_id,source_type,source_level,campaign_id,sales_team_id,team_member_id,team_lead_id,total_clicks,total_conversions)
    VALUES(v_contract.sales_team_id,v_code,v_contract.product_id,v_source_type,v_contract.selected_tier,NULL,v_team_id,
      CASE WHEN v_source_type='sales_team' THEN v_contract.sales_team_id ELSE NULL END,
      CASE WHEN v_source_type='sales_team' THEN v_lead_id ELSE NULL END,0,0);
  END IF;

  UPDATE public.paystack_transactions SET processed_at=COALESCE(processed_at,now()),updated_at=now() WHERE reference=p_reference;
  INSERT INTO public.analytics_events(event_type,entity_type,entity_id,seller_id,viewer_id,metadata)
  VALUES('sales_team_contract_activated','sales_team_contract',v_contract.id,v_contract.seller_id,v_contract.seller_id,
    jsonb_build_object('payment_reference',p_reference,'amount',p_amount,'currency',upper(p_currency),'tier',v_contract.selected_tier,'assigned_user_id',v_contract.sales_team_id));
  RETURN jsonb_build_object('success',true,'contract_id',v_contract.id,'assigned_user_id',v_contract.sales_team_id);
END;
$$;
REVOKE ALL ON FUNCTION public.process_verified_sales_team_contract_payment(text,uuid,numeric,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_verified_sales_team_contract_payment(text,uuid,numeric,text,text) TO service_role;

-- Harden source creation. The browser can identify the source but cannot choose sales-team identity.
CREATE OR REPLACE FUNCTION public.get_or_create_tracking_link(
  p_user_id uuid,
  p_product_id uuid DEFAULT NULL,
  p_source_type text DEFAULT 'affiliate',
  p_source_level text DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL,
  p_sales_team_id uuid DEFAULT NULL,
  p_team_member_id uuid DEFAULT NULL,
  p_team_lead_id uuid DEFAULT NULL
) RETURNS TABLE(link_id uuid, tracking_code text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE
  v_id uuid; v_code text; v_user_code text; v_account text;
  v_team_id uuid; v_member_id uuid; v_lead_id uuid; v_level text;
  v_contract public.sales_team_contracts%ROWTYPE;
  v_user public.users%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR auth.uid()<>p_user_id THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF p_source_type NOT IN ('affiliate','sales_team','advertiser','pro_advertiser','super_advertiser','partnership') THEN RAISE EXCEPTION 'invalid source_type'; END IF;
  SELECT * INTO v_user FROM public.users WHERE id=p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'user not found'; END IF;
  v_account:=COALESCE(v_user.account_status,'active');
  IF v_account<>'active' THEN RAISE EXCEPTION 'account is not active'; END IF;
  v_user_code:=v_user.referral_code;
  IF v_user_code IS NULL OR length(trim(v_user_code))=0 THEN RAISE EXCEPTION 'user has no referral code'; END IF;
  IF p_product_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id=p_product_id AND p.is_active=true AND p.is_hidden=false AND p.approval_status='approved') THEN
    RAISE EXCEPTION 'product is not eligible for tracking';
  END IF;

  v_team_id:=NULL; v_member_id:=NULL; v_lead_id:=NULL; v_level:=p_source_level;
  IF p_source_type='sales_team' THEN
    IF p_product_id IS NULL THEN RAISE EXCEPTION 'sales team links require a product'; END IF;
    SELECT * INTO v_contract FROM public.sales_team_contracts c
    WHERE c.sales_team_id=p_user_id AND c.product_id=p_product_id AND c.status='active' AND c.payment_status='paid' AND c.expires_at>now()
      AND c.selected_tier LIKE 'Mkt L%'
    ORDER BY c.starts_at DESC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'no active paid sales team contract for this product'; END IF;
    SELECT stm.sales_team_id INTO v_team_id FROM public.sales_team_members stm JOIN public.sales_teams st ON st.id=stm.sales_team_id
    WHERE stm.user_id=p_user_id AND stm.status='active' AND st.status='active' LIMIT 1;
    IF v_team_id IS NULL THEN RAISE EXCEPTION 'active sales team membership required'; END IF;
    v_member_id:=p_user_id; v_level:=v_contract.selected_tier;
    SELECT stm.user_id INTO v_lead_id FROM public.sales_team_members stm
    WHERE stm.sales_team_id=v_team_id AND stm.status='active' AND stm.member_role IN ('lead','manager') AND stm.user_id<>p_user_id
    ORDER BY CASE WHEN stm.member_role='manager' THEN 0 ELSE 1 END, stm.joined_at LIMIT 1;
    IF p_sales_team_id IS NOT NULL AND p_sales_team_id<>v_team_id THEN RAISE EXCEPTION 'sales team mismatch'; END IF;
    IF p_team_member_id IS NOT NULL AND p_team_member_id<>v_member_id THEN RAISE EXCEPTION 'team member mismatch'; END IF;
    IF p_team_lead_id IS NOT NULL AND p_team_lead_id IS DISTINCT FROM v_lead_id THEN RAISE EXCEPTION 'team lead mismatch'; END IF;
  ELSIF p_source_type='advertiser' THEN
    IF v_user.advertiser_status<>'approved' OR v_user.advertiser_grade NOT IN ('A','B','C') THEN RAISE EXCEPTION 'advertiser source not eligible'; END IF;
  ELSIF p_source_type='pro_advertiser' THEN
    IF v_user.advertiser_status<>'approved' OR v_user.advertiser_grade<>'Pro' THEN RAISE EXCEPTION 'pro advertiser source not eligible'; END IF;
  ELSIF p_source_type='super_advertiser' THEN
    IF v_user.advertiser_status<>'approved' OR v_user.advertiser_grade<>'Super' THEN RAISE EXCEPTION 'super advertiser source not eligible'; END IF;
  ELSIF p_source_type='partnership' THEN
    IF v_user.advertiser_status<>'approved' OR v_user.advertiser_grade<>'Partnership' THEN RAISE EXCEPTION 'partnership source not eligible'; END IF;
  END IF;

  SELECT id,unique_code INTO v_id,v_code FROM public.referral_links
  WHERE user_id=p_user_id AND product_id IS NOT DISTINCT FROM p_product_id AND source_type=p_source_type
    AND COALESCE(source_level,'')=COALESCE(v_level,'') AND campaign_id IS NOT DISTINCT FROM p_campaign_id
    AND sales_team_id IS NOT DISTINCT FROM v_team_id AND team_member_id IS NOT DISTINCT FROM v_member_id AND team_lead_id IS NOT DISTINCT FROM v_lead_id
  LIMIT 1;
  IF v_id IS NULL THEN
    v_code:=CASE WHEN p_product_id IS NULL AND p_source_type='affiliate' THEN v_user_code ELSE upper(substr(md5(p_user_id::text||coalesce(p_product_id::text,'')||p_source_type||coalesce(v_level,'')||clock_timestamp()::text),1,10)) END;
    INSERT INTO public.referral_links(user_id,unique_code,product_id,source_type,source_level,campaign_id,sales_team_id,team_member_id,team_lead_id,total_clicks,total_conversions)
    VALUES(p_user_id,v_code,p_product_id,p_source_type,v_level,p_campaign_id,v_team_id,v_member_id,v_lead_id,0,0) RETURNING id INTO v_id;
  END IF;
  RETURN QUERY SELECT v_id,v_code;
END;
$$;
REVOKE ALL ON FUNCTION public.get_or_create_tracking_link(uuid,uuid,text,text,uuid,uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_tracking_link(uuid,uuid,text,text,uuid,uuid,uuid,uuid) TO authenticated;

-- Tracking identities are RPC/trigger generated; browser roles cannot forge referral source columns.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.referral_links FROM anon, authenticated;
DROP POLICY IF EXISTS "Promoters can insert own referral link" ON public.referral_links;
DROP POLICY IF EXISTS "Promoters can update own referral link" ON public.referral_links;

-- Existing Paystack ledger gains one purpose; no second payment ledger is introduced.
ALTER TABLE public.paystack_transactions DROP CONSTRAINT IF EXISTS paystack_transactions_purpose_check;
ALTER TABLE public.paystack_transactions ADD CONSTRAINT paystack_transactions_purpose_check CHECK (purpose = ANY (ARRAY[
  'wallet_funding','product_purchase','subscription','escrow','advertiser_funding','affiliate_subscription','vendor_subscription','promotion_campaign','sales_team_contract'
]::text[]));
