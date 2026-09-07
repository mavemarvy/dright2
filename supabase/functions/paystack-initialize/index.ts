import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PAYSTACK_SECRET = Deno.env.get("PAYSTACK_SECRET_KEY") || "";
const PAYSTACK_BASE = "https://api.paystack.co";
const MIN_FUNDING_MINOR = 10_000; // NGN 100

const ALLOWED_PURPOSES = new Set([
  "wallet_funding",
  "advertiser_funding",
  "product_purchase",
  "escrow",
  "subscription",
  "affiliate_subscription",
  "vendor_subscription",
  "promotion_campaign",
]);

const ALLOWED_CHANNELS = new Set([
  "card",
  "bank",
  "ussd",
  "bank_transfer",
  "mobile_money",
]);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function log(level: string, message: string, data?: Record<string, unknown>) {
  const ts = new Date().toISOString();
  const payload = data ? ` ${JSON.stringify(data)}` : "";
  console.log(`[${ts}] [paystack-initialize] [${level}] ${message}${payload}`);
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeChannels(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return ["card", "bank", "ussd", "bank_transfer", "mobile_money"];
  }
  const channels = [...new Set(value.map(String).filter((channel) => ALLOWED_CHANNELS.has(channel)))];
  return channels.length ? channels : ["card", "bank", "ussd", "bank_transfer", "mobile_money"];
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
  if (!path.startsWith("/") || path.startsWith("//")) return "/payment/callback";
  return path;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      log("WARN", "Missing or invalid auth header");
      return json({ error: "Missing auth" }, 401);
    }

    const token = authHeader.slice("Bearer ".length);
    const { createClient } = await import("npm:@supabase/supabase-js@2");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      log("WARN", "Unauthorized — no user for token");
      return json({ error: "Unauthorized" }, 401);
    }

    const body = asObject(await req.json());
    const requestedPurpose = String(body.purpose || "wallet_funding");
    const requestedAmountMinor = Number(body.amount);
    const requestedReferenceId = typeof body.reference_id === "string" && body.reference_id.trim()
      ? body.reference_id.trim()
      : null;
    const requestedMetadata = asObject(body.metadata);

    if (!ALLOWED_PURPOSES.has(requestedPurpose)) {
      return json({ error: "Unsupported payment purpose" }, 400);
    }

    let purpose = requestedPurpose;
    let amountMinor = requestedAmountMinor;
    let referenceId = requestedReferenceId;
    let paymentCurrency = "NGN";
    let canonicalMetadata: Record<string, unknown> = { ...requestedMetadata };

    // Marketplace purchases are bound to an existing server-side order. The browser
    // cannot choose the payable amount, buyer, product, seller, or order attribution.
    if (purpose === "product_purchase" || purpose === "escrow") {
      if (!referenceId) return json({ error: "Order reference is required" }, 400);

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select("id,buyer_id,product_id,seller_id,status,final_price,is_free_order")
        .eq("id", referenceId)
        .maybeSingle();

      if (orderError) return json({ error: "Unable to validate order" }, 500);
      if (!order) return json({ error: "Order not found" }, 404);
      if (order.buyer_id !== user.id) return json({ error: "Order does not belong to authenticated user" }, 403);

      const orderStatus = String(order.status || "").toUpperCase();
      if (orderStatus === "COMPLETED") return json({ error: "Order has already been paid" }, 409);
      if (orderStatus !== "PENDING") return json({ error: "Order is not payable" }, 409);

      const orderTotal = Number(order.final_price);
      if (order.is_free_order || !Number.isFinite(orderTotal) || orderTotal <= 0) {
        return json({ error: "This order does not require a Paystack payment" }, 400);
      }

      amountMinor = Math.round(orderTotal * 100);
      if (Number.isFinite(requestedAmountMinor) && Math.round(requestedAmountMinor) !== amountMinor) {
        return json({ error: "Payment amount does not match the current order total", amount: orderTotal }, 409);
      }

      canonicalMetadata = {
        ...requestedMetadata,
        order_id: order.id,
        product_id: order.product_id,
        seller_id: order.seller_id,
        buyer_id: user.id,
        authoritative_amount: orderTotal,
      };
    } else if (["subscription", "affiliate_subscription", "vendor_subscription"].includes(purpose)) {
      // Subscription amount and purpose come from the active plan, not the browser.
      const planId = typeof requestedMetadata.plan_id === "string" ? requestedMetadata.plan_id.trim() : "";
      if (!planId) return json({ error: "Subscription plan is required" }, 400);

      const { data: plan, error: planError } = await supabase
        .from("subscription_plans")
        .select("id,slug,name,plan_type,amount,currency,interval,is_active")
        .eq("id", planId)
        .maybeSingle();

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

      if (Number.isFinite(requestedAmountMinor) && Math.round(requestedAmountMinor) !== amountMinor) {
        return json({ error: "Payment amount does not match the current subscription price", amount: planAmount }, 409);
      }

      canonicalMetadata = {
        ...requestedMetadata,
        plan_id: plan.id,
        plan_slug: plan.slug,
        plan_name: plan.name,
        plan_type: plan.plan_type,
        plan_interval: plan.interval,
        user_id: user.id,
        authoritative_amount: planAmount,
      };
    } else if (purpose === "promotion_campaign") {
      // ST-5B: the campaign row is the source of truth for seller, amount and currency.
      // A browser may identify the campaign, but it cannot choose payable financial state.
      if (!referenceId) return json({ error: "Promotion campaign reference is required" }, 400);

      const { data: campaign, error: campaignError } = await supabase
        .from("promotion_campaigns")
        .select("id,seller_id,listing_id,listing_type,budget,billing_currency,status,payment_status,payment_id")
        .eq("id", referenceId)
        .maybeSingle();

      if (campaignError) return json({ error: "Unable to validate promotion campaign" }, 500);
      if (!campaign) return json({ error: "Promotion campaign not found" }, 404);
      if (campaign.seller_id !== user.id) return json({ error: "Promotion campaign does not belong to authenticated user" }, 403);
      if (campaign.status !== "pending" || campaign.payment_status !== "pending" || campaign.payment_id) {
        return json({ error: "Promotion campaign is not awaiting payment" }, 409);
      }

      const campaignAmount = Number(campaign.budget);
      const campaignCurrency = String(campaign.billing_currency || "").toUpperCase();
      if (!Number.isFinite(campaignAmount) || campaignAmount <= 0) {
        return json({ error: "Promotion campaign has an invalid payable amount" }, 409);
      }
      if (!campaignCurrency) {
        return json({ error: "Promotion campaign billing currency is not configured" }, 409);
      }

      const { data: provider, error: providerError } = await supabase
        .from("payment_providers")
        .select("slug,status,supported_currencies")
        .eq("slug", "paystack")
        .maybeSingle();

      if (providerError) return json({ error: "Unable to validate payment provider" }, 500);
      if (!provider || provider.status !== "enabled") {
        return json({ error: "Paystack is not enabled for promotion payments" }, 503);
      }

      const supportedCurrencies = Array.isArray(provider.supported_currencies)
        ? provider.supported_currencies.map((value: unknown) => String(value).toUpperCase())
        : [];
      if (!supportedCurrencies.includes(campaignCurrency)) {
        return json({ error: `Paystack does not support ${campaignCurrency} for this promotion` }, 409);
      }

      amountMinor = Math.round(campaignAmount * 100);
      paymentCurrency = campaignCurrency;
      referenceId = campaign.id;

      if (Number.isFinite(requestedAmountMinor) && Math.round(requestedAmountMinor) !== amountMinor) {
        return json({ error: "Payment amount does not match the canonical campaign budget", amount: campaignAmount, currency: campaignCurrency }, 409);
      }

      canonicalMetadata = {
        ...requestedMetadata,
        campaign_id: campaign.id,
        listing_id: campaign.listing_id,
        listing_type: campaign.listing_type,
        seller_id: user.id,
        authoritative_amount: campaignAmount,
        authoritative_currency: campaignCurrency,
        provider: "paystack",
      };
    } else {
      // Wallet/advertiser funding remains user-selected NGN money and is validated in minor units.
      if (!Number.isSafeInteger(amountMinor) || amountMinor < MIN_FUNDING_MINOR) {
        return json({ error: "Minimum amount is 100 NGN" }, 400);
      }
      canonicalMetadata = {
        ...requestedMetadata,
        user_id: user.id,
        authoritative_amount: amountMinor / 100,
      };
    }

    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
      return json({ error: "Invalid payment amount" }, 400);
    }

    if (!PAYSTACK_SECRET) {
      return json({ error: "Paystack not configured. Set PAYSTACK_SECRET_KEY." }, 503);
    }

    const { data: userData } = await supabase
      .from("users")
      .select("email, full_name")
      .eq("id", user.id)
      .maybeSingle();

    const email = user.email || userData?.email;
    if (!email) {
      log("WARN", "User email not found", { userId: user.id });
      return json({ error: "User email not found" }, 400);
    }

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
      source: "dright_server",
    };

    log("INFO", "Initialize authoritative payment", {
      userId: user.id,
      amount: amountMajor,
      currency: paymentCurrency,
      purpose,
      reference_id: referenceId,
    });

    // Fail closed: never send a customer to Paystack unless DRIGHT has first
    // persisted the transaction that will later be verified and processed.
    const { error: insertErr } = await supabase.from("paystack_transactions").insert({
      user_id: user.id,
      reference,
      amount: amountMajor,
      currency: paymentCurrency,
      purpose,
      reference_id: referenceId,
      status: "initialized",
      metadata: canonicalMetadata,
      idempotency_key: reference,
    });

    if (insertErr) {
      log("ERROR", "Failed to create transaction record", { reference, error: insertErr.message });
      return json({ error: "Unable to create payment transaction" }, 500);
    }

    const clientInfo = {
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null,
      userAgent: req.headers.get("user-agent") || null,
    };

    await supabase.from("payment_attempts").insert({
      user_id: user.id,
      reference,
      provider: "paystack",
      amount: amountMajor,
      currency: paymentCurrency,
      status: "initialized",
      purpose,
      ip_address: clientInfo.ip,
      device_info: clientInfo.userAgent,
      user_agent: clientInfo.userAgent,
      metadata: canonicalMetadata,
    }).then(() => log("INFO", "Payment attempt recorded", { reference }))
      .catch((error) => log("WARN", "Failed to record payment attempt", {
        reference,
        error: error instanceof Error ? error.message : String(error),
      }));

    const paystackRes = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        amount: amountMinor,
        currency: paymentCurrency,
        reference,
        callback_url: `${appUrl}${callbackPath}?reference=${encodeURIComponent(reference)}`,
        channels: normalizeChannels(body.channels),
        metadata: {
          user_id: user.id,
          purpose,
          reference_id: referenceId,
          custom_fields: [
            { display_name: "User ID", variable_name: "user_id", value: user.id },
            { display_name: "Purpose", variable_name: "purpose", value: purpose },
          ],
        },
      }),
    });

    const paystackData = await paystackRes.json().catch(() => ({}));

    if (!paystackRes.ok || !paystackData.status || !paystackData.data) {
      const message = String(paystackData.message || `Paystack initialization failed (${paystackRes.status})`);
      log("ERROR", "Paystack initialization failed", { reference, message });
      await supabase.from("paystack_transactions")
        .update({ status: "failed", gateway_response: message, updated_at: new Date().toISOString() })
        .eq("reference", reference);

      return json({ error: message }, 400);
    }

    await supabase.from("paystack_transactions")
      .update({ paystack_reference: paystackData.data.reference, status: "pending", updated_at: new Date().toISOString() })
      .eq("reference", reference);

    log("INFO", "Paystack initialization successful", { reference, paystackRef: paystackData.data.reference });

    return json({
      success: true,
      authorization_url: paystackData.data.authorization_url,
      access_code: paystackData.data.access_code,
      reference,
      amount: amountMajor,
      currency: paymentCurrency,
      purpose,
      reference_id: referenceId,
    });
  } catch (err) {
    log("ERROR", "Unhandled exception", { error: err instanceof Error ? err.message : String(err) });
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
