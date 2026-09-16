import { createClient } from "npm:@supabase/supabase-js@2.110.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") || "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

function clean(value: unknown, max = 5000) {
  return String(value || "")
    .replace(/\0/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim()
    .slice(0, max);
}

function stripHtml(value: unknown) {
  return clean(value, 12000)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function webhookSecret() {
  return sha256Hex(`dright-telegram-webhook-v1:${TELEGRAM_BOT_TOKEN}`);
}

async function telegram(method: string, payload: Record<string, unknown> = {}) {
  if (!TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_NOT_CONFIGURED");
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const parsed = await response.json().catch(() => ({}));
  if (!response.ok || parsed?.ok !== true) {
    throw new Error(`TELEGRAM_API_${Number(parsed?.error_code || response.status || 500)}`);
  }
  return parsed?.result;
}

async function logDelivery(input: Record<string, unknown>) {
  try {
    return await supabase.from("support_channel_delivery_logs").insert(input).select("id,metadata").single();
  } catch {
    return { data: null, error: new Error("DELIVERY_LOG_FAILED") } as any;
  }
}

async function sendText(chatId: string, text: string, options: { userId?: string | null; ticketId?: string | null } = {}) {
  const normalized = clean(text, 12000) || "DRIGHT Support could not generate a response.";
  const chunks: string[] = [];
  let remaining = normalized;
  while (remaining.length > 3900) {
    let cut = remaining.lastIndexOf("\n", 3900);
    if (cut < 1000) cut = 3900;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining) chunks.push(remaining);

  let lastResult: any = null;
  for (const chunk of chunks) {
    try {
      lastResult = await telegram("sendMessage", {
        chat_id: chatId,
        text: chunk,
        disable_web_page_preview: true,
      });
      await logDelivery({
        ticket_id: options.ticketId || null,
        user_id: options.userId || null,
        channel: "telegram",
        direction: "outbound",
        status: "sent",
        external_chat_id: chatId,
        external_message_id: String(lastResult?.message_id || "") || null,
        provider: "telegram_bot_api",
        delivered_at: new Date().toISOString(),
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : "TELEGRAM_SEND_FAILED";
      await logDelivery({
        ticket_id: options.ticketId || null,
        user_id: options.userId || null,
        channel: "telegram",
        direction: "outbound",
        status: "failed",
        external_chat_id: chatId,
        provider: "telegram_bot_api",
        error_code: code,
      });
      throw error;
    }
  }
  return lastResult;
}

function supportTerms(prompt: string) {
  const stop = new Set(["the","and","for","that","this","with","from","have","what","when","where","which","your","you","are","can","could","would","should","does","how","why","into","about","please"]);
  return Array.from(new Set(prompt.toLowerCase().match(/[a-z0-9]{3,}/g)?.filter(term => !stop.has(term)) || [])).slice(0, 12);
}

function relevance(text: string, terms: string[]) {
  const normalized = text.toLowerCase();
  return terms.reduce((score, term) => score + (normalized.includes(term) ? 1 : 0), 0);
}

async function loadKnowledge(prompt: string) {
  const [articles, faqs] = await Promise.all([
    supabase.from("help_articles")
      .select("id,title,summary,content,tags")
      .eq("is_published", true)
      .eq("is_deleted", false)
      .order("sort_order", { ascending: true })
      .limit(40),
    supabase.from("faq_items")
      .select("id,question,answer,tags")
      .eq("is_published", true)
      .eq("is_deleted", false)
      .order("sort_order", { ascending: true })
      .limit(40),
  ]);

  const terms = supportTerms(prompt);
  return [
    ...(articles.data || []).map((item: any) => ({
      type: "article",
      title: clean(item.title, 240),
      text: `${clean(item.title, 240)} ${clean(item.summary, 1000)} ${stripHtml(item.content)} ${(item.tags || []).join(" ")}`,
    })),
    ...(faqs.data || []).map((item: any) => ({
      type: "faq",
      title: clean(item.question, 240),
      text: `${clean(item.question, 500)} ${stripHtml(item.answer)} ${(item.tags || []).join(" ")}`,
    })),
  ]
    .map(item => ({ ...item, score: relevance(item.text, terms) }))
    .sort((a, b) => b.score - a.score)
    .filter((item, index) => item.score > 0 || (terms.length === 0 && index < 4))
    .slice(0, 8);
}

async function anonymousHelp(prompt: string) {
  const knowledge = await loadKnowledge(prompt);
  const best = knowledge[0];
  if (!best || best.score <= 0) {
    return "I can answer general DRIGHT help questions here. For account-specific help, connect this Telegram account to DRIGHT first. Use /help to see the available commands.";
  }
  const body = best.text.replace(best.title, "").trim();
  return `${best.title}\n\n${clean(body, 2500)}\n\nFor account-specific help, connect Telegram to your DRIGHT account.`;
}

async function buildSupportContext(userId: string, prompt: string) {
  const [knowledge, orders, payments, withdrawals, tickets] = await Promise.all([
    loadKnowledge(prompt),
    supabase.from("orders")
      .select("id,order_type,status,final_price,is_free_order,created_at,completed_at")
      .eq("buyer_id", userId)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase.from("paystack_transactions")
      .select("id,amount,currency,channel,purpose,status,paid_at,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase.from("withdrawal_requests")
      .select("id,amount,payment_method,status,processed_at,created_at,withdrawal_method,failure_reason")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase.from("support_tickets")
      .select("id,ticket_number,subject,status,priority,channel,created_at,last_activity_at,resolved_at,closed_at")
      .eq("user_id", userId)
      .order("last_activity_at", { ascending: false })
      .limit(6),
  ]);

  const kb = knowledge.length
    ? knowledge.map((item, index) => `[KB${index + 1}] ${item.title}\n${clean(item.text, 1800)}`).join("\n\n")
    : "No relevant published DRIGHT help article or FAQ was found.";

  return clean([
    `DRIGHT KNOWLEDGE BASE:\n${kb}`,
    `AUTHENTICATED ACCOUNT CONTEXT:\nRecent buyer orders: ${JSON.stringify(orders.data || [])}`,
    `Recent payments: ${JSON.stringify(payments.data || [])}`,
    `Recent withdrawals: ${JSON.stringify(withdrawals.data || [])}`,
    `Recent support tickets: ${JSON.stringify(tickets.data || [])}`,
    "Do not infer missing facts from empty arrays. Escalate whenever a manual decision, refund eligibility, KYC decision, dispute outcome, payment reversal, or privileged staff action is required.",
  ].join("\n\n"), 22000);
}

const SUPPORT_SYSTEM = `You are DRIGHT Customer Support AI inside Telegram. Use only the supplied DRIGHT knowledge-base material and authenticated account context. Never invent a policy, transaction, order state, refund result, payment result, withdrawal result, verification result, ticket result, or staff action. Do not expose secrets or sensitive payment/account details. If context is insufficient, a manual or privileged action is required, or the user asks for a human, prefix the answer with exactly [ESCALATE]. Otherwise do not use that marker. Be concise, practical, and specific.`;

async function callGroq(prompt: string) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "system", content: SUPPORT_SYSTEM }, { role: "user", content: prompt }],
      max_completion_tokens: 1600,
      temperature: 0.2,
    }),
  });
  if (!response.ok) throw new Error(`GROQ_${response.status}`);
  const parsed = await response.json();
  const content = clean(parsed?.choices?.[0]?.message?.content, 10000);
  if (!content) throw new Error("GROQ_EMPTY");
  return content;
}

