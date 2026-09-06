import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json" },
});

const db = () => createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const platformFor = (url: URL) => {
  const h = url.hostname.toLowerCase().replace(/^www\./, "");
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
};

const strip = (s: string) => s.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const meta = (html: string, key: string) => {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i");
  const reverse = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i");
  return (html.match(re)?.[1] || html.match(reverse)?.[1] || "").trim();
};
const first = (html: string, patterns: RegExp[]) => {
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
};
const num = (raw: string | null) => {
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, "").trim();
  const m = cleaned.match(/([0-9]+(?:\.[0-9]+)?)\s*([KMB])?/i);
  if (!m) return null;
  const n = Number(m[1]);
  const mult = m[2]?.toUpperCase() === "K" ? 1e3 : m[2]?.toUpperCase() === "M" ? 1e6 : m[2]?.toUpperCase() === "B" ? 1e9 : 1;
  return Number.isFinite(n) ? Math.round(n * mult) : null;
};
const metric = (text: string, words: string[]) => {
  const escaped = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return num(first(text, [
    new RegExp(`(?:^|[^0-9])([0-9][0-9,.]*\\s*[KMB]?)\\s*(?:${escaped})\\b`, "i"),
    new RegExp(`(?:${escaped})\\s*[:=]?\\s*([0-9][0-9,.]*\\s*[KMB]?)`, "i"),
  ]));
};

async function analyzeUrl(rawUrl: string) {
  let url: URL;
  try { url = new URL(rawUrl); } catch { return { profile_url: rawUrl, platform: "Other", status: "invalid_url", error: "Invalid URL" }; }
  if (url.protocol !== "https:") return { profile_url: rawUrl, platform: platformFor(url), status: "invalid_url", error: "HTTPS is required" };

  const platform = platformFor(url);
  const headers = {
    "User-Agent": "Mozilla/5.0 (compatible; DRIGHT-Marketer-Verification/1.0; +https://dright.com)",
    "Accept": "text/html,application/xhtml+xml",
  };

  let response: Response;
  try {
    response = await fetch(url.toString(), { headers, redirect: "follow" });
  } catch (e) {
    return { profile_url: rawUrl, platform, status: "fetch_failed", error: e instanceof Error ? e.message : "Could not fetch profile" };
  }
  const finalUrl = response.url || url.toString();
  if (!response.ok) return { profile_url: rawUrl, final_url: finalUrl, platform, status: "blocked_or_unavailable", http_status: response.status, error: `Profile returned HTTP ${response.status}` };

  const html = (await response.text()).slice(0, 1_500_000);
  const text = strip(html);
  const title = meta(html, "og:title") || meta(html, "twitter:title") || first(html, [/<title[^>]*>([\s\S]*?)<\/title>/i]);
  const description = meta(html, "og:description") || meta(html, "description") || meta(html, "twitter:description");
  const canonical = first(html, [/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i, /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i]);
  const followers = metric(text, ["followers", "follower"]);
  const following = metric(text, ["following", "following"]);
  const likes = metric(text, ["likes", "like"]);
  const videos = metric(text, ["videos", "video", "posts", "post", "gigs", "jobs", "projects"]);
  const verified = /verified|verification badge|verified account/i.test(text) && !/unverified/i.test(text);

  const available = [followers, following, likes, videos].filter(v => v !== null).length;
  let authenticityScore = 50;
  const signals: string[] = [];
  if (title || description) { authenticityScore += 10; signals.push("public profile metadata found"); }
  if (followers !== null) { authenticityScore += 10; signals.push("follower count found"); }
  if (videos !== null) { authenticityScore += 8; signals.push("content/activity count found"); }
  if (verified) { authenticityScore += 12; signals.push("verification indicator found"); }
  if (followers !== null && following !== null) {
    if (following > followers * 3 && following > 1000) { authenticityScore -= 15; signals.push("unusually high following-to-follower ratio"); }
    else if (followers > following) { authenticityScore += 5; signals.push("follower/following ratio is consistent with an established profile"); }
  }
  if (available === 0) { authenticityScore = 0; signals.push("platform did not expose usable public metrics"); }
  authenticityScore = Math.max(0, Math.min(100, authenticityScore));

  let risk: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN" = "UNKNOWN";
  if (available > 0) risk = authenticityScore >= 75 ? "LOW" : authenticityScore >= 50 ? "MEDIUM" : "HIGH";
  const confidence = Math.min(95, 35 + available * 12 + (title || description ? 10 : 0) + (verified ? 10 : 0));

  return {
    profile_url: rawUrl,
    final_url: finalUrl,
    canonical_url: canonical,
    platform,
    status: "analyzed",
    profile_title: title ? strip(title) : null,
    profile_description: description || null,
    followers,
    following,
    likes,
    content_count: videos,
    verified_indicator: verified,
    authenticity_score: authenticityScore,
    risk_level: risk,
    confidence_score: confidence,
    signals,
    disclaimer: "This is an automated risk estimate based on publicly available signals. It does not prove that followers are real or that an account is operated by a bot.",
    analyzed_at: new Date().toISOString(),
  };
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return json(null);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const client = db();
    const { data: { user }, error: authError } = await client.auth.getUser(auth.slice(7));
    if (authError || !user) return json({ error: "Unauthorized" }, 401);
    const body = await req.json().catch(() => ({}));
    const applicantId = String(body.applicant_id || user.id);
    if (applicantId !== user.id) {
      const { data: admin } = await client.from("users").select("is_admin,admin_status,admin_role").eq("id", user.id).single();
      const roles = new Set(["super_admin", "sales_team_manager", "sales_marketing_admin", "advertising_admin"]);
      if (!admin?.is_admin || String(admin.admin_status || "").toLowerCase() !== "active" || !roles.has(String(admin.admin_role || ""))) return json({ error: "Not allowed to analyze another applicant" }, 403);
    }

    const { data: applicant, error: applicantError } = await client.from("users").select("id,social_media_links").eq("id", applicantId).single();
    if (applicantError || !applicant) return json({ error: "Applicant not found" }, 404);
    const links = Array.isArray(body.links) ? body.links.map((v: unknown) => String(v).trim()).filter(Boolean) : Array.isArray(applicant.social_media_links) ? applicant.social_media_links.map((v: unknown) => String(v).trim()).filter(Boolean) : [];
    if (!links.length) return json({ error: "No profile links to analyze" }, 400);
    if (links.length > 10) return json({ error: "Maximum 10 profile links" }, 400);

    const analyses = [];
    for (const link of links) analyses.push(await analyzeUrl(link));
    const now = new Date().toISOString();
    const { error: updateError } = await client.from("users").update({ marketer_social_analysis: analyses, updated_at: now }).eq("id", applicantId);
    if (updateError) throw updateError;
    const snapshots = analyses.map((a: any) => ({ applicant_id: applicantId, profile_url: a.profile_url, platform: a.platform, analysis: a, analyzed_at: now }));
    const { error: snapshotError } = await client.from("marketer_social_analysis_snapshots").insert(snapshots);
    if (snapshotError) throw snapshotError;
    return json({ success: true, applicant_id: applicantId, analyses });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Profile analysis failed" }, 400);
  }
});
