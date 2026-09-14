import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization,Apikey,X-Client-Info",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const ALLOWED_TYPES = new Set(["product","service","course","job","task","store","creator","profile","post","community","news","campaign"]);

function clients(req: Request) {
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth = req.headers.get("Authorization") || "";
  return {
    user: createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } }),
    admin: createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } }),
  };
}

async function isAdmin(userClient: ReturnType<typeof createClient>, uid: string) {
  const { data } = await userClient.from("users").select("is_admin,admin_status").eq("id", uid).maybeSingle();
  return Boolean(data?.is_admin && data?.admin_status === "active");
}

async function embeddingFor(text: string, model: string, apiKey: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: text, encoding_format: "float" }),
    });
    const raw = await res.text();
    if (!res.ok) throw new Error(`Embedding provider error ${res.status}: ${raw.slice(0,240)}`);
    const data = JSON.parse(raw);
    const embedding = data?.data?.[0]?.embedding;
    if (!Array.isArray(embedding)) throw new Error("Embedding provider returned no vector");
    return { embedding: embedding as number[], tokens: Number(data?.usage?.total_tokens || data?.usage?.prompt_tokens || 0) };
  } finally { clearTimeout(timer); }
}

async function settings(admin: ReturnType<typeof createClient>) {
  const { data, error } = await admin.from("algorithm_settings").select("*").eq("is_singleton", true).maybeSingle();
  if (error || !data) throw new Error("Algorithm settings unavailable");
  return data as any;
}

async function logUsage(admin: ReturnType<typeof createClient>, uid: string | null, s: any, tokens: number, success: boolean, errorMessage?: string, latencyMs = 0) {
  const costPerMillion = Number(s.embedding_estimated_cost_per_million_tokens || 0);
  const estimatedCost = costPerMillion > 0 ? (tokens / 1_000_000) * costPerMillion : 0;
  await admin.from("ai_usage").insert({
    user_id: uid, provider: s.semantic_provider, model: s.semantic_embedding_model,
    feature: "semantic-embedding", tokens, estimated_cost: estimatedCost,
    latency_ms: latencyMs, success, error_message: errorMessage?.slice(0,500) || null,
  }).then(() => undefined).catch(() => undefined);
}

async function checkBudget(admin: ReturnType<typeof createClient>, s: any) {
  const dailyLimit = Number(s.embedding_daily_request_limit || 0);
  const monthlyLimit = Number(s.embedding_monthly_request_limit || 0);
  if (!dailyLimit && !monthlyLimit) return;
  const startMonth = new Date(); startMonth.setUTCDate(1); startMonth.setUTCHours(0,0,0,0);
  const { data } = await admin.from("ai_usage").select("created_at").eq("feature","semantic-embedding").eq("success",true).gte("created_at", startMonth.toISOString()).limit(Math.max(monthlyLimit || 1,dailyLimit || 1) + 1);
  const monthCount = data?.length || 0;
  const today = new Date(); today.setUTCHours(0,0,0,0);
  const dayCount = (data || []).filter((r:any) => new Date(r.created_at) >= today).length;
  if (dailyLimit > 0 && dayCount >= dailyLimit) throw new Error("Daily embedding generation limit reached");
  if (monthlyLimit > 0 && monthCount >= monthlyLimit) throw new Error("Monthly embedding generation limit reached");
}

