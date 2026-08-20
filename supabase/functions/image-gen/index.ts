import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT Image Generation Edge Function
//
// Routes image generation requests to OpenAI DALL-E 3 for actual image creation.
// Image analysis/editing still uses Groq/Gemini vision models.
//
// SECURITY: All API keys read via Deno.env.get(). Never exposed to browser.
// ─────────────────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") || "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";

const OPENAI_IMAGE_MODEL = "dall-e-3";
const GROQ_VISION_MODEL = "llama-3.3-70b-versatile";
const GEMINI_VISION_MODEL = "gemini-2.0-flash-lite";

function getSupabaseClient(req: Request) {
  return createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
    },
  );
}

function sanitizePrompt(input: string): string {
  return input
    .replace(/<script[^>]*>.*?<\/script>/gis, "")
    .replace(/<[^>]+>/g, "")
    .replace(/ignore\s+(all\s+)?(previous|above)\s+instructions?/gi, "")
    .replace(/disregard\s+(all\s+)?(previous|above)\s+/gi, "")
    .replace(/you\s+are\s+now\s+/gi, "")
    .trim()
    .slice(0, 4000);
}

function standardizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("timed out") || msg.includes("AbortError")) return "The image service is taking too long. Please try again.";
  if (msg.includes("429") || msg.includes("rate limit")) return "The image service is busy. Please try again shortly.";
  if (msg.includes("content_policy") || msg.includes("content policy")) return "Your prompt was rejected by the safety filter. Please modify and try again.";
  console.error("[image-gen] internal error:", msg);
  return "An error occurred during image generation. Please try again.";
}

// ─── Image Generation via OpenAI DALL-E 3 ────────────────────────────────────

async function handleGenerate(body: {
  prompt: string;
  userId: string;
  size?: string;
  quality?: string;
  style?: string;
}, supabase: ReturnType<typeof getSupabaseClient>) {
  const startTime = Date.now();
  const sanitized = sanitizePrompt(body.prompt);
  if (!sanitized) throw new Error("Prompt is required after sanitization");

  const size = body.size || "1024x1024";
  const quality = body.quality || "standard";
  const style = body.style || "vivid";

  if (!OPENAI_API_KEY) throw new Error("OpenAI API key not configured for image generation");

  // Insert pending record
  const { data: record } = await supabase.from("ai_images").insert({
    user_id: body.userId,
    prompt: sanitized,
    image_url: "",
    type: "generated",
    provider: "openai",
    model: OPENAI_IMAGE_MODEL,
    status: "pending",
    size,
    quality,
  }).select("id").single();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_IMAGE_MODEL,
        prompt: sanitized,
        n: 1,
        size,
        quality,
        style,
        response_format: "url",
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errBody = await res.text();
      console.error("[image-gen] OpenAI error:", res.status, errBody);
      throw new Error(`openai_error_${res.status}`);
    }

    const data = await res.json();
    const imageUrl = data.data?.[0]?.url || "";
    const revisedPrompt = data.data?.[0]?.revised_prompt || sanitized;
    const generationMs = Date.now() - startTime;
    const cost = quality === "hd" ? 0.08 : 0.04;

    // Update record to completed
    await supabase.from("ai_images").update({
      image_url: imageUrl,
      status: "completed",
      generation_ms: generationMs,
      cost,
      metadata: { revised_prompt: revisedPrompt, size, quality, style },
    }).eq("id", record?.id);

    // Log usage
    try {
      await supabase.from("ai_usage").insert({
        user_id: body.userId,
        provider: "openai",
        model: OPENAI_IMAGE_MODEL,
        feature: "image-generation",
        tokens: 0,
        estimated_cost: cost,
        latency_ms: generationMs,
        success: true,
      });
    } catch { /* non-fatal */ }

    return {
      success: true,
      imageId: record?.id,
      imageUrl,
      revisedPrompt,
      provider: "openai",
      model: OPENAI_IMAGE_MODEL,
      generationMs,
    };
  } catch (err) {
    // Update record to failed
    await supabase.from("ai_images").update({
      status: "failed",
      metadata: { error: err instanceof Error ? err.message : String(err) },
    }).eq("id", record?.id);

    throw err;
  }
}

// ─── Image Analysis via Groq/Gemini Vision ───────────────────────────────────

