import { createClient } from "npm:@supabase/supabase-js@2.110.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

type SourceType = "affiliate" | "sales_team" | "advertiser" | "pro_advertiser" | "super_advertiser" | "partnership";

interface CheckoutRequest {
  // Kept for backwards compatibility, but never trusted for identity.
  buyer_id?: string;
  product_id: string;
  selected_tier_id?: string;
  customization_option_ids?: string[];
  buyer_requirements?: string;
  // Legacy affiliate code. It is resolved server-side only.
  ref_code?: string;
  // Authoritative link identifiers are resolved server-side.
  tracking_code?: string;
  referral_link_id?: string;
  visitor_id?: string;
  session_id?: string;
  checkout_id?: string;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isSourceType(value: unknown): value is SourceType {
  return [
    "affiliate",
    "sales_team",
    "advertiser",
    "pro_advertiser",
    "super_advertiser",
    "partnership",
  ].includes(String(value));
}

function usesAttributedTaskPool(sourceType: SourceType | null): boolean {
  return sourceType !== null && [
    "sales_team",
    "advertiser",
    "pro_advertiser",
    "super_advertiser",
    "partnership",
  ].includes(sourceType);
}

function expectedAdvertiserGrade(sourceType: SourceType, sourceLevel: string | null): string | null {
  if (sourceType === "pro_advertiser") return "Pro";
  if (sourceType === "super_advertiser") return "Super";
  if (sourceType === "partnership") return "Partnership";
  if (sourceType !== "advertiser") return null;

  const normalized = String(sourceLevel || "").trim().toLowerCase();
  if (/(^|\s)(adv\s*)?a$/.test(normalized)) return "A";
  if (/(^|\s)(adv\s*)?b$/.test(normalized)) return "B";
  if (/(^|\s)(adv\s*)?c$/.test(normalized)) return "C";
  return null;
}

function productSourceCurrency(product: Record<string, any>): string {
  const specs = product?.specifications && typeof product.specifications === "object" && !Array.isArray(product.specifications)
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
      const sourcePerUsd = Number(payload?.rates?.[sourceCurrency]);
      if (Number.isFinite(sourcePerUsd) && sourcePerUsd > 0) {
        return { rate: 1 / sourcePerUsd, source: candidate.source };
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Missing auth" }, 401);

    // The authenticated Supabase identity is the only trusted buyer identity.
    const token = authHeader.slice("Bearer ".length);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const body: CheckoutRequest = await req.json();
    const { product_id, selected_tier_id, customization_option_ids, buyer_requirements } = body;
    if (!product_id) return json({ error: "Missing product_id" }, 400);

    // Never accept a browser-supplied buyer_id for another account.
    if (body.buyer_id && body.buyer_id !== user.id) return json({ error: "Buyer identity mismatch" }, 403);
    const buyerId = user.id;

    // 1. Fetch and validate product from the database.
    const { data: product, error: productErr } = await supabase
      .from("products")
      .select("*")
      .eq("id", product_id)
      .maybeSingle();

    if (productErr || !product) return json({ error: "Product not found" }, 404);
    if (product.approval_status !== "approved" || product.is_hidden || !product.is_active) {
      return json({ error: "Product is not available for purchase" }, 400);
    }

    // 2. Reuse the existing referral_links system. The client may provide a
    // link id or code, but ownership/source/product are always read server-side.
    let referralLink: {
      id: string;
      user_id: string;
      unique_code: string;
      product_id: string | null;
      source_type: string | null;
      source_level: string | null;
      campaign_id: string | null;
      sales_team_id: string | null;
      team_member_id: string | null;
      team_lead_id: string | null;
    } | null = null;

    if (body.referral_link_id) {
      const { data } = await supabase
        .from("referral_links")
        .select("id,user_id,unique_code,product_id,source_type,source_level,campaign_id,sales_team_id,team_member_id,team_lead_id")
        .eq("id", body.referral_link_id)
        .maybeSingle();
      referralLink = data;
    } else if (body.tracking_code) {
      const { data } = await supabase
        .from("referral_links")
        .select("id,user_id,unique_code,product_id,source_type,source_level,campaign_id,sales_team_id,team_member_id,team_lead_id")
        .eq("unique_code", body.tracking_code)
        .maybeSingle();
      referralLink = data;
    }

    // Backwards-compatible legacy referral_code resolution. This is not used
    // when a persistent referral link was supplied.
    let referrerId: string | null = null;
    let referrerRole: string | null = null;
    let sourceType: SourceType | null = null;
    let sourceLevel: string | null = null;
    let campaignId: string | null = null;
    let salesTeamId: string | null = null;
    let teamMemberId: string | null = null;
    let teamLeadId: string | null = null;
    let referralLinkId: string | null = null;
    let trackingCode: string | null = null;

    if (referralLink) {
      // A product-specific link may only attribute its configured product.
      if (referralLink.product_id && referralLink.product_id !== product_id) {
        return json({ error: "Tracking link is not valid for this product" }, 400);
      }

      referrerId = referralLink.user_id;
      sourceType = isSourceType(referralLink.source_type) ? referralLink.source_type : "affiliate";
      sourceLevel = referralLink.source_level;
      campaignId = referralLink.campaign_id;
      salesTeamId = referralLink.sales_team_id;
      teamMemberId = referralLink.team_member_id;
      teamLeadId = referralLink.team_lead_id;
      referralLinkId = referralLink.id;
      trackingCode = referralLink.unique_code;

      const { data: referrer } = await supabase
        .from("users")
        .select("id,role,marketer_status,marketer_level,advertiser_status,advertiser_grade,account_status")
        .eq("id", referrerId)
        .maybeSingle();

      if (!referrer || String(referrer.account_status || "").toUpperCase() !== "ACTIVE") {
        referrerId = null;
        sourceType = null;
        sourceLevel = null;
        campaignId = null;
        salesTeamId = null;
        teamMemberId = null;
        teamLeadId = null;
        referralLinkId = null;
        trackingCode = null;
      } else {
        referrerRole = referrer.role;

        // Validate privileged attribution from authoritative account state. The
        // paid conversion boundary revalidates this again before any payout.
        if (sourceType === "sales_team") {
          if (String(referrer.marketer_status || "").toLowerCase() !== "approved" || Number(referrer.marketer_level || 0) < 3) {
            return json({ error: "Sales Team attribution is not eligible for this account" }, 403);
          }
          const levelMatch = String(sourceLevel || "").match(/(?:mkt\s*l?)?([3-5])$/i);
          if (levelMatch && Number(levelMatch[1]) !== Number(referrer.marketer_level || 0)) {
            return json({ error: "Sales Team level does not match this attribution link" }, 403);
          }
        }

        if (["advertiser", "pro_advertiser", "super_advertiser", "partnership"].includes(sourceType)) {
          if (String(referrer.advertiser_status || "").toLowerCase() !== "approved") {
            return json({ error: "Advertising attribution is not approved for this account" }, 403);
          }

          const grade = String(referrer.advertiser_grade || "");
          const required = expectedAdvertiserGrade(sourceType, sourceLevel);
          if (sourceType === "advertiser") {
            if (!["A", "B", "C"].includes(grade)) {
              return json({ error: "Advertising attribution is not eligible for this account" }, 403);
            }
            if (required && grade.toLowerCase() !== required.toLowerCase()) {
              return json({ error: "Advertiser grade does not match this attribution link" }, 403);
            }
          } else if (!required || grade.toLowerCase() !== required.toLowerCase()) {
            return json({ error: "Advertising attribution is not eligible for this account" }, 403);
          }
        }
      }
    } else if (body.ref_code) {
      const { data: referrer } = await supabase
        .from("users")
        .select("id,role,account_status")
        .eq("referral_code", body.ref_code)
        .maybeSingle();

      if (referrer && String(referrer.account_status || "").toUpperCase() === "ACTIVE") {
        referrerId = referrer.id;
        referrerRole = referrer.role;
        sourceType = "affiliate";
        trackingCode = body.ref_code;
      }
    }

    // Prevent self-attribution.
    if (referrerId === buyerId) {
      referrerId = null;
      referrerRole = null;
      sourceType = null;
      sourceLevel = null;
      campaignId = null;
      salesTeamId = null;
      teamMemberId = null;
      teamLeadId = null;
      referralLinkId = null;
      trackingCode = null;
    }

    // 3. Stable checkout id is the idempotency boundary for order creation.
    // The frontend can reuse it across retries/refreshes. If omitted, we create
    // one for this request and return it for subsequent payment initialization.
    const checkoutId = body.checkout_id?.trim() || crypto.randomUUID();
    const { data: existingOrder } = await supabase
      .from("orders")
      .select("id,status,final_price,is_free_order,download_token,source_currency,source_final_price")
      .eq("checkout_id", checkoutId)
      .maybeSingle();

    if (existingOrder) {
      return json({
        success: true,
        order_id: existingOrder.id,
        status: existingOrder.status,
        final_price: Number(existingOrder.final_price),
        is_free_order: existingOrder.is_free_order,
        requires_payment: !existingOrder.is_free_order,
        download_token: existingOrder.download_token,
        idempotent: true,
        checkout_id: checkoutId,
      });
    }

    // 4. Fetch service tier.
    let tierPrice = 0;
    if (selected_tier_id && product.product_type === "SERVICE") {
      const { data: tier } = await supabase
        .from("service_tiers")
        .select("*")
        .eq("id", selected_tier_id)
        .eq("product_id", product_id)
        .maybeSingle();
      if (tier) tierPrice = Number(tier.price);
    }

    // 5. Fetch customization options.
    let customizationPrice = 0;
    let customizationData: Array<{ id: string; name: string; price: number }> = [];
    if (customization_option_ids?.length && product.product_type === "SERVICE") {
      const { data: options } = await supabase
        .from("customization_options")
        .select("*")
        .in("id", customization_option_ids)
        .eq("product_id", product_id);
      if (options) {
        customizationPrice = options.reduce((sum: number, opt: any) => sum + Number(opt.additional_price), 0);
        customizationData = options.map((opt: any) => ({
          id: opt.id,
          name: opt.option_name,
          price: Number(opt.additional_price),
        }));
      }
    }

    // 6. Calculate source-currency buyer pricing, then normalize the order
    // ledger amounts to canonical USD. This prevents an NGN 5,000 product from
    // being interpreted as USD 5,000 while keeping the existing wallet/ledger
    // accounting contract stable.
    const sourceCurrency = productSourceCurrency(product);
    const sourceBasePrice = Number(product.price);
    const isFree = product.is_free || sourceBasePrice === 0;
    const affiliateCommPercent = Number(product.affiliate_commission_percent || 0);
    const adminTaskPct = Number(product.admin_task_percent || 15);
    const salesTeamPct = Number(product.sales_team_task_percent || 0);

    let sourceAffiliateCommissionAmount = 0;
    let sourceAdminTaskAmount = 0;
    let sourceSalesTeamTaskAmount = 0;
    let sourceFinalPrice = 0;
    let sourceSellerEarnings = 0;

    if (!isFree) {
      const sourceSubtotal = sourceBasePrice + tierPrice + customizationPrice;
      const attributedTaskPool = usesAttributedTaskPool(sourceType) && salesTeamPct > 0;
      const effectiveTaskPct = attributedTaskPool ? salesTeamPct : adminTaskPct;
      const sourceTaskAmount = (sourceBasePrice * effectiveTaskPct) / 100;

      sourceAffiliateCommissionAmount = sourceType === "affiliate" ? (sourceBasePrice * affiliateCommPercent) / 100 : 0;
      sourceAdminTaskAmount = attributedTaskPool ? 0 : sourceTaskAmount;
      sourceSalesTeamTaskAmount = attributedTaskPool ? sourceTaskAmount : 0;
      sourceFinalPrice = sourceSubtotal + sourceTaskAmount;
      sourceSellerEarnings = sourceBasePrice - sourceAffiliateCommissionAmount;
    }

    const isFreeOrder = isFree || sourceFinalPrice === 0;
    const fx = isFreeOrder ? { rate: 1, source: "free_order" } : await getSourceToUsdRate(sourceCurrency);
    const toUsd = (value: number) => sourceCurrency === "USD" ? money(value) : money(value * fx.rate);

    const basePrice = toUsd(sourceBasePrice);
    const canonicalTierPrice = toUsd(tierPrice);
    const canonicalCustomizationPrice = toUsd(customizationPrice);
    const affiliateCommissionAmount = toUsd(sourceAffiliateCommissionAmount);
    const adminTaskAmount = toUsd(sourceAdminTaskAmount);
    const salesTeamTaskAmount = toUsd(sourceSalesTeamTaskAmount);
    const finalPrice = toUsd(sourceFinalPrice);
    const sellerEarnings = toUsd(sourceSellerEarnings);

    const orderStatus = isFreeOrder ? "COMPLETED" : "PENDING";
    const downloadToken = ["DIGITAL", "COURSE"].includes(String(product.product_type || "").toUpperCase())
      ? crypto.randomUUID()
      : null;
    const attributionAt = referrerId ? new Date().toISOString() : null;

    // 7. Create the order. All attribution comes from server-resolved records.
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        buyer_id: buyerId,
        product_id,
        seller_id: product.uploaded_by,
        order_type: product.product_type || "PHYSICAL",
        status: orderStatus,
        base_price: basePrice,
        tier_price: canonicalTierPrice,
        customization_price: canonicalCustomizationPrice,
        admin_task_amount: adminTaskAmount,
        sales_team_task_amount: salesTeamTaskAmount,
        affiliate_commission_amount: affiliateCommissionAmount,
        final_price: finalPrice,
        source_currency: sourceCurrency,
        source_base_price: sourceBasePrice,
        source_final_price: sourceFinalPrice,
        source_to_usd_rate: fx.rate,
        selected_tier_id: selected_tier_id || null,
        customization_options: customizationData.length ? customizationData : null,
        buyer_requirements: buyer_requirements || null,
        download_token: downloadToken,
        referrer_id: referrerId,
        referrer_role: referrerRole,
        referral_link_id: referralLinkId,
        tracking_code: trackingCode,
        source_type: sourceType,
        source_level: sourceLevel,
        campaign_id: campaignId,
        sales_team_id: salesTeamId,
        team_member_id: teamMemberId,
        team_lead_id: teamLeadId,
        visitor_id: body.visitor_id || null,
        session_id: body.session_id || null,
        attribution_at: attributionAt,
        checkout_id: checkoutId,
        is_free_order: isFreeOrder,
        completed_at: isFreeOrder ? new Date().toISOString() : null,
      })
      .select("id")
      .single();

