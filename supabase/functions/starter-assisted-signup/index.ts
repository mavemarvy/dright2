import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

function serviceClient() {
  return createClient(URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function callerClient(req: Request) {
  return createClient(URL, ANON_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function validPassword(password: string) {
  if (password.length < 8 || password.length > 128) return false;
  let groups = 0;
  if (/[a-z]/.test(password)) groups++;
  if (/[A-Z]/.test(password)) groups++;
  if (/\d/.test(password)) groups++;
  if (/[^A-Za-z0-9]/.test(password)) groups++;
  return groups >= 3;
}

function usernameFor(email: string, userId: string) {
  const local = (email.split("@")[0] || "user")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 18) || "user";
  return `${local}_${userId.replace(/-/g, "").slice(0, 8)}`.slice(0, 30);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function setupPurchaseForHelper(service: ReturnType<typeof serviceClient>, reference: string, helperId: string) {
  const { data, error } = await service
    .from("dright_starter_purchases")
    .select("id,buyer_name,buyer_email,payment_reference,payment_status,status,processed_at,paid_at,buyer_user_id,claimed_at,included_trial_days,referrer_id,tracking_code,metadata")
    .eq("payment_reference", reference)
    .maybeSingle();

  if (error || !data) return { purchase: null, error: "Starter purchase not found." };

  const mode = String(data.metadata?.checkout_mode || "");
  const assistedBy = String(data.metadata?.assisted_by_user_id || "");
  if (mode !== "assisted_signup" || assistedBy !== helperId || data.referrer_id !== helperId) {
    return { purchase: null, error: "This Starter payment does not belong to your assisted signup." };
  }
  return { purchase: data, error: null };
}

async function sendSetupEmail(input: {
  to: string;
  name: string;
  temporaryPassword: string;
  userId: string;
  purchaseReference: string;
}) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { success: false, error: "RESEND_API_KEY is not configured" };

  const appUrl = (Deno.env.get("APP_URL") || "https://www.dright.store").replace(/\/$/, "");
  const signInUrl = `${appUrl}/sign-in`;
  const safeName = escapeHtml(input.name || "there");
  const safeEmail = escapeHtml(input.to);
  const safePassword = escapeHtml(input.temporaryPassword);
  const safeSignIn = escapeHtml(signInUrl);

  const html = `<!doctype html>
<html><body style="margin:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#111827">
<div style="max-width:620px;margin:0 auto;padding:28px 16px">
<div style="background:#fff;border:1px solid #e5e7eb;border-radius:20px;overflow:hidden">
<div style="padding:26px 28px;background:#0f172a;color:#fff">
<div style="font-size:13px;letter-spacing:.14em;text-transform:uppercase;opacity:.8">DRIGHT</div>
<h1 style="font-size:25px;line-height:1.25;margin:8px 0 0">Your DRIGHT account is ready</h1>
</div>
<div style="padding:28px">
<p>Hello <strong>${safeName}</strong>,</p>
<p style="line-height:1.65">A registered DRIGHT member completed DRIGHT Starter for you and helped create your account. Use these temporary sign-in details:</p>
<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:18px;margin:20px 0">
<div style="font-size:12px;color:#64748b;text-transform:uppercase">Email</div>
<div style="font-size:16px;font-weight:700;margin-top:5px;word-break:break-all">${safeEmail}</div>
<div style="font-size:12px;color:#64748b;text-transform:uppercase;margin-top:16px">Temporary password</div>
<div style="font-size:20px;font-weight:800;margin-top:5px;word-break:break-all">${safePassword}</div>
</div>
<a href="${safeSignIn}" style="display:block;text-align:center;background:#2563eb;color:#fff;text-decoration:none;padding:14px 18px;border-radius:12px;font-weight:800">Sign in to DRIGHT</a>
<div style="margin-top:22px;padding:15px;border-radius:12px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;font-size:13px;line-height:1.55">
On your first sign-in, DRIGHT will require you to replace this temporary password and verify your email. KYC, profile details and questionnaires can then be completed from Settings.
</div>
<p style="font-size:12px;color:#64748b;line-height:1.55;margin-top:22px">Do not share this password. If you did not expect this account, contact support@dright.store.</p>
</div></div></div></body></html>`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "DRIGHT <support@dright.store>",
        to: input.to,
        subject: "Your DRIGHT account is ready — temporary login details",
        html,
      }),
    });
    const raw = await response.text();
    let providerId: string | null = null;
    try {
      const parsed = JSON.parse(raw);
      providerId = parsed?.id || parsed?.message_id || null;
    } catch { /* provider body may be plain text */ }

    const service = serviceClient();
    await service.from("email_logs").insert({
      user_id: input.userId,
      recipient_email: input.to,
      template_type: "assisted_signup_credentials",
      subject: "Your DRIGHT account is ready — temporary login details",
      status: response.ok ? "sent" : "failed",
      provider: "resend",
      message_id: providerId,
      error_message: response.ok ? null : raw.slice(0, 300),
      metadata: {
        source: "assisted_signup",
        purchase_reference: input.purchaseReference,
        temporary_password_logged: false,
      },
    });

    if (!response.ok) return { success: false, error: `Resend error (${response.status})` };
    return { success: true, messageId: providerId };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unable to send login email" };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    if (!URL || !SERVICE_ROLE || !ANON_KEY) {
      return json({ success: false, error: "Assisted signup is not configured." }, 503);
    }

    const caller = callerClient(req);
    const service = serviceClient();
    const { data: authData, error: authError } = await caller.auth.getUser();
    const callerUser = authData?.user;
    if (authError || !callerUser?.id) return json({ success: false, error: "Authentication required" }, 401);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");

    if (action === "change_password") {
      const newPassword = String(body?.new_password || "");
      if (!validPassword(newPassword)) {
        return json({
          success: false,
          error: "Use 8–128 characters and at least three of: uppercase, lowercase, number, symbol.",
        }, 400);
      }

      const { data: onboarding } = await service
        .from("dright_client_onboarding")
        .select("user_id,must_change_password")
        .eq("user_id", callerUser.id)
        .maybeSingle();
      if (!onboarding) return json({ success: false, error: "First-login setup was not found." }, 404);
      if (onboarding.must_change_password === false) return json({ success: true, password_changed: true, idempotent: true });

      const { error: passwordError } = await service.auth.admin.updateUserById(callerUser.id, { password: newPassword });
      if (passwordError) return json({ success: false, error: passwordError.message }, 400);

      const { error: markError } = await service.rpc("service_mark_dright_client_password_changed", {
        p_user_id: callerUser.id,
      });
      if (markError) return json({ success: false, error: markError.message }, 500);

      return json({ success: true, password_changed: true });
    }

    if (action === "verify_email") {
      const token = String(body?.token || "").replace(/\D/g, "").slice(0, 6);
      const email = String(callerUser.email || "").trim().toLowerCase();
      if (!/^\d{6}$/.test(token) || !email) {
        return json({ success: false, error: "Enter the 6-digit verification code." }, 400);
      }

      const verifier = createClient(URL, ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: verified, error: verifyError } = await verifier.auth.verifyOtp({
        email,
        token,
        type: "email",
      });
      if (verifyError || verified.user?.id !== callerUser.id) {
        return json({ success: false, error: verifyError?.message || "That verification code is invalid or expired." }, 400);
      }

      const { error: markError } = await service.rpc("service_mark_dright_client_email_verified", {
        p_user_id: callerUser.id,
      });
      if (markError) return json({ success: false, error: markError.message }, 500);
      return json({ success: true, email_verified: true });
    }

    if (action === "get_purchase") {
      const reference = String(body?.reference || "").trim().slice(0, 160);
      if (!reference) return json({ success: false, error: "Payment reference is required." }, 400);

      const loaded = await setupPurchaseForHelper(service, reference, callerUser.id);
      if (!loaded.purchase) return json({ success: false, error: loaded.error || "Starter purchase not found." }, 404);
      const purchase = loaded.purchase;

      if (purchase.payment_status !== "success" || !purchase.processed_at || !purchase.paid_at) {
        return json({ success: false, error: "Starter payment has not been verified yet." }, 409);
      }

      return json({
        success: true,
        reference: purchase.payment_reference,
        full_name: purchase.buyer_name,
        email: purchase.buyer_email,
        claimed: Boolean(purchase.claimed_at || purchase.buyer_user_id),
        included_trial_days: purchase.included_trial_days,
      });
    }

    if (action !== "create_account") return json({ success: false, error: "Unsupported action" }, 400);

    const reference = String(body?.reference || "").trim().slice(0, 160);
    const temporaryPassword = String(body?.temporary_password || "");
    if (!reference) return json({ success: false, error: "Verified Starter payment reference is required." }, 400);
    if (!validPassword(temporaryPassword)) {
      return json({
        success: false,
        error: "Temporary password must be 8–128 characters and use at least three of: uppercase, lowercase, number, symbol.",
      }, 400);
    }

    const { data: helper } = await service
      .from("users")
      .select("id,account_status,referral_code")
      .eq("id", callerUser.id)
      .maybeSingle();
    if (!helper || String(helper.account_status || "").toUpperCase() !== "ACTIVE") {
      return json({ success: false, error: "Your DRIGHT account must be active." }, 403);
    }

    const loaded = await setupPurchaseForHelper(service, reference, callerUser.id);
    if (!loaded.purchase) return json({ success: false, error: loaded.error || "Starter purchase not found." }, 404);
    const purchase = loaded.purchase;
    const email = String(purchase.buyer_email || "").trim().toLowerCase();
    const fullName = String(purchase.buyer_name || "").trim().replace(/\s+/g, " ");

    if (purchase.payment_status !== "success" || !purchase.processed_at || !purchase.paid_at) {
      return json({ success: false, error: "Starter payment has not been verified yet." }, 409);
    }

    const { data: existingProfiles, error: existingError } = await service
      .from("users")
      .select("id,email,full_name")
      .eq("email", email)
      .limit(2);
    if (existingError) return json({ success: false, error: "Unable to check the new account." }, 500);

    if (existingProfiles && existingProfiles.length > 0) {
      if (existingProfiles.length > 1) return json({ success: false, error: "Multiple profiles use this email." }, 409);
      const existing = existingProfiles[0];
      const { data: onboarding } = await service
        .from("dright_client_onboarding")
        .select("user_id,starter_purchase_id,created_by,must_change_password,onboarding_type")
        .eq("user_id", existing.id)
        .maybeSingle();
      const { data: purchaseRow } = await service
        .from("dright_starter_purchases")
        .select("payment_reference")
        .eq("id", onboarding?.starter_purchase_id || "00000000-0000-0000-0000-000000000000")
        .maybeSingle();

      if (!onboarding
          || onboarding.onboarding_type !== "assisted_signup"
          || onboarding.created_by !== callerUser.id
          || purchaseRow?.payment_reference !== reference) {
        return json({ success: false, error: "An account already exists for this email." }, 409);
      }
      if (onboarding.must_change_password !== true) {
        return json({ success: false, error: "This user has already completed their temporary-password step." }, 409);
      }

      const { error: resetError } = await service.auth.admin.updateUserById(existing.id, {
        password: temporaryPassword,
        user_metadata: { full_name: fullName },
      });
      if (resetError) return json({ success: false, error: resetError.message }, 400);

      const emailResult = await sendSetupEmail({
        to: email,
        name: fullName,
        temporaryPassword,
        userId: existing.id,
        purchaseReference: reference,
      });
      return json({
        success: true,
        account_created: false,
        credentials_reset: true,
        email_sent: emailResult.success,
        email_error: emailResult.success ? null : emailResult.error,
        email,
      });
    }

    if (purchase.status !== "completed" || purchase.claimed_at || purchase.buyer_user_id) {
      return json({ success: false, error: "This Starter payment has already been claimed." }, 409);
    }

    const { data: created, error: createError } = await service.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName },
      app_metadata: {
        created_via: "assisted_signup",
        assisted_by_user_id: callerUser.id,
      },
    });
    if (createError || !created.user) {
      return json({ success: false, error: createError?.message || "Unable to create the new DRIGHT account." }, 400);
    }

    const newUser = created.user;
    let profileCreated = false;
    let purchaseClaimed = false;
    try {
      const { error: profileError } = await service.from("users").insert({
        id: newUser.id,
        email,
        full_name: fullName,
        role: "affiliate",
        is_admin: false,
        admin_status: "active",
        balance: 0,
        preferred_currency: "USD",
        username: usernameFor(email, newUser.id),
      });
      if (profileError) throw profileError;
      profileCreated = true;

      const { data: claim, error: claimError } = await service.rpc(
        "service_claim_dright_starter_purchase_for_assisted_user",
        {
          p_user_id: newUser.id,
          p_reference: reference,
          p_assisted_by: callerUser.id,
        },
      );
      if (claimError) throw claimError;
      purchaseClaimed = true;

      const referralCode = String((claim as Record<string, unknown> | null)?.referral_code || helper.referral_code || "");
      if (referralCode) {
        const { error: referralError } = await service.rpc("apply_signup_referral", {
          p_user_id: newUser.id,
          p_code: referralCode,
        });
        if (referralError) console.warn("[starter-assisted-signup] referral relationship warning", referralError.message);
      }

      const emailResult = await sendSetupEmail({
        to: email,
        name: fullName,
        temporaryPassword,
        userId: newUser.id,
        purchaseReference: reference,
      });

      await service.from("notifications").insert({
        user_id: callerUser.id,
        title: "Assisted signup created",
        message: `${fullName}'s DRIGHT account was created after verified Starter payment.`,
        notification_type: "system",
        category: "referral",
        priority: "normal",
        metadata: {
          event_module: "referral",
          event_type: "assisted_signup_created",
          assisted_user_id: newUser.id,
          purchase_reference: reference,
          email_suppressed: true,
        },
        is_read: false,
        is_archived: false,
        is_deleted: false,
      }).catch(() => undefined);

      return json({
        success: true,
        account_created: true,
        email_sent: emailResult.success,
        email_error: emailResult.success ? null : emailResult.error,
        user_id: newUser.id,
        email,
        full_name: fullName,
        purchase_reference: reference,
        trial_days: (claim as Record<string, unknown> | null)?.trial_days ?? purchase.included_trial_days,
      });
    } catch (error) {
      if (!purchaseClaimed) {
        if (profileCreated) await service.from("users").delete().eq("id", newUser.id).catch(() => undefined);
        await service.auth.admin.deleteUser(newUser.id).catch(() => undefined);
      }
      return json({
        success: false,
        error: error instanceof Error ? error.message : "Unable to finish assisted signup.",
      }, 500);
    }
  } catch (error) {
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Unexpected assisted-signup error",
    }, 500);
  }
});
