import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BOT_KEYWORDS = [
  "bot", "crawler", "spider", "slurp", "bingpreview", "facebookexternalhit",
  "twitterbot", "linkedinbot", "whatsapp", "telegrambot", "googlebot",
  "monitor", "uptime", "healthcheck", "curl", "wget", "python-requests",
  "node-fetch", "axios", "postman", "headless",
];

function isBot(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  return BOT_KEYWORDS.some((kw) => ua.includes(kw));
}

function hashString(input: string): string {
  // Simple hash for device fingerprinting (not crypto-grade, just for dedup)
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const {
      event_type,
      entity_type = "product",
      entity_id = null,
      seller_id = null,
      session_id = null,
      source = "direct",
      metadata = {},
    } = body;

    if (!event_type) {
      return new Response(JSON.stringify({ error: "event_type is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userAgent = req.headers.get("User-Agent") || "";
    const botDetected = isBot(userAgent);

    if (botDetected) {
      return new Response(JSON.stringify({ tracked: false, reason: "bot" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const device_hash = hashString(userAgent + (session_id || ""));

    // Use the service role client to call the RPC (bypasses RLS for the SECURITY DEFINER function)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Extract the user's JWT if present (for viewer_id)
    const authHeader = req.headers.get("Authorization");
    const token = authHeader ? authHeader.replace("Bearer ", "") : null;

    // Call the track_analytics_event RPC
    const { data, error } = await supabase.rpc("track_analytics_event", {
      p_event_type: event_type,
      p_entity_type: entity_type,
      p_entity_id: entity_id,
      p_seller_id: seller_id,
      p_session_id: session_id,
      p_device_hash: device_hash,
      p_browser: userAgent.slice(0, 100),
      p_referrer: req.headers.get("Referer") || null,
      p_source: source,
      p_metadata: metadata,
      p_is_bot: botDetected,
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
