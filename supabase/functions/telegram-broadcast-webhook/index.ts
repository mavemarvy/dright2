import { createClient } from "npm:@supabase/supabase-js@2.110.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const BOT_TOKEN = Deno.env.get("TELEGRAM_BROADCAST_BOT_TOKEN") || "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const clean = (value: unknown, max = 4000) =>
  String(value ?? "").replace(/\0/g, "").trim().slice(0, max);

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const webhookSecret = () => sha256Hex(`dright-broadcast-webhook-v1:${BOT_TOKEN}`);
const workerSecret = () => sha256Hex(`dright-broadcast-worker-v1:${BOT_TOKEN}`);

async function telegram(method: string, payload: Record<string, unknown> = {}) {
  if (!BOT_TOKEN) throw new Error("TELEGRAM_BROADCAST_BOT_TOKEN_MISSING");
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const parsed = await response.json().catch(() => ({}));
  if (!response.ok || parsed?.ok !== true) {
    throw new Error(`TELEGRAM_${method}_${parsed?.error_code || response.status}`);
  }
  return parsed.result;
}

async function getSettings() {
  const { data } = await supabase
    .from("telegram_broadcast_settings")
    .select("*")
    .eq("singleton", true)
    .maybeSingle();

  return data || {
    support_bot_username: "DrightSupportBot",
    welcome_enabled: true,
    welcome_template:
      "Welcome, {name}, to {chat}. For account disputes, allegations, payments, orders, withdrawals, verification, or private support, use @DrightSupportBot.",
    welcome_delete_after_seconds: 180,
    moderation_enabled: true,
    delete_blocked_messages: true,
    blocked_terms: [],
    support_redirect_terms: ["fraud", "scam", "stole", "stolen", "stealing", "chargeback", "dispute", "allegation"],
    auto_create_join_request_link: true,
  };
}

function chatPermissions(member: any) {
  const out: Record<string, boolean> = {};
  for (const key of [
    "can_manage_chat",
    "can_change_info",
    "can_delete_messages",
    "can_invite_users",
    "can_restrict_members",
    "can_pin_messages",
    "can_post_messages",
    "can_edit_messages",
    "can_manage_video_chats",
    "can_manage_topics",
    "can_manage_tags",
  ]) {
    if (typeof member?.[key] === "boolean") out[key] = member[key];
  }
  return out;
}

