import { createClient } from "npm:@supabase/supabase-js@2.110.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});
const TARGET_TYPES = new Set(["product", "seller", "sales_team"]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const authHeader = req.headers.get("Authorization") || "";
  if (!url || !serviceKey) return json({ error: "Server configuration error" }, 500);
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = authHeader.slice(7).trim();
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Unauthorized" }, 401);
  const reviewerId = authData.user.id;

  try {
    const body = await req.json();
    const targetType = typeof body?.target_type === "string" ? body.target_type : "";
    const targetId = typeof body?.target_id === "string" ? body.target_id : "";
    const rating = Number(body?.rating);
    const reviewText = typeof body?.review_text === "string" ? body.review_text.trim().slice(0, 5000) : null;

    if (!TARGET_TYPES.has(targetType) || !targetId || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return json({ error: "Invalid review payload" }, 400);
    }
    if ((targetType === "seller" || targetType === "sales_team") && targetId === reviewerId) {
      return json({ error: "Self reviews are not allowed" }, 400);
    }

    // Reviews that can affect reputation require a completed marketplace interaction.
    let eligible = false;
    if (targetType === "product") {
      const { data: product } = await admin.from("products").select("id, uploaded_by").eq("id", targetId).maybeSingle();
      if (!product) return json({ error: "Review target not found" }, 404);
      if (product.uploaded_by === reviewerId) return json({ error: "Self reviews are not allowed" }, 400);
      const { data: order } = await admin.from("orders").select("id").eq("buyer_id", reviewerId).eq("product_id", targetId).eq("status", "COMPLETED").limit(1).maybeSingle();
      eligible = !!order;
    } else if (targetType === "seller") {
      const { data: seller } = await admin.from("users").select("id").eq("id", targetId).maybeSingle();
      if (!seller) return json({ error: "Review target not found" }, 404);
      const { data: order } = await admin.from("orders").select("id").eq("buyer_id", reviewerId).eq("seller_id", targetId).eq("status", "COMPLETED").limit(1).maybeSingle();
      eligible = !!order;
    } else {
      const { data: member } = await admin.from("sales_team_members").select("id, user_id").eq("user_id", targetId).eq("status", "active").limit(1).maybeSingle();
      if (!member) return json({ error: "Review target not found" }, 404);
      const { data: order } = await admin.from("orders").select("id").eq("buyer_id", reviewerId).eq("status", "COMPLETED").or(`team_member_id.eq.${member.id},team_lead_id.eq.${member.id}`).limit(1).maybeSingle();
      eligible = !!order;
    }
    if (!eligible) return json({ error: "A completed marketplace interaction is required before reviewing" }, 403);

    const { data: existing } = await admin.from("reviews").select("id").eq("reviewer_id", reviewerId).eq("target_type", targetType).eq("target_id", targetId).limit(1).maybeSingle();
    if (existing) return json({ error: "You have already reviewed this target" }, 409);

    const { data: review, error: reviewError } = await admin.from("reviews").insert({
      reviewer_id: reviewerId,
      target_type: targetType,
      target_id: targetId,
      rating,
      review_text: reviewText || null,
    }).select("id, reviewer_id, target_type, target_id, rating, review_text, created_at").single();
    if (reviewError) throw reviewError;

    const { data: ratings, error: ratingsError } = await admin.from("reviews").select("rating").eq("target_type", targetType).eq("target_id", targetId);
    if (ratingsError) throw ratingsError;
    const values = (ratings || []).map((r: { rating: number }) => Number(r.rating)).filter(Number.isFinite);
    const totalReviews = values.length;
    const averageRating = totalReviews ? Math.round((values.reduce((sum, value) => sum + value, 0) / totalReviews) * 100) / 100 : 0;
    const oneStarCount = values.filter((value) => value === 1).length;
    const triggers: string[] = [];

    if (targetType === "product") {
      await admin.from("products").update({ total_reviews: totalReviews, average_rating: averageRating }).eq("id", targetId);
    } else {
      const { data: targetUser } = await admin.from("users").select("account_status, account_locks_count").eq("id", targetId).maybeSingle();
      if (!targetUser) return json({ error: "Review target not found" }, 404);
      const updates: Record<string, unknown> = { total_reviews: totalReviews, average_rating: averageRating };

      if (rating === 1) {
        triggers.push("1-star notification triggered");
        await admin.from("notifications").insert({
          user_id: targetId,
          title: "You received a 1-star review",
          message: "A verified customer submitted a 1-star review. Please review the feedback and improve service quality.",
          notification_type: "review",
          related_id: review.id,
        });

        if (oneStarCount === 50) {
          triggers.push("50 1-star formal warning triggered");
          await admin.from("notifications").insert({
            user_id: targetId,
            title: "Formal Warning: High 1-star Review Count",
            message: "You have received 50 verified 1-star reviews. Continued poor service may result in account restrictions.",
            notification_type: "review",
            related_id: review.id,
          });
        }

        const currentStatus = String(targetUser.account_status || "ACTIVE").toUpperCase();
        if (oneStarCount >= 100 && currentStatus === "ACTIVE") {
          const newLocks = Number(targetUser.account_locks_count || 0) + 1;
          updates.account_locks_count = newLocks;
          updates.account_status = newLocks >= 3 ? "BANNED" : "LOCKED";
          triggers.push(newLocks >= 3 ? "3 locks → BANNED triggered" : "100+ 1-star account lock triggered");

          await admin.from("products").update({ is_active: false }).eq("uploaded_by", targetId);
          await admin.from("sales_team_contracts").update({ status: "cancelled" }).eq("sales_team_id", targetId).eq("status", "active");
          await admin.from("notifications").insert({
            user_id: targetId,
            title: newLocks >= 3 ? "Account BANNED" : "Account LOCKED",
            message: newLocks >= 3
              ? "Your account has been banned after three review-based account locks. You may submit an appeal."
              : "Your account has been locked after reaching the verified 1-star review threshold. You may submit an appeal.",
            notification_type: "review",
            related_id: review.id,
          });
        }
      }
      await admin.from("users").update(updates).eq("id", targetId);
    }

    return json({ success: true, review, review_id: review.id, triggers });
  } catch (error) {
    console.error("[create-review] failed", error instanceof Error ? error.message : String(error));
    return json({ error: "Review could not be created" }, 500);
  }
});
