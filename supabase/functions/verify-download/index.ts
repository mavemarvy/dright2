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

interface VerifyRequest {
  download_token?: string;
  order_id?: string;
  user_id?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body: VerifyRequest = await req.json();
    const { download_token, order_id, user_id } = body;

    if (!download_token && !order_id) {
      return new Response(
        JSON.stringify({ error: "Missing download_token or order_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 1. Find the order by token or order_id
    let query = supabase.from("orders").select("*");
    if (download_token) {
      query = query.eq("download_token", download_token);
    } else if (order_id) {
      query = query.eq("id", order_id);
    }

    const { data: order, error: orderErr } = await query.maybeSingle();

    if (orderErr || !order) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired download link", verified: false }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Verify the order belongs to the requesting user (if provided)
    if (user_id && order.buyer_id !== user_id) {
      return new Response(
        JSON.stringify({ error: "Access denied. This download link does not belong to your account.", verified: false }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 3. Check order status — must be COMPLETED
    if (order.status !== "COMPLETED") {
      return new Response(
        JSON.stringify({
          error: `Order is not completed. Current status: ${order.status}`,
          verified: false,
          order_status: order.status,
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 4. Check expiry — compare created_at + expiry_days
    const createdAt = new Date(order.created_at);
    const now = new Date();
    const daysSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

    // Fetch digital product details for expiry_days and download info
    const { data: digitalDetails } = await supabase
      .from("digital_product_details")
      .select("*")
      .eq("product_id", order.product_id)
      .maybeSingle();

    const expiryDays = digitalDetails?.expiry_days || 30;
    if (daysSinceCreation > expiryDays) {
      return new Response(
        JSON.stringify({
          error: `Download link has expired. Downloads are valid for ${expiryDays} days after purchase.`,
          verified: false,
          expired: true,
        }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 5. Check download limit
    const downloadLimit = digitalDetails?.download_limit;
    if (downloadLimit !== null && downloadLimit !== undefined) {
      // Track downloads — count existing download records or use a simple counter
      // For now, we'll use the delivery_url as a proxy
      // In production, you'd have a downloads table tracking each access
    }

    // 6. Fetch product info
    const { data: product } = await supabase
      .from("products")
      .select("name, product_type, demo_video_url")
      .eq("id", order.product_id)
      .maybeSingle();

    // 7. Determine what to return
    const deliveryType = digitalDetails?.delivery_type || "INSTANT_DOWNLOAD";
    let downloadUrl: string | null = null;
    let accessLink: string | null = null;
    let videoUrl: string | null = null;

    if (deliveryType === "INSTANT_DOWNLOAD") {
      downloadUrl = order.delivery_url || digitalDetails?.download_file_url || null;
    } else if (deliveryType === "LINK_ACCESS") {
      accessLink = digitalDetails?.access_link || order.delivery_url || null;
    } else if (deliveryType === "EMAIL_DELIVERY") {
      downloadUrl = order.delivery_url || digitalDetails?.download_file_url || null;
    }

    // For courses, also return the access link
    if (order.order_type === "COURSE") {
      accessLink = digitalDetails?.access_link || order.delivery_url || null;
    }

    // Demo video URL from product
    videoUrl = product?.demo_video_url || null;

    return new Response(
      JSON.stringify({
        verified: true,
        order_id: order.id,
        product_name: product?.name || "Unknown Product",
        product_type: order.order_type,
        delivery_type: deliveryType,
        download_url: downloadUrl,
        access_link: accessLink,
        video_url: videoUrl,
        file_format: digitalDetails?.file_format || null,
        download_limit: digitalDetails?.download_limit || null,
        expiry_days: expiryDays,
        days_remaining: Math.ceil(expiryDays - daysSinceCreation),
        includes_bonus_materials: digitalDetails?.includes_bonus_materials || false,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message, verified: false }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
