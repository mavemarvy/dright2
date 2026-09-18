import { createClient } from "npm:@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@2.4.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";
const resendFrom = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@dright.store";

const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function userClient(req: Request) {
  const authorization = req.headers.get("Authorization") || "";
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint32Array(1));
  return String(100000 + (bytes[0] % 900000));
}

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const COMMON_PINS = new Set([
  "0000","1111","2222","3333","4444","5555","6666","7777","8888","9999",
  "1234","4321","1212","1004","2000","1122"
]);

function validatePin(pin: string): string | null {
  if (!/^\d{4,8}$/.test(pin)) return "PIN must be 4-8 digits";
  if (COMMON_PINS.has(pin)) return "PIN is too common. Choose a stronger PIN";
  if (/^(\d)\1+$/.test(pin)) return "PIN cannot be all the same digit";
  return null;
}

async function sendPinCode(email: string, code: string) {
  if (!resendApiKey) throw new Error("RESEND_API_KEY is not configured");
  const from = resendFrom.includes("<") ? resendFrom : `DRIGHT <${resendFrom}>`;
  const html = `<!doctype html>
<html><body style="margin:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#18202b">
<div style="max-width:560px;margin:0 auto;padding:28px 16px">
<div style="background:#fff;border:1px solid #e7ebef;border-radius:18px;overflow:hidden">
<div style="background:#0f172a;color:#fff;padding:18px 24px;font-size:20px;font-weight:800">DRIGHT</div>
<div style="padding:28px 24px">
<h1 style="font-size:22px;margin:0 0 12px">Reset your payment PIN</h1>
<p style="color:#526070;line-height:1.6">Use this verification code to reset your DRIGHT payment PIN.</p>
<div style="margin:22px 0;padding:18px;border-radius:12px;background:#fff7ed;text-align:center;font-size:32px;font-weight:800;letter-spacing:8px;color:#c2410c">${code}</div>
<p style="color:#6b7280;font-size:13px;line-height:1.5">This code expires in 10 minutes. Never share it with anyone, including DRIGHT support.</p>
<p style="color:#9ca3af;font-size:12px;margin-top:24px">If you did not request this, secure your DRIGHT account immediately.</p>
</div></div></div></body></html>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "DRIGHT payment PIN reset code",
      html,
    }),
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`Resend ${response.status}: ${text.slice(0, 500)}`);
  try {
    const json = JSON.parse(text);
    return typeof json.id === "string" ? json.id : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const client = userClient(req);
    const { data: { user }, error: userError } = await client.auth.getUser();
    if (userError || !user?.id || !user.email) {
      return new Response(JSON.stringify({ success: false, error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const action = typeof body?.action === "string" ? body.action : "";

    if (action === "request") {
      const minuteAgo = new Date(Date.now() - 60_000).toISOString();
      const hourAgo = new Date(Date.now() - 60 * 60_000).toISOString();

      const [{ count: minuteCount }, { count: hourCount }] = await Promise.all([
        service.from("payment_pin_email_codes")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gte("created_at", minuteAgo),
        service.from("payment_pin_email_codes")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gte("created_at", hourAgo),
      ]);

      if ((minuteCount || 0) >= 1 || (hourCount || 0) >= 6) {
        return new Response(JSON.stringify({
          success: false,
          error: "Please wait before requesting another PIN reset code",
        }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: security } = await service
        .from("payment_security")
        .select("id,is_active")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();

      if (!security) {
        return new Response(JSON.stringify({
          success: false,
          error: "Set a payment PIN before using PIN recovery",
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await service.from("payment_pin_email_codes")
        .update({ used_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .is("used_at", null);

      const code = randomCode();
      const codeHash = bcrypt.hashSync(code, 10);
      const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();

      const { data: inserted, error: insertError } = await service
        .from("payment_pin_email_codes")
        .insert({
          user_id: user.id,
          code_hash: codeHash,
          expires_at: expiresAt,
          attempts: 0,
        })
        .select("id")
        .single();

      if (insertError || !inserted?.id) throw insertError || new Error("Unable to create reset code");

      let messageId: string | null = null;
      try {
        messageId = await sendPinCode(user.email, code);
      } catch (emailError) {
        await service.from("payment_pin_email_codes")
          .update({ used_at: new Date().toISOString() })
          .eq("id", inserted.id);
        throw emailError;
      }

      await service.from("notifications").insert({
        user_id: user.id,
        title: "Payment PIN reset code sent",
        message: "A payment PIN reset code was sent to your verified email address. It expires in 10 minutes.",
        notification_type: "security_alert",
        category: "security",
        priority: "high",
        metadata: {
          event_module: "security",
          event_type: "pin_reset_code_sent",
          email_suppressed: true,
        },
        group_key: `pin_reset_code:${inserted.id}`,
        is_read: false,
        is_archived: false,
        is_deleted: false,
      });

      await service.from("email_logs").insert({
        user_id: user.id,
        recipient_email: user.email,
        template_type: "payment_pin_reset_code",
        subject: "DRIGHT payment PIN reset code",
        status: "sent",
        provider: "resend",
        message_id: messageId,
        metadata: { purpose: "payment_pin_reset", code_id: inserted.id },
      });

      return new Response(JSON.stringify({ success: true, expiresInSeconds: 600 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "reset") {
      const code = typeof body?.code === "string" ? body.code.trim() : "";
      const newPin = typeof body?.newPin === "string" ? body.newPin.trim() : "";
      const pinError = validatePin(newPin);

      if (!/^\d{6}$/.test(code)) {
        return new Response(JSON.stringify({ success: false, error: "Enter the 6-digit reset code" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (pinError) {
        return new Response(JSON.stringify({ success: false, error: pinError }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: codeRow } = await service
        .from("payment_pin_email_codes")
        .select("*")
        .eq("user_id", user.id)
        .is("used_at", null)
        .gt("expires_at", new Date().toISOString())
        .lt("attempts", 5)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!codeRow) {
        return new Response(JSON.stringify({ success: false, error: "Reset code expired. Request a new code." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!bcrypt.compareSync(code, codeRow.code_hash)) {
        const attempts = Number(codeRow.attempts || 0) + 1;
        await service.from("payment_pin_email_codes")
          .update({
            attempts,
            ...(attempts >= 5 ? { used_at: new Date().toISOString() } : {}),
          })
          .eq("id", codeRow.id);

        return new Response(JSON.stringify({
          success: false,
          error: attempts >= 5 ? "Too many incorrect attempts. Request a new code." : "Incorrect reset code",
          attemptsRemaining: Math.max(0, 5 - attempts),
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const pinHash = await sha256(newPin + "dright_salt_2024");
      const { data: result, error: resetError } = await service.rpc(
        "consume_payment_pin_email_code",
        {
          p_code_id: codeRow.id,
          p_user_id: user.id,
          p_new_pin_hash: pinHash,
          p_pin_length: newPin.length,
        },
      );

      if (resetError || !result?.success) {
        return new Response(JSON.stringify({
          success: false,
          error: resetError?.message || result?.error || "Unable to reset PIN",
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: false, error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "PIN recovery failed",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
