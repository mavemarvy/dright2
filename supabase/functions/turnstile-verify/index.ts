import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version, x-requested-with",
};

function getSupabaseClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("Server misconfiguration: missing Supabase credentials");
  return createClient(url, serviceKey);
}

function getTurnstileSecret(): string | null {
  return Deno.env.get("TURNSTILE_SECRET") || Deno.env.get("TURNSTILE_SECRET_KEY") || null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const body = await req.json();
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    const action = typeof body?.action === "string" ? body.action : "";
    const userId = typeof body?.userId === "string" ? body.userId : null;
    const ipAddress = typeof body?.ipAddress === "string" ? body.ipAddress : null;

    if (!token) return new Response(JSON.stringify({ success: false, error: "Missing Turnstile token" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!action) return new Response(JSON.stringify({ success: false, error: "Missing action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const secret = getTurnstileSecret();
    if (!secret) return new Response(JSON.stringify({ success: false, error: "Turnstile server secret is not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = getSupabaseClient();
    const { error: rateError } = await supabase
      .from("turnstile_verifications")
      .select("id, created_at")
      .eq("user_id", userId)
      .eq("action", action)
      .order("created_at", { ascending: false })
      .limit(20);
    if (rateError) console.warn("Turnstile rate lookup warning:", rateError.message);

    const formData = new URLSearchParams();
    formData.set("secret", secret);
    formData.set("response", token);
    if (ipAddress) formData.set("remoteip", ipAddress);

    const cloudflareResponse = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });
    const result = await cloudflareResponse.json();

    await supabase.from("turnstile_verifications").insert({
      user_id: userId,
      action,
      success: !!result?.success,
      error_codes: Array.isArray(result?.["error-codes"]) ? result["error-codes"] : null,
      created_at: new Date().toISOString(),
    }).then(({ error }) => { if (error) console.warn("Turnstile log warning:", error.message); });

    if (!result?.success) return new Response(JSON.stringify({ success: false, error: "Turnstile verification failed", errorCodes: result?.["error-codes"] || [] }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ success: true, action }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("turnstile-verify error:", error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});