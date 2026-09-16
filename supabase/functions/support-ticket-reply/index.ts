import { createClient } from "npm:@supabase/supabase-js@2.110.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

function clean(value: unknown, max = 5000) {
  return String(value || "").replace(/\0/g, "").trim().slice(0, max);
}

async function currentUser(req: Request) {
  const header = req.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) return null;
  const { data, error } = await supabase.auth.getUser(header.slice(7));
  return error ? null : data.user;
}

async function telegramSend(chatId: string, text: string) {
  if (!TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_NOT_CONFIGURED");
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  const parsed = await response.json().catch(() => ({}));
  if (!response.ok || parsed?.ok !== true) {
    throw new Error(`TELEGRAM_SEND_FAILED_${Number(parsed?.error_code || response.status || 500)}`);
  }
  return parsed?.result;
}

async function logDelivery(input: Record<string, unknown>) {
  try {
    await supabase.from("support_channel_delivery_logs").insert(input);
  } catch {
    console.error("[support-ticket-reply] delivery log insert failed");
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  const user = await currentUser(req);
  if (!user) return json({ success: false, error: "Authentication required" }, 401);

  const { data: supportStaff, error: staffError } = await supabase.rpc("is_support_staff", { p_user_id: user.id });
  if (staffError || supportStaff !== true) return json({ success: false, error: "Support staff access required" }, 403);

  let body: { ticket_id?: string; message?: string; is_internal?: boolean } = {};
  try { body = await req.json(); } catch { return json({ success: false, error: "Invalid request body" }, 400); }

  const ticketId = clean(body.ticket_id, 80);
  const message = clean(body.message, 5000);
  const isInternal = body.is_internal === true;
  if (!ticketId || !message) return json({ success: false, error: "Ticket and message are required" }, 400);

  const { data: ticket, error: ticketError } = await supabase
    .from("support_tickets")
    .select("id,user_id,ticket_number,status,channel")
    .eq("id", ticketId)
    .maybeSingle();
  if (ticketError || !ticket) return json({ success: false, error: "Support ticket not found" }, 404);
  if (ticket.status === "closed") return json({ success: false, error: "Closed tickets must be reopened before replying" }, 409);

  const { data: reply, error: replyError } = await supabase
    .from("ticket_replies")
    .insert({
      ticket_id: ticket.id,
      author_id: user.id,
      author_role: "admin",
      message,
      channel: ticket.channel === "telegram" ? "telegram" : "web",
      is_internal: isInternal,
      metadata: { source: "support-ticket-reply", delivery_status: isInternal ? "internal" : "pending" },
    })
    .select("*")
    .single();
  if (replyError || !reply) return json({ success: false, error: "Could not save support reply" }, 500);

  let delivery: Record<string, unknown> = { status: isInternal ? "internal" : "not_required" };

  if (ticket.channel === "telegram" && !isInternal) {
    const { data: identity } = await supabase
      .from("support_channel_identities")
      .select("external_chat_id,external_user_id,status")
      .eq("user_id", ticket.user_id)
      .eq("channel", "telegram")
      .eq("status", "active")
      .maybeSingle();

    const chatId = clean(identity?.external_chat_id || identity?.external_user_id, 80);
    if (!chatId) {
      delivery = { status: "skipped", error: "TELEGRAM_IDENTITY_NOT_LINKED" };
      await supabase.from("ticket_replies").update({
        metadata: { source: "support-ticket-reply", delivery_status: "skipped", delivery_error: "TELEGRAM_IDENTITY_NOT_LINKED" },
      }).eq("id", reply.id);
      await logDelivery({
        ticket_id: ticket.id,
        reply_id: reply.id,
        user_id: ticket.user_id,
        channel: "telegram",
        direction: "outbound",
        status: "skipped",
        provider: "telegram_bot_api",
        error_code: "TELEGRAM_IDENTITY_NOT_LINKED",
      });
    } else {
      try {
        const result = await telegramSend(chatId, `DRIGHT Support${ticket.ticket_number ? ` · ${ticket.ticket_number}` : ""}\n\n${message}`);
        const externalMessageId = String(result?.message_id || "") || null;
        delivery = { status: "sent", external_message_id: externalMessageId };
        await supabase.from("ticket_replies").update({
          metadata: { source: "support-ticket-reply", delivery_status: "sent", external_message_id: externalMessageId },
        }).eq("id", reply.id);
        await logDelivery({
          ticket_id: ticket.id,
          reply_id: reply.id,
          user_id: ticket.user_id,
          channel: "telegram",
          direction: "outbound",
          status: "sent",
          external_chat_id: chatId,
          external_message_id: externalMessageId,
          provider: "telegram_bot_api",
          delivered_at: new Date().toISOString(),
        });
      } catch (error) {
        const code = error instanceof Error ? error.message : "TELEGRAM_SEND_FAILED";
        delivery = { status: "failed", error: code };
        await supabase.from("ticket_replies").update({
          metadata: { source: "support-ticket-reply", delivery_status: "failed", delivery_error: code },
        }).eq("id", reply.id);
        await logDelivery({
          ticket_id: ticket.id,
          reply_id: reply.id,
          user_id: ticket.user_id,
          channel: "telegram",
          direction: "outbound",
          status: "failed",
          external_chat_id: chatId,
          provider: "telegram_bot_api",
          error_code: code,
        });
      }
    }
  }

  return json({ success: true, reply: { ...reply, metadata: { ...(reply.metadata || {}), delivery_status: delivery.status } }, delivery });
});
