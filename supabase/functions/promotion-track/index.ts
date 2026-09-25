import { createClient } from "npm:@supabase/supabase-js@2.110.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const fallback = "https://dright.store";

Deno.serve(async (req: Request) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(req.url);
  const token = (url.searchParams.get("token") || "").trim();

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) {
    return Response.redirect(fallback, 302);
  }

  if (req.method === "HEAD") return new Response(null, { status: 204 });

  try {
    const { data, error } = await db.rpc("record_promotion_external_click", { p_token: token });
    if (error || !data) return Response.redirect(fallback, 302);

    const value = String(data);
    const resolved = value.startsWith("https://")
      ? value
      : value.startsWith("/")
        ? `https://dright.store${value}`
        : fallback;

    const parsed = new URL(resolved);
    if (parsed.protocol !== "https:") return Response.redirect(fallback, 302);
    return Response.redirect(parsed.toString(), 302);
  } catch {
    return Response.redirect(fallback, 302);
  }
});
