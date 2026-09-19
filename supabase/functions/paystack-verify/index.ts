import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SECRET = Deno.env.get("PAYSTACK_SECRET_KEY") || "";
const BASE = "https://api.paystack.co";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

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
  const refundAccepted = refundResponse.ok && refundPayload?.status === true && refundPayload?.data;

  const txMetadata = tx.metadata && typeof tx.metadata === "object" && !Array.isArray(tx.metadata)
    ? tx.metadata as Record<string, unknown>
    : {};

  if (!refundAccepted) {
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
      metadata: {
        reference,
        reason,
        refund_error: refundError,
        action_url: "/notifications",
      },
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
    metadata: {
      reference,
      refund_id: refundId,
      refund_status: refundStatus,
      reason,
      action_url: "/notifications",
    },
  });

  return {
    queued: true,
    refund_id: refundId,
    status: refundStatus,
    db_recorded: !refundDbError && refundResult?.success !== false,
  };
}


Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (!["GET", "POST"].includes(req.method)) return json({ error: "Method not allowed" }, 405);

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Missing auth" }, 401);

    const token = auth.slice("Bearer ".length);
    const { createClient } = await import("npm:@supabase/supabase-js@2");
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: { user }, error: authError } = await db.auth.getUser(token);
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const url = new URL(req.url);
    let reference = url.searchParams.get("reference");
    if (!reference && req.method === "POST") {
      try {
        const body = await req.json();
        reference = typeof body?.reference === "string" ? body.reference : null;
      } catch {
        // handled below
      }
    }
    reference = reference?.trim() || null;
    if (!reference) return json({ error: "Missing reference" }, 400);
    if (reference.startsWith("free_")) return json({ error: "Free orders do not use Paystack verification" }, 400);

    const { data: tx, error } = await db
      .from("paystack_transactions")
      .select("*")
      .eq("reference", reference)
      .maybeSingle();

    if (error) return json({ error: "DB error" }, 500);
    if (!tx) return json({ error: "Transaction not found" }, 404);

    // Browser-facing verification is owner-bound. The signed Paystack webhook is
    // the independent server-to-server path for provider-triggered processing.
    if (tx.user_id !== user.id) return json({ error: "Transaction does not belong to authenticated user" }, 403);

    if (tx.status === "success" && tx.processed_at) {
      return json({
        success: true,
        status: "success",
        already_verified: true,
        idempotent: true,
        amount: Number(tx.amount),
        currency: String(tx.currency || "NGN").toUpperCase(),
        purpose: tx.purpose,
        channel: tx.channel,
        reference,
      });
    }

    if (!SECRET) return json({ error: "Paystack not configured" }, 503);

    const response = await fetch(`${BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${SECRET}` },
    });
    const verified = await response.json().catch(() => ({}));

    if (!response.ok || !verified.status || !verified.data) {
      return json({
        success: false,
        status: "failed",
        message: verified.message || `Verification failed (${response.status})`,
      }, 400);
    }

    if (String(verified.data.reference || "") !== reference) {
      return json({ success: false, status: "failed", message: "Gateway reference mismatch" }, 409);
    }

    const gatewayStatus = String(verified.data.status || "").toLowerCase();
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

    if (gatewayStatus === "success") {
      if (!Number.isFinite(requestedGatewayAmount) || !Number.isFinite(expectedGatewayAmount) || Math.abs(requestedGatewayAmount - expectedGatewayAmount) > 0.01) {
        const reason = `Paystack requested amount mismatch: expected ${expectedGatewayAmount} ${expectedGatewayCurrency}, Paystack requested ${requestedGatewayAmount} ${gatewayCurrency || "UNKNOWN"}, charged ${gatewayAmount} ${gatewayCurrency || "UNKNOWN"}`;
        const refund = await queueFullRefund(db, tx, reference, reason);
        return json({
          success: false,
          status: "failed",
          message: refund.queued
            ? "Payment could not be matched safely. A full refund has been queued automatically."
            : "Payment could not be matched safely and the automatic refund needs support attention.",
          refund_queued: refund.queued,
          refund_status: refund.status,
          refund_id: refund.refund_id,
        }, refund.queued ? 409 : 502);
      }

      if (!gatewayCurrency || gatewayCurrency !== expectedGatewayCurrency) {
        const reason = `Paystack currency mismatch: expected ${expectedGatewayCurrency}, received ${gatewayCurrency || "UNKNOWN"}`;
        const refund = await queueFullRefund(db, tx, reference, reason);
        return json({
          success: false,
          status: "failed",
          message: refund.queued
            ? "Payment currency did not match the order. A full refund has been queued automatically."
            : "Payment currency did not match the order and the automatic refund needs support attention.",
          refund_queued: refund.queued,
          refund_status: refund.status,
          refund_id: refund.refund_id,
        }, refund.queued ? 409 : 502);
      }

      const { error: updateError } = await db.from("paystack_transactions").update({
        status: "success",
        paystack_reference: verified.data.reference,
        gateway_response: verified.data.gateway_response,
        paid_at: verified.data.paid_at,
        channel: verified.data.channel,
        updated_at: new Date().toISOString(),
      }).eq("reference", reference);

      if (updateError) return json({ error: "Unable to record verified payment" }, 500);

      const processor = tx.purpose === "promotion_campaign"
        ? await db.rpc("process_verified_promotion_payment", {
          p_reference: reference,
          p_user_id: tx.user_id,
          p_amount: settlementAmount,
          p_currency: settlementCurrency,
          p_provider: "paystack",
        })
        : await db.rpc("process_paystack_payment", {
          p_reference: reference,
          p_user_id: tx.user_id,
          p_amount: settlementAmount,
          p_purpose: tx.purpose,
          p_reference_id: tx.reference_id,
          p_metadata: tx.metadata,
        });

      if (processor.error) return json({ error: "Payment processing failed" }, 500);
      const result = processor.data;
      if (result?.success === false) return json({ error: result.error || "Payment processing failed" }, 500);

      // Both authoritative processors are idempotent and record processed_at.
      // This update remains only as a compatibility safeguard.
      await db.from("paystack_transactions")
        .update({ processed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("reference", reference)
        .is("processed_at", null);

      return json({
        success: true,
        status: "success",
        amount: settlementAmount,
        currency: settlementCurrency,
        gateway_amount: gatewayAmount,
        gateway_currency: gatewayCurrency,
        purpose: tx.purpose,
        campaign_id: tx.purpose === "promotion_campaign" ? tx.reference_id : undefined,
        channel: verified.data.channel,
        reference,
      });
    }

    if (gatewayStatus === "reversed") {
      // Marketplace ledgers settle in the canonical DRIGHT currency, even when
      // Paystack collected an FX-converted NGN amount.
      const reversalAmount = tx.purpose === "product_purchase" || tx.purpose === "escrow"
        ? settlementAmount
        : (Number.isFinite(gatewayAmount) ? gatewayAmount : settlementAmount);
      const reversalCurrency = tx.purpose === "product_purchase" || tx.purpose === "escrow"
        ? settlementCurrency
        : (gatewayCurrency || settlementCurrency);
      const { data: result, error: reversalError } = await db.rpc("process_paystack_refund_event", {
        p_transaction_reference: reference,
        p_gateway_reference: `reversal:${reference}`,
        p_amount: reversalAmount,
        p_currency: reversalCurrency,
        p_status: "reversed",
        p_reason: verified.data.gateway_response || "Paystack transaction reversed",
      });

      if (reversalError) return json({ error: "Reversal processing failed" }, 500);
      if (result?.success === false) return json({ error: result.error || "Reversal processing failed" }, 500);
      return json({
        success: false,
        status: "reversed",
        reversal_processed: true,
        message: verified.data.gateway_response || "Payment reversed",
      });
    }

    if (["failed", "abandoned"].includes(gatewayStatus)) {
      await db.from("paystack_transactions").update({
        status: gatewayStatus,
        gateway_response: verified.data.gateway_response,
        updated_at: new Date().toISOString(),
      }).eq("reference", reference);

      return json({
        success: false,
        status: gatewayStatus,
        message: verified.data.gateway_response || `Payment ${gatewayStatus}`,
      });
    }

    return json({
      success: false,
      status: gatewayStatus || "pending",
      message: "Payment is still being processed",
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Internal error" }, 500);
  }
});
