import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function getSupabaseClient(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (authHeader) {
    return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  }
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
}

function getCloudinaryConfig() {
  const cloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME");
  const apiKey = Deno.env.get("CLOUDINARY_API_KEY");
  const apiSecret = Deno.env.get("CLOUDINARY_API_SECRET");
  if (!cloudName || !apiKey || !apiSecret) throw new Error("Missing Cloudinary configuration");
  return { cloudName, apiKey, apiSecret };
}

function generateSignature(params: Record<string, string>, apiSecret: string): string {
  const sorted = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
  const encoder = new TextEncoder();
  const data = encoder.encode(sorted + apiSecret);
  // Simple hash using crypto.subtle
  return "";
}

async function sha1Hash(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = getSupabaseClient(req);
    const body = await req.json();
    const action = body.action || "upload";

    const config = getCloudinaryConfig();

    if (action === "get-upload-params") {
      const { folder = "dright", userId } = body;
      if (!userId) throw new Error("Missing userId");

      const timestamp = Math.floor(Date.now() / 1000).toString();
      const params: Record<string, string> = {
        timestamp,
        folder: `${folder}/${userId}`,
        upload_preset: "dright_unsigned",
      };

      const sorted = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
      const signature = await sha1Hash(sorted + config.apiSecret);

      return new Response(JSON.stringify({
        success: true,
        cloudName: config.cloudName,
        apiKey: config.apiKey,
        timestamp,
        folder: `${folder}/${userId}`,
        signature,
        uploadUrl: `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "optimize-url") {
      const { publicId, transformations = {} } = body;
      if (!publicId) throw new Error("Missing publicId");

      const defaults = {
        quality: "auto",
        fetch_format: "auto",
        width: 1200,
        crop: "limit",
        ...transformations,
      };

      const transforms = Object.entries(defaults)
        .map(([k, v]) => `${k}_${v}`)
        .join(",");

      const optimizedUrl = `https://res.cloudinary.com/${config.cloudName}/image/upload/${transforms}/${publicId}`;
      const thumbnailUrl = `https://res.cloudinary.com/${config.cloudName}/image/upload/c_fill,w_200,h_200,q_auto,f_auto/${publicId}`;

      return new Response(JSON.stringify({ success: true, optimizedUrl, thumbnailUrl }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "delete") {
      const { publicId } = body;
      if (!publicId) throw new Error("Missing publicId");

      const timestamp = Math.floor(Date.now() / 1000).toString();
      const params: Record<string, string> = { timestamp, public_id: publicId };
      const sorted = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
      const signature = await sha1Hash(sorted + config.apiSecret);

      const res = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/resources/image/upload?public_id=${publicId}&timestamp=${timestamp}&signature=${signature}&api_key=${config.apiKey}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const err = await res.text().catch(() => "");
        throw new Error(`Cloudinary delete error (${res.status}): ${err.slice(0, 200)}`);
      }

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
