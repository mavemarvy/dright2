import { createClient } from "npm:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization, X-Client-Info, Apikey"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const db=()=>createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const allowedRoles=new Set(["super_admin","sales_team_manager","sales_marketing_admin","advertising_admin"]);

const platformFor=(raw:string)=>{try{const h=new URL(raw).hostname.toLowerCase().replace(/^www\./,"");if(h.includes("tiktok.com"))return"TikTok";if(h.includes("linkedin.com"))return"LinkedIn";if(h.includes("fiverr.com"))return"Fiverr";if(h.includes("upwork.com"))return"Upwork";if(h.includes("instagram.com"))return"Instagram";if(h.includes("youtube.com")||h==="youtu.be")return"YouTube";if(h.includes("facebook.com"))return"Facebook";if(h==="x.com"||h.includes("twitter.com"))return"X";if(h.includes("github.com"))return"GitHub";return"Other"}catch{return"Other"}};

const safeParse=(content:string)=>{const clean=content.replace(/^\s*\`\`\`(?:json)?/i,"").replace(/\`\`\`\s*$/,"").trim();try{return JSON.parse(clean)}catch{const s=clean.indexOf("{"),e=clean.lastIndexOf("}");if(s>=0&&e>s){try{return JSON.parse(clean.slice(s,e+1))}catch{}}return null}};

Deno.serve(async req=>{
 if(req.method==="OPTIONS")return json(null);
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 try{
  const auth=req.headers.get("Authorization");if(!auth?.startsWith("Bearer "))return json({error:"Unauthorized"},401);
  const client=db();const {data:{user},error:authError}=await client.auth.getUser(auth.slice(7));
  if(authError||!user)return json({error:"Unauthorized"},401);
  const {data:admin,error:adminError}=await client.from("users").select("id,is_admin,admin_status,admin_role").eq("id",user.id).single();
  if(adminError||!admin?.is_admin||String(admin.admin_status||"").toLowerCase()!=="active"||!allowedRoles.has(String(admin.admin_role||"")))return json({error:"Sales Team administration permission required"},403);

  const body=await req.json().catch(()=>({}));
  const applicantId=String(body.applicant_id||"");const requestedUrl=body.profile_url?String(body.profile_url):null;
  if(!applicantId)return json({error:"Applicant ID is required"},400);
  const {data:applicant,error:applicantError}=await client.from("users").select("id,email,full_name,username,social_media_links,marketer_social_analysis").eq("id",applicantId).single();
  if(applicantError||!applicant)return json({error:"Applicant not found"},404);
  const links=Array.isArray(applicant.social_media_links)?applicant.social_media_links.map((v:unknown)=>String(v).trim()).filter(Boolean):[];
  const targets=requestedUrl?[requestedUrl]:links;
  if(!targets.length)return json({error:"No submitted profile links"},400);

  const existing=Array.isArray(applicant.marketer_social_analysis)?applicant.marketer_social_analysis:[];
  const reports:any[]=[];
  for(const profileUrl of targets.slice(0,10)){
   const basic=existing.find((x:any)=>x?.profile_url===profileUrl)||{};
   const platform=platformFor(profileUrl);
   const evidence={profile_url:profileUrl,platform,profile_title:basic.profile_title??null,profile_description:basic.profile_description??null,followers:basic.followers??null,following:basic.following??null,likes:basic.likes??null,content_count:basic.content_count??null,verified_indicator:basic.verified_indicator??false,authenticity_score:basic.authenticity_score??null,risk_level:basic.risk_level??"UNKNOWN",confidence_score:basic.confidence_score??0,signals:basic.signals??[],data_source:basic.data_source??"automatic analysis"};
   const prompt=`You are DRIGHT's profile verification research analyst. Analyze ONLY the supplied evidence and URL context. Never claim you browsed the live profile unless the evidence explicitly contains data from it. Never invent follower counts, account age, engagement, external mentions, identity matches, or bot proof. Produce a cautious risk assessment for an admin reviewing a Marketer application.

Return STRICT JSON only:
{
 "summary":"short factual summary",
 "authenticity_score":0-100 or null,
 "bot_risk_level":"LOW|MEDIUM|HIGH|UNKNOWN",
 "bot_risk_score":0-100 or null,
 "identity_consistency_score":0-100 or null,
 "research_confidence":0-100,
 "recommendation":"approve_review|manual_review|request_more_evidence|reject_review",
 "positive_signals":["..."],
 "risk_signals":["..."],
 "limitations":["..."],
 "admin_note":"one concise recommendation",
 "disclaimer":"This is an evidence-based estimate, not proof that an account is genuine or a bot."
}

Applicant context: ${JSON.stringify({full_name:applicant.full_name,username:applicant.username,email:applicant.email})}
Evidence: ${JSON.stringify(evidence)}`;

   const aiUrl=`${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-proxy`;
   const aiResponse=await fetch(aiUrl,{method:"POST",headers:{"Content-Type":"application/json","Authorization":auth,"apikey":Deno.env.get("SUPABASE_ANON_KEY")||""},body:JSON.stringify({feature:"marketer-profile-deep-research",prompt,useCache:false})});
   const aiJson=await aiResponse.json().catch(()=>null);
   if(!aiResponse.ok||!aiJson?.success)throw new Error(aiJson?.error||"AI deep research provider is unavailable");
   const research=safeParse(String(aiJson.content||""));
   if(!research)throw new Error("AI returned an invalid research report");

   const report={profile_url:profileUrl,platform,status:"completed",provider:aiJson.provider||"ai-proxy",model:aiJson.model||null,research,requested_at:new Date().toISOString()};
   reports.push(report);
   await client.from("marketer_profile_deep_research").insert({applicant_id:applicantId,profile_url:profileUrl,platform,status:"completed",research,requested_by:user.id});
  }
  const {data:current}=await client.from("users").select("marketer_deep_research").eq("id",applicantId).single();
  const previous=Array.isArray(current?.marketer_deep_research)?current.marketer_deep_research:[];
  const merged=[...reports,...previous].slice(0,30);
  const {error:updateError}=await client.from("users").update({marketer_deep_research:merged,updated_at:new Date().toISOString()}).eq("id",applicantId);
  if(updateError)throw updateError;
  return json({success:true,reports});
 }catch(e){return json({error:e instanceof Error?e.message:"Deep research failed"},400)}
});