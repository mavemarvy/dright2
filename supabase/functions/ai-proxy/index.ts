import { createClient } from "npm:@supabase/supabase-js@2.110.0";

// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT AI Gateway — Central Edge Function
//
// Single entry point for all text-based AI requests. Implements:
//   • Provider priority: Groq → Gemini → OpenAI (automatic failover)
//   • Centralized configuration (models, timeouts, retries)
//   • AI request logging (provider, model, tokens, cost, latency, fallback)
//   • Rate limiting (per user + per IP, configurable for admins)
//   • Response cache (content-hash keyed, TTL-based)
//   • Streaming support (SSE for chat feature)
//   • Standardized error responses (no provider details leaked)
//
// SECURITY: All API keys (GROQ_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY) are
// read exclusively via Deno.env.get(). They are never exposed to the browser.
// ─────────────────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ─── Central AI Configuration ────────────────────────────────────────────────

const AI_CONFIG = {
  providers: {
    groq: {
      model: "llama-3.3-70b-versatile",
      maxTokens: 2000,
      costPerToken: 0.00000059,
      timeoutMs: 30000,
    },
    gemini: {
      model: "gemini-2.0-flash-lite",
      maxTokens: 2000,
      costPerToken: 0.000000075,
      timeoutMs: 30000,
    },
    openai: {
      model: "gpt-4o-mini",
      maxTokens: 2000,
      costPerToken: 0.0000015,
      timeoutMs: 30000,
    },
  },
  providerPriority: ["groq", "gemini", "openai"] as const,
  maxRetries: 2,
  maxPromptLength: 8000,
  rateLimit: {
    windowMs: 60_000,
    maxRequests: { user: 20, guest: 5, admin: 60 },
  },
  cache: {
    enabled: true,
    ttlMs: 5 * 60 * 1000,
    maxSize: 200,
  },
} as const;

// ─── Secrets ──────────────────────────────────────────────────────────────────

const SECRETS = {
  groq: Deno.env.get("GROQ_API_KEY") || "",
  gemini: Deno.env.get("GEMINI_API_KEY") || "",
  openai: Deno.env.get("OPENAI_API_KEY") || "",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

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
  locale?: string;
  stream?: boolean;
}

interface AIResult {
  success: boolean;
  content: string;
  tokens: number;
  model: string;
  provider: string;
  latencyMs: number;
  error?: string;
  fallbackUsed?: boolean;
  cached?: boolean;
}

// ─── Sanitization & Validation ───────────────────────────────────────────────