async function callGemini(prompt: string) {
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SUPPORT_SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 1600, temperature: 0.2 },
    }),
  });
  if (!response.ok) throw new Error(`GEMINI_${response.status}`);
  const parsed = await response.json();
  const content = clean(parsed?.candidates?.[0]?.content?.parts?.map((item: any) => item?.text || "").join(""), 10000);
  if (!content) throw new Error("GEMINI_EMPTY");
  return content;
}

async function callOpenAI(prompt: string) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: SUPPORT_SYSTEM }, { role: "user", content: prompt }],
      max_tokens: 1600,
      temperature: 0.2,
    }),
  });
  if (!response.ok) throw new Error(`OPENAI_${response.status}`);
  const parsed = await response.json();
  const content = clean(parsed?.choices?.[0]?.message?.content, 10000);
  if (!content) throw new Error("OPENAI_EMPTY");
  return content;
}

async function supportAI(userId: string, userPrompt: string) {
  const context = await buildSupportContext(userId, userPrompt);
  const prompt = `Context:\n${context}\n\nCustomer request:\n${clean(userPrompt, 5000)}`;
  const errors: string[] = [];

  if (GROQ_API_KEY) {
    try { return { content: await callGroq(prompt), provider: "groq" }; } catch (error) { errors.push(error instanceof Error ? error.message : "GROQ_FAILED"); }
  }
  if (GEMINI_API_KEY) {
    try { return { content: await callGemini(prompt), provider: "gemini" }; } catch (error) { errors.push(error instanceof Error ? error.message : "GEMINI_FAILED"); }
  }
  if (OPENAI_API_KEY) {
    try { return { content: await callOpenAI(prompt), provider: "openai" }; } catch (error) { errors.push(error instanceof Error ? error.message : "OPENAI_FAILED"); }
  }

  console.error(`[telegram-support] all AI providers failed: ${errors.join(",") || "no providers configured"}`);
  return { content: "DRIGHT AI Support is temporarily unavailable. You can use /agent followed by your issue to send it to a human support agent.", provider: "none" };
}

