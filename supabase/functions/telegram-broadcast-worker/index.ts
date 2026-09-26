import { createClient } from "npm:@supabase/supabase-js@2.110.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const BOT_TOKEN = Deno.env.get("TELEGRAM_BROADCAST_BOT_TOKEN") || "";

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const clean = (value: unknown, max = 4000) =>
  String(value ?? "").replace(/\0/g, "").trim().slice(0, max);

const escapeHtml = (value: unknown) =>
  clean(value, 4000).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const workerSecret = () => sha256Hex(`dright-broadcast-worker-v1:${BOT_TOKEN}`);

async function telegram(method: string, payload: Record<string, unknown>) {
  if (!BOT_TOKEN) throw new Error("BOT_TOKEN_MISSING");
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

function destinationUrl(value: unknown) {
  const raw = clean(value, 1000);
  if (!raw) return "https://dright.store";
  if (/^https:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/")) return `https://dright.store${raw}`;
  return "https://dright.store";
}

async function promotionTrackingUrl(
  campaign: any,
  asset: any,
  destination: { type: "chat" | "subscriber"; id: string },
) {
  const promotionId = clean(campaign?.payload?.promotion_campaign_id || campaign?.source_id, 100);
  const campaignAssetId = clean(asset?.campaign_asset_id, 100);
  const listingId = clean(asset?.asset_id, 100);
  const target = destinationUrl(asset?.destination);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuid.test(promotionId) || !uuid.test(campaignAssetId) || !uuid.test(listingId)) return target;

  const { data, error } = await db.from("promotion_tracking_links").upsert({
    campaign_id: promotionId,
    campaign_asset_id: campaignAssetId,
    listing_id: listingId,
    placement_code: "external_platforms",
    destination_url: target,
    destination_type: `telegram_${destination.type}`,
    destination_id: destination.id,
  }, {
    onConflict: "campaign_id,campaign_asset_id,placement_code,destination_type,destination_id",
  }).select("token").single();

  if (error || !data?.token) {
    console.error("[broadcast-worker] tracking link failed", error?.message || "token missing");
    return target;
  }

  return `https://dright.store/r/${data.token}`;
}

async function sendPromotion(destination: { type: "chat" | "subscriber"; id: string }, campaign: any) {
  const chatId = destination.id;
  const assets = Array.isArray(campaign?.payload?.assets) ? campaign.payload.assets.slice(0, 10) : [];
  const messageIds: string[] = [];

  if (!assets.length) {
    const sent = await telegram("sendMessage", {
      chat_id: chatId,
      parse_mode: "HTML",
      disable_web_page_preview: false,
      text: "<b>Sponsored · DRIGHT</b>\n\nA promoted listing is now available on DRIGHT.",
      reply_markup: { inline_keyboard: [[{ text: "Open DRIGHT", url: "https://dright.store" }]] },
    });
    if (sent?.message_id) messageIds.push(String(sent.message_id));
    return messageIds;
  }

  for (const asset of assets) {
    const title = escapeHtml(asset?.title || "Promoted on DRIGHT");
    const assetType = escapeHtml(asset?.asset_type || "listing");
    const url = await promotionTrackingUrl(campaign, asset, destination);
    const photo = clean(asset?.image_url, 2000);
    const caption = `<b>Sponsored · DRIGHT</b>\n<b>${title}</b>\n${assetType.charAt(0).toUpperCase() + assetType.slice(1)}`;

    let sent: any = null;
    if (photo && /^https:\/\//i.test(photo)) {
      try {
        sent = await telegram("sendPhoto", {
          chat_id: chatId,
          photo,
          caption,
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: [[{ text: "View on DRIGHT", url }]] },
        });
      } catch (error) {
        if (error instanceof Error && error.message === "TELEGRAM_403") throw error;
      }
    }

    if (!sent) {
      sent = await telegram("sendMessage", {
        chat_id: chatId,
        text: caption,
        parse_mode: "HTML",
        disable_web_page_preview: false,
        reply_markup: { inline_keyboard: [[{ text: "View on DRIGHT", url }]] },
      });
    }
    if (sent?.message_id) messageIds.push(String(sent.message_id));
  }

  return messageIds;
}

