import { supabase } from './supabase';

export type AnswerType = 'short_text'|'long_text'|'yes_no'|'single_select'|'multi_select'|'number'|'date'|'url'|'email'|'document_reference';
export interface QuestionnaireQuestion {
  id:string; questionnaire_id:string; question_key:string; label:string; description:string|null;
  answer_type:AnswerType; options:unknown; is_required:boolean; sort_order:number;
  conditional_rules:Record<string,unknown>; validation_rules:Record<string,unknown>; is_active:boolean;
}
export interface QuestionnaireDefinition {
  id:string; questionnaire_key:string; name:string; applicable_profile_type:string; version:number; description:string|null;
  questions:QuestionnaireQuestion[];
}
export interface UsernameAvailability { normalized:string; available:boolean; reason:string|null; }
export interface AgeRule { profile_type:string; minimum_age:number; reason:string|null; country_overrides:Record<string,number>; }
export interface PublicKycRequirement { user_type:string; is_required:boolean; required_for_action:string|null; description:string|null; required_document_types:string[]; required_checks:string[]; }

export type SignupQuestionnaireMode = 'off'|'minimal'|'brief'|'full';
export interface SignupOnboardingSettings {
  questionnaire_mode: SignupQuestionnaireMode;
  show_interests_during_signup: boolean;
  show_documents_during_signup: boolean;
}
export const DEFAULT_SIGNUP_ONBOARDING_SETTINGS: SignupOnboardingSettings = {
  questionnaire_mode: 'brief',
  show_interests_during_signup: false,
  show_documents_during_signup: false,
};

export const PROFILE_OPTIONS = [
  {value:'buyer',label:'Buyer',description:'Discover products, services, courses, jobs, tasks and communities.'},
  {value:'seller',label:'Seller / Vendor',description:'Sell products, digital goods and eligible services.'},
  {value:'affiliate',label:'Affiliate',description:'Promote listings and earn configured commissions.'},
  {value:'service_provider',label:'Freelancer / Service Provider',description:'Offer professional services and skills.'},
  {value:'employer',label:'Employer / Job Poster',description:'Recruit talent and publish eligible jobs.'},
  {value:'creator',label:'Creator',description:'Publish content and grow a DRIGHT audience.'},
  {value:'course_creator',label:'Course Creator',description:'Create and monetize eligible courses.'},
  {value:'task_worker',label:'Task Worker / Earner',description:'Complete paid tasks and earning opportunities.'},
  {value:'task_creator',label:'Task Creator',description:'Create and manage paid tasks.'},
  {value:'marketer',label:'Marketer',description:'Use marketing and sales capabilities subject to approval.'},
] as const;

const PENDING_ONBOARDING_TOKEN_KEY='dright_pending_onboarding_token_v1';

export async function checkUsernameAvailability(username:string):Promise<UsernameAvailability>{
  const {data,error}=await supabase.rpc('check_username_availability',{p_username:username});
  if(error) throw error;
  return data as UsernameAvailability;
}

export async function loadSignupOnboardingSettings():Promise<SignupOnboardingSettings>{
  const {data,error}=await supabase.from('signup_onboarding_settings')
    .select('questionnaire_mode,show_interests_during_signup,show_documents_during_signup')
    .eq('singleton',true).maybeSingle();
  if(error) throw error;
  const mode=String(data?.questionnaire_mode??'brief');
  return {
    questionnaire_mode:(['off','minimal','brief','full'].includes(mode)?mode:'brief') as SignupQuestionnaireMode,
    show_interests_during_signup:data?.show_interests_during_signup===true,
    show_documents_during_signup:data?.show_documents_during_signup===true,
  };
}

