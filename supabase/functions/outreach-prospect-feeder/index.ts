import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession:false, autoRefreshToken:false },
});

Deno.serve(async (req:Request) => {
  if (req.method !== "POST") return new Response("Method not allowed",{status:405});

  try {
    const {data:campaigns,error} = await db
      .from("outreach_campaigns")
      .select("id,segment,status,max_audience_size,target_count")
      .in("status",["running","scheduled"])
      .order("created_at",{ascending:true})
      .limit(25);
    if (error) throw error;

    const results:any[] = [];
    for (const campaign of campaigns || []) {
      const capacity = Math.max(0, Number(campaign.max_audience_size||0)-Number(campaign.target_count||0));
      if (capacity <= 0) {
        results.push({campaign_id:campaign.id,queued:0,reason:"campaign_capacity_reached"});
        continue;
      }

      const limit = Math.min(capacity,5000);
      const {data:prospects,error:prospectError} = await db
        .from("outreach_prospects")
        .select("id,email,email_normalized,contact_name,company_name,segment,source_url,qualification_score")
        .eq("qualification_status","qualified")
        .eq("verification_status","public_verified")
        .eq("public_business_contact",true)
        .order("qualification_score",{ascending:false})
        .order("created_at",{ascending:true})
        .limit(limit);
      if (prospectError) throw prospectError;

      const candidates = (prospects || []).filter((p:any) => campaign.segment==="general" || p.segment===campaign.segment);
      let queued = 0;
      for (const p of candidates) {
        const {data:suppressed} = await db
          .from("marketing_email_suppressions")
          .select("id")
          .eq("recipient_email",p.email_normalized)
          .not("unsubscribed_at","is",null)
          .maybeSingle();
        if (suppressed?.id) continue;

        const {data:recipient,error:insertError} = await db
          .from("outreach_campaign_recipients")
          .insert({
            campaign_id:campaign.id,
            recipient_email:p.email,
            prospect_name:p.contact_name,
            company_name:p.company_name,
            role_segment:p.segment,
            status:"scheduled",
            scheduled_for:new Date().toISOString(),
            metadata:{
              source_url:p.source_url,
              prospect_id:p.id,
              qualification_score:p.qualification_score,
              acquisition_feed:true,
            },
          })
          .select("id")
          .maybeSingle();

        if (insertError) {
          if ((insertError as any).code === "23505") continue;
          throw insertError;
        }
        if (!recipient?.id) continue;

        await db.from("outreach_prospects").update({
          qualification_status:"queued",
          campaign_id:campaign.id,
          campaign_recipient_id:recipient.id,
          last_queued_at:new Date().toISOString(),
          updated_at:new Date().toISOString(),
        }).eq("id",p.id);
        queued++;
      }

      if (queued>0) await db.rpc("recount_outreach_campaign",{p_campaign_id:campaign.id});
      results.push({campaign_id:campaign.id,queued});
    }

    return new Response(JSON.stringify({ok:true,results}),{
      headers:{"Content-Type":"application/json","Cache-Control":"no-store"},
    });
  } catch (error) {
    return new Response(JSON.stringify({ok:false,error:error instanceof Error?error.message:"prospect feeder error"}),{
      status:500,headers:{"Content-Type":"application/json","Cache-Control":"no-store"},
    });
  }
});