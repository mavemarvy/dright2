/* DRIGHT2 signup/onboarding + dynamic questionnaires. */
CREATE OR REPLACE FUNCTION public.has_dright_permission(p_module text, p_action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user public.users%ROWTYPE;
  v_override boolean;
  v_has_override boolean := false;
  v_role_id uuid;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE id = auth.uid();
  IF v_user.id IS NULL OR v_user.is_admin IS DISTINCT FROM true OR v_user.admin_status <> 'active' THEN
    RETURN false;
  END IF;
  IF v_user.admin_role = 'super_admin' THEN RETURN true; END IF;
  SELECT ap.is_granted, true INTO v_override, v_has_override
  FROM public.admin_permissions ap
  JOIN public.permissions p ON p.id = ap.permission_id
  WHERE ap.admin_id = auth.uid() AND p.module = p_module AND p.action = p_action
    AND p.is_active = true AND p.is_deleted = false LIMIT 1;
  IF v_has_override THEN RETURN COALESCE(v_override, false); END IF;
  v_role_id := v_user.rbac_role_id;
  IF v_role_id IS NULL AND v_user.admin_role IS NOT NULL THEN
    SELECT id INTO v_role_id FROM public.roles
    WHERE slug = v_user.admin_role AND is_deleted = false AND is_archived = false LIMIT 1;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.role_permissions rp
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE rp.role_id = v_role_id AND p.module = p_module AND p.action = p_action
      AND p.is_active = true AND p.is_deleted = false
  );
