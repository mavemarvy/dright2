import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type ResourceType = "image" | "video" | "raw" | "auto";

function userClient(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
}

function serviceClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getCloudinaryConfig() {
  const cloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME");
  const apiKey = Deno.env.get("CLOUDINARY_API_KEY");
  const apiSecret = Deno.env.get("CLOUDINARY_API_SECRET");
  if (!cloudName || !apiKey || !apiSecret) throw new Error("Cloudinary is not configured");
  return { cloudName, apiKey, apiSecret };
}

async function requireUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Authentication required");
  const client = userClient(req);
  const { data: { user }, error } = await client.auth.getUser(authHeader.slice(7));
  if (error || !user) throw new Error("Authentication required");
  return { user, client };
}

function safeResourceType(value: unknown): ResourceType {
  const v = String(value || "image").toLowerCase();
  return (["image", "video", "raw", "auto"] as const).includes(v as ResourceType) ? v as ResourceType : "image";
}

function safeFolder(value: unknown): string {
  const raw = String(value || "dright").toLowerCase().replace(/[^a-z0-9/_-]/g, "").replace(/\.{2,}/g, "");
  const segments = raw.split("/").filter(Boolean).slice(0, 3);
  return segments.length ? segments.join("/") : "dright";
}

async function sha1(input: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sign(params: Record<string, string>, secret: string) {
  const body = Object.keys(params).sort().map((key) => `${key}=${params[key]}`).join("&");
  return sha1(body + secret);
}

function cloudinaryBasicAuth(apiKey: string, apiSecret: string) {
  return `Basic ${btoa(`${apiKey}:${apiSecret}`)}`;
}

async function adminMayManage(userId: string) {
  const { data } = await serviceClient().from("users").select("is_admin,admin_status,admin_role").eq("id", userId).maybeSingle();
  return Boolean(data?.is_admin && data?.admin_status === "active" && ["super_admin", "technical_admin", "system_config_admin"].includes(String(data?.admin_role || "")));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { user } = await requireUser(req);
    const config = getCloudinaryConfig();
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    if (action === "get-upload-params") {
      const folderBase = safeFolder(body.folder);
      const resourceType = safeResourceType(body.resourceType);
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const folder = `${folderBase}/${user.id}`;
      const params = { folder, timestamp };
      const signature = await sign(params, config.apiSecret);
      return new Response(JSON.stringify({
        success: true,
        cloudName: config.cloudName,
        apiKey: config.apiKey,
        timestamp,
        folder,
        resourceType,
        signature,
        uploadUrl: `https://api.cloudinary.com/v1_1/${config.cloudName}/${resourceType}/upload`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "optimize-url") {
      const publicId = String(body.publicId || "");
      if (!publicId) throw new Error("Missing publicId");
      const defaults = { quality: "auto", fetch_format: "auto", width: 1200, crop: "limit", ...(body.transformations || {}) };
      const transforms = Object.entries(defaults).map(([k, v]) => `${k}_${String(v).replace(/[^a-zA-Z0-9_.:-]/g, "")}`).join(",");
      const optimizedUrl = `https://res.cloudinary.com/${config.cloudName}/image/upload/${transforms}/${encodeURI(publicId)}`;
      const thumbnailUrl = `https://res.cloudinary.com/${config.cloudName}/image/upload/c_fill,w_200,h_200,q_auto,f_auto/${encodeURI(publicId)}`;
      return new Response(JSON.stringify({ success: true, optimizedUrl, thumbnailUrl }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "register-upload") {
      const publicId = String(body.publicId || "");
      const resourceType = safeResourceType(body.resourceType === "auto" ? "image" : body.resourceType);
      if (!publicId || !publicId.includes(`/${user.id}/`)) throw new Error("Upload ownership mismatch");
      const encoded = publicId.split("/").map(encodeURIComponent).join("/");
      const resourceUrl = `https://api.cloudinary.com/v1_1/${config.cloudName}/resources/${resourceType}/upload/${encoded}`;
      const resourceRes = await fetch(resourceUrl, { headers: { Authorization: cloudinaryBasicAuth(config.apiKey, config.apiSecret) } });
      if (!resourceRes.ok) throw new Error(`Unable to verify Cloudinary resource (${resourceRes.status})`);
      const resource = await resourceRes.json();
      if (resource.public_id !== publicId) throw new Error("Cloudinary resource validation failed");
      const mime = resourceType === "raw" ? "application/octet-stream" : `${resourceType}/${resource.format || (resourceType === "image" ? "jpeg" : "mp4")}`;
      const mediaType = resourceType === "raw" ? "document" : resourceType;
      const feature = String(body.feature || "cloudinary_upload").slice(0, 80);
      const visibility = ["public", "private", "participants", "admin"].includes(String(body.visibility)) ? String(body.visibility) : "public";
      const { data: asset, error } = await serviceClient().from("media_assets").upsert({
        owner_user_id: user.id,
        provider: "cloudinary",
        bucket: null,
        object_path: resource.secure_url || null,
        provider_id: publicId,
        media_type: mediaType,
        mime_type: mime,
        original_filename: resource.original_filename || publicId.split("/").pop(),
        bytes: Number(resource.bytes || 0),
        width: resource.width || null,
        height: resource.height || null,
        duration_ms: resource.duration ? Math.round(Number(resource.duration) * 1000) : null,
        aspect_ratio: resource.width && resource.height ? Number(resource.width) / Number(resource.height) : null,
        status: "active",
        processing_status: "ready",
        visibility,
        feature,
        reference_table: body.referenceTable || null,
        reference_id: body.referenceId || null,
        metadata: { resource_type: resource.resource_type, format: resource.format, version: resource.version },
        deleted_at: null,
      }, { onConflict: "provider,provider_id" }).select("id").single();
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, assetId: asset.id, url: resource.secure_url, bytes: resource.bytes }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "delete") {
      const publicId = String(body.publicId || "");
      const resourceType = safeResourceType(body.resourceType === "auto" ? "image" : body.resourceType);
      if (!publicId) throw new Error("Missing publicId");
      const service = serviceClient();
      const { data: asset } = await service.from("media_assets").select("owner_user_id,provider_id").eq("provider", "cloudinary").eq("provider_id", publicId).is("deleted_at", null).maybeSingle();
      const legacyOwned = publicId.includes(`/${user.id}/`);
      const permitted = asset?.owner_user_id === user.id || legacyOwned || await adminMayManage(user.id);
      if (!permitted) throw new Error("Not authorized to delete this asset");
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const params = { public_id: publicId, timestamp };
      const signature = await sign(params, config.apiSecret);
      const form = new URLSearchParams({ public_id: publicId, timestamp, api_key: config.apiKey, signature });
      const res = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/${resourceType}/destroy`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !["ok", "not found"].includes(String(payload.result))) throw new Error(`Cloudinary delete failed (${res.status})`);
      await service.from("media_assets").update({ status: "deleted", deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("provider", "cloudinary").eq("provider_id", publicId).eq("owner_user_id", asset?.owner_user_id || user.id);
      return new Response(JSON.stringify({ success: true, result: payload.result }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    throw new Error("Unknown action");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /Authentication|required|authorized|ownership/i.test(message) ? 403 : 400;
    return new Response(JSON.stringify({ success: false, error: message }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
