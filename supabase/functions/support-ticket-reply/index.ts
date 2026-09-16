import { createClient } from "npm:@supabase/supabase-js@2.110.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const SUPPORT_BUCKET = "support-attachments";
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

function clean(value: unknown, max = 5000) {
  return String(value || "")
    .replace(/\0/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim()
    .slice(0, max);
}

async function currentUser(req: Request) {
  const header = req.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) return null;
  const { data, error } = await supabase.auth.getUser(header.slice(7));
  return error ? null : data.user;
}

async function telegramJson(method: string, payload: Record<string, unknown>) {
  if (!TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_NOT_CONFIGURED");
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const parsed = await response.json().catch(() => ({}));
  if (!response.ok || parsed?.ok !== true) {
    throw new Error(`TELEGRAM_SEND_FAILED_${Number(parsed?.error_code || response.status || 500)}`);
  }
  return parsed?.result;
}

async function telegramSendText(chatId: string, text: string) {
  return telegramJson("sendMessage", { chat_id: chatId, text, disable_web_page_preview: true });
}

function telegramAttachmentMethod(mediaType: string) {
  if (mediaType === "image") return { method: "sendPhoto", field: "photo" };
  if (mediaType === "video") return { method: "sendVideo", field: "video" };
  if (mediaType === "audio") return { method: "sendAudio", field: "audio" };
  return { method: "sendDocument", field: "document" };
}

async function telegramSendAttachment(chatId: string, attachment: any, caption?: string) {
  if (!TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_NOT_CONFIGURED");
  if (attachment.storage_bucket !== SUPPORT_BUCKET) throw new Error("ATTACHMENT_BUCKET_INVALID");
  if (Number(attachment.file_size || 0) > MAX_ATTACHMENT_BYTES) throw new Error("ATTACHMENT_TOO_LARGE");

  const { data: blob, error } = await supabase.storage.from(attachment.storage_bucket).download(attachment.storage_path);
  if (error || !blob) throw new Error("ATTACHMENT_DOWNLOAD_FAILED");
  if (blob.size > MAX_ATTACHMENT_BYTES) throw new Error("ATTACHMENT_TOO_LARGE");

  const { method, field } = telegramAttachmentMethod(String(attachment.media_type || "document"));
  const form = new FormData();
  form.append("chat_id", chatId);
  if (caption) form.append("caption", clean(caption, 900));
  form.append(field, new File([blob], clean(attachment.file_name, 180) || "attachment", { type: clean(attachment.mime_type, 160) || "application/octet-stream" }));

  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    body: form,
  });
  const parsed = await response.json().catch(() => ({}));
  if (!response.ok || parsed?.ok !== true) {
    throw new Error(`TELEGRAM_ATTACHMENT_FAILED_${Number(parsed?.error_code || response.status || 500)}`);
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

  let body: { ticket_id?: string; message?: string; is_internal?: boolean; attachment_ids?: string[] } = {};
  try { body = await req.json(); } catch { return json({ success: false, error: "Invalid request body" }, 400); }

  const ticketId = clean(body.ticket_id, 80);
  const message = clean(body.message, 5000);
  const isInternal = body.is_internal === true;
  const attachmentIds = Array.from(new Set((Array.isArray(body.attachment_ids) ? body.attachment_ids : []).map(value => clean(value, 80)).filter(Boolean))).slice(0, 10);
  if (!ticketId || (!message && attachmentIds.length === 0)) return json({ success: false, error: "Ticket and a message or attachment are required" }, 400);

  const { data: ticket, error: ticketError } = await supabase
    .from("support_tickets")
    .select("id,user_id,ticket_number,status,channel")
    .eq("id", ticketId)
    .maybeSingle();
  if (ticketError || !ticket) return json({ success: false, error: "Support ticket not found" }, 404);
  if (ticket.status === "closed") return json({ success: false, error: "Closed tickets must be reopened before replying" }, 409);

  let attachments: any[] = [];
  if (attachmentIds.length) {
    const { data, error } = await supabase.from("support_attachments")
      .select("id,ticket_id,user_id,uploaded_by,uploaded_by_role,direction,media_type,file_name,mime_type,file_size,storage_bucket,storage_path,status")
      .eq("ticket_id", ticket.id)
      .eq("user_id", ticket.user_id)
      .eq("direction", "outbound")
      .in("id", attachmentIds);
    if (error) return json({ success: false, error: "Could not load support attachments" }, 500);
    attachments = data || [];
    if (attachments.length !== attachmentIds.length) return json({ success: false, error: "One or more attachments are invalid for this ticket" }, 400);
  }

  const storedMessage = message || (attachments.length === 1 ? `Attachment: ${attachments[0].file_name}` : `${attachments.length} attachments`);
  const { data: reply, error: replyError } = await supabase.from("ticket_replies").insert({
    ticket_id: ticket.id,
    author_id: user.id,
    author_role: "admin",
    message: storedMessage,
    channel: ticket.channel === "telegram" ? "telegram" : "web",
    is_internal: isInternal,
    metadata: {
      source: "support-ticket-reply",
      delivery_status: isInternal ? "internal" : "pending",
      attachment_ids: attachmentIds,
      attachment_count: attachments.length,
    },
  }).select("*").single();
  if (replyError || !reply) return json({ success: false, error: "Could not save support reply" }, 500);

  if (attachments.length) {
    const { error: attachmentUpdateError } = await supabase.from("support_attachments")
      .update({ reply_id: reply.id })
      .in("id", attachmentIds)
      .eq("ticket_id", ticket.id);
    if (attachmentUpdateError) {
      return json({ success: false, error: "Reply was saved but its attachments could not be linked", reply }, 500);
    }
  }

  if (isInternal) {
    return json({ success: true, reply, delivery: { status: "internal" }, attachments });
  }

  if (ticket.channel !== "telegram") {
    return json({ success: true, reply, delivery: { status: "not_required" }, attachments });
  }

  const { data: identity } = await supabase.from("support_channel_identities")
    .select("external_chat_id,external_user_id,status")
    .eq("user_id", ticket.user_id)
    .eq("channel", "telegram")
    .eq("status", "active")
    .maybeSingle();

  const chatId = clean(identity?.external_chat_id || identity?.external_user_id, 80);
  if (!chatId) {
    const metadata = { source: "support-ticket-reply", delivery_status: "skipped", delivery_error: "TELEGRAM_IDENTITY_NOT_LINKED", attachment_ids: attachmentIds, attachment_count: attachments.length };
    await supabase.from("ticket_replies").update({ metadata }).eq("id", reply.id);
    await logDelivery({ ticket_id: ticket.id, reply_id: reply.id, user_id: ticket.user_id, channel: "telegram", direction: "outbound", status: "skipped", provider: "telegram_bot_api", error_code: "TELEGRAM_IDENTITY_NOT_LINKED" });
    return json({ success: true, reply: { ...reply, metadata }, delivery: { status: "skipped", error: "TELEGRAM_IDENTITY_NOT_LINKED" }, attachments });
  }

  const deliveryItems: Array<Record<string, unknown>> = [];
  let textFailed = false;
  if (message) {
    try {
      const result = await telegramSendText(chatId, `DRIGHT Support${ticket.ticket_number ? ` · ${ticket.ticket_number}` : ""}\n\n${message}`);
      const externalMessageId = String(result?.message_id || "") || null;
      deliveryItems.push({ type: "text", status: "sent", external_message_id: externalMessageId });
      await logDelivery({ ticket_id: ticket.id, reply_id: reply.id, user_id: ticket.user_id, channel: "telegram", direction: "outbound", status: "sent", external_chat_id: chatId, external_message_id: externalMessageId, provider: "telegram_bot_api", delivered_at: new Date().toISOString(), metadata: { payload_type: "text" } });
    } catch (error) {
      textFailed = true;
      const code = error instanceof Error ? error.message : "TELEGRAM_SEND_FAILED";
      deliveryItems.push({ type: "text", status: "failed", error: code });
      await logDelivery({ ticket_id: ticket.id, reply_id: reply.id, user_id: ticket.user_id, channel: "telegram", direction: "outbound", status: "failed", external_chat_id: chatId, provider: "telegram_bot_api", error_code: code, metadata: { payload_type: "text" } });
    }
  }

  let attachmentFailures = 0;
  for (const attachment of attachments) {
    try {
      const result = await telegramSendAttachment(chatId, attachment, `DRIGHT Support${ticket.ticket_number ? ` · ${ticket.ticket_number}` : ""}`);
      const externalMessageId = String(result?.message_id || "") || null;
      await supabase.from("support_attachments").update({ status: "sent", delivered_at: new Date().toISOString(), external_message_id: externalMessageId, error_code: null }).eq("id", attachment.id);
      deliveryItems.push({ type: "attachment", attachment_id: attachment.id, status: "sent", external_message_id: externalMessageId });
      await logDelivery({ ticket_id: ticket.id, reply_id: reply.id, user_id: ticket.user_id, channel: "telegram", direction: "outbound", status: "sent", external_chat_id: chatId, external_message_id: externalMessageId, provider: "telegram_bot_api", delivered_at: new Date().toISOString(), metadata: { payload_type: "attachment", attachment_id: attachment.id, file_name: attachment.file_name } });
    } catch (error) {
      attachmentFailures += 1;
      const code = error instanceof Error ? error.message : "TELEGRAM_ATTACHMENT_FAILED";
      await supabase.from("support_attachments").update({ status: "failed", error_code: code }).eq("id", attachment.id);
      deliveryItems.push({ type: "attachment", attachment_id: attachment.id, status: "failed", error: code });
      await logDelivery({ ticket_id: ticket.id, reply_id: reply.id, user_id: ticket.user_id, channel: "telegram", direction: "outbound", status: "failed", external_chat_id: chatId, provider: "telegram_bot_api", error_code: code, metadata: { payload_type: "attachment", attachment_id: attachment.id, file_name: attachment.file_name } });
    }
  }

  const totalFailures = (textFailed ? 1 : 0) + attachmentFailures;
  const totalDeliveries = (message ? 1 : 0) + attachments.length;
  const deliveryStatus = totalFailures === 0 ? "sent" : totalFailures === totalDeliveries ? "failed" : "partial";
  const metadata = {
    source: "support-ticket-reply",
    delivery_status: deliveryStatus,
    attachment_ids: attachmentIds,
    attachment_count: attachments.length,
    delivery_items: deliveryItems,
  };
  await supabase.from("ticket_replies").update({ metadata }).eq("id", reply.id);

  return json({ success: true, reply: { ...reply, metadata }, delivery: { status: deliveryStatus, items: deliveryItems }, attachments });
});