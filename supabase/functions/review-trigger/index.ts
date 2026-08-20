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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { reviewer_id, target_type, target_id, rating, review_text } = await req.json();

    if (!reviewer_id || !target_id || !rating) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 1. Insert the review
    const { data: review, error: reviewErr } = await supabase
      .from("reviews")
      .insert({
        reviewer_id,
        target_type,
        target_id,
        rating,
        review_text: review_text || null,
      })
      .select("id")
      .single();

    if (reviewErr) throw reviewErr;

    const results: string[] = [];

    // 2. Update target user's review stats (if target is a user/seller/sales team)
    if (target_type === "seller" || target_type === "sales_team") {
      const { data: targetUser } = await supabase
        .from("users")
        .select("total_reviews, one_star_count, average_rating, account_status, account_locks_count")
        .eq("id", target_id)
        .maybeSingle();

      if (targetUser) {
        const newTotalReviews = (targetUser.total_reviews || 0) + 1;
        const newOneStarCount = (targetUser.one_star_count || 0) + (rating === 1 ? 1 : 0);
        const oldAvg = Number(targetUser.average_rating || 0);
        const oldCount = targetUser.total_reviews || 0;
        const newAvg = oldCount === 0
          ? rating
          : (oldAvg * oldCount + rating) / newTotalReviews;

        const updates: Record<string, unknown> = {
          total_reviews: newTotalReviews,
          one_star_count: newOneStarCount,
          average_rating: Math.round(newAvg * 100) / 100,
        };

        let newStatus = targetUser.account_status || "ACTIVE";

        // Trigger 1: 1-star review → notify QA Admin + Seller
        if (rating === 1) {
          results.push("1-star notification triggered");

          // Notify seller
          await supabase.from("notifications").insert({
            user_id: target_id,
            title: "You received a 1-star review",
            message: `A customer left a 1-star review: "${review_text?.slice(0, 100) || "No comment"}"`,
            notification_type: "review",
            related_id: review.id,
          });

          // Notify QA Admins
          const { data: qaAdmins } = await supabase
            .from("users")
            .select("id")
            .eq("is_admin", true)
            .eq("admin_role", "qa_admin")
            .eq("admin_status", "active");

          if (qaAdmins && qaAdmins.length > 0) {
            await supabase.from("notifications").insert(
              qaAdmins.map((a: { id: string }) => ({
                user_id: a.id,
                title: "New 1-star review alert",
                message: `A 1-star review was submitted for ${target_type} ${target_id}.`,
                notification_type: "review",
                related_id: review.id,
              })),
            );
          }

          // Trigger 2: 50 1-star reviews → formal warning
          if (newOneStarCount === 50) {
            results.push("50 1-star formal warning triggered");
            await supabase.from("notifications").insert({
              user_id: target_id,
              title: "Formal Warning: High 1-star Review Count",
              message: "You have received 50 1-star reviews. Please improve your service quality. Continued poor reviews may result in account lock.",
              notification_type: "review",
              related_id: review.id,
            });

            // Notify QA admins
            if (qaAdmins && qaAdmins.length > 0) {
              await supabase.from("notifications").insert(
                qaAdmins.map((a: { id: string }) => ({
                  user_id: a.id,
                  title: "50 1-star threshold reached",
                  message: `User ${target_id} has reached 50 1-star reviews. Formal warning sent.`,
                  notification_type: "review",
                  related_id: review.id,
                })),
              );
            }
          }

          // Trigger 3: 100 1-star reviews → LOCK account + pause listings/contracts
          if (newOneStarCount >= 100 && newStatus === "ACTIVE") {
            results.push("100 1-star account lock triggered");
            newStatus = "LOCKED";
            updates.account_status = "LOCKED";
            updates.account_locks_count = (targetUser.account_locks_count || 0) + 1;

            await supabase.from("notifications").insert({
              user_id: target_id,
              title: "Account LOCKED",
              message: "Your account has been locked due to 100+ 1-star reviews. Your listings and contracts have been paused.",
              notification_type: "review",
              related_id: review.id,
            });

            // Pause all active products
            await supabase
              .from("products")
              .update({ is_active: false })
              .eq("uploaded_by", target_id);

            // Cancel active sales team contracts
            await supabase
              .from("sales_team_contracts")
              .update({ status: "cancelled" })
              .eq("sales_team_id", target_id)
              .eq("status", "active");

            // Notify QA admins
            if (qaAdmins && qaAdmins.length > 0) {
              await supabase.from("notifications").insert(
                qaAdmins.map((a: { id: string }) => ({
                  user_id: a.id,
                  title: "Account Auto-Locked",
                  message: `User ${target_id} reached 100 1-star reviews. Account locked, listings paused, contracts cancelled.`,
                  notification_type: "review",
                  related_id: review.id,
                })),
              );
            }

            // Trigger 4: 3 account locks → BANNED
            if ((updates.account_locks_count as number) >= 3) {
              results.push("3 locks → BANNED triggered");
              newStatus = "BANNED";
              updates.account_status = "BANNED";

              await supabase.from("notifications").insert({
                user_id: target_id,
                title: "Account BANNED",
                message: "Your account has been banned after 3 account locks. You may submit an appeal from the sign-in page.",
                notification_type: "review",
                related_id: review.id,
              });

              if (qaAdmins && qaAdmins.length > 0) {
                await supabase.from("notifications").insert(
                  qaAdmins.map((a: { id: string }) => ({
                    user_id: a.id,
                    title: "Account Auto-Banned",
                    message: `User ${target_id} has been banned after 3 account locks.`,
                    notification_type: "review",
                    related_id: review.id,
                  })),
                );
              }
            }
          }
        }

        await supabase
          .from("users")
          .update(updates)
          .eq("id", target_id);
      }
    }

    return new Response(
      JSON.stringify({ success: true, review_id: review.id, triggers: results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
