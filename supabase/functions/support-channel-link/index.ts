import { createClient } from "npm:@supabase/supabase-js@2.110.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

async function authenticatedUser(req: Request) {
  const header = req.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) return null;
  const { data, error } = await supabase.auth.getUser(header.slice(7));
  return error ? null : data.user;
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function createLinkCode(length = 8) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  const user = await authenticatedUser(req);
  if (!user) return json({ success: false, error: "Authentication required" }, 401);

  let body: { action?: string; channel?: string } = {};
  try { body = await req.json(); } catch { return json({ success: false, error: "Invalid request body" }, 400); }

  const action = String(body.action || "create");
  const channel = String(body.channel || "telegram").toLowerCase();
  if (!["telegram", "whatsapp", "email", "sms"].includes(channel)) return json({ success: false, error: "Unsupported support channel" }, 400);

  if (action === "status") {
    const { data, error } = await supabase
      .from("support_channel_identities")
      .select("id,channel,external_username,status,linked_at,verified_at,last_seen_at")
      .eq("user_id", user.id)
      .eq("channel", channel)
      .maybeSingle();
    if (error) return json({ success: false, error: "Could not read channel status" }, 500);
    return json({ success: true, connected: data?.status === "active", identity: data || null });
  }

  if (action === "revoke") {
    const { error } = await supabase
      .from("support_channel_identities")
      .update({ status: "revoked", updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("channel", channel);
    if (error) return json({ success: false, error: "Could not revoke channel" }, 500);
    return json({ success: true, connected: false });
  }

  if (action !== "create") return json({ success: false, error: "Unsupported action" }, 400);

  await supabase
    .from("support_channel_link_codes")
    .delete()
    .eq("user_id", user.id)
    .eq("channel", channel)
    .is("used_at", null);

  let code = "";
  let inserted = false;
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  for (let attempt = 0; attempt < 4 && !inserted; attempt++) {
    code = createLinkCode();
    const hash = await sha256Hex(`${channel}:${code}`);
    const { error } = await supabase.from("support_channel_link_codes").insert({
      user_id: user.id,
      channel,
      code_hash: hash,
      expires_at: expiresAt,
      metadata: { created_by: "support-channel-link" },
    });
    if (!error) inserted = true;
    else if (attempt === 3) return json({ success: false, error: "Could not create a link code" }, 500);
  }

  return json({
    success: true,
    channel,
    code,
    expires_at: expiresAt,
    expires_in_seconds: 600,
    command: `/link ${code}`,
    note: channel === "telegram"
      ? "Send this command to the official DRIGHT Telegram support bot after the bot is configured. The code expires in 10 minutes."
      : "This channel's external connector is not active yet. The code expires in 10 minutes.",
  });
});
