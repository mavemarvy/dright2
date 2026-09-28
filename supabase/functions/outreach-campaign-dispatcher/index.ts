import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession:false, autoRefreshToken:false },
});

type Campaign = {
  id:string;
  name:string;
  segment:string;
  status:string;
  subject_override:string|null;
  headline_override:string|null;
  body_override:string|null;
  cta_label_override:string|null;
  cta_url_override:string|null;
  start_at:string|null;
  stop_at:string|null;
  hourly_limit:number;
  daily_limit:number;
  created_by:string|null;
};

async function dispatchCampaign(campaign: Campaign, globalHourAvailable:number, globalDayAvailable:number) {
  if (globalHourAvailable <= 0 || globalDayAvailable <= 0) return { dispatched:0 };

  const now = new Date();
  if (campaign.start_at && new Date(campaign.start_at) > now) return { dispatched:0 };
  if (campaign.stop_at && new Date(campaign.stop_at) <= now) {
    await db.from("outreach_campaigns").update({ status:"paused", updated_at:now.toISOString() }).eq("id",campaign.id);
    return { dispatched:0 };
  }

  const oneHourAgo = new Date(Date.now()-60*60_000).toISOString();
  const oneDayAgo = new Date(Date.now()-24*60*60_000).toISOString();

  const [{count:campaignHour},{count:campaignDay}] = await Promise.all([
    db.from("notification_email_outbox")
      .select("id",{count:"exact",head:true})
      .eq("campaign_id",campaign.id)
      .eq("status","sent")
      .gte("sent_at",oneHourAgo),
    db.from("notification_email_outbox")
      .select("id",{count:"exact",head:true})
      .eq("campaign_id",campaign.id)
      .eq("status","sent")
      .gte("sent_at",oneDayAgo),
  ]);

  const campaignHourAvailable = Math.max(0, Number(campaign.hourly_limit||1) - Number(campaignHour||0));
  const campaignDayAvailable = Math.max(0, Number(campaign.daily_limit||1) - Number(campaignDay||0));
  const limit = Math.max(0, Math.min(globalHourAvailable,globalDayAvailable,campaignHourAvailable,campaignDayAvailable,100));

  if (!limit) return { dispatched:0 };

  let ownerId = campaign.created_by;
  if (!ownerId) {
    const {data:admin} = await db.from("users").select("id").eq("is_admin",true).eq("admin_status","active").limit(1).maybeSingle();
    ownerId = admin?.id || null;
  }
  if (!ownerId) throw new Error("No active admin available for campaign ownership");

  const {data:template} = await db.from("outreach_email_templates")
    .select("*").eq("segment",campaign.segment).eq("enabled",true).maybeSingle();

  const {data:recipients,error:recipientError} = await db.from("outreach_campaign_recipients")
    .select("*")
    .eq("campaign_id",campaign.id)
    .eq("status","scheduled")
    .lte("scheduled_for",now.toISOString())
    .order("scheduled_for",{ascending:true})
    .order("created_at",{ascending:true})
    .limit(limit);

  if (recipientError) throw recipientError;
  if (!recipients?.length) {
    await db.rpc("recount_outreach_campaign",{p_campaign_id:campaign.id});
    return { dispatched:0 };
  }

  let dispatched = 0;
  for (const recipient of recipients) {
    const subject = campaign.subject_override || template?.subject_template || "Explore a partnership with DRIGHT";
    const message = campaign.body_override || template?.body_template || "DRIGHT is expanding its partnership network.";

    const {data:outbox,error:outboxError} = await db.from("notification_email_outbox").insert({
      user_id:ownerId,
      recipient_email:recipient.recipient_email,
      notification_type:"marketing_outreach_campaign",
      category:"outreach",
      priority:"normal",
      subject,
      message,
      campaign_id:campaign.id,
      campaign_recipient_id:recipient.id,
      metadata:{
        marketing_email:true,
        event_type:"marketing_outreach_campaign",
        segment:recipient.role_segment || campaign.segment,
        prospect_name:recipient.prospect_name,
        company_name:recipient.company_name,
        headline:campaign.headline_override || undefined,
        body:campaign.body_override || undefined,
        cta_label:campaign.cta_label_override || undefined,
        action_url:campaign.cta_url_override || template?.cta_url || "https://www.dright.store/sign-up",
        campaign_id:campaign.id,
        campaign_recipient_id:recipient.id,
        campaign_name:campaign.name,
        prospect_id:typeof recipient.metadata?.prospect_id === "string" ? recipient.metadata.prospect_id : undefined,
      },
    }).select("id").single();

    if (outboxError) {
      await db.from("outreach_campaign_recipients").update({
        attempts:Number(recipient.attempts||0)+1,
        last_error:outboxError.message.slice(0,1000),
        updated_at:new Date().toISOString(),
      }).eq("id",recipient.id);
      continue;
    }

    await db.from("outreach_campaign_recipients").update({
      status:"queued",
      outbox_id:outbox.id,
      attempts:Number(recipient.attempts||0)+1,
      last_error:null,
      updated_at:new Date().toISOString(),
    }).eq("id",recipient.id);
    dispatched++;
  }

  await db.from("outreach_campaigns").update({
    status:"running",
    last_dispatch_at:new Date().toISOString(),
    updated_at:new Date().toISOString(),
  }).eq("id",campaign.id);
  await db.rpc("recount_outreach_campaign",{p_campaign_id:campaign.id});

  return { dispatched };
}

