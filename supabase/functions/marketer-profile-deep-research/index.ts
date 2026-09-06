import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const db = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const allowedRoles = new Set(["super_admin", "sales_team_manager", "sales_marketing_admin", "advertising_admin"]);
const allowedProfileHosts = new Set(["tiktok.com", "linkedin.com", "fiverr.com", "upwork.com", "youtube.com", "youtu.be", "instagram.com", "facebook.com", "x.com", "twitter.com", "github.com"]);

type SearchResult = { title: string; link: string; snippet: string; source: string; query: string };

const platformFor = (raw: string) => {
  try {
    const h = new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
    if (h.includes("tiktok.com")) return "TikTok";
    if (h.includes("linkedin.com")) return "LinkedIn";
    if (h.includes("fiverr.com")) return "Fiverr";
    if (h.includes("upwork.com")) return "Upwork";
    if (h.includes("instagram.com")) return "Instagram";
    if (h.includes("youtube.com") || h === "youtu.be") return "YouTube";
    if (h.includes("facebook.com")) return "Facebook";
    if (h === "x.com" || h.includes("twitter.com")) return "X";
    if (h.includes("github.com")) return "GitHub";
    return "Other";
  } catch { return "Other"; }
};

const validSubmittedProfileUrl = (value: string) => {
  try {
    const u = new URL(value);
    if (!/^https?:$/.test(u.protocol)) return false;
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    return [...allowedProfileHosts].some((h) => host === h || host.endsWith(`.${h}`));
  } catch { return false; }
};

const validPublicResultUrl = (value: string) => {
  try {
    const u = new URL(value);
    return /^https?:$/.test(u.protocol) && !!u.hostname;
  } catch { return false; }
};
const quote = (value: string) => `"${value.replace(/["\n\r]/g, " ").slice(0, 160)}"`;

async function serperSearch(q: string): Promise<{ results: SearchResult[]; error?: { code: string; message: string } }> {
  const key = Deno.env.get("SERPER_API_KEY");
  if (!key) return { results: [], error: { code: "SERPER_NOT_CONFIGURED", message: "Web search provider is not configured." } };
  try {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q, num: 10 }),
    });
    const text = await response.text();
    let payload: any = null;
    try { payload = JSON.parse(text); } catch { payload = null; }
    if (response.status === 429) return { results: [], error: { code: "SERPER_RATE_LIMIT", message: "Web search provider rate limit reached." } };
    if (!response.ok) {
      console.error("[marketer-profile-deep-research] Serper HTTP failure", response.status);
      return { results: [], error: { code: "SERPER_API_ERROR", message: "Web search provider failed." } };
    }
    const results = Array.isArray(payload?.organic) ? payload.organic.map((item: any) => ({
      title: String(item.title || "").slice(0, 300),
      link: String(item.link || ""),
      snippet: String(item.snippet || "").slice(0, 800),
      source: "Serper/Google",
      query: q,
    })).filter((item: SearchResult) => validPublicResultUrl(item.link)) : [];
    return { results };
  } catch (error) {
    console.error("[marketer-profile-deep-research] Serper exception", error instanceof Error ? error.message : String(error));
    return { results: [], error: { code: "SERPER_API_ERROR", message: "Web search provider failed." } };
  }
}

function buildQueries(profileUrl: string, platform: string, applicant: { username?: string | null; full_name?: string | null; profession?: string | null }) {
  const url = new URL(profileUrl);
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const handle = url.pathname.split("/").filter(Boolean).pop()?.replace(/^@/, "") || applicant.username || "";
  const displayName = String(applicant.full_name || "").trim();
  const profession = String(applicant.profession || "").trim();
  const site = host === "youtu.be" ? "youtube.com" : host;
  return [...new Set([
    quote(profileUrl),
    `site:${site} ${quote(`@${handle}`)}`,
    `site:${site} ${quote(handle)}`,
    `${quote(handle)} ${quote(platform)}`,
    displayName ? `${quote(displayName)} ${quote(platform)}` : "",
    displayName && profession ? `${quote(displayName)} ${quote(profession)} ${quote(platform)}` : "",
  ].filter(Boolean))].slice(0, 6);
}

function safeParse(content: string) {
  const clean = String(content || "").replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  try { return JSON.parse(clean); } catch {
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start >= 0 && end > start) { try { return JSON.parse(clean.slice(start, end + 1)); } catch { /* invalid */ } }
    return null;
  }
}

