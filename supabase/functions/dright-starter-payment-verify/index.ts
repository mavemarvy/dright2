import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const SECRET = Deno.env.get("PAYSTACK_SECRET_KEY") || "";
const BASE = "https://api.paystack.co";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const reference = typeof body.reference === "string" ? body.reference.trim().slice(0, 160) : "";
    if (!reference || !reference.startsWith("DRG_STARTER_")) {
      return json({ error: "Invalid DRIGHT Starter payment reference." }, 400);
    }

    const { data: purchase, error: purchaseError } = await db.from("dright_starter_purchases")
      .select("id,buyer_email,amount,currency,payment_status,status,processed_at,included_trial_days")
      .eq("payment_reference", reference)
      .maybeSingle();

    if (purchaseError) return json({ error: "Unable to load Starter purchase." }, 500);
    if (!purchase) return json({ error: "Starter purchase not found." }, 404);

    if (purchase.processed_at && purchase.payment_status === "success") {
      const { data: settings } = await db.from("dright_starter_product_settings")
        .select("title")
        .eq("singleton", true)
        .maybeSingle();
      return json({
        success: true,
        status: "success",
        idempotent: true,
        reference,
        purchase_id: purchase.id,
        title: settings?.title || "DRIGHT Starter Access",
        amount: Number(purchase.amount),
        currency: purchase.currency,
        included_trial_days: purchase.included_trial_days,
      });
    }

    if (!SECRET) return json({ error: "Paystack is not configured." }, 503);

    const response = await fetch(`${BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${SECRET}` },
    });
    const verified = await response.json().catch(() => ({}));
    const gatewayStatus = String(verified?.data?.status || "").toLowerCase();

    if (!response.ok || !verified?.status) {
      return json({ success: false, status: gatewayStatus || "pending", message: verified?.message || "Payment is still being verified." }, 202);
    }

    if (String(verified.data?.reference || "") !== reference) {
      return json({ error: "Paystack reference mismatch." }, 409);
    }

    if (gatewayStatus !== "success") {
      if (["failed", "abandoned", "reversed"].includes(gatewayStatus)) {
        await db.from("dright_starter_purchases").update({
          payment_status: "failed",
          status: "payment_failed",
          gateway_response: verified.data?.gateway_response || gatewayStatus,
          updated_at: new Date().toISOString(),
        }).eq("id", purchase.id);
      }
      return json({
        success: false,
        status: gatewayStatus || "pending",
        message: gatewayStatus ? `Payment is ${gatewayStatus}.` : "Payment is still processing.",
      }, ["failed", "abandoned", "reversed"].includes(gatewayStatus) ? 400 : 202);
    }

    const paidAmount = Number(verified.data.amount) / 100;
    const currency = String(verified.data.currency || "").toUpperCase();
    if (!Number.isFinite(paidAmount) || Math.abs(paidAmount - Number(purchase.amount)) > 0.01) {
      return json({ error: "Verified payment amount does not match the Starter purchase." }, 409);
    }
    if (currency !== String(purchase.currency || "").toUpperCase()) {
      return json({ error: "Verified payment currency does not match the Starter purchase." }, 409);
    }

    const { data: processed, error: processError } = await db.rpc("process_verified_dright_starter_purchase", {
      p_reference: reference,
      p_amount: Number(purchase.amount),
      p_currency: purchase.currency,
      p_gateway_response: verified.data.gateway_response || null,
      p_paid_at: verified.data.paid_at || new Date().toISOString(),
      p_channel: verified.data.channel || null,
    });
    if (processError) {
      console.error("[dright-starter-payment-verify] finalization failed", processError.message);
      return json({ error: "Payment was verified but Starter finalization needs attention." }, 500);
    }

    const { data: settings } = await db.from("dright_starter_product_settings")
      .select("title")
      .eq("singleton", true)
      .maybeSingle();

    return json({
      success: true,
      status: "success",
      idempotent: processed?.idempotent === true,
      reference,
      purchase_id: purchase.id,
      title: settings?.title || "DRIGHT Starter Access",
      amount: Number(purchase.amount),
      currency: purchase.currency,
      included_trial_days: purchase.included_trial_days,
    });
  } catch (error) {
    console.error("[dright-starter-payment-verify]", error);
    return json({ error: error instanceof Error ? error.message : "Starter payment verification failed." }, 500);
  }
});