async function callGroqVision(imageUrl: string, prompt: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_VISION_MODEL,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      }],
      max_tokens: 1000,
      temperature: 0.3,
    }),
    signal: controller.signal,
  });

  clearTimeout(timeoutId);

  if (!res.ok) throw new Error(`groq_vision_error_${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

async function callGeminiVision(imageUrl: string, prompt: string): Promise<string> {
  // Convert URL to inline_data for Gemini
  let inlineData: string | null = null;
  if (imageUrl.startsWith("data:")) {
    inlineData = imageUrl.split(",")[1];
  } else {
    // Fetch the image and convert to base64
    const imgRes = await fetch(imageUrl);
    if (imgRes.ok) {
      const blob = await imgRes.blob();
      const arrayBuffer = await blob.arrayBuffer();
      inlineData = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    }
  }

  if (!inlineData) throw new Error("Failed to load image for Gemini vision");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_VISION_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            { text: prompt },
            { inline_data: { mime_type: "image/jpeg", data: inlineData } },
          ],
        }],
        generationConfig: { maxOutputTokens: 1000, temperature: 0.3 },
      }),
      signal: controller.signal,
    },
  );

  clearTimeout(timeoutId);

  if (!res.ok) throw new Error(`gemini_vision_error_${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function handleAnalyze(body: {
  imageUrl: string;
  prompt?: string;
  userId: string;
}, supabase: ReturnType<typeof getSupabaseClient>) {
  const startTime = Date.now();
  const prompt = body.prompt || "Analyze this image and provide: 1) A descriptive title (max 60 chars), 2) A detailed description for a marketplace listing, 3) Suggested categories (comma-separated), 4) SEO keywords (comma-separated). Return as JSON: {\"suggested_title\":\"\",\"description\":\"\",\"suggested_categories\":[],\"seo_keywords\":[]}";

  let analysisText = "";
  const providers: string[] = [];

  // Try Groq first (supports image_url directly)
  if (GROQ_API_KEY) {
    try {
      analysisText = await callGroqVision(body.imageUrl, prompt);
      providers.push("groq");
    } catch (err) {
      console.warn("[image-gen] Groq vision failed:", err);
    }
  }

  // Fallback to Gemini
  if (!analysisText && GEMINI_API_KEY) {
    try {
      analysisText = await callGeminiVision(body.imageUrl, prompt);
      providers.push("gemini");
    } catch (err) {
      console.warn("[image-gen] Gemini vision failed:", err);
    }
  }

  if (!analysisText) throw new Error("All vision providers failed or not configured");

  const latencyMs = Date.now() - startTime;
  const provider = providers[0] || "unknown";

  // Parse JSON from response
  let parsed: Record<string, unknown> = {};
  try {
    const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
    if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
  } catch { /* return raw text */ }

  // Log usage
  try {
    await supabase.from("ai_usage").insert({
      user_id: body.userId,
      provider,
      model: provider === "groq" ? GROQ_VISION_MODEL : GEMINI_VISION_MODEL,
      feature: "image-analysis",
      tokens: 0,
      estimated_cost: 0.001,
      latency_ms: latencyMs,
      success: true,
    });
  } catch { /* non-fatal */ }

  return {
    success: true,
    analysis: parsed,
    rawAnalysis: analysisText,
    provider,
    latencyMs,
  };
}

// ─── Image Edit via OpenAI DALL-E 2 ──────────────────────────────────────────

async function handleEdit(body: {
  imageUrl: string;
  prompt: string;
  userId: string;
  mask?: string;
}, supabase: ReturnType<typeof getSupabaseClient>) {
  const startTime = Date.now();
  const sanitized = sanitizePrompt(body.prompt);
  if (!OPENAI_API_KEY) throw new Error("OpenAI API key not configured for image editing");

  // Fetch image as Blob — OpenAI edits API requires actual file, not URL
  const imgRes = await fetch(body.imageUrl);
  if (!imgRes.ok) throw new Error(`Failed to fetch image (${imgRes.status})`);
  const imgBlob = await imgRes.blob();

  const formData = new FormData();
  formData.append("model", "dall-e-2");
  formData.append("prompt", sanitized);
  formData.append("n", "1");
  formData.append("size", "1024x1024");
  formData.append("image", imgBlob, "image.png");

  if (body.mask) {
    const maskRes = await fetch(body.mask);
    if (maskRes.ok) {
      const maskBlob = await maskRes.blob();
      formData.append("mask", maskBlob, "mask.png");
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  const res = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { "Authorization": `Bearer ${OPENAI_API_KEY}` },
    body: formData,
    signal: controller.signal,
  });

  clearTimeout(timeoutId);

  if (!res.ok) {
    const errBody = await res.text();
    console.error("[image-gen] OpenAI edit error:", res.status, errBody);
    throw new Error(`openai_edit_error_${res.status}`);
  }

  const data = await res.json();
  const editedUrl = data.data?.[0]?.url || "";
  const latencyMs = Date.now() - startTime;

  // Save record
  const { data: record } = await supabase.from("ai_images").insert({
    user_id: body.userId,
    prompt: sanitized,
    image_url: editedUrl,
    type: "edited",
    provider: "openai",
    model: "dall-e-2",
    status: "completed",
    generation_ms: latencyMs,
    cost: 0.02,
  }).select("id").single();

  return {
    success: true,
    imageId: record?.id,
    imageUrl: editedUrl,
    provider: "openai",
    model: "dall-e-2",
    latencyMs,
  };
}

// ─── Main Handler ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method === "GET") {
    return new Response(JSON.stringify({
      success: !!OPENAI_API_KEY,
      provider: "OpenAI DALL-E 3",
      configured: !!OPENAI_API_KEY,
      visionProviders: {
        groq: !!GROQ_API_KEY,
        gemini: !!GEMINI_API_KEY,
      },
      ...(!OPENAI_API_KEY && { error: "OPENAI_API_KEY not configured" }),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = getSupabaseClient(req);

    // Verify authentication — reject anonymous AI access
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      return new Response(
        JSON.stringify({ success: false, error: "Authentication required. Please sign in to use AI features." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json();
    const action = body.action || "generate";

    // Override userId with authenticated user's ID — never trust client-provided userId
    body.userId = authData.user.id;

    let result: Record<string, unknown>;

    switch (action) {
      case "generate":
      case "generate-image":
        result = await handleGenerate(body, supabase);
        break;
      case "analyze":
      case "analyze-image":
        result = await handleAnalyze(body, supabase);
        break;
      case "edit":
      case "edit-image":
        result = await handleEdit(body, supabase);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: standardizeError(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
