import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";
const resendFrom = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@dright.store";

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function turnstileSecret() {
  return Deno.env.get("TURNSTILE_SECRET") || Deno.env.get("TURNSTILE_SECRET_KEY") || "";
}

async function sha256(value: string) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyTurnstile(token: string, expectedAction: string, ip?: string | null) {
  const secret = turnstileSecret();
  if (!secret) throw new Error("Turnstile is not configured");
  const form = new URLSearchParams();
  form.set("secret", secret);
  form.set("response", token);
  if (ip) form.set("remoteip", ip);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const result = await response.json();
  if (!result?.success) return false;
  if (typeof result?.action === "string" && result.action && result.action !== expectedAction) return false;
  return true;
}

async function sendOtpEmail(email: string, otp: string, purpose: string) {
  if (!resendApiKey) throw new Error("RESEND_API_KEY is not configured");
  const isRecovery = purpose === "password_reset";
  const title = isRecovery ? "Reset your DRIGHT password" : "Verify your DRIGHT account";
  const intro = isRecovery
    ? "Use this Supabase-issued code to continue your password reset."
    : "Use this Supabase-issued code to verify your email and activate your DRIGHT account.";
  const from = resendFrom.includes("<") ? resendFrom : `DRIGHT <${resendFrom}>`;

  const html = `<!doctype html>
<html><body style="margin:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#18202b">
<div style="max-width:560px;margin:0 auto;padding:28px 16px">
<div style="background:#fff;border:1px solid #e7ebef;border-radius:18px;overflow:hidden">
<div style="background:#0f172a;color:#fff;padding:18px 24px;font-size:20px;font-weight:800">DRIGHT</div>
<div style="padding:28px 24px">
<h1 style="font-size:22px;margin:0 0 12px">${title}</h1>
<p style="color:#526070;line-height:1.6">${intro}</p>
<div style="margin:22px 0;padding:18px;border-radius:12px;background:#eff6ff;text-align:center;font-size:32px;font-weight:800;letter-spacing:8px;color:#1d4ed8">${otp}</div>
<p style="color:#6b7280;font-size:13px;line-height:1.5">Use this code promptly. Never share it with anyone, including DRIGHT support.</p>
<p style="color:#9ca3af;font-size:12px;margin-top:24px">If you did not request this, ignore this email and secure your account if necessary.</p>
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
      subject: title,
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

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  let emailHash = "";
  let purpose = "";

  try {
    const body = await req.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    purpose = body?.purpose === "account_verification" ? "account_verification" : body?.purpose === "password_reset" ? "password_reset" : "";
    const token = typeof body?.turnstileToken === "string" ? body.turnstileToken.trim() : "";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ success: false, error: "Enter a valid email address" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!purpose || !token) {
      return new Response(JSON.stringify({ success: false, error: "Missing verification request data" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const action = purpose === "password_reset" ? "password_reset_code" : "account_verification_code";
    const turnstileOk = await verifyTurnstile(token, action, ip);
    if (!turnstileOk) {
      return new Response(JSON.stringify({ success: false, error: "Cloudflare verification failed" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    emailHash = await sha256(email);
    const ipHash = ip ? await sha256(ip) : null;
    const hourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
    const minuteAgo = new Date(Date.now() - 60_000).toISOString();

    const [{ count: hourCount }, { count: recentCount }] = await Promise.all([
      supabase.from("auth_email_code_requests").select("id", { count: "exact", head: true })
        .eq("email_hash", emailHash).eq("purpose", purpose).gte("created_at", hourAgo),
      supabase.from("auth_email_code_requests").select("id", { count: "exact", head: true })
        .eq("email_hash", emailHash).eq("purpose", purpose).gte("created_at", minuteAgo),
    ]);

    if ((hourCount || 0) >= 8 || (recentCount || 0) >= 1) {
      await supabase.from("auth_email_code_requests").insert({
        email_hash: emailHash, purpose, success: false, ip_hash: ipHash, error_code: "rate_limited",
      });
      return new Response(JSON.stringify({ success: false, error: "Please wait before requesting another code" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const type = purpose === "password_reset" ? "recovery" : "magiclink";
    const { data, error } = await supabase.auth.admin.generateLink({ type, email } as any);

    const otp = (data as any)?.properties?.email_otp;
    const userId = (data as any)?.user?.id || null;

    if (error || typeof otp !== "string" || otp.length < 6) {
      await supabase.from("auth_email_code_requests").insert({
        email_hash: emailHash, purpose, success: false, ip_hash: ipHash,
        error_code: error?.message?.slice(0, 120) || "otp_unavailable",
      });
      // Do not expose whether the email exists.
      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const messageId = await sendOtpEmail(email, otp, purpose);

    await supabase.from("auth_email_code_requests").insert({
      email_hash: emailHash, purpose, success: true, ip_hash: ipHash,
    });

    await supabase.from("email_logs").insert({
      user_id: userId,
      recipient_email: email,
      template_type: purpose === "password_reset" ? "password_reset_code" : "account_verification_code",
      subject: purpose === "password_reset" ? "Reset your DRIGHT password" : "Verify your DRIGHT account",
      status: "sent",
      provider: "resend",
      message_id: messageId,
      metadata: { credential_issuer: "supabase_auth", purpose },
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    if (emailHash && purpose) {
      await supabase.from("auth_email_code_requests").insert({
        email_hash: emailHash,
        purpose,
        success: false,
        error_code: error instanceof Error ? error.message.slice(0, 120) : "internal_error",
      }).catch(() => {});
    }
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Unable to send verification code",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
