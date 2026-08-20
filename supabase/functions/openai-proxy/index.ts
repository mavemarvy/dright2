import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const OPENAI_IMAGE_MODEL = "dall-e-3";
const OPENAI_VISION_MODEL = "gpt-4o";
const OPENAI_CHAT_MODEL = "gpt-4o-mini";
const OPENAI_TRANSCRIBE_MODEL = "whisper-1";

function getSupabaseClient(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (authHeader) {
    return createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
  }
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!
  );
}

function sanitizePrompt(prompt: string): string {
  return prompt.slice(0, 4000).replace(/[\x00-\x1F\x7F]/g, "");
}

async function logUsage(supabase: ReturnType<typeof getSupabaseClient>, userId: string, provider: string, model: string, feature: string, tokensIn: number, tokensOut: number, cost: number, latencyMs: number = 0) {
  try {
    const totalTokens = tokensIn + tokensOut;
    await supabase.from("ai_usage").insert({
      user_id: userId,
      provider,
      model,
      feature,
      tokens: totalTokens,
      estimated_cost: cost,
      latency_ms: latencyMs,
      success: true,
    });
  } catch { /* non-fatal */ }
}

async function handleGenerateImage(body: any, supabase: ReturnType<typeof getSupabaseClient>) {
  const { prompt, userId, size = "1024x1024", quality = "standard", type = "product" } = body;
  if (!prompt) throw new Error("Missing prompt");
  if (!userId) throw new Error("Missing userId");

  const sanitized = sanitizePrompt(prompt);
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const styleMap: Record<string, string> = {
    product: `Professional product photography: ${sanitized}. Clean background, studio lighting, high detail.`,
    banner: `Marketing banner: ${sanitized}. Wide aspect, bold colors, modern design.`,
    marketing: `Marketing graphic: ${sanitized}. Eye-catching, professional.`,
  };
  const fullPrompt = styleMap[type] || styleMap.product;

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: OPENAI_IMAGE_MODEL, prompt: fullPrompt, n: 1, size, quality }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`OpenAI image API error (${res.status}): ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  const imageUrl = data.data?.[0]?.url || "";
  const revisedPrompt = data.data?.[0]?.revised_prompt || sanitized;

  const { data: record } = await supabase.from("ai_images").insert({
    user_id: userId,
    prompt: sanitized,
    image_url: imageUrl,
    type: type,
    provider: "openai",
    model: OPENAI_IMAGE_MODEL,
    status: "completed",
    metadata: { full_prompt: fullPrompt, revised_prompt: revisedPrompt, size, quality },
  }).select().single();

  const latencyMs = Date.now() - (body._startTime || Date.now());
  const genLatency = Date.now() - (body._startTime || Date.now());
  await logUsage(supabase, userId, "openai", OPENAI_IMAGE_MODEL, "image-generation", 0, 0, 0.04, genLatency);

  // Update the image record with generation time and cost
  if (record?.id) {
    await supabase.from("ai_images").update({ generation_ms: genLatency, cost: 0.04, size, quality }).eq("id", record.id);
  }

  return { success: true, imageId: record?.id, imageUrl, revisedPrompt, provider: "openai", model: OPENAI_IMAGE_MODEL, generationMs: genLatency };
}

async function handleEditImage(body: any, supabase: ReturnType<typeof getSupabaseClient>) {
  const { imageUrl, editPrompt, userId, mask } = body;
  if (!imageUrl) throw new Error("Missing imageUrl");
  if (!editPrompt) throw new Error("Missing editPrompt");
  if (!userId) throw new Error("Missing userId");

  const sanitized = sanitizePrompt(editPrompt);
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  // Fetch the image server-side and convert to Blob — OpenAI edits API requires a real file, not a URL string
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) {
    throw new Error(`Failed to fetch image for editing (${imgRes.status})`);
  }
  const imgBlob = await imgRes.blob();

  const formData = new FormData();
  formData.append("model", "dall-e-2");
  formData.append("prompt", sanitized);
  formData.append("n", "1");
  formData.append("size", "1024x1024");
  formData.append("image", imgBlob, "image.png");

  if (mask) {
    const maskRes = await fetch(mask);
    if (maskRes.ok) {
      const maskBlob = await maskRes.blob();
      formData.append("mask", maskBlob, "mask.png");
    }
  }

  const res = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}` },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`OpenAI image edit API error (${res.status}): ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  const editedUrl = data.data?.[0]?.url || "";

  const { data: record } = await supabase.from("ai_images").insert({
    user_id: userId,
    prompt: sanitized,
    image_url: editedUrl,
    type: "edited",
    provider: "openai",
    model: "dall-e-2",
    status: "completed",
    metadata: { original_image: imageUrl, edit_prompt: sanitized },
  }).select().single();

  await logUsage(supabase, userId, "openai", "dall-e-2", "image-edit", 0, 0, 0.02);

  return { success: true, imageId: record?.id, imageUrl: editedUrl, provider: "openai", model: "dall-e-2" };
}

async function handleAnalyzeImage(body: any, supabase: ReturnType<typeof getSupabaseClient>) {
  const { imageUrl, userId, context = "product" } = body;
  if (!imageUrl) throw new Error("Missing imageUrl");
  if (!userId) throw new Error("Missing userId");

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const contextPrompts: Record<string, string> = {
    product: `Analyze this product image and provide:
1. Product type and category
2. Suggested product title (concise, marketable)
3. Suggested categories (comma-separated)
4. Key visual features and attributes
5. Suggested price range
6. SEO keywords (comma-separated)
7. A compelling product description (2-3 sentences)
Respond in JSON format with keys: product_type, suggested_title, suggested_categories, features, price_range, seo_keywords, description`,
    marketplace: `Analyze this image and identify what product or service it represents. Suggest similar items.
Respond in JSON format with keys: product_type, similar_products, related_services, related_jobs, search_keywords`,
    report: `Analyze this image for a fraud/abuse report. Determine:
1. What the image shows
2. Whether it appears suspicious
3. Key details visible
4. Recommended action
Respond in JSON format with keys: image_content, is_suspicious, key_details, recommended_action, confidence_score`,
  };

  const prompt = contextPrompts[context] || contextPrompts.product;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OPENAI_VISION_MODEL,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      }],
      max_tokens: 1024,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`OpenAI vision API error (${res.status}): ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "";

  let parsed: Record<string, unknown> = {};
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
  } catch {
    parsed = { raw_analysis: content };
  }

  const { data: record } = await supabase.from("ai_images").insert({
    user_id: userId,
    prompt: `Analyze image (${context})`,
    image_url: imageUrl,
    type: "analyzed",
    provider: "openai",
    model: OPENAI_VISION_MODEL,
    status: "completed",
    metadata: { analysis_result: parsed, raw_content: content, context },
  }).select().single();

  await logUsage(supabase, userId, "openai", OPENAI_VISION_MODEL, "image-analysis", data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0, 0.01);

  return { success: true, imageId: record?.id, analysis: parsed, rawContent: content, provider: "openai", model: OPENAI_VISION_MODEL };
}