END;
$$;
REVOKE ALL ON FUNCTION public.has_dright_permission(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_dright_permission(text,text) TO authenticated;

INSERT INTO public.permissions (module, action, label, description)
VALUES
  ('users','view_sensitive','View Sensitive User Data','View private onboarding fields such as DOB and country'),
  ('questionnaires','view','View Questionnaires','View user questionnaire applications'),
  ('questionnaires','review','Review Questionnaires','Approve, reject, return or request more information'),
  ('questionnaires','manage','Manage Questionnaires','Create and version questionnaire definitions and questions'),
  ('professional_documents','view','View Professional Documents','View private professional documents'),
  ('professional_documents','review','Review Professional Documents','Review professional documents and evidence'),
  ('kyc','view','View KYC','View KYC profiles and submissions'),
  ('kyc','review','Review KYC','Review KYC submissions and individual documents'),
  ('kyc','verify','Verify KYC','Confirm verification documents and KYC checks'),
  ('kyc','reject','Reject KYC','Reject KYC documents or submissions'),
  ('kyc','request_resubmission','Request KYC Resubmission','Request replacement verification documents'),
  ('kyc','view_documents','View KYC Documents','Open sensitive KYC document previews'),
  ('kyc','download_documents','Download KYC Documents','Download sensitive KYC originals'),
  ('kyc','manage_rules','Manage KYC Rules','Manage KYC requirements and reverification rules'),
  ('kyc','manage_providers','Manage KYC Providers','Manage provider configuration and status'),
  ('kyc','audit_view','View KYC Audit','View KYC review and security audit history'),
  ('eligibility','view','View Eligibility','View explainable user eligibility results'),
  ('eligibility','recalculate','Recalculate Eligibility','Run authoritative eligibility recalculation'),
  ('badges','view_evidence','View Achievement Evidence','View private evidence submitted for achievements'),
  ('badges','review_evidence','Review Achievement Evidence','Verify or reject achievement evidence'),
  ('badges','manage_ranking','Manage Growth Ranking','Manage explainable growth/ranking configuration')
ON CONFLICT (module, action) DO UPDATE SET label=EXCLUDED.label, description=EXCLUDED.description, is_active=true, is_deleted=false;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug='super_admin' AND r.is_deleted=false
ON CONFLICT (role_id,permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id,p.id FROM public.roles r JOIN public.permissions p ON (
  (r.slug='user_management_admin' AND (p.module,p.action) IN (('users','view'),('users','view_sensitive'),('questionnaires','view'),('questionnaires','review'),('eligibility','view')))
  OR (r.slug IN ('trust_safety_admin','security_admin','security_manager') AND (p.module,p.action) IN (('kyc','view'),('kyc','review'),('kyc','verify'),('kyc','reject'),('kyc','request_resubmission'),('kyc','view_documents'),('kyc','audit_view'),('users','view_sensitive'),('questionnaires','view'),('eligibility','view'),('badges','view_evidence'),('badges','review_evidence')))
  OR (r.slug='badge_trust_admin' AND (p.module,p.action) IN (('badges','view'),('badges','assign'),('badges','manage'),('badges','view_evidence'),('badges','review_evidence'),('badges','manage_ranking'),('eligibility','view')))
)
WHERE r.is_deleted=false AND p.is_deleted=false
ON CONFLICT (role_id,permission_id) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique ON public.users(lower(username));
CREATE TABLE IF NOT EXISTS public.reserved_usernames(username text PRIMARY KEY,reason text,is_active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.reserved_usernames ENABLE ROW LEVEL SECURITY;
INSERT INTO public.reserved_usernames(username,reason) VALUES
('admin','system reserved'),('administrator','system reserved'),('support','system reserved'),('security','system reserved'),('dright','brand reserved'),('drightadmin','brand reserved'),('help','system reserved'),('api','system reserved'),('root','system reserved'),('moderator','system reserved'),('system','system reserved'),('staff','system reserved')
ON CONFLICT(username) DO UPDATE SET reason=EXCLUDED.reason,is_active=true;
DROP POLICY IF EXISTS reserved_usernames_read ON public.reserved_usernames;
CREATE POLICY reserved_usernames_read ON public.reserved_usernames FOR SELECT TO anon,authenticated USING(is_active=true);
DROP POLICY IF EXISTS reserved_usernames_manage ON public.reserved_usernames;
CREATE POLICY reserved_usernames_manage ON public.reserved_usernames FOR ALL TO authenticated USING(public.has_dright_permission('users','manage_roles')) WITH CHECK(public.has_dright_permission('users','manage_roles'));

CREATE OR REPLACE FUNCTION public.normalize_dright_username(p_username text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$ SELECT trim(both '_' from regexp_replace(lower(trim(coalesce(p_username,''))), '[^a-z0-9_]+', '_', 'g')); $$;
CREATE OR REPLACE FUNCTION public.check_username_availability(p_username text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_name text:=public.normalize_dright_username(p_username);v_available boolean;
BEGIN
 IF length(v_name)<3 OR length(v_name)>30 OR v_name !~ '^[a-z0-9_]+$' THEN RETURN jsonb_build_object('normalized',v_name,'available',false,'reason','invalid_format'); END IF;
 IF EXISTS(SELECT 1 FROM public.reserved_usernames WHERE username=v_name AND is_active=true) THEN RETURN jsonb_build_object('normalized',v_name,'available',false,'reason','reserved'); END IF;
 v_available:=NOT EXISTS(SELECT 1 FROM public.users WHERE lower(username)=v_name);
 RETURN jsonb_build_object('normalized',v_name,'available',v_available,'reason',CASE WHEN v_available THEN NULL ELSE 'taken' END);
END;$$;
REVOKE ALL ON FUNCTION public.check_username_availability(text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.check_username_availability(text) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.set_own_username(p_username text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_uid uuid:=auth.uid();v_name text:=public.normalize_dright_username(p_username);
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
 IF length(v_name)<3 OR length(v_name)>30 OR v_name !~ '^[a-z0-9_]+$' THEN RAISE EXCEPTION 'username must be 3-30 characters using letters, numbers or underscore'; END IF;
 IF EXISTS(SELECT 1 FROM public.reserved_usernames WHERE username=v_name AND is_active=true) THEN RAISE EXCEPTION 'username is reserved'; END IF;
 UPDATE public.users SET username=v_name,updated_at=now() WHERE id=v_uid; IF NOT FOUND THEN RAISE EXCEPTION 'user profile not found'; END IF; RETURN v_name;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'username is unavailable'; END;$$;
REVOKE ALL ON FUNCTION public.set_own_username(text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.set_own_username(text) TO authenticated;

CREATE TABLE IF NOT EXISTS public.user_private_profiles(
 user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,country_iso2 text,country_calling_code text,date_of_birth date,
 intended_profiles text[] NOT NULL DEFAULT ARRAY['buyer']::text[],interests text[] NOT NULL DEFAULT '{}'::text[],onboarding_status text NOT NULL DEFAULT 'in_progress' CHECK(onboarding_status IN('in_progress','submitted','completed','changes_required')),
 onboarding_completed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT user_private_country_iso2 CHECK(country_iso2 IS NULL OR country_iso2 ~ '^[A-Z]{2}$'),CONSTRAINT user_private_dob_not_future CHECK(date_of_birth IS NULL OR date_of_birth<=current_date)
);
CREATE INDEX IF NOT EXISTS idx_user_private_profiles_country ON public.user_private_profiles(country_iso2); ALTER TABLE public.user_private_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_private_profiles_own_read ON public.user_private_profiles; CREATE POLICY user_private_profiles_own_read ON public.user_private_profiles FOR SELECT TO authenticated USING(user_id=auth.uid());
DROP POLICY IF EXISTS user_private_profiles_admin_read ON public.user_private_profiles; CREATE POLICY user_private_profiles_admin_read ON public.user_private_profiles FOR SELECT TO authenticated USING(public.has_dright_permission('users','view_sensitive'));
DROP POLICY IF EXISTS user_private_profiles_own_insert ON public.user_private_profiles; CREATE POLICY user_private_profiles_own_insert ON public.user_private_profiles FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid());
DROP POLICY IF EXISTS user_private_profiles_own_update ON public.user_private_profiles; CREATE POLICY user_private_profiles_own_update ON public.user_private_profiles FOR UPDATE TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());

CREATE TABLE IF NOT EXISTS public.age_eligibility_rules(profile_type text PRIMARY KEY,minimum_age integer NOT NULL CHECK(minimum_age BETWEEN 0 AND 100),reason text,country_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,is_active boolean NOT NULL DEFAULT true,updated_by uuid REFERENCES public.users(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.age_eligibility_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS age_rules_read ON public.age_eligibility_rules; CREATE POLICY age_rules_read ON public.age_eligibility_rules FOR SELECT TO anon,authenticated USING(is_active=true);
DROP POLICY IF EXISTS age_rules_manage ON public.age_eligibility_rules; CREATE POLICY age_rules_manage ON public.age_eligibility_rules FOR ALL TO authenticated USING(public.has_dright_permission('kyc','manage_rules')) WITH CHECK(public.has_dright_permission('kyc','manage_rules'));
INSERT INTO public.age_eligibility_rules(profile_type,minimum_age,reason) VALUES
('buyer',13,'Base account access; stricter activity rules may apply'),('affiliate',18,'Commission and withdrawal activity'),('seller',18,'Commercial selling and contractual activity'),('vendor',18,'Commercial selling and contractual activity'),('service_provider',18,'Contractual service activity'),('employer',18,'Job-posting and hiring activity'),('creator',13,'Base creator access; monetization may require 18+'),('course_creator',18,'Monetized course publishing'),('task_worker',18,'Paid task activity'),('task_creator',18,'Paid task contracting'),('marketer',18,'Commercial marketing activity') ON CONFLICT(profile_type) DO NOTHING;
CREATE OR REPLACE FUNCTION public.dright_age_on(p_dob date,p_on date DEFAULT current_date) RETURNS integer LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$ SELECT CASE WHEN p_dob IS NULL THEN NULL ELSE extract(year from age(p_on,p_dob))::int END; $$;

CREATE TABLE IF NOT EXISTS public.questionnaire_definitions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),questionnaire_key text NOT NULL,name text NOT NULL,applicable_profile_type text NOT NULL,version integer NOT NULL DEFAULT 1 CHECK(version>0),description text,is_active boolean NOT NULL DEFAULT true,created_by uuid REFERENCES public.users(id),updated_by uuid REFERENCES public.users(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(questionnaire_key,version));
CREATE UNIQUE INDEX IF NOT EXISTS questionnaire_one_active_version ON public.questionnaire_definitions(questionnaire_key) WHERE is_active=true; CREATE INDEX IF NOT EXISTS idx_questionnaire_definitions_profile ON public.questionnaire_definitions(applicable_profile_type,is_active); ALTER TABLE public.questionnaire_definitions ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.questionnaire_questions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),questionnaire_id uuid NOT NULL REFERENCES public.questionnaire_definitions(id) ON DELETE RESTRICT,question_key text NOT NULL,label text NOT NULL,description text,answer_type text NOT NULL CHECK(answer_type IN('short_text','long_text','yes_no','single_select','multi_select','number','date','url','email','document_reference')),options jsonb NOT NULL DEFAULT '[]'::jsonb,is_required boolean NOT NULL DEFAULT false,sort_order integer NOT NULL DEFAULT 0,conditional_rules jsonb NOT NULL DEFAULT '{}'::jsonb,validation_rules jsonb NOT NULL DEFAULT '{}'::jsonb,is_active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(questionnaire_id,question_key));
CREATE INDEX IF NOT EXISTS idx_questionnaire_questions_def_order ON public.questionnaire_questions(questionnaire_id,sort_order); ALTER TABLE public.questionnaire_questions ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.questionnaire_submissions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,profile_type text NOT NULL,questionnaire_id uuid NOT NULL REFERENCES public.questionnaire_definitions(id) ON DELETE RESTRICT,questionnaire_version integer NOT NULL,status text NOT NULL DEFAULT 'submitted' CHECK(status IN('draft','submitted','under_review','approved','more_information_required','returned_for_changes','rejected','reopened')),submitted_at timestamptz,reviewed_at timestamptz,reviewer_id uuid REFERENCES public.users(id),user_visible_reason text,internal_notes text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_questionnaire_submissions_user ON public.questionnaire_submissions(user_id,created_at DESC); CREATE INDEX IF NOT EXISTS idx_questionnaire_submissions_status ON public.questionnaire_submissions(status,created_at DESC); CREATE INDEX IF NOT EXISTS idx_questionnaire_submissions_profile ON public.questionnaire_submissions(profile_type,status); ALTER TABLE public.questionnaire_submissions ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.questionnaire_answers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),submission_id uuid NOT NULL REFERENCES public.questionnaire_submissions(id) ON DELETE CASCADE,question_id uuid REFERENCES public.questionnaire_questions(id) ON DELETE SET NULL,question_key text NOT NULL,answer_value jsonb NOT NULL DEFAULT 'null'::jsonb,question_snapshot jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(submission_id,question_key)); CREATE INDEX IF NOT EXISTS idx_questionnaire_answers_submission ON public.questionnaire_answers(submission_id); ALTER TABLE public.questionnaire_answers ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.questionnaire_review_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),submission_id uuid NOT NULL REFERENCES public.questionnaire_submissions(id) ON DELETE CASCADE,reviewer_id uuid NOT NULL REFERENCES public.users(id),action text NOT NULL CHECK(action IN('under_review','approved','more_information_required','returned_for_changes','rejected','reopened')),previous_status text,new_status text NOT NULL,user_visible_reason text,internal_note text,created_at timestamptz NOT NULL DEFAULT now()); CREATE INDEX IF NOT EXISTS idx_questionnaire_review_events_submission ON public.questionnaire_review_events(submission_id,created_at DESC); ALTER TABLE public.questionnaire_review_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS questionnaire_definitions_public_read ON public.questionnaire_definitions; CREATE POLICY questionnaire_definitions_public_read ON public.questionnaire_definitions FOR SELECT TO anon,authenticated USING(is_active=true);
DROP POLICY IF EXISTS questionnaire_definitions_manage ON public.questionnaire_definitions; CREATE POLICY questionnaire_definitions_manage ON public.questionnaire_definitions FOR ALL TO authenticated USING(public.has_dright_permission('questionnaires','manage')) WITH CHECK(public.has_dright_permission('questionnaires','manage'));
DROP POLICY IF EXISTS questionnaire_questions_public_read ON public.questionnaire_questions; CREATE POLICY questionnaire_questions_public_read ON public.questionnaire_questions FOR SELECT TO anon,authenticated USING(is_active=true AND EXISTS(SELECT 1 FROM public.questionnaire_definitions qd WHERE qd.id=questionnaire_id AND qd.is_active=true));
DROP POLICY IF EXISTS questionnaire_questions_manage ON public.questionnaire_questions; CREATE POLICY questionnaire_questions_manage ON public.questionnaire_questions FOR ALL TO authenticated USING(public.has_dright_permission('questionnaires','manage')) WITH CHECK(public.has_dright_permission('questionnaires','manage'));
DROP POLICY IF EXISTS questionnaire_submissions_own_read ON public.questionnaire_submissions; CREATE POLICY questionnaire_submissions_own_read ON public.questionnaire_submissions FOR SELECT TO authenticated USING(user_id=auth.uid());
DROP POLICY IF EXISTS questionnaire_submissions_admin_read ON public.questionnaire_submissions; CREATE POLICY questionnaire_submissions_admin_read ON public.questionnaire_submissions FOR SELECT TO authenticated USING(public.has_dright_permission('questionnaires','view'));
DROP POLICY IF EXISTS questionnaire_submissions_admin_update ON public.questionnaire_submissions; CREATE POLICY questionnaire_submissions_admin_update ON public.questionnaire_submissions FOR UPDATE TO authenticated USING(public.has_dright_permission('questionnaires','review')) WITH CHECK(public.has_dright_permission('questionnaires','review'));
DROP POLICY IF EXISTS questionnaire_answers_own_read ON public.questionnaire_answers; CREATE POLICY questionnaire_answers_own_read ON public.questionnaire_answers FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.questionnaire_submissions s WHERE s.id=submission_id AND s.user_id=auth.uid()));
DROP POLICY IF EXISTS questionnaire_answers_admin_read ON public.questionnaire_answers; CREATE POLICY questionnaire_answers_admin_read ON public.questionnaire_answers FOR SELECT TO authenticated USING(public.has_dright_permission('questionnaires','view'));
DROP POLICY IF EXISTS questionnaire_review_events_own_read ON public.questionnaire_review_events; CREATE POLICY questionnaire_review_events_own_read ON public.questionnaire_review_events FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.questionnaire_submissions s WHERE s.id=submission_id AND s.user_id=auth.uid()));
DROP POLICY IF EXISTS questionnaire_review_events_admin_read ON public.questionnaire_review_events; CREATE POLICY questionnaire_review_events_admin_read ON public.questionnaire_review_events FOR SELECT TO authenticated USING(public.has_dright_permission('questionnaires','view'));