export async function loadSignupQuestionnaires(profileTypes:string[]):Promise<QuestionnaireDefinition[]>{
  if(profileTypes.length===0) return [];
  const {data:defs,error:defError}=await supabase.from('questionnaire_definitions')
    .select('id,questionnaire_key,name,applicable_profile_type,version,description')
    .in('applicable_profile_type',profileTypes).eq('is_active',true).order('applicable_profile_type');
  if(defError) throw defError;
  const ids=(defs??[]).map((d)=>d.id as string);
  if(ids.length===0) return [];
  const {data:questions,error:qError}=await supabase.from('questionnaire_questions')
    .select('id,questionnaire_id,question_key,label,description,answer_type,options,is_required,sort_order,conditional_rules,validation_rules,is_active')
    .in('questionnaire_id',ids).eq('is_active',true).order('sort_order');
  if(qError) throw qError;
  return (defs??[]).map((definition)=>({
    ...(definition as Omit<QuestionnaireDefinition,'questions'>),
    questions:(questions??[]).filter((q)=>q.questionnaire_id===definition.id) as QuestionnaireQuestion[],
  }));
}

export async function loadAgeRules():Promise<AgeRule[]>{
  const {data,error}=await supabase.from('age_eligibility_rules')
    .select('profile_type,minimum_age,reason,country_overrides').eq('is_active',true);
  if(error) throw error;
  return (data??[]) as AgeRule[];
}

export async function loadPublicKycRequirements():Promise<PublicKycRequirement[]>{
  const {data,error}=await supabase.rpc('get_public_kyc_requirements');
  if(error) throw error;
  return (data??[]) as PublicKycRequirement[];
}

export async function submitSignupOnboarding(input:{
  username:string;countryIso2:string;callingCode:string;dateOfBirth:string;intendedProfiles:string[];interests:string[];
  answers:Record<string,Record<string,unknown>>;
}){
  const {data,error}=await supabase.rpc('submit_signup_onboarding',{
    p_username:input.username,p_country_iso2:input.countryIso2,p_country_calling_code:input.callingCode,
    p_date_of_birth:input.dateOfBirth,p_intended_profiles:input.intendedProfiles,p_interests:input.interests,p_answers:input.answers,
  });
  if(error) throw error;
  return data;
}

function base64Url(bytes:Uint8Array){
  let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export function createPendingOnboardingToken(){const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return base64Url(bytes);}
export function rememberPendingOnboardingToken(token:string){try{localStorage.setItem(PENDING_ONBOARDING_TOKEN_KEY,token);}catch{/* storage may be unavailable */}}
export function getPendingOnboardingToken(){try{return localStorage.getItem(PENDING_ONBOARDING_TOKEN_KEY);}catch{return null;}}
export function clearPendingOnboardingToken(){try{localStorage.removeItem(PENDING_ONBOARDING_TOKEN_KEY);}catch{/* storage may be unavailable */}}

export async function saveSignupOnboardingDraft(input:{
  token:string;email:string;username:string;countryIso2:string;callingCode:string;dateOfBirth:string;intendedProfiles:string[];interests:string[];
  answers:Record<string,Record<string,unknown>>;
}){
  const {data,error}=await supabase.rpc('save_signup_onboarding_draft',{
    p_token:input.token,p_email:input.email,p_username:input.username,p_country_iso2:input.countryIso2,p_country_calling_code:input.callingCode,
    p_date_of_birth:input.dateOfBirth,p_intended_profiles:input.intendedProfiles,p_interests:input.interests,p_answers:input.answers,
  });
  if(error)throw error;
  rememberPendingOnboardingToken(input.token);
  return data;
}

export async function claimPendingSignupOnboarding(token?:string|null){
  const pending=token??getPendingOnboardingToken();if(!pending)return null;
  const {data,error}=await supabase.rpc('claim_signup_onboarding',{p_token:pending});
  if(error){
    const message=error.message?.toLowerCase()??'';
    if(message.includes('not found')||message.includes('expired')||message.includes('already claimed'))clearPendingOnboardingToken();
    throw error;
  }
  clearPendingOnboardingToken();
  return data;
}

export async function resumePendingSignupOnboarding(){
  const token=getPendingOnboardingToken();if(!token)return false;
  const {data:{user}}=await supabase.auth.getUser();if(!user)return false;
  await claimPendingSignupOnboarding(token);return true;
}

export async function uploadProfessionalDocument(input:{file:File;profileType?:string;documentType:string;title?:string;replacesDocumentId?:string}){
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) throw new Error('Authentication required');
  const allowed=['application/pdf','image/jpeg','image/png','image/webp'];
  if(!allowed.includes(input.file.type)) throw new Error('Use PDF, JPG, PNG or WEBP');
  if(input.file.size<=0||input.file.size>20*1024*1024) throw new Error('File must be 20MB or smaller');
  const safeName=input.file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
  const path=`${user.id}/${Date.now()}_${crypto.randomUUID()}_${safeName}`;
  const {error:uploadError}=await supabase.storage.from('professional-docs').upload(path,input.file,{upsert:false,contentType:input.file.type});
  if(uploadError) throw uploadError;
  const {data,error}=await supabase.rpc('register_professional_document',{
    p_profile_type:input.profileType??null,p_document_type:input.documentType,p_title:input.title??input.file.name,
    p_storage_path:path,p_original_file_name:input.file.name,p_mime_type:input.file.type,p_size_bytes:input.file.size,
    p_replaces_document_id:input.replacesDocumentId??null,
  });
  if(error){await supabase.storage.from('professional-docs').remove([path]);throw error;}
  return data;
}