function sanitizePrompt(input: string): string {
  return input
    .replace(/\0/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim()
    .slice(0, AI_CONFIG.maxPromptLength);
}

function antiInject(prompt: string): string {
  return prompt
    .replace(/ignore\s+(all\s+)?(previous|above|prior)\s+instructions?/gi, "")
    .replace(/disregard\s+(all\s+)?(previous|above)\s+/gi, "")
    .replace(/you\s+are\s+now\s+(a|an)\s+/gi, "")
    .replace(/system\s*:\s*/gi, "")
    .replace(/<\/?system>/gi, "")
    .trim();
}

const VALID_FEATURES = [
  "chat", "search", "product-description", "rewrite", "summarize",
  "moderate", "translate", "recommend", "generate-text", "test",
  "product-qa", "faq", "marketplace-assistant",
];

const SYSTEM_PROMPTS: Record<string, string> = {
  chat: `You are DRIGHT AI, a marketplace intelligence assistant for the DRIGHT digital marketplace platform. You help users with marketplace questions, payments, withdrawals, affiliate programs, referrals, subscriptions, promotions, buying, selling, and admin tasks. Be concise, helpful, and specific. Never promise specific earnings. Base recommendations on marketplace best practices. If you don't know something, say so. Respond in the user's language when possible.`,
  search: `You are DRIGHT Smart Search. The user gives a natural-language query. You must return a JSON array of search terms and keywords that match the user's intent. Return ONLY valid JSON, no markdown. Format: {"keywords":["term1","term2"],"category":"suggested category","intent":"what the user wants","ranked_terms":[{"term":"term","score":0.95}]}`,
  "product-description": `You are DRIGHT Product Description Generator. Generate compelling, SEO-optimized product descriptions for a digital marketplace. Include key benefits, features, and use cases. Write in a professional but engaging tone. 150-300 words. Use markdown formatting with headings and bullet points.`,
  rewrite: `You are DRIGHT Content Rewriter. Rewrite the given text to be more professional, engaging, and optimized for the DRIGHT marketplace. Preserve the original meaning while improving clarity, tone, and readability. Keep the same language as the input.`,
  summarize: `You are DRIGHT Content Summarizer. Provide a concise summary of the given content. Capture key points in 2-4 sentences. Keep the same language as the input.`,
  moderate: `You are DRIGHT Content Moderator. Analyze the given content for: spam, scams, abuse, adult content, illegal content, and fake listings. Return ONLY valid JSON. Format: {"flagged":true/false,"categories":["spam","scam"],"severity":"low|medium|high","reasons":["explanation"],"recommendation":"approve|review|reject"}`,
  translate: `You are DRIGHT Translator. Translate the given text into the specified target language. Maintain formatting and preserve meaning. Return only the translated text.`,
  recommend: `You are DRIGHT Product Recommender. Based on the user's query and context, recommend relevant products or services. Return ONLY valid JSON. Format: {"recommendations":[{"title":"suggested title","reason":"why","category":"category","keywords":["k1","k2"]}],"summary":"brief summary"}`,
  "generate-text": `You are DRIGHT AI Assistant. Generate helpful content based on the user's request. Be professional, concise, and relevant to the DRIGHT marketplace context.`,
  test: `You are DRIGHT AI. Respond briefly and friendly to confirm the connection is working.`,
  "product-qa": `You are DRIGHT AI Product Assistant. Answer questions about a specific product using the provided product context (description, specifications, FAQs, reviews, previous Q&A). If the answer is not in the provided context, say "I don't have that information. You can contact the seller directly." Never hallucinate or make up information. Be concise and helpful.`,
  faq: `You are DRIGHT FAQ Assistant. Answer user questions about the DRIGHT marketplace platform. Cover topics: buying, selling, payments, withdrawals, affiliate program, referrals, promotions, subscriptions, product uploads, store setup, and account management. Be concise and helpful. If you don't know, say so.`,
  "marketplace-assistant": `You are DRIGHT Marketplace Assistant. You help buyers, sellers, affiliates, and admins with marketplace tasks. Explain products, recommend products, compare listings, explain commissions, help with product uploads, optimize titles, generate descriptions, generate SEO keywords, generate hashtags, generate ad copy, and answer marketplace questions. Use the provided user context for personalized responses. Be concise and helpful.`,
};

const TEMPERATURE_MAP: Record<string, number> = {
  moderate: 0.1, search: 0.2, summarize: 0.3, translate: 0.3,
  recommend: 0.5, "product-description": 0.7, rewrite: 0.7, chat: 0.7,
  "generate-text": 0.7, test: 0.5, "product-qa": 0.2, faq: 0.3,
  "marketplace-assistant": 0.5,
};

// ─── Standardized Error Messages ─────────────────────────────────────────────
// Never leak provider-specific error details to the client.

function standardizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("timed out") || msg.includes("AbortError")) {
    return "The AI service is taking too long to respond. Please try again.";
  }
  if (msg.includes("429") || msg.includes("rate limit")) {
    return "The AI service is busy. Please try again in a moment.";
  }
  if (msg.includes("No AI providers configured") || msg.includes("not configured")) {
    return "AI service is not available. Please contact support.";
  }
  if (msg.includes("503") || msg.includes("502") || msg.includes("500")) {
    return "The AI service is temporarily unavailable. Please try again.";
  }
  console.error("[ai-proxy] internal error detail:", msg);
  return "An unexpected error occurred. Please try again.";
}

// ─── Response Cache ──────────────────────────────────────────────────────────

interface CacheEntry {
  content: string;
  tokens: number;
  model: string;
  provider: string;
  insertedAt: number;
}

const responseCache = new Map<string, CacheEntry>();

function hashKey(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

function getCacheKey(body: AIRequest): string | null {
  if (!AI_CONFIG.cache.enabled) return null;
  if (body.feature === "chat" || body.feature === "test") return null;
  const promptPart = body.messages
    ? body.messages.map((m) => `${m.role}:${m.content}`).join("|")
    : body.prompt;
  return hashKey(`${body.feature}|${body.context || ""}|${promptPart}`);
}

function getFromCache(key: string): CacheEntry | null {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.insertedAt > AI_CONFIG.cache.ttlMs) {
    responseCache.delete(key);
    return null;
  }
  return entry;
}

