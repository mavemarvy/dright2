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
    const expectedAmount = Number(tx.amount);
    const gatewayCurrency = String(verified.data.currency || "").toUpperCase();
    const expectedCurrency = String(tx.currency || "NGN").toUpperCase();

    if (gatewayStatus === "success") {
      if (!Number.isFinite(gatewayAmount) || !Number.isFinite(expectedAmount) || Math.abs(gatewayAmount - expectedAmount) > 0.01) {
        return json({
          success: false,
          status: "failed",
          message: "Verified gateway amount does not match DRIGHT transaction amount",
        }, 409);
      }

      if (!gatewayCurrency || gatewayCurrency !== expectedCurrency) {
        return json({
          success: false,
          status: "failed",
          message: "Verified gateway currency does not match DRIGHT transaction currency",
        }, 409);
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

      const { data: result, error: rpcError } = await db.rpc("process_paystack_payment", {
        p_reference: reference,
        p_user_id: tx.user_id,
        p_amount: expectedAmount,
        p_purpose: tx.purpose,
        p_reference_id: tx.reference_id,
        p_metadata: tx.metadata,
      });

      if (rpcError) return json({ error: "Payment processing failed" }, 500);
      if (result?.success === false) return json({ error: result.error || "Payment processing failed" }, 500);

      // process_paystack_payment is the authoritative idempotent processor and
      // records processed_at. This update is only a compatibility safeguard.
      await db.from("paystack_transactions")
        .update({ processed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("reference", reference)
        .is("processed_at", null);

      if (result?.idempotent !== true) {
        await db.from("notifications").insert({
          user_id: tx.user_id,
          notification_type: "payment_success",
          title: "Payment Successful",
          message: `Your payment of ${expectedAmount.toLocaleString()} was successful. Reference: ${reference}`,
          priority: "high",
          metadata: {
            reference,
            amount: expectedAmount,
            purpose: tx.purpose,
            channel: verified.data.channel,
          },
        }).catch(() => {});
      }

      return json({
        success: true,
        status: "success",
        amount: expectedAmount,
        purpose: tx.purpose,
        channel: verified.data.channel,
        reference,
      });
    }

    if (gatewayStatus === "reversed") {
      const reversalAmount = Number.isFinite(gatewayAmount) ? gatewayAmount : expectedAmount;
      const { data: result, error: reversalError } = await db.rpc("process_paystack_refund_event", {
        p_transaction_reference: reference,
        p_gateway_reference: `reversal:${reference}`,
        p_amount: reversalAmount,
        p_currency: gatewayCurrency || expectedCurrency,
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
