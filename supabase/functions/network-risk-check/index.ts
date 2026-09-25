import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function firstIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return req.headers.get("cf-connecting-ip")?.trim()
    || req.headers.get("x-real-ip")?.trim()
    || forwarded
    || null;
}

function deviceType(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  if (/smart-tv|smarttv|hbbtv|appletv|googletv|roku/.test(ua)) return "tv";
  if (/windows|macintosh|linux|cros/.test(ua)) return "desktop";
  return "other";
}

function privateOrLoopback(ip: string): boolean {
  return ip === "::1"
    || ip === "127.0.0.1"
    || ip.startsWith("10.")
    || ip.startsWith("192.168.")
    || /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
    || ip.startsWith("fc")
    || ip.startsWith("fd");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const authorization = req.headers.get("Authorization") ?? "";

    if (!authorization) return json({ error: "Authentication required" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const token = authorization.replace(/^Bearer\s+/i, "");
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData.user) return json({ error: "Invalid session" }, 401);

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { data: policy, error: policyError } = await admin
      .from("network_fraud_policy")
      .select("enabled,vpn_prohibited,proxy_prohibited,tor_prohibited,datacenter_flag_enabled,auto_flag,auto_suspend,recheck_hours")
      .eq("singleton", true)
      .maybeSingle();

    if (policyError) throw policyError;
    if (!policy?.enabled) return json({ checked: false, reason: "disabled" });

    const ip = firstIp(req);
    if (!ip || privateOrLoopback(ip)) {
      return json({ checked: false, reason: "network_address_unavailable" });
    }

    const key = Deno.env.get("IPAPI_IS_KEY")?.trim() || "";
    const url = new URL("https://api.ipapi.is/");
    url.searchParams.set("q", ip);
    if (key) url.searchParams.set("key", key);

    let providerStatus = key ? "keyed" : "location_only_key_missing";
    let lookup: Record<string, any> = {};
    try {
      const response = await fetch(url, {
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(6000),
      });
      if (!response.ok) {
        providerStatus = `provider_http_${response.status}`;
      } else {
        lookup = await response.json();
      }
    } catch {
      providerStatus = "provider_unavailable";
    }

    const hasSecurity = key.length > 0 && providerStatus === "keyed";
    const isVpn = hasSecurity ? Boolean(lookup.is_vpn) : null;
    const isProxy = hasSecurity ? Boolean(lookup.is_proxy) : null;
    const isTor = hasSecurity ? Boolean(lookup.is_tor) : null;
    const isDatacenter = hasSecurity ? Boolean(lookup.is_datacenter) : null;
    const isAbuser = hasSecurity ? Boolean(lookup.is_abuser) : null;

    const reasons: string[] = [];
    if (isVpn && policy.vpn_prohibited) reasons.push("vpn");
    if (isProxy && policy.proxy_prohibited) reasons.push("proxy");
    if (isTor && policy.tor_prohibited) reasons.push("tor");
    if (isDatacenter && policy.datacenter_flag_enabled) reasons.push("datacenter");
    if (isAbuser) reasons.push("abuse_history");
    const riskDetected = reasons.length > 0;

    const location = lookup.location && typeof lookup.location === "object" ? lookup.location : lookup;
    const row = {
      user_id: userData.user.id,
      ip_address: ip,
      country_code: location?.country_code ? String(location.country_code) : null,
      country: location?.country ? String(location.country) : null,
      region: location?.state ? String(location.state) : (location?.region ? String(location.region) : null),
      city: location?.city ? String(location.city) : null,
      device_type: deviceType(req.headers.get("user-agent") || ""),
      is_vpn: isVpn,
      is_proxy: isProxy,
      is_tor: isTor,
      is_datacenter: isDatacenter,
      is_abuser: isAbuser,
      risk_detected: riskDetected,
      risk_reasons: reasons,
      provider: "ipapi.is",
      provider_status: providerStatus,
      last_seen_at: new Date().toISOString(),
      raw_response: hasSecurity
        ? {
            is_vpn: lookup.is_vpn ?? null,
            is_proxy: lookup.is_proxy ?? null,
            is_tor: lookup.is_tor ?? null,
            is_datacenter: lookup.is_datacenter ?? null,
            is_abuser: lookup.is_abuser ?? null,
            location: lookup.location ?? null,
          }
        : {
            country: lookup.country ?? null,
            region: lookup.region ?? null,
            city: lookup.city ?? null,
            docs: lookup.docs ?? null,
          },
    };

    const { error: upsertError } = await admin
      .from("user_network_risk_signals")
      .upsert(row, { onConflict: "user_id,ip_address" });
    if (upsertError) throw upsertError;

    return json({
      checked: true,
      provider_status: providerStatus,
      risk_detected: riskDetected,
      reasons,
      security_detection_active: hasSecurity,
      recheck_hours: Number(policy.recheck_hours || 12),
      automatic_suspension: false,
    });
  } catch (error) {
    console.error("network-risk-check failed", error);
    return json({ error: error instanceof Error ? error.message : "Network risk check failed" }, 500);
  }
});
