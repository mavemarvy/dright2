import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const BOT_KEYWORDS = [
  "googlebot", "bingbot", "bingpreview", "crawler", "spider", "slurp",
  "facebookexternalhit", "twitterbot", "linkedinbot", "telegrambot",
  "uptimebot", "healthcheck", "headlesschrome",
];

const ENTITY_TYPES = new Set([
  "product", "service", "job", "course", "digital_download", "profile", "platform",
  "campaign", "promotion", "affiliate", "referral", "order", "payment", "wallet",
]);

const SOURCES = new Set([
  "marketplace", "affiliate", "search", "profile", "store", "recommendation", "direct",
  "referral", "social", "external", "qr_code", "campaign", "advertisement", "checkout",
  "payment", "system",
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_RE = /^[a-z0-9][a-z0-9_:-]{0,79}$/i;

function isBot(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  return BOT_KEYWORDS.some((kw) => ua.includes(kw));
}

function hashString(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function cleanUuid(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value);
  return UUID_RE.test(text) ? text : null;
}

function cleanText(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
}

async function resolveOwner(
  admin: ReturnType<typeof createClient>,
  entityType: string,
  entityId: string | null,
  sellerHint: string | null,
): Promise<string | null> {
  if (!entityId) return sellerHint;

  if (["product", "service", "course", "digital_download"].includes(entityType)) {
    const { data } = await admin.from("products").select("uploaded_by").eq("id", entityId).maybeSingle();
    return cleanUuid(data?.uploaded_by) || sellerHint;
  }

  if (entityType === "job") {
    const { data } = await admin.from("jobs").select("employer_id").eq("id", entityId).maybeSingle();
    return cleanUuid(data?.employer_id) || sellerHint;
  }

  if (entityType === "profile") return entityId;
  return sellerHint;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } }, 405);

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json({ success: false, error: { code: "INVALID_BODY", message: "Valid JSON body required" } }, 400);
    }

    const eventType = cleanText((body as any).event_type, 80);
    if (!eventType || !EVENT_RE.test(eventType)) {
      return json({ success: false, error: { code: "INVALID_EVENT_TYPE", message: "Valid event_type is required" } }, 400);
    }

    const entityTypeRaw = cleanText((body as any).entity_type, 40) || "platform";
    const entityType = ENTITY_TYPES.has(entityTypeRaw) ? entityTypeRaw : "platform";
    const entityId = cleanUuid((body as any).entity_id);
    if ((body as any).entity_id && !entityId) {
      return json({ success: false, error: { code: "INVALID_ENTITY_ID", message: "entity_id must be a UUID" } }, 400);
    }

    const sessionId = cleanText((body as any).session_id, 160);
    if (!sessionId) {
      return json({ success: false, error: { code: "MISSING_SESSION", message: "session_id is required" } }, 400);
    }

    const metadata = (body as any).metadata && typeof (body as any).metadata === "object" && !Array.isArray((body as any).metadata)
      ? (body as any).metadata
      : {};
    if (JSON.stringify(metadata).length > 16_384) {
      return json({ success: false, error: { code: "METADATA_TOO_LARGE", message: "Analytics metadata is too large" } }, 413);
    }

    const userAgent = req.headers.get("User-Agent") || "";
    if (isBot(userAgent)) return json({ success: true, tracked: false, reason: "bot" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return json({ success: false, error: { code: "CONFIGURATION_ERROR", message: "Analytics service is not configured" } }, 500);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let viewerId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7).trim();
      // Supabase clients may send the anonymous project key when no user is signed in.
      // Only non-anon tokens are treated as user credentials, and they must validate.
      if (token && token !== anonKey) {
        const { data: authData, error: authError } = await admin.auth.getUser(token);
        if (authError || !authData.user) {
          return json({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid analytics user session" } }, 401);
        }
        viewerId = authData.user.id;
      }
    }

    const sellerHint = cleanUuid((body as any).seller_id);
    const sellerId = await resolveOwner(admin, entityType, entityId, sellerHint);
    const sourceRaw = cleanText((body as any).source, 80) || "direct";
    const source = SOURCES.has(sourceRaw) ? sourceRaw : "direct";

    const country = cleanText(req.headers.get("cf-ipcountry") || req.headers.get("x-country-code") || (body as any).country, 100);
    const city = cleanText(req.headers.get("x-city") || (body as any).city, 100);
    const referrer = cleanText(req.headers.get("Referer") || (body as any).referrer, 1000);
    const deviceHash = hashString(`${userAgent}|${sessionId}`);

    const { data, error } = await admin.rpc("track_analytics_event", {
      p_event_type: eventType,
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_seller_id: sellerId,
      p_session_id: sessionId,
      p_device_hash: deviceHash,
      p_browser: userAgent.slice(0, 255),
      p_country: country,
      p_city: city,
      p_referrer: referrer,
      p_source: source,
      p_metadata: { ...metadata, _verified_viewer_id: viewerId },
      p_is_bot: false,
      p_device_type: cleanText((body as any).device_type, 30),
      p_os: cleanText((body as any).os, 60),
      p_browser_name: cleanText((body as any).browser_name, 60),
      p_state: cleanText((body as any).state, 100),
      p_language: cleanText((body as any).language, 30),
      p_timezone: cleanText((body as any).timezone, 100),
      p_session_duration: Number.isInteger((body as any).session_duration) ? Math.max(0, Math.min((body as any).session_duration, 86_400)) : null,
      p_is_bounce: Boolean((body as any).is_bounce),
      p_keywords: cleanText((body as any).keywords, 500),
    });

    if (error) {
      console.error("[track-event] ingestion failure", error.code || "RPC_ERROR");
      return json({ success: false, error: { code: "ANALYTICS_INGESTION_FAILED", message: "Event could not be recorded" } }, 500);
    }

    return json({ success: true, ...(data || { tracked: false }) });
  } catch (error) {
    console.error("[track-event] unhandled", error instanceof Error ? error.message : String(error));
    return json({ success: false, error: { code: "INTERNAL_ERROR", message: "Event could not be recorded" } }, 500);
  }
});