function setCache(key: string, entry: CacheEntry): void {
  if (responseCache.size >= AI_CONFIG.cache.maxSize) {
    const oldest = responseCache.keys().next().value;
    if (oldest) responseCache.delete(oldest);
  }
  responseCache.set(key, entry);
}

// ─── Rate Limiting ───────────────────────────────────────────────────────────

const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(identifier: string, tier: "user" | "guest" | "admin"): boolean {
  const now = Date.now();
  const max = AI_CONFIG.rateLimit.maxRequests[tier];
  const entry = rateLimitMap.get(identifier);
  if (!entry || now - entry.windowStart > AI_CONFIG.rateLimit.windowMs) {
    rateLimitMap.set(identifier, { count: 1, windowStart: now });
    return true;
  }
  entry.count++;
  return entry.count <= max;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now - entry.windowStart > AI_CONFIG.rateLimit.windowMs * 2) {
      rateLimitMap.delete(key);
    }
  }
}, 120_000);

// ─── Provider Callers ────────────────────────────────────────────────────────

async function callGroq(
  messages: AIMessage[],
  temperature: number,
): Promise<{ content: string; tokens: number; model: string }> {
  const cfg = AI_CONFIG.providers.groq;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= AI_CONFIG.maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), cfg.timeoutMs);

      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SECRETS.groq}`,
        },
        body: JSON.stringify({
          model: cfg.model,
          messages,
          max_tokens: cfg.maxTokens,
          temperature,
          top_p: 0.9,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.status === 429) {
        if (attempt < AI_CONFIG.maxRetries) {
          const wait = parseInt(res.headers.get("retry-after") || "2", 10);
          await new Promise((r) => setTimeout(r, wait * 1000));
          continue;
        }
        throw new Error("groq_rate_limited");
      }

      if (res.status >= 500) {
        if (attempt < AI_CONFIG.maxRetries) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        throw new Error(`groq_server_error_${res.status}`);
      }

      if (!res.ok) throw new Error(`groq_client_error_${res.status}`);

      const data = await res.json();
      return {
        content: data.choices?.[0]?.message?.content || "",
        tokens: data.usage?.total_tokens || 0,
        model: cfg.model,
      };
    } catch (err) {
      lastError = err as Error;
      if (err instanceof DOMException && err.name === "AbortError") {
        if (attempt < AI_CONFIG.maxRetries) continue;
        throw new Error("groq_timeout");
      }
      if (attempt < AI_CONFIG.maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
    }
  }
  throw lastError || new Error("groq_unknown_error");
}

async function callGemini(
  systemPrompt: string,
  userPrompt: string,
  groqMessages: AIMessage[],
  temperature: number,
): Promise<{ content: string; tokens: number; model: string }> {
  const cfg = AI_CONFIG.providers.gemini;
  const history = groqMessages
    .filter((m) => m.role !== "system")
    .slice(-10)
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));

  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [
      ...history.slice(0, -1),
      { role: "user", parts: [{ text: userPrompt }] },
    ],
    generationConfig: { maxOutputTokens: cfg.maxTokens, temperature, topP: 0.9 },
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= AI_CONFIG.maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), cfg.timeoutMs);

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${SECRETS.gemini}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      );

      clearTimeout(timeoutId);

      if (res.status === 429) {
        if (attempt < AI_CONFIG.maxRetries) {
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        throw new Error("gemini_rate_limited");
      }

      if (res.status >= 500) {
        if (attempt < AI_CONFIG.maxRetries) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        throw new Error(`gemini_server_error_${res.status}`);
      }

      if (!res.ok) throw new Error(`gemini_client_error_${res.status}`);

      const data = await res.json();
      return {
        content: data.candidates?.[0]?.content?.parts?.[0]?.text || "",
        tokens: data.usageMetadata?.totalTokenCount || 0,
        model: cfg.model,
      };
    } catch (err) {
      lastError = err as Error;
      if (err instanceof DOMException && err.name === "AbortError") {
        if (attempt < AI_CONFIG.maxRetries) continue;
        throw new Error("gemini_timeout");
      }
      if (attempt < AI_CONFIG.maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
    }
  }
  throw lastError || new Error("gemini_unknown_error");
}

async function callOpenAI(
  messages: AIMessage[],
  temperature: number,
): Promise<{ content: string; tokens: number; model: string }> {
  const cfg = AI_CONFIG.providers.openai;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= AI_CONFIG.maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), cfg.timeoutMs);

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SECRETS.openai}`,
        },
        body: JSON.stringify({
          model: cfg.model,
          messages,
          max_tokens: cfg.maxTokens,
          temperature,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.status === 429) {
        if (attempt < AI_CONFIG.maxRetries) {
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        throw new Error("openai_rate_limited");
      }

      if (res.status >= 500) {
        if (attempt < AI_CONFIG.maxRetries) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        throw new Error(`openai_server_error_${res.status}`);
      }

      if (!res.ok) throw new Error(`openai_client_error_${res.status}`);

      const data = await res.json();
      return {
        content: data.choices?.[0]?.message?.content || "",
        tokens: data.usage?.total_tokens || 0,
        model: cfg.model,
      };
    } catch (err) {
      lastError = err as Error;
      if (err instanceof DOMException && err.name === "AbortError") {
        if (attempt < AI_CONFIG.maxRetries) continue;
        throw new Error("openai_timeout");
      }
      if (attempt < AI_CONFIG.maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
    }
  }
  throw lastError || new Error("openai_unknown_error");
}

