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
      const expectedAmount = Number(tx.amount);
      const gatewayCurrency = String(verified.data.currency || "").toUpperCase();
      const expectedCurrency = String(tx.currency || "NGN").toUpperCase();

      if (!Number.isFinite(gatewayAmount) || !Number.isFinite(expectedAmount) || Math.abs(gatewayAmount - expectedAmount) > 0.01) {
        return json({ error: "Verified gateway amount does not match DRIGHT transaction amount" }, 409);
      }
      if (!gatewayCurrency || gatewayCurrency !== expectedCurrency) {
        return json({ error: "Verified gateway currency does not match DRIGHT transaction currency" }, 409);
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

      const { data: processed, error: processError } = await db.rpc("process_paystack_payment", {
        p_reference: ref,
        p_user_id: tx.user_id,
        p_amount: expectedAmount,
        p_purpose: tx.purpose,
        p_reference_id: tx.reference_id,
        p_metadata: tx.metadata,
      });

      if (processError) return json({ error: "Payment processing failed" }, 500);
      if (processed?.success === false) return json({ error: processed.error || "Payment processing failed" }, 500);

      await db.from("paystack_transactions")
        .update({ processed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("reference", ref)
        .is("processed_at", null);

      if (processed?.idempotent !== true) {
        await sendPaymentNotification(db, tx, expectedAmount, ref, verified.data.channel);
      }

      await db.from("analytics_events").insert({
        event_type: "payment_success",
        entity_type: "paystack_transaction",
        entity_id: tx.id,
        seller_id: tx.user_id,
        viewer_id: tx.user_id,
        metadata: {
          reference: ref,
          amount: expectedAmount,
          currency: expectedCurrency,
          purpose: tx.purpose,
          channel: verified.data.channel,
          source: "paystack_webhook",
        },
      }).catch(() => {});
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
      const amount = d.amount != null ? Number(d.amount) / 100 : 0;
      const { data: result, error } = await db.rpc("process_paystack_refund_event", {
        p_transaction_reference: transactionReference,
        p_gateway_reference: gatewayReference,
        p_amount: amount,
        p_currency: d.currency || "NGN",
        p_status: status,
        p_reason: d.reason || d.status || event.event,
      });
      if (error) return json({ error: "Refund processing failed" }, 500);
      if (result?.success === false) return json({ error: result.error || "Refund processing failed" }, 500);
    } else if ([
      "charge.dispute.create",
      "charge.dispute.remind",
      "charge.dispute.resolve",
    ].includes(event.event)) {
      await db.from("analytics_events").insert({
        event_type: event.event,
        entity_type: "paystack_transaction",
        metadata: {
          reference: d.transaction?.reference || d.reference || null,
          source: "paystack_webhook",
          payload: d,
        },
      }).catch(() => {});
    } else if (event.event === "charge.failed") {
      if (d.reference) {
        await db.from("paystack_transactions").update({
          status: "failed",
          gateway_response: d.gateway_response,
          updated_at: new Date().toISOString(),
        }).eq("reference", d.reference);
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
  reference: string,
  channel: string,
) {
  const funding = tx.purpose === "wallet_funding" || tx.purpose === "advertiser_funding";
  await db.from("notifications").insert({
    user_id: tx.user_id,
    notification_type: "payment_success",
    title: funding ? "Wallet Funded Successfully" : "Payment Successful",
    message: funding
      ? `Your wallet has been credited with ${amount.toLocaleString()} via ${channel}.`
      : `Your payment of ${amount.toLocaleString()} was successful. Reference: ${reference}`,
    priority: "high",
    metadata: { reference, amount, purpose: tx.purpose, channel },
  }).catch(() => {});

  if ((tx.purpose === "product_purchase" || tx.purpose === "escrow") && tx.reference_id) {
    const { data: order } = await db.from("sales_records")
      .select("seller_id,product_name")
      .eq("order_id", tx.reference_id)
      .maybeSingle();
    if (order?.seller_id) {
      await db.from("notifications").insert({
        user_id: order.seller_id,
        notification_type: "new_order",
        title: "New Order Received!",
        message: `You received a new order for ${order.product_name || "your product"}.`,
        priority: "high",
        metadata: { reference, amount, orderId: tx.reference_id },
      }).catch(() => {});
    }
  }
}