function asksForHuman(value: string) {
  const text = value.toLowerCase();
  return /(human|agent|customer\s*care|support\s*staff|real\s*person)/.test(text)
    && /(speak|talk|contact|connect|escalat|transfer|need|want)/.test(text);
}

async function activeTelegramTicket(userId: string, statuses = ["open", "pending_support", "pending_customer", "escalated"]) {
  const { data } = await supabase.from("support_tickets")
    .select("id,ticket_number,status,subject")
    .eq("user_id", userId)
    .eq("channel", "telegram")
    .in("status", statuses)
    .order("last_activity_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function createOrAppendTicket(input: { userId: string; message: string; chatId: string; messageId: string; aiSummary?: string | null; reason?: string }) {
  const existing = await activeTelegramTicket(input.userId);
  if (existing) {
    await supabase.from("ticket_replies").insert({
      ticket_id: existing.id,
      author_id: input.userId,
      author_role: "user",
      message: clean(input.message, 5000),
      channel: "telegram",
      is_internal: false,
      metadata: { source: "telegram", external_message_id: input.messageId, reason: input.reason || "customer_message" },
    });
    if (input.aiSummary) {
      await supabase.from("support_tickets").update({ ai_handled: true, ai_summary: clean(input.aiSummary, 5000) }).eq("id", existing.id);
    }
    return existing;
  }

  const subjectBase = clean(input.message.replace(/\s+/g, " "), 105) || "Telegram support request";
  const { data: ticket, error } = await supabase.from("support_tickets").insert({
    user_id: input.userId,
    subject: `Telegram: ${subjectBase}`,
    message: clean(input.message, 5000),
    status: "open",
    priority: "medium",
    category: "telegram_support",
    channel: "telegram",
    ai_handled: !!input.aiSummary,
    ai_summary: input.aiSummary ? clean(input.aiSummary, 5000) : null,
    external_thread_id: input.chatId,
    external_message_id: input.messageId,
    metadata: { source: "telegram", reason: input.reason || "customer_message" },
  }).select("id,ticket_number,status,subject").single();
  if (error || !ticket) throw new Error("TICKET_CREATE_FAILED");
  return ticket;
}

async function linkTelegramAccount(input: { code: string; telegramUserId: string; chatId: string; username?: string | null }) {
  const code = clean(input.code, 32).toUpperCase();
  if (!/^[A-Z2-9]{8}$/.test(code)) return { ok: false, message: "That link code is not valid. Create a new Telegram link from DRIGHT Help Center and try again." };

  const hash = await sha256Hex(`telegram:${code}`);
  const { data: link } = await supabase.from("support_channel_link_codes")
    .select("id,user_id,expires_at,attempts")
    .eq("channel", "telegram")
    .eq("code_hash", hash)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (!link || Number(link.attempts || 0) >= 5) {
    return { ok: false, message: "That link code is invalid or expired. Generate a new code in DRIGHT Help Center." };
  }

  const { data: externalOwner } = await supabase.from("support_channel_identities")
    .select("user_id,status")
    .eq("channel", "telegram")
    .eq("external_user_id", input.telegramUserId)
    .maybeSingle();

  if (externalOwner && externalOwner.user_id !== link.user_id) {
    return { ok: false, message: "This Telegram account is already associated with another DRIGHT account. Revoke that connection before linking a different account." };
  }

  const now = new Date().toISOString();
  const { error: identityError } = await supabase.from("support_channel_identities").upsert({
    user_id: link.user_id,
    channel: "telegram",
    external_user_id: input.telegramUserId,
    external_chat_id: input.chatId,
    external_username: clean(input.username, 120) || null,
    status: "active",
    linked_at: now,
    verified_at: now,
    last_seen_at: now,
    metadata: { source: "telegram_link_code" },
    updated_at: now,
  }, { onConflict: "user_id,channel" });

  if (identityError) return { ok: false, message: "I could not link this Telegram account. Generate a fresh code in DRIGHT and try again." };

  await supabase.from("support_channel_link_codes").update({ used_at: now, attempts: Number(link.attempts || 0) + 1 }).eq("id", link.id);
  return { ok: true, userId: link.user_id, message: "Telegram is now securely connected to your DRIGHT account. You can ask account-specific support questions here." };
}

async function getIdentity(telegramUserId: string) {
  const { data } = await supabase.from("support_channel_identities")
    .select("id,user_id,external_chat_id,external_username,status")
    .eq("channel", "telegram")
    .eq("external_user_id", telegramUserId)
    .eq("status", "active")
    .maybeSingle();
  return data;
}

const helpText = `DRIGHT Support commands\n\n/help — show these commands\n/link CODE — connect this Telegram account to DRIGHT\n/ticket YOUR ISSUE — create or update a support ticket\n/agent YOUR ISSUE — send your issue to a human support agent\n/status — show your latest active Telegram support ticket\n/ai YOUR QUESTION — ask DRIGHT AI Support\n/unlink — disconnect this Telegram account\n\nYou can also type a normal question. General help works before linking; private account information requires a secure DRIGHT link.`;

async function setupTelegramWebhook() {
  if (!TELEGRAM_BOT_TOKEN) return { success: false, configured: false, error: "TELEGRAM_BOT_TOKEN is not configured" };
  const bot = await telegram("getMe");
  const secret = await webhookSecret();
  const webhookUrl = `${SUPABASE_URL}/functions/v1/telegram-support-webhook`;
  await telegram("setWebhook", {
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ["message"],
    drop_pending_updates: true,
  });
  await telegram("setMyCommands", {
    commands: [
      { command: "start", description: "Start DRIGHT Support" },
      { command: "help", description: "Show support commands" },
      { command: "link", description: "Link your DRIGHT account" },
      { command: "ticket", description: "Create or update a support ticket" },
      { command: "agent", description: "Request a human support agent" },
      { command: "status", description: "Check your support ticket" },
      { command: "ai", description: "Ask DRIGHT AI Support" },
      { command: "unlink", description: "Disconnect Telegram from DRIGHT" },
    ],
  });
  const webhook = await telegram("getWebhookInfo");
  return {
    success: true,
    configured: true,
    bot: { id: bot?.id, username: bot?.username, first_name: bot?.first_name },
    webhook: { url: webhook?.url, pending_update_count: webhook?.pending_update_count, last_error_date: webhook?.last_error_date || null, last_error_message: webhook?.last_error_message || null },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "GET") {
    try { return json(await setupTelegramWebhook()); }
    catch (error) {
      console.error("[telegram-support] setup failed", error instanceof Error ? error.message : String(error));
      return json({ success: false, configured: !!TELEGRAM_BOT_TOKEN, error: "Telegram webhook setup failed" }, 500);
    }
  }

  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);
  if (!TELEGRAM_BOT_TOKEN) return json({ success: false, error: "Telegram is not configured" }, 503);

  const expectedSecret = await webhookSecret();
  const suppliedSecret = req.headers.get("X-Telegram-Bot-Api-Secret-Token") || "";
  if (!suppliedSecret || suppliedSecret !== expectedSecret) return json({ success: false, error: "Unauthorized webhook" }, 401);

  let update: any;
  try { update = await req.json(); } catch { return json({ success: true, ignored: true }); }
  const message = update?.message;
  const text = clean(message?.text, 5000);
  const chatId = String(message?.chat?.id || "");
  const telegramUserId = String(message?.from?.id || "");
  const externalMessageId = String(message?.message_id || "");
  const username = clean(message?.from?.username, 120) || null;

  if (!text || !chatId || !telegramUserId || message?.from?.is_bot) return json({ success: true, ignored: true });

  const { data: existingInbound } = await supabase.from("support_channel_delivery_logs")
    .select("id,metadata")
    .eq("channel", "telegram")
    .eq("direction", "inbound")
    .eq("external_chat_id", chatId)
    .eq("external_message_id", externalMessageId)
    .maybeSingle();
  if (existingInbound?.metadata?.processed === true) return json({ success: true, duplicate: true });

  let inboundLogId = existingInbound?.id || null;
  if (!inboundLogId) {
    const logged = await logDelivery({
      channel: "telegram",
      direction: "inbound",
      status: "received",
      external_chat_id: chatId,
      external_message_id: externalMessageId,
      provider: "telegram_bot_api",
      metadata: { update_id: update?.update_id || null, processed: false },
    });
    inboundLogId = logged?.data?.id || null;
  }

  try {
    let identity = await getIdentity(telegramUserId);
    if (identity) {
      await supabase.from("support_channel_identities").update({
        external_chat_id: chatId,
        external_username: username,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", identity.id);
      if (inboundLogId) await supabase.from("support_channel_delivery_logs").update({ user_id: identity.user_id }).eq("id", inboundLogId);
    }

    const commandMatch = text.match(/^\/(\w+)(?:@\w+)?(?:\s+([\s\S]*))?$/);
    const command = commandMatch?.[1]?.toLowerCase() || "";
    const argument = clean(commandMatch?.[2], 5000);

    if (command === "start") {
      if (argument.startsWith("link_")) {
        const linked = await linkTelegramAccount({ code: argument.slice(5), telegramUserId, chatId, username });
        await sendText(chatId, linked.message, { userId: linked.ok ? linked.userId : null });
        if (linked.ok) identity = await getIdentity(telegramUserId);
      } else {
        await sendText(chatId, `Welcome to DRIGHT Support.\n\nI can answer general help questions, connect you with DRIGHT AI Support, and create support tickets. Account-specific help requires linking this Telegram account to DRIGHT.\n\n${helpText}`, { userId: identity?.user_id || null });
      }
    } else if (command === "help") {
      await sendText(chatId, helpText, { userId: identity?.user_id || null });
    } else if (command === "link") {
      if (!argument) {
        await sendText(chatId, "Create a Telegram link code from DRIGHT Help Center, then send /link followed by the 8-character code.");
      } else {
        const linked = await linkTelegramAccount({ code: argument, telegramUserId, chatId, username });
        await sendText(chatId, linked.message, { userId: linked.ok ? linked.userId : null });
        if (linked.ok) identity = await getIdentity(telegramUserId);
      }
    } else if (command === "unlink") {
      if (!identity) {
        await sendText(chatId, "This Telegram account is not currently linked to DRIGHT.");
      } else {
        await supabase.from("support_channel_identities").update({ status: "revoked", updated_at: new Date().toISOString() }).eq("id", identity.id);
        await sendText(chatId, "Telegram has been disconnected from your DRIGHT account. General help is still available here.");
        identity = null;
      }
    } else if (command === "status") {
      if (!identity) {
        await sendText(chatId, "Link this Telegram account to DRIGHT before checking private support tickets. Use /help for instructions.");
      } else {
        const ticket = await activeTelegramTicket(identity.user_id);
        await sendText(chatId, ticket
          ? `Latest active ticket: ${ticket.ticket_number || ticket.id.slice(0, 8)}\nStatus: ${String(ticket.status).replace(/_/g, " ")}\nSubject: ${ticket.subject}`
          : "You do not currently have an active Telegram support ticket.", { userId: identity.user_id, ticketId: ticket?.id || null });
      }
    } else if (command === "ticket" || command === "agent") {
      if (!identity) {
        await sendText(chatId, "Link this Telegram account to DRIGHT before creating a private support ticket. Use /help for instructions.");
      } else if (!argument) {
        await sendText(chatId, `Send /${command} followed by a description of the issue.`, { userId: identity.user_id });
      } else {
        const ticket = await createOrAppendTicket({
          userId: identity.user_id,
          message: argument,
          chatId,
          messageId: externalMessageId,
          reason: command === "agent" ? "human_requested" : "ticket_command",
        });
        await sendText(chatId, `Your message was sent to DRIGHT Support.\nTicket: ${ticket.ticket_number || ticket.id.slice(0, 8)}\nStatus: ${String(ticket.status).replace(/_/g, " ")}`, { userId: identity.user_id, ticketId: ticket.id });
      }
    } else {
      if (!identity) {
        await sendText(chatId, await anonymousHelp(command === "ai" ? argument : text));
      } else {
        const aiPrompt = command === "ai" ? argument : text;
        if (!aiPrompt) {
          await sendText(chatId, "Send /ai followed by your support question.", { userId: identity.user_id });
        } else {
          const waitingTicket = command !== "ai" ? await activeTelegramTicket(identity.user_id, ["pending_customer"]) : null;
          if (waitingTicket) {
            await supabase.from("ticket_replies").insert({
              ticket_id: waitingTicket.id,
              author_id: identity.user_id,
              author_role: "user",
              message: aiPrompt,
              channel: "telegram",
              is_internal: false,
              metadata: { source: "telegram", external_message_id: externalMessageId, reason: "pending_customer_reply" },
            });
            await sendText(chatId, `Your reply was added to ticket ${waitingTicket.ticket_number || waitingTicket.id.slice(0, 8)}. DRIGHT Support has been notified.`, { userId: identity.user_id, ticketId: waitingTicket.id });
          } else {
            const result = await supportAI(identity.user_id, aiPrompt);
            let content = result.content.trim();
            const modelEscalated = /^\[ESCALATE\]/i.test(content);
            content = content.replace(/^\[ESCALATE\]\s*/i, "").trim();
            if (modelEscalated || asksForHuman(aiPrompt)) {
              const ticket = await createOrAppendTicket({
                userId: identity.user_id,
                message: aiPrompt,
                chatId,
                messageId: externalMessageId,
                aiSummary: content,
                reason: modelEscalated ? "ai_escalation" : "human_requested",
              });
              await sendText(chatId, `${content || "This request needs a support agent to review it."}\n\nI created or updated ticket ${ticket.ticket_number || ticket.id.slice(0, 8)}. DRIGHT Support has been notified.`, { userId: identity.user_id, ticketId: ticket.id });
            } else {
              await sendText(chatId, content, { userId: identity.user_id });
            }
          }
        }
      }
    }

    if (inboundLogId) {
      await supabase.from("support_channel_delivery_logs").update({
        metadata: { update_id: update?.update_id || null, processed: true },
      }).eq("id", inboundLogId);
    }
    return json({ success: true });
  } catch (error) {
    console.error("[telegram-support] webhook processing failed", error instanceof Error ? error.message : String(error));
    try { await sendText(chatId, "DRIGHT Support could not process that message right now. Please try again, or use /help to see support options."); } catch { /* Telegram may also be unavailable. */ }
    return json({ success: false, error: "Webhook processing failed" }, 500);
  }
});
