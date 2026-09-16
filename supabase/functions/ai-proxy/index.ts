import { createClient } from "npm:@supabase/supabase-js@2.110.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");

const CONFIG = {
  groq: {
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
    url: "https://api.groq.com/openai/v1/chat/completions",
    timeout: 30000,
    cost: 0.00000059,
  },
  gemini: {
    models: ["gemini-2.5-flash-lite"],
    url: "https://generativelanguage.googleapis.com/v1beta/models",
    timeout: 30000,
    cost: 0.000000075,
  },
  openai: {
    models: ["gpt-4o-mini"],
    url: "https://api.openai.com/v1/chat/completions",
    timeout: 30000,
    cost: 0.0000015,
  },
} as const;

const KEYS = {
  groq: Deno.env.get("GROQ_API_KEY") || "",
  gemini: Deno.env.get("GEMINI_API_KEY") || "",
  openai: Deno.env.get("OPENAI_API_KEY") || "",
};

const PRIORITY = ["groq", "gemini", "openai"] as const;
type Provider = typeof PRIORITY[number];
type Role = "system" | "user" | "assistant";
type Msg = { role: Role; content: string };
type Req = {
  feature: string;
  prompt?: string;
  context?: string;
  messages?: Msg[];
  conversationId?: string;
  stream?: boolean;
};
type PResult = { content: string; tokens: number; model: string; provider: Provider };

type SupportSource = {
  id: string;
  type: "help_article" | "faq";
  title: string;
};

const FEATURES = new Set([
  "chat", "search", "product-description", "rewrite", "summarize", "moderate", "translate",
  "recommend", "generate-text", "test", "product-qa", "faq", "marketplace-assistant", "support",
]);

const SYSTEM: Record<string, string> = {
  chat: "You are DRIGHT AI, a marketplace intelligence assistant. Be concise, helpful and specific. Do not invent facts.",
  search: "You are DRIGHT Smart Search. Return only valid JSON describing search keywords and intent.",
  "product-description": "You are DRIGHT Product Description Generator. Create clear, engaging marketplace copy.",
  rewrite: "You are DRIGHT Content Rewriter. Preserve meaning while improving clarity and tone.",
  summarize: "You are DRIGHT Content Summarizer. Capture important points concisely.",
  moderate: "You are DRIGHT Content Moderator. Return only valid JSON.",
  translate: "You are DRIGHT Translator. Preserve meaning and formatting.",
  recommend: "You are DRIGHT Product Recommender. Use only supplied context.",
  "generate-text": "You are DRIGHT AI Assistant. Generate professional content based only on supplied request and evidence.",
  test: "Reply with a brief connection confirmation.",
  "product-qa": "Answer only from supplied product context and say when information is unavailable.",
  faq: "Answer DRIGHT marketplace questions accurately and concisely using only supplied DRIGHT knowledge.",
  "marketplace-assistant": "Help DRIGHT buyers, sellers, affiliates and admins using supplied context.",
  support: `You are DRIGHT Customer Support AI. Use only the supplied DRIGHT knowledge-base material and authenticated account context. Never invent a policy, transaction, order state, refund result, payment result, withdrawal result, ticket result, or staff action. Distinguish general help information from the user's live account data. Do not expose secrets or sensitive payment/account details. If the supplied context is insufficient to resolve the request safely, if a manual investigation or privileged action is required, or if the user asks to speak with a human, prefix your answer with exactly [ESCALATE]. Otherwise do not use that marker. Be concise, practical, and specific.`,
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const clean = (value: unknown, max = 8000) => String(value || "")
  .replace(/\0/g, "")
  .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
  .trim()
  .slice(0, max);

const stripHtml = (value: unknown) => clean(value, 12000)
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/\s+/g, " ")
  .trim();

const classify = (status: number) => status === 401 || status === 403
  ? "PROVIDER_AUTH_ERROR"
  : status === 404
    ? "PROVIDER_NOT_FOUND"
    : status === 429
      ? "PROVIDER_RATE_LIMITED"
      : status === 408 || status === 504
        ? "PROVIDER_TIMEOUT"
        : status >= 500
          ? "PROVIDER_SERVER_ERROR"
          : "PROVIDER_INVALID_RESPONSE";

