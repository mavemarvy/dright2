import { createClient } from "npm:@supabase/supabase-js@2.110.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const BOT_TOKEN = Deno.env.get("TELEGRAM_BROADCAST_BOT_TOKEN") || "";

const adminDb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
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
const workerSecret = () => sha256Hex(`dright-broadcast-worker-v1:${BOT_TOKEN}`);

async function telegram(method: string, payload: Record<string, unknown> = {}) {
  if (!BOT_TOKEN) throw new Error("BROADCAST_BOT_NOT_CONFIGURED");
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const parsed = await response.json().catch(() => ({}));
  if (!response.ok || parsed?.ok !== true) {
    throw new Error(`TELEGRAM_${Number(parsed?.error_code || response.status || 500)}`);
  }
  return parsed.result;
}

async function telegramMultipart(method: string, form: FormData) {
  if (!BOT_TOKEN) throw new Error("BROADCAST_BOT_NOT_CONFIGURED");
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    body: form,
  });
  const parsed = await response.json().catch(() => ({}));
  if (!response.ok || parsed?.ok !== true) {
    throw new Error(`TELEGRAM_${Number(parsed?.error_code || response.status || 500)}`);
  }
  return parsed.result;
}

async function requireAdmin(req: Request) {
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) throw new Error("UNAUTHORIZED");

  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("UNAUTHORIZED");

  const { data: profile } = await adminDb.from("users")
    .select("id,is_admin,admin_status,admin_verification_status")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile?.is_admin || profile.admin_status !== "active" ||
      (profile.admin_verification_status && profile.admin_verification_status !== "approved")) {
    throw new Error("FORBIDDEN");
  }
  return data.user;
}

async function ensureChat(chatId: string) {
  const { data } = await adminDb.from("telegram_broadcast_chats").select("*").eq("chat_id", chatId).maybeSingle();
  if (!data) throw new Error("CHAT_NOT_DISCOVERED");
  return data;
}

