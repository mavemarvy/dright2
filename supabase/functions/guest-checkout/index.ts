import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const PAYSTACK_SECRET = Deno.env.get("PAYSTACK_SECRET_KEY") || "";
const PAYSTACK_BASE = "https://api.paystack.co";

function safeText(value: unknown, max = 500): string { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function validEmail(value: string): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 320; }

function productSourceCurrency(product: Record<string, unknown>): string {
  const specs = product.specifications && typeof product.specifications === "object" && !Array.isArray(product.specifications)
    ? product.specifications as Record<string, unknown>
    : {};
  const value = String(specs.price_currency || specs.source_currency || "USD").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(value) ? value : "USD";
}

async function getSourceToUsdRate(sourceCurrency: string): Promise<{ rate: number; source: string }> {
  if (sourceCurrency === "USD") return { rate: 1, source: "identity" };
  const sources = [
    { url: "https://open.er-api.com/v6/latest/USD", source: "open.er-api.com" },
    { url: "https://api.exchangerate-api.com/v4/latest/USD", source: "exchangerate-api.com" },
  ];
  for (const candidate of sources) {
    try {
      const response = await fetch(candidate.url, { headers: { Accept: "application/json" } });
      if (!response.ok) continue;
      const payload = await response.json().catch(() => null);
      const unitsPerUsd = Number(payload?.rates?.[sourceCurrency]);
      if (Number.isFinite(unitsPerUsd) && unitsPerUsd > 0) {
        return { rate: 1 / unitsPerUsd, source: candidate.source };
      }
    } catch {
      // Try the next provider.
    }
  }
  if (sourceCurrency === "NGN") return { rate: 1 / 1600, source: "dright_ngn_fallback" };
  throw new Error(`Unable to resolve a safe ${sourceCurrency} to USD conversion rate`);
}

function money(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 1_000_000) / 1_000_000;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function getUsdToNgnRate(): Promise<{ rate: number; source: string }> {
  const sources = [
    { url: "https://open.er-api.com/v6/latest/USD", source: "open.er-api.com" },
    { url: "https://api.exchangerate-api.com/v4/latest/USD", source: "exchangerate-api.com" },
  ];
  for (const candidate of sources) {
    try {
      const response = await fetch(candidate.url, { headers: { Accept: "application/json" } });
      if (!response.ok) continue;
      const payload = await response.json().catch(() => null);
      const rate = Number(payload?.rates?.NGN);
      if (Number.isFinite(rate) && rate > 100) return { rate, source: candidate.source };
    } catch {
      // Try the next provider.
    }
  }
  return { rate: 1600, source: "dright_fallback" };
}

