import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization, X-Client-Info, Apikey"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const db=()=>createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const allowedRoles=new Set(["super_admin","sales_team_manager","sales_marketing_admin","advertising_admin"]);

async function ensureAnalysis(applicantId:string, links:unknown, auth:string){
  const values=Array.isArray(links)?links.map(v=>String(v).trim()).filter(Boolean):[];
  if(!values.length)return;
  const url=`${Deno.env.get("SUPABASE_URL")}/functions/v1/social-profile-analyzer`;
  try{await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':auth,'apikey':Deno.env.get('SUPABASE_ANON_KEY')||''},body:JSON.stringify({applicant_id:applicantId,links:values})});}catch{ /* review queue must still load if a platform blocks automated fetching */ }
}

Deno.serve(async req=>{
  if(req.method==='OPTIONS') return json(null);
  try{
    const auth=req.headers.get('Authorization'); if(!auth?.startsWith('Bearer ')) return json({error:'Unauthorized'},401);
    const client=db(); const {data:{user},error:authError}=await client.auth.getUser(auth.slice(7));
    if(authError||!user) return json({error:'Unauthorized'},401);
    const {data:admin,error:adminError}=await client.from('users').select('id,is_admin,admin_status,admin_role').eq('id',user.id).single();
    if(adminError||!admin?.is_admin||String(admin.admin_status||'').toLowerCase()!=='active'||!allowedRoles.has(String(admin.admin_role||''))) return json({error:'Sales Team administration permission required'},403);

    if(req.method==='GET'){
      const {data:pending,error}=await client.from('users').select('id,email,full_name,username,avatar_url,created_at,joined_at,location,profession,marketer_level,marketer_status,social_media_links,marketer_social_analysis,verification_status,is_verified,last_active_at').eq('marketer_status','pending').order('created_at',{ascending:false});
      if(error) throw error;
      const applications=pending||[];
      // Existing pending applications submitted before the analyzer was added are analyzed automatically when the admin queue is opened.
      await Promise.all(applications.filter((a:any)=>!Array.isArray(a.marketer_social_analysis)||a.marketer_social_analysis.length===0).slice(0,20).map((a:any)=>ensureAnalysis(a.id,a.social_media_links,auth)));
      let refreshed=applications;
      if(applications.some((a:any)=>!Array.isArray(a.marketer_social_analysis)||a.marketer_social_analysis.length===0)){
        const {data:r}=await client.from('users').select('id,email,full_name,username,avatar_url,created_at,joined_at,location,profession,marketer_level,marketer_status,social_media_links,marketer_social_analysis,verification_status,is_verified,last_active_at').eq('marketer_status','pending').order('created_at',{ascending:false});
        if(r) refreshed=r;
      }
      const {data:recent,error:recentError}=await client.from('marketer_application_review_audit').select('id,applicant_id,reviewer_id,decision,note,social_links_snapshot,created_at').order('created_at',{ascending:false}).limit(100);
      if(recentError) throw recentError;
      return json({pendingApplications:refreshed,reviewHistory:recent||[]});
    }

    if(req.method==='POST'){
      const body=await req.json().catch(()=>({}));
      if(body.action!=='review_marketer_application') return json({error:'Unknown action'},400);
      const applicantId=String(body.applicant_id||''), decision=String(body.decision||''), note=body.note==null?'':String(body.note).trim();
      if(!applicantId||!['approved','rejected','needs_changes'].includes(decision)) return json({error:'Applicant and valid decision are required'},400);
      const {data:applicant,error:applicantError}=await client.from('users').select('id,email,full_name,marketer_level,marketer_status,social_media_links,marketer_social_analysis').eq('id',applicantId).single();
      if(applicantError||!applicant) return json({error:'Applicant not found'},404);
      if(String(applicant.marketer_status||'').toLowerCase()!=='pending') return json({error:'This application is no longer pending review'},409);
      if(!Array.isArray(applicant.marketer_social_analysis)||applicant.marketer_social_analysis.length===0) await ensureAnalysis(applicantId,applicant.social_media_links,auth);
      const nextStatus=decision==='approved'?'approved':decision==='rejected'?'rejected':'needs_changes';
      const update:any={marketer_status:nextStatus,updated_at:new Date().toISOString()};
      if(decision==='approved' && (applicant.marketer_level==null || Number(applicant.marketer_level)<0)) update.marketer_level=0;
      const {data:updated,error:updateError}=await client.from('users').update(update).eq('id',applicantId).select('id,email,full_name,marketer_level,marketer_status,social_media_links,marketer_social_analysis').single();
      if(updateError) throw updateError;
      const {error:auditError}=await client.from('marketer_application_review_audit').insert({applicant_id:applicantId,reviewer_id:user.id,decision,note,social_links_snapshot:applicant.social_media_links||[]});
      if(auditError) throw auditError;
      return json({success:true,application:updated});
    }
    return json({error:'Method not allowed'},405);
  }catch(e){return json({error:e instanceof Error?e.message:'Request failed'},400);}
});
