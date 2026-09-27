import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";

const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const resend = new Resend(resendApiKey);

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function replyHtml(body: string, logoUrl: string, websiteUrl: string): string {
  return `<!doctype html>
<html><body style="margin:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#18202b">
  <div style="max-width:620px;margin:0 auto;padding:28px 14px">
    <div style="background:#fff;border:1px solid #e6eaf0;border-radius:22px;overflow:hidden">
      <div style="padding:22px 24px;background:#0b0d11">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td><img src="${escapeHtml(logoUrl)}" width="46" height="46" alt="DRIGHT" style="display:block;border-radius:12px;object-fit:contain"></td>
          <td style="padding-left:12px;color:#fff"><div style="font-size:18px;font-weight:800;letter-spacing:.08em">DRIGHT</div><div style="font-size:11px;color:#aab3c2;margin-top:3px">PARTNERSHIPS</div></td>
        </tr></table>
      </div>
      <div style="padding:30px 26px">
        <div style="font-size:15px;line-height:1.72;color:#3e4a5d">${escapeHtml(body).replace(/\n/g,"<br>")}</div>
        <div style="margin-top:24px;padding-top:18px;border-top:1px solid #eef1f5;font-size:12px;color:#7b8494">
          Reply directly to this email to continue the conversation.<br>
          <a href="${escapeHtml(websiteUrl)}" style="color:#2563eb;text-decoration:none">www.dright.store</a>
        </div>
      </div>
    </div>
  </div>
</body></html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await caller.auth.getUser();
    if (authError || !authData.user?.id) {
      return new Response(JSON.stringify({ error: "Authentication required" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }

    const { data: profile } = await service
      .from("users")
      .select("id,is_admin,admin_status")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (!profile?.is_admin || profile.admin_status !== "active") {
      return new Response(JSON.stringify({ error: "Active admin access required" }), { status: 403, headers: { "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const conversationId = String(body?.conversation_id || "");
    const message = String(body?.message || "").trim();
    if (!conversationId || !message) {
      return new Response(JSON.stringify({ error: "conversation_id and message are required" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const { data: conversation, error: conversationError } = await service
      .from("outreach_conversations")
      .select("*")
      .eq("id", conversationId)
      .single();
    if (conversationError || !conversation) throw conversationError || new Error("Conversation not found");
    if (conversation.status === "unsubscribed") {
      return new Response(JSON.stringify({ error: "This contact is unsubscribed. Manual marketing replies are blocked." }), { status: 409, headers: { "Content-Type": "application/json" } });
    }

    const { data: settings } = await service
      .from("outreach_settings")
      .select("*")
      .eq("singleton", true)
      .single();

    const { data: lastInbound } = await service
      .from("outreach_messages")
      .select("internet_message_id,subject")
      .eq("conversation_id", conversationId)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const subjectBase = String(body?.subject || lastInbound?.subject || conversation.subject || "DRIGHT Partnership");
    const subject = /^re:/i.test(subjectBase) ? subjectBase : `Re: ${subjectBase}`;
    const replyHtmlBody = replyHtml(message, settings.logo_url, settings.website_url);

    const sendResult = await resend.emails.send({
      from: `${settings.reply_from_name} <${settings.reply_from_email}>`,
      to: [conversation.prospect_email],
      replyTo: settings.reply_to_email,
      subject,
      text: message,
      html: replyHtmlBody,
      headers: lastInbound?.internet_message_id ? {
        "In-Reply-To": lastInbound.internet_message_id,
        "References": lastInbound.internet_message_id,
      } : undefined,
    });

    if (sendResult.error) throw new Error(JSON.stringify(sendResult.error));

    const sentAt = new Date().toISOString();
    await service.from("outreach_messages").insert({
      conversation_id: conversationId,
      direction: "outbound",
      provider: "resend",
      provider_message_id: sendResult.data?.id || null,
      in_reply_to: lastInbound?.internet_message_id || null,
      from_email: settings.reply_from_email,
      to_email: conversation.prospect_email,
      subject,
      text_body: message,
      html_body: replyHtmlBody,
      auto_generated: false,
      delivery_status: "sent",
      metadata: { admin_id: authData.user.id },
      created_at: sentAt,
    });

    await service.from("outreach_conversations").update({
      status: conversation.status === "new" ? "follow_up" : conversation.status,
      last_outbound_at: sentAt,
      last_message_at: sentAt,
      updated_at: sentAt,
    }).eq("id", conversationId);

    return new Response(JSON.stringify({ success: true, message_id: sendResult.data?.id || null }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Reply failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});