async function runWorker() {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/telegram-broadcast-worker`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Dright-Broadcast-Worker-Secret": await workerSecret(),
    },
    body: "{}",
  });
  return response.json().catch(() => ({ success: false }));
}

function allowedPhotoUrl(raw: string) {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && [
      "vtiardblxpaeekbfvhjo.supabase.co",
      "dright.store",
      "www.dright.store",
    ].includes(url.hostname);
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  let user: any;
  try {
    user = await requireAdmin(req);
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNAUTHORIZED";
    return json({ success: false, error: code }, code === "FORBIDDEN" ? 403 : 401);
  }

  let input: any = {};
  try { input = await req.json(); } catch {}
  const action = clean(input.action, 80);

  try {
    if (action === "list_state") {
      const [chats, joins, campaigns, cfg, subscribers] = await Promise.all([
        adminDb.from("telegram_broadcast_chats").select("*").order("last_seen_at", { ascending: false }),
        adminDb.from("telegram_broadcast_join_requests").select("*").eq("status", "pending").order("requested_at", { ascending: false }).limit(200),
        adminDb.from("telegram_broadcast_campaigns").select("*").order("created_at", { ascending: false }).limit(100),
        adminDb.from("telegram_broadcast_settings").select("*").eq("singleton", true).maybeSingle(),
        adminDb.from("telegram_broadcast_subscribers")
          .select("telegram_user_id,is_active,subscribed_news,subscribed_promotions,subscribed_recommendations,created_at,last_seen_at")
          .eq("is_active", true),
      ]);
      return json({
        success: true,
        chats: chats.data || [],
        pending_join_requests: joins.data || [],
        campaigns: campaigns.data || [],
        settings: cfg.data || null,
        active_subscriber_count: (subscribers.data || []).length,
      });
    }

    if (action === "update_chat") {
      const chatId = clean(input.chat_id, 100);
      await ensureChat(chatId);
      const patch: Record<string, boolean> = {};
      for (const key of ["publish_enabled", "moderation_enabled", "welcome_enabled", "join_requests_enabled"]) {
        if (typeof input[key] === "boolean") patch[key] = input[key];
      }
      const { data, error } = await adminDb.from("telegram_broadcast_chats")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("chat_id", chatId)
        .select("*")
        .single();
      if (error) throw error;
      return json({ success: true, chat: data });
    }

    if (action === "set_title") {
      const chatId = clean(input.chat_id, 100);
      const title = clean(input.title, 128);
      if (!title) throw new Error("TITLE_REQUIRED");
      await ensureChat(chatId);
      await telegram("setChatTitle", { chat_id: chatId, title });
      const chat = await telegram("getChat", { chat_id: chatId });
      await adminDb.from("telegram_broadcast_chats")
        .update({ title: clean(chat?.title, 240) || title, updated_at: new Date().toISOString() })
        .eq("chat_id", chatId);
      return json({ success: true, title: clean(chat?.title, 240) || title });
    }

    if (action === "set_description") {
      const chatId = clean(input.chat_id, 100);
      await ensureChat(chatId);
      await telegram("setChatDescription", { chat_id: chatId, description: clean(input.description, 255) });
      return json({ success: true });
    }

    if (action === "set_photo") {
      const chatId = clean(input.chat_id, 100);
      const photoUrl = clean(input.photo_url, 2000);
      await ensureChat(chatId);
      if (!allowedPhotoUrl(photoUrl)) throw new Error("PHOTO_URL_NOT_ALLOWED");

      const response = await fetch(photoUrl);
      if (!response.ok) throw new Error("PHOTO_DOWNLOAD_FAILED");
      const contentType = clean(response.headers.get("content-type"), 100).toLowerCase();
      if (!contentType.startsWith("image/")) throw new Error("PHOTO_MUST_BE_IMAGE");
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > 10 * 1024 * 1024) throw new Error("PHOTO_TOO_LARGE");

      const form = new FormData();
      form.set("chat_id", chatId);
      form.set("photo", new Blob([bytes], { type: contentType || "image/jpeg" }), "chat-photo.jpg");
      await telegramMultipart("setChatPhoto", form);
      return json({ success: true });
    }

    if (action === "create_join_request_link") {
      const chatId = clean(input.chat_id, 100);
      await ensureChat(chatId);
      const link = await telegram("createChatInviteLink", {
        chat_id: chatId,
        name: clean(input.name, 32) || "DRIGHT Request to Join",
        creates_join_request: true,
      });
      await adminDb.from("telegram_broadcast_chats").update({
        request_invite_link: link?.invite_link || null,
        join_requests_enabled: true,
        updated_at: new Date().toISOString(),
      }).eq("chat_id", chatId);
      return json({ success: true, invite_link: link?.invite_link || null });
    }

    if (action === "decide_join_request") {
      const chatId = clean(input.chat_id, 100);
      const telegramUserId = clean(input.telegram_user_id, 100);
      const decision = clean(input.decision, 20);
      if (!["approve", "decline"].includes(decision)) throw new Error("INVALID_DECISION");
      await ensureChat(chatId);
      await telegram(decision === "approve" ? "approveChatJoinRequest" : "declineChatJoinRequest", {
        chat_id: chatId,
        user_id: Number(telegramUserId),
      });
      await adminDb.from("telegram_broadcast_join_requests").update({
        status: decision === "approve" ? "approved" : "declined",
        decided_at: new Date().toISOString(),
        decided_by: user.id,
      }).eq("chat_id", chatId).eq("telegram_user_id", telegramUserId).eq("status", "pending");
      return json({ success: true, decision });
    }

    if (action === "update_settings") {
      const allowed = [
        "support_bot_username", "welcome_enabled", "welcome_template", "welcome_delete_after_seconds",
        "moderation_enabled", "delete_blocked_messages", "blocked_terms", "support_redirect_terms",
        "auto_create_join_request_link", "private_broadcasts_enabled", "news_broadcasts_enabled",
        "promotion_broadcasts_enabled",
      ];
      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      };
      for (const key of allowed) if (input[key] !== undefined) patch[key] = input[key];
      const { data, error } = await adminDb.from("telegram_broadcast_settings")
        .update(patch).eq("singleton", true).select("*").single();
      if (error) throw error;
      return json({ success: true, settings: data });
    }

    if (action === "publish") {
      const sourceType = clean(input.source_type, 30) || "news";
      if (!["news", "recommendation", "admin"].includes(sourceType)) throw new Error("INVALID_SOURCE_TYPE");
      const title = clean(input.title, 240);
      const body = clean(input.body, 6000);
      if (!title && !body) throw new Error("CONTENT_REQUIRED");

      const audience = sourceType === "news" ? "news" :
        sourceType === "recommendation" ? "recommendations" : "news";

      const { data: campaign, error } = await adminDb.from("telegram_broadcast_campaigns").insert({
        source_type: sourceType,
        title: title || "DRIGHT Update",
        body,
        media_url: clean(input.media_url, 2000) || null,
        media_type: clean(input.media_type, 80) || null,
        cta_label: clean(input.cta_label, 60) || "Open DRIGHT",
        cta_url: clean(input.cta_url, 2000) || "https://dright.store",
        status: "queued",
        audience: {
          chats: input.publish_to_chats === false ? "none" : "all",
          subscribers: input.publish_to_subscribers === false ? [] : [audience],
        },
        idempotency_key: clean(input.idempotency_key, 240) || null,
        created_by: user.id,
      }).select("*").single();
      if (error) throw error;
      return json({ success: true, campaign, worker: await runWorker() });
    }

    if (action === "process_queue") {
      return json({ success: true, worker: await runWorker() });
    }

    return json({ success: false, error: "Unknown action" }, 400);
  } catch (error) {
    const code = error instanceof Error ? clean(error.message, 180) : "REQUEST_FAILED";
    console.error("[broadcast-admin]", action, code);
    return json({ success: false, error: code }, 400);
  }
});
