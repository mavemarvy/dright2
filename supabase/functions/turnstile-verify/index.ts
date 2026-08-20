import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX_FAILURES = 5;

/**
 * Creates a Supabase client with the service role key so RLS does not block
 * server-side verification-log inserts/selects. The user's Authorization
 * header is NOT forwarded — this function is a trusted server-side verifier,
 * not a user-scoped data accessor.
 */
function getSupabaseClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    throw new Error("Server misconfiguration: missing Supabase credentials");
  }
  return createClient(url, serviceKey);
}

/** Read the Turnstile secret, checking both canonical and legacy names. */
function getTurnstileSecret(): string | null {
  return Deno.env.get("TURNSTILE_SECRET") || Deno.env.get("TURNSTILE_SECRET_KEY") || null;
}

/** Extract client IP from common proxy headers. */
function getClientIp(req: Request, bodyIp?: string): string {
  if (bodyIp) return bodyIp;
  const cfIp = req.headers.get("CF-Connecting-IP");
  if (cfIp) return cfIp.trim();
  const xff = req.headers.get("X-Forwarded-For");
  if (xff) return xff.split(",")[0]!.trim();
  return "unknown";
}

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function checkRateLimit(
  supabase: ReturnType<typeof getSupabaseClient>,
  ipAddress: string,
  action: string,
): Promise<{ allowed: boolean; remaining: number }> {
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count, error } = await supabase
    .from("turnstile_verifications")
    .select("*", { count: "exact", head: true })
    .eq("ip_address", ipAddress)
    .eq("action", action)
    .eq("success", false)
    .gte("verified_at", since);

  if (error) {
    console.warn("[turnstile-verify] rate-limit query failed:", error.message);
    return { allowed: true, remaining: RATE_LIMIT_MAX_FAILURES };
  }

  const failures = count || 0;
  return {
    allowed: failures < RATE_LIMIT_MAX_FAILURES,
    remaining: Math.max(0, RATE_LIMIT_MAX_FAILURES - failures),
  };
}

async function logVerification(
  supabase: ReturnType<typeof getSupabaseClient>,
  params: {
    userId?: string;
    ip: string;
    action: string;
    tokenHash: string;
    success: boolean;
    errorCodes?: string[];
  },
): Promise<void> {
  const { error } = await supabase.from("turnstile_verifications").insert({
    user_id: params.userId || null,
    ip_address: params.ip,
    action: params.action,
    token_hash: params.tokenHash,
    success: params.success,
    error_codes: params.errorCodes || null,
  });
  if (error) {
    console.warn("[turnstile-verify] failed to log verification:", error.message);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const supabase = getSupabaseClient();

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
    }

    const token = typeof body.token === "string" ? body.token : null;
    const action = typeof body.action === "string" ? body.action : "generic";
    const userId = typeof body.userId === "string" ? body.userId : undefined;
    const bodyIp = typeof body.ipAddress === "string" ? body.ipAddress : undefined;

    if (!token) {
      return jsonResponse({ success: false, error: "Missing Turnstile token" }, 400);
    }

    const secretKey = getTurnstileSecret();
    if (!secretKey) {
      console.error("[turnstile-verify] TURNSTILE_SECRET not set in edge function secrets");
      return jsonResponse(
        { success: false, error: "Server misconfiguration: CAPTCHA secret not set" },
        500,
      );
    }

    const ip = getClientIp(req, bodyIp);

    const rateCheck = await checkRateLimit(supabase, ip, action);
    if (!rateCheck.allowed) {
      await logVerification(supabase, {
        userId,
        ip,
        action,
        tokenHash: token.slice(0, 16),
        success: false,
        errorCodes: ["rate_limited"],
      });
      return jsonResponse(
        {
          success: false,
          error: "Too many failed attempts. Please try again later.",
          remaining: 0,
        },
        429,
      );
    }

    const formData = new URLSearchParams();
    formData.append("secret", secretKey);
    formData.append("response", token);
    formData.append("remoteip", ip);

    let verifyData: { success?: boolean; "error-codes"?: string[] };
    try {
      const verifyRes = await fetch(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: formData,
        },
      );

      if (!verifyRes.ok) {
        console.error(`[turnstile-verify] siteverify HTTP ${verifyRes.status}`);
        return jsonResponse(
          { success: false, error: "CAPTCHA service unavailable. Please try again." },
          503,
        );
      }

      verifyData = await verifyRes.json();
    } catch (fetchErr) {
      console.error("[turnstile-verify] siteverify fetch failed:", fetchErr);
      return jsonResponse(
        { success: false, error: "CAPTCHA service unreachable. Please try again." },
        503,
      );
    }

    const isSuccess = verifyData.success === true;
    const errorCodes = Array.isArray(verifyData["error-codes"])
      ? verifyData["error-codes"].filter((c): c is string => typeof c === "string")
      : [];

    await logVerification(supabase, {
      userId,
      ip,
      action,
      tokenHash: token.slice(0, 16),
      success: isSuccess,
      errorCodes,
    });

    if (!isSuccess) {
      return jsonResponse(
        {
          success: false,
          error: "CAPTCHA verification failed. Please try again.",
          remaining: rateCheck.remaining - 1,
        },
        403,
      );
    }

    return jsonResponse({ success: true, action }, 200);
  } catch (err) {
    console.error("[turnstile-verify] unhandled error:", err);
    return jsonResponse(
      {
        success: false,
        error: "An unexpected error occurred during CAPTCHA verification.",
      },
      500,
    );
  }
});
