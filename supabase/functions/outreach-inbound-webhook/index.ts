import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";

const db = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const resend = new Resend(resendApiKey);

function extractAddress(value: string): { name: string | null; email: string } {
  const raw = String(value || "").trim();
  const match = raw.match(/^(.*?)<([^>]+)>$/);
  if (match) {
    return {
      name: match[1].trim().replace(/^["']|["']$/g, "") || null,
      email: match[2].trim().toLowerCase(),
    };
  }
  return { name: null, email: raw.toLowerCase() };
}

function stripHtml(value: string): string {
  return String(value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderTemplate(template: string | null, vars: Record<string, string>): string {
  let out = String(template || "");
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  return out;
}

function looksAutomated(email: string, subject: string, headers: Record<string, string> | undefined): boolean {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers || {}).map(([k, v]) => [k.toLowerCase(), String(v).toLowerCase()])
  );
  const autoSubmitted = normalizedHeaders["auto-submitted"];
  const precedence = normalizedHeaders["precedence"];
  const xAuto = normalizedHeaders["x-auto-response-suppress"];
  const s = subject.toLowerCase();
  const from = email.toLowerCase();

  return Boolean(
    (autoSubmitted && autoSubmitted !== "no") ||
    (precedence && ["bulk", "junk", "list"].includes(precedence)) ||
    (xAuto && xAuto !== "none") ||
    from.includes("mailer-daemon") ||
    from.startsWith("postmaster@") ||
    /(^|\b)(out of office|automatic reply|auto reply|autoreply|delivery status notification|undeliverable)(\b|:)/i.test(s)
  );
}

function ruleMatches(rule: any, haystack: string): boolean {
  const words = Array.isArray(rule.keywords) ? rule.keywords.map((x: unknown) => String(x).toLowerCase()) : [];
  const text = haystack.toLowerCase();
  if (rule.trigger_type === "always") return true;
  if (rule.trigger_type === "contains_all") return words.length > 0 && words.every((w: string) => text.includes(w));
  if (rule.trigger_type === "regex") {
    return words.some((w: string) => {
      try { return new RegExp(w, "i").test(haystack); } catch { return false; }
    });
  }
  return words.length > 0 && words.some((w: string) => text.includes(w));
}

function autoReplyHtml(body: string, logoUrl: string, signupUrl: string): string {
  const safeBody = escapeHtml(body).replace(/\n/g, "<br>");
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#18202b">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0">A reply from DRIGHT Partnerships.</div>
    <div style="max-width:620px;margin:0 auto;padding:28px 14px">
      <div style="background:#ffffff;border:1px solid #e6eaf0;border-radius:22px;overflow:hidden">
        <div style="padding:22px 24px;background:#0b0d11">
          <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
            <tr>
              <td style="vertical-align:middle">
                <img src="${escapeHtml(logoUrl)}" alt="DRIGHT" width="46" height="46" style="display:block;border-radius:12px;object-fit:contain">
              </td>
              <td style="padding-left:12px;vertical-align:middle;color:#ffffff">
                <div style="font-size:18px;font-weight:800;letter-spacing:.08em">DRIGHT</div>
                <div style="font-size:11px;color:#aab3c2;margin-top:3px">PARTNERSHIPS</div>
              </td>
            </tr>
          </table>
        </div>
        <div style="padding:30px 26px">
          <div style="font-size:15px;line-height:1.7;color:#3e4a5d">${safeBody}</div>
          <div style="margin-top:24px;padding-top:18px;border-top:1px solid #eef1f5">
            <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.6">You can reply directly to this email and the DRIGHT Partnerships inbox will receive it.</p>
            <p style="margin:8px 0 0;font-size:12px"><a href="${escapeHtml(signupUrl)}" style="color:#2563eb;text-decoration:none">www.dright.store</a></p>
          </div>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

async function upsertSuppression(email: string) {
  const normalized = email.trim().toLowerCase();
  const { data: existing } = await db
    .from("marketing_email_suppressions")
    .select("id")
    .eq("recipient_email", normalized)
    .maybeSingle();

  if (existing?.id) {
    await db.from("marketing_email_suppressions").update({
      unsubscribed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      source: "inbound_unsubscribe",
    }).eq("id", existing.id);
  } else {
    await db.from("marketing_email_suppressions").insert({
      recipient_email: normalized,
      unsubscribed_at: new Date().toISOString(),
      source: "inbound_unsubscribe",
    });
  }
}

async function processInbound(event: any) {
  const eventData = event?.data || {};
  const emailId = String(eventData.email_id || "");
  if (!emailId) return { ignored: true, reason: "missing_email_id" };

  const { data: fullEmail, error: getError } = await resend.emails.receiving.get(emailId);
  if (getError || !fullEmail) throw new Error(`Could not retrieve received email: ${JSON.stringify(getError || {})}`);

  const toList = Array.isArray(fullEmail.to) ? fullEmail.to.map((v: string) => v.toLowerCase()) : [];
  const receivedFor = Array.isArray((fullEmail as any).received_for)
    ? (fullEmail as any).received_for.map((v: string) => String(v).toLowerCase())
    : [];
  const targetAddresses = [...toList, ...receivedFor];
  if (!targetAddresses.some((v: string) => v.includes("partnerships@dright.store"))) {
    return { ignored: true, reason: "not_partnerships_inbox" };
  }

  const sender = extractAddress(String(fullEmail.from || eventData.from || ""));
  if (!sender.email || sender.email.endsWith("@dright.store") || sender.email.endsWith("@mail.dright.store")) {
    return { ignored: true, reason: "own_domain_or_missing_sender" };
  }

  const subject = String(fullEmail.subject || eventData.subject || "(no subject)");
  const textBody = String((fullEmail as any).text || "").trim();
  const htmlBody = String((fullEmail as any).html || "").trim();
  const matchingBody = textBody || stripHtml(htmlBody);
  const messageId = String((fullEmail as any).message_id || eventData.message_id || "");
  const headers = ((fullEmail as any).headers || {}) as Record<string, string>;
  const automated = looksAutomated(sender.email, subject, headers);
  const now = new Date().toISOString();

  const { data: lastOutreach } = await db
    .from("notification_email_outbox")
    .select("subject,metadata,sent_at,campaign_id,campaign_recipient_id")
    .eq("recipient_email", sender.email)
    .eq("status", "sent")
    .in("category", ["outreach", "promotions"])
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const outreachMeta = (lastOutreach?.metadata && typeof lastOutreach.metadata === "object")
    ? lastOutreach.metadata as Record<string, unknown>
    : {};
  const inferredSegment = typeof outreachMeta.segment === "string" ? String(outreachMeta.segment) : "general";
  const inferredCompany = typeof outreachMeta.company_name === "string" ? String(outreachMeta.company_name) : null;
  const inferredName = typeof outreachMeta.prospect_name === "string" ? String(outreachMeta.prospect_name) : sender.name;

  let { data: conversation } = await db
    .from("outreach_conversations")
    .select("*")
    .ilike("prospect_email", sender.email)
    .maybeSingle();

  if (!conversation) {
    const { data: created, error: createError } = await db
      .from("outreach_conversations")
      .insert({
        prospect_email: sender.email,
        prospect_name: inferredName,
        company_name: inferredCompany,
        role_segment: inferredSegment,
        status: automated ? "archived" : "new",
        subject,
        unread_count: 1,
        last_message_at: now,
        last_inbound_at: now,
        metadata: {
          first_inbound_email_id: emailId,
          original_outreach_subject: lastOutreach?.subject || null,
        },
      })
      .select("*")
      .single();
    if (createError) throw createError;
    conversation = created;
  } else {
    const { data: updated, error: updateError } = await db
      .from("outreach_conversations")
      .update({
        prospect_name: conversation.prospect_name || inferredName,
        company_name: conversation.company_name || inferredCompany,
        role_segment: conversation.role_segment === "general" ? inferredSegment : conversation.role_segment,
        subject: conversation.subject || subject,
        status: automated ? "archived" : (conversation.status === "archived" ? "new" : conversation.status),
        unread_count: Number(conversation.unread_count || 0) + 1,
        last_message_at: now,
        last_inbound_at: now,
        updated_at: now,
      })
      .eq("id", conversation.id)
      .select("*")
      .single();
    if (updateError) throw updateError;
    conversation = updated;
  }

  const { data: priorMessage } = await db
    .from("outreach_messages")
    .select("id")
    .eq("provider", "resend")
    .eq("provider_message_id", emailId)
    .maybeSingle();

  if (priorMessage?.id) return { duplicate: true, conversation_id: conversation.id };

  await db.from("outreach_messages").insert({
    conversation_id: conversation.id,
    direction: "inbound",
    provider: "resend",
    provider_message_id: emailId,
    internet_message_id: messageId || null,
    in_reply_to: headers["in-reply-to"] || headers["In-Reply-To"] || null,
    from_email: sender.email,
    to_email: "partnerships@dright.store",
    subject,
    text_body: matchingBody,
    html_body: htmlBody || null,
    auto_generated: automated,
    delivery_status: "received",
    metadata: {
      sender_name: sender.name,
      cc: (fullEmail as any).cc || [],
      bcc: (fullEmail as any).bcc || [],
      attachments: (fullEmail as any).attachments || [],
      automated,
    },
  });

  if (!automated && lastOutreach?.campaign_recipient_id) {
    await db.from("outreach_campaign_recipients").update({
      status: "replied",
      updated_at: now,
    }).eq("id", lastOutreach.campaign_recipient_id);

    const prospectId = typeof outreachMeta.prospect_id === "string"
      ? String(outreachMeta.prospect_id)
      : null;
    if (prospectId) {
      await db.from("outreach_prospects").update({
        qualification_status: "replied",
        updated_at: now,
      }).eq("id", prospectId);
    }

    if (lastOutreach.campaign_id) {
      await db.rpc("recount_outreach_campaign", { p_campaign_id: lastOutreach.campaign_id });
    }
  }

  if (automated) {
    return { stored: true, conversation_id: conversation.id, auto_reply: false, reason: "automated_sender" };
  }

  const { data: settings } = await db
    .from("outreach_settings")
    .select("*")
    .eq("singleton", true)
    .single();

  const { data: rules } = await db
    .from("outreach_auto_reply_rules")
    .select("*")
    .eq("enabled", true)
    .order("priority", { ascending: true });

  const haystack = `${subject}\n${matchingBody}`;
  let matchedRule: any = null;
  for (const rule of rules || []) {
    if (rule.segment && rule.segment !== conversation.role_segment) continue;
    if (settings?.safe_auto_reply_only && !rule.safe_for_automatic) continue;
    if (ruleMatches(rule, haystack)) {
      matchedRule = rule;
      break;
    }
  }

  if (!matchedRule) {
    await db.from("outreach_conversations").update({
      status: conversation.status === "new" ? "needs_reply" : conversation.status,
      updated_at: now,
    }).eq("id", conversation.id);
    return { stored: true, conversation_id: conversation.id, auto_reply: false, reason: "no_rule" };
  }

  if (matchedRule.set_status) {
    await db.from("outreach_conversations").update({
      status: matchedRule.set_status,
      updated_at: now,
    }).eq("id", conversation.id);
  }

  if (matchedRule.set_status === "unsubscribed") {
    await upsertSuppression(sender.email);
  }

  if (!matchedRule.send_reply || !settings?.auto_reply_enabled || !conversation.auto_reply_enabled) {
    return { stored: true, conversation_id: conversation.id, rule: matchedRule.name, auto_reply: false };
  }

  const startOfWindow = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const { count: dailyAutoCount } = await db
    .from("outreach_messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversation.id)
    .eq("direction", "outbound")
    .eq("auto_generated", true)
    .gte("created_at", startOfWindow);

  if ((dailyAutoCount || 0) >= Number(settings.max_auto_replies_per_conversation_per_day || 0)) {
    return { stored: true, conversation_id: conversation.id, rule: matchedRule.name, auto_reply: false, reason: "daily_cap" };
  }

  const { count: ruleReplyCount } = await db
    .from("outreach_messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversation.id)
    .eq("direction", "outbound")
    .eq("auto_generated", true)
    .eq("auto_reply_rule_id", matchedRule.id);

  if ((ruleReplyCount || 0) >= Number(matchedRule.max_replies_per_conversation || 0)) {
    return { stored: true, conversation_id: conversation.id, rule: matchedRule.name, auto_reply: false, reason: "rule_cap" };
  }

  if (conversation.last_auto_reply_at && Number(matchedRule.cooldown_hours || 0) > 0) {
    const cooldownMs = Number(matchedRule.cooldown_hours) * 60 * 60_000;
    if (Date.now() - new Date(conversation.last_auto_reply_at).getTime() < cooldownMs) {
      return { stored: true, conversation_id: conversation.id, rule: matchedRule.name, auto_reply: false, reason: "cooldown" };
    }
  }

  const vars = {
    subject,
    name: conversation.prospect_name || sender.name || "there",
    company: conversation.company_name || "",
    segment: conversation.role_segment || "general",
  };
  const replySubject = renderTemplate(matchedRule.reply_subject_template || "Re: {{subject}}", vars);
  const replyBody = renderTemplate(matchedRule.reply_body_template || "", vars).trim();
  if (!replyBody) return { stored: true, conversation_id: conversation.id, auto_reply: false, reason: "empty_reply" };

  const replyResult = await resend.emails.send({
    from: `${settings.reply_from_name} <${settings.reply_from_email}>`,
    to: [sender.email],
    replyTo: settings.reply_to_email,
    subject: replySubject,
    text: replyBody,
    html: autoReplyHtml(replyBody, settings.logo_url, settings.signup_url),
    headers: {
      ...(messageId ? { "In-Reply-To": messageId, "References": messageId } : {}),
      "X-DRIGHT-Auto-Reply": "safe-rule-engine",
    },
  });

  if (replyResult.error) throw new Error(`Auto reply failed: ${JSON.stringify(replyResult.error)}`);

  const sentId = String(replyResult.data?.id || "");
  const sentAt = new Date().toISOString();

  await db.from("outreach_messages").insert({
    conversation_id: conversation.id,
    direction: "outbound",
    provider: "resend",
    provider_message_id: sentId || null,
    in_reply_to: messageId || null,
    from_email: settings.reply_from_email,
    to_email: sender.email,
    subject: replySubject,
    text_body: replyBody,
    html_body: autoReplyHtml(replyBody, settings.logo_url, settings.signup_url),
    auto_generated: true,
    auto_reply_rule_id: matchedRule.id,
    delivery_status: "sent",
    metadata: { rule_name: matchedRule.name },
    created_at: sentAt,
  });

  await db.from("outreach_conversations").update({
    auto_replies_sent: Number(conversation.auto_replies_sent || 0) + 1,
    last_auto_reply_at: sentAt,
    last_outbound_at: sentAt,
    last_message_at: sentAt,
    updated_at: sentAt,
  }).eq("id", conversation.id);

  return { stored: true, conversation_id: conversation.id, rule: matchedRule.name, auto_reply: true, message_id: sentId };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const payload = await req.text();
    const { data: config } = await db
      .from("outreach_webhook_config")
      .select("signing_secret,enabled")
      .eq("singleton", true)
      .single();

    if (!config?.enabled || !config?.signing_secret) {
      return new Response(JSON.stringify({ error: "Webhook is not configured" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }

    const event = await resend.webhooks.verify({
      payload,
      headers: {
        id: req.headers.get("svix-id") || "",
        timestamp: req.headers.get("svix-timestamp") || "",
        signature: req.headers.get("svix-signature") || "",
      },
      webhookSecret: config.signing_secret,
    }) as any;

    if (event?.type !== "email.received") {
      return new Response(JSON.stringify({ ok: true, ignored: event?.type || "unknown" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const result = await processInbound(event);
    return new Response(JSON.stringify({ ok: true, result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : "Webhook error",
    }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
});