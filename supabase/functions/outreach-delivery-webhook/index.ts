import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";
const db = createClient(supabaseUrl, serviceRoleKey, { auth:{persistSession:false,autoRefreshToken:false} });
const resend = new Resend(resendApiKey);

async function suppress(email:string, reason:string, providerEvent:string) {
  const normalized = email.trim().toLowerCase();
  const { data: existing } = await db.from("marketing_email_suppressions")
    .select("id").eq("recipient_email",normalized).maybeSingle();
  if (existing?.id) {
    await db.from("marketing_email_suppressions").update({
      unsubscribed_at:new Date().toISOString(),
      suppression_reason:reason,
      provider_event:providerEvent,
      updated_at:new Date().toISOString(),
    }).eq("id",existing.id);
  } else {
    await db.from("marketing_email_suppressions").insert({
      recipient_email:normalized,
      unsubscribed_at:new Date().toISOString(),
      source:"resend_delivery_event",
      suppression_reason:reason,
      provider_event:providerEvent,
    });
  }
}

Deno.serve(async (req:Request) => {
  if (req.method !== "POST") return new Response("Method not allowed",{status:405});
  try {
    const payload = await req.text();
    const { data: config } = await db.from("outreach_delivery_webhook_config")
      .select("signing_secret,enabled").eq("singleton",true).single();
    if (!config?.enabled || !config?.signing_secret) {
      return new Response(JSON.stringify({error:"Webhook is not configured"}),{status:503,headers:{"Content-Type":"application/json"}});
    }

    const event:any = await resend.webhooks.verify({
      payload,
      headers:{
        id:req.headers.get("svix-id") || "",
        timestamp:req.headers.get("svix-timestamp") || "",
        signature:req.headers.get("svix-signature") || "",
      },
      webhookSecret:config.signing_secret,
    });

    const type = String(event?.type || "");
    const data = event?.data || {};
    const emailId = String(data?.email_id || "");
    const recipient = Array.isArray(data?.to) ? String(data.to[0] || "").toLowerCase() : "";
    if (!emailId || !recipient) {
      return new Response(JSON.stringify({ok:true,ignored:"missing_email_or_recipient"}),{headers:{"Content-Type":"application/json"}});
    }

    const { data: outbox } = await db.from("notification_email_outbox")
      .select("id,campaign_id,campaign_recipient_id,recipient_email,metadata")
      .eq("provider_message_id",emailId)
      .maybeSingle();

    if (!outbox) {
      return new Response(JSON.stringify({ok:true,ignored:"email_not_from_outreach"}),{headers:{"Content-Type":"application/json"}});
    }

    const now = new Date().toISOString();
    const campaignId = outbox.campaign_id || (typeof outbox.metadata?.campaign_id === "string" ? outbox.metadata.campaign_id : null);
    const recipientId = outbox.campaign_recipient_id || (typeof outbox.metadata?.campaign_recipient_id === "string" ? outbox.metadata.campaign_recipient_id : null);
    const prospectId = typeof outbox.metadata?.prospect_id === "string" ? outbox.metadata.prospect_id : null;

    if (type === "email.delivered") {
      if (recipientId) await db.from("outreach_campaign_recipients").update({
        delivered_at:now,updated_at:now,
      }).eq("id",recipientId);
    }

    if (type === "email.bounced") {
      const bounceType = String(data?.bounce?.type || "").toLowerCase();
      const permanent = bounceType === "permanent" || bounceType === "suppressed";
      if (recipientId) await db.from("outreach_campaign_recipients").update({
        bounced_at:now,
        status: permanent ? "failed" : "sent",
        last_error:String(data?.bounce?.message || "Email bounced").slice(0,1000),
        updated_at:now,
      }).eq("id",recipientId);
      if (permanent) {
        await suppress(recipient,"hard_bounce","email.bounced");
        if (prospectId) await db.from("outreach_prospects").update({
          verification_status:"bounced",qualification_status:"invalid",updated_at:now,
        }).eq("id",prospectId);
      }
    }

    if (type === "email.complained") {
      if (recipientId) await db.from("outreach_campaign_recipients").update({
        complained_at:now,status:"unsubscribed",updated_at:now,
      }).eq("id",recipientId);
      await suppress(recipient,"spam_complaint","email.complained");
      if (prospectId) await db.from("outreach_prospects").update({
        qualification_status:"unsubscribed",updated_at:now,
      }).eq("id",prospectId);
    }

    if (type === "email.failed" || type === "email.suppressed") {
      if (recipientId) await db.from("outreach_campaign_recipients").update({
        status:type === "email.suppressed" ? "skipped" : "failed",
        last_error:String(data?.error?.message || data?.reason || type).slice(0,1000),
        updated_at:now,
      }).eq("id",recipientId);
    }

    if (campaignId) await db.rpc("recount_outreach_campaign",{p_campaign_id:campaignId});

    return new Response(JSON.stringify({ok:true,type}),{
      headers:{"Content-Type":"application/json","Cache-Control":"no-store"},
    });
  } catch (error) {
    return new Response(JSON.stringify({ok:false,error:error instanceof Error?error.message:"delivery webhook error"}),{
      status:400,headers:{"Content-Type":"application/json"},
    });
  }
});