    if (orderErr) {
      // Unique checkout_id race: return the already-created order instead of duplicating it.
      if (orderErr.code === "23505") {
        const { data: racedOrder } = await supabase
          .from("orders")
          .select("id,status,final_price,is_free_order,download_token")
          .eq("checkout_id", checkoutId)
          .maybeSingle();
        if (racedOrder) {
          return json({
            success: true,
            order_id: racedOrder.id,
            status: racedOrder.status,
            final_price: Number(racedOrder.final_price),
            is_free_order: racedOrder.is_free_order,
            requires_payment: !racedOrder.is_free_order,
            download_token: racedOrder.download_token,
            idempotent: true,
            checkout_id: checkoutId,
          });
        }
      }
      return json({ error: "Failed to create order: " + orderErr.message }, 500);
    }

    // 8. Free orders complete immediately. Paid-order commission is NOT credited
    // here: payment success must be the conversion boundary, preventing payment
    // retries/refunds from creating duplicate earnings.
    if (isFreeOrder) {
      await supabase.rpc("increment_sales_counts", { user_id: buyerId });

      if (product.stock_quantity !== null) {
        const newStock = Math.max(0, product.stock_quantity - 1);
        await supabase.from("products").update({ stock_quantity: newStock }).eq("id", product_id);
      }

      await supabase.from("sales_records").insert({
        promoter_id: buyerId,
        buyer_name: "Free Order",
        product_name: product.name,
        commission_amount: 0,
        sale_amount: 0,
        product_id,
        referrer_id: referrerId,
        referrer_role: referrerRole && ["affiliate", "marketer", "advertiser", "admin"].includes(referrerRole) ? referrerRole : null,
        status: "paid",
      });

      if (referrerId && sourceType === "affiliate") {
        await supabase.rpc("increment_referral_conversions", { p_referrer_id: referrerId });
      }
    }

