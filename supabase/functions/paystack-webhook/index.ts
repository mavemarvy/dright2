import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SECRET = Deno.env.get("PAYSTACK_SECRET_KEY") || "";
const BASE = "https://api.paystack.co";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

function secureEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function signatureValid(body: string, signature: string | null) {
  if (!signature || !SECRET) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(SECRET),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  const expected = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return secureEqual(expected, signature.toLowerCase());
}

async function queueFullRefund(db: any, tx: any, reference: string, reason: string) {
  const { data: existing } = await db
    .from("refund_records")
    .select("id,status,gateway_reference")
    .eq("transaction_id", tx.id)
    .in("status", ["pending", "processing", "completed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return { queued: true, existing: true, status: existing.status, refund_id: existing.gateway_reference || existing.id };
  }

  const refundResponse = await fetch(`${BASE}/refund`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      transaction: reference,
      customer_note: "Automatic full refund from DRIGHT because the successful payment could not be matched safely to the order.",
      merchant_note: reason,
    }),
  });
  const refundPayload = await refundResponse.json().catch(() => ({}));
  const accepted = refundResponse.ok && refundPayload?.status === true && refundPayload?.data;
  const txMetadata = tx.metadata && typeof tx.metadata === "object" && !Array.isArray(tx.metadata)
    ? tx.metadata as Record<string, unknown>
    : {};

  if (!accepted) {
    const refundError = String(refundPayload?.message || `Refund request failed (${refundResponse.status})`);
    await db.from("paystack_transactions").update({
      status: "failed",
      gateway_response: `${reason}; automatic refund could not be queued: ${refundError}`,
      metadata: {
        ...txMetadata,
        auto_refund: {
          requested: true,
          queued: false,
          reason,
          error: refundError,
          attempted_at: new Date().toISOString(),
        },
      },
      updated_at: new Date().toISOString(),
    }).eq("reference", reference);

    await db.from("notifications").insert({
      user_id: tx.user_id,
      notification_type: "payment_refund_attention",
      category: "orders",
      title: "Payment Needs Refund Attention",
      message: "Your payment reached Paystack but DRIGHT could not safely match it to the order. Automatic refund could not be queued, so support has been flagged for immediate review.",
      priority: "critical",
      metadata: { reference, reason, refund_error: refundError, action_url: "/notifications" },
    });

    return { queued: false, error: refundError };
  }

  const refundStatusRaw = String(refundPayload.data.status || "pending").toLowerCase();
  const refundStatus = ["pending", "processing", "needs-attention", "processed", "failed"].includes(refundStatusRaw)
    ? refundStatusRaw
    : "pending";
  const refundId = String(refundPayload.data.id ?? refundPayload.data.refund_reference ?? `refund:${reference}`);
  const settlementAmount = Number(tx.amount);
  const settlementCurrency = String(tx.currency || "USD").toUpperCase();

  const { data: refundResult, error: refundDbError } = await db.rpc("process_paystack_refund_event", {
    p_transaction_reference: reference,
    p_gateway_reference: refundId,
    p_amount: settlementAmount,
    p_currency: settlementCurrency,
    p_status: refundStatus,
    p_reason: reason,
  });

  await db.from("paystack_transactions").update({
    metadata: {
      ...txMetadata,
      auto_refund: {
        requested: true,
        queued: true,
        reason,
        refund_id: refundId,
        refund_status: refundStatus,
        queued_at: new Date().toISOString(),
        db_error: refundDbError?.message || null,
      },
    },
    updated_at: new Date().toISOString(),
  }).eq("reference", reference);

  await db.from("notifications").insert({
    user_id: tx.user_id,
    notification_type: "payment_refund_pending",
    category: "orders",
    title: "Automatic Refund Started",
    message: "Your payment reached Paystack but could not be matched safely to the order. A full refund has been queued automatically.",
    priority: "critical",
    metadata: { reference, refund_id: refundId, refund_status: refundStatus, reason, action_url: "/notifications" },
  });

  return {
    queued: true,
    refund_id: refundId,
    status: refundStatus,
    db_recorded: !refundDbError && refundResult?.success !== false,
  };
}

