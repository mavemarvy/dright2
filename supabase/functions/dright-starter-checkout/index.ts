import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const PAYSTACK_SECRET = Deno.env.get("PAYSTACK_SECRET_KEY") || "";
const db = createClient(URL, SERVICE_ROLE);
const PAYSTACK_BASE = "https://api.paystack.co";

function safeText(value: unknown, max = 500): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 320;
}

async function verifyTurnstile(token: string) {
  const secret =
    Deno.env.get("TURNSTILE_SECRET") ||
    Deno.env.get("TURNSTILE_SECRET_KEY") ||
    Deno.env.get("CLOUDFLARE_TURNSTILE_SECRET") ||
    Deno.env.get("CLOUDFLARE_TURNSTILE_SECRET_KEY") ||
    "";
  if (!secret) return { ok: false, status: 503, error: "Security verification is not configured" };
  if (!token) return { ok: false, status: 400, error: "Complete the security verification" };

  const form = new URLSearchParams({ secret, response: token });
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const result = await response.json().catch(() => ({}));
  const errorCodes = Array.isArray(result?.["error-codes"]) ? result["error-codes"] : [];

  await db.from("turnstile_verifications").insert({
    user_id: null,
    action: "dright_starter_checkout",
    success: Boolean(result?.success),
    error_codes: errorCodes.length ? errorCodes : null,
    verified_at: new Date().toISOString(),
  }).catch(() => undefined);

  if (!response.ok || !result?.success) {
    return { ok: false, status: 403, error: "Security verification failed. Refresh the challenge and try again." };
  }
  if (result.action && result.action !== "dright_starter_checkout") {
    return { ok: false, status: 403, error: "Security verification action mismatch" };
  }
  return { ok: true, status: 200, error: "" };
}

