import { createClient } from "npm:@supabase/supabase-js@2.110.0";

// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT Google Gemini Proxy — Secure Edge Function
// Routes all Gemini API calls through this function. GEMINI_API_KEY is never
// exposed to the frontend. Handles the same feature set as ai-proxy.
// ─────────────────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const GEMINI_MODEL = "gemini-2.0-flash-lite";
const GEMINI_BASE = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const MAX_TOKENS = 2000;
const TIMEOUT_MS = 30000;
const MAX_PROMPT_LENGTH = 8000;
const MAX_RETRIES = 2;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// ─── Types ───────────────────────────────────────────────────────────────────

interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface AIRequest {
  feature: string;
  prompt: string;
  context?: string;
  messages?: AIMessage[];
  userId?: string;
  conversationId?: string;
}

// ─── System Prompts (same as ai-proxy) ───────────────────────────────────────

const SYSTEM_PROMPTS: Record<string, string> = {
  chat: `You are DRIGHT AI, a marketplace intelligence assistant for the DRIGHT digital marketplace. Help users with marketplace questions, buying, selling, affiliate programs, referrals, promotions, and withdrawals. Be concise, helpful, and accurate.`,
  search: `You are DRIGHT Smart Search. Return ONLY valid JSON. Format: {"keywords":["term1","term2"],"category":"category","intent":"user intent","ranked_terms":[{"term":"term","score":0.95}]}`,
  "product-description": `You are DRIGHT Product Description Generator. Generate compelling, SEO-optimized product descriptions. Include benefits, features, use cases. 150-300 words. Use markdown.`,
  rewrite: `You are DRIGHT Content Rewriter. Rewrite text to be more professional and engaging for the DRIGHT marketplace. Preserve meaning, improve clarity.`,
  summarize: `You are DRIGHT Content Summarizer. Summarize content in 2-4 sentences. Keep the same language.`,
  moderate: `You are DRIGHT Content Moderator. Analyze for spam, scams, abuse, adult content, illegal content. Return ONLY valid JSON: {"flagged":true/false,"categories":[],"severity":"low|medium|high","reasons":[],"recommendation":"approve|review|reject"}`,
  translate: `You are DRIGHT Translator. Translate text to the specified language. Return only the translation.`,
  recommend: `You are DRIGHT Product Recommender. Return ONLY valid JSON: {"recommendations":[{"title":"","reason":"","category":"","keywords":[]}],"summary":""}`,
  "generate-text": `You are DRIGHT AI Assistant. Generate helpful, professional content for the DRIGHT marketplace.`,
  test: `You are DRIGHT AI. Reply briefly to confirm the Gemini connection is working.`,
};

// ─── Sanitization ─────────────────────────────────────────────────────────────

function sanitize(input: string): string {
  return input
    .replace(/\0/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/ignore\s+(all\s+)?(previous|above|prior)\s+instructions?/gi, "")
    .replace(/disregard\s+(all\s+)?(previous|above)\s+/gi, "")
    .trim()
    .slice(0, MAX_PROMPT_LENGTH);
}

// ─── Gemini API Call ──────────────────────────────────────────────────────────

async function callGemini(
  systemInstruction: string,
  userPrompt: string,
  history: { role: "user" | "model"; parts: { text: string }[] }[] = [],
  temperature = 0.7,
): Promise<{ content: string; tokens: number }> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const body = {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [
          ...history,
          { role: "user", parts: [{ text: userPrompt }] },
        ],
        generationConfig: {
          maxOutputTokens: MAX_TOKENS,
          temperature,
          topP: 0.9,
        },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        ],
      };

      const res = await fetch(`${GEMINI_BASE}?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.status === 429) {
        const wait = parseInt(res.headers.get("retry-after") || "3", 10);
        if (attempt < MAX_RETRIES) { await new Promise((r) => setTimeout(r, wait * 1000)); continue; }
        throw new Error("Gemini rate limit exceeded. Please try again shortly.");
      }

      if (res.status >= 500) {
        if (attempt < MAX_RETRIES) { await new Promise((r) => setTimeout(r, 1000 * (attempt + 1))); continue; }
        throw new Error(`Gemini server error (${res.status})`);
      }

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini API error (${res.status}): ${errText}`);
      }

      const data = await res.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const tokens = data.usageMetadata?.totalTokenCount || 0;

      return { content, tokens };
    } catch (err) {
      lastError = err as Error;
      if (err instanceof DOMException && err.name === "AbortError") {
        if (attempt < MAX_RETRIES) continue;
        throw new Error("Gemini request timed out.");
      }
      if (attempt < MAX_RETRIES) { await new Promise((r) => setTimeout(r, 1000 * (attempt + 1))); continue; }
    }
  }

  throw lastError || new Error("Unknown error calling Gemini");
}