INSERT INTO public.questionnaire_definitions(questionnaire_key,name,applicable_profile_type,version,description) VALUES
('buyer_onboarding','Buyer onboarding','buyer',1,'Short buyer discovery preferences'),('affiliate_application','Affiliate application','affiliate',1,'Affiliate experience, audience and promotion plan'),('employer_application','Employer application','employer',1,'Employer and organization information'),('service_provider_application','Freelancer / Service Provider application','service_provider',1,'Skills, availability and professional experience'),('seller_application','Seller / Vendor application','seller',1,'Seller and store information'),('task_worker_application','Task Worker / Earner application','task_worker',1,'Skills, task categories and availability'),('task_creator_application','Task Creator application','task_creator',1,'Task creation needs and expected activity'),('marketer_application','Marketer application','marketer',1,'Marketing and sales background'),('creator_application','Creator application','creator',1,'Creator content, expertise and goals'),('course_creator_application','Course Creator application','course_creator',1,'Course subject, expertise and monetization goals') ON CONFLICT(questionnaire_key,version) DO NOTHING;
CREATE OR REPLACE FUNCTION public.seed_question(p_key text,p_question_key text,p_label text,p_type text,p_required boolean,p_order integer,p_options jsonb DEFAULT '[]'::jsonb,p_description text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN INSERT INTO public.questionnaire_questions(questionnaire_id,question_key,label,description,answer_type,options,is_required,sort_order) SELECT id,p_question_key,p_label,p_description,p_type,p_options,p_required,p_order FROM public.questionnaire_definitions WHERE questionnaire_key=p_key AND version=1 ON CONFLICT(questionnaire_id,question_key) DO NOTHING; END; $$;
SELECT public.seed_question('buyer_onboarding','discover','What do you primarily want to discover?','multi_select',true,10,'["products","services","courses","jobs","tasks","creators","communities"]');
SELECT public.seed_question('buyer_onboarding','categories','Which categories interest you most?','multi_select',false,20,'[]');
SELECT public.seed_question('affiliate_application','prior_affiliate','Have you previously done affiliate marketing?','yes_no',true,10);
SELECT public.seed_question('affiliate_application','experience_level','Affiliate experience level','single_select',true,20,'["beginner","intermediate","advanced","professional"]');
SELECT public.seed_question('affiliate_application','niches','Main niches or categories','multi_select',true,30);
SELECT public.seed_question('affiliate_application','platforms','Which platforms do you use?','multi_select',true,40,'["website","youtube","tiktok","instagram","facebook","x","linkedin","telegram","email","other"]');
SELECT public.seed_question('affiliate_application','audience_size','Audience-size range','single_select',false,50,'["0-999","1000-9999","10000-99999","100000-999999","1000000+"]');
SELECT public.seed_question('affiliate_application','audience_regions','Primary audience countries or regions','long_text',false,60);
SELECT public.seed_question('affiliate_application','promotion_plan','How do you plan to promote DRIGHT listings?','long_text',true,70);
SELECT public.seed_question('affiliate_application','links','Website or social links','long_text',false,80);
SELECT public.seed_question('affiliate_application','existing_experience','Describe existing affiliate experience','long_text',false,90);
SELECT public.seed_question('employer_application','entity_type','Are you recruiting as an individual or organization?','single_select',true,10,'["individual","organization"]');
SELECT public.seed_question('employer_application','organization_name','Organization or company name','short_text',false,20);
SELECT public.seed_question('employer_application','industry','Industry','short_text',true,30);
SELECT public.seed_question('employer_application','company_size','Company size','single_select',false,40,'["1","2-10","11-50","51-200","201-1000","1000+"]');
SELECT public.seed_question('employer_application','location','Organization location','short_text',true,50);
SELECT public.seed_question('employer_application','website','Website','url',false,60);
SELECT public.seed_question('employer_application','authority','Your position or authority within the organization','short_text',true,70);
SELECT public.seed_question('employer_application','recruited_online','Have you recruited online before?','yes_no',false,80);
SELECT public.seed_question('employer_application','job_categories','Typical job categories','multi_select',true,90);
SELECT public.seed_question('employer_application','hiring_frequency','Expected hiring frequency','single_select',false,100,'["one_time","occasional","monthly","weekly","continuous"]');
SELECT public.seed_question('employer_application','hiring_volume','Expected hiring volume','short_text',false,110);
SELECT public.seed_question('service_provider_application','services','Services offered','long_text',true,10);
SELECT public.seed_question('service_provider_application','skills','Skill categories','multi_select',true,20);
SELECT public.seed_question('service_provider_application','experience_level','Experience level','single_select',true,30,'["beginner","intermediate","advanced","expert"]');
SELECT public.seed_question('service_provider_application','years_experience','Years of experience','number',false,40);
SELECT public.seed_question('service_provider_application','languages','Languages','multi_select',false,50);
SELECT public.seed_question('service_provider_application','availability','Availability','single_select',true,60,'["part_time","full_time","weekends","flexible"]');
SELECT public.seed_question('service_provider_application','work_type','Preferred work type','multi_select',false,70,'["remote","onsite","hybrid","project","retainer"]');
SELECT public.seed_question('service_provider_application','portfolio','Portfolio link','url',false,80);
SELECT public.seed_question('service_provider_application','links','Website or social links','long_text',false,90);
SELECT public.seed_question('seller_application','seller_type','Individual or business?','single_select',true,10,'["individual","business"]');
SELECT public.seed_question('seller_application','store_name','Business or store name','short_text',false,20);
SELECT public.seed_question('seller_application','sell_types','What do you plan to sell?','multi_select',true,30,'["physical_products","digital_products","courses","services"]');
SELECT public.seed_question('seller_application','categories','Categories','multi_select',true,40);
SELECT public.seed_question('seller_application','location','Country or location','short_text',true,50);
SELECT public.seed_question('seller_application','ecommerce_experience','Describe ecommerce experience','long_text',false,60);
SELECT public.seed_question('seller_application','store_url','Existing business or store URL','url',false,70);
SELECT public.seed_question('seller_application','fulfilment','Fulfilment method','multi_select',false,80,'["self_fulfilled","dropshipping","digital_delivery","service_delivery","other"]');
SELECT public.seed_question('seller_application','expected_volume','Expected selling volume','short_text',false,90);
SELECT public.seed_question('task_worker_application','skills','Skills','multi_select',true,10);
SELECT public.seed_question('task_worker_application','task_categories','Preferred task categories','multi_select',true,20);
SELECT public.seed_question('task_worker_application','experience','Relevant experience','long_text',false,30);
SELECT public.seed_question('task_worker_application','availability','Availability','single_select',true,40,'["part_time","full_time","weekends","flexible"]');
SELECT public.seed_question('task_worker_application','languages','Languages','multi_select',false,50);
SELECT public.seed_question('task_worker_application','professional_background','Relevant professional background','long_text',false,60);
SELECT public.seed_question('task_creator_application','task_categories','What task categories will you create?','multi_select',true,10);
SELECT public.seed_question('task_creator_application','frequency','Expected task-posting frequency','single_select',false,20,'["one_time","occasional","monthly","weekly","continuous"]');
SELECT public.seed_question('task_creator_application','worker_requirements','Typical worker requirements','long_text',false,30);
SELECT public.seed_question('marketer_application','marketing_experience','Marketing or sales experience','long_text',true,10);
SELECT public.seed_question('marketer_application','channels','Channels used','multi_select',true,20,'["social","email","search","content","influencer","events","outbound","other"]');
SELECT public.seed_question('marketer_application','industries','Industries or categories','multi_select',true,30);
SELECT public.seed_question('marketer_application','markets','Markets served','long_text',false,40);
SELECT public.seed_question('marketer_application','sales_experience','Previous sales experience','long_text',false,50);
SELECT public.seed_question('marketer_application','availability','Availability','single_select',true,60,'["part_time","full_time","contract","flexible"]');
SELECT public.seed_question('marketer_application','links','Social or portfolio links','long_text',false,70);
SELECT public.seed_question('creator_application','category','Creator category','short_text',true,10);
SELECT public.seed_question('creator_application','topics','Content topics','multi_select',true,20);
SELECT public.seed_question('creator_application','experience','Creator experience','long_text',false,30);
SELECT public.seed_question('creator_application','expertise','Relevant expertise','long_text',true,40);
SELECT public.seed_question('creator_application','audience','Existing audience','short_text',false,50);
SELECT public.seed_question('creator_application','links','Social links or portfolio','long_text',false,60);
SELECT public.seed_question('creator_application','monetization_goals','Monetization goals','long_text',false,70);
SELECT public.seed_question('course_creator_application','category','Course category','short_text',true,10);
SELECT public.seed_question('course_creator_application','topics','Course topics','multi_select',true,20);
SELECT public.seed_question('course_creator_application','experience','Teaching or course-creation experience','long_text',false,30);
SELECT public.seed_question('course_creator_application','expertise','Subject expertise','long_text',true,40);
SELECT public.seed_question('course_creator_application','audience','Existing audience','short_text',false,50);
SELECT public.seed_question('course_creator_application','links','Professional or social links','long_text',false,60);
SELECT public.seed_question('course_creator_application','monetization_goals','Monetization goals','long_text',false,70);
DROP FUNCTION public.seed_question(text,text,text,text,boolean,integer,jsonb,text);

CREATE OR REPLACE FUNCTION public.submit_signup_onboarding(p_username text,p_country_iso2 text,p_country_calling_code text,p_date_of_birth date,p_intended_profiles text[],p_interests text[],p_answers jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_uid uuid:=auth.uid();v_profile text;v_rule public.age_eligibility_rules%ROWTYPE;v_q public.questionnaire_definitions%ROWTYPE;v_question public.questionnaire_questions%ROWTYPE;v_submission uuid;v_profile_answers jsonb;v_answer jsonb;v_username text;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
 IF p_country_iso2 IS NULL OR upper(p_country_iso2) !~ '^[A-Z]{2}$' THEN RAISE EXCEPTION 'valid ISO country is required'; END IF;
 IF p_date_of_birth IS NULL OR p_date_of_birth>current_date THEN RAISE EXCEPTION 'valid date of birth is required'; END IF;
 IF p_intended_profiles IS NULL OR cardinality(p_intended_profiles)=0 THEN RAISE EXCEPTION 'at least one intended profile is required'; END IF;
 v_username:=public.set_own_username(p_username);
 FOREACH v_profile IN ARRAY p_intended_profiles LOOP SELECT * INTO v_rule FROM public.age_eligibility_rules WHERE profile_type=v_profile AND is_active=true; IF v_rule.profile_type IS NOT NULL AND public.dright_age_on(p_date_of_birth)<v_rule.minimum_age THEN RAISE EXCEPTION 'minimum age requirement not satisfied for %',v_profile; END IF; END LOOP;
 INSERT INTO public.user_private_profiles(user_id,country_iso2,country_calling_code,date_of_birth,intended_profiles,interests,onboarding_status,onboarding_completed_at) VALUES(v_uid,upper(p_country_iso2),p_country_calling_code,p_date_of_birth,p_intended_profiles,coalesce(p_interests,'{}'::text[]),'submitted',now()) ON CONFLICT(user_id) DO UPDATE SET country_iso2=EXCLUDED.country_iso2,country_calling_code=EXCLUDED.country_calling_code,date_of_birth=EXCLUDED.date_of_birth,intended_profiles=EXCLUDED.intended_profiles,interests=EXCLUDED.interests,onboarding_status='submitted',onboarding_completed_at=now(),updated_at=now();
 FOREACH v_profile IN ARRAY p_intended_profiles LOOP
  SELECT * INTO v_q FROM public.questionnaire_definitions WHERE applicable_profile_type=v_profile AND is_active=true ORDER BY version DESC LIMIT 1; IF v_q.id IS NULL THEN CONTINUE; END IF;
  v_profile_answers:=coalesce(p_answers->v_q.questionnaire_key,'{}'::jsonb);
  FOR v_question IN SELECT * FROM public.questionnaire_questions WHERE questionnaire_id=v_q.id AND is_active=true ORDER BY sort_order LOOP v_answer:=v_profile_answers->v_question.question_key; IF v_question.is_required AND (v_answer IS NULL OR v_answer='null'::jsonb OR v_answer='""'::jsonb OR v_answer='[]'::jsonb) THEN RAISE EXCEPTION 'required questionnaire answer missing: %',v_question.question_key; END IF; END LOOP;
  INSERT INTO public.questionnaire_submissions(user_id,profile_type,questionnaire_id,questionnaire_version,status,submitted_at) VALUES(v_uid,v_profile,v_q.id,v_q.version,'submitted',now()) RETURNING id INTO v_submission;
  INSERT INTO public.questionnaire_answers(submission_id,question_id,question_key,answer_value,question_snapshot) SELECT v_submission,qq.id,qq.question_key,coalesce(v_profile_answers->qq.question_key,'null'::jsonb),jsonb_build_object('question_key',qq.question_key,'label',qq.label,'description',qq.description,'answer_type',qq.answer_type,'options',qq.options,'required',qq.is_required,'sort_order',qq.sort_order,'conditional_rules',qq.conditional_rules,'validation_rules',qq.validation_rules,'questionnaire_key',v_q.questionnaire_key,'questionnaire_version',v_q.version) FROM public.questionnaire_questions qq WHERE qq.questionnaire_id=v_q.id AND qq.is_active=true;
 END LOOP;
 RETURN jsonb_build_object('ok',true,'username',v_username,'onboarding_status','submitted');
END;$$;
REVOKE ALL ON FUNCTION public.submit_signup_onboarding(text,text,text,date,text[],text[],jsonb) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.submit_signup_onboarding(text,text,text,date,text[],text[],jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_questionnaire_submission(p_submission_id uuid,p_action text,p_user_visible_reason text DEFAULT NULL,p_internal_note text DEFAULT NULL) RETURNS public.questionnaire_submissions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_old text;v_new text;v_row public.questionnaire_submissions%ROWTYPE;
BEGIN
 IF NOT public.has_dright_permission('questionnaires','review') THEN RAISE EXCEPTION 'permission denied'; END IF;
 IF p_action NOT IN('under_review','approved','more_information_required','returned_for_changes','rejected','reopened') THEN RAISE EXCEPTION 'invalid review action'; END IF;
 IF p_action IN('more_information_required','returned_for_changes','rejected') AND nullif(trim(coalesce(p_user_visible_reason,'')),'') IS NULL THEN RAISE EXCEPTION 'user-visible reason is required'; END IF;
 SELECT status INTO v_old FROM public.questionnaire_submissions WHERE id=p_submission_id FOR UPDATE; IF v_old IS NULL THEN RAISE EXCEPTION 'submission not found'; END IF; v_new:=p_action;
 UPDATE public.questionnaire_submissions SET status=v_new,reviewer_id=auth.uid(),reviewed_at=now(),user_visible_reason=p_user_visible_reason,internal_notes=p_internal_note,updated_at=now() WHERE id=p_submission_id RETURNING * INTO v_row;
 INSERT INTO public.questionnaire_review_events(submission_id,reviewer_id,action,previous_status,new_status,user_visible_reason,internal_note) VALUES(p_submission_id,auth.uid(),p_action,v_old,v_new,p_user_visible_reason,p_internal_note);
 INSERT INTO public.admin_activity_logs(admin_id,action,resource_type,resource_id,details) SELECT auth.uid(),'questionnaire_'||p_action,'questionnaire_submission',p_submission_id,jsonb_build_object('previous_status',v_old,'new_status',v_new) WHERE EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='admin_activity_logs');
 RETURN v_row;
END;$$;
REVOKE ALL ON FUNCTION public.review_questionnaire_submission(uuid,text,text,text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.review_questionnaire_submission(uuid,text,text,text) TO authenticated;