async function authenticatedUser(req: Request) {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  return data.user;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    if (!URL || !SERVICE_ROLE) return json({ error: "Starter checkout is not configured" }, 503);

    const signedInUser = await authenticatedUser(req);
    if (signedInUser) {
      return json({ error: "DRIGHT Starter Access is only available to new guest users." }, 409);
    }

    const body = await req.json().catch(() => ({}));
    const security = await verifyTurnstile(safeText(body.turnstile_token, 4096));
    if (!security.ok) return json({ error: security.error }, security.status);

    const buyerEmail = safeText(body.buyer_email, 320).toLowerCase();
    const buyerName = safeText(body.buyer_name, 120);
    if (!buyerName || !validEmail(buyerEmail)) {
      return json({ error: "Your name and a valid email address are required." }, 400);
    }

    const [{ data: store }, { data: product }] = await Promise.all([
      db.from("dright_official_store_settings").select("*").eq("singleton", true).maybeSingle(),
      db.from("dright_starter_product_settings").select("*").eq("singleton", true).maybeSingle(),
    ]);

    if (!store?.is_active || !store?.public_visible || !product?.is_enabled || !product?.public_visible) {
      return json({ error: "DRIGHT Starter Access is currently unavailable." }, 409);
    }

    const { data: emailExists, error: emailError } = await db.rpc("dright_starter_email_exists", {
      p_email: buyerEmail,
    });
    if (emailError) return json({ error: "Unable to validate new-user eligibility." }, 500);
    if (emailExists === true) {
      return json({ error: "This product is only for new users. This email is already linked to a DRIGHT account." }, 409);
    }

    const { data: prior } = await db
      .from("dright_starter_purchases")
      .select("id,payment_reference,payment_status,status")
      .eq("buyer_email", buyerEmail)
      .eq("payment_status", "success")
      .limit(1)
      .maybeSingle();
    if (prior) {
      return json({
        error: "A completed DRIGHT Starter purchase already exists for this email. Continue to sign up or sign in to claim it.",
        reference: prior.payment_reference,
      }, 409);
    }

    type Link = {
      id: string | null;
      user_id: string;
      unique_code: string;
      product_id: string | null;
      source_type: string | null;
      source_level: string | null;
    };
    let link: Link | null = null;
    const referralLinkId = safeText(body.referral_link_id, 64);
    const trackingCode = safeText(body.tracking_code, 100) || safeText(body.ref_code, 100);

    if (referralLinkId) {
      const { data } = await db.from("referral_links")
        .select("id,user_id,unique_code,product_id,source_type,source_level")
        .eq("id", referralLinkId)
        .maybeSingle();
      link = data as Link | null;
    } else if (trackingCode) {
      const { data } = await db.rpc("resolve_tracking_link", {
        p_code: trackingCode,
        p_product_id: null,
      });
      const row = data?.[0];
      if (row?.owner_id) {
        link = {
          id: row.link_id || null,
          user_id: row.owner_id,
          unique_code: row.tracking_code || trackingCode,
          product_id: row.product_id || null,
          source_type: row.source_type || "affiliate",
          source_level: row.source_level || null,
        };
      }
      if (!link) {
        const { data: referrer } = await db.from("users")
          .select("id,referral_code,account_status")
          .eq("referral_code", trackingCode)
          .maybeSingle();
        if (referrer && String(referrer.account_status || "").toUpperCase() === "ACTIVE") {
          const { data: generic } = await db.from("referral_links")
            .select("id,user_id,unique_code,product_id,source_type,source_level")
            .eq("user_id", referrer.id)
            .eq("source_type", "affiliate")
            .is("product_id", null)
            .limit(1)
            .maybeSingle();
          link = (generic || {
            id: null,
            user_id: referrer.id,
            unique_code: trackingCode,
            product_id: null,
            source_type: "affiliate",
            source_level: null,
          }) as Link;
        }
      }
    }

    let referrerId: string | null = null;
    let canonicalLinkId: string | null = null;
    let canonicalCode: string | null = null;
    let sourceType: string | null = null;
    let sourceLevel: string | null = null;

    if (link && String(link.source_type || "affiliate").toLowerCase() === "affiliate") {
      const { data: owner } = await db.from("users")
        .select("id,account_status")
        .eq("id", link.user_id)
        .maybeSingle();
      if (owner && String(owner.account_status || "").toUpperCase() === "ACTIVE") {
        referrerId = owner.id;
        canonicalLinkId = link.id || null;
        canonicalCode = link.unique_code || trackingCode || null;
        sourceType = "affiliate";
        sourceLevel = link.source_level || null;
      }
    }

    const amount = Math.max(0, Number(product.price) || 0);
    const currency = String(product.currency || "USD").trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      return json({ error: "DRIGHT Starter currency is not configured correctly." }, 409);
    }
    if (amount <= 0) return json({ error: "DRIGHT Starter price is not configured." }, 409);

    const commissionPercent = Math.max(0, Math.min(100, Number(product.affiliate_commission_percent) || 0));
    const affiliateAmount = referrerId ? Math.round((amount * commissionPercent / 100) * 100) / 100 : 0;
    const platformRevenue = Math.max(0, Math.round((amount - affiliateAmount) * 100) / 100);
    const trialDays = Math.max(0, Math.min(730, Math.floor(Number(product.included_trial_days) || 0)));
    const reference = `DRG_STARTER_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

    const { data: purchase, error: purchaseError } = await db.from("dright_starter_purchases").insert({
      buyer_email: buyerEmail,
      buyer_name: buyerName,
      amount,
      currency,
      affiliate_commission_percent: commissionPercent,
      affiliate_commission_amount: affiliateAmount,
      platform_revenue_amount: platformRevenue,
      included_trial_days: trialDays,
      referrer_id: referrerId,
      referral_link_id: canonicalLinkId,
      tracking_code: canonicalCode,
      source_type: sourceType,
      source_level: sourceLevel,
      visitor_id: safeText(body.visitor_id, 100) || null,
      session_id: safeText(body.session_id, 100) || null,
      payment_reference: reference,
      payment_status: "initialized",
      status: "pending_payment",
      metadata: {
        first_party_product: true,
        product_key: "dright_starter_access",
        category: product.category || "Sign Up",
        no_marketplace_platform_fee: true,
        store_slug: store.slug || "dright",
        user_agent: req.headers.get("user-agent") || null,
      },
    }).select("id").single();

    if (purchaseError || !purchase) {
      console.error("[dright-starter-checkout] purchase insert failed", purchaseError?.message);
      return json({ error: "Unable to create the DRIGHT Starter purchase." }, 500);
    }

    if (!PAYSTACK_SECRET) {
      await db.from("dright_starter_purchases").update({
        payment_status: "failed",
        status: "payment_failed",
        gateway_response: "Paystack not configured",
        updated_at: new Date().toISOString(),
      }).eq("id", purchase.id);
      return json({ error: "Paystack is not configured." }, 503);
    }

    const appUrl = (Deno.env.get("APP_URL") || req.headers.get("origin") || "").replace(/\/$/, "");
    if (!appUrl) return json({ error: "Application URL is not configured." }, 503);

    const response = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: buyerEmail,
        amount: Math.round(amount * 100),
        currency,
        reference,
        callback_url: `${appUrl}/dright/starter/payment?reference=${encodeURIComponent(reference)}`,
        metadata: {
          purpose: "dright_starter_access",
          starter_purchase_id: purchase.id,
          first_party_product: true,
          no_marketplace_platform_fee: true,
          affiliate_commission_percent: commissionPercent,
          included_trial_days: trialDays,
        },
      }),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload?.status || !payload?.data?.authorization_url) {
      const message = String(payload?.message || "Paystack initialization failed");
      await db.from("dright_starter_purchases").update({
        payment_status: "failed",
        status: "payment_failed",
        gateway_response: message,
        updated_at: new Date().toISOString(),
      }).eq("id", purchase.id);
      return json({ error: message }, 400);
    }

    await db.from("dright_starter_purchases").update({
      payment_status: "pending",
      gateway_response: "Initialized",
      updated_at: new Date().toISOString(),
    }).eq("id", purchase.id);

    return json({
      success: true,
      reference,
      purchase_id: purchase.id,
      authorization_url: payload.data.authorization_url,
      amount,
      currency,
      affiliate_commission_percent: commissionPercent,
      included_trial_days: trialDays,
    });
  } catch (error) {
    console.error("[dright-starter-checkout]", error);
    return json({ error: error instanceof Error ? error.message : "DRIGHT Starter checkout failed." }, 500);
  }
});
