import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function page(message: string, status = 200) {
  return new Response(
    `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f4f6f8;color:#18202b;margin:0"><div style="max-width:560px;margin:60px auto;padding:24px"><div style="background:#fff;border:1px solid #e7ebef;border-radius:16px;padding:28px"><h1 style="margin-top:0">DRIGHT</h1><p>${message}</p></div></div></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

Deno.serve(async (req: Request) => {
  if (!["GET", "POST"].includes(req.method)) {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(req.url);
  let token = url.searchParams.get("token") || "";
  if (!token && req.method === "POST") {
    const body = await req.text();
    try {
      const parsed = body ? JSON.parse(body) : {};
      token = typeof parsed?.token === "string" ? parsed.token : "";
    } catch {
      const params = new URLSearchParams(body);
      token = params.get("token") || "";
    }
  }

  if (!/^[0-9a-fA-F-]{36}$/.test(token)) {
    return req.method === "GET"
      ? page("This unsubscribe link is invalid or expired.", 400)
      : new Response("Invalid unsubscribe token", { status: 400 });
  }

  const { data: record } = await db
    .from("marketing_email_suppressions")
    .select("id,recipient_email,unsubscribed_at")
    .eq("unsubscribe_token", token)
    .maybeSingle();

  if (!record) {
    return req.method === "GET"
      ? page("This unsubscribe link is invalid or expired.", 404)
      : new Response("Not found", { status: 404 });
  }

  if (!record.unsubscribed_at) {
    await db
      .from("marketing_email_suppressions")
      .update({ unsubscribed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", record.id);
  }

  return req.method === "GET"
    ? page("You have been unsubscribed from DRIGHT marketing and opportunity emails. Transactional and security messages are unaffected.")
    : new Response("Unsubscribed", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
});
