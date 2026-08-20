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

interface CheckoutRequest {
  buyer_id: string;
  product_id: string;
  selected_tier_id?: string;
  customization_option_ids?: string[];
  buyer_requirements?: string;
  ref_code?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body: CheckoutRequest = await req.json();
    const { buyer_id, product_id, selected_tier_id, customization_option_ids, buyer_requirements } = body;

    if (!buyer_id || !product_id) {
      return new Response(
        JSON.stringify({ error: "Missing buyer_id or product_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 1. Fetch product
    const { data: product, error: productErr } = await supabase
      .from("products")
      .select("*")
      .eq("id", product_id)
      .maybeSingle();

    if (productErr || !product) {
      return new Response(
        JSON.stringify({ error: "Product not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (product.approval_status !== "approved" || product.is_hidden || !product.is_active) {
      return new Response(
        JSON.stringify({ error: "Product is not available for purchase" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Fetch service tier (if applicable)
    let tierPrice = 0;
    if (selected_tier_id && product.product_type === "SERVICE") {
      const { data: tier } = await supabase
        .from("service_tiers")
        .select("*")
        .eq("id", selected_tier_id)
        .eq("product_id", product_id)
        .maybeSingle();

      if (tier) {
        tierPrice = Number(tier.price);
      }
    }

    // 3. Fetch customization options
    let customizationPrice = 0;
    let customizationData: Array<{ id: string; name: string; price: number }> = [];
    if (customization_option_ids && customization_option_ids.length > 0 && product.product_type === "SERVICE") {
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

    // 4. Resolve referrer from affiliate code
    let referrerId: string | null = null;
    let referrerRole: string | null = null;
    const refCode = body.ref_code || null;
    if (refCode) {
      const { data: referrer } = await supabase
        .from("users")
        .select("id, role")
        .eq("referral_code", refCode)
        .maybeSingle();

      if (referrer) {
        referrerId = referrer.id;
        referrerRole = referrer.role;
      }
    }

    // 5. Calculate pricing
    const isFree = product.is_free || Number(product.price) === 0;
    const basePrice = Number(product.price);
    const affiliateCommPercent = Number(product.affiliate_commission_percent || 0);
    const adminTaskPct = Number(product.admin_task_percent || 15);
    const salesTeamPct = Number(product.sales_team_task_percent || 0);

    let affiliateCommissionAmount = 0;
    let adminTaskAmount = 0;
    let salesTeamTaskAmount = 0;
    let finalPrice = 0;
    let sellerEarnings = 0;

    if (isFree) {
      finalPrice = 0;
    } else {
      const subtotal = basePrice + tierPrice + customizationPrice;
      affiliateCommissionAmount = (basePrice * affiliateCommPercent) / 100;
      const effectiveTaskPct = salesTeamPct > 0 ? salesTeamPct : adminTaskPct;
      const taskAmount = (basePrice * effectiveTaskPct) / 100;
      adminTaskAmount = salesTeamPct > 0 ? 0 : taskAmount;
      salesTeamTaskAmount = salesTeamPct > 0 ? taskAmount : 0;
      finalPrice = subtotal + taskAmount;
      sellerEarnings = basePrice - affiliateCommissionAmount;
    }

    const isFreeOrder = isFree || finalPrice === 0;

    // 6. Create order
    const orderStatus = isFreeOrder ? "COMPLETED" : "PENDING";
    const downloadToken = product.product_type === "DIGITAL"
      ? crypto.randomUUID()
      : null;

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        buyer_id,
        product_id,
        seller_id: product.uploaded_by,
        order_type: product.product_type || "PHYSICAL",
        status: orderStatus,
        base_price: basePrice,
        tier_price: tierPrice,
        customization_price: customizationPrice,
        admin_task_amount: adminTaskAmount,
        sales_team_task_amount: salesTeamTaskAmount,
        affiliate_commission_amount: affiliateCommissionAmount,
        final_price: finalPrice,
        selected_tier_id: selected_tier_id || null,
        customization_options: customizationData.length > 0 ? customizationData : null,
        buyer_requirements: buyer_requirements || null,
        download_token: downloadToken,
        referrer_id: referrerId,
        referrer_role: referrerRole,
        is_free_order: isFreeOrder,
        completed_at: isFreeOrder ? new Date().toISOString() : null,
      })
      .select("id")
      .single();

    if (orderErr) {
      return new Response(
        JSON.stringify({ error: "Failed to create order: " + orderErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 7. For free orders: increment weekly_sales_count + decrement stock
    if (isFreeOrder) {
      await supabase.rpc("increment_sales_counts", { user_id: buyer_id });

      if (product.stock_quantity !== null) {
        const newStock = Math.max(0, product.stock_quantity - 1);
        await supabase
          .from("products")
          .update({ stock_quantity: newStock })
          .eq("id", product_id);
      }

      // Record in sales_records for tracking
      await supabase.from("sales_records").insert({
        promoter_id: buyer_id,
        buyer_name: "Free Order",
        product_name: product.name,
        commission_amount: 0,
        sale_amount: 0,
        product_id: product_id,
        referrer_id: referrerId,
        referrer_role: referrerRole,
        status: "paid",
      });
    }

    // 7b. Track referral conversion and add affiliate earnings
    if (referrerId && affiliateCommissionAmount > 0) {
      await supabase.rpc("increment_referral_conversions", { p_referrer_id: referrerId });
      await supabase.rpc("add_affiliate_earnings", {
        p_user_id: referrerId,
        p_amount: affiliateCommissionAmount,
      });
    }

    // 8. Emit notifications via the event engine
    // 8a. Notify seller: product sold
    await supabase.from("notifications").insert({
      user_id: product.uploaded_by,
      title: "New Order Received!",
      message: `A customer purchased "${product.name}" for ${finalPrice.toFixed(2)}.`,
      notification_type: "new_order",
      category: "orders",
      priority: "high",
      metadata: {
        product_title: product.name,
        product_price: finalPrice,
        product_currency: "$",
        product_image: product.image_url || null,
        action_url: "/my-orders",
        event_module: "marketplace",
        event_type: "product_purchased",
        count: 1,
      },
      group_key: `order:${product.uploaded_by}:${product_id}`,
      is_read: false,
      is_archived: false,
      is_deleted: false,
    });

    // 8b. Log event in notification_event_log
    await supabase.from("notification_event_log").insert({
      event_type: "marketplace.product_purchased",
      module: "marketplace",
      actor_id: buyer_id,
      recipient_ids: [product.uploaded_by],
      priority: "high",
      category: "orders",
      group_key: `order:${product.uploaded_by}:${product_id}`,
      metadata: {
        product_id: product_id,
        product_title: product.name,
        price: finalPrice,
        currency: "$",
        buyer_id: buyer_id,
      },
      processed: true,
    });

    // 8c. Notify referrer: commission earned (if applicable)
    if (referrerId && affiliateCommissionAmount > 0) {
      await supabase.from("notifications").insert({
        user_id: referrerId,
        title: "Commission Earned!",
        message: `You earned ${affiliateCommissionAmount.toFixed(2)} commission from a purchase.`,
        notification_type: "affiliate_commission",
        category: "affiliate",
        priority: "high",
        metadata: {
          commission_amount: affiliateCommissionAmount,
          currency: "$",
          action_url: "/sales",
          event_module: "affiliate",
          event_type: "commission_earned",
          count: 1,
        },
        is_read: false,
        is_archived: false,
        is_deleted: false,
      });
    }

    // 9. Return checkout result
    return new Response(
      JSON.stringify({
        success: true,
        order_id: order.id,
        status: orderStatus,
        final_price: finalPrice,
        is_free_order: isFreeOrder,
        requires_payment: !isFreeOrder,
        download_token: downloadToken,
        pricing: {
          base_price: basePrice,
          tier_price: tierPrice,
          customization_price: customizationPrice,
          admin_task_amount: adminTaskAmount,
          sales_team_task_amount: salesTeamTaskAmount,
          affiliate_commission_amount: affiliateCommissionAmount,
          final_price: finalPrice,
          seller_earnings: sellerEarnings,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