const safeReason = (provider: Provider, status: number, text: string) => {
  let message = "";
  try {
    const parsed = JSON.parse(text);
    message = String(parsed?.error?.message || parsed?.message || parsed?.error?.status || "");
  } catch {
    // Ignore malformed provider bodies.
  }
  message = message
    .replace(/[A-Za-z0-9_-]{24,}/g, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .slice(0, 240);
  return `${provider}:${classify(status)}:${status}${message ? `:${message}` : ""}`;
};

class ProviderError extends Error {
  constructor(
    public provider: Provider,
    public status: number,
    public code: string,
    public reason: string,
  ) {
    super(`${provider}:${code}`);
  }
}

async function authUser(req: Request) {
  const header = req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const { data: { user } } = await supabase.auth.getUser(header.slice(7));
  return user || null;
}

async function logUsage(input: {
  userId: string;
  feature: string;
  prompt: string;
  response?: string | null;
  tokens?: number;
  model: string;
  provider: string;
  latency: number;
  success: boolean;
  error?: string;
  fallback?: boolean;
}) {
  try {
    const cost = CONFIG[input.provider as Provider]?.cost || 0;
    await supabase.from("ai_usage").insert({
      user_id: input.userId,
      feature: input.feature,
      prompt: input.prompt.slice(0, 5000),
      response: input.response?.slice(0, 5000) || null,
      tokens: input.tokens || 0,
      model: input.model || "unknown",
      provider: input.provider,
      estimated_cost: (input.tokens || 0) * cost,
      latency_ms: input.latency,
      success: input.success,
      error_message: input.error || null,
      cache_hit: false,
      fallback_used: !!input.fallback,
      conversation_id: null,
    });
  } catch {
    console.error("[ai-proxy] usage logging failed");
  }
}

async function fetchBounded(provider: Provider, url: string, init: RequestInit, timeout: number) {
  let last: ProviderError | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      if (response.ok) return response;
      const text = await response.text();
      const error = new ProviderError(provider, response.status, classify(response.status), safeReason(provider, response.status, text));
      if ((response.status === 429 || response.status >= 500 || response.status === 408 || response.status === 504) && attempt < 2) {
        last = error;
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
        continue;
      }
      throw error;
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof ProviderError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        last = new ProviderError(provider, 408, "PROVIDER_TIMEOUT", `${provider}:PROVIDER_TIMEOUT:408`);
        if (attempt < 2) continue;
        throw last;
      }
      last = new ProviderError(provider, 0, "PROVIDER_CONFIGURATION_ERROR", `${provider}:PROVIDER_CONFIGURATION_ERROR:0`);
      if (attempt < 2) continue;
      throw last;
    }
  }
  throw last!;
}

async function groq(messages: Msg[]) {
  let last: ProviderError | undefined;
  for (const model of CONFIG.groq.models) {
    try {
      const response = await fetchBounded("groq", CONFIG.groq.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEYS.groq}` },
        body: JSON.stringify({ model, messages, max_completion_tokens: 2200, temperature: 0.2, top_p: 0.9 }),
      }, CONFIG.groq.timeout);
      const parsed = await response.json();
      const content = String(parsed?.choices?.[0]?.message?.content || "").trim();
      if (!content) throw new ProviderError("groq", 200, "PROVIDER_INVALID_RESPONSE", "groq:PROVIDER_INVALID_RESPONSE:200:empty content");
      return { content, tokens: Number(parsed?.usage?.total_tokens || 0), model, provider: "groq" as const };
    } catch (error) {
      last = error instanceof ProviderError
        ? error
        : new ProviderError("groq", 0, "PROVIDER_CONFIGURATION_ERROR", "groq:PROVIDER_CONFIGURATION_ERROR:0");
      if (last.status === 404) continue;
      throw last;
    }
  }
  throw last!;
}

async function gemini(system: string, prompt: string, history: Msg[]) {
  const model = CONFIG.gemini.models[0];
  const contents = history
    .filter(item => item.role !== "system")
    .slice(-8)
    .map(item => ({ role: item.role === "assistant" ? "model" : "user", parts: [{ text: item.content }] }));
  contents.push({ role: "user", parts: [{ text: prompt }] });
  const response = await fetchBounded("gemini", `${CONFIG.gemini.url}/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": KEYS.gemini },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { maxOutputTokens: 2200, temperature: 0.2 } }),
  }, CONFIG.gemini.timeout);
  const parsed = await response.json();
  const content = String(parsed?.candidates?.[0]?.content?.parts?.map((item: any) => item?.text || "").join("") || "").trim();
  if (!content) throw new ProviderError("gemini", 200, "PROVIDER_INVALID_RESPONSE", "gemini:PROVIDER_INVALID_RESPONSE:200:empty content");
  return { content, tokens: Number(parsed?.usageMetadata?.totalTokenCount || 0), model, provider: "gemini" as const };
}