async function upsertChat(chat: any, member?: any) {
  if (!chat?.id || !["group", "supergroup", "channel", "private"].includes(chat.type)) return null;

  const status = clean(member?.status || "member", 32) || "member";
  const isActive = !["left", "kicked"].includes(status);
  const type = String(chat.type);

  const { data, error } = await supabase
    .from("telegram_broadcast_chats")
    .upsert({
      chat_id: String(chat.id),
      chat_type: type,
      title:
        clean(chat.title, 240) ||
        (type === "private" ? clean([chat.first_name, chat.last_name].filter(Boolean).join(" "), 240) : null),
      username: clean(chat.username, 120) || null,
      bot_status: status,
      bot_permissions: chatPermissions(member),
      is_active: isActive,
      publish_enabled: ["group", "supergroup", "channel"].includes(type),
      moderation_enabled: ["group", "supergroup"].includes(type),
      welcome_enabled: ["group", "supergroup"].includes(type),
      join_requests_enabled: ["group", "supergroup", "channel"].includes(type),
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "chat_id" })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function ensureJoinRequestLink(chatRow: any) {
  if (!chatRow || !["group", "supergroup", "channel"].includes(chatRow.chat_type)) return;
  const settings = await getSettings();
  if (!settings.auto_create_join_request_link || !chatRow.join_requests_enabled || chatRow.request_invite_link) return;
  if (chatRow.bot_status !== "administrator" || chatRow.bot_permissions?.can_invite_users !== true) return;

  try {
    const link = await telegram("createChatInviteLink", {
      chat_id: chatRow.chat_id,
      name: "DRIGHT Request to Join",
      creates_join_request: true,
    });
    if (link?.invite_link) {
      await supabase
        .from("telegram_broadcast_chats")
        .update({ request_invite_link: String(link.invite_link), updated_at: new Date().toISOString() })
        .eq("chat_id", chatRow.chat_id);
    }
  } catch (error) {
    console.error("[broadcast] join-link", error instanceof Error ? error.message : String(error));
  }
}

async function upsertSubscriber(message: any, active = true) {
  const user = message?.from;
  const chat = message?.chat;
  if (!user?.id || !chat?.id || chat.type !== "private") return;

  await supabase.from("telegram_broadcast_subscribers").upsert({
    telegram_user_id: String(user.id),
    private_chat_id: String(chat.id),
    username: clean(user.username, 120) || null,
    first_name: clean(user.first_name, 120) || null,
    last_name: clean(user.last_name, 120) || null,
    is_active: active,
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "telegram_user_id" });
}

async function sendPrivateWelcome(message: any) {
  await upsertSubscriber(message, true);
  await telegram("sendMessage", {
    chat_id: message.chat.id,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    text:
      "<b>Dright Broadcast</b>\n\n" +
      "You are subscribed to DRIGHT news, approved promotions and recommendations. " +
      "Private account/support issues belong in @DrightSupportBot.\n\n" +
      "Commands:\n/news — toggle news\n/promotions — toggle promotions\n/recommendations — toggle recommendations\n/unsubscribe — stop all private broadcasts",
  });
}

async function toggleSubscription(
  message: any,
  field: "subscribed_news" | "subscribed_promotions" | "subscribed_recommendations",
  label: string,
) {
  await upsertSubscriber(message, true);
  const userId = String(message.from.id);
  const { data } = await supabase
    .from("telegram_broadcast_subscribers")
    .select(field)
    .eq("telegram_user_id", userId)
    .single();

  const next = !(data as any)?.[field];
  await supabase
    .from("telegram_broadcast_subscribers")
    .update({
      [field]: next,
      is_active: true,
      updated_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    })
    .eq("telegram_user_id", userId);

  await telegram("sendMessage", { chat_id: message.chat.id, text: `${label}: ${next ? "ON" : "OFF"}` });
}

async function sendWelcome(chat: any, user: any) {
  if (!chat?.id || !user?.id || user?.is_bot) return;

  const settings = await getSettings();
  const { data: chatRow } = await supabase
    .from("telegram_broadcast_chats")
    .select("*")
    .eq("chat_id", String(chat.id))
    .maybeSingle();

  if (!settings.welcome_enabled || chatRow?.welcome_enabled === false) return;

  const name = clean(user.first_name || user.username || "member", 80);
  const chatName = clean(chat.title || chatRow?.title || "the community", 160);
  const supportUsername = clean(settings.support_bot_username || "DrightSupportBot", 120).replace(/^@/, "");
  const text = String(settings.welcome_template || "Welcome, {name}, to {chat}.")
    .replaceAll("{name}", name)
    .replaceAll("{chat}", chatName)
    .replaceAll("@DrightSupportBot", `@${supportUsername}`);

  const sent = await telegram("sendMessage", {
    chat_id: chat.id,
    text,
    reply_markup: {
      inline_keyboard: [
        [{ text: "I’ve read this ✓", callback_data: `welcome_ack:${user.id}` }],
        [{ text: "Contact DRIGHT Support", url: `https://t.me/${supportUsername}` }],
      ],
    },
  });

  const seconds = Math.max(30, Math.min(86400, Number(settings.welcome_delete_after_seconds || 180)));
  await supabase.from("telegram_broadcast_welcome_messages").insert({
    chat_id: String(chat.id),
    telegram_user_id: String(user.id),
    message_id: String(sent?.message_id || ""),
    expires_at: new Date(Date.now() + seconds * 1000).toISOString(),
  });
}

async function cleanupExpiredWelcomes() {
  const { data } = await supabase
    .from("telegram_broadcast_welcome_messages")
    .select("id,chat_id,message_id")
    .is("deleted_at", null)
    .lt("expires_at", new Date().toISOString())
    .limit(20);

  for (const row of data || []) {
    try {
      await telegram("deleteMessage", { chat_id: row.chat_id, message_id: Number(row.message_id) });
    } catch {
      // The message may already be gone.
    }
    await supabase
      .from("telegram_broadcast_welcome_messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", row.id);
  }
}

function findMatchedTerm(text: string, terms: string[]) {
  const normalized = text.toLowerCase();
  return (terms || [])
    .map((value) => String(value).trim().toLowerCase())
    .find((value) => value && normalized.includes(value)) || null;
}

async function moderateGroupMessage(message: any) {
  const chatId = String(message?.chat?.id || "");
  const from = message?.from;
  if (!chatId || !from?.id || from?.is_bot) return;

  const raw = clean(message?.text || message?.caption, 5000);
  if (!raw) return;

  const [{ data: chatRow }, settings] = await Promise.all([
    supabase.from("telegram_broadcast_chats").select("*").eq("chat_id", chatId).maybeSingle(),
    getSettings(),
  ]);

  if (!settings.moderation_enabled || chatRow?.moderation_enabled === false) return;

  const blocked = findMatchedTerm(raw, settings.blocked_terms || []);
  const redirect = findMatchedTerm(raw, settings.support_redirect_terms || []);
  if (!blocked && !redirect) return;

  const action = blocked ? "deleted" : "support_redirect";
  if (settings.delete_blocked_messages || redirect) {
    try {
      await telegram("deleteMessage", { chat_id: chatId, message_id: message.message_id });
    } catch {
      // Permission failures are logged by the destination status.
    }
  }

  await supabase.from("telegram_broadcast_moderation_events").insert({
    chat_id: chatId,
    telegram_user_id: String(from.id),
    message_id: String(message.message_id),
    action,
    reason: blocked ? "blocked_term" : "private_support_topic",
    matched_term: blocked || redirect,
  });

  const supportUsername = clean(settings.support_bot_username || "DrightSupportBot", 120).replace(/^@/, "");
  await telegram("sendMessage", {
    chat_id: chatId,
    text: blocked
      ? "That message was removed under this community’s moderation rules. If this concerns a DRIGHT account or transaction, contact Customer Care."
      : "Please move account disputes, allegations, payments, orders, withdrawals and private support issues to DRIGHT Customer Care.",
    reply_markup: {
      inline_keyboard: [[{ text: "Open DRIGHT Support", url: `https://t.me/${supportUsername}` }]],
    },
  });
}

async function handleCallback(query: any) {
  const data = clean(query?.data, 256);
  const chat = query?.message?.chat;
  const messageId = query?.message?.message_id;
  const userId = String(query?.from?.id || "");

  if (!data.startsWith("welcome_ack:") || !chat?.id || !messageId || !userId) return;

  const expected = data.split(":")[1] || "";
  if (expected !== userId) {
    await telegram("answerCallbackQuery", {
      callback_query_id: query.id,
      text: "Only the welcomed member can dismiss this message.",
      show_alert: false,
    });
    return;
  }

  try {
    await telegram("deleteMessage", { chat_id: chat.id, message_id: messageId });
  } catch {
    // It may already be deleted by the TTL cleanup.
  }

  await supabase
    .from("telegram_broadcast_welcome_messages")
    .update({ acknowledged_at: new Date().toISOString(), deleted_at: new Date().toISOString() })
    .eq("chat_id", String(chat.id))
    .eq("message_id", String(messageId))
    .eq("telegram_user_id", userId);

  await telegram("answerCallbackQuery", { callback_query_id: query.id, text: "Welcome acknowledged." });
}

async function handleJoinRequest(request: any) {
  const chat = request?.chat;
  const user = request?.from;
  if (!chat?.id || !user?.id) return;

  const chatRow = await upsertChat(chat);

  await supabase
    .from("telegram_broadcast_join_requests")
    .update({ status: "cancelled", decided_at: new Date().toISOString() })
    .eq("chat_id", String(chat.id))
    .eq("telegram_user_id", String(user.id))
    .eq("status", "pending");

  await supabase.from("telegram_broadcast_join_requests").insert({
    chat_id: String(chat.id),
    telegram_user_id: String(user.id),
    username: clean(user.username, 120) || null,
    first_name: clean(user.first_name, 120) || null,
    last_name: clean(user.last_name, 120) || null,
    status: "pending",
    metadata: {
      user_chat_id: request.user_chat_id ? String(request.user_chat_id) : null,
      invite_link: request.invite_link?.invite_link || null,
    },
  });

  if (request.user_chat_id) {
    try {
      await telegram("sendMessage", {
        chat_id: request.user_chat_id,
        text: `Your request to join ${chatRow?.title || chat.title || "the DRIGHT community"} is pending administrator approval.`,
      });
    } catch {
      // Telegram only guarantees this temporary user chat for a limited window.
    }
  }
}

async function setup() {
  if (!BOT_TOKEN) {
    return { success: false, configured: false, error: "TELEGRAM_BROADCAST_BOT_TOKEN is not configured" };
  }

  const bot = await telegram("getMe");
  const username = String(bot?.username || "");
  const secret = await webhookSecret();
  const webhookUrl = `${SUPABASE_URL}/functions/v1/telegram-broadcast-webhook`;

  await telegram("setWebhook", {
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: [
      "message",
      "channel_post",
      "edited_channel_post",
      "my_chat_member",
      "chat_member",
      "chat_join_request",
      "callback_query",
    ],
    drop_pending_updates: false,
  });

  await telegram("setMyName", { name: "Dright Broadcast" });
  await telegram("setMyShortDescription", {
    short_description: "Official DRIGHT news, promotions, recommendations and community updates.",
  });
  await telegram("setMyDescription", {
    description:
      "Official DRIGHT Broadcast bot for news, approved promotions, recommendations, community updates and member notices. For private account support, use @DrightSupportBot.",
  });

  const { error: cronError } = await supabase.rpc("ensure_telegram_broadcast_cron", {
    p_worker_secret: await workerSecret(),
  });

  if (cronError) {
    console.error("[broadcast] cron setup failed", cronError.message);
  } else {
    const { error: bootstrapError } = await supabase.rpc("complete_telegram_broadcast_bootstrap");
    if (bootstrapError) console.error("[broadcast] bootstrap cleanup failed", bootstrapError.message);
  }

  await telegram("setMyCommands", {
    commands: [
      { command: "start", description: "Subscribe to DRIGHT broadcasts" },
      { command: "news", description: "Toggle DRIGHT news" },
      { command: "promotions", description: "Toggle promotions" },
      { command: "recommendations", description: "Toggle recommendations" },
      { command: "unsubscribe", description: "Stop private broadcasts" },
    ],
  });

  const webhook = await telegram("getWebhookInfo");
  return {
    success: true,
    configured: true,
    expected_username: "Dright_broadcast_bot",
    username,
    username_matches: username.toLowerCase() === "dright_broadcast_bot",
    bot_name: bot?.first_name || null,
    worker_cron_configured: !cronError,
    webhook: {
      url: webhook?.url || null,
      pending_update_count: webhook?.pending_update_count || 0,
      last_error_date: webhook?.last_error_date || null,
      last_error_message: webhook?.last_error_message || null,
      allowed_updates: webhook?.allowed_updates || [],
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "GET") {
    try {
      return json(await setup());
    } catch (error) {
      console.error("[broadcast] setup failed", error instanceof Error ? error.message : String(error));
      return json({ success: false, error: "Broadcast bot setup failed" }, 500);
    }
  }

  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);
  if (!BOT_TOKEN) return json({ success: false, error: "Broadcast bot token is not configured" }, 503);

  const supplied = req.headers.get("X-Telegram-Bot-Api-Secret-Token") || "";
  if (!supplied || supplied !== await webhookSecret()) {
    return json({ success: false, error: "Unauthorized webhook" }, 401);
  }

  let update: any;
  try {
    update = await req.json();
  } catch {
    return json({ success: true, ignored: true });
  }

  try {
    const { error: ensureWorkerError } = await supabase.rpc("ensure_telegram_broadcast_cron", {
      p_worker_secret: await workerSecret(),
    });
    if (ensureWorkerError) console.error("[broadcast] worker ensure failed", ensureWorkerError.message);

    await cleanupExpiredWelcomes();

    if (update?.my_chat_member) {
      const row = await upsertChat(update.my_chat_member.chat, update.my_chat_member.new_chat_member);
      await ensureJoinRequestLink(row);
      return json({ success: true, event: "my_chat_member" });
    }

    if (update?.chat_join_request) {
      await handleJoinRequest(update.chat_join_request);
      return json({ success: true, event: "chat_join_request" });
    }

    if (update?.chat_member) {
      const event = update.chat_member;
      const row = await upsertChat(event.chat);
      const oldStatus = String(event.old_chat_member?.status || "");
      const newStatus = String(event.new_chat_member?.status || "");
      const joined =
        ["left", "kicked"].includes(oldStatus) &&
        ["member", "restricted", "administrator"].includes(newStatus);

      if (joined) await sendWelcome(event.chat, event.new_chat_member?.user);
      await ensureJoinRequestLink(row);
      return json({ success: true, event: "chat_member" });
    }

    if (update?.callback_query) {
      await handleCallback(update.callback_query);
      return json({ success: true, event: "callback_query" });
    }

    const message = update?.message || update?.channel_post || update?.edited_channel_post;
    if (!message?.chat?.id) return json({ success: true, ignored: true });

    const row = await upsertChat(message.chat);
    await ensureJoinRequestLink(row);

    if (update?.channel_post || update?.edited_channel_post) {
      return json({ success: true, event: "channel_post" });
    }

    if (message.chat.type === "private") {
      const command =
        clean(message.text, 300).split(/\s+/)[0]?.toLowerCase().replace(/@.*$/, "") || "";

      if (command === "/start") {
        await sendPrivateWelcome(message);
      } else if (command === "/unsubscribe") {
        await upsertSubscriber(message, false);
        await supabase
          .from("telegram_broadcast_subscribers")
          .update({
            is_active: false,
            updated_at: new Date().toISOString(),
            last_seen_at: new Date().toISOString(),
          })
          .eq("telegram_user_id", String(message.from.id));
        await telegram("sendMessage", {
          chat_id: message.chat.id,
          text: "Private DRIGHT broadcasts are now OFF. Send /start to subscribe again.",
        });
      } else if (command === "/news") {
        await toggleSubscription(message, "subscribed_news", "News");
      } else if (command === "/promotions") {
        await toggleSubscription(message, "subscribed_promotions", "Promotions");
      } else if (command === "/recommendations") {
        await toggleSubscription(message, "subscribed_recommendations", "Recommendations");
      } else {
        await upsertSubscriber(message, true);
        await telegram("sendMessage", {
          chat_id: message.chat.id,
          text: "This bot publishes DRIGHT news, promotions and recommendations. For account help or customer care, open @DrightSupportBot.",
        });
      }

      return json({ success: true, event: "private_message" });
    }

    for (const member of message.new_chat_members || []) {
      await sendWelcome(message.chat, member);
    }

    await moderateGroupMessage(message);
    return json({ success: true, event: "group_message" });
  } catch (error) {
    console.error("[broadcast] webhook failed", error instanceof Error ? error.message : String(error));
    return json({ success: false, error: "Webhook processing failed" }, 500);
  }
});
