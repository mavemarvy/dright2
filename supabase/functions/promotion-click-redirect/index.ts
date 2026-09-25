import { createClient } from "npm:@supabase/supabase-js@2.110.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const FALLBACK = "https://dright.store";

function safeDestination(raw: unknown) {
  const value = String(raw ?? "").trim();
  if (!value) return FALLBACK;
  if (value.startsWith("/")) return `https://dright.store${value}`;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return FALLBACK;
    if (!["dright.store", "www.dright.store"].includes(url.hostname.toLowerCase())) return FALLBACK;
    return url.toString();
  } catch {
    return FALLBACK;
  }
}

async function hash(value: string) {
  if (!value) return "";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${SERVICE_ROLE_KEY}:${value}`));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isAutomated(userAgent: string) {
  return /(bot|crawler|spider|preview|facebookexternalhit|slackbot|discordbot|whatsapp|telegrambot|headless|curl|wget)/i.test(userAgent);
}

Deno.serve(async (req: Request) => {
  if (!["GET", "HEAD"].includes(req.method)) {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }

  const url = new URL(req.url);
  const token = (url.searchParams.get("token") || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) {
    return Response.redirect(FALLBACK, 302);
  }

  const userAgent = req.headers.get("user-agent") || "";
  const ip =
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();

  const { data, error } = await db.rpc("record_promotion_tracking_click", {
    p_token: token,
    p_ip_hash: await hash(ip),
    p_user_agent_hash: await hash(userAgent),
    p_record: req.method === "GET" && !isAutomated(userAgent),
  });

  if (error) {
    console.error("[promotion-click-redirect]", error.message);
    return Response.redirect(FALLBACK, 302);
  }

  return Response.redirect(safeDestination(data?.destination_url), 302);
});
