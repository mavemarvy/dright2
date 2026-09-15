import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type ResourceType = "image" | "video" | "raw" | "auto";

function userClient(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
}
function serviceClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
}
function config() {
  const cloudName=Deno.env.get("CLOUDINARY_CLOUD_NAME"), apiKey=Deno.env.get("CLOUDINARY_API_KEY"), apiSecret=Deno.env.get("CLOUDINARY_API_SECRET");
  if(!cloudName||!apiKey||!apiSecret) throw new Error("Cloudinary is not configured");
  return {cloudName,apiKey,apiSecret};
}
async function requireUser(req:Request){const h=req.headers.get("Authorization");if(!h?.startsWith("Bearer "))throw new Error("Authentication required");const client=userClient(req);const {data:{user},error}=await client.auth.getUser(h.slice(7));if(error||!user)throw new Error("Authentication required");return user;}
function resourceType(v:unknown):ResourceType{const x=String(v||"image").toLowerCase();return (["image","video","raw","auto"] as const).includes(x as ResourceType)?x as ResourceType:"image";}
function folder(v:unknown){const raw=String(v||"dright").toLowerCase().replace(/[^a-z0-9/_-]/g,"").replace(/\.{2,}/g,"");return raw.split("/").filter(Boolean).slice(0,3).join("/")||"dright";}
async function sha1(s:string){const h=await crypto.subtle.digest("SHA-1",new TextEncoder().encode(s));return Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,"0")).join("");}
async function sign(p:Record<string,string>,secret:string){return sha1(Object.keys(p).sort().map(k=>`${k}=${p[k]}`).join("&")+secret);}
function basic(k:string,s:string){return `Basic ${btoa(`${k}:${s}`)}`;}
async function mayManage(uid:string){const {data}=await serviceClient().from("users").select("is_admin,admin_status,admin_role").eq("id",uid).maybeSingle();return Boolean(data?.is_admin&&data?.admin_status==="active"&&["super_admin","technical_admin","system_config_admin"].includes(String(data?.admin_role||"")));}
async function ownedOrAdmin(publicId:string,uid:string){if(publicId.includes(`/${uid}/`))return true;const {data}=await serviceClient().from("media_assets").select("owner_user_id").eq("provider","cloudinary").eq("provider_id",publicId).is("deleted_at",null).maybeSingle();return data?.owner_user_id===uid||await mayManage(uid);}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:200,headers:corsHeaders});
  if(req.method!=="POST")return new Response(JSON.stringify({success:false,error:"Method not allowed"}),{status:405,headers:{...corsHeaders,"Content-Type":"application/json"}});
  try{
    const user=await requireUser(req), cfg=config(), body=await req.json().catch(()=>({})), action=String(body.action||"");
    if(action==="get-upload-params"){
      const base=folder(body.folder), type=resourceType(body.resourceType), timestamp=Math.floor(Date.now()/1000).toString(), ownedFolder=`${base}/${user.id}`, params={folder:ownedFolder,timestamp};
      return new Response(JSON.stringify({success:true,cloudName:cfg.cloudName,apiKey:cfg.apiKey,timestamp,folder:ownedFolder,resourceType:type,signature:await sign(params,cfg.apiSecret),uploadUrl:`https://api.cloudinary.com/v1_1/${cfg.cloudName}/${type}/upload`}),{headers:{...corsHeaders,"Content-Type":"application/json"}});
    }
    if(action==="optimize-url"){
      const publicId=String(body.publicId||"");if(!publicId)throw new Error("Missing publicId");if(!await ownedOrAdmin(publicId,user.id))throw new Error("Not authorized for this asset");
      const defaults={quality:"auto",fetch_format:"auto",width:1200,crop:"limit",...(body.transformations||{})};
      const transforms=Object.entries(defaults).map(([k,v])=>`${k}_${String(v).replace(/[^a-zA-Z0-9_.:-]/g,"")}`).join(",");
      const base=`https://res.cloudinary.com/${cfg.cloudName}/image/upload`;
      return new Response(JSON.stringify({success:true,optimizedUrl:`${base}/${transforms}/${encodeURI(publicId)}`,thumbnailUrl:`${base}/c_fill,w_200,h_200,q_auto,f_auto/${encodeURI(publicId)}`}),{headers:{...corsHeaders,"Content-Type":"application/json"}});
    }
    if(action==="register-upload"){
      const publicId=String(body.publicId||""), type=resourceType(body.resourceType==="auto"?"image":body.resourceType);if(!publicId||!publicId.includes(`/${user.id}/`))throw new Error("Upload ownership mismatch");
      const encoded=publicId.split("/").map(encodeURIComponent).join("/"), verify=await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloudName}/resources/${type}/upload/${encoded}`,{headers:{Authorization:basic(cfg.apiKey,cfg.apiSecret)}});if(!verify.ok)throw new Error(`Unable to verify Cloudinary resource (${verify.status})`);
      const r=await verify.json();if(r.public_id!==publicId)throw new Error("Cloudinary resource validation failed");
      const mime=type==="raw"?"application/octet-stream":`${type}/${r.format||(type==="image"?"jpeg":"mp4")}`, mediaType=type==="raw"?"document":type, feature=String(body.feature||"cloudinary_upload").slice(0,80), visibility=["public","private","participants","admin"].includes(String(body.visibility))?String(body.visibility):"public", service=serviceClient();
      const row={owner_user_id:user.id,provider:"cloudinary",bucket:null,object_path:r.secure_url||null,provider_id:publicId,media_type:mediaType,mime_type:mime,original_filename:r.original_filename||publicId.split("/").pop(),bytes:Number(r.bytes||0),width:r.width||null,height:r.height||null,duration_ms:r.duration?Math.round(Number(r.duration)*1000):null,aspect_ratio:r.width&&r.height?Number(r.width)/Number(r.height):null,status:"active",processing_status:"ready",visibility,feature,reference_table:body.referenceTable||null,reference_id:body.referenceId||null,metadata:{resource_type:r.resource_type,format:r.format,version:r.version,secure_url:r.secure_url},deleted_at:null,updated_at:new Date().toISOString()};
      const {data:existing}=await service.from("media_assets").select("id").eq("provider","cloudinary").eq("provider_id",publicId).is("deleted_at",null).maybeSingle();let assetId=existing?.id as string|undefined;
      if(assetId){const {error}=await service.from("media_assets").update(row).eq("id",assetId);if(error)throw error;}else{const {data,error}=await service.from("media_assets").insert(row).select("id").single();if(error)throw error;assetId=data.id;}
      return new Response(JSON.stringify({success:true,assetId,url:r.secure_url,bytes:r.bytes}),{headers:{...corsHeaders,"Content-Type":"application/json"}});
    }
    if(action==="delete"){
      const publicId=String(body.publicId||""), type=resourceType(body.resourceType==="auto"?"image":body.resourceType);if(!publicId)throw new Error("Missing publicId");if(!await ownedOrAdmin(publicId,user.id))throw new Error("Not authorized to delete this asset");
      const timestamp=Math.floor(Date.now()/1000).toString(), params={public_id:publicId,timestamp,invalidate:"true"}, form=new URLSearchParams({...params,api_key:cfg.apiKey,signature:await sign(params,cfg.apiSecret)}), res=await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloudName}/${type}/destroy`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:form}), payload=await res.json().catch(()=>({}));
      if(!res.ok||!["ok","not found"].includes(String(payload.result)))throw new Error(`Cloudinary delete failed (${res.status})`);
      await serviceClient().from("media_assets").update({status:"deleted",deleted_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("provider","cloudinary").eq("provider_id",publicId).is("deleted_at",null);
      return new Response(JSON.stringify({success:true,result:payload.result}),{headers:{...corsHeaders,"Content-Type":"application/json"}});
    }
    throw new Error("Unknown action");
  }catch(error){const message=error instanceof Error?error.message:"Unknown error",status=/Authentication|required|authorized|ownership/i.test(message)?403:400;return new Response(JSON.stringify({success:false,error:message}),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});}
});
