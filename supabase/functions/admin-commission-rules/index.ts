import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const ALLOWED_ROLES = new Set([
  "super_admin",
  "finance_admin",
  "finance_manager",
  "sales_marketing_admin",
  "advertising_admin",
  "sales_team_manager",
]);

const SOURCES = new Set([
  "affiliate",
  "sales_team",
  "advertiser",
  "pro_advertiser",
  "super_advertiser",
  "partnership",
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function client() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function auth(req: Request) {
  const header = req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) throw new Error("Unauthorized");

  const supabase = client();
  const { data: { user }, error } = await supabase.auth.getUser(header.slice(7));
  if (error || !user) throw new Error("Unauthorized");

  const { data: profile } = await supabase
    .from("users")
    .select("id,is_admin,admin_status,admin_role")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin || profile.admin_status !== "active" || !ALLOWED_ROLES.has(profile.admin_role)) {
    throw new Error("Forbidden");
  }

  return { supabase, user };
}

function normalizeSourceLevel(sourceType: string, raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  const value = String(raw).trim();

  if (sourceType === "sales_team") {
    const match = value.match(/^(?:mkt\s*)?l?([3-5])$/i);
    if (!match) throw new Error("Sales Team source level must be Mkt L3, Mkt L4, or Mkt L5");
    return `Mkt L${match[1]}`;
  }

  if (sourceType === "advertiser") {
    const match = value.match(/^(?:adv(?:ertiser)?\s*)?([ABC])$/i);
    if (!match) throw new Error("Advertiser source level must be Adv A, Adv B, or Adv C");
    return `Adv ${match[1].toUpperCase()}`;
  }

  if (sourceType === "pro_advertiser") {
    if (!/^(?:adv(?:ertiser)?\s*)?pro$/i.test(value)) throw new Error("Pro Advertiser source level must be Adv Pro");
    return "Adv Pro";
  }

  if (sourceType === "super_advertiser") {
    if (!/^(?:adv(?:ertiser)?\s*)?super$/i.test(value)) throw new Error("Super Advertiser source level must be Adv Super");
    return "Adv Super";
  }

  if (sourceType === "partnership") {
    if (!/^partnership$/i.test(value)) throw new Error("Partnership source level must be Partnership");
    return "Partnership";
  }

  // Affiliate rules normally do not need a progression source level. Preserve a
  // non-empty explicit value for compatibility with existing future rules.
  return value;
}

function normalizeAdvertiserGrade(sourceType: string, raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  const value = String(raw).trim();
  const lower = value.toLowerCase();

  // Backwards-compatible legacy admin values.
  if (lower === "pro") return "Pro";
  if (lower === "super") return "Super";
  if (lower === "partnership") return "Partnership";
  if (["a", "b", "c"].includes(lower)) return lower.toUpperCase();
  if (lower === "advertiser") return null;

  throw new Error("Advertiser grade must be A, B, C, Pro, Super, or Partnership");
}

function validate(input: Record<string, unknown>) {
  const source_type = String(input.source_type || "");
  if (!SOURCES.has(source_type)) throw new Error("Invalid source type");

  const percentage = Number(input.percentage);
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
    throw new Error("Percentage must be between 0 and 100");
  }

  const priority = Number(input.priority ?? 100);
  if (!Number.isInteger(priority) || priority < 0) {
    throw new Error("Priority must be a non-negative integer");
  }

  const source_level = normalizeSourceLevel(source_type, input.source_level);
  const advertiser_grade = normalizeAdvertiserGrade(source_type, input.advertiser_grade);

  if (source_type === "advertiser" && advertiser_grade && !["A", "B", "C"].includes(advertiser_grade)) {
    throw new Error("Base advertiser rules may only target grade A, B, or C");
  }
  if (source_type === "pro_advertiser" && advertiser_grade && advertiser_grade !== "Pro") {
    throw new Error("Pro Advertiser rules may only target grade Pro");
  }
  if (source_type === "super_advertiser" && advertiser_grade && advertiser_grade !== "Super") {
    throw new Error("Super Advertiser rules may only target grade Super");
  }
  if (source_type === "partnership" && advertiser_grade && advertiser_grade !== "Partnership") {
    throw new Error("Partnership rules may only target Partnership grade");
  }
  if (!["advertiser", "pro_advertiser", "super_advertiser", "partnership"].includes(source_type) && advertiser_grade) {
    throw new Error("Advertiser grade only applies to advertiser or partnership sources");
  }

  const starts_at = input.starts_at ? String(input.starts_at) : null;
  const ends_at = input.ends_at ? String(input.ends_at) : null;
  if (starts_at && Number.isNaN(new Date(starts_at).getTime())) throw new Error("Invalid start date");
  if (ends_at && Number.isNaN(new Date(ends_at).getTime())) throw new Error("Invalid end date");
  if (starts_at && ends_at && new Date(starts_at) >= new Date(ends_at)) {
    throw new Error("End date must be after start date");
  }

  return {
    source_type,
    source_level,
    advertiser_grade,
    product_id: input.product_id || null,
    campaign_id: input.campaign_id || null,
    percentage,
    priority,
    status: input.status === "inactive" ? "inactive" : "active",
    starts_at,
    ends_at,
  };
}

