import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
const PAYSTACK_SECRET = Deno.env.get("PAYSTACK_SECRET_KEY") || "";
const PAYSTACK_BASE = "https://api.paystack.co";
const MIN_FUNDING_MINOR = 10_000;
const ALLOWED_PURPOSES = new Set([
  "wallet_funding", "advertiser_funding", "product_purchase", "escrow",
  "subscription", "affiliate_subscription", "vendor_subscription", "promotion_campaign",
  "listing_capacity",
]);
const ALLOWED_CHANNELS = new Set(["card", "bank", "ussd", "bank_transfer", "mobile_money"]);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function log(level: string, message: string, data?: Record<string, unknown>) {
  console.log(`[${new Date().toISOString()}] [paystack-initialize] [${level}] ${message}${data ? ` ${JSON.stringify(data)}` : ""}`);
}
function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function normalizeChannels(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const channels = [...new Set(value.map(String).filter((channel) => ALLOWED_CHANNELS.has(channel)))];
  return channels.length ? channels : undefined;
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
      // Try the next provider. A bounded fallback below keeps checkout available.
    }
  }

  return { rate: 1600, source: "dright_fallback" };
}
function subscriptionPurpose(planType: unknown): string {
  const type = String(planType || "").toLowerCase();
  if (type === "affiliate") return "affiliate_subscription";
  if (type === "vendor") return "vendor_subscription";
  return "subscription";
}
function safeCallbackPath(value: unknown): string {
  if (typeof value !== "string") return "/payment/callback";
  const path = value.trim();
  return path.startsWith("/") && !path.startsWith("//") ? path : "/payment/callback";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Missing auth" }, 401);

    const { createClient } = await import("npm:@supabase/supabase-js@2");
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = authHeader.slice("Bearer ".length);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const body = asObject(await req.json());
    const requestedPurpose = String(body.purpose || "wallet_funding");
    const requestedAmountMinor = Number(body.amount);
    const requestedReferenceId = typeof body.reference_id === "string" && body.reference_id.trim() ? body.reference_id.trim() : null;
    const requestedMetadata = asObject(body.metadata);
    if (!ALLOWED_PURPOSES.has(requestedPurpose)) return json({ error: "Unsupported payment purpose" }, 400);

    let purpose = requestedPurpose;
    let amountMinor = requestedAmountMinor;
    let referenceId = requestedReferenceId;
    let paymentCurrency = "NGN";
    let gatewayAmountMinor = requestedAmountMinor;
    let gatewayCurrency = "NGN";
    let canonicalMetadata: Record<string, unknown> = { ...requestedMetadata };

    if (purpose === "product_purchase" || purpose === "escrow") {
      if (!referenceId) return json({ error: "Order reference is required" }, 400);
      const { data: order, error: orderError } = await supabase
        .from("orders").select("id,buyer_id,product_id,seller_id,status,final_price,is_free_order")
        .eq("id", referenceId).maybeSingle();
      if (orderError) return json({ error: "Unable to validate order" }, 500);
      if (!order) return json({ error: "Order not found" }, 404);
      if (order.buyer_id !== user.id) return json({ error: "Order does not belong to authenticated user" }, 403);
      const orderStatus = String(order.status || "").toUpperCase();
      if (orderStatus === "COMPLETED") return json({ error: "Order has already been paid" }, 409);
      if (orderStatus !== "PENDING") return json({ error: "Order is not payable" }, 409);
      const orderTotal = Number(order.final_price);
      if (order.is_free_order || !Number.isFinite(orderTotal) || orderTotal <= 0) return json({ error: "This order does not require a Paystack payment" }, 400);

      // DRIGHT marketplace prices and wallets are canonical USD. Nigerian Paystack
      // checkout is settled in NGN, so keep the ledger amount in USD and derive a
      // separate trusted gateway amount server-side.
      amountMinor = Math.round(orderTotal * 100);
      paymentCurrency = "USD";
      if (Number.isFinite(requestedAmountMinor) && Math.round(requestedAmountMinor) !== amountMinor) {
        return json({ error: "Payment amount does not match the current order total", amount: orderTotal, currency: "USD" }, 409);
      }

      const fx = await getUsdToNgnRate();
      const gatewayAmount = Math.round(orderTotal * fx.rate * 100) / 100;
      gatewayAmountMinor = Math.round(gatewayAmount * 100);
      gatewayCurrency = "NGN";
      if (!Number.isSafeInteger(gatewayAmountMinor) || gatewayAmountMinor <= 0) {
        return json({ error: "Unable to calculate the Paystack payment amount" }, 503);
      }

      canonicalMetadata = {
        ...requestedMetadata,
        order_id: order.id,
        product_id: order.product_id,
        seller_id: order.seller_id,
        buyer_id: user.id,
        authoritative_amount: orderTotal,
        authoritative_currency: "USD",
        gateway_amount: gatewayAmount,
        gateway_currency: gatewayCurrency,
        fx_rate: fx.rate,
        fx_source: fx.source,
      };
    } else if (["subscription", "affiliate_subscription", "vendor_subscription"].includes(purpose)) {
      const planId = typeof requestedMetadata.plan_id === "string" ? requestedMetadata.plan_id.trim() : "";
      if (!planId) return json({ error: "Subscription plan is required" }, 400);
      const { data: plan, error: planError } = await supabase.from("subscription_plans")
        .select("id,slug,name,plan_type,amount,currency,interval,is_active").eq("id", planId).maybeSingle();
      if (planError) return json({ error: "Unable to validate subscription plan" }, 500);
      if (!plan || plan.is_active !== true) return json({ error: "Subscription plan is not available" }, 404);
      const planAmount = Number(plan.amount);
      const planCurrency = String(plan.currency || "NGN").toUpperCase();
      if (!Number.isFinite(planAmount) || planAmount <= 0) return json({ error: "Invalid subscription plan amount" }, 400);
      if (planCurrency !== "NGN") return json({ error: "This Paystack flow currently supports NGN subscription plans only" }, 400);
      purpose = subscriptionPurpose(plan.plan_type);
      referenceId = plan.id;
      amountMinor = Math.round(planAmount * 100);
      paymentCurrency = planCurrency;
      if (Number.isFinite(requestedAmountMinor) && Math.round(requestedAmountMinor) !== amountMinor) return json({ error: "Payment amount does not match the current subscription price", amount: planAmount }, 409);
      canonicalMetadata = { ...requestedMetadata, plan_id: plan.id, plan_slug: plan.slug, plan_name: plan.name, plan_type: plan.plan_type, plan_interval: plan.interval, user_id: user.id, authoritative_amount: planAmount };
    } else if (purpose === "listing_capacity") {
      const packId = requestedReferenceId
        || (typeof requestedMetadata.pack_id === "string" ? requestedMetadata.pack_id.trim() : "");
      if (!packId) return json({ error: "Listing capacity pack is required" }, 400);

      const { data: pack, error: packError } = await supabase
        .from("listing_capacity_packs")
        .select("id,name,listing_count,amount,currency,validity_days,listing_type_code,category_id,is_active")
        .eq("id", packId)
        .maybeSingle();

      if (packError) return json({ error: "Unable to validate listing capacity pack" }, 500);
      if (!pack || pack.is_active !== true) return json({ error: "Listing capacity pack is not available" }, 404);

      const packAmount = Number(pack.amount);
      const packCurrency = String(pack.currency || "NGN").toUpperCase();
      if (!Number.isFinite(packAmount) || packAmount <= 0) return json({ error: "Invalid listing capacity pack price" }, 400);
      if (!["NGN", "USD"].includes(packCurrency)) {
        return json({ error: `Paystack listing-capacity checkout currently supports NGN or USD-priced packs, not ${packCurrency}` }, 400);
      }

      purpose = "listing_capacity";
      referenceId = pack.id;
      amountMinor = Math.round(packAmount * 100);
      paymentCurrency = packCurrency;

      if (Number.isFinite(requestedAmountMinor) && Math.round(requestedAmountMinor) !== amountMinor) {
        return json({ error: "Payment amount does not match the current listing capacity price", amount: packAmount, currency: packCurrency }, 409);
      }

      if (packCurrency === "USD") {
        const fx = await getUsdToNgnRate();
        const gatewayAmount = Math.round(packAmount * fx.rate * 100) / 100;
        gatewayAmountMinor = Math.round(gatewayAmount * 100);
        gatewayCurrency = "NGN";
        canonicalMetadata = {
          ...requestedMetadata,
          pack_id: pack.id,
          pack_name: pack.name,
          listing_count: pack.listing_count,
          validity_days: pack.validity_days,
          listing_type_code: pack.listing_type_code,
          category_id: pack.category_id,
          authoritative_amount: packAmount,
          authoritative_currency: packCurrency,
          gateway_amount: gatewayAmount,
          gateway_currency: gatewayCurrency,
          fx_rate: fx.rate,
          fx_source: fx.source,
        };
      } else {
        gatewayAmountMinor = amountMinor;
        gatewayCurrency = "NGN";
        canonicalMetadata = {
          ...requestedMetadata,
          pack_id: pack.id,
          pack_name: pack.name,
          listing_count: pack.listing_count,
          validity_days: pack.validity_days,
          listing_type_code: pack.listing_type_code,
          category_id: pack.category_id,
          authoritative_amount: packAmount,
          authoritative_currency: packCurrency,
          gateway_amount: packAmount,
          gateway_currency: gatewayCurrency,
        };
      }
    } else if (purpose === "promotion_campaign") {
      if (!referenceId) return json({ error: "Promotion campaign reference is required" }, 400);
      const { data: campaign, error: campaignError } = await supabase.from("promotion_campaigns")
        .select("id,seller_id,listing_id,listing_type,budget,media_budget,placement_fee_total,platform_fee,tax_amount,total_payable,billing_currency,status,payment_status,payment_id,tier_code,pricing_snapshot")
        .eq("id", referenceId).maybeSingle();
      if (campaignError) return json({ error: "Unable to validate promotion campaign" }, 500);
      if (!campaign) return json({ error: "Promotion campaign not found" }, 404);
      if (campaign.seller_id !== user.id) return json({ error: "Promotion campaign does not belong to authenticated user" }, 403);
      if (campaign.status !== "pending" || campaign.payment_status !== "pending" || campaign.payment_id) return json({ error: "Promotion campaign is not awaiting payment" }, 409);

      const campaignAmount = Number(campaign.total_payable ?? campaign.budget);
      const campaignCurrency = String(campaign.billing_currency || "").toUpperCase();
      if (!Number.isFinite(campaignAmount) || campaignAmount <= 0) return json({ error: "Promotion campaign has an invalid payable amount" }, 409);
      if (!campaignCurrency) return json({ error: "Promotion campaign billing currency is not configured" }, 409);

      const { data: provider, error: providerError } = await supabase.from("payment_providers")
        .select("slug,status,supported_currencies").eq("slug", "paystack").maybeSingle();
      if (providerError) return json({ error: "Unable to validate payment provider" }, 500);
      if (!provider || provider.status !== "enabled") return json({ error: "Paystack is not enabled for promotion payments" }, 503);
      const supportedCurrencies = Array.isArray(provider.supported_currencies) ? provider.supported_currencies.map((value: unknown) => String(value).toUpperCase()) : [];
      if (!supportedCurrencies.includes(campaignCurrency)) return json({ error: `Paystack does not support ${campaignCurrency} for this promotion` }, 409);

      amountMinor = Math.round(campaignAmount * 100);
      paymentCurrency = campaignCurrency;
      referenceId = campaign.id;
      if (Number.isFinite(requestedAmountMinor) && Math.round(requestedAmountMinor) !== amountMinor) return json({ error: "Payment amount does not match the canonical campaign total", amount: campaignAmount, currency: campaignCurrency }, 409);

      let campaignGatewayAmount = campaignAmount;
      let campaignFxRate: number | null = null;
      let campaignFxSource: string | null = null;
      if (campaignCurrency === "USD") {
        const fx = await getUsdToNgnRate();
        campaignFxRate = fx.rate;
        campaignFxSource = fx.source;
        campaignGatewayAmount = Math.round(campaignAmount * fx.rate * 100) / 100;
        gatewayAmountMinor = Math.round(campaignGatewayAmount * 100);
        gatewayCurrency = "NGN";
      } else {
        gatewayAmountMinor = amountMinor;
        gatewayCurrency = campaignCurrency;
      }

      canonicalMetadata = {
        ...requestedMetadata,
        campaign_id: campaign.id,
        listing_id: campaign.listing_id,
        listing_type: campaign.listing_type,
        seller_id: user.id,
        tier_code: campaign.tier_code,
        media_budget: Number(campaign.media_budget ?? campaign.budget ?? 0),
        placement_fee_total: Number(campaign.placement_fee_total || 0),
        platform_fee: Number(campaign.platform_fee || 0),
        tax_amount: Number(campaign.tax_amount || 0),
        authoritative_amount: campaignAmount,
        authoritative_currency: campaignCurrency,
        gateway_amount: campaignGatewayAmount,
        gateway_currency: gatewayCurrency,
        fx_rate: campaignFxRate,
        fx_source: campaignFxSource,
        pricing_snapshot: campaign.pricing_snapshot || {},
        provider: "paystack",
      };
    } else {
      if (!Number.isSafeInteger(amountMinor) || amountMinor < MIN_FUNDING_MINOR) return json({ error: "Minimum wallet funding is NGN 100 (or the equivalent in your selected display currency)" }, 400);
      canonicalMetadata = { ...requestedMetadata, user_id: user.id, authoritative_amount: amountMinor / 100 };
    }

    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return json({ error: "Invalid payment amount" }, 400);

    // Flows that do not require FX use the canonical amount directly at Paystack.
    if (!Number.isSafeInteger(gatewayAmountMinor) || gatewayAmountMinor <= 0) {
      gatewayAmountMinor = amountMinor;
      gatewayCurrency = paymentCurrency;
    }
    if (!PAYSTACK_SECRET) return json({ error: "Paystack not configured. Set PAYSTACK_SECRET_KEY." }, 503);

    const { data: userData } = await supabase.from("users").select("email, full_name").eq("id", user.id).maybeSingle();
    const email = user.email || userData?.email;
    if (!email) return json({ error: "User email not found" }, 400);

    const reference = `DRG_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const amountMajor = amountMinor / 100;
    const callbackPath = safeCallbackPath(canonicalMetadata.custom_redirect);
    const appUrl = (Deno.env.get("APP_URL") || req.headers.get("origin") || "").replace(/\/$/, "");
    if (!appUrl) return json({ error: "Application URL is not configured" }, 503);

    canonicalMetadata = {
      ...canonicalMetadata,
      user_id: user.id,
      purpose,
      reference_id: referenceId,
      currency: paymentCurrency,
      gateway_amount: Number(canonicalMetadata.gateway_amount ?? (gatewayAmountMinor / 100)),
      gateway_currency: String(canonicalMetadata.gateway_currency ?? gatewayCurrency),
      source: "dright_server",
    };
    log("INFO", "Initialize authoritative payment", {
      userId: user.id,
      amount: amountMajor,
      currency: paymentCurrency,
      gatewayAmount: gatewayAmountMinor / 100,
      gatewayCurrency,
      purpose,
      reference_id: referenceId,
    });

    const { error: insertErr } = await supabase.from("paystack_transactions").insert({
      user_id: user.id, reference, amount: amountMajor, currency: paymentCurrency, purpose,
      reference_id: referenceId, status: "initialized", metadata: canonicalMetadata, idempotency_key: reference,
    });
    if (insertErr) return json({ error: "Unable to create payment transaction" }, 500);

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
    const userAgent = req.headers.get("user-agent") || null;
    const { error: attemptError } = await supabase.from("payment_attempts").insert({
      user_id: user.id, reference, provider: "paystack", amount: amountMajor, currency: paymentCurrency,
      status: "initialized", purpose, ip_address: ip, device_info: userAgent, user_agent: userAgent, metadata: canonicalMetadata,
    });
    if (attemptError) log("WARN", "Unable to record payment attempt", { error: attemptError.message, reference });

    const requestedChannels = normalizeChannels(body.channels);
    const paystackPayload: Record<string, unknown> = {
      email,
      amount: gatewayAmountMinor,
      currency: gatewayCurrency,
      reference,
      callback_url: `${appUrl}${callbackPath}?reference=${encodeURIComponent(reference)}`,
      metadata: {
        user_id: user.id,
        purpose,
        reference_id: referenceId,
        dright_amount: amountMajor,
        dright_currency: paymentCurrency,
        gateway_amount: gatewayAmountMinor / 100,
        gateway_currency: gatewayCurrency,
        custom_fields: [
          { display_name: "User ID", variable_name: "user_id", value: user.id },
          { display_name: "Purpose", variable_name: "purpose", value: purpose },
        ],
      },
    };
    // When channels are not explicitly requested, let Paystack present every
    // channel actually enabled for the merchant account/currency.
    if (requestedChannels) paystackPayload.channels = requestedChannels;

    const paystackRes = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${PAYSTACK_SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify(paystackPayload),
    });
    const paystackData = await paystackRes.json().catch(() => ({}));
    if (!paystackRes.ok || !paystackData.status || !paystackData.data) {
      const message = String(paystackData.message || `Paystack initialization failed (${paystackRes.status})`);
      await supabase.from("paystack_transactions").update({ status: "failed", gateway_response: message, updated_at: new Date().toISOString() }).eq("reference", reference);
      return json({ error: message }, 400);
    }

    await supabase.from("paystack_transactions").update({ paystack_reference: paystackData.data.reference, status: "pending", updated_at: new Date().toISOString() }).eq("reference", reference);
    return json({
      success: true,
      authorization_url: paystackData.data.authorization_url,
      access_code: paystackData.data.access_code,
      reference,
      amount: amountMajor,
      currency: paymentCurrency,
      gateway_amount: gatewayAmountMinor / 100,
      gateway_currency: gatewayCurrency,
      purpose,
      reference_id: referenceId,
    });
  } catch (err) {
    log("ERROR", "Unhandled exception", { error: err instanceof Error ? err.message : String(err) });
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