async function handleTranscribe(body: any, supabase: ReturnType<typeof getSupabaseClient>) {
  const { audioUrl, userId, language } = body;
  if (!audioUrl) throw new Error("Missing audioUrl");
  if (!userId) throw new Error("Missing userId");

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  // Fetch the audio file server-side so we pass a real File/Blob to Whisper,
  // not a URL string (which the OpenAI API rejects).
  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) {
    throw new Error(`Failed to fetch audio file (${audioRes.status})`);
  }
  const audioBlob = await audioRes.blob();

  // Infer filename and content type from the URL
  const urlPath = new URL(audioUrl).pathname;
  const ext = (urlPath.split(".").pop() || "webm").toLowerCase();
  const mimeTypeMap: Record<string, string> = {
    webm: "audio/webm",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    m4a: "audio/mp4",
    ogg: "audio/ogg",
  };
  const mimeType = mimeTypeMap[ext] || "audio/webm";
  const filename = `audio.${ext}`;

  const formData = new FormData();
  formData.append("model", OPENAI_TRANSCRIBE_MODEL);
  formData.append("file", new Blob([audioBlob], { type: mimeType }), filename);
  if (language) formData.append("language", language);

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}` },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`OpenAI transcription API error (${res.status}): ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  const transcript = data.text || "";
  const language2 = data.language || language || null;
  const durationSec = data.duration || 0;
  const segments = data.segments || null;

  // Save transcription record
  try {
    await supabase.from("ai_voice_transcriptions").insert({
      user_id: userId,
      audio_url: audioUrl,
      transcript,
      language: language2,
      duration_seconds: durationSec,
      model: OPENAI_TRANSCRIBE_MODEL,
      provider: "openai",
      confidence: segments ? (segments as any[]).reduce((s: number, seg: any) => s + (seg.avg_logprob || 0), 0) / (segments.length || 1) : null,
      segments: segments,
      status: "completed",
    });
  } catch { /* non-fatal */ }

  await logUsage(supabase, userId, "openai", OPENAI_TRANSCRIBE_MODEL, "voice-transcription", 0, 0, 0.006);

  return { success: true, transcript, language: language2, duration: durationSec, segments, provider: "openai", model: OPENAI_TRANSCRIBE_MODEL };
}

async function handleChat(body: any, supabase: ReturnType<typeof getSupabaseClient>) {
  const { messages, userId, maxTokens = 2000, temperature = 0.7 } = body;
  if (!messages || !Array.isArray(messages)) throw new Error("Missing messages");
  if (!userId) throw new Error("Missing userId");

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OPENAI_CHAT_MODEL,
      messages,
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`OpenAI chat API error (${res.status}): ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "";

  await logUsage(supabase, userId, "openai", OPENAI_CHAT_MODEL, "chat", data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0, 0.005);

  return { success: true, content, provider: "openai", model: OPENAI_CHAT_MODEL };
}

const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 15;

function checkRateLimit(identifier: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(identifier);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(identifier, { count: 1, windowStart: now });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
}

function standardizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("timed out") || msg.includes("AbortError")) return "The AI service is taking too long. Please try again.";
  if (msg.includes("429") || msg.includes("rate limit")) return "The AI service is busy. Please try again shortly.";
  if (msg.includes("503") || msg.includes("502") || msg.includes("500")) return "The AI service is temporarily unavailable. Please try again.";
  console.error("[openai-proxy] internal error:", msg);
  return "An unexpected error occurred during AI processing.";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method === "GET") {
    const configured = !!Deno.env.get("OPENAI_API_KEY");
    return new Response(JSON.stringify({
      success: configured, provider: "OpenAI", configured,
      model: `${OPENAI_CHAT_MODEL} / ${OPENAI_IMAGE_MODEL} / ${OPENAI_TRANSCRIBE_MODEL}`,
      ...(!configured && { error: "Missing OPENAI_API_KEY" }),
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
    const action = body.action || "generate-image";

    // Override userId with authenticated user's ID — never trust client-provided userId
    const userId = authData.user.id;
    body.userId = userId;

    if (!checkRateLimit(userId)) {
      return new Response(JSON.stringify({ success: false, error: "Rate limit reached. Please wait a minute." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result: Record<string, unknown>;

    switch (action) {
      case "generate-image":
        result = await handleGenerateImage(body, supabase);
        break;
      case "edit-image":
        result = await handleEditImage(body, supabase);
        break;
      case "analyze-image":
        result = await handleAnalyzeImage(body, supabase);
        break;
      case "transcribe":
        result = await handleTranscribe(body, supabase);
        break;
      case "chat":
        result = await handleChat(body, supabase);
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
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
