import { createClient } from "npm:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization, X-Client-Info, Apikey"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const db=()=>createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const allowedRoles=new Set(["super_admin","sales_team_manager","sales_marketing_admin","advertising_admin"]);

type SearchResult={title:string;url:string;snippet:string;source:string};

const platformFor=(raw:string)=>{try{const h=new URL(raw).hostname.toLowerCase().replace(/^www\./,"");if(h.includes("tiktok.com"))return"TikTok";if(h.includes("linkedin.com"))return"LinkedIn";if(h.includes("fiverr.com"))return"Fiverr";if(h.includes("upwork.com"))return"Upwork";if(h.includes("instagram.com"))return"Instagram";if(h.includes("youtube.com")||h==="youtu.be")return"YouTube";if(h.includes("facebook.com"))return"Facebook";if(h==="x.com"||h.includes("twitter.com"))return"X";if(h.includes("github.com"))return"GitHub";return"Other"}catch{return"Other"}};

const safeParse=(content:string)=>{const clean=content.replace(/^\s*```(?:json)?/i,"").replace(/```\s*$/," ").trim();try{return JSON.parse(clean)}catch{const s=clean.indexOf("{"),e=clean.lastIndexOf("}");if(s>=0&&e>s){try{return JSON.parse(clean.slice(s,e+1))}catch{}}return null}};

const textFromHtml=(html:string)=>html.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/\s+/g," ").trim().slice(0,12000);
const meta=(html:string,name:string)=>{const re=new RegExp(`<meta[^>]+(?:property|name)=["']${name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}["'][^>]+content=["']([^"']*)["']`,`i`);return html.match(re)?.[1]||null};

