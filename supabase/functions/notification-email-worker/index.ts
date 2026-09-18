import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";
const resendFrom = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@dright.store";
const appUrl = (Deno.env.get("APP_URL") || "https://dright.store").replace(/\/$/, "");

const db = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type OutboxRow = {
  id: string;
  notification_id: string | null;
  user_id: string;
  recipient_email: string;
  notification_type: string;
  category: string;
  priority: string;
  subject: string;
  message: string;
  metadata: Record<string, unknown> | null;
  status: string;
  attempts: number;
  next_attempt_at: string;
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function categoryLabel(category: string): string {
  const labels: Record<string, string> = {
    security: "Security",
    wallet: "Wallet & Payments",
    orders: "Orders & Sales",
    affiliate: "Affiliate",
    referrals: "Referrals",
    followers: "Social",
    reviews: "Social",
    messages: "Messages",
    promotions: "Marketing & Promotions",
    marketplace: "Marketplace",
    store: "Store",
    jobs: "Jobs",
    services: "Services",
    admin: "Account",
    system: "DRIGHT",
  };
  return labels[category] || "DRIGHT";
}

function buildEmail(row: OutboxRow) {
  const meta = row.metadata || {};
  const rawAction = typeof meta.action_url === "string" ? meta.action_url : "";
  const actionUrl = rawAction
    ? (rawAction.startsWith("http") ? rawAction : `${appUrl}${rawAction.startsWith("/") ? "" : "/"}${rawAction}`)
    : `${appUrl}/notifications`;

  const critical = row.priority === "critical" || row.category === "security";
  const transactional = ["wallet", "orders"].includes(row.category) ||
    ["affiliate_commission", "referral_commission", "payout"].includes(row.notification_type);

  const heading = escapeHtml(row.subject);
  const body = escapeHtml(row.message);
  const label = escapeHtml(categoryLabel(row.category));
  const manage = `${appUrl}/settings?tab=notifications`;

  const footer = critical || transactional
    ? `<p style="margin:22px 0 0;color:#7c8595;font-size:12px">This is an important transactional or security message from DRIGHT.</p>`
    : `<p style="margin:22px 0 0;color:#7c8595;font-size:12px">You can change email notification preferences in <a href="${manage}" style="color:#2563eb">DRIGHT Settings</a>.</p>`;

  return {
    subject: `DRIGHT — ${row.subject}`,
    html: `<!doctype html>
<html>
  <body style="margin:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#18202b">
    <div style="max-width:620px;margin:0 auto;padding:28px 16px">
      <div style="background:#ffffff;border:1px solid #e7ebef;border-radius:18px;overflow:hidden">
        <div style="padding:18px 24px;background:#0f172a;color:#ffffff">
          <div style="font-size:20px;font-weight:800;letter-spacing:.3px">DRIGHT</div>
          <div style="margin-top:4px;font-size:12px;color:#cbd5e1">${label}</div>
        </div>
        <div style="padding:28px 24px">
          <h1 style="font-size:22px;line-height:1.3;margin:0 0 12px">${heading}</h1>
          <p style="font-size:15px;line-height:1.65;margin:0;color:#465264">${body}</p>
          <a href="${escapeHtml(actionUrl)}" style="display:inline-block;margin-top:22px;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:10px">Open DRIGHT</a>
          ${footer}
        </div>
      </div>
      <p style="text-align:center;color:#9aa3af;font-size:11px;margin:16px 0 0">DRIGHT notification delivery</p>
    </div>
  </body>
</html>`,
  };
}

async function markRetry(row: OutboxRow, error: string) {
  const attempts = (row.attempts || 0) + 1;
  const terminal = attempts >= 5;
  const delayMinutes = Math.min(60, Math.max(2, 2 ** attempts));
  const next = new Date(Date.now() + delayMinutes * 60_000).toISOString();

  await db.from("notification_email_outbox").update({
    status: terminal ? "failed" : "retry",
    attempts,
    next_attempt_at: next,
    last_error: error.slice(0, 1000),
    updated_at: new Date().toISOString(),
  }).eq("id", row.id);

  if (row.notification_id) {
    await db.from("notification_delivery_logs").update({
      status: terminal ? "expired" : "queued",
      metadata: {
        outbox_id: row.id,
        provider: "resend",
        attempts,
        last_error: error.slice(0, 500),
      },
    }).eq("notification_id", row.notification_id).eq("channel", "email");
  }
}

async function processOne(id: string) {
  const now = new Date().toISOString();

  const { data: claimed, error: claimError } = await db
    .from("notification_email_outbox")
    .update({ status: "sending", updated_at: now })
    .eq("id", id)
    .in("status", ["pending", "retry"])
    .lte("next_attempt_at", now)
    .select("*")
    .maybeSingle();

  if (claimError) return { id, success: false, error: claimError.message };
  if (!claimed) return { id, success: true, skipped: true };

  const row = claimed as OutboxRow;

  if (!resendApiKey) {
    await markRetry(row, "RESEND_API_KEY is not configured");
    return { id, success: false, error: "Resend is not configured" };
  }

  // Rate-limit per recipient. Critical/transactional email has a larger ceiling,
  // but cannot be used as an unlimited email relay.
  const oneHourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
  const { count: sentLastHour } = await db
    .from("notification_email_outbox")
    .select("id", { count: "exact", head: true })
    .eq("user_id", row.user_id)
    .eq("status", "sent")
    .gte("sent_at", oneHourAgo);

  const important = row.priority === "critical" ||
    ["security", "wallet", "orders"].includes(row.category);
  const hourlyLimit = important ? 50 : 20;

  if ((sentLastHour || 0) >= hourlyLimit) {
    await db.from("notification_email_outbox").update({
      status: "retry",
      next_attempt_at: new Date(Date.now() + 20 * 60_000).toISOString(),
      last_error: "Per-user email rate limit reached",
      updated_at: new Date().toISOString(),
    }).eq("id", row.id);
    return { id, success: true, rateLimited: true };
  }

  const email = buildEmail(row);
  const from = resendFrom.includes("<") ? resendFrom : `DRIGHT <${resendFrom}>`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [row.recipient_email],
        subject: email.subject,
        html: email.html,
      }),
    });

    const responseText = await response.text();
    let responseJson: Record<string, unknown> = {};
    try { responseJson = JSON.parse(responseText); } catch { /* text error */ }

    if (!response.ok) {
      await markRetry(row, `Resend ${response.status}: ${responseText.slice(0, 700)}`);
      return { id, success: false, status: response.status };
    }

    const messageId = typeof responseJson.id === "string" ? responseJson.id : null;
    const sentAt = new Date().toISOString();

    await db.from("notification_email_outbox").update({
      status: "sent",
      provider_message_id: messageId,
      attempts: (row.attempts || 0) + 1,
      last_error: null,
      sent_at: sentAt,
      updated_at: sentAt,
    }).eq("id", row.id);

    if (row.notification_id) {
      await db.from("notification_delivery_logs").update({
        status: "delivered",
        delivered_at: sentAt,
        metadata: {
          outbox_id: row.id,
          provider: "resend",
          provider_message_id: messageId,
        },
      }).eq("notification_id", row.notification_id).eq("channel", "email");
    }

    await db.from("email_logs").insert({
      user_id: row.user_id,
      recipient_email: row.recipient_email,
      template_type: `notification:${row.notification_type}`,
      subject: email.subject,
      status: "sent",
      provider: "resend",
      message_id: messageId,
      metadata: {
        notification_id: row.notification_id,
        outbox_id: row.id,
        category: row.category,
        priority: row.priority,
      },
    });

    return { id, success: true, messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown email error";
    await markRetry(row, message);
    return { id, success: false, error: message };
  }
}

async function processBatch() {
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("notification_email_outbox")
    .select("id")
    .in("status", ["pending", "retry"])
    .lte("next_attempt_at", now)
    .lt("attempts", 5)
    .order("created_at", { ascending: true })
    .limit(30);

  if (error) throw error;

  const results = [];
  for (const row of data || []) {
    results.push(await processOne(row.id));
  }
  return results;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    let results;

    if (typeof body.outbox_id === "string" && body.outbox_id.length >= 30) {
      results = [await processOne(body.outbox_id)];
    } else if (body.mode === "batch") {
      results = await processBatch();
    } else {
      return new Response(JSON.stringify({ success: false, error: "outbox_id or batch mode required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Worker error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