const evidenceStatus = ["VERIFIED FACT", "OBSERVED PUBLIC DATA", "CALCULATED", "ESTIMATE", "UNKNOWN"] as const;
function normalizeReport(raw: any, evidence: any) {
  const arr = (v: unknown) => Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean).slice(0, 30) : [];
  const score = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100 ? Math.round(v) : null;
  const status = (v: unknown, allowed: string[], fallback: string) => allowed.includes(String(v)) ? String(v) : fallback;
  const classificationItems = (v: unknown) => Array.isArray(v) ? v.map((item) => {
    const classification = typeof item === "object" && item ? String((item as any).classification || "UNKNOWN") : "UNKNOWN";
    const detail = typeof item === "object" && item ? String((item as any).detail || "") : String(item);
    return { classification: evidenceStatus.includes(classification as any) ? classification : "UNKNOWN", detail };
  }).filter((x) => x.detail).slice(0, 30) : [];
  const profileHealthScore = score(raw?.profile_health?.score);
  const authenticityScore = score(raw?.audience_authenticity?.score);
  const botScore = score(raw?.bot_risk?.score);
  const identityScore = score(raw?.identity_consistency?.score);
  return {
    summary: String(raw?.summary || "").slice(0, 2000) || "Insufficient evidence for a reliable summary.",
    identity_consistency: { status: status(raw?.identity_consistency?.status, ["consistent", "mixed", "unclear"], "unclear"), score: identityScore, evidence: arr(raw?.identity_consistency?.evidence) },
    profile_health: { score: profileHealthScore, status: profileHealthScore === null ? "unknown" : status(raw?.profile_health?.status, ["excellent", "good", "fair", "poor", "unknown"], "unknown") },
    audience_authenticity: { score: authenticityScore, status: authenticityScore === null ? "unknown" : status(raw?.audience_authenticity?.status, ["high", "medium", "low", "unknown"], "unknown"), confidence: score(raw?.audience_authenticity?.confidence) ?? 0 },
    bot_risk: { score: botScore, status: botScore === null ? "unknown" : status(raw?.bot_risk?.status, ["low", "medium", "high", "unknown"], "unknown"), confidence: score(raw?.bot_risk?.confidence) ?? 0 },
    activity: { status: status(raw?.activity?.status, ["active", "inactive", "unknown"], "unknown"), evidence: arr(raw?.activity?.evidence) },
    platform_consistency: { status: status(raw?.platform_consistency?.status, ["consistent", "mixed", "unclear"], "unclear"), evidence: arr(raw?.platform_consistency?.evidence) },
    positive_signals: arr(raw?.positive_signals),
    risk_signals: arr(raw?.risk_signals),
    verified_facts: classificationItems(raw?.verified_facts),
    observed_data: classificationItems(raw?.observed_data),
    calculated_metrics: classificationItems(raw?.calculated_metrics),
    unknowns: arr(raw?.unknowns),
    limitations: arr(raw?.limitations),
    recommendation: status(raw?.recommendation, ["approve", "request_additional_verification", "manual_review", "reject"], "manual_review"),
    recommendation_reason: String(raw?.recommendation_reason || "Insufficient evidence for an automatic determination.").slice(0, 1500),
    _evidence_meta: { search_result_count: evidence.search_results.length, source_domains: [...new Set(evidence.search_results.map((x: SearchResult) => { try { return new URL(x.link).hostname.replace(/^www\./, ""); } catch { return "unknown"; } }))].slice(0, 30) },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json(null);
  if (req.method !== "POST") return json({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } }, 405);
  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized." } }, 401);
    const client = db();
    const { data: { user }, error: authError } = await client.auth.getUser(authorization.slice(7));
    if (authError || !user) return json({ success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized." } }, 401);
    const { data: admin, error: adminError } = await client.from("users").select("id,is_admin,admin_status,admin_role").eq("id", user.id).single();
    if (adminError || !admin?.is_admin || String(admin.admin_status || "").toLowerCase() !== "active" || !allowedRoles.has(String(admin.admin_role || ""))) return json({ success: false, error: { code: "FORBIDDEN", message: "Sales Team administration permission required." } }, 403);

    const body = await req.json().catch(() => ({}));
    const applicantId = String(body?.applicant_id || "").trim();
    const requestedUrl = body?.profile_url ? String(body.profile_url).trim() : null;
    if (!/^[0-9a-f-]{36}$/i.test(applicantId)) return json({ success: false, error: { code: "INVALID_APPLICANT_ID", message: "A valid applicant ID is required." } }, 400);

    const { data: applicant, error: applicantError } = await client.from("users").select("id,email,full_name,username,profession,social_media_links,marketer_social_analysis,marketer_deep_research").eq("id", applicantId).single();
    if (applicantError || !applicant) return json({ success: false, error: { code: "APPLICANT_NOT_FOUND", message: "Applicant not found." } }, 404);
    const submittedLinks = Array.isArray(applicant.social_media_links) ? applicant.social_media_links.map((v: unknown) => String(v).trim()).filter(validSubmittedProfileUrl) : [];
    const targets = [...new Set(requestedUrl ? [requestedUrl] : submittedLinks)];
    if (!targets.length) return json({ success: false, error: { code: "MISSING_PROFILE_URL", message: "No valid submitted profile links were found." } }, 400);
    if (requestedUrl && !submittedLinks.includes(requestedUrl)) return json({ success: false, error: { code: "PROFILE_NOT_SUBMITTED", message: "The requested profile URL is not one of the applicant's submitted profiles." } }, 400);

    const existingAnalysis = Array.isArray(applicant.marketer_social_analysis) ? applicant.marketer_social_analysis : [];
    const previousHistory = Array.isArray(applicant.marketer_deep_research) ? applicant.marketer_deep_research : [];
    const reports: any[] = [];
    const errors: any[] = [];

    for (const profileUrl of targets.slice(0, 10)) {
      const platform = platformFor(profileUrl);
      const basic = existingAnalysis.find((x: any) => x?.profile_url === profileUrl) || {};
      const queries = buildQueries(profileUrl, platform, applicant);
      const searchResults: SearchResult[] = [];
      let serperError: { code: string; message: string } | undefined;
      for (const query of queries) {
        const result = await serperSearch(query);
        if (result.error) {
          serperError = result.error;
          if (result.error.code === "SERPER_NOT_CONFIGURED" || result.error.code === "SERPER_RATE_LIMIT") break;
          continue;
        }
        searchResults.push(...result.results);
      }

      const seen = new Set<string>();
      const normalized = searchResults.filter((item) => {
        const canonical = item.link.replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
        if (!canonical || seen.has(canonical)) return false;
        seen.add(canonical);
        return true;
      }).slice(0, 30);

      const evidence = {
        submitted_profile: { url: profileUrl, platform, status: "submitted by applicant" },
        existing_profile_analysis: {
          profile_title: basic.profile_title ?? null, profile_description: basic.profile_description ?? null,
          followers: basic.followers ?? null, following: basic.following ?? null, likes: basic.likes ?? null,
          content_count: basic.content_count ?? null, verified_indicator: basic.verified_indicator ?? null,
          authenticity_score: basic.authenticity_score ?? null, risk_level: basic.risk_level ?? "UNKNOWN",
          confidence_score: basic.confidence_score ?? null, signals: Array.isArray(basic.signals) ? basic.signals.slice(0, 20) : [], analyzed_at: basic.analyzed_at ?? null,
        },
        search_results: normalized.map((item) => ({ title: item.title, link: item.link, snippet: item.snippet, source: item.source, query: item.query })),
        search_queries: queries,
        search_provider: "Serper/Google",
        search_error: serperError?.code || null,
      };

      if (serperError) errors.push({ profile_url: profileUrl, stage: "search", error: serperError });

      const prompt = `You are analyzing a marketer application for DRIGHT.

Use ONLY the supplied evidence. Do not invent follower counts, account age, engagement, identity information, verification status, or other metrics. If information is unavailable, return UNKNOWN. Clearly distinguish facts from observations, calculations, and estimates. Do not state that an account is definitely fake, a bot, or genuine. Provide a risk assessment rather than an absolute determination.

Evidence classification: VERIFIED FACT = directly supported by a reliable source. OBSERVED PUBLIC DATA = visible in a public search result/page but not independently verified. CALCULATED = mathematically derived only from supplied values. ESTIMATE = an assessment based on evidence and never a fact. UNKNOWN = cannot safely be established.

Source quality priority: official platform profile > official platform/API data > authoritative external source > multiple independent matching sources > search-result metadata > single unverified third-party page.

For identity matching, do not merge people merely because usernames are similar. Compare exact URL/handle, display name, profession, bio, linked sites, platform relationships, and other supplied public context. If identity cannot be established, use unclear/UNKNOWN.

Profile health is distinct from audience authenticity. Do not claim 100% real followers, definitely genuine, or definitely a bot. If usable audience metrics are absent, audience_authenticity.score must be null and status unknown. Bot risk must be evidence-based and must not rely on follower count alone.

Return STRICT JSON only using exactly this structure:
{
  "summary": "...",
  "identity_consistency": {"status": "consistent | mixed | unclear", "score": 0, "evidence": []},
  "profile_health": {"score": 0, "status": "excellent | good | fair | poor | unknown"},
  "audience_authenticity": {"score": null, "status": "high | medium | low | unknown", "confidence": 0},
  "bot_risk": {"score": null, "status": "low | medium | high | unknown", "confidence": 0},
  "activity": {"status": "active | inactive | unknown", "evidence": []},
  "platform_consistency": {"status": "consistent | mixed | unclear", "evidence": []},
  "positive_signals": [], "risk_signals": [],
  "verified_facts": [{"classification":"VERIFIED FACT","detail":"..."}],
  "observed_data": [{"classification":"OBSERVED PUBLIC DATA","detail":"..."}],
  "calculated_metrics": [{"classification":"CALCULATED","detail":"..."}],
  "unknowns": [], "limitations": [],
  "recommendation": "approve | request_additional_verification | manual_review | reject",
  "recommendation_reason": "..."
}

Numeric scores may be 0-100 only when supported by supplied evidence; otherwise use null. Confidence is 0-100 and must reflect evidence quality, not certainty.

Applicant public context: ${JSON.stringify({ full_name: applicant.full_name, username: applicant.username, profession: applicant.profession })}
Supplied evidence: ${JSON.stringify(evidence)}`;

      let reportStatus = "completed";
      let research: any;
      let provider = "ai-proxy";
      let model: string | null = null;
      try {
        const aiUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-proxy`;
        const aiResponse = await fetch(aiUrl, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": authorization, "apikey": Deno.env.get("SUPABASE_ANON_KEY") || "" }, body: JSON.stringify({ feature: "generate-text", prompt, useCache: false }) });
        const aiText = await aiResponse.text();
        let aiJson: any = null;
        try { aiJson = JSON.parse(aiText); } catch { /* invalid provider response */ }
        if (!aiResponse.ok || !aiJson?.success) {
          console.error("[marketer-profile-deep-research] AI proxy failure", aiResponse.status, aiJson?.error || "unknown");
          throw Object.assign(new Error("AI service failed."), { code: aiResponse.status === 429 ? "AI_RATE_LIMIT" : "AI_ERROR" });
        }
        provider = String(aiJson.provider || "ai-proxy");
        model = aiJson.model ? String(aiJson.model) : null;
        const parsed = safeParse(String(aiJson.content || ""));
        if (!parsed) throw Object.assign(new Error("AI returned invalid JSON."), { code: "INVALID_AI_JSON" });
        research = normalizeReport(parsed, evidence);
      } catch (error) {
        reportStatus = "failed";
        const code = (error as any)?.code || "AI_ERROR";
        const message = code === "INVALID_AI_JSON" ? "AI returned an invalid research report." : "AI analysis could not be completed.";
        errors.push({ profile_url: profileUrl, stage: "ai", error: { code, message } });
        research = normalizeReport({
          summary: "Deep Research could not complete for this profile.",
          profile_health: { score: null, status: "unknown" }, audience_authenticity: { score: null, status: "unknown", confidence: 0 },
          bot_risk: { score: null, status: "unknown", confidence: 0 }, identity_consistency: { status: "unclear", score: null, evidence: [] },
          activity: { status: "unknown", evidence: [] }, platform_consistency: { status: "unclear", evidence: [] },
          verified_facts: [], observed_data: [], calculated_metrics: [], unknowns: [message], limitations: ["Automated AI analysis did not complete."],
          recommendation: "manual_review", recommendation_reason: "Manual review is required because the AI analysis did not complete.",
        }, evidence);
      }

      const report = { profile_url: profileUrl, platform, status: reportStatus, provider, model, research, search_evidence: normalized, search_queries: queries, requested_at: new Date().toISOString() };
      reports.push(report);

      const { error: saveError } = await client.from("marketer_profile_deep_research").insert({ applicant_id: applicantId, profile_url: profileUrl, platform, status: reportStatus, research: report, requested_by: user.id });
      if (saveError) {
        console.error("[marketer-profile-deep-research] database save failure", saveError.message);
        errors.push({ profile_url: profileUrl, stage: "database", error: { code: "DATABASE_SAVE_ERROR", message: "Research report could not be saved." } });
      }
    }

    const merged = [...reports, ...previousHistory].slice(0, 50);
    const { error: historyError } = await client.from("users").update({ marketer_deep_research: merged, updated_at: new Date().toISOString() }).eq("id", applicantId);
    if (historyError) {
      console.error("[marketer-profile-deep-research] users history save failure", historyError.message);
      errors.push({ stage: "database_history", error: { code: "DATABASE_SAVE_ERROR", message: "Research history could not be updated." } });
    }

    return json({ success: reports.some((r) => r.status === "completed"), reports, errors: errors.length ? errors : undefined });
  } catch (error) {
    console.error("[marketer-profile-deep-research] unhandled failure", error instanceof Error ? error.message : String(error));
    return json({ success: false, error: { code: "DEEP_RESEARCH_ERROR", message: "Deep Research could not be completed." } }, 500);
  }
});