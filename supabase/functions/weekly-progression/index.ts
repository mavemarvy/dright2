import { createClient } from "npm:@supabase/supabase-js@2.110.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return json({ success: false, error: "Server configuration error" }, 500);

  // This is an operational endpoint. Normal weekly progression is executed by
  // pg_cron through run_weekly_sales_progression(); browser/user JWTs must never
  // be able to trigger progression, downgrades, contract changes, or balances.
  const auth = req.headers.get("Authorization") || "";
  if (auth !== `Bearer ${serviceKey}`) return json({ success: false, error: "Forbidden" }, 403);

  try {
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await admin.rpc("run_weekly_sales_progression");
    if (error) {
      console.error("[weekly-progression] canonical RPC failed", error.code || "RPC_ERROR");
      return json({ success: false, error: "Weekly progression failed" }, 500);
    }
    return json(data || { success: true });
  } catch (error) {
    console.error("[weekly-progression] failed", error instanceof Error ? error.message : String(error));
    return json({ success: false, error: "Weekly progression failed" }, 500);
  }
});