// ─── Provider Fallback Chain ─────────────────────────────────────────────────

interface ProviderResult {
  content: string;
  tokens: number;
  model: string;
  provider: string;
  fallbackUsed: boolean;
}

async function callWithFallback(
  systemPrompt: string,
  sanitizedPrompt: string,
  messages: AIMessage[],
  temperature: number,
): Promise<ProviderResult> {
  const errors: string[] = [];
  let fallbackUsed = false;

  for (const providerName of AI_CONFIG.providerPriority) {
    if (!SECRETS[providerName]) continue;

    try {
      let result;
      if (providerName === "groq") {
        result = await callGroq(messages, temperature);
      } else if (providerName === "gemini") {
        result = await callGemini(systemPrompt, sanitizedPrompt, messages, temperature);
      } else {
        result = await callOpenAI(messages, temperature);
      }

      return {
        content: result.content,
        tokens: result.tokens,
        model: result.model,
        provider: providerName,
        fallbackUsed,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${providerName}: ${msg}`);
      fallbackUsed = true;
      console.warn(`[ai-proxy] ${providerName} failed, trying next provider:`, msg);
    }
  }

  throw new Error(`All providers failed: ${errors.join("; ")}`);
}

// ─── AI Request Logging ──────────────────────────────────────────────────────

async function logUsage(params: {
  userId: string;
  feature: string;
  prompt: string;
  response: string | null;
  tokens: number;
  model: string;
  provider: string;
  latencyMs: number;
  success: boolean;
  fallbackUsed: boolean;
  errorMessage?: string;
  cacheHit?: boolean;
  conversationId?: string;
}): Promise<void> {
  try {
    const cost = params.tokens * (AI_CONFIG.providers[params.provider as keyof typeof AI_CONFIG.providers]?.costPerToken || 0);
    await supabase.from("ai_usage").insert({
      user_id: params.userId,
      feature: params.feature,
      prompt: params.prompt.slice(0, 5000),
      response: params.response?.slice(0, 5000) || null,
      tokens: params.tokens,
      model: params.model,
      provider: params.provider,
      estimated_cost: cost,
      latency_ms: params.latencyMs,
      success: params.success,
      error_message: params.errorMessage || null,
      cache_hit: params.cacheHit || false,
      fallback_used: params.fallbackUsed || false,
      conversation_id: params.conversationId || null,
    });
  } catch (err) {
    console.error("[ai-proxy] failed to log usage:", err);
  }
}

async function logMessage(params: {
  conversationId?: string;
  userId: string;
  role: "user" | "assistant" | "system";
  content: string;
  tokens: number;
  model: string;
  provider: string;
  feature: string;
  latencyMs: number;
}): Promise<void> {
  try {
    await supabase.from("ai_messages").insert({
      conversation_id: params.conversationId || null,
      user_id: params.userId,
      role: params.role,
      content: params.content.slice(0, 5000),
      tokens: params.tokens,
      model: params.model,
      provider: params.provider,
      feature: params.feature,
      latency_ms: params.latencyMs,
    });
  } catch (err) {
    console.error("[ai-proxy] failed to log message:", err);
  }
}

// ─── Auth Helper ─────────────────────────────────────────────────────────────

async function getUserIdFromAuth(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  try {
    const { data: { user } } = await supabase.auth.getUser(token);
    return user?.id || null;
  } catch {
    return null;
  }
}

async function getUserRole(userId: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("users")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    return data?.role || null;
  } catch {
    return null;
  }
}

// ─── Request Handler ─────────────────────────────────────────────────────────

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handleAIRequest(body: AIRequest, userId: string): Promise<AIResult> {
  const startTime = Date.now();
  const systemPrompt = SYSTEM_PROMPTS[body.feature] || SYSTEM_PROMPTS["generate-text"];
  const sanitizedPrompt = body.feature === "moderate"
    ? sanitizePrompt(body.prompt)
    : antiInject(sanitizePrompt(body.prompt));
  const temperature = TEMPERATURE_MAP[body.feature] ?? 0.7;

  // Build messages array
  let messages: AIMessage[];
  if (body.messages && body.messages.length > 0) {
    messages = [
      { role: "system", content: systemPrompt },
      ...body.messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-10)
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: antiInject(sanitizePrompt(m.content)),
        })),
      { role: "user", content: sanitizedPrompt },
    ];
  } else {
    messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: body.context ? `Context: ${body.context}\n\nRequest: ${sanitizedPrompt}` : sanitizedPrompt },
    ];
  }

  // Check cache
  const cacheKey = getCacheKey(body);
  if (cacheKey) {
    const cached = getFromCache(cacheKey);
    if (cached) {
      const latencyMs = Date.now() - startTime;
      await logUsage({
        userId, feature: body.feature, prompt: sanitizedPrompt,
        response: cached.content, tokens: cached.tokens,
        model: cached.model, provider: cached.provider,
        latencyMs, success: true, fallbackUsed: false,
        cacheHit: true,
        conversationId: body.conversationId,
      });
      return {
        success: true, content: cached.content, tokens: cached.tokens,
        model: cached.model, provider: cached.provider, latencyMs,
        cached: true,
      };
    }
  }

  // Call providers with fallback
  const result = await callWithFallback(systemPrompt, sanitizedPrompt, messages, temperature);
  const latencyMs = Date.now() - startTime;

  // Cache successful results
  if (cacheKey && result.content) {
    setCache(cacheKey, {
      content: result.content,
      tokens: result.tokens,
      model: result.model,
      provider: result.provider,
      insertedAt: Date.now(),
    });
  }

  // Log usage
  await logUsage({
    userId, feature: body.feature, prompt: sanitizedPrompt,
    response: result.content, tokens: result.tokens,
    model: result.model, provider: result.provider,
    latencyMs, success: true, fallbackUsed: result.fallbackUsed,
    conversationId: body.conversationId,
  });

  // Log messages for chat feature
  if (body.feature === "chat" && userId !== "anonymous") {
    await logMessage({
      conversationId: body.conversationId, userId,
      role: "user", content: sanitizedPrompt, tokens: 0,
      model: result.model, provider: result.provider,
      feature: body.feature, latencyMs: 0,
    });
    await logMessage({
      conversationId: body.conversationId, userId,
      role: "assistant", content: result.content, tokens: result.tokens,
      model: result.model, provider: result.provider,
      feature: body.feature, latencyMs,
    });
  }

  // Also log messages for marketplace-assistant and product-qa
  if ((body.feature === "marketplace-assistant" || body.feature === "product-qa") && userId !== "anonymous") {
    await logMessage({
      conversationId: body.conversationId, userId,
      role: "user", content: sanitizedPrompt, tokens: 0,
      model: result.model, provider: result.provider,
      feature: body.feature, latencyMs: 0,
    });
    await logMessage({
      conversationId: body.conversationId, userId,
      role: "assistant", content: result.content, tokens: result.tokens,
      model: result.model, provider: result.provider,
      feature: body.feature, latencyMs,
    });
  }

  return {
    success: true, content: result.content, tokens: result.tokens,
    model: result.model, provider: result.provider, latencyMs,
    fallbackUsed: result.fallbackUsed,
  };
}

// ─── Streaming Support ───────────────────────────────────────────────────────

async function streamFromGroq(
  messages: AIMessage[],
  temperature: number,
): Promise<ReadableStream<Uint8Array>> {
  const cfg = AI_CONFIG.providers.groq;
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SECRETS.groq}`,
    },
    body: JSON.stringify({
      model: cfg.model, messages, max_tokens: cfg.maxTokens,
      temperature, top_p: 0.9, stream: true,
    }),
  });

  if (!res.ok || !res.body) throw new Error(`groq_stream_error_${res.status}`);

  return new ReadableStream({
    async start(controller) {
      const reader = res.body!.getReader();
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") {
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                controller.close();
                return;
              }
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
                }
              } catch { /* skip malformed */ }
            }
          }
        }
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