async function queueGuestFullRefund(db: any, order: any, reference: string, reason: string) {
  if (["refund_pending", "refunded"].includes(String(order.payment_status || "").toLowerCase())) {
    return { queued: true, existing: true, status: order.payment_status };
  }

  const refundResponse = await fetch(`${BASE}/refund`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      transaction: reference,
      customer_note: "Automatic full refund from DRIGHT because the successful guest payment could not be matched safely to the order.",
      merchant_note: reason,
    }),
  });
  const refundPayload = await refundResponse.json().catch(() => ({}));
  const accepted = refundResponse.ok && refundPayload?.status === true && refundPayload?.data;
  const metadata = order.metadata && typeof order.metadata === "object" && !Array.isArray(order.metadata)
    ? order.metadata as Record<string, unknown>
    : {};
  const refundStatus = accepted ? String(refundPayload.data.status || "pending").toLowerCase() : "failed";
  const refundId = accepted ? String(refundPayload.data.id ?? refundPayload.data.refund_reference ?? `refund:${reference}`) : null;

  await db.from("guest_orders").update({
    payment_status: accepted ? "refund_pending" : "refund_attention",
    status: accepted ? "payment_refund_pending" : "payment_failed",
    gateway_response: accepted ? reason : `${reason}; automatic refund could not be queued: ${String(refundPayload?.message || refundResponse.status)}`,
    metadata: {
      ...metadata,
      auto_refund: {
        requested: true,
        queued: Boolean(accepted),
        reason,
        refund_id: refundId,
        refund_status: refundStatus,
        updated_at: new Date().toISOString(),
      },
    },
  }).eq("id", order.id);

  return { queued: Boolean(accepted), refund_id: refundId, status: refundStatus };
}


Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const raw = await req.text();
    if (!(await signatureValid(raw, req.headers.get("x-paystack-signature")))) {
      return json({ error: "Invalid signature" }, 401);
    }

    const event = JSON.parse(raw);
    const d = event.data || {};
    const { createClient } = await import("npm:@supabase/supabase-js@2");
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (event.event === "charge.success") {
      const ref = typeof d.reference === "string" ? d.reference.trim() : "";
      if (!ref) return json({ error: "Missing transaction reference" }, 400);

      // First-party DRIGHT Starter purchases are guest-only and have their own
      // canonical purchase table. Finalize them from the signed webhook so a
      // successful payment does not depend on the browser returning to DRIGHT.
      if (ref.startsWith("DRG_STARTER_")) {
        const { data: starter, error: starterError } = await db
          .from("dright_starter_purchases")
          .select("id,amount,currency,payment_status,processed_at,included_trial_days")
          .eq("payment_reference", ref)
          .maybeSingle();

        if (starterError) return json({ error: "Starter purchase lookup failed" }, 500);
        if (!starter) return json({ error: "Starter purchase not found" }, 404);
        if (starter.processed_at && starter.payment_status === "success") {
          return json({ success: true, starter: true, idempotent: true });
        }

        const response = await fetch(`${BASE}/transaction/verify/${encodeURIComponent(ref)}`, {
          headers: { Authorization: `Bearer ${SECRET}` },
        });
        const verified = await response.json().catch(() => ({}));
        if (!response.ok || !verified.status || verified.data?.status !== "success") {
          return json({ error: "Starter payment verification failed" }, 400);
        }
        if (String(verified.data?.reference || "") !== ref) {
          return json({ error: "Starter gateway reference mismatch" }, 409);
        }

        const gatewayAmount = Number(verified.data.amount) / 100;
        const gatewayCurrency = String(verified.data.currency || "").toUpperCase();
        const expectedAmount = Number(starter.amount);
        const expectedCurrency = String(starter.currency || "NGN").toUpperCase();

        if (!Number.isFinite(gatewayAmount) || !Number.isFinite(expectedAmount) || Math.abs(gatewayAmount - expectedAmount) > 0.01) {
          return json({ error: "Starter payment amount mismatch" }, 409);
        }
        if (gatewayCurrency !== expectedCurrency) {
          return json({ error: "Starter payment currency mismatch" }, 409);
        }

        const { data: processed, error: processError } = await db.rpc("process_verified_dright_starter_purchase", {
          p_reference: ref,
          p_amount: expectedAmount,
          p_currency: expectedCurrency,
          p_gateway_response: verified.data.gateway_response || null,
          p_paid_at: verified.data.paid_at || new Date().toISOString(),
          p_channel: verified.data.channel || null,
        });

        if (processError) {
          console.error("[paystack-webhook] Starter processing failed", processError.message);
          return json({ error: "Starter payment processing failed" }, 500);
        }
        if (processed?.success === false) {
          return json({ error: processed.error || "Starter payment processing failed" }, 500);
        }

        return json({
          success: true,
          starter: true,
          starter_purchase_id: starter.id,
          included_trial_days: starter.included_trial_days,
          idempotent: processed?.idempotent === true,
        });
      }

      // Guest purchases have their own canonical order table and no authenticated
      // paystack_transactions owner. Finalize them directly from the signed webhook
      // so payment still completes even if the guest closes the browser callback.
      if (ref.startsWith("DRG_GUEST_")) {
        const { data: guestOrder, error: guestOrderError } = await db
          .from("guest_orders")
          .select("id,product_id,product_name,total_amount,currency,payment_status,processed_at,metadata")
          .eq("payment_reference", ref)
          .maybeSingle();

        if (guestOrderError) return json({ error: "Guest order lookup failed" }, 500);
        if (!guestOrder) return json({ error: "Guest order not found" }, 404);
        if (guestOrder.processed_at && guestOrder.payment_status === "success") {
          return json({ success: true, guest: true, idempotent: true });
        }

        const response = await fetch(`${BASE}/transaction/verify/${encodeURIComponent(ref)}`, {
          headers: { Authorization: `Bearer ${SECRET}` },
        });
        const verified = await response.json().catch(() => ({}));
        if (!response.ok || !verified.status || verified.data?.status !== "success") {
          return json({ error: "Guest payment verification failed" }, 400);
        }
        if (String(verified.data?.reference || "") !== ref) {
          return json({ error: "Guest gateway reference mismatch" }, 409);
        }

        const metadata = guestOrder.metadata && typeof guestOrder.metadata === "object" && !Array.isArray(guestOrder.metadata)
          ? guestOrder.metadata as Record<string, unknown>
          : {};
        const gatewayAmount = Number(verified.data.amount) / 100;
        const requestedAmountMinor = Number(verified.data.requested_amount);
        const requestedGatewayAmount = Number.isFinite(requestedAmountMinor) && requestedAmountMinor > 0
          ? requestedAmountMinor / 100
          : gatewayAmount;
        const gatewayCurrency = String(verified.data.currency || "").toUpperCase();
        const expectedGatewayAmount = Number(metadata.gateway_amount ?? guestOrder.total_amount);
        const expectedGatewayCurrency = String(metadata.gateway_currency ?? guestOrder.currency ?? "USD").toUpperCase();
        if (!Number.isFinite(requestedGatewayAmount) || !Number.isFinite(expectedGatewayAmount) || Math.abs(requestedGatewayAmount - expectedGatewayAmount) > 0.01) {
          const reason = `Guest Paystack requested amount mismatch: expected ${expectedGatewayAmount} ${expectedGatewayCurrency}, Paystack requested ${requestedGatewayAmount} ${gatewayCurrency || "UNKNOWN"}, charged ${gatewayAmount} ${gatewayCurrency || "UNKNOWN"}`;
          const refund = await queueGuestFullRefund(db, guestOrder, ref, reason);
          return json({ success: true, guest: true, refund_queued: refund.queued, refund_status: refund.status });
        }
        if (gatewayCurrency !== expectedGatewayCurrency) {
          const reason = `Guest Paystack currency mismatch: expected ${expectedGatewayCurrency}, received ${gatewayCurrency || "UNKNOWN"}`;
          const refund = await queueGuestFullRefund(db, guestOrder, ref, reason);
          return json({ success: true, guest: true, refund_queued: refund.queued, refund_status: refund.status });
        }

        const canonicalAmount = Number(guestOrder.total_amount);
        const canonicalCurrency = String(guestOrder.currency || "USD").toUpperCase();
        const { data: processed, error: processError } = await db.rpc("process_verified_guest_order", {
          p_reference: ref,
          p_amount: canonicalAmount,
          p_currency: canonicalCurrency,
          p_gateway_response: verified.data.gateway_response || null,
          p_paid_at: verified.data.paid_at || new Date().toISOString(),
          p_channel: verified.data.channel || null,
        });
        if (processError) {
          console.error("[paystack-webhook] guest processing failed", processError.message);
          return json({ error: "Guest payment processing failed" }, 500);
        }
        if (processed?.success === false) {
          return json({ error: processed.error || "Guest payment processing failed" }, 500);
        }

        return json({
          success: true,
          guest: true,
          guest_order_id: guestOrder.id,
          product_id: guestOrder.product_id,
          idempotent: processed?.idempotent === true,
        });
      }

      const { data: tx, error } = await db
        .from("paystack_transactions")
        .select("*")
        .eq("reference", ref)
        .maybeSingle();

      if (error) return json({ error: "DB error" }, 500);
      if (!tx) return json({ error: "Transaction not found" }, 404);
      if (tx.status === "success" && tx.processed_at) return json({ success: true, idempotent: true });

      const response = await fetch(`${BASE}/transaction/verify/${encodeURIComponent(ref)}`, {
        headers: { Authorization: `Bearer ${SECRET}` },
      });
      const verified = await response.json().catch(() => ({}));

      if (!response.ok || !verified.status || verified.data?.status !== "success") {
        return json({ error: "Verification failed" }, 400);
      }
      if (String(verified.data?.reference || "") !== ref) {
        return json({ error: "Gateway reference mismatch" }, 409);
      }

      const gatewayAmount = Number(verified.data.amount) / 100;
      const requestedAmountMinor = Number(verified.data.requested_amount);
      const requestedGatewayAmount = Number.isFinite(requestedAmountMinor) && requestedAmountMinor > 0
        ? requestedAmountMinor / 100
        : gatewayAmount;
      const settlementAmount = Number(tx.amount);
      const settlementCurrency = String(tx.currency || "NGN").toUpperCase();
      const txMetadata = tx.metadata && typeof tx.metadata === "object" && !Array.isArray(tx.metadata)
        ? tx.metadata as Record<string, unknown>
        : {};
      const expectedGatewayAmount = Number(txMetadata.gateway_amount ?? settlementAmount);
      const expectedGatewayCurrency = String(txMetadata.gateway_currency ?? settlementCurrency).toUpperCase();
      const gatewayCurrency = String(verified.data.currency || "").toUpperCase();

      if (!Number.isFinite(requestedGatewayAmount) || !Number.isFinite(expectedGatewayAmount) || Math.abs(requestedGatewayAmount - expectedGatewayAmount) > 0.01) {
        const reason = `Paystack requested amount mismatch: expected ${expectedGatewayAmount} ${expectedGatewayCurrency}, Paystack requested ${requestedGatewayAmount} ${gatewayCurrency || "UNKNOWN"}, charged ${gatewayAmount} ${gatewayCurrency || "UNKNOWN"}`;
        const refund = await queueFullRefund(db, tx, ref, reason);
        return json({ success: true, refund_queued: refund.queued, refund_status: refund.status });
      }
      if (!gatewayCurrency || gatewayCurrency !== expectedGatewayCurrency) {
        const reason = `Paystack currency mismatch: expected ${expectedGatewayCurrency}, received ${gatewayCurrency || "UNKNOWN"}`;
        const refund = await queueFullRefund(db, tx, ref, reason);
        return json({ success: true, refund_queued: refund.queued, refund_status: refund.status });
      }

      const { error: updateError } = await db.from("paystack_transactions").update({
        status: "success",
        paystack_reference: verified.data.reference,
        gateway_response: verified.data.gateway_response,
        paid_at: verified.data.paid_at,
        channel: verified.data.channel,
        updated_at: new Date().toISOString(),
      }).eq("reference", ref);

      if (updateError) return json({ error: "Unable to record verified payment" }, 500);

      const processor = tx.purpose === "promotion_campaign"
        ? await db.rpc("process_verified_promotion_payment", {
          p_reference: ref,
          p_user_id: tx.user_id,
          p_amount: settlementAmount,
          p_currency: settlementCurrency,
          p_provider: "paystack",
        })
        : await db.rpc("process_paystack_payment", {
          p_reference: ref,
          p_user_id: tx.user_id,
          p_amount: settlementAmount,
          p_purpose: tx.purpose,
          p_reference_id: tx.reference_id,
          p_metadata: tx.metadata,
        });

      if (processor.error) return json({ error: "Payment processing failed" }, 500);
      const processed = processor.data;
      if (processed?.success === false) return json({ error: processed.error || "Payment processing failed" }, 500);

      await db.from("paystack_transactions")
        .update({ processed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("reference", ref)
        .is("processed_at", null);

      if (processed?.idempotent !== true) {
        await sendPaymentNotification(db, tx, settlementAmount, settlementCurrency, ref, verified.data.channel);
      }

      const { error: analyticsError } = await db.from("analytics_events").insert({
        event_type: "payment_success",
        entity_type: "paystack_transaction",
        entity_id: tx.id,
        seller_id: tx.user_id,
        viewer_id: tx.user_id,
        metadata: {
          reference: ref,
          amount: settlementAmount,
          currency: settlementCurrency,
          gateway_amount: gatewayAmount,
          gateway_requested_amount: requestedGatewayAmount,
          gateway_currency: gatewayCurrency,
          purpose: tx.purpose,
          campaign_id: tx.purpose === "promotion_campaign" ? tx.reference_id : null,
          channel: verified.data.channel,
          source: "paystack_webhook",
        },
      });
      if (analyticsError) console.warn("[paystack-webhook] analytics insert failed", analyticsError.message);
    } else if ([
      "refund.pending",
      "refund.processing",
      "refund.needs-attention",
      "refund.processed",
      "refund.failed",
    ].includes(event.event)) {
      const status = event.event.replace("refund.", "");
      const transactionReference = d.transaction_reference || d.transaction?.reference;
      if (!transactionReference) return json({ success: true, skipped: true });
      const gatewayReference = d.refund_reference || d.id?.toString() || null;
      const gatewayRefundAmount = d.amount != null ? Number(d.amount) / 100 : 0;

      let refundAmount = gatewayRefundAmount;
      let refundCurrency = String(d.currency || "NGN").toUpperCase();
      const { data: originalTx } = await db
        .from("paystack_transactions")
        .select("amount,currency,metadata")
        .eq("reference", transactionReference)
        .maybeSingle();

      if (originalTx) {
        const originalMetadata = originalTx.metadata && typeof originalTx.metadata === "object" && !Array.isArray(originalTx.metadata)
          ? originalTx.metadata as Record<string, unknown>
          : {};
        const originalGatewayAmount = Number(originalMetadata.gateway_amount);
        const canonicalAmount = Number(originalTx.amount);
        if (Number.isFinite(originalGatewayAmount) && originalGatewayAmount > 0 && Number.isFinite(canonicalAmount) && canonicalAmount >= 0) {
          const ratio = Math.min(1, Math.max(0, gatewayRefundAmount / originalGatewayAmount));
          refundAmount = Math.round(canonicalAmount * ratio * 100) / 100;
          refundCurrency = String(originalTx.currency || "USD").toUpperCase();
        }
      }

      const { data: result, error } = await db.rpc("process_paystack_refund_event", {
        p_transaction_reference: transactionReference,
        p_gateway_reference: gatewayReference,
        p_amount: refundAmount,
        p_currency: refundCurrency,
        p_status: status,
        p_reason: d.reason || d.status || event.event,
      });
      if (error) return json({ error: "Refund processing failed" }, 500);
      if (result?.success === false) return json({ error: result.error || "Refund processing failed" }, 500);

      if (originalTx) {
        const completed = ["processed", "completed"].includes(status);
        await db.from("notifications").insert({
          user_id: originalTx.user_id,
          notification_type: completed ? "payment_refund_processed" : "payment_refund_pending",
          category: "orders",
          title: completed ? "Refund Completed" : "Refund Update",
          message: completed
            ? "Your Paystack refund has been processed."
            : `Your Paystack refund is currently ${status.replaceAll("-", " ")}.`,
          priority: completed ? "high" : "critical",
          metadata: {
            reference: transactionReference,
            refund_reference: gatewayReference,
            refund_status: status,
            action_url: "/notifications",
          },
        });
      }
    } else if ([
      "charge.dispute.create",
      "charge.dispute.remind",
      "charge.dispute.resolve",
    ].includes(event.event)) {
      const { error: disputeAnalyticsError } = await db.from("analytics_events").insert({
        event_type: event.event,
        entity_type: "paystack_transaction",
        metadata: {
          reference: d.transaction?.reference || d.reference || null,
          source: "paystack_webhook",
          payload: d,
        },
      });
      if (disputeAnalyticsError) console.warn("[paystack-webhook] dispute analytics insert failed", disputeAnalyticsError.message);
    } else if (event.event === "charge.failed") {
      if (d.reference) {
        if (String(d.reference).startsWith("DRG_GUEST_")) {
          await db.from("guest_orders").update({
            payment_status: "failed",
            status: "payment_failed",
            gateway_response: d.gateway_response || "Paystack charge failed",
          }).eq("payment_reference", d.reference).is("processed_at", null);
        } else {
          await db.from("paystack_transactions").update({
            status: "failed",
            gateway_response: d.gateway_response,
            updated_at: new Date().toISOString(),
          }).eq("reference", d.reference);
        }
      }
    } else if (["transfer.success", "transfer.failed", "transfer.reversed"].includes(event.event)) {
      if (d.reference) {
        const status = event.event === "transfer.success" ? "success" : "failed";
        await db.from("withdrawal_queue").update({
          status,
          gateway_response: event.event,
          updated_at: new Date().toISOString(),
        }).eq("transfer_reference", d.reference);
      }
    } else if (event.event === "subscription.create" || event.event === "subscription.enable") {
      await db.from("user_subscriptions").update({
        paystack_subscription_code: d.subscription_code,
        paystack_email_token: d.email_token,
        status: "active",
        updated_at: new Date().toISOString(),
      }).eq("last_payment_ref", d.reference);
    }

    return json({ success: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Internal error" }, 500);
  }
});

async function sendPaymentNotification(
  db: ReturnType<typeof import("npm:@supabase/supabase-js@2").createClient>,
  tx: {
    user_id: string;
    purpose: string;
    metadata: Record<string, unknown> | null;
    reference_id: string | null;
  },
  amount: number,
  currency: string,
  reference: string,
  channel: string,
) {
  // Buyer payment confirmation is emitted once by trg_notify_paystack_success
  // only after processed_at is set. Keep this helper focused on the seller-side
  // order notification so webhook retries cannot create duplicate buyer emails.
  if ((tx.purpose === "product_purchase" || tx.purpose === "escrow") && tx.reference_id) {
    const { data: order } = await db.from("orders")
      .select("seller_id,product_id")
      .eq("id", tx.reference_id)
      .maybeSingle();

    if (order?.seller_id) {
      const { data: product } = await db.from("products")
        .select("name")
        .eq("id", order.product_id)
        .maybeSingle();

      const { error: sellerNotificationError } = await db.from("notifications").insert({
        user_id: order.seller_id,
        notification_type: "new_order",
        category: "orders",
        title: "New Order Received!",
        message: `You received a new paid order for ${product?.name || "your product"}.`,
        priority: "high",
        metadata: {
          reference,
          amount,
          currency,
          channel,
          orderId: tx.reference_id,
          productId: order.product_id,
          action_url: "/sales",
        },
      });
      if (sellerNotificationError) console.warn("[paystack-webhook] seller notification failed", sellerNotificationError.message);
    }
  }
}