    // 9. Seller notification remains best-effort and does not affect order creation.
    const { error: sellerNotificationError } = await supabase.from("notifications").insert({
      user_id: product.uploaded_by,
      title: "New Order Received!",
      message: `A customer purchased "${product.name}" for ${sourceFinalPrice.toFixed(2)} ${sourceCurrency}.`,
      notification_type: "new_order",
      category: "orders",
      priority: "high",
      metadata: {
        product_title: product.name,
        product_price: sourceFinalPrice,
        product_currency: sourceCurrency,
        product_image: product.image_url || null,
        action_url: "/my-orders",
        event_module: "marketplace",
        event_type: "product_purchased",
        order_id: order.id,
        source_type: sourceType,
        referral_link_id: referralLinkId,
      },
      group_key: `order:${product.uploaded_by}:${product_id}`,
      is_read: false,
      is_archived: false,
      is_deleted: false,
    });
    if (sellerNotificationError) console.warn("[checkout] seller notification failed", sellerNotificationError.message);

    const { error: notificationLogError } = await supabase.from("notification_event_log").insert({
      event_type: "marketplace.product_purchased",
      module: "marketplace",
      actor_id: buyerId,
      recipient_ids: [product.uploaded_by],
      priority: "high",
      category: "orders",
      group_key: `order:${product.uploaded_by}:${product_id}`,
      metadata: {
        product_id,
        product_title: product.name,
        price: sourceFinalPrice,
        currency: sourceCurrency,
        buyer_id: buyerId,
        order_id: order.id,
        source_type: sourceType,
        referral_link_id: referralLinkId,
        campaign_id: campaignId,
        sales_team_id: salesTeamId,
        team_member_id: teamMemberId,
        team_lead_id: teamLeadId,
      },
      processed: true,
    });
    if (notificationLogError) console.warn("[checkout] notification event log failed", notificationLogError.message);

