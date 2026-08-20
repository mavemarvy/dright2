import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function getSupabaseClient(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (authHeader) {
    return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  }
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
}

function getAlgoliaConfig() {
  const appId = Deno.env.get("ALGOLIA_APP_ID");
  const adminKey = Deno.env.get("ALGOLIA_ADMIN_API_KEY");
  if (!appId || !adminKey) throw new Error("Missing Algolia configuration");
  return { appId, adminKey, searchUrl: `https://${appId}-dsn.algolia.net/1` };
}

async function algoliaRequest(config: ReturnType<typeof getAlgoliaConfig>, method: string, path: string, body?: unknown) {
  const url = `${config.searchUrl}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      "X-Algolia-Application-Id": config.appId,
      "X-Algolia-API-Key": config.adminKey,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Algolia API error (${res.status}): ${err.slice(0, 300)}`);
  }

  return res.json();
}

const INDEX_MAP: Record<string, string> = {
  products: "products",
  services: "services",
  jobs: "jobs",
  courses: "courses",
  affiliates: "affiliates",
  users: "users",
  categories: "categories",
  marketplace_ads: "marketplace_ads",
  support_articles: "support_articles",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = getSupabaseClient(req);
    const body = await req.json();
    const action = body.action || "sync";

    if (action === "sync-record") {
      const { tableName, recordId, record, operation = "upsert" } = body;
      if (!tableName || !recordId) throw new Error("Missing tableName or recordId");

      const indexName = INDEX_MAP[tableName];
      if (!indexName) throw new Error(`No Algolia index mapped for table: ${tableName}`);

      const config = getAlgoliaConfig();

      if (operation === "delete") {
        await algoliaRequest(config, "DELETE", `/indexes/${indexName}/${recordId}`);
        await supabase.from("algolia_sync_state").upsert({
          table_name: tableName, record_id: recordId, index_name: indexName,
          sync_status: "deleted", last_synced_at: new Date().toISOString(),
        }, { onConflict: "table_name,record_id" });
        return new Response(JSON.stringify({ success: true, operation: "delete" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const objectToIndex = { objectID: recordId, ...record, _table: tableName, _synced_at: new Date().toISOString() };
      await algoliaRequest(config, "POST", `/indexes/${indexName}/${recordId}`, objectToIndex);

      await supabase.from("algolia_sync_state").upsert({
        table_name: tableName, record_id: recordId, index_name: indexName,
        sync_status: "synced", last_synced_at: new Date().toISOString(),
        object_data: record,
      }, { onConflict: "table_name,record_id" });

      return new Response(JSON.stringify({ success: true, operation: "upsert", indexName }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "search") {
      const { indexName, query = "", filters = "", page = 0, hitsPerPage = 20, facets = [] } = body;
      if (!indexName) throw new Error("Missing indexName");

      const config = getAlgoliaConfig();
      const result = await algoliaRequest(config, "POST", `/indexes/${indexName}/query`, {
        query, hitsPerPage: Number(hitsPerPage), page: Number(page),
        facets: facets.length > 0 ? facets : undefined,
        facetFilters: filters || undefined,
      });

      return new Response(JSON.stringify({ success: true, ...result }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "multi-search") {
      const { queries } = body;
      if (!queries || !Array.isArray(queries)) throw new Error("Missing queries array");

      const config = getAlgoliaConfig();
      const result = await algoliaRequest(config, "POST", "/indexes/*/queries", { requests: queries });

      return new Response(JSON.stringify({ success: true, ...result }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "create-index") {
      const { indexName } = body;
      if (!indexName) throw new Error("Missing indexName");

      const config = getAlgoliaConfig();
      await algoliaRequest(config, "PUT", `/indexes/${indexName}`, {
        searchableAttributes: ["name", "title", "description", "tags", "category"],
        attributesForFaceting: ["category", "price", "location", "type", "status"],
        customRanking: ["desc(created_at)", "desc(popularity)"],
      });

      return new Response(JSON.stringify({ success: true, indexName }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
