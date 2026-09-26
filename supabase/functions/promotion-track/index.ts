import { createClient } from "npm:@supabase/supabase-js@2.110.0";
import { corsHeaders } from "jsr:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function clean(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function safeDestination(raw: unknown) {
  const value = clean(raw, 2000);
  if (!value) return "https://dright.store/market";
  if (value.startsWith("/")) return `https://dright.store${value}`;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return "https://dright.store/market";
    if (!["dright.store", "www.dright.store", "dright2.vercel.app"].includes(url.hostname)) {
      return "https://dright.store/market";
    }
    return url.toString();
  } catch {
    return "https://dright.store/market";
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!["POST", "GET"].includes(req.method)) return json({ success: false, error: "Method not allowed" }, 405);

  let token = "";
  if (req.method === "GET") {
    token = clean(new URL(req.url).searchParams.get("token"), 80);
  } else {
    const body = await req.json().catch(() => ({}));
    token = clean(body?.token, 80);
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) {
    return json({ success: false, error: "Invalid tracking link", destination: "https://dright.store/market" }, 400);
  }

  const forwarded = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "";
  const userAgent = req.headers.get("user-agent") || "";
  const ipHash = forwarded ? await sha256(`dright-promo-ip-v1:${forwarded.split(",")[0].trim()}`) : "";
  const uaHash = userAgent ? await sha256(`dright-promo-ua-v1:${userAgent}`) : "";

  const { data, error } = await db.rpc("record_promotion_tracking_click", {
    p_token: token,
    p_ip_hash: ipHash,
    p_user_agent_hash: uaHash,
  });

  if (error) {
    console.error("[promotion-track]", error.message);
    return json({ success: false, error: "Tracking unavailable", destination: "https://dright.store/market" }, 500);
  }

  const destination = safeDestination(data?.destination);
  if (req.method === "GET") {
    return Response.redirect(destination, 302);
  }
  return json({ ...data, destination });
});