    return json({
      success: true,
      order_id: order.id,
      status: orderStatus,
      final_price: finalPrice,
      source_final_price: sourceFinalPrice,
      source_currency: sourceCurrency,
      is_free_order: isFreeOrder,
      requires_payment: !isFreeOrder,
      download_token: downloadToken,
      checkout_id: checkoutId,
      attribution: {
        referrer_id: referrerId,
        referral_link_id: referralLinkId,
        tracking_code: trackingCode,
        source_type: sourceType,
        source_level: sourceLevel,
        campaign_id: campaignId,
        sales_team_id: salesTeamId,
        team_member_id: teamMemberId,
        team_lead_id: teamLeadId,
      },
      pricing: {
        base_price: basePrice,
        tier_price: canonicalTierPrice,
        customization_price: canonicalCustomizationPrice,
        admin_task_amount: adminTaskAmount,
        sales_team_task_amount: salesTeamTaskAmount,
        affiliate_commission_amount: affiliateCommissionAmount,
        final_price: finalPrice,
        seller_earnings: sellerEarnings,
        source: {
          currency: sourceCurrency,
          base_price: sourceBasePrice,
          tier_price: tierPrice,
          customization_price: customizationPrice,
          admin_task_amount: sourceAdminTaskAmount,
          sales_team_task_amount: sourceSalesTeamTaskAmount,
          affiliate_commission_amount: sourceAffiliateCommissionAmount,
          final_price: sourceFinalPrice,
          seller_earnings: sourceSellerEarnings,
          usd_rate: fx.rate,
          fx_source: fx.source,
        },
      },
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});