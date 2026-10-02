import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function callerClient(req: Request) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } },
  );
}

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

async function sendSetupEmail(input: {
  to: string;
  name: string;
  temporaryPassword: string;
  userId: string;
  purchaseReference?: string | null;
}) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { success: false, error: "RESEND_API_KEY is not configured" };

  const appUrl = (Deno.env.get("APP_URL") || "https://dright.store").replace(/\/$/, "");
  const signInUrl = `${appUrl}/sign-in`;
  const safeName = escapeHtml(input.name || "there");
  const safeEmail = escapeHtml(input.to);
  const safePassword = escapeHtml(input.temporaryPassword);
  const safeSignIn = escapeHtml(signInUrl);

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#111827">
    <div style="max-width:620px;margin:0 auto;padding:28px 16px">
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:20px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,.06)">
        <div style="padding:26px 28px;background:linear-gradient(135deg,#0f172a,#1d4ed8);color:white">
          <div style="font-size:13px;letter-spacing:.14em;text-transform:uppercase;opacity:.8">DRIGHT</div>
          <h1 style="font-size:25px;line-height:1.25;margin:8px 0 0">Your DRIGHT account is ready</h1>
        </div>
        <div style="padding:28px">
          <p style="margin:0 0 16px">Hello <strong>${safeName}</strong>,</p>
          <p style="line-height:1.65;margin:0 0 20px">A DRIGHT Starter payment was completed for you and your account has been created. Use the temporary credentials below for your first sign-in.</p>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:18px;margin:20px 0">
            <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.08em">Email</div>
            <div style="font-size:16px;font-weight:700;margin-top:5px;word-break:break-all">${safeEmail}</div>
            <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin-top:16px">Temporary password</div>
            <div style="font-size:20px;font-weight:800;margin-top:5px;word-break:break-all">${safePassword}</div>
          </div>
          <a href="${safeSignIn}" style="display:block;text-align:center;background:#2563eb;color:white;text-decoration:none;padding:14px 18px;border-radius:12px;font-weight:800">Sign in to DRIGHT</a>
          <div style="margin-top:22px;padding:15px;border-radius:12px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;font-size:13px;line-height:1.55">
            For your security, DRIGHT will require you to create a new private password immediately after signing in. You will then be prompted to complete your KYC identity verification.
          </div>
          <p style="font-size:12px;color:#64748b;line-height:1.55;margin:22px 0 0">Do not forward this email or share the temporary password. If you were not expecting this account, contact support@dright.store.</p>
        </div>
      </div>
    </div>
  </body>