export async function uploadAchievementEvidence(input:{
  file?:File;userAchievementId?:string;achievementId?:string;title:string;description?:string;evidenceType?:'document'|'image'|'certificate'|'portfolio'|'external_link'|'platform_record'|'other';externalUrl?:string;
}){
  const {data:{user}}=await supabase.auth.getUser();if(!user)throw new Error('Authentication required');
  const type=input.evidenceType??(input.externalUrl?'external_link':'document');let path:string|null=null;
  if(input.file){
    const allowed=['application/pdf','image/jpeg','image/png','image/webp'];if(!allowed.includes(input.file.type))throw new Error('Use PDF, JPG, PNG or WEBP');if(input.file.size<=0||input.file.size>20*1024*1024)throw new Error('Evidence file must be 20MB or smaller');
    const safeName=input.file.name.replace(/[^a-zA-Z0-9._-]/g,'_');path=`${user.id}/${Date.now()}_${crypto.randomUUID()}_${safeName}`;
    const {error:uploadError}=await supabase.storage.from('achievement-evidence').upload(path,input.file,{upsert:false,contentType:input.file.type});if(uploadError)throw uploadError;
  }
  const {data,error}=await supabase.rpc('register_achievement_evidence',{
    p_user_achievement_id:input.userAchievementId??null,p_achievement_id:input.achievementId??null,p_title:input.title,p_description:input.description??null,p_evidence_type:type,p_external_url:input.externalUrl??null,p_storage_path:path,
    p_original_file_name:input.file?.name??null,p_mime_type:input.file?.type??null,p_size_bytes:input.file?.size??null,
  });
  if(error){if(path)await supabase.storage.from('achievement-evidence').remove([path]);throw error;}return data;
}

export function calculateAge(dob:string,now=new Date()){
  const birth=new Date(`${dob}T00:00:00`);
  let age=now.getFullYear()-birth.getFullYear();
  const beforeBirthday=now.getMonth()<birth.getMonth()||(now.getMonth()===birth.getMonth()&&now.getDate()<birth.getDate());
  if(beforeBirthday) age-=1;
  return age;
}

export function minimumAgeForProfile(rule:AgeRule|undefined,countryIso2:string){
  if(!rule)return 0;const override=rule.country_overrides?.[countryIso2.toUpperCase()];return typeof override==='number'?override:rule.minimum_age;
}