// ─── Main Handler ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // GET → health check
  if (req.method === "GET") {
    const providers = AI_CONFIG.providerPriority.reduce((acc, name) => {
      acc[name] = {
        configured: !!SECRETS[name],
        model: AI_CONFIG.providers[name].model,
      };
      return acc;
    }, {} as Record<string, { configured: boolean; model: string }>);

    return jsonResponse({
      success: Object.values(SECRETS).some(Boolean),
      providers,
      primary: AI_CONFIG.providerPriority[0],
      fallbackChain: AI_CONFIG.providerPriority,
      cacheEnabled: AI_CONFIG.cache.enabled,
    }, 200);
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    // Check at least one provider is configured
    if (!Object.values(SECRETS).some(Boolean)) {
      return jsonResponse(
        { success: false, error: "AI service is not available. Please contact support." },
        503,
      );
    }

    let body: AIRequest;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ success: false, error: "Invalid request body" }, 400);
    }

    // Validate
    if (!body.feature || !VALID_FEATURES.includes(body.feature)) {
      return jsonResponse({ success: false, error: "Invalid or missing feature" }, 400);
    }
    if (!body.prompt && !body.messages) {
      return jsonResponse({ success: false, error: "Missing prompt or messages" }, 400);
    }

    // Auth: require authenticated user — no anonymous AI access
    const authUserId = await getUserIdFromAuth(req);
    if (!authUserId) {
      return jsonResponse(
        { success: false, error: "Authentication required. Please sign in to use AI features." },
        401,
      );
    }
    const userId = authUserId;

    let tier: "user" | "guest" | "admin" = "user";
    const role = await getUserRole(userId);
    tier = role && role.includes("admin") ? "admin" : "user";

    if (body.feature !== "test") {
      if (!checkRateLimit(userId, tier)) {
        return jsonResponse(
          { success: false, error: "Rate limit reached. Please wait a minute and try again." },
          429,
        );
      }
    }

    // Streaming request
    if (body.stream && body.feature === "chat" && SECRETS.groq) {
      const systemPrompt = SYSTEM_PROMPTS.chat;
      const sanitizedPrompt = antiInject(sanitizePrompt(body.prompt));
      const messages: AIMessage[] = [
        { role: "system", content: systemPrompt },
        ...(body.messages || []).slice(-10).map((m) => ({
          role: m.role as "user" | "assistant",
          content: antiInject(sanitizePrompt(m.content)),
        })),
        { role: "user", content: sanitizedPrompt },
      ];

      try {
        const stream = await streamFromGroq(messages, 0.7);
        return new Response(stream, {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        });
      } catch (err) {
        console.warn("[ai-proxy] streaming failed, falling back to non-stream:", err);
      }
    }

    const result = await handleAIRequest(body, userId);

    return jsonResponse(result, 200);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    console.error("[ai-proxy] unhandled error:", errorMsg);

    // Log the error
    try {
      const reqClone = req.clone();
      const body = await reqClone.json().catch(() => ({} as AIRequest));
      await logUsage({
        userId: body.userId || "anonymous",
        feature: body.feature || "unknown",
        prompt: (body.prompt || "").slice(0, 5000),
        response: null, tokens: 0,
        model: "unknown", provider: "unknown",
        latencyMs: 0, success: false, fallbackUsed: false,
        errorMessage: errorMsg,
      });
    } catch { /* ignore */ }

    return jsonResponse(
      { success: false, error: standardizeError(err) },
      500,
    );
  }
});