</html>`;

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
        subject: "Your DRIGHT account is ready — temporary sign-in details",
        html,
      }),
    });

    const responseText = await response.text();
    let providerId: string | null = null;
    try {
      const parsed = JSON.parse(responseText);
      providerId = parsed?.id || parsed?.message_id || null;
    } catch {
      // Provider response may be plain text on failure.
    }

    const service = serviceClient();
    await service.from("email_logs").insert({
      user_id: input.userId,
      recipient_email: input.to,
      template_type: "client_account_created",
      subject: "Your DRIGHT account is ready — temporary sign-in details",
      status: response.ok ? "sent" : "failed",
      provider: "resend",
      message_id: providerId,
      error_message: response.ok ? null : responseText.slice(0, 300),
      metadata: {
        source: "admin_client_onboarding",
        purchase_reference: input.purchaseReference || null,
        temporary_password_logged: false,
      },
    });

    if (!response.ok) {
      return { success: false, error: `Resend error (${response.status})` };
    }
    return { success: true, messageId: providerId };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unable to send setup email" };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    const caller = callerClient(req);
    const service = serviceClient();
    const { data: authData, error: authError } = await caller.auth.getUser();
    const callerUser = authData?.user;
    if (authError || !callerUser?.id) return json({ success: false, error: "Authentication required" }, 401);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "create_account");

    if (action === "change_password") {
      const newPassword = String(body?.new_password || "");
      if (!validPassword(newPassword)) {
        return json({
          success: false,
          error: "Use 8–128 characters and at least three of: uppercase, lowercase, number, symbol.",
        }, 400);
      }

      const { data: onboarding, error: onboardingError } = await service
        .from("dright_client_onboarding")
        .select("user_id,must_change_password")
        .eq("user_id", callerUser.id)
        .maybeSingle();

      if (onboardingError || !onboarding) {
        return json({ success: false, error: "This account does not have a client onboarding requirement." }, 404);
      }

      if (onboarding.must_change_password === false) {
        return json({ success: true, password_changed: true, idempotent: true });
      }

      const { error: passwordError } = await service.auth.admin.updateUserById(callerUser.id, {
        password: newPassword,
      });
      if (passwordError) return json({ success: false, error: passwordError.message }, 400);

      const { error: markError } = await service.rpc("service_mark_dright_client_password_changed", {
        p_user_id: callerUser.id,
      });
      if (markError) return json({ success: false, error: markError.message }, 500);

      return json({ success: true, password_changed: true });
    }

    if (action !== "create_account") {
      return json({ success: false, error: "Unsupported action" }, 400);
    }

    const { data: canManage, error: permissionError } = await caller.rpc("has_dright_permission", {
      p_module: "subscriptions",
      p_action: "manage",
    });
    if (permissionError || canManage !== true) {
      return json({ success: false, error: "Starter subscription management permission required" }, 403);
    }

    const fullName = String(body?.full_name || "").trim().replace(/\s+/g, " ");
    const email = normalizeEmail(body?.email);
    const temporaryPassword = String(body?.temporary_password || "");

    if (fullName.length < 2 || fullName.length > 120) {
      return json({ success: false, error: "Enter the client's full name." }, 400);
    }
    if (!validEmail(email)) return json({ success: false, error: "Enter a valid client email address." }, 400);
    if (!validPassword(temporaryPassword)) {
      return json({
        success: false,
        error: "Temporary password must be 8–128 characters and use at least three of: uppercase, lowercase, number, symbol.",
      }, 400);
    }

    const { data: purchase, error: purchaseError } = await service
      .from("dright_starter_purchases")
      .select("id,payment_reference,included_trial_days,paid_at")
      .eq("buyer_email", email)
      .eq("payment_status", "success")
      .eq("status", "completed")
      .is("buyer_user_id", null)
      .is("claimed_at", null)
      .not("processed_at", "is", null)
      .not("paid_at", "is", null)
      .order("paid_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (purchaseError) return json({ success: false, error: "Unable to verify the Starter purchase." }, 500);

    const { data: existingProfiles, error: existingProfileError } = await service
      .from("users")
      .select("id,email,full_name")
      .eq("email", email)
      .limit(2);

    if (existingProfileError) return json({ success: false, error: "Unable to check the client account." }, 500);

    if (existingProfiles && existingProfiles.length > 0) {
      if (existingProfiles.length > 1) {
        return json({ success: false, error: "Multiple profiles use this email. Resolve the account data before continuing." }, 409);
      }

      const existing = existingProfiles[0];
      const { data: existingOnboarding } = await service
        .from("dright_client_onboarding")
        .select("user_id,starter_purchase_id")
        .eq("user_id", existing.id)
        .maybeSingle();
      const { data: existingAuth } = await service.auth.admin.getUserById(existing.id);
      const createdVia = existingAuth?.user?.app_metadata?.created_via;

      if (!existingOnboarding || createdVia !== "admin_client_onboarding") {
        return json({ success: false, error: "An account already exists for this email. Sign-in or password recovery must be used instead." }, 409);
      }

      const { error: resetError } = await service.auth.admin.updateUserById(existing.id, {
        password: temporaryPassword,
        user_metadata: { ...(existingAuth.user?.user_metadata || {}), full_name: fullName },
      });
      if (resetError) return json({ success: false, error: resetError.message }, 400);

      await service.from("users").update({ full_name: fullName }).eq("id", existing.id);
      await service.from("dright_client_onboarding").update({
        must_change_password: true,
        password_changed_at: null,
      }).eq("user_id", existing.id);

      const emailResult = await sendSetupEmail({
        to: email,
        name: fullName,
        temporaryPassword,
        userId: existing.id,
        purchaseReference: null,
      });

      return json({
        success: true,
        account_created: false,
        credentials_reset: true,
        email_sent: emailResult.success,
        email_error: emailResult.success ? null : emailResult.error,
        user_id: existing.id,
      });
    }

    if (!purchase) {
      return json({
        success: false,
        error: "No verified, unclaimed DRIGHT Starter payment was found for this exact client email. Complete the Starter payment with this email first.",
      }, 409);
    }

    const { data: created, error: createError } = await service.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName },
      app_metadata: { created_via: "admin_client_onboarding" },
    });

    if (createError || !created.user) {
      return json({ success: false, error: createError?.message || "Unable to create the client auth account." }, 400);
    }

    const newUser = created.user;
    let profileCreated = false;
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
        "service_claim_dright_starter_purchase_for_client",
        {
          p_user_id: newUser.id,
          p_email: email,
          p_created_by: callerUser.id,
        },
      );
      if (claimError) throw claimError;

      const claimPayload = (claim || {}) as Record<string, unknown>;
      const emailResult = await sendSetupEmail({
        to: email,
        name: fullName,
        temporaryPassword,
        userId: newUser.id,
        purchaseReference: String(claimPayload.payment_reference || purchase.payment_reference || ""),
      });

      return json({
        success: true,
        account_created: true,
        credentials_reset: false,
        email_sent: emailResult.success,
        email_error: emailResult.success ? null : emailResult.error,
        user_id: newUser.id,
        purchase_reference: claimPayload.payment_reference || purchase.payment_reference,
        trial_days: claimPayload.trial_days ?? purchase.included_trial_days,
        trial_ends_at: claimPayload.trial_ends_at ?? null,
      });
    } catch (error) {
      if (!profileCreated) {
        await service.auth.admin.deleteUser(newUser.id).catch(() => undefined);
      } else {
        const { data: onboarding } = await service
          .from("dright_client_onboarding")
          .select("user_id")
          .eq("user_id", newUser.id)
          .maybeSingle();
        if (!onboarding) {
          await service.auth.admin.deleteUser(newUser.id).catch(() => undefined);
        }
      }
      return json({
        success: false,
        error: error instanceof Error ? error.message : "Unable to finish client onboarding.",
      }, 500);
    }
  } catch (error) {
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Unexpected server error",
    }, 500);
  }
});
