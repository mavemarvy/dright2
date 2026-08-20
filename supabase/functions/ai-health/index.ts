import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT AI Health & Monitoring Endpoint
// GET /functions/v1/ai-health
//
// Returns provider configuration status AND real usage metrics from ai_usage.
// SECURITY: Requires authenticated admin — never exposes secret values.
// ─────────────────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SECRETS = {
  groq: Deno.env.get("GROQ_API_KEY") || "",
  gemini: Deno.env.get("GEMINI_API_KEY") || "",
  openai: Deno.env.get("OPENAI_API_KEY") || "",
};

const ADMIN_ROLES = ["super_admin", "ai_admin", "system_admin", "marketplace_admin", "moderator"];

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
);

async function isAdmin(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false;

  const token = authHeader.replace("Bearer ", "");
  try {
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return false;

    const { data: profile } = await supabase
      .from("users")
      .select("is_admin, admin_status, role")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile) return false;
    if (profile.is_admin === true && profile.admin_status === "active") return true;
    return ADMIN_ROLES.includes(profile.role);
  } catch {
    return false;
  }
}

// ─── Metric Queries ──────────────────────────────────────────────────────────

interface ProviderMetrics {
  requests: number;
  tokens: number;
  avgLatencyMs: number;
  errors: number;
  fallbackUsed: number;
  estimatedCost: number;
}

async function getProviderMetrics(provider: string, days: number): Promise<ProviderMetrics> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: stats } = await supabase
    .from("ai_usage")
    .select("tokens, latency_ms, success, estimated_cost, provider")
    .eq("provider", provider)
    .gte("created_at", since);

  const rows = stats || [];
  const total = rows.length;
  const errors = rows.filter((r: any) => r.success === false).length;
  const tokens = rows.reduce((s: number, r: any) => s + (r.tokens || 0), 0);
  const latencySum = rows.reduce((s: number, r: any) => s + (r.latency_ms || 0), 0);
  const cost = rows.reduce((s: number, r: any) => s + Number(r.estimated_cost || 0), 0);

  return {
    requests: total,
    tokens,
    avgLatencyMs: total > 0 ? Math.round(latencySum / total) : 0,
    errors,
    fallbackUsed: 0,
    estimatedCost: cost,
  };
}

async function getGlobalMetrics(days: number) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: allRows } = await supabase
    .from("ai_usage")
    .select("tokens, latency_ms, success, estimated_cost, provider, feature, created_at")
    .gte("created_at", since);

  const rows = (allRows || []) as any[];
  const total = rows.length;
  const errors = rows.filter((r) => r.success === false).length;
  const tokens = rows.reduce((s, r) => s + (r.tokens || 0), 0);
  const latencySum = rows.reduce((s, r) => s + (r.latency_ms || 0), 0);
  const cost = rows.reduce((s, r) => s + Number(r.estimated_cost || 0), 0);

  // Daily requests for trend chart
  const dailyMap = new Map<string, number>();
  for (const r of rows) {
    const day = new Date(r.created_at).toISOString().split("T")[0];
    dailyMap.set(day, (dailyMap.get(day) || 0) + 1);
  }
  const dailyRequests = Array.from(dailyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-30)
    .map(([date, count]) => ({ date, count }));

  // Feature breakdown
  const featureMap = new Map<string, { requests: number; tokens: number }>();
  for (const r of rows) {
    const f = r.feature || "unknown";
    const existing = featureMap.get(f) || { requests: 0, tokens: 0 };
    existing.requests++;
    existing.tokens += r.tokens || 0;
    featureMap.set(f, existing);
  }
  const byFeature = Array.from(featureMap.entries())
    .map(([feature, stats]) => ({ feature, ...stats }))
    .sort((a, b) => b.requests - a.requests);

  // Model breakdown
  const modelMap = new Map<string, number>();
  for (const r of rows) {
    const m = r.provider || "unknown";
    modelMap.set(m, (modelMap.get(m) || 0) + 1);
  }

  // Active users
  const userSet = new Set<string>();
  for (const r of rows) {
    if (r.provider && r.success !== false) userSet.add(r.provider);
  }

  return {
    totalRequests: total,
    totalTokens: tokens,
    avgLatencyMs: total > 0 ? Math.round(latencySum / total) : 0,
    errorRate: total > 0 ? (errors / total) * 100 : 0,
    estimatedCost: cost,
    dailyRequests,
    byFeature,
    activeUsers: userSet.size,
    errorCount: errors,
  };
}

// ─── Main Handler ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (!(await isAdmin(req))) {
    return new Response(
      JSON.stringify({ success: false, error: "Unauthorized — admin access required" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const daysParam = new URL(req.url).searchParams.get("days");
  const days = daysParam ? Math.min(90, Math.max(1, parseInt(daysParam, 10) || 7)) : 7;

  try {
    const [groqMetrics, geminiMetrics, openaiMetrics, globalMetrics] = await Promise.all([
      getProviderMetrics("groq", days),
      getProviderMetrics("gemini", days),
      getProviderMetrics("openai", days),
      getGlobalMetrics(days),
    ]);

    const providers = {
      groq: {
        provider: "Groq",
        configured: !!SECRETS.groq,
        model: "llama-3.3-70b-versatile",
        ...groqMetrics,
        ...(groqMetrics.errors > 0 && { errorRate: (groqMetrics.errors / groqMetrics.requests) * 100 }),
      },
      gemini: {
        provider: "Google Gemini",
        configured: !!SECRETS.gemini,
        model: "gemini-2.0-flash-lite",
        ...geminiMetrics,
        ...(geminiMetrics.errors > 0 && { errorRate: (geminiMetrics.errors / geminiMetrics.requests) * 100 }),
      },
      openai: {
        provider: "OpenAI",
        configured: !!SECRETS.openai,
        model: "gpt-4o-mini",
        ...openaiMetrics,
        ...(openaiMetrics.errors > 0 && { errorRate: (openaiMetrics.errors / openaiMetrics.requests) * 100 }),
      },
    };

    const response = {
      success: Object.values(SECRETS).some(Boolean),
      primary: "groq",
      fallbackChain: ["groq", "gemini", "openai"],
      anyAvailable: Object.values(SECRETS).some(Boolean),
      any_available: Object.values(SECRETS).some(Boolean),
      providers,
      metrics: globalMetrics,
      period: `${days} days`,
      ...(!Object.values(SECRETS).some(Boolean) && {
        error: "No AI providers configured. Set GROQ_API_KEY, GEMINI_API_KEY, and/or OPENAI_API_KEY in edge function secrets.",
      }),
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[ai-health] error:", err);
    return new Response(
      JSON.stringify({ success: false, error: "Failed to retrieve AI health metrics" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
