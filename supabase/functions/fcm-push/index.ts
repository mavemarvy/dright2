import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function getSupabaseClient(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (authHeader) {
    return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  }
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
}

interface PushMessage {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  data?: Record<string, unknown>;
}

async function sendPushNotification(token: string, message: PushMessage): Promise<{ success: boolean; error?: string }> {
  const serverKey = Deno.env.get("FIREBASE_API_KEY");
  if (!serverKey) return { success: false, error: "Missing FIREBASE_API_KEY" };

  try {
    const res = await fetch("https://fcm.googleapis.com/fcm/send", {
      method: "POST",
      headers: { "Authorization": `key=${serverKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        to: token,
        notification: {
          title: message.title,
          body: message.body,
          icon: message.icon || "/favicon.svg",
          click_action: message.url || "/",
        },
        data: message.data || {},
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      return { success: false, error: `FCM error (${res.status}): ${err.slice(0, 200)}` };
    }

    const data = await res.json();
    if (data.failure > 0 && data.results?.[0]?.error) {
      return { success: false, error: data.results[0].error };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = getSupabaseClient(req);
    const body = await req.json();
    const action = body.action || "send";

    if (action === "register-token") {
      const { token, userId, deviceType = "web", deviceName } = body;
      if (!token || !userId) throw new Error("Missing token or userId");

      const { error } = await supabase
        .from("fcm_tokens")
        .upsert({ user_id: userId, token, device_type: deviceType, device_name: deviceName, is_active: true, last_used_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "token" });

      if (error) throw new Error(`DB error: ${error.message}`);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "unregister-token") {
      const { token } = body;
      if (!token) throw new Error("Missing token");

      const { error } = await supabase.from("fcm_tokens").update({ is_active: false, updated_at: new Date().toISOString() }).eq("token", token);
      if (error) throw new Error(`DB error: ${error.message}`);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "send") {
      const { userId, title, body: msgBody, url, data } = body;
      if (!userId || !title) throw new Error("Missing userId or title");

      const { data: tokens } = await supabase.from("fcm_tokens").select("token").eq("user_id", userId).eq("is_active", true);
      if (!tokens || tokens.length === 0) {
        return new Response(JSON.stringify({ success: true, sent: 0, message: "No active tokens" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const results = await Promise.all(tokens.map((t: { token: string }) => sendPushNotification(t.token, { title, body: msgBody, url, data })));
      const succeeded = results.filter((r) => r.success).length;
      const failed = results.length - succeeded;

      if (failed > 0 && succeeded === 0) {
        return new Response(JSON.stringify({ success: false, error: "All notifications failed", details: results }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ success: true, sent: succeeded, failed }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "send-batch") {
      const { userIds, title, body: msgBody, url, data } = body;
      if (!userIds || !Array.isArray(userIds) || !title) throw new Error("Missing userIds or title");

      const { data: tokens } = await supabase.from("fcm_tokens").select("token, user_id").in("user_id", userIds).eq("is_active", true);
      if (!tokens || tokens.length === 0) {
        return new Response(JSON.stringify({ success: true, sent: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const results = await Promise.all(tokens.map((t: { token: string }) => sendPushNotification(t.token, { title, body: msgBody, url, data })));
      const succeeded = results.filter((r) => r.success).length;
      return new Response(JSON.stringify({ success: true, sent: succeeded, failed: results.length - succeeded }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
