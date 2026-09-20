import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ success: false, error: "Authentication required" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ success: false, error: "Authentication required" }, 401);

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ success: false, error: "Voice transcription is not configured" }, 503);

    const form = await req.formData();
    const audio = form.get("audio");
    const language = String(form.get("language") || "").trim().toLowerCase();

    if (!(audio instanceof File)) {
      return json({ success: false, error: "Audio file is required" }, 400);
    }
    if (audio.size < 200) {
      return json({ success: false, error: "Recorded audio is empty" }, 400);
    }
    if (audio.size > 10 * 1024 * 1024) {
      return json({ success: false, error: "Voice search recording is too large" }, 413);
    }

    const allowed = [
      "audio/webm",
      "audio/mp4",
      "audio/mpeg",
      "audio/wav",
      "audio/x-wav",
      "audio/ogg",
      "video/webm",
    ];
    const normalizedType = (audio.type || "").split(";")[0].toLowerCase();
    if (normalizedType && !allowed.includes(normalizedType)) {
      return json({ success: false, error: "Unsupported audio format" }, 415);
    }

    const openaiForm = new FormData();
    openaiForm.append("model", "whisper-1");
    openaiForm.append("file", audio, audio.name || "marketplace-voice-search.webm");
    openaiForm.append("response_format", "json");
    if (/^[a-z]{2,3}$/.test(language)) openaiForm.append("language", language);

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: openaiForm,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("[voice-search-transcribe] OpenAI error", response.status, detail.slice(0, 300));
      return json({ success: false, error: "Voice transcription provider failed" }, 502);
    }

    const result = await response.json();
    const transcript = String(result?.text || "").trim();
    if (!transcript) return json({ success: false, error: "No speech was detected" }, 422);

    try {
      await supabase.from("ai_usage").insert({
        user_id: user.id,
        provider: "openai",
        model: "whisper-1",
        feature: "marketplace-voice-search",
        tokens: 0,
        estimated_cost: 0,
        latency_ms: 0,
        success: true,
      });
    } catch {
      // Usage logging must not block voice search.
    }

    return json({ success: true, transcript, provider: "openai", model: "whisper-1" });
  } catch (error) {
    console.error("[voice-search-transcribe]", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Voice transcription failed",
    }, 500);
  }
});
