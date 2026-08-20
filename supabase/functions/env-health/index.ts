import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface VarSpec {
  key: string;
  label: string;
  category: string;
  serverOnly: boolean;
  description: string;
  envKey?: string;
  altKeys?: string[];
}

const SERVER_VARS: VarSpec[] = [
  { key: "SUPABASE_URL", label: "Supabase URL", category: "Supabase", serverOnly: false, description: "Supabase project URL" },
  { key: "SUPABASE_ANON_KEY", label: "Supabase Anon Key", category: "Supabase", serverOnly: false, description: "Public anon key" },
  { key: "SUPABASE_SERVICE_ROLE_KEY", label: "Supabase Service Role Key", category: "Supabase", serverOnly: true, description: "Server-only privileged key" },
  { key: "SUPABASE_DB_URL", label: "Supabase DB URL", category: "Supabase", serverOnly: true, description: "Direct Postgres connection" },
  { key: "SUPABASE_PUBLISHABLE_KEYS", label: "Supabase Publishable Keys", category: "Supabase", serverOnly: true, description: "Publishable key bundle" },
  { key: "SUPABASE_SECRET_KEYS", label: "Supabase Secret Keys", category: "Supabase", serverOnly: true, description: "Secret key bundle" },
  { key: "SUPABASE_JWKS", label: "Supabase JWKS", category: "Supabase", serverOnly: true, description: "JWT verification key set" },
  { key: "GROQ_API_KEY", label: "Groq API Key", category: "AI", serverOnly: true, description: "Groq AI chat and moderation" },
  { key: "GEMINI_API_KEY", label: "Gemini API Key", category: "AI", serverOnly: true, description: "Gemini AI fallback" },
  { key: "OPENAI_API_KEY", label: "OpenAI API Key", category: "AI", serverOnly: true, description: "DALL-E, Whisper, GPT-4o" },
  { key: "RESEND_API_KEY", label: "Resend API Key", category: "Email", serverOnly: true, description: "Transactional email delivery" },
  { key: "RESEND_FROM_EMAIL", label: "Resend From Email", category: "Email", serverOnly: true, description: "Sender address for transactional emails" },
  { key: "APP_URL", label: "App URL", category: "Email", serverOnly: true, description: "Application base URL for email links" },
  { key: "FIREBASE_API_KEY", label: "Firebase API Key", category: "Push", serverOnly: false, description: "FCM push notifications" },
  { key: "FIREBASE_AUTH_DOMAIN", label: "Firebase Auth Domain", category: "Push", serverOnly: false, description: "Firebase auth domain" },
  { key: "FIREBASE_PROJECT_ID", label: "Firebase Project ID", category: "Push", serverOnly: false, description: "Firebase project ID" },
  { key: "FIREBASE_STORAGE_BUCKET", label: "Firebase Storage Bucket", category: "Push", serverOnly: false, description: "Firebase storage bucket" },
  { key: "FIREBASE_MESSAGING_SENDER_ID", label: "Firebase Messaging Sender ID", category: "Push", serverOnly: false, description: "FCM sender ID" },
  { key: "FIREBASE_APP_ID", label: "Firebase App ID", category: "Push", serverOnly: false, description: "Firebase app identifier" },
  { key: "FIREBASE_MEASUREMENT_ID", label: "Firebase Measurement ID", category: "Push", serverOnly: false, description: "Google Analytics measurement ID", envKey: "measurementId" },
  { key: "CLOUDINARY_CLOUD_NAME", label: "Cloudinary Cloud Name", category: "Cloudinary", serverOnly: false, description: "Image upload and URL building" },
  { key: "CLOUDINARY_API_KEY", label: "Cloudinary API Key", category: "Cloudinary", serverOnly: true, description: "Signed uploads" },
  { key: "CLOUDINARY_API_SECRET", label: "Cloudinary API Secret", category: "Cloudinary", serverOnly: true, description: "Signing upload requests" },
  { key: "ALGOLIA_APP_ID", label: "Algolia App ID", category: "Algolia", serverOnly: false, description: "Search index management" },
  { key: "ALGOLIA_SEARCH_API_KEY", label: "Algolia Search API Key", category: "Algolia", serverOnly: false, description: "Client-side search queries" },
  { key: "ALGOLIA_ADMIN_API_KEY", label: "Algolia Admin API Key", category: "Algolia", serverOnly: true, description: "Index creation and sync" },
  { key: "TURNSTILE_SECRET", label: "Turnstile Secret", category: "Cloudflare", serverOnly: true, description: "Server-side CAPTCHA verification secret for siteverify", envKey: "TURNSTILE_SECRET", altKeys: ["TURNSTILE_SECRET_KEY"] },
];

function getSupabaseClient(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (authHeader) {
    return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  }
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
}

async function checkAdmin(req: Request): Promise<boolean> {
  try {
    const supabase = getSupabaseClient(req);
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return false;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return false;
    const { data } = await supabase.from("users").select("is_admin, admin_status").eq("id", user.id).single();
    return Boolean(data?.is_admin && data?.admin_status === "active");
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const isAdmin = await checkAdmin(req);
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const results = SERVER_VARS.map((spec) => {
      const altKeys = spec.altKeys || [];
      const envName = spec.envKey || spec.key;
      const value = Deno.env.get(envName) || altKeys.map(k => Deno.env.get(k)).find(v => v);
      return {
        key: spec.key,
        label: spec.label,
        category: spec.category,
        serverOnly: spec.serverOnly,
        description: spec.description,
        present: Boolean(value),
      };
    });

    const categories = [...new Set(results.map((r) => r.category))];
    const summary = categories.map((cat) => {
      const vars = results.filter((r) => r.category === cat);
      return {
        category: cat,
        total: vars.length,
        configured: vars.filter((v) => v.present).length,
        missing: vars.filter((v) => !v.present).length,
        healthy: vars.every((v) => v.present),
      };
    });

    return new Response(JSON.stringify({ variables: results, summary, timestamp: new Date().toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