async function sendGeneric(chatId: string, campaign: any) {
  const title = escapeHtml(campaign.title || "DRIGHT Update");
  const body = escapeHtml(campaign.body || "");
  const ctaUrl = destinationUrl(campaign.cta_url);
  const ctaLabel = clean(campaign.cta_label, 60) || "Open DRIGHT";
  const text = `<b>${title}</b>${body ? `\n\n${body}` : ""}`;
  const media = clean(campaign.media_url, 2000);
  let sent: any = null;

  if (media && /^https:\/\//i.test(media)) {
    try {
      if (String(campaign.media_type || "").startsWith("video")) {
        sent = await telegram("sendVideo", {
          chat_id: chatId,
          video: media,
          caption: text.slice(0, 1000),
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: [[{ text: ctaLabel, url: ctaUrl }]] },
        });
      } else {
        sent = await telegram("sendPhoto", {
          chat_id: chatId,
          photo: media,
          caption: text.slice(0, 1000),
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: [[{ text: ctaLabel, url: ctaUrl }]] },
        });
      }
    } catch (error) {
      if (error instanceof Error && error.message === "TELEGRAM_403") throw error;
    }
  }

  if (!sent) {
    sent = await telegram("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: false,
      reply_markup: { inline_keyboard: [[{ text: ctaLabel, url: ctaUrl }]] },
    });
  }

  return sent?.message_id ? [String(sent.message_id)] : [];
}

async function destinations(campaign: any) {
  const result: Array<{ type: "chat" | "subscriber"; id: string }> = [];
  const audience = campaign?.audience || {};
  const { data: settings } = await db.from("telegram_broadcast_settings")
    .select("private_broadcasts_enabled,news_broadcasts_enabled,promotion_broadcasts_enabled,recommendation_broadcasts_enabled")
    .eq("singleton", true)
    .maybeSingle();

  if (campaign?.source_type === "promotion" && settings?.promotion_broadcasts_enabled === false) return result;
  if (campaign?.source_type === "news" && settings?.news_broadcasts_enabled === false) return result;
  if (campaign?.source_type === "recommendation" && settings?.recommendation_broadcasts_enabled === false) return result;

  if (audience.chats === "all") {
    const { data } = await db.from("telegram_broadcast_chats")
      .select("chat_id")
      .in("chat_type", ["group", "supergroup", "channel"])
      .eq("is_active", true)
      .eq("publish_enabled", true);
    for (const row of data || []) result.push({ type: "chat", id: String(row.chat_id) });
  }

  const subscriptions = Array.isArray(audience.subscribers) ? audience.subscribers.map(String) : [];
  if (subscriptions.length && settings?.private_broadcasts_enabled !== false) {
    let query = db.from("telegram_broadcast_subscribers")
      .select("telegram_user_id,private_chat_id")
      .eq("is_active", true);

    if (subscriptions.includes("promotions")) query = query.eq("subscribed_promotions", true);
    else if (subscriptions.includes("news")) query = query.eq("subscribed_news", true);
    else if (subscriptions.includes("recommendations")) query = query.eq("subscribed_recommendations", true);

    const { data } = await query;
    for (const row of data || []) result.push({ type: "subscriber", id: String(row.private_chat_id) });
  }

  return result;
}

