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
  console.log(`[${ts}] [paystack-initialize] [${level}] ${message}${payload}`);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

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

    const body = await req.json();
    const { amount, purpose = "wallet_funding", reference_id, metadata = {}, channels } = body;

    log("INFO", "Initialize request", { userId: user.id, amount, purpose, reference_id: reference_id || null });

    if (!amount || amount < 100) {
      log("WARN", "Amount below minimum", { amount });
      return new Response(JSON.stringify({ error: "Minimum amount is 100 NGN" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!PAYSTACK_SECRET) {
      return new Response(JSON.stringify({ error: "Paystack not configured. Set PAYSTACK_SECRET_KEY." }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get user email
    const { data: userData } = await supabase
      .from("users")
      .select("email, full_name")
      .eq("id", user.id)
      .maybeSingle();

    if (!userData?.email) {
      log("WARN", "User email not found", { userId: user.id });
      return new Response(JSON.stringify({ error: "User email not found" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Generate unique reference
    const reference = `DRG_${Date.now()}_${user.id.slice(0, 8)}`;

    // Create transaction record
    const { error: insertErr } = await supabase.from("paystack_transactions").insert({
      user_id: user.id,
      reference,
      amount: amount / 100,
      currency: "NGN",
      purpose,
      reference_id: reference_id || null,
      status: "initialized",
      metadata,
      idempotency_key: reference,
    });

    if (insertErr) {
      log("ERROR", "Failed to create transaction record", { reference, error: insertErr.message });
    } else {
      log("INFO", "Transaction record created", { reference, amount: amount / 100, purpose });
    }

    // Record payment attempt for fraud tracking
    const clientInfo = {
      ip: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null,
      userAgent: req.headers.get("user-agent") || null,
    };
    await supabase.from("payment_attempts").insert({
      user_id: user.id,
      reference,
      provider: "paystack",
      amount: amount / 100,
      currency: "NGN",
      status: "initialized",
      purpose,
      ip_address: clientInfo.ip,
      device_info: clientInfo.userAgent,
      user_agent: clientInfo.userAgent,
      metadata,
    }).then(() => log("INFO", "Payment attempt recorded", { reference }))
      .catch((e) => log("WARN", "Failed to record payment attempt", { reference, error: e.message }));

    // Initialize Paystack transaction
    const paystackRes = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: userData.email,
        amount: Math.round(amount),
        reference,
        callback_url: `${Deno.env.get("APP_URL") || req.headers.get("origin") || ""}${metadata.custom_redirect || "/payment/callback"}?reference=${reference}`,
        channels: channels || ["card", "bank", "ussd", "bank_transfer", "mobile_money"],
        metadata: {
          user_id: user.id,
          purpose,
          reference_id: reference_id || null,
          custom_fields: [
            { display_name: "User ID", variable_name: "user_id", value: user.id },
            { display_name: "Purpose", variable_name: "purpose", value: purpose },
          ],
        },
      }),
    });

    const paystackData = await paystackRes.json();

    if (!paystackData.status || !paystackData.data) {
      log("ERROR", "Paystack initialization failed", { reference, message: paystackData.message });
      await supabase.from("paystack_transactions")
        .update({ status: "failed", gateway_response: paystackData.message })
        .eq("reference", reference);

      return new Response(JSON.stringify({ error: paystackData.message || "Paystack initialization failed" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update with Paystack reference
    await supabase.from("paystack_transactions")
      .update({ paystack_reference: paystackData.data.reference, status: "pending" })
      .eq("reference", reference);

    log("INFO", "Paystack initialization successful", { reference, paystackRef: paystackData.data.reference });

    return new Response(JSON.stringify({
      success: true,
      authorization_url: paystackData.data.authorization_url,
      access_code: paystackData.data.access_code,
      reference,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    log("ERROR", "Unhandled exception", { error: err instanceof Error ? err.message : String(err) });
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