Deno.serve(async (req:Request) => {
  if (req.method !== "POST") return new Response("Method not allowed",{status:405});

  try {
    const {data:settings,error:settingsError} = await db.from("email_delivery_settings")
      .select("marketing_send_enabled,marketing_domain_verified,marketing_hourly_cap,marketing_daily_cap")
      .eq("singleton",true).single();
    if (settingsError || !settings) throw settingsError || new Error("Email settings unavailable");

    if (!settings.marketing_send_enabled || !settings.marketing_domain_verified) {
      return new Response(JSON.stringify({ok:true,dispatched:0,reason:"marketing_paused"}),{headers:{"Content-Type":"application/json"}});
    }

    const oneHourAgo = new Date(Date.now()-60*60_000).toISOString();
    const oneDayAgo = new Date(Date.now()-24*60*60_000).toISOString();
    const [{count:hourSent},{count:daySent}] = await Promise.all([
      db.from("notification_email_outbox").select("id",{count:"exact",head:true})
        .eq("status","sent").in("category",["outreach","promotions"]).gte("sent_at",oneHourAgo),
      db.from("notification_email_outbox").select("id",{count:"exact",head:true})
        .eq("status","sent").in("category",["outreach","promotions"]).gte("sent_at",oneDayAgo),
    ]);

    let hourAvailable = Math.max(0,Number(settings.marketing_hourly_cap||1)-Number(hourSent||0));
    let dayAvailable = Math.max(0,Number(settings.marketing_daily_cap||1)-Number(daySent||0));

    if (hourAvailable<=0 || dayAvailable<=0) {
      return new Response(JSON.stringify({ok:true,dispatched:0,reason:"global_warmup_cap"}),{headers:{"Content-Type":"application/json"}});
    }

    const {data:campaigns,error:campaignError} = await db.from("outreach_campaigns")
      .select("id,name,segment,status,subject_override,headline_override,body_override,cta_label_override,cta_url_override,start_at,stop_at,hourly_limit,daily_limit,created_by")
      .in("status",["scheduled","running"])
      .or(`start_at.is.null,start_at.lte.${new Date().toISOString()}`)
      .order("created_at",{ascending:true})
      .limit(25);
    if (campaignError) throw campaignError;

    let total = 0;
    const details:any[] = [];
    for (const campaign of campaigns || []) {
      if (hourAvailable<=0 || dayAvailable<=0) break;
      const result = await dispatchCampaign(campaign as Campaign,hourAvailable,dayAvailable);
      total += result.dispatched;
      hourAvailable -= result.dispatched;
      dayAvailable -= result.dispatched;
      details.push({campaign_id:campaign.id,dispatched:result.dispatched});
    }

    return new Response(JSON.stringify({ok:true,dispatched:total,details}),{
      headers:{"Content-Type":"application/json","Cache-Control":"no-store"},
    });
  } catch (error) {
    return new Response(JSON.stringify({ok:false,error:error instanceof Error?error.message:"dispatcher error"}),{
      status:500,headers:{"Content-Type":"application/json","Cache-Control":"no-store"},
    });
  }
});