async function processQueue(admin: ReturnType<typeof createClient>, uid: string, limit: number) {
  const s = await settings(admin);
  if (!s.embedding_generation_enabled) return { processed: 0, ready: 0, failed: 0, paused: true };
  if (String(s.semantic_provider).toLowerCase() !== "openai") throw new Error(`Embedding provider '${s.semantic_provider}' is not implemented by this worker`);
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY is missing");
  if (Number(s.semantic_embedding_dimensions) !== 1536) throw new Error("Current semantic schema requires 1536-dimensional embeddings");
  await checkBudget(admin, s);

  const safeLimit = Math.max(1, Math.min(limit || 20, 100));
  const { data: jobs, error } = await admin.from("content_embeddings")
    .select("id,entity_type,entity_id,status,attempts,content_hash")
    .in("status", ["pending","stale","failed"])
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${new Date().toISOString()}`)
    .order("updated_at", { ascending: true }).limit(safeLimit);
  if (error) throw error;

  let ready = 0, failed = 0;
  for (const job of jobs || []) {
    await admin.from("content_embeddings").update({ status: "processing", attempts: Number(job.attempts || 0) + 1, updated_at: new Date().toISOString() }).eq("id", job.id);
    const started = Date.now();
    try {
      const { data: source, error: sourceErr } = await admin.rpc("build_semantic_source_text", { p_entity_type: job.entity_type, p_entity_id: job.entity_id });
      if (sourceErr || !source) throw new Error(sourceErr?.message || "No semantic source text");
      const { embedding, tokens } = await embeddingFor(String(source), String(s.semantic_embedding_model), apiKey);
      if (embedding.length !== 1536) throw new Error(`Embedding dimension mismatch: ${embedding.length}`);
      const { error: updateErr } = await admin.from("content_embeddings").update({
        embedding, embedding_provider: s.semantic_provider, embedding_model: s.semantic_embedding_model,
        embedding_dimensions: 1536, embedding_version: s.semantic_embedding_version,
        status: "ready", embedded_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        next_attempt_at: null, last_error: null,
      }).eq("id", job.id);
      if (updateErr) throw updateErr;
      await logUsage(admin, uid, s, tokens, true, undefined, Date.now()-started);
      ready++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const attempts = Number(job.attempts || 0) + 1;
      const delayMinutes = Math.min(24*60, Math.pow(2, Math.min(attempts,8)) * 5);
      await admin.from("content_embeddings").update({
        status: "failed", last_error: msg.slice(0,1000), updated_at: new Date().toISOString(),
        next_attempt_at: new Date(Date.now()+delayMinutes*60_000).toISOString(),
      }).eq("id", job.id);
      await logUsage(admin, uid, s, 0, false, msg, Date.now()-started);
      failed++;
    }
  }
  return { processed: (jobs || []).length, ready, failed, paused: false };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  try {
    const { user, admin } = clients(req);
    const { data: auth, error: authErr } = await user.auth.getUser();
    if (authErr || !auth.user) return json({ success:false,error:"Authentication required" }, 401);
    const uid = auth.user.id;
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = String(body.action || (req.method === "GET" ? "status" : "semantic-search"));
    const adminUser = await isAdmin(user, uid);

    if (action === "status") {
      if (!adminUser) return json({ success:false,error:"Admin access required" }, 403);
      const { data, error } = await user.rpc("get_semantic_engine_status");
      if (error) throw error;
      return json({ success:true, ...data });
    }
    if (action === "process") {
      if (!adminUser) return json({ success:false,error:"Admin access required" }, 403);
      return json({ success:true, ...(await processQueue(admin, uid, Number(body.limit || 20))) });
    }
    if (action === "queue-reindex") {
      if (!adminUser) return json({ success:false,error:"Admin access required" }, 403);
      const type = body.entityType ? String(body.entityType).toLowerCase() : null;
      if (type && !ALLOWED_TYPES.has(type)) return json({ success:false,error:"Unsupported entity type" }, 400);
      const { data, error } = await user.rpc("admin_queue_semantic_reindex", { p_entity_type: type, p_status: body.status || null });
      if (error) throw error;
      return json({ success:true, queued:Number(data || 0) });
    }
    if (action === "semantic-search") {
      const s = await settings(admin);
      if (!s.semantic_recommendations_enabled) return json({ success:true, semanticEnabled:false, items:[] });
      if (String(s.semantic_provider).toLowerCase() !== "openai") return json({ success:true, semanticEnabled:true, degraded:true, items:[], reason:"provider_not_supported" });
      const q = String(body.query || "").trim().slice(0,2000);
      if (q.length < 2) return json({ success:false,error:"Query is too short" }, 400);
      const types = Array.isArray(body.entityTypes) ? body.entityTypes.map((x:any)=>String(x).toLowerCase()).filter((x:string)=>ALLOWED_TYPES.has(x)).slice(0,10) : null;
      const apiKey = Deno.env.get("OPENAI_API_KEY");
      if (!apiKey) return json({ success:true, semanticEnabled:true, degraded:true, items:[], reason:"provider_not_configured" });
      try {
        await checkBudget(admin, s);
        const started = Date.now();
        const { embedding, tokens } = await embeddingFor(q, String(s.semantic_embedding_model), apiKey);
        if (embedding.length !== 1536) throw new Error(`Embedding dimension mismatch: ${embedding.length}`);
        const { data, error } = await user.rpc("match_semantic_entities", {
          p_query_embedding: embedding,
          p_entity_types: types,
          p_match_threshold: body.minSimilarity ?? null,
          p_match_count: Math.max(1,Math.min(Number(body.limit || s.semantic_candidate_limit || 40),100)),
        });
        if (error) throw error;
        await logUsage(admin, uid, s, tokens, true, undefined, Date.now()-started);
        return json({ success:true, semanticEnabled:true, items:data || [], model:s.semantic_embedding_model });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await logUsage(admin, uid, s, 0, false, msg);
        return json({ success:true, semanticEnabled:true, degraded:true, items:[], reason:"semantic_fallback" });
      }
    }
    return json({ success:false,error:"Unknown action" }, 400);
  } catch (e) {
    console.error("semantic-embeddings", e instanceof Error ? e.message : String(e));
    return json({ success:false,error:"Semantic service unavailable" }, 500);
  }
});