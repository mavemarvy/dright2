import { useState,useEffect,useCallback } from 'react';
import { supabase } from './supabase';
import type { KycProvider,KycProviderSetting,KycRule,KycProfile,KycSubmission,KycDocument,KycAuditLog,KycStatus } from './kycTypes';

const ensure=<T,>(data:T|null|undefined,fallback:T):T=>data??fallback;
type SubmissionRpcRow=Partial<KycSubmission>&Record<string,unknown>;
type DocumentRpcRow=Partial<KycDocument>&Record<string,unknown>;
type SafeProfileRpcRow=Partial<KycProfile>&Record<string,unknown>;
type ReviewHistoryRpcRow={id:string;action:string;submission_id:string|null;user_visible_reason:string|null;created_at:string};

const mapSafeProfile=(row:SafeProfileRpcRow):KycProfile=>({
  ...(row as Partial<KycProfile>),reviewer_id:null,notes:null,is_deleted:false,
}) as KycProfile;
const mapSafeSubmission=(row:SubmissionRpcRow):KycSubmission=>({
  ...(row as Partial<KycSubmission>),provider_reference:null,provider_result:null,reviewer_id:null,reviewer_notes:null,is_deleted:false,
}) as KycSubmission;
const mapSafeDocument=(row:DocumentRpcRow):KycDocument=>({
  ...(row as Partial<KycDocument>),reviewer_id:null,reviewer_notes:null,is_deleted:false,
}) as KycDocument;