async function deliver(campaign: any, destination: { type: "chat" | "subscriber"; id: string }) {
  const { data: existing } = await db.from("telegram_broadcast_deliveries")
    .select("id,status,attempt_count")
    .eq("campaign_id", campaign.id)
    .eq("destination_type", destination.type)
    .eq("destination_id", destination.id)
    .maybeSingle();

  if (existing?.status === "sent") return { status: "skipped", messageIds: [] as string[] };
  if (Number(existing?.attempt_count || 0) >= 3) return { status: "skipped", messageIds: [] as string[] };

  const { data: delivery } = await db.from("telegram_broadcast_deliveries").upsert({
    campaign_id: campaign.id,
    destination_type: destination.type,
    destination_id: destination.id,
    status: "queued",
    attempt_count: Number(existing?.attempt_count || 0) + 1,
    error_code: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "campaign_id,destination_type,destination_id" }).select("id").single();

  try {
    const messageIds = campaign.source_type === "promotion"
      ? await sendPromotion(destination, campaign)
      : await sendGeneric(destination.id, campaign);

    await db.from("telegram_broadcast_deliveries").update({
      status: "sent",
      telegram_message_id: messageIds.at(-1) || null,
      delivered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: { message_ids: messageIds },
    }).eq("id", delivery?.id);

    return { status: "sent", messageIds };
  } catch (error) {
    const code = error instanceof Error ? clean(error.message, 120) : "DELIVERY_FAILED";
    await db.from("telegram_broadcast_deliveries").update({
      status: "failed",
      error_code: code,
      updated_at: new Date().toISOString(),
    }).eq("id", delivery?.id);

    if (destination.type === "subscriber" && code === "TELEGRAM_403") {
      await db.from("telegram_broadcast_subscribers")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("private_chat_id", destination.id);
    }

    return { status: "failed", messageIds: [] as string[] };
  }
}

async function cleanupExpiredWelcomes() {
  const { data } = await db.from("telegram_broadcast_welcome_messages")
    .select("id,chat_id,message_id")
    .is("deleted_at", null)
    .lt("expires_at", new Date().toISOString())
    .limit(100);

  let deleted = 0;
  for (const row of data || []) {
    try {
      await telegram("deleteMessage", { chat_id: row.chat_id, message_id: Number(row.message_id) });
    } catch {}
    await db.from("telegram_broadcast_welcome_messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", row.id);
    deleted++;
  }
  return deleted;
}

async function processCampaign(campaign: any) {
  const targets = await destinations(campaign);

  if (targets.length === 0) {
    await db.from("telegram_broadcast_campaigns").update({
      status: "queued",
      updated_at: new Date().toISOString(),
      stats: { destinations: 0, sent: 0, failed: 0, skipped: 0, messages: 0 },
      error_code: "NO_ACTIVE_DESTINATIONS",
    }).eq("id", campaign.id);
    return { id: campaign.id, status: "queued", destinations: 0, sent: 0, failed: 0, skipped: 0, messages: 0 };
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let messages = 0;

  for (const destination of targets) {
    const result = await deliver(campaign, destination);
    if (result.status === "sent") sent++;
    else if (result.status === "failed") failed++;
    else skipped++;
    messages += result.messageIds.length;
  }

  const status = failed > 0 && sent === 0 ? "failed" : failed > 0 ? "partial" : "sent";
  await db.from("telegram_broadcast_campaigns").update({
    status,
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    stats: { destinations: targets.length, sent, failed, skipped, messages },
    error_code: failed > 0 ? "ONE_OR_MORE_DELIVERIES_FAILED" : null,
  }).eq("id", campaign.id);

  return { id: campaign.id, status, destinations: targets.length, sent, failed, skipped, messages };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);
  if (!BOT_TOKEN) return json({ success: false, error: "Broadcast bot is not configured" }, 503);

  const supplied = req.headers.get("X-Dright-Broadcast-Worker-Secret") || "";
  if (!supplied || supplied !== await workerSecret()) return json({ success: false, error: "Unauthorized" }, 401);

  const expiredWelcomesDeleted = await cleanupExpiredWelcomes();
  const { data: campaigns, error } = await db.rpc("claim_telegram_broadcast_campaigns", { p_limit: 5 });
  if (error) {
    console.error("[broadcast-worker] claim failed", error.message);
    return json({ success: false, error: "Queue claim failed" }, 500);
  }

  const results = [];
  for (const campaign of campaigns || []) results.push(await processCampaign(campaign));

  return json({
    success: true,
    processed: results.length,
    expired_welcomes_deleted: expiredWelcomesDeleted,
    results,
  });
});