async function verifyTurnstile(token: string, ip: string | null) {
  const secret =
    Deno.env.get("TURNSTILE_SECRET") ||
    Deno.env.get("TURNSTILE_SECRET_KEY") ||
    Deno.env.get("CLOUDFLARE_TURNSTILE_SECRET") ||
    Deno.env.get("CLOUDFLARE_TURNSTILE_SECRET_KEY") ||
    "";
  if (!secret) return { ok: false, status: 503, error: "Security verification is not configured" };
  if (!token) return { ok: false, status: 400, error: "Complete the security verification" };
  const form = new URLSearchParams({ secret, response: token });
  // Supabase Edge Functions may see a proxy address rather than the visitor's
  // original IP. Turnstile's remoteip is optional, so do not bind otherwise-valid
  // guest tokens to a potentially incorrect proxy address.
  void ip;
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString() });
  const result = await response.json().catch(() => ({}));
  const errorCodes = Array.isArray(result?.["error-codes"]) ? result["error-codes"] : [];
  const { error: verificationLogError } = await db.from("turnstile_verifications").insert({
    user_id: null,
    ip_address: null,
    action: "guest_checkout",
    token_hash: await sha256Hex(token),
    success: Boolean(result?.success),
    error_codes: errorCodes.length ? errorCodes : null,
    verified_at: new Date().toISOString(),
  });
  if (verificationLogError) console.warn("[guest-checkout] Turnstile log warning", verificationLogError.message);
  if (!response.ok || !result?.success) {
    console.warn("[guest-checkout] Turnstile verification failed", errorCodes);
    return { ok: false, status: 403, error: "Security verification failed. Please refresh the challenge and try again." };
  }
  if (result.action && result.action !== "guest_checkout") return { ok: false, status: 403, error: "Security verification action mismatch" };
  return { ok: true, status: 200, error: "" };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const assistedMode = body?.assisted_mode === true;
    const authHeader = req.headers.get("Authorization") || "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "");
    let actorUser: { id: string; email?: string | null } | null = null;
    let actorProfile: { id: string; email: string; is_admin: boolean | null; account_status: string | null; referral_code: string | null } | null = null;
    if (bearer) {
      const { data: actorAuth } = await db.auth.getUser(bearer);
      actorUser = actorAuth?.user ? { id: actorAuth.user.id, email: actorAuth.user.email } : null;
      if (actorUser?.id) {
        const { data: actorRow } = await db
          .from("users")
          .select("id,email,is_admin,account_status,referral_code")
          .eq("id", actorUser.id)
          .maybeSingle();
        actorProfile = actorRow as typeof actorProfile;
      }
    }
    if (assistedMode && !actorUser?.id) {
      return json({ error: "Sign in before selling or paying directly for a buyer" }, 401);
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
    const security = await verifyTurnstile(safeText(body.turnstile_token, 4096), ip);
    if (!security.ok) return json({ error: security.error }, security.status);

    const productId = safeText(body.product_id, 64);
    const buyerEmail = safeText(body.buyer_email, 320).toLowerCase();
    const buyerName = safeText(body.buyer_name, 120);
    const shippingAddress = safeText(body.shipping_address, 1000);
    const selectedTierId = safeText(body.selected_tier_id, 64);
    const buyerRequirements = safeText(body.buyer_requirements, 4000);
    const customizationOptionIds = Array.isArray(body.customization_option_ids)
      ? [...new Set(body.customization_option_ids.map((value: unknown) => safeText(value, 64)).filter(Boolean))].slice(0, 30)
      : [];
    const quantity = Math.max(1, Math.min(99, Math.floor(Number(body.quantity) || 1)));
    if (!productId || !buyerName || !validEmail(buyerEmail)) return json({ error: "Name, valid email, and product are required" }, 400);

    const { data: product, error: productError } = await db.from("products").select("*").eq("id", productId).maybeSingle();
    if (productError || !product) return json({ error: "Product not found" }, 404);

    const specs = product.specifications && typeof product.specifications === "object" && !Array.isArray(product.specifications)
      ? product.specifications as Record<string, unknown>
      : {};
    const isOfficialDright = specs.official_store === true || specs.first_party === true;
    const adminHiddenQa = Boolean(product.is_hidden && actorProfile?.is_admin === true && isOfficialDright);

    if (product.approval_status !== "approved" || !product.is_active || (product.is_hidden && !adminHiddenQa)) {
      return json({ error: "Product is not available" }, 409);
    }

    let directSaleDays = 10;
    if (assistedMode) {
      const { data: directSetting } = await db
        .from("listing_direct_sale_settings")
        .select("enabled,guest_access_days")
        .eq("entity_type", "product")
        .eq("entity_id", productId)
        .maybeSingle();
      if (!directSetting?.enabled) {
        return json({ error: "Direct affiliate/seller checkout is disabled for this listing" }, 403);
      }
      directSaleDays = Math.max(1, Math.min(30, Number(directSetting.guest_access_days || 10)));
    }

    const productType = String(product.product_type || "").toUpperCase();
    const physicalProduct = productType === "PHYSICAL";
    const requiresShipping = physicalProduct && !assistedMode;
    if (requiresShipping && !shippingAddress) return json({ error: "Shipping address is required for physical products" }, 400);
    if (product.stock_quantity !== null && Number(product.stock_quantity) < quantity) return json({ error: "Requested quantity is not available" }, 409);

    let tierPrice = 0;
    let selectedTier: Record<string, unknown> | null = null;
    if (productType === "SERVICE" && selectedTierId) {
      const { data: tier, error: tierError } = await db
        .from("service_tiers")
        .select("id,tier_name,title,price,delivery_days")
        .eq("id", selectedTierId)
        .eq("product_id", productId)
        .maybeSingle();
      if (tierError) return json({ error: "Unable to validate selected service tier" }, 500);
      if (!tier) return json({ error: "Selected service tier is not available" }, 409);
      selectedTier = tier as Record<string, unknown>;
      tierPrice = Math.max(0, Number(tier.price) || 0);
    }

    let customizationPrice = 0;
    let selectedCustomizations: Array<Record<string, unknown>> = [];
    if (productType === "SERVICE" && customizationOptionIds.length > 0) {
      const { data: options, error: optionsError } = await db
        .from("customization_options")
        .select("id,option_name,additional_price,additional_days")
        .in("id", customizationOptionIds)
        .eq("product_id", productId);
      if (optionsError) return json({ error: "Unable to validate service add-ons" }, 500);
      if ((options || []).length !== customizationOptionIds.length) {
        return json({ error: "One or more selected service add-ons are not available" }, 409);
      }
      selectedCustomizations = (options || []) as Array<Record<string, unknown>>;
      customizationPrice = selectedCustomizations.reduce(
        (sum, option) => sum + Math.max(0, Number(option.additional_price) || 0),
        0,
      );
    }

    type ReferralLink = { id:string|null; user_id:string; unique_code:string; product_id:string|null; source_type:string|null; source_level:string|null };
    let link: ReferralLink | null = null;
    const referralLinkId = safeText(body.referral_link_id, 64);
    const trackingCode = safeText(body.tracking_code, 100) || safeText(body.ref_code, 100);
    if (referralLinkId) {
      const { data } = await db.from("referral_links").select("id,user_id,unique_code,product_id,source_type,source_level").eq("id", referralLinkId).maybeSingle();
      link = data as ReferralLink | null;
    } else if (trackingCode) {
      const { data } = await db.rpc("resolve_tracking_link", { p_code: trackingCode, p_product_id: productId });
      const row = data?.[0];
      if (row?.link_id) link = { id: row.link_id, user_id: row.owner_id, unique_code: row.tracking_code, product_id: row.product_id, source_type: row.source_type, source_level: row.source_level };
      if (!link) {
        const { data: referrer } = await db.from("users").select("id,referral_code,account_status").eq("referral_code", trackingCode).maybeSingle();
        if (referrer && String(referrer.account_status || "").toUpperCase() === "ACTIVE") {
          const { data: generic } = await db.from("referral_links").select("id,user_id,unique_code,product_id,source_type,source_level").eq("user_id", referrer.id).eq("source_type", "affiliate").is("product_id", null).limit(1).maybeSingle();
          link = (generic || { id: null, user_id: referrer.id, unique_code: trackingCode, product_id: null, source_type: "affiliate", source_level: null }) as ReferralLink;
        }
      }
    }

    // In assisted mode the signed-in payer is authoritative. A seller can pay
    // for their own buyer without affiliate attribution. A different active user
    // is attributed only when they have a valid product/generic affiliate link.
    if (assistedMode && actorUser?.id) {
      if (actorUser.id === product.uploaded_by) {
        link = null;
      } else {
        const { data: actorLink } = await db
          .from("referral_links")
          .select("id,user_id,unique_code,product_id,source_type,source_level")
          .eq("user_id", actorUser.id)
          .eq("source_type", "affiliate")
          .or(`product_id.eq.${productId},product_id.is.null`)
          .order("product_id", { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();
        link = actorLink as ReferralLink | null;
      }
    }

    let referrerId:string|null=null, canonicalLinkId:string|null=null, canonicalCode:string|null=null, sourceType:string|null=null, sourceLevel:string|null=null;
    if (link && (!link.product_id || link.product_id === productId) && String(link.source_type || "affiliate").toLowerCase() === "affiliate") {
      const { data: owner } = await db.from("users").select("id,account_status").eq("id", link.user_id).maybeSingle();
      if (owner && String(owner.account_status || "").toUpperCase() === "ACTIVE") {
        referrerId=owner.id; canonicalLinkId=link.id || null; canonicalCode=link.unique_code || trackingCode || null; sourceType="affiliate"; sourceLevel=link.source_level || null;
      }
    }
    if (
      assistedMode
      && actorUser?.id
      && actorUser.id !== product.uploaded_by
      && !referrerId
      && String(actorProfile?.account_status || "").toUpperCase() === "ACTIVE"
      && actorProfile?.referral_code
    ) {
      referrerId=actorUser.id;
      canonicalCode=actorProfile.referral_code;
      sourceType="affiliate";
      sourceLevel=null;
    }
    if (assistedMode && actorUser?.id === product.uploaded_by) {
      sourceType="seller_assisted";
      sourceLevel=null;
      referrerId=null;
      canonicalLinkId=null;
      canonicalCode=null;
    }

    const sourceCurrency = productSourceCurrency(product);
    const unitSourcePrice=Math.max(0,Number(product.price)||0);
    const sourceBasePrice=unitSourcePrice*quantity;
    const isFree=product.is_free===true || sourceBasePrice===0;
    const platformPercent=Math.max(0,Number(product.admin_task_percent||0));
    const affiliatePercent=Math.max(0,Number(product.affiliate_commission_percent||0));
    const sourcePlatformFee=isFree?0:(sourceBasePrice*platformPercent)/100;
    const sourceAffiliateCommission=!isFree&&referrerId?(sourceBasePrice*affiliatePercent)/100:0;
    const sourceSubtotal=sourceBasePrice+tierPrice+customizationPrice;
    const sourceTotalAmount=isFree?0:sourceSubtotal+sourcePlatformFee;
    const sourceSellerEarnings=Math.max(0,sourceSubtotal-sourceAffiliateCommission);

    const sourceToUsd = isFree ? { rate: 1, source: "free_order" } : await getSourceToUsdRate(sourceCurrency);
    const toUsd=(value:number)=>sourceCurrency==="USD"?money(value):money(value*sourceToUsd.rate);
    const basePrice=toUsd(sourceBasePrice);
    const platformFee=toUsd(sourcePlatformFee);
    const affiliateCommission=toUsd(sourceAffiliateCommission);
    const totalAmount=toUsd(sourceTotalAmount);
    const sellerEarnings=toUsd(sourceSellerEarnings);
    const reference=`DRG_GUEST_${Date.now()}_${crypto.randomUUID().slice(0,8)}`;

    let gatewayAmount = 0;
    let gatewayCurrency = "NGN";
    let gatewayFxRate: number | null = null;
    let gatewayFxSource: string | null = null;
    if (!isFree) {
      if (sourceCurrency === "NGN") {
        gatewayAmount = Math.round(sourceTotalAmount * 100) / 100;
        gatewayFxRate = 1;
        gatewayFxSource = "source_currency_ngn";
      } else {
        const usdToNgn = await getUsdToNgnRate();
        gatewayFxRate = usdToNgn.rate;
        gatewayFxSource = usdToNgn.source;
        gatewayAmount = Math.round(totalAmount * usdToNgn.rate * 100) / 100;
      }
      if (!Number.isFinite(gatewayAmount) || gatewayAmount <= 0) {
        return json({ error: "Unable to calculate the Paystack payment amount" }, 503);
      }
    }

    const { data: order, error: orderError } = await db.from("guest_orders").insert({
      product_id:productId, product_name:product.name, seller_id:product.uploaded_by, buyer_email:buyerEmail, buyer_name:buyerName,
      shipping_address:requiresShipping?(shippingAddress||null):null, quantity, base_price:basePrice, platform_fee_amount:platformFee,
      affiliate_commission_amount:affiliateCommission, seller_earnings:sellerEarnings, total_amount:totalAmount, currency:"USD",
      status:isFree?"processing":"pending_payment", payment_status:isFree?"free":"initializing", payment_reference:reference,
      referrer_id:referrerId, referral_link_id:canonicalLinkId, tracking_code:canonicalCode, source_type:sourceType, source_level:sourceLevel,
      visitor_id:safeText(body.visitor_id,100)||null, session_id:safeText(body.session_id,100)||null,
      metadata:{
        guest_checkout:true,
        assisted_mode:assistedMode,
        assisted_by_user_id:assistedMode ? actorUser?.id || null : null,
        guest_access_days:directSaleDays,
        product_type:productType,
        requires_shipping:requiresShipping,
        shipping_pending:physicalProduct && assistedMode,
        selected_tier:selectedTier,
        selected_tier_id:selectedTierId||null,
        tier_price:tierPrice,
        customization_option_ids:customizationOptionIds,
        customizations:selectedCustomizations,
        customization_price:customizationPrice,
        buyer_requirements:buyerRequirements||null,
        source_currency:sourceCurrency,
        source_base_price:sourceBasePrice,
        source_total_amount:sourceTotalAmount,
        source_to_usd_rate:sourceToUsd.rate,
        source_to_usd_source:sourceToUsd.source,
        gateway_amount:gatewayAmount,
        gateway_currency:gatewayCurrency,
        gateway_fx_rate:gatewayFxRate,
        gateway_fx_source:gatewayFxSource,
        user_agent:req.headers.get("user-agent")||null
      },
    }).select("id").single();
    if (orderError || !order) {
      console.error("[guest-checkout] guest order insert failed", {
        code: orderError?.code || null,
        message: orderError?.message || null,
        details: orderError?.details || null,
        product_id: productId,
        assisted_mode: assistedMode,
      });
      return json({
        error: orderError?.message || "Unable to create guest order",
        code: orderError?.code || "guest_order_insert_failed",
      }, 500);
    }

    if (isFree) {
      const { data: processed, error: processError } = await db.rpc("process_verified_guest_order", { p_reference:reference,p_amount:0,p_currency:"USD",p_gateway_response:"Free guest order",p_paid_at:new Date().toISOString(),p_channel:"free" });
      if (processError) return json({ error: "Unable to complete free guest order" }, 500);
      return json({ success:true,free:true,guest_order_id:order.id,reference,product_id:productId,processed });
    }

    if (!PAYSTACK_SECRET) {
      await db.from("guest_orders").update({ payment_status:"failed",status:"payment_failed",gateway_response:"Paystack not configured" }).eq("id",order.id);
      return json({ error:"Paystack is not configured" },503);
    }
    const appUrl=(Deno.env.get("APP_URL")||req.headers.get("origin")||"").replace(/\/$/,"");
    if (!appUrl) return json({ error:"Application URL is not configured" },503);
    const paystackResponse=await fetch(`${PAYSTACK_BASE}/transaction/initialize`,{
      method:"POST",headers:{Authorization:`Bearer ${PAYSTACK_SECRET}`,"Content-Type":"application/json"},
      body:JSON.stringify({
        email:buyerEmail,
        amount:Math.round(gatewayAmount*100),
        currency:gatewayCurrency,
        reference,
        callback_url:`${appUrl}/guest-payment/callback?reference=${encodeURIComponent(reference)}`,
        metadata:{
          guest_order_id:order.id,
          product_id:productId,
          purpose:"guest_product_purchase",
          dright_amount:totalAmount,
          dright_currency:"USD",
          source_amount:sourceTotalAmount,
          source_currency:sourceCurrency,
          gateway_amount:gatewayAmount,
          gateway_currency:gatewayCurrency,
          gateway_fx_rate:gatewayFxRate
        }
      }),
    });
    const paystackData=await paystackResponse.json().catch(()=>({}));
    if (!paystackResponse.ok || !paystackData?.status || !paystackData?.data?.authorization_url) {
      const message=String(paystackData?.message||"Paystack initialization failed");
      await db.from("guest_orders").update({payment_status:"failed",status:"payment_failed",gateway_response:message}).eq("id",order.id);
      return json({error:message},400);
    }
    await db.from("guest_orders").update({payment_status:"pending",gateway_response:"Initialized"}).eq("id",order.id);
    return json({
      success:true,
      free:false,
      guest_order_id:order.id,
      reference,
      authorization_url:paystackData.data.authorization_url,
      amount:totalAmount,
      currency:"USD",
      source_amount:sourceTotalAmount,
      source_currency:sourceCurrency,
      gateway_amount:gatewayAmount,
      gateway_currency:gatewayCurrency,
      product_id:productId
    });
  } catch (error) {
    console.error("guest-checkout error",error);
    return json({error:error instanceof Error?error.message:"Guest checkout failed"},500);
  }
});
