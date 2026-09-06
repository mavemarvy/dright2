import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const db = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

function normalizeLinks(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("Social profile links are required");
  const links = [...new Set(value.map(v => String(v).trim()).filter(Boolean))];
  if (!links.length) throw new Error("Please provide at least one social media link");
  if (links.length > 10) throw new Error("You can submit up to 10 profile links");
  for (const link of links) {
    let url: URL;
    try { url = new URL(link); } catch { throw new Error(`Invalid profile URL: ${link}`); }
    if (url.protocol !== "https:") throw new Error("Profile links must use HTTPS");
  }
  return links;
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return json(null);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const client = db();
    const { data: { user }, error: authError } = await client.auth.getUser(authHeader.slice(7));
    if (authError || !user) return json({ error: "Unauthorized" }, 401);
    const body = await req.json().catch(() => ({}));
    if (body.action !== "submit_marketer_application") return json({ error: "Unknown action" }, 400);
    const links = normalizeLinks(body.social_links);
    const { data: profile, error: profileError } = await client.from("users").select("id,marketer_status,advertiser_status").eq("id", user.id).single();
    if (profileError || !profile) return json({ error: "Profile not found" }, 404);
    if (String(profile.advertiser_status || "").toLowerCase() === "approved") return json({ error: "Your account is already approved as an Advertiser" }, 409);
    if (String(profile.marketer_status || "").toLowerCase() === "pending") return json({ error: "Your Marketer application is already pending review" }, 409);
    if (String(profile.marketer_status || "").toLowerCase() === "approved") return json({ error: "Your Marketer application is already approved" }, 409);
    const { data: updated, error: updateError } = await client.from("users").update({ social_media_links: links, marketer_status: "pending" }).eq("id", user.id).select("id,marketer_status,social_media_links").single();
    if (updateError) throw updateError;
    return json({ success: true, application: updated });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Failed to submit application" }, 400);
  }
});
