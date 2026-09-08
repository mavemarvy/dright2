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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Missing auth" }, 401);
    const token = auth.slice("Bearer ".length);
    const { createClient } = await import("npm:@supabase/supabase-js@2");
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user }, error: authError } = await db.auth.getUser(token);
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const contractId = typeof body?.contract_id === "string" ? body.contract_id.trim() : "";
    if (!contractId) return json({ error: "Contract reference is required" }, 400);

    const { data: contract, error: contractError } = await db.from("sales_team_contracts")
      .select("id,seller_id,sales_team_id,product_id,duration,total_amount,status,selected_tier,billing_currency,payment_status,payment_id")
      .eq("id", contractId).maybeSingle();
    if (contractError) return json({ error: "Unable to validate contract" }, 500);
    if (!contract) return json({ error: "Sales team contract not found" }, 404);
    if (contract.seller_id !== user.id) return json({ error: "Contract does not belong to authenticated seller" }, 403);
    if (contract.status !== "pending" || contract.payment_status !== "pending" || contract.payment_id) {
      return json({ error: "Contract is not awaiting payment" }, 409);
    }

    const amount = Number(contract.total_amount);
    const currency = String(contract.billing_currency || "").toUpperCase();
    if (!Number.isFinite(amount) || amount <= 0 || !currency) return json({ error: "Contract pricing is invalid" }, 409);

    const { data: provider, error: providerError } = await db.from("payment_providers")
      .select("slug,status,supported_currencies").eq("slug", "paystack").maybeSingle();
    if (providerError) return json({ error: "Unable to validate payment provider" }, 500);
    const supported = Array.isArray(provider?.supported_currencies)
      ? provider.supported_currencies.map((value: unknown) => String(value).toUpperCase()) : [];
    if (!provider || provider.status !== "enabled" || !supported.includes(currency)) {
      return json({ error: `Paystack is not enabled for ${currency} sales team contract payments` }, 409);
    }
    if (!SECRET) return json({ error: "Paystack not configured" }, 503);

    const { data: profile } = await db.from("users").select("email").eq("id", user.id).maybeSingle();
    const email = user.email || profile?.email;
    if (!email) return json({ error: "User email not found" }, 400);

    const reference = `DRG_ST_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const metadata = {
      user_id: user.id,
      seller_id: user.id,
      contract_id: contract.id,
      product_id: contract.product_id,
      assigned_user_id: contract.sales_team_id,
      tier: contract.selected_tier,
      duration: contract.duration,
      purpose: "sales_team_contract",
      reference_id: contract.id,
      authoritative_amount: amount,
      authoritative_currency: currency,
      provider: "paystack",
      source: "dright_server",
    };

    const { error: txError } = await db.from("paystack_transactions").insert({
      user_id: user.id,
      reference,
      amount,
      currency,
      purpose: "sales_team_contract",
      reference_id: contract.id,
      status: "initialized",
      metadata,
      idempotency_key: reference,
    });
    if (txError) return json({ error: "Unable to create payment transaction" }, 500);

    await db.from("payment_attempts").insert({
      user_id: user.id,
      reference,
      provider: "paystack",
      amount,
      currency,
      status: "initialized",
      purpose: "sales_team_contract",
      metadata,
    }).catch(() => {});

    const appUrl = (Deno.env.get("APP_URL") || req.headers.get("origin") || "").replace(/\/$/, "");
    if (!appUrl) return json({ error: "Application URL is not configured" }, 503);
    const paystackRes = await fetch(`${BASE}/transaction/initialize`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        amount: Math.round(amount * 100),
        currency,
        reference,
        callback_url: `${appUrl}/payment/callback?reference=${encodeURIComponent(reference)}`,
        metadata: { user_id: user.id, purpose: "sales_team_contract", reference_id: contract.id },
      }),
    });
    const paystack = await paystackRes.json().catch(() => ({}));
    if (!paystackRes.ok || !paystack?.status || !paystack?.data) {
      const message = String(paystack?.message || "Paystack initialization failed");
      await db.from("paystack_transactions").update({ status: "failed", gateway_response: message, updated_at: new Date().toISOString() }).eq("reference", reference);
      return json({ error: message }, 400);
    }
    await db.from("paystack_transactions").update({ status: "pending", paystack_reference: paystack.data.reference, updated_at: new Date().toISOString() }).eq("reference", reference);
    return json({ success: true, authorization_url: paystack.data.authorization_url, reference, amount, currency, purpose: "sales_team_contract", reference_id: contract.id });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Internal error" }, 500);
  }
});
