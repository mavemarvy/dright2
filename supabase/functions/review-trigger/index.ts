import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const auth = req.headers.get("Authorization") || "";
  if (!url || !anonKey) return json({ error: "Server configuration error" }, 500);
  if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  try {
    // Compatibility adapter only. create-review is the single review authority:
    // it derives reviewer identity from JWT, requires completed interaction,
    // blocks self/duplicate reviews, and recalculates reputation server-side.
    const body = await req.text();
    const response = await fetch(`${url}/functions/v1/create-review`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: auth,
        apikey: anonKey,
      },
      body,
    });
    const payload = await response.text();
    return new Response(payload, {
      status: response.status,
      headers: { ...corsHeaders, "Content-Type": response.headers.get("Content-Type") || "application/json" },
    });
  } catch (error) {
    console.error("[review-trigger] adapter failed", error instanceof Error ? error.message : String(error));
    return json({ error: "Review could not be created" }, 500);
  }
});
