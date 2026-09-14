import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const BOT_KEYWORDS = ["googlebot","bingbot","bingpreview","crawler","spider","slurp","facebookexternalhit","twitterbot","linkedinbot","telegrambot","uptimebot","healthcheck","headlesschrome"];
const ENTITY_TYPES = new Set(["product","service","job","course","digital_download","profile","platform","campaign","promotion","affiliate","referral","order","payment","wallet","store","community","post","news"]);
const SOURCES = new Set(["marketplace","affiliate","search","profile","store","recommendation","direct","referral","social","external","qr_code","campaign","advertisement","checkout","payment","system","news","community"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_RE = /^[a-z0-9][a-z0-9_:-]{0,79}$/i;
const MAX_BATCH = 50;

function isBot(userAgent: string) { const ua = userAgent.toLowerCase(); return BOT_KEYWORDS.some(kw => ua.includes(kw)); }
function hashString(input: string) { let hash = 0; for (let i=0;i<input.length;i++){ hash=(hash<<5)-hash+input.charCodeAt(i); hash|=0; } return Math.abs(hash).toString(36); }
function cleanUuid(value: unknown): string | null { if (value===null||value===undefined||value==="") return null; const text=String(value); return UUID_RE.test(text)?text:null; }
function cleanText(value: unknown,max:number): string | null { if(value===null||value===undefined)return null; const text=String(value).trim(); return text?text.slice(0,max):null; }

async function resolveOwner(admin: ReturnType<typeof createClient>, entityType: string, entityId: string | null, sellerHint: string | null, cache: Map<string,string|null>) {
  if (!entityId) return sellerHint;
  const key=`${entityType}:${entityId}`; if(cache.has(key)) return cache.get(key) ?? sellerHint;
  let owner: string | null = sellerHint;
  if (["product","service","course","digital_download"].includes(entityType)) {
    const { data } = await admin.from("products").select("uploaded_by").eq("id",entityId).maybeSingle(); owner=cleanUuid(data?.uploaded_by)||sellerHint;
  } else if(entityType==="job") {
    const { data } = await admin.from("jobs").select("employer_id").eq("id",entityId).maybeSingle(); owner=cleanUuid(data?.employer_id)||sellerHint;
  } else if(["profile","store"].includes(entityType)) owner=entityId;
  cache.set(key,owner); return owner;
}

function normalizeEvent(raw: any) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("INVALID_EVENT");
  const eventType=cleanText(raw.event_type,80); if(!eventType||!EVENT_RE.test(eventType)) throw new Error("INVALID_EVENT_TYPE");
  const entityTypeRaw=cleanText(raw.entity_type,40)||"platform"; const entityType=ENTITY_TYPES.has(entityTypeRaw)?entityTypeRaw:"platform";
  const entityId=cleanUuid(raw.entity_id); if(raw.entity_id&&!entityId) throw new Error("INVALID_ENTITY_ID");
  const sessionId=cleanText(raw.session_id,160); if(!sessionId) throw new Error("MISSING_SESSION");
  const metadata=raw.metadata&&typeof raw.metadata==="object"&&!Array.isArray(raw.metadata)?raw.metadata:{};
  if(JSON.stringify(metadata).length>16_384) throw new Error("METADATA_TOO_LARGE");
  return { raw,eventType,entityType,entityId,sessionId,metadata };
}

Deno.serve(async (req: Request) => {
  if(req.method==="OPTIONS") return new Response(null,{status:200,headers:corsHeaders});
  if(req.method!=="POST") return json({success:false,error:{code:"METHOD_NOT_ALLOWED",message:"Method not allowed"}},405);
  try {
    const body=await req.json().catch(()=>null); if(!body||typeof body!=="object") return json({success:false,error:{code:"INVALID_BODY",message:"Valid JSON body required"}},400);
    const rawEvents=Array.isArray((body as any).events)?(body as any).events:[body];
    if(rawEvents.length===0) return json({success:false,error:{code:"EMPTY_BATCH",message:"At least one event is required"}},400);
    if(rawEvents.length>MAX_BATCH) return json({success:false,error:{code:"BATCH_TOO_LARGE",message:`Maximum batch size is ${MAX_BATCH}`}},413);
    if(JSON.stringify(body).length>256_000) return json({success:false,error:{code:"BODY_TOO_LARGE",message:"Analytics batch is too large"}},413);

    const userAgent=req.headers.get("User-Agent")||""; if(isBot(userAgent)) return json({success:true,tracked:false,reason:"bot",accepted:0});
    const supabaseUrl=Deno.env.get("SUPABASE_URL")||""; const anonKey=Deno.env.get("SUPABASE_ANON_KEY")||""; const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
    if(!supabaseUrl||!anonKey||!serviceKey) return json({success:false,error:{code:"CONFIGURATION_ERROR",message:"Analytics service is not configured"}},500);
    const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});

    let viewerId:string|null=null; const authHeader=req.headers.get("Authorization");
    if(authHeader?.startsWith("Bearer ")){
      const token=authHeader.slice(7).trim();
      if(token&&token!==anonKey){ const {data:authData,error:authError}=await admin.auth.getUser(token); if(authError||!authData.user) return json({success:false,error:{code:"UNAUTHORIZED",message:"Invalid analytics user session"}},401); viewerId=authData.user.id; }
    }

    let normalized: ReturnType<typeof normalizeEvent>[];
    try { normalized=rawEvents.map(normalizeEvent); }
    catch(e){ const code=e instanceof Error?e.message:"INVALID_EVENT"; const status=code==="METADATA_TOO_LARGE"?413:400; return json({success:false,error:{code,message:"One or more analytics events are invalid"}},status); }

    // Request-local duplicate suppression. Financial truth is still handled by canonical checkout/order/payment systems.
    const seen=new Set<string>();
    normalized=normalized.filter(ev=>{
      const dedupe=cleanText(ev.metadata?.dedupe_key,160)||"";
      const key=`${ev.eventType}|${ev.entityType}|${ev.entityId||""}|${ev.sessionId}|${dedupe}`;
      if(seen.has(key)) return false; seen.add(key); return true;
    });

    const countryHeader=cleanText(req.headers.get("cf-ipcountry")||req.headers.get("x-country-code"),100);
    const cityHeader=cleanText(req.headers.get("x-city"),100); const referrerHeader=cleanText(req.headers.get("Referer"),1000);
    const ownerCache=new Map<string,string|null>(); const results:any[]=[];

    for(const ev of normalized){
      const sellerHint=cleanUuid(ev.raw.seller_id); const sellerId=await resolveOwner(admin,ev.entityType,ev.entityId,sellerHint,ownerCache);
      const sourceRaw=cleanText(ev.raw.source,80)||"direct"; const source=SOURCES.has(sourceRaw)?sourceRaw:"direct";
      const country=countryHeader||cleanText(ev.raw.country,100); const city=cityHeader||cleanText(ev.raw.city,100); const referrer=referrerHeader||cleanText(ev.raw.referrer,1000);
      const deviceHash=hashString(`${userAgent}|${ev.sessionId}`);
      const {data,error}=await admin.rpc("track_analytics_event",{
        p_event_type:ev.eventType,p_entity_type:ev.entityType,p_entity_id:ev.entityId,p_seller_id:sellerId,p_session_id:ev.sessionId,p_device_hash:deviceHash,p_browser:userAgent.slice(0,255),p_country:country,p_city:city,p_referrer:referrer,p_source:source,p_metadata:{...ev.metadata,_verified_viewer_id:viewerId},p_is_bot:false,
        p_device_type:cleanText(ev.raw.device_type,30),p_os:cleanText(ev.raw.os,60),p_browser_name:cleanText(ev.raw.browser_name,60),p_state:cleanText(ev.raw.state,100),p_language:cleanText(ev.raw.language,30),p_timezone:cleanText(ev.raw.timezone,100),p_session_duration:Number.isInteger(ev.raw.session_duration)?Math.max(0,Math.min(ev.raw.session_duration,86_400)):null,p_is_bounce:Boolean(ev.raw.is_bounce),p_keywords:cleanText(ev.raw.keywords,500),
      });
      if(error){ console.error("[track-event] ingestion failure",error.code||"RPC_ERROR"); results.push({success:false,code:"ANALYTICS_INGESTION_FAILED"}); }
      else results.push({success:true,...(data||{tracked:false})});
    }

    const failed=results.filter(r=>!r.success).length;
    return json({success:failed===0,accepted:normalized.length,failed,results:rawEvents.length===1?undefined:results,...(rawEvents.length===1?(results[0]||{tracked:false}):{})},failed===normalized.length&&normalized.length>0?500:200);
  } catch(error){ console.error("[track-event] unhandled",error instanceof Error?error.message:String(error)); return json({success:false,error:{code:"INTERNAL_ERROR",message:"Event could not be recorded"}},500); }
});