async function openai(messages: Msg[]) {
  const model = CONFIG.openai.models[0];
  const response = await fetchBounded("openai", CONFIG.openai.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEYS.openai}` },
    body: JSON.stringify({ model, messages, max_tokens: 2200, temperature: 0.2 }),
  }, CONFIG.openai.timeout);
  const parsed = await response.json();
  const content = String(parsed?.choices?.[0]?.message?.content || "").trim();
  if (!content) throw new ProviderError("openai", 200, "PROVIDER_INVALID_RESPONSE", "openai:PROVIDER_INVALID_RESPONSE:200:empty content");
  return { content, tokens: Number(parsed?.usage?.total_tokens || 0), model, provider: "openai" as const };
}

async function fallback(userId: string, feature: string, prompt: string, system: string, messages: Msg[]) {
  const errors: string[] = [];
  let usedFallback = false;
  for (const provider of PRIORITY) {
    const model = CONFIG[provider].models[0];
    if (!KEYS[provider]) {
      const error = `${provider}:PROVIDER_CONFIGURATION_ERROR:0:key missing`;
      errors.push(error);
      await logUsage({ userId, feature, prompt, model, provider, latency: 0, success: false, error, fallback: usedFallback });
      usedFallback = true;
      continue;
    }
    const startedAt = Date.now();
    try {
      const result: PResult = provider === "groq"
        ? await groq(messages)
        : provider === "gemini"
          ? await gemini(system, prompt, messages)
          : await openai(messages);
      await logUsage({
        userId,
        feature,
        prompt,
        response: result.content,
        tokens: result.tokens,
        model: result.model,
        provider,
        latency: Date.now() - startedAt,
        success: true,
        fallback: usedFallback,
      });
      return { ...result, fallbackUsed: usedFallback };
    } catch (error) {
      const providerError = error instanceof ProviderError
        ? error
        : new ProviderError(provider, 0, "PROVIDER_CONFIGURATION_ERROR", `${provider}:PROVIDER_CONFIGURATION_ERROR:0`);
      errors.push(providerError.reason);
      console.error(`[ai-proxy] provider failure ${providerError.reason}`);
      await logUsage({
        userId,
        feature,
        prompt,
        model,
        provider,
        latency: Date.now() - startedAt,
        success: false,
        error: providerError.reason,
        fallback: usedFallback,
      });
      usedFallback = true;
    }
  }
  throw new Error(`ALL_PROVIDERS_FAILED:${errors.join(";")}`);
}

const SUPPORT_STOP_WORDS = new Set([
  "the", "and", "for", "that", "this", "with", "from", "have", "what", "when", "where", "which",
  "your", "you", "are", "can", "could", "would", "should", "does", "how", "why", "into", "about", "please",
]);

function supportTerms(prompt: string) {
  return Array.from(new Set(
    prompt.toLowerCase().match(/[a-z0-9]{3,}/g)?.filter(term => !SUPPORT_STOP_WORDS.has(term)) || [],
  )).slice(0, 12);
}

function relevance(text: string, terms: string[]) {
  const normalized = text.toLowerCase();
  return terms.reduce((score, term) => score + (normalized.includes(term) ? 1 : 0), 0);
}

async function buildSupportContext(userId: string, prompt: string): Promise<{ context: string; sources: SupportSource[] }> {
  const [articleResult, faqResult, orderResult, paymentResult, withdrawalResult, ticketResult] = await Promise.all([
    supabase.from("help_articles").select("id,title,summary,content,tags").eq("is_published", true).eq("is_deleted", false).order("sort_order", { ascending: true }).limit(40),
    supabase.from("faq_items").select("id,question,answer,tags").eq("is_published", true).eq("is_deleted", false).order("sort_order", { ascending: true }).limit(40),
    supabase.from("orders").select("id,product_id,order_type,status,final_price,is_free_order,created_at,completed_at").eq("buyer_id", userId).order("created_at", { ascending: false }).limit(8),
    supabase.from("paystack_transactions").select("id,reference,amount,currency,channel,purpose,status,gateway_response,paid_at,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(8),
    supabase.from("withdrawal_requests").select("id,amount,payment_method,status,admin_notes,processed_at,created_at,withdrawal_method,reference,failure_reason").eq("user_id", userId).order("created_at", { ascending: false }).limit(8),
    supabase.from("support_tickets").select("id,ticket_number,subject,status,priority,channel,created_at,last_activity_at,resolved_at,closed_at").eq("user_id", userId).order("last_activity_at", { ascending: false }).limit(8),
  ]);

  const terms = supportTerms(prompt);
  const knowledge = [
    ...(articleResult.data || []).map((item: any) => ({
      id: String(item.id),
      type: "help_article" as const,
      title: clean(item.title, 240),
      text: `${clean(item.title, 240)} ${clean(item.summary, 1000)} ${stripHtml(item.content)} ${(item.tags || []).join(" ")}`,
    })),
    ...(faqResult.data || []).map((item: any) => ({
      id: String(item.id),
      type: "faq" as const,
      title: clean(item.question, 240),
      text: `${clean(item.question, 500)} ${stripHtml(item.answer)} ${(item.tags || []).join(" ")}`,
    })),
  ]
    .map(item => ({ ...item, score: relevance(item.text, terms) }))
    .sort((a, b) => b.score - a.score)
    .filter((item, index) => item.score > 0 || (terms.length === 0 && index < 4))
    .slice(0, 8);

  const sources: SupportSource[] = knowledge.map(item => ({ id: item.id, type: item.type, title: item.title }));
  const parts: string[] = [];

  if (knowledge.length > 0) {
    parts.push("DRIGHT KNOWLEDGE BASE:\n" + knowledge.map((item, index) =>
      `[KB${index + 1}] ${item.type === "faq" ? "FAQ" : "ARTICLE"}: ${item.title}\n${clean(item.text, 2200)}`,
    ).join("\n\n"));
  } else {
    parts.push("DRIGHT KNOWLEDGE BASE: No relevant published help article or FAQ is currently available for this request.");
  }

  parts.push("AUTHENTICATED USER ACCOUNT CONTEXT (authoritative current database rows):");
  parts.push(`Recent buyer orders: ${JSON.stringify(orderResult.data || [])}`);
  parts.push(`Recent Paystack transactions: ${JSON.stringify(paymentResult.data || [])}`);
  parts.push(`Recent withdrawal requests: ${JSON.stringify(withdrawalResult.data || [])}`);
  parts.push(`Recent support tickets: ${JSON.stringify(ticketResult.data || [])}`);
  parts.push("Never infer a missing state from an empty array. If an action, policy, refund eligibility, reversal, KYC decision, dispute outcome, or manual review is not explicitly supported by this context, escalate rather than guess.");

  return { context: clean(parts.join("\n\n"), 24000), sources };
}

function explicitlyRequestsHuman(prompt: string) {
  const value = prompt.toLowerCase();
  return /(human|agent|customer\s*care|support\s*staff|real\s*person)/.test(value)
    && /(speak|talk|contact|connect|escalat|transfer|need|want)/.test(value);
}

async function ensureSupportEscalation(userId: string, prompt: string, aiSummary: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: existing } = await supabase.from("support_tickets")
    .select("id,ticket_number,status")
    .eq("user_id", userId)
    .eq("channel", "ai")
    .in("status", ["open", "pending_support", "pending_customer", "escalated"])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    await supabase.from("ticket_replies").insert({
      ticket_id: existing.id,
      author_id: userId,
      author_role: "user",
      message: clean(prompt, 5000),
      channel: "ai",
      is_internal: false,
      metadata: { source: "ai_support_escalation" },
    });
    await supabase.from("support_tickets").update({ ai_handled: true, ai_summary: clean(aiSummary, 5000) }).eq("id", existing.id);
    return existing;
  }

  const subjectBase = clean(prompt.replace(/\s+/g, " "), 110);
  const { data: ticket, error } = await supabase.from("support_tickets").insert({
    user_id: userId,
    subject: `AI Support: ${subjectBase || "Human assistance requested"}`,
    message: clean(prompt, 5000),
    priority: "medium",
    category: "ai_support",
    channel: "ai",
    ai_handled: true,
    ai_summary: clean(aiSummary, 5000),
    metadata: { source: "ai_support_escalation" },
  }).select("id,ticket_number,status").single();
  if (error) throw error;
  return ticket;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method === "GET") {
    return json({
      success: Object.values(KEYS).some(Boolean),
      providers: Object.fromEntries(PRIORITY.map(provider => [provider, {
        configured: !!KEYS[provider],
        model: CONFIG[provider].models[0],
        fallbackModels: CONFIG[provider].models.slice(1),
      }])),
      primary: "groq",
      fallbackChain: PRIORITY,
      supportGrounding: true,
      supportEscalation: true,
    });
  }
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  const user = await authUser(req);
  if (!user) return json({ success: false, error: "Authentication required." }, 401);

  let body: Req;
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: "Invalid request body" }, 400);
  }

  if (!FEATURES.has(String(body.feature || ""))) return json({ success: false, error: "Invalid or missing feature" }, 400);
  const prompt = clean(body.prompt || "");
  if (!prompt && !body.messages?.length) return json({ success: false, error: "Missing prompt or messages" }, 400);

  const system = SYSTEM[body.feature] || SYSTEM["generate-text"];
  let supportSources: SupportSource[] = [];
  let supportContext = "";

  if (body.feature === "support") {
    const grounded = await buildSupportContext(user.id, prompt);
    supportSources = grounded.sources;
    supportContext = grounded.context;
  }

  const combinedContext = [supportContext, body.context ? clean(body.context, 8000) : ""].filter(Boolean).join("\n\n");
  const finalPrompt = combinedContext ? `Context:\n${combinedContext}\n\nRequest:\n${prompt}` : prompt;
  const messages: Msg[] = [
    { role: "system", content: system },
    ...(body.messages || []).filter(item => item.role === "user" || item.role === "assistant").slice(-8).map(item => ({ role: item.role, content: clean(item.content) })),
    { role: "user", content: finalPrompt },
  ];

  try {
    const result = await fallback(user.id, body.feature, prompt, system, messages);
    let responseContent = result.content.trim();
    const modelRequestedEscalation = /^\[ESCALATE\]/i.test(responseContent);
    responseContent = responseContent.replace(/^\[ESCALATE\]\s*/i, "").trim();
    const shouldEscalate = body.feature === "support" && (modelRequestedEscalation || explicitlyRequestsHuman(prompt));
    let escalation: { id: string; ticket_number: string | null; status: string } | null = null;

    if (shouldEscalate) {
      try {
        escalation = await ensureSupportEscalation(user.id, prompt, responseContent);
        const reference = escalation.ticket_number || escalation.id.slice(0, 8);
        responseContent = `${responseContent || "This request needs a support agent to review it."}\n\nI created or updated support ticket ${reference}. DRIGHT Support has been notified.`;
      } catch (error) {
        console.error("[ai-proxy] support escalation failed", error instanceof Error ? error.message : String(error));
        responseContent = `${responseContent || "This request needs a support agent to review it."}\n\nI could not create the support ticket automatically. Please open My Support in the Help Center to submit it.`;
      }
    }

    return json({
      success: true,
      content: responseContent,
      tokens: result.tokens,
      model: result.model,
      provider: result.provider,
      fallbackUsed: result.fallbackUsed,
      ...(body.feature === "support" ? {
        grounded: true,
        supportSources,
        escalated: !!escalation,
        ticket: escalation,
      } : {}),
    });
  } catch (error) {
    const internal = error instanceof Error ? error.message : "ALL_PROVIDERS_FAILED";
    console.error(`[ai-proxy] ${internal}`);
    await logUsage({ userId: user.id, feature: body.feature, prompt, model: "unknown", provider: "gateway", latency: 0, success: false, error: internal, fallback: true });
    return json({
      success: false,
      error: { code: "AI_PROVIDER_FAILURE", message: "DRIGHT AI is temporarily unavailable. Provider diagnostics are available to authorized administrators." },
    }, 502);
  }
});
