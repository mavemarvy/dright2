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
  console.log(`[${ts}] [paystack-webhook] [${level}] ${message}${payload}`);
}

/**
 * Verify the Paystack HMAC-SHA512 signature against the raw request body.
 * Returns true only if the signature is present AND valid.
 */
async function verifyPaystackSignature(bodyText: string, signature: string | null): Promise<boolean> {
  if (!signature) {
    log("WARN", "No x-paystack-signature header present — rejecting");
    return false;
  }
  if (!PAYSTACK_SECRET) {
    log("ERROR", "PAYSTACK_SECRET_KEY not configured — cannot verify signature");
    return false;
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(PAYSTACK_SECRET),
    { name: "HMAC", hash: "SHA-512" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(bodyText));
  const expectedSig = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, "0")).join("");

  const match = expectedSig === signature;
  if (!match) log("WARN", "Signature mismatch", { expected: expectedSig.slice(0, 16) + "...", got: signature.slice(0, 16) + "..." });
  return match;
}

interface PaystackEvent {
  event: string;
  data: {
    reference: string;
    status: string;
    amount: number;
    currency: string;
    gateway_response?: string;
    paid_at?: string;
    channel?: string;
    // subscription fields
    subscription_code?: string;
    email_token?: string;
    // transfer fields
    reason?: string;
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const bodyText = await req.text();
    const signature = req.headers.get("x-paystack-signature");

    log("INFO", "Webhook received", { method: req.method, bodyLength: bodyText.length, hasSignature: !!signature });

    // Strict signature verification — reject if missing or invalid
    const isValid = await verifyPaystackSignature(bodyText, signature);
    if (!isValid) {
      log("ERROR", "Signature verification failed — returning 401");
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const event: PaystackEvent = JSON.parse(bodyText);
    log("INFO", `Event: ${event.event}`, { reference: event.data?.reference });

    const { createClient } = await import("npm:@supabase/supabase-js@2");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── charge.success ──────────────────────────────────────────────
    if (event.event === "charge.success") {
      const data = event.data;
      const reference = data.reference;

      // Find our transaction record
      const { data: tx, error: txErr } = await supabase
        .from("paystack_transactions")
        .select("*")
        .eq("reference", reference)
        .maybeSingle();

      if (txErr) {
        log("ERROR", "DB error finding transaction", { reference, error: txErr.message });
        return new Response(JSON.stringify({ error: "DB error" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!tx) {
        log("WARN", "Transaction not found in DB", { reference });
        return new Response(JSON.stringify({ error: "Transaction not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Idempotency: skip if already processed
      if (tx.status === "success" && tx.processed_at) {
        log("INFO", "Transaction already processed — skipping (idempotent)", { reference });
        return new Response(JSON.stringify({ success: true, message: "Already processed", idempotent: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Double-verify with Paystack API before crediting
      log("INFO", "Verifying transaction with Paystack API", { reference });
      const verifyRes = await fetch(`${PAYSTACK_BASE}/transaction/verify/${reference}`, {
        headers: { "Authorization": `Bearer ${PAYSTACK_SECRET}` },
      });
      const verifyData = await verifyRes.json();

      if (!verifyData.status || verifyData.data.status !== "success") {
        log("ERROR", "Paystack API verification failed", { reference, apiStatus: verifyData.data?.status, message: verifyData.message });
        await supabase.from("paystack_transactions")
          .update({ status: "failed", gateway_response: verifyData.data?.gateway_response || verifyData.message, updated_at: new Date().toISOString() })
          .eq("reference", reference);
        return new Response(JSON.stringify({ error: "Verification failed" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const amountInNaira = verifyData.data.amount / 100;
      log("INFO", "Paystack verification confirmed", { reference, amount: amountInNaira, channel: verifyData.data.channel });

      // Update transaction record with Paystack details
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

      // Process payment via idempotent RPC (wallet credit + ledger + transaction history)
      log("INFO", "Calling process_paystack_payment RPC", { reference, userId: tx.user_id, amount: amountInNaira, purpose: tx.purpose });
      const { data: rpcResult, error: rpcErr } = await supabase.rpc("process_paystack_payment", {
        p_reference: reference,
        p_user_id: tx.user_id,
        p_amount: amountInNaira,
        p_purpose: tx.purpose,
        p_reference_id: tx.reference_id,
        p_metadata: tx.metadata,
      });

      if (rpcErr) {
        log("ERROR", "RPC error processing payment", { reference, error: rpcErr.message });
        return new Response(JSON.stringify({ error: "Payment processing failed" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      log("INFO", "RPC completed", { reference, result: rpcResult });

      // Mark processed_at for definitive idempotency
      await supabase.from("paystack_transactions")
        .update({ processed_at: new Date().toISOString() })
        .eq("reference", reference);

      // ── Post-processing: notifications, email, push, audit ───────
      // All of these are best-effort — payment is already credited.
      const isIdempotent = rpcResult?.idempotent === true;
      if (!isIdempotent) {
        await sendNotifications(supabase, tx, amountInNaira, reference, verifyData.data.channel);
      }

      // Analytics / audit log
      await supabase.from("analytics_events").insert({
        event_type: "payment_success",
        entity_type: "paystack_transaction",
        entity_id: tx.id,
        seller_id: tx.user_id,
        viewer_id: tx.user_id,
        metadata: { reference, amount: amountInNaira, purpose: tx.purpose, channel: verifyData.data.channel, source: "paystack_webhook" },
      }).then(() => log("INFO", "Analytics event logged", { reference }))
        .catch((e) => log("WARN", "Failed to log analytics event", { reference, error: e.message }));

      log("INFO", "Webhook processing complete", { reference, durationMs: Date.now() - startTime });
    }
    // ── charge.failed ───────────────────────────────────────────────
    else if (event.event === "charge.failed") {
      const reference = event.data?.reference;
      if (reference) {
        log("WARN", "Charge failed", { reference, reason: event.data?.gateway_response });
        await supabase.from("paystack_transactions")
          .update({ status: "failed", gateway_response: event.data?.gateway_response, updated_at: new Date().toISOString() })
          .eq("reference", reference);

        await supabase.from("analytics_events").insert({
          event_type: "payment_failed",
          entity_type: "paystack_transaction",
          metadata: { reference, reason: event.data?.gateway_response, source: "paystack_webhook" },
        }).catch(() => {});
      }
    }
    // ── transfer.success (withdrawal) ───────────────────────────────
    else if (event.event === "transfer.success") {
      const reference = event.data?.reference;
      if (reference) {
        log("INFO", "Transfer success (withdrawal)", { reference });
        await supabase.from("withdrawal_queue")
          .update({ status: "success", gateway_response: "Transfer successful", processed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("transfer_reference", reference);
      }
    }
    // ── transfer.failed (withdrawal) ────────────────────────────────
    else if (event.event === "transfer.failed") {
      const reference = event.data?.reference;
      if (reference) {
        log("WARN", "Transfer failed (withdrawal)", { reference, reason: event.data?.reason });
        await supabase.from("withdrawal_queue")
          .update({ status: "failed", gateway_response: event.data?.reason, updated_at: new Date().toISOString() })
          .eq("transfer_reference", reference);
      }
    }
    // ── subscription events ─────────────────────────────────────────
    else if (event.event === "subscription.create" || event.event === "subscription.enable") {
      const data = event.data;
      log("INFO", "Subscription event", { event: event.event, reference: data.reference });
      await supabase.from("user_subscriptions")
        .update({
          paystack_subscription_code: data.subscription_code,
          paystack_email_token: data.email_token,
          status: "active",
          updated_at: new Date().toISOString(),
        })
        .eq("last_payment_ref", data.reference)
        .maybeSingle();
    } else {
      log("INFO", `Unhandled event type: ${event.event}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

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

  // 1. In-app notification
  const isFunding = tx.purpose === "wallet_funding" || tx.purpose === "advertiser_funding";
  const notifTitle = isFunding ? "Wallet Funded Successfully" : "Payment Successful";
  const amountStr = amount.toLocaleString();
  const notifMessage = isFunding
    ? `Your wallet has been credited with ${amountStr} via ${channel}.`
    : `Your payment of ${amountStr} was successful. Reference: ${reference}`;

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

  // 2. Resend email notification to customer
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
      log("INFO", "Email notification sent", { reference, email: userData.email, ok: emailRes.ok });
    }
  } catch (e) {
    log("WARN", "Failed to send email notification", { reference, error: e instanceof Error ? e.message : String(e) });
  }

  // 3. FCM push notification
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
    log("INFO", "Push notification sent", { reference, ok: pushRes.ok });
  } catch (e) {
    log("WARN", "Failed to send push notification", { reference, error: e instanceof Error ? e.message : String(e) });
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
        // Seller in-app notification
        await supabase.from("notifications").insert({
          user_id: orderData.seller_id,
          notification_type: "new_order",
          title: "New Order Received!",
          message: `You received a new order for ${orderData.product_name || "your product"}.`,
          priority: "high",
          metadata: { reference, amount, orderId: tx.reference_id },
        });

        // Seller email
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
          log("INFO", "Seller email sent", { reference, sellerEmail: sellerData.email });
        }

        // Seller push notification
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
        log("INFO", "Seller push sent", { reference, sellerId: orderData.seller_id });
      }
    } catch (e) {
      log("WARN", "Failed to send seller notifications", { reference, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // 5. Admin payment alert
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
      log("INFO", "Admin push sent", { reference, adminCount: admins.length });
    }
  } catch (e) {
    log("WARN", "Failed to send admin notification", { reference, error: e instanceof Error ? e.message : String(e) });
  }
}