async function fetchPage(url:string){try{const r=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0 DRIGHT-Research/1.0","Accept":"text/html,application/xhtml+xml"},redirect:"follow"});const html=await r.text();return{url:r.url||url,status:r.status,title:meta(html,"og:title")||html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim()||null,description:meta(html,"og:description")||meta(html,"description")||null,text:textFromHtml(html)};}catch(e){return{url,status:0,title:null,description:null,text:"",error:e instanceof Error?e.message:"fetch failed"};}}

async function searchGoogle(q:string):Promise<SearchResult[]>{const key=Deno.env.get("GOOGLE_CSE_API_KEY"),cx=Deno.env.get("GOOGLE_CSE_CX");if(!key||!cx)return[];try{const u=new URL("https://www.googleapis.com/customsearch/v1");u.searchParams.set("key",key);u.searchParams.set("cx",cx);u.searchParams.set("q",q);u.searchParams.set("num","10");const r=await fetch(u);const j=await r.json();return Array.isArray(j.items)?j.items.map((x:any)=>({title:String(x.title||""),url:String(x.link||""),snippet:String(x.snippet||""),source:"Google"})).filter((x:SearchResult)=>x.url):[];}catch{return[]}}

async function searchSerper(q:string):Promise<SearchResult[]>{const key=Deno.env.get("SERPER_API_KEY");if(!key)return[];try{const r=await fetch("https://google.serper.dev/search",{method:"POST",headers:{"X-API-KEY":key,"Content-Type":"application/json"},body:JSON.stringify({q,num:10})});const j=await r.json();return Array.isArray(j.organic)?j.organic.map((x:any)=>({title:String(x.title||""),url:String(x.link||""),snippet:String(x.snippet||""),source:"Google/Serper"})).filter((x:SearchResult)=>x.url):[];}catch{return[]}}

async function searchBing(q:string):Promise<SearchResult[]>{const key=Deno.env.get("BING_SEARCH_API_KEY");if(!key)return[];try{const u=new URL("https://api.bing.microsoft.com/v7.0/search");u.searchParams.set("q",q);u.searchParams.set("count","10");const r=await fetch(u,{headers:{"Ocp-Apim-Subscription-Key":key}});const j=await r.json();return Array.isArray(j.webPages?.value)?j.webPages.value.map((x:any)=>({title:String(x.name||""),url:String(x.url||""),snippet:String(x.snippet||""),source:"Bing"})).filter((x:SearchResult)=>x.url):[];}catch{return[]}}

async function searchDuckDuckGo(q:string):Promise<SearchResult[]>{try{const u=`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;const r=await fetch(u,{headers:{"User-Agent":"Mozilla/5.0 DRIGHT-Research/1.0"}});const html=await r.text();const out:SearchResult[]=[];const re=/<a[^>]+class=["']result__a["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class=["']result__snippet["'][^>]*>([\s\S]*?)<\/a>/gi;let m;while((m=re.exec(html))&&out.length<10){const clean=(s:string)=>s.replace(/<[^>]+>/g," ").replace(/&amp;/g,"&").replace(/\s+/g," ").trim();let url=m[1];try{url=new URL(url,"https://html.duckduckgo.com").href;}catch{}out.push({title:clean(m[2]),url,snippet:clean(m[3]),source:"DuckDuckGo"});}return out;}catch{return[]}}

async function webSearch(queries:string[]){const all:SearchResult[]=[];for(const q of queries.slice(0,5)){const [google,serper,bing,ddg]=await Promise.all([searchGoogle(q),searchSerper(q),searchBing(q),searchDuckDuckGo(q)]);all.push(...google,...serper,...bing,...ddg);}const seen=new Set<string>();return all.filter(x=>{const k=x.url.replace(/[?#].*$/,""),ok=!!k&&!seen.has(k);if(ok)seen.add(k);return ok;}).slice(0,30);}

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
  const {data:applicant,error:applicantError}=await client.from("users").select("id,full_name,username,social_media_links,marketer_social_analysis").eq("id",applicantId).single();
  if(applicantError||!applicant)return json({error:"Applicant not found"},404);
  const links=Array.isArray(applicant.social_media_links)?applicant.social_media_links.map((v:unknown)=>String(v).trim()).filter(Boolean):[];
  const targets=requestedUrl?[requestedUrl]:links;
  if(!targets.length)return json({error:"No submitted profile links"},400);

  const existing=Array.isArray(applicant.marketer_social_analysis)?applicant.marketer_social_analysis:[];
  const reports:any[]=[];
  for(const profileUrl of targets.slice(0,10)){
   const basic=existing.find((x:any)=>x?.profile_url===profileUrl)||{};
   const platform=platformFor(profileUrl);
   const username=(profileUrl.match(/(?:^|\/)@([^/?#]+)/)?.[1]||applicant.username||"").trim();
   const profilePage=await fetchPage(profileUrl);
   const searchQueries=[`"${profileUrl}"`,`"${username}" ${platform}`,`"${username}" profile`,username?`"${username}" ${platform} followers`:""] .filter(Boolean);
   const webResults=await webSearch(searchQueries);
   const pageEvidence={url:profilePage.url,status:profilePage.status,title:profilePage.title,description:profilePage.description,text:profilePage.text.slice(0,8000)};
   const externalEvidence=[];
   for(const result of webResults.slice(0,8)){const page=await fetchPage(result.url);externalEvidence.push({search_result:result,page:{url:page.url,status:page.status,title:page.title,description:page.description,text:page.text.slice(0,3500)}});}
   const evidence={profile_url:profileUrl,platform,username,profile_page:pageEvidence,existing_analysis:{profile_title:basic.profile_title??null,profile_description:basic.profile_description??null,followers:basic.followers??null,following:basic.following??null,likes:basic.likes??null,content_count:basic.content_count??null,verified_indicator:basic.verified_indicator??false,authenticity_score:basic.authenticity_score??null,risk_level:basic.risk_level??"UNKNOWN",confidence_score:basic.confidence_score??0,signals:basic.signals??[],data_source:basic.data_source??"automatic analysis"},search_results:webResults.slice(0,20),external_pages:externalEvidence};

   const prompt=`You are DRIGHT's profile verification and web research analyst. You have been given direct profile evidence plus search-engine results and pages. Analyze ONLY this evidence. Search results are leads, not proof; distinguish the submitted profile from similarly named accounts. Prefer exact URL/handle matches. Never invent metrics, account age, identity, engagement, or bot proof. If a metric appears only in a search snippet or third-party page, label it as externally reported and lower confidence. If sources conflict, report the conflict. Calculate engagement only when the required values are actually available. Do not expose private applicant information.

Return STRICT JSON only:
{
 "profile_details":{"handle":"... or null","display_name":"... or null","bio":"... or null","canonical_url":"... or null","verified":true|false|null,"followers":number|null,"following":number|null,"likes":number|null,"content_count":number|null,"location":"... or null","links":["..."],"category":"... or null"},
 "summary":"factual summary",
 "profile_health_score":0-100|null,
 "authenticity_score":0-100|null,
 "bot_risk_level":"LOW|MEDIUM|HIGH|UNKNOWN",
 "bot_risk_score":0-100|null,
 "engagement_quality":"STRONG|FAIR|WEAK|UNKNOWN",
 "activity_health":"STRONG|FAIR|WEAK|UNKNOWN",
 "identity_consistency_score":0-100|null,
 "research_confidence":0-100,
 "verified_facts":["..."],
 "calculated_metrics":["..."],
 "positive_signals":["..."],
 "risk_signals":["..."],
 "external_matches":[{"platform":"...","url":"...","match_reason":"...","confidence":0-100}],
 "limitations":["..."],
 "recommendation":"approve_review|manual_review|request_more_evidence|reject_review",
 "admin_note":"one concise recommendation",
 "disclaimer":"Automated research is evidence-based and cannot prove that followers are real or that an account is operated by a bot."
}

Applicant profile: ${JSON.stringify({full_name:applicant.full_name,username:applicant.username})}
Evidence: ${JSON.stringify(evidence)}`;

   const aiUrl=`${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-proxy`;
   const aiResponse=await fetch(aiUrl,{method:"POST",headers:{"Content-Type":"application/json","Authorization":auth,"apikey":Deno.env.get("SUPABASE_ANON_KEY")||""},body:JSON.stringify({feature:"generate-text",prompt,useCache:false})});
   const aiJson=await aiResponse.json().catch(()=>null);
   if(!aiResponse.ok||!aiJson?.success)throw new Error(aiJson?.error||"AI deep research provider is unavailable");
   const research=safeParse(String(aiJson.content||""));
   if(!research)throw new Error("AI returned an invalid research report");
   research.web_sources=webResults.slice(0,20);
   research.search_engine_mode={google:!!(Deno.env.get("GOOGLE_CSE_API_KEY")&&Deno.env.get("GOOGLE_CSE_CX")),google_serper:!!Deno.env.get("SERPER_API_KEY"),bing:!!Deno.env.get("BING_SEARCH_API_KEY"),duckduckgo:true};

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