// ─── Usage Logging ────────────────────────────────────────────────────────────

async function logUsage(params: {
  userId: string; feature: string; prompt: string; response: string | null;
  tokens: number; latencyMs: number; success: boolean; errorMessage?: string;
}): Promise<void> {
  try {
    await supabase.from("ai_usage").insert({
      user_id: params.userId,
      feature: params.feature,
      prompt: params.prompt.slice(0, 5000),
      response: params.response?.slice(0, 5000) || null,
      tokens: params.tokens,
      model: GEMINI_MODEL,
      provider: "gemini",
      latency_ms: params.latencyMs,
      success: params.success,
      error_message: params.errorMessage || null,
    });
  } catch (err) {
    console.error("[gemini-proxy] Failed to log usage:", err);
  }
}

// ─── Rate Limiting ────────────────────────────────────────────────────────────

const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(userId, { count: 1, windowStart: now });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function getUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
  return user?.id || null;
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  // Health check
  if (req.method === "GET") {
    return new Response(
      JSON.stringify({
        success: !!GEMINI_API_KEY,
        provider: "Google Gemini",
        configured: !!GEMINI_API_KEY,
        model: GEMINI_MODEL,
        ...(!GEMINI_API_KEY && { error: "Missing GEMINI_API_KEY" }),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!GEMINI_API_KEY) {
    return new Response(
      JSON.stringify({ success: false, error: "Gemini API key not configured. Set GEMINI_API_KEY in edge function secrets." }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const body: AIRequest = await req.json();

    const validFeatures = ["chat", "search", "product-description", "rewrite", "summarize", "moderate", "translate", "recommend", "generate-text", "test"];
    if (!body.feature || !validFeatures.includes(body.feature)) {
      return new Response(JSON.stringify({ success: false, error: "Invalid or missing feature" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!body.prompt && !body.messages) {
      return new Response(JSON.stringify({ success: false, error: "Missing prompt or messages" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authUserId = await getUserId(req);
    const userId = body.userId || authUserId || "anonymous";

    if (body.feature !== "test" && userId !== "anonymous" && !checkRateLimit(userId)) {
      return new Response(JSON.stringify({ success: false, error: "Rate limit exceeded. Please wait a minute." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const startTime = Date.now();
    const systemPrompt = SYSTEM_PROMPTS[body.feature] || SYSTEM_PROMPTS["generate-text"];
    const sanitizedPrompt = sanitize(body.prompt || "");

    // Build Gemini history from messages
    const history: { role: "user" | "model"; parts: { text: string }[] }[] = [];
    if (body.messages?.length) {
      for (const m of body.messages.slice(-10)) {
        if (m.role === "user" || m.role === "assistant") {
          history.push({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: sanitize(m.content) }] });
        }
      }
    }

    const temperatureMap: Record<string, number> = {
      moderate: 0.1, search: 0.2, summarize: 0.3, translate: 0.3,
      recommend: 0.5, "product-description": 0.7, rewrite: 0.7, chat: 0.7, "generate-text": 0.7, test: 0.5,
    };

    const fullPrompt = body.context
      ? `Context: ${body.context}\n\nRequest: ${sanitizedPrompt}`
      : sanitizedPrompt;

    const { content, tokens } = await callGemini(systemPrompt, fullPrompt, history, temperatureMap[body.feature] ?? 0.7);
    const latencyMs = Date.now() - startTime;

    await logUsage({ userId, feature: body.feature, prompt: sanitizedPrompt, response: content, tokens, latencyMs, success: true });

    return new Response(
      JSON.stringify({ success: true, content, tokens, model: GEMINI_MODEL, provider: "gemini", latencyMs }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    console.error("[gemini-proxy]", errorMsg);
    return new Response(
      JSON.stringify({ success: false, error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