async function hasConflict(
  supabase: ReturnType<typeof client>,
  rule: Record<string, unknown>,
  excludeId?: string,
) {
  let query = supabase
    .from("commission_rate_rules")
    .select("id,source_level,advertiser_grade,product_id,campaign_id")
    .eq("source_type", rule.source_type)
    .eq("priority", rule.priority)
    .eq("status", "active");

  if (excludeId) query = query.neq("id", excludeId);
  const { data } = await query;

  return (data ?? []).some((existing: any) =>
    existing.source_level === rule.source_level &&
    existing.advertiser_grade === rule.advertiser_grade &&
    existing.product_id === rule.product_id &&
    existing.campaign_id === rule.campaign_id
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return json(null);

  try {
    const { supabase, user } = await auth(req);
    const url = new URL(req.url);
    let body: Record<string, unknown> = {};
    if (req.method !== "GET") body = await req.json().catch(() => ({}));
    const id = String(body.id || url.searchParams.get("id") || "");

    if (req.method === "GET") {
      const { data: rules, error } = await supabase
        .from("commission_rate_rules")
        .select("*")
        .order("priority", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;

      const { data: products } = await supabase
        .from("products")
        .select("id,name,price")
        .order("created_at", { ascending: false })
        .limit(500);

      return json({ rules: rules ?? [], products: products ?? [] });
    }

    if (req.method === "POST") {
      const rule = validate(body);
      if (rule.status === "active" && await hasConflict(supabase, rule)) {
        return json({ error: "An active rule with the same specificity and priority already exists" }, 409);
      }

      const { data, error } = await supabase
        .from("commission_rate_rules")
        .insert({ ...rule, created_by: user.id })
        .select()
        .single();
      if (error) throw error;

      await supabase.from("admin_logs").insert({
        admin_id: user.id,
        action_type: "commission_rule_created",
        target_id: data.id,
        target_type: "commission_rate_rule",
        details: { source_type: data.source_type, source_level: data.source_level, advertiser_grade: data.advertiser_grade, percentage: data.percentage, priority: data.priority },
      });
      return json({ rule: data }, 201);
    }

    if (!id) return json({ error: "Rule id is required" }, 400);

    if (req.method === "DELETE") {
      const { data: existing } = await supabase.from("commission_rate_rules").select("*").eq("id", id).single();
      if (!existing) return json({ error: "Rule not found" }, 404);

      const { error } = await supabase.from("commission_rate_rules").delete().eq("id", id);
      if (error) throw error;

      await supabase.from("admin_logs").insert({
        admin_id: user.id,
        action_type: "commission_rule_deleted",
        target_id: id,
        target_type: "commission_rate_rule",
        details: { previous: existing },
      });
      return json({ success: true });
    }

    if (req.method === "PUT") {
      const rule = validate(body);
      if (rule.status === "active" && await hasConflict(supabase, rule, id)) {
        return json({ error: "An active rule with the same specificity and priority already exists" }, 409);
      }

      const { data, error } = await supabase
        .from("commission_rate_rules")
        .update(rule)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;

      await supabase.from("admin_logs").insert({
        admin_id: user.id,
        action_type: "commission_rule_updated",
        target_id: id,
        target_type: "commission_rate_rule",
        details: { source_type: data.source_type, source_level: data.source_level, advertiser_grade: data.advertiser_grade, percentage: data.percentage, status: data.status, priority: data.priority },
      });
      return json({ rule: data });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return json({ error: message }, message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400);
  }
});
