import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, pin, amount, wallet_id, balance_field, description, reference_type } = body;

    if (!action || !pin) {
      return new Response(JSON.stringify({ error: "Missing action or PIN" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Hash the PIN the same way the client does
    const encoder = new TextEncoder();
    const pinData = encoder.encode(pin + "dright_salt_2024");
    const pinHashBuffer = await crypto.subtle.digest("SHA-256", pinData);
    const pinHash = Array.from(new Uint8Array(pinHashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");

    // Verify PIN server-side
    const { data: verifyResult, error: verifyError } = await supabase.rpc("verify_payment_pin", {
      p_user_id: user.id,
      p_pin_hash: pinHash,
      p_context: action,
    });

    if (verifyError) {
      return new Response(JSON.stringify({ error: "PIN verification failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = verifyResult as any;
    if (!result.success) {
      return new Response(JSON.stringify({
        authorized: false,
        error: result.error,
        locked_until: result.locked_until,
        attempts_remaining: result.attempts_remaining,
      }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // PIN verified — now process the authorized action
    let actionResult: any = { success: true, action: "verified" };

    if (action === "withdrawal" || action === "transfer" || action === "purchase" || action === "subscription" || action === "promotion") {
      if (wallet_id && amount) {
        const { data: txResult, error: txError } = await supabase.rpc("process_wallet_transaction", {
          p_user_id: user.id,
          p_wallet_id: wallet_id,
          p_type: "debit",
          p_amount: amount,
          p_description: description || action,
          p_reference_type: reference_type || action,
          p_balance_field: balance_field || "balance",
        });
        actionResult = txResult;
        if (txError) actionResult = { success: false, error: txError.message };
      }
    } else if (action === "escrow_release") {
      if (wallet_id && amount) {
        const { data: txResult, error: txError } = await supabase.rpc("process_wallet_transaction", {
          p_user_id: user.id,
          p_wallet_id: wallet_id,
          p_type: "credit",
          p_amount: amount,
          p_description: description || "Escrow release",
          p_reference_type: "escrow_release",
          p_balance_field: "escrow_balance",
        });
        actionResult = txResult;
        if (txError) actionResult = { success: false, error: txError.message };
      }
    } else if (action === "payout_account_change" || action === "security_settings_change") {
      // PIN verified, client can proceed with the action
      actionResult = { success: true, authorized: true };
    }

    // Log the authorized action
    await supabase.from("payment_security_logs").insert({
      user_id: user.id,
      event_type: `${action}_approved`,
      description: `${action} authorized via PIN`,
    });

    return new Response(JSON.stringify({
      authorized: true,
      ...actionResult,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
