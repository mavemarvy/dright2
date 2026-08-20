import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PAYSTACK_SECRET = Deno.env.get("PAYSTACK_SECRET_KEY") || "";
const PAYSTACK_BASE = "https://api.paystack.co";

function log(level: string, message: string, data?: Record<string, unknown>) {
  const ts = new Date().toISOString();
  const payload = data ? ` ${JSON.stringify(data)}` : "";
  console.log(`[${ts}] [paystack-verify] [${level}] ${message}${payload}`);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      log("WARN", "Missing auth header");
      return new Response(JSON.stringify({ error: "Missing auth" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const token = authHeader.replace("Bearer ", "");
    const { createClient } = await import("npm:@supabase/supabase-js@2");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      log("WARN", "Unauthorized — no user for token");
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const url = new URL(req.url);
    let reference = url.searchParams.get("reference");

    if (!reference) {
      try {
        const body = await req.json();
        reference = body.reference;
      } catch { /* empty body is fine for GET */ }
    }

    if (!reference) {
      log("WARN", "Missing reference parameter");
      return new Response(JSON.stringify({ error: "Missing reference" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    log("INFO", "Verification requested", { reference, userId: user.id });

    // Find our transaction
    const { data: tx, error: txErr } = await supabase
      .from("paystack_transactions")
      .select("*")
      .eq("reference", reference)
      .maybeSingle();

    if (txErr) {
      log("ERROR", "DB error finding transaction", { reference, error: txErr.message });
      return new Response(JSON.stringify({ error: "DB error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!tx) {
      log("WARN", "Transaction not found", { reference });
      return new Response(JSON.stringify({ error: "Transaction not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Idempotency: already fully processed
    if (tx.status === "success" && tx.processed_at) {
      log("INFO", "Transaction already processed — returning idempotent success", { reference });
      return new Response(JSON.stringify({
        success: true,
        status: "success",
        already_verified: true,
        idempotent: true,
        amount: Number(tx.amount),
        purpose: tx.purpose,
        channel: tx.channel,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Free order — no Paystack verification needed
    if (reference.startsWith("free_")) {
      log("INFO", "Free order reference — skipping Paystack verification", { reference });
      return new Response(JSON.stringify({ success: true, status: "success", amount: 0, purpose: "free_order" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!PAYSTACK_SECRET) {
      log("ERROR", "PAYSTACK_SECRET_KEY not configured");
      return new Response(JSON.stringify({ error: "Paystack not configured" }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Verify with Paystack API
    log("INFO", "Verifying with Paystack API", { reference });
    const verifyRes = await fetch(`${PAYSTACK_BASE}/transaction/verify/${reference}`, {
      headers: { "Authorization": `Bearer ${PAYSTACK_SECRET}` },
    });
    const verifyData = await verifyRes.json();

    if (!verifyData.status) {
      log("ERROR", "Paystack API returned error", { reference, message: verifyData.message });
      return new Response(JSON.stringify({
        success: false,
        status: "failed",
        message: verifyData.message || "Verification failed",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const gatewayStatus = verifyData.data.status;
    log("INFO", "Paystack API response", { reference, gatewayStatus });

    if (gatewayStatus === "success") {
      const amountInNaira = verifyData.data.amount / 100;

      // Update transaction record
      await supabase.from("paystack_transactions")
        .update({
          status: "success",
          paystack_reference: verifyData.data.reference,
          gateway_response: verifyData.data.gateway_response,
          paid_at: verifyData.data.paid_at,
          channel: verifyData.data.channel,
          updated_at: new Date().toISOString(),
        })
        .eq("reference", reference);

      // Process payment via idempotent RPC
      log("INFO", "Calling process_paystack_payment RPC", { reference, amount: amountInNaira, purpose: tx.purpose });
      const { data: rpcResult, error: rpcErr } = await supabase.rpc("process_paystack_payment", {
        p_reference: reference,
        p_user_id: tx.user_id,
        p_amount: amountInNaira,
        p_purpose: tx.purpose,
        p_reference_id: tx.reference_id,
        p_metadata: tx.metadata,
      });

      if (rpcErr) {
        log("ERROR", "RPC error", { reference, error: rpcErr.message });
        return new Response(JSON.stringify({ error: "Payment processing failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      log("INFO", "RPC completed", { reference, result: rpcResult });

      // Mark processed_at for definitive idempotency
      await supabase.from("paystack_transactions")
        .update({ processed_at: new Date().toISOString() })
        .eq("reference", reference);

      const isIdempotent = rpcResult?.idempotent === true;

      // Post-processing: notifications only if this was a fresh processing
      if (!isIdempotent) {
        await sendNotifications(supabase, tx, amountInNaira, reference, verifyData.data.channel);
      }

      // Analytics / audit
      await supabase.from("analytics_events").insert({
        event_type: "payment_success",
        entity_type: "paystack_transaction",
        entity_id: tx.id,
        seller_id: tx.user_id,
        viewer_id: tx.user_id,
        metadata: { reference, amount: amountInNaira, purpose: tx.purpose, channel: verifyData.data.channel, source: "verify_endpoint" },
      }).then(() => log("INFO", "Analytics event logged", { reference }))
        .catch((e) => log("WARN", "Failed to log analytics", { reference, error: e.message }));

      log("INFO", "Verification complete", { reference, durationMs: Date.now() - startTime });

      return new Response(JSON.stringify({
        success: true,
        status: "success",
        amount: amountInNaira,
        purpose: tx.purpose,
        channel: verifyData.data.channel,
        reference,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } else if (gatewayStatus === "failed" || gatewayStatus === "abandoned" || gatewayStatus === "reversed") {
      // Mark as failed
      await supabase.from("paystack_transactions")
        .update({ status: gatewayStatus, gateway_response: verifyData.data.gateway_response, updated_at: new Date().toISOString() })
        .eq("reference", reference);

      await supabase.from("analytics_events").insert({
        event_type: "payment_failed",
        entity_type: "paystack_transaction",
        metadata: { reference, reason: gatewayStatus, source: "verify_endpoint" },
      }).catch(() => {});

      log("WARN", "Payment not successful", { reference, gatewayStatus });
      return new Response(JSON.stringify({
        success: false,
        status: gatewayStatus,
        message: verifyData.data.gateway_response || `Payment ${gatewayStatus}`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } else {
      // pending or processing
      log("INFO", "Payment still pending", { reference, gatewayStatus });
      return new Response(JSON.stringify({
        success: false,
        status: gatewayStatus,
        message: "Payment is still being processed",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

  } catch (err) {
    log("ERROR", "Unhandled exception", { error: err instanceof Error ? err.message : String(err), durationMs: Date.now() - startTime });
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/**
 * Send in-app notification, Resend email, and FCM push notification.
 * All best-effort — failures are logged but do not block payment success.
 */
async function sendNotifications(
  supabase: ReturnType<typeof import("npm:@supabase/supabase-js@2").createClient>,
  tx: { user_id: string; purpose: string; metadata: Record<string, unknown> | null; reference_id: string | null },
  amount: number,
  reference: string,
  channel: string,
) {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const isFunding = tx.purpose === "wallet_funding" || tx.purpose === "advertiser_funding";
  const notifTitle = isFunding ? "Wallet Funded Successfully" : "Payment Successful";
  const amountStr = amount.toLocaleString();
  const notifMessage = isFunding
    ? `Your wallet has been credited with ${amountStr} via ${channel}.`
    : `Your payment of ${amountStr} was successful. Reference: ${reference}`;

  // 1. In-app notification
  await supabase.from("notifications").insert({
    user_id: tx.user_id,
    notification_type: "payment_success",
    title: notifTitle,
    message: notifMessage,
    priority: "high",
    metadata: { reference, amount, purpose: tx.purpose, channel },
  }).then(() => log("INFO", "In-app notification inserted", { reference }))
    .catch((e) => log("WARN", "Failed to insert notification", { reference, error: e.message }));

  // Notification event log
  await supabase.from("notification_event_log").insert({
    event_type: isFunding ? "payment.wallet_funded" : "payment.purchase_success",
    module: "payments",
    recipient_ids: [tx.user_id],
    metadata: { amount, reference, channel, purpose: tx.purpose },
  }).catch((e) => log("WARN", "Failed to log notification event", { reference, error: e.message }));

  // 2. Resend email
  try {
    const { data: userData } = await supabase
      .from("users")
      .select("email, full_name")
      .eq("id", tx.user_id)
      .maybeSingle();

    if (userData?.email) {
      const receiptNumber = `RCP-${reference.slice(-8).toUpperCase()}`;
      const emailPayload = {
        templateType: "payment_receipt",
        data: {
          receiptNumber,
          reference,
          date: new Date().toLocaleString(),
          channel,
          productName: (tx.metadata as Record<string, unknown>)?.product_name || (isFunding ? "Wallet Funding" : "Purchase"),
          sellerName: "Seller",
          amount: amountStr,
          currency: "NGN",
        },
      };

      const emailRes = await fetch(`${SUPABASE_URL}/functions/v1/resend-email`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ to: userData.email, ...emailPayload, userId: tx.user_id }),
      });
      log("INFO", "Email sent", { reference, ok: emailRes.ok });
    }
  } catch (e) {
    log("WARN", "Failed to send email", { reference, error: e instanceof Error ? e.message : String(e) });
  }

  // 3. FCM push
  try {
    const pushRes = await fetch(`${SUPABASE_URL}/functions/v1/fcm-push`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "send",
        userId: tx.user_id,
        title: notifTitle,
        body: notifMessage,
        url: "/wallet",
        data: { reference, amount, purpose: tx.purpose, channel },
      }),
    });
    log("INFO", "Push sent", { reference, ok: pushRes.ok });
  } catch (e) {
    log("WARN", "Failed to send push", { reference, error: e instanceof Error ? e.message : String(e) });
  }

  // 4. Seller notification for product purchases
  if ((tx.purpose === "product_purchase" || tx.purpose === "escrow") && tx.reference_id) {
    try {
      const { data: orderData } = await supabase
        .from("sales_records")
        .select("seller_id, product_name, buyer_id")
        .eq("id", tx.reference_id)
        .maybeSingle();

      if (orderData?.seller_id) {
        await supabase.from("notifications").insert({
          user_id: orderData.seller_id,
          notification_type: "new_order",
          title: "New Order Received!",
          message: `You received a new order for ${orderData.product_name || "your product"}.`,
          priority: "high",
          metadata: { reference, amount, orderId: tx.reference_id },
        });

        const { data: sellerData } = await supabase
          .from("users")
          .select("email, full_name")
          .eq("id", orderData.seller_id)
          .maybeSingle();

        if (sellerData?.email) {
          await fetch(`${SUPABASE_URL}/functions/v1/resend-email`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              to: sellerData.email,
              templateType: "new_order",
              data: { productName: orderData.product_name || "Product", amount: amountStr, currency: "NGN", buyerName: "A buyer" },
              userId: orderData.seller_id,
            }),
          });
        }

        await fetch(`${SUPABASE_URL}/functions/v1/fcm-push`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "send",
            userId: orderData.seller_id,
            title: "New Order Received!",
            body: `You received a new order for ${orderData.product_name || "your product"}.`,
            url: "/dashboard",
            data: { reference, amount, orderId: tx.reference_id },
          }),
        });
        log("INFO", "Seller notifications sent", { reference, sellerId: orderData.seller_id });
      }
    } catch (e) {
      log("WARN", "Failed to send seller notifications", { reference, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // 5. Admin alert
  try {
    const { data: admins } = await supabase
      .from("users")
      .select("id")
      .eq("is_admin", true)
      .limit(5);

    if (admins && admins.length > 0) {
      await fetch(`${SUPABASE_URL}/functions/v1/fcm-push`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send-batch",
          userIds: admins.map((a: { id: string }) => a.id),
          title: "Payment Alert",
          body: `${isFunding ? "Wallet funding" : "Payment"} of ${amountStr} — Ref: ${reference}`,
          url: "/admin/payments",
          data: { reference, amount, purpose: tx.purpose },
        }),
      });
    }
  } catch (e) {
    log("WARN", "Failed to send admin notification", { reference, error: e instanceof Error ? e.message : String(e) });
  }
}