export function useKycProviders(){
  const [providers,setProviders]=useState<KycProvider[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState<string|null>(null);
  const fetch=useCallback(async()=>{setLoading(true);const {data,error}=await supabase.from('kyc_providers').select('*').eq('is_deleted',false).order('is_system',{ascending:false}).order('name');if(error)setError(error.message);else{setProviders(ensure(data,[]) as KycProvider[]);setError(null);}setLoading(false);},[]);
  useEffect(()=>{void fetch();},[fetch]);return {providers,loading,error,refetch:fetch};
}

/** Credential columns never cross the browser boundary. */
export function useKycProviderSettings(){
  const [settings,setSettings]=useState<KycProviderSetting[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState<string|null>(null);
  const fetch=useCallback(async()=>{setLoading(true);const {data,error}=await supabase.rpc('get_kyc_provider_safe_settings');if(error)setError(error.message);else{setSettings(ensure(data,[]) as KycProviderSetting[]);setError(null);}setLoading(false);},[]);
  useEffect(()=>{void fetch();},[fetch]);return {settings,loading,error,refetch:fetch};
}

export async function updateKycProviderSetting(id:string,updates:Partial<KycProviderSetting>):Promise<void>{
  const {error}=await supabase.rpc('update_kyc_provider_runtime_setting',{
    p_setting_id:id,
    p_is_enabled:typeof updates.is_enabled==='boolean'?updates.is_enabled:null,
    p_mode:updates.mode??null,
  });
  if(error)throw error;
}
export async function setActiveKycProvider(providerId:string):Promise<void>{
  const {error}=await supabase.rpc('set_active_kyc_provider_runtime',{p_provider_id:providerId});if(error)throw error;
}
export async function testKycConnection(providerId:string):Promise<{success:boolean;message:string}>{
  const [{data:provider},{data:settings,error}]=await Promise.all([
    supabase.from('kyc_providers').select('slug').eq('id',providerId).maybeSingle(),
    supabase.rpc('get_kyc_provider_safe_settings'),
  ]);
  if(provider?.slug==='manual')return {success:true,message:'Manual DRIGHT verification is available.'};
  if(error)return {success:false,message:error.message};
  const providerSettings=(settings??[]) as KycProviderSetting[];
  const setting=providerSettings.find((s:KycProviderSetting)=>s.provider_id===providerId);
  if(setting?.is_connected&&setting.health_status==='healthy')return {success:true,message:'Server-side provider health is currently healthy.'};
  return {success:false,message:'Automated provider testing is server-side only. Configure provider credentials/webhooks in approved server secrets and the provider Edge Function.'};
}

export function useKycRules(){
  const [rules,setRules]=useState<KycRule[]>([]);const [loading,setLoading]=useState(true);
  const fetch=useCallback(async()=>{setLoading(true);const {data}=await supabase.from('kyc_rules').select('*').eq('is_deleted',false).order('user_type');setRules(ensure(data,[]) as KycRule[]);setLoading(false);},[]);
  useEffect(()=>{void fetch();},[fetch]);return {rules,loading,refetch:fetch};
}
export async function updateKycRule(id:string,updates:Partial<KycRule>){const {error}=await supabase.from('kyc_rules').update({...updates,updated_at:new Date().toISOString()}).eq('id',id);if(error)throw error;}

export function useKycProfile(userId:string|null){
  const [profile,setProfile]=useState<KycProfile|null>(null);const [loading,setLoading]=useState(false);
  const fetch=useCallback(async()=>{if(!userId){setProfile(null);return;}setLoading(true);
    const {data:{user}}=await supabase.auth.getUser();
    if(user?.id===userId){
      const {data,error}=await supabase.rpc('get_my_kyc_profile');const row=(data??[] as SafeProfileRpcRow[])[0];
      if(!error)setProfile(row?mapSafeProfile(row):null);
    }else{
      const {data,error}=await supabase.from('kyc_profiles').select('*').eq('user_id',userId).eq('is_deleted',false).maybeSingle();if(!error)setProfile(data as KycProfile|null);
    }
    setLoading(false);
  },[userId]);
  useEffect(()=>{void fetch();},[fetch]);return {profile,loading,refetch:fetch};
}
export async function createKycProfile(userId:string,userType:string,profileTypes?:string[]):Promise<KycProfile|null>{
  const {data:{user}}=await supabase.auth.getUser();if(!user||user.id!==userId)throw new Error('Authentication mismatch');
  const {data,error}=await supabase.rpc('create_kyc_profile_for_current_user',{p_primary_type:userType,p_profile_types:profileTypes??[userType]});if(error)throw error;return data as KycProfile;
}
/** Direct status mutation is intentionally disabled; use authoritative review RPCs. */
export async function updateKycProfile(_id:string,_updates:Partial<KycProfile>):Promise<void>{throw new Error('Direct KYC profile updates are disabled. Use the authoritative KYC workflow.');}

export function useKycSubmissions(profileId:string|null){
  const [submissions,setSubmissions]=useState<KycSubmission[]>([]);const [loading,setLoading]=useState(false);
  const fetch=useCallback(async()=>{if(!profileId){setSubmissions([]);return;}setLoading(true);
    const {data:safe,error:safeError}=await supabase.rpc('get_my_kyc_submissions',{p_profile_id:profileId});
    const safeRows=(safe??[]) as SubmissionRpcRow[];
    if(!safeError&&safeRows.length>0){setSubmissions(safeRows.map(mapSafeSubmission));}
    else{const {data}=await supabase.from('kyc_submissions').select('*').eq('profile_id',profileId).eq('is_deleted',false).order('created_at',{ascending:false});setSubmissions(ensure(data,[]) as KycSubmission[]);}
    setLoading(false);
  },[profileId]);
  useEffect(()=>{void fetch();},[fetch]);return {submissions,loading,refetch:fetch};
}
export async function createKycSubmission(profileId:string,_userId:string,providerId?:string):Promise<KycSubmission|null>{
  const {data,error}=await supabase.rpc('start_kyc_submission',{p_profile_id:profileId,p_provider_id:providerId??null});if(error)throw error;return data as KycSubmission;
}
export async function reviewKycSubmission(submissionId:string,_reviewerId:string,action:'approved'|'rejected'|'more_info_requested',notes:string,internalNotes?:string,rejectionReason?:string){
  const userReason=(action==='rejected'||action==='more_info_requested')?(rejectionReason||notes):notes||null;
  const {error}=await supabase.rpc('review_kyc_submission_authoritative',{p_submission_id:submissionId,p_action:action,p_user_visible_reason:userReason,p_internal_note:internalNotes??null});if(error)throw error;
}

export function useKycDocuments(submissionId:string|null){
  const [documents,setDocuments]=useState<KycDocument[]>([]);const [loading,setLoading]=useState(false);
  const fetch=useCallback(async()=>{if(!submissionId){setDocuments([]);return;}setLoading(true);
    const {data:safe,error:safeError}=await supabase.rpc('get_my_kyc_documents',{p_submission_id:submissionId});
    const safeRows=(safe??[]) as DocumentRpcRow[];
    if(!safeError&&safeRows.length>0){setDocuments(safeRows.map(mapSafeDocument));}
    else{const {data}=await supabase.from('kyc_documents').select('*').eq('submission_id',submissionId).eq('is_deleted',false).order('created_at',{ascending:false});setDocuments(ensure(data,[]) as KycDocument[]);}
    setLoading(false);
  },[submissionId]);
  useEffect(()=>{void fetch();},[fetch]);return {documents,loading,refetch:fetch};
}

const ALLOWED_KYC_MIME=new Set(['application/pdf','image/jpeg','image/png','image/webp']);
export async function uploadKycDocument(submissionId:string,userId:string,docType:string,file:File,options?:{replacesDocumentId?:string;issuingCountry?:string;expiresAt?:string|null}):Promise<KycDocument|null>{
  const {data:{user}}=await supabase.auth.getUser();if(!user||user.id!==userId)throw new Error('Authentication mismatch');
  if(!ALLOWED_KYC_MIME.has(file.type))throw new Error('Use PDF, JPG, PNG or WEBP for verification documents');
  if(file.size<=0||file.size>20*1024*1024)throw new Error('Verification document must be 20MB or smaller');
  const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
  const filePath=`${userId}/${submissionId}/${Date.now()}_${crypto.randomUUID()}_${safeName}`;
  const {error:upErr}=await supabase.storage.from('kyc-docs').upload(filePath,file,{upsert:false,contentType:file.type});if(upErr)throw upErr;
  const {data,error}=await supabase.rpc('register_kyc_document',{
    p_submission_id:submissionId,p_doc_type:docType,p_storage_path:filePath,p_original_name:file.name,p_mime_type:file.type,p_size_bytes:file.size,
    p_issuing_country:options?.issuingCountry??null,p_expires_at:options?.expiresAt??null,p_replaces_document_id:options?.replacesDocumentId??null,
  });
  if(error){await supabase.storage.from('kyc-docs').remove([filePath]);throw error;}
  return data as KycDocument;
}
export async function replaceKycDocument(oldDocId:string,submissionId:string,userId:string,docType:string,file:File){return uploadKycDocument(submissionId,userId,docType,file,{replacesDocumentId:oldDocId});}
export async function getDocumentVersions(submissionId:string,docType:string):Promise<KycDocument[]>{
  const {data:safe,error:safeError}=await supabase.rpc('get_my_kyc_documents',{p_submission_id:submissionId});const safeRows=(safe??[]) as DocumentRpcRow[];
  if(!safeError&&safeRows.length>0)return safeRows.filter((d)=>d.doc_type===docType).map(mapSafeDocument).sort((a,b)=>b.version-a.version);
  const {data,error}=await supabase.from('kyc_documents').select('*').eq('submission_id',submissionId).eq('doc_type',docType).order('version',{ascending:false});if(error)throw error;return ensure(data,[]) as KycDocument[];
}
export async function createKycDocumentSignedUrl(document:KycDocument,expiresIn=300):Promise<string>{
  const path=document.storage_path||(!document.doc_url.startsWith('http')?document.doc_url:null);if(!path)throw new Error('Secure storage path is unavailable for this legacy document');
  const {data,error}=await supabase.storage.from(document.storage_bucket||'kyc-docs').createSignedUrl(path,expiresIn);if(error)throw error;return data.signedUrl;
}
export async function reviewKycDocument(documentId:string,decision:'under_review'|'verified'|'rejected'|'needs_resubmission'|'unreadable'|'expired'|'suspected_fraud',userVisibleReason?:string,internalNote?:string,checklist:Record<string,boolean|string>={}){
  const {data,error}=await supabase.rpc('review_kyc_document',{p_document_id:documentId,p_decision:decision,p_user_visible_reason:userVisibleReason??null,p_internal_note:internalNote??null,p_checklist:checklist});if(error)throw error;return data as KycDocument;
}

/** Authoritative RPCs create immutable KYC audit events. */
export async function logKycAudit(_entry:{userId?:string;adminId?:string;action:string;entity_type?:string;entity_id?:string;metadata?:Record<string,unknown>}):Promise<void>{return;}
export function useKycAuditLogs(userId?:string,limit=50){
  const [logs,setLogs]=useState<KycAuditLog[]>([]);const [loading,setLoading]=useState(false);
  const fetch=useCallback(async()=>{setLoading(true);const {data:{user}}=await supabase.auth.getUser();
    if(userId&&user?.id===userId){const {data}=await supabase.rpc('get_my_kyc_review_history',{p_limit:limit});const rows=(data??[]) as ReviewHistoryRpcRow[];setLogs(rows.map((row)=>({id:row.id,user_id:user.id,admin_id:null,action:row.action,entity_type:'review',entity_id:row.submission_id,ip_address:null,device_info:null,metadata:{user_visible_reason:row.user_visible_reason},created_at:row.created_at})) as KycAuditLog[]);}else{let query=supabase.from('kyc_audit_logs').select('*').order('created_at',{ascending:false}).limit(limit);if(userId)query=query.eq('user_id',userId);const {data}=await query;setLogs(ensure(data,[]) as KycAuditLog[]);}setLoading(false);},[userId,limit]);
  useEffect(()=>{void fetch();},[fetch]);return {logs,loading,refetch:fetch};
}

export function useKycReviewQueue(statusFilter?:string){
  const [items,setItems]=useState<(KycSubmission&{profile:KycProfile|null})[]>([]);const [loading,setLoading]=useState(true);
  const fetch=useCallback(async()=>{setLoading(true);let query=supabase.from('kyc_submissions').select('*, profile:kyc_profiles(*)').eq('is_deleted',false);if(statusFilter)query=query.eq('status',statusFilter);const {data}=await query.order('submitted_at',{ascending:false});setItems(ensure(data,[]) as (KycSubmission&{profile:KycProfile|null})[]);setLoading(false);},[statusFilter]);
  useEffect(()=>{void fetch();},[fetch]);return {items,loading,refetch:fetch};
}
export function useKycComplianceStats(){
  const [stats,setStats]=useState({pending:0,under_review:0,approved:0,rejected:0,more_info:0,expired:0,total:0});const [loading,setLoading]=useState(true);
  const fetch=useCallback(async()=>{setLoading(true);const count=async(table:string,status?:string)=>{let q=supabase.from(table).select('*',{count:'exact',head:true}).eq('is_deleted',false);if(status)q=q.eq('status',status);const {count}=await q;return count??0;};const [pending,under_review,approved,rejected,more_info,total,expired]=await Promise.all([count('kyc_submissions','pending'),count('kyc_submissions','under_review'),count('kyc_submissions','approved'),count('kyc_submissions','rejected'),count('kyc_submissions','more_info_required'),count('kyc_submissions'),count('kyc_documents','expired')]);setStats({pending,under_review,approved,rejected,more_info,expired,total});setLoading(false);},[]);
  useEffect(()=>{void fetch();},[fetch]);return {stats,loading,refetch:fetch};
}

export async function recalculateEligibility(userId:string,profileType:string,actionKey='general'){const {data,error}=await supabase.rpc('recalculate_user_eligibility',{p_user_id:userId,p_profile_type:profileType,p_action_key:actionKey});if(error)throw error;return data;}
export type { KycStatus };