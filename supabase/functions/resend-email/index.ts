import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const RESEND_API_URL = "https://api.resend.com/emails";
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

function getSupabaseClient(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (authHeader) {
    return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  }
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
}

interface EmailParams {
  to: string;
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  templateType: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

async function logEmailEvent(supabase: ReturnType<typeof getSupabaseClient>, params: EmailParams, status: string, messageId?: string, errorMessage?: string) {
  try {
    await supabase.from("email_logs").insert({
      user_id: params.userId || null,
      recipient_email: params.to,
      template_type: params.templateType,
      subject: params.subject,
      status,
      provider: "resend",
      message_id: messageId || null,
      error_message: errorMessage || null,
      metadata: params.metadata || {},
    });
  } catch { /* non-fatal */ }
}

async function sendWithRetry(params: EmailParams, supabase: ReturnType<typeof getSupabaseClient>): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) throw new Error("Missing RESEND_API_KEY");

  const fromAddress = params.from || Deno.env.get("RESEND_FROM_EMAIL") || "noreply@dright.com";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(RESEND_API_URL, {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: fromAddress,
          to: params.to,
          subject: params.subject,
          html: params.html,
          reply_to: params.replyTo,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const messageId = data.id || data.message_id || "";
        await logEmailEvent(supabase, params, "sent", messageId);
        return { success: true, messageId };
      }

      if (res.status === 429 || res.status >= 500) {
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
          await logEmailEvent(supabase, params, "retry", undefined, `Retry ${attempt + 1} for ${res.status}`);
          continue;
        }
      }

      const errText = await res.text().catch(() => "");
      const errorMsg = `Resend API error (${res.status}): ${errText.slice(0, 300)}`;
      await logEmailEvent(supabase, params, "failed", undefined, errorMsg);
      return { success: false, error: errorMsg };
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
        continue;
      }
      const errorMsg = err instanceof Error ? err.message : "Network error";
      await logEmailEvent(supabase, params, "failed", undefined, errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  return { success: false, error: "Max retries exceeded" };
}

function getTemplate(type: string, data: Record<string, unknown>): { subject: string; html: string } {
  const appName = "DRIGHT";
  const baseUrl = (Deno.env.get("APP_URL") || "https://dright.com").replace(/\/$/, "");

  const templates: Record<string, (d: Record<string, unknown>) => { subject: string; html: string }> = {
    welcome: (d) => ({
      subject: `Welcome to ${appName}!`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
        <h1 style="color:#6366f1">Welcome to ${appName}, ${d.name || 'there'}!</h1>
        <p>Your account has been created successfully. Start exploring the marketplace, sell digital products, offer services, and more.</p>
        <a href="${baseUrl}/dashboard" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0">Go to Dashboard</a>
        <p style="color:#666;font-size:14px">Referral code: ${d.referralCode || 'N/A'}</p>
      </div>`,
    }),
    email_verification: (d) => ({
      subject: `Verify your email - ${appName}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
        <h1 style="color:#6366f1">Verify Your Email</h1>
        <p>Use the code below to verify your email address:</p>
        <div style="font-size:32px;font-weight:bold;letter-spacing:8px;background:#f3f4f6;padding:20px;border-radius:8px;text-align:center;margin:16px 0">${d.code || '000000'}</div>
        <p style="color:#666;font-size:14px">This code expires in 10 minutes.</p>
      </div>`,
    }),
    password_reset: (d) => ({
      subject: `Reset your password - ${appName}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
        <h1 style="color:#6366f1">Password Reset</h1>
        <p>Click the button below to reset your password:</p>
        <a href="${baseUrl}/reset-password?token=${d.token || ''}" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0">Reset Password</a>
        <p style="color:#666;font-size:14px">If you didn't request this, ignore this email.</p>
      </div>`,
    }),
    login_verification: (d) => ({
      subject: `Login verification - ${appName}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
        <h1 style="color:#6366f1">Login Verification Code</h1>
        <p>Use this code to complete your login:</p>
        <div style="font-size:32px;font-weight:bold;letter-spacing:8px;background:#f3f4f6;padding:20px;border-radius:8px;text-align:center;margin:16px 0">${d.code || '000000'}</div>
      </div>`,
    }),
    wallet_funding: (d) => ({
      subject: `Wallet funded - ${appName}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
        <h1 style="color:#6366f1">Wallet Funding Confirmed</h1>
        <p>Your wallet has been funded with <strong>${d.amount || '0'} ${d.currency || ''}</strong>.</p>
        <p>New balance: <strong>${d.newBalance || '0'} ${d.currency || ''}</strong></p>
        <p style="color:#666;font-size:14px">Transaction ID: ${d.transactionId || 'N/A'}</p>
      </div>`,
    }),
    purchase_receipt: (d) => ({
      subject: `Purchase receipt - ${appName}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
        <h1 style="color:#6366f1">Purchase Receipt</h1>
        <p>Thank you for your purchase of <strong>${d.productName || 'Product'}</strong>.</p>
        <p>Amount: <strong>${d.amount || '0'} ${d.currency || ''}</strong></p>
        <p>Seller: ${d.sellerName || 'N/A'}</p>
        <a href="${baseUrl}/dashboard" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0">View Purchase</a>
      </div>`,
    }),
    subscription_confirmation: (d) => ({
      subject: `Subscription confirmed - ${appName}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
        <h1 style="color:#6366f1">Subscription Confirmed</h1>
        <p>You are now subscribed to <strong>${d.planName || 'Premium'}</strong>.</p>
        <p>Billing: ${d.amount || '0'} ${d.currency || ''} / ${d.billingCycle || 'month'}</p>
      </div>`,
    }),
    withdrawal_request: (d) => ({
      subject: `Withdrawal request received - ${appName}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
        <h1 style="color:#6366f1">Withdrawal Request Received</h1>
        <p>We've received your request to withdraw <strong>${d.amount || '0'} ${d.currency || ''}</strong>.</p>
        <p>Your request is being processed and will be reviewed within 3-5 business days.</p>
        <p style="color:#666;font-size:14px">Request ID: ${d.requestId || 'N/A'}</p>
      </div>`,
    }),
    withdrawal_completed: (d) => ({
      subject: `Withdrawal completed - ${appName}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
        <h1 style="color:#6366f1">Withdrawal Completed</h1>
        <p>Your withdrawal of <strong>${d.amount || '0'} ${d.currency || ''}</strong> has been processed.</p>
        <p style="color:#666;font-size:14px">Transaction ID: ${d.transactionId || 'N/A'}</p>
      </div>`,
    }),
    referral_reward: (d) => ({
      subject: `Referral reward earned - ${appName}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
        <h1 style="color:#6366f1">Referral Reward Earned!</h1>
        <p>You earned <strong>${d.amount || '0'} ${d.currency || ''}</strong> from your referral ${d.referredName || ''}.</p>
        <p>Total referral earnings: <strong>${d.totalEarnings || '0'} ${d.currency || ''}</strong></p>
      </div>`,
    }),
    affiliate_commission: (d) => ({
      subject: `Affiliate commission earned - ${appName}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
        <h1 style="color:#6366f1">Affiliate Commission Earned</h1>
        <p>You earned <strong>${d.amount || '0'} ${d.currency || ''}</strong> in affiliate commission.</p>
        <p>Product: ${d.productName || 'N/A'}</p>
        <p>Total affiliate earnings: <strong>${d.totalEarnings || '0'} ${d.currency || ''}</strong></p>
      </div>`,
    }),
    new_order: (d) => ({
      subject: `New order received - ${appName}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
        <h1 style="color:#6366f1">New Order Received!</h1>
        <p>You received a new order for <strong>${d.productName || 'Product'}</strong>.</p>
        <p>Buyer: ${d.buyerName || 'N/A'}</p>
        <p>Amount: <strong>${d.amount || '0'} ${d.currency || ''}</strong></p>
        <a href="${baseUrl}/dashboard" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0">View Order</a>
      </div>`,
    }),
    seller_sale: (d) => ({
      subject: `Sale completed - ${appName}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
        <h1 style="color:#6366f1">Sale Completed!</h1>
        <p>Your product <strong>${d.productName || 'Product'}</strong> has been sold.</p>
        <p>Buyer: ${d.buyerName || 'N/A'}</p>
        <p>Amount: <strong>${d.amount || '0'} ${d.currency || ''}</strong></p>
      </div>`,
    }),
    payment_receipt: (d) => ({
      subject: `Payment Receipt - ${appName}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f9fafb">
        <div style="background:#fff;border-radius:12px;padding:32px;margin-top:16px">
          <div style="text-align:center;margin-bottom:24px">
            <div style="font-size:22px;font-weight:bold;color:#4f46e5">${appName}</div>
            <div style="font-size:13px;color:#666;text-transform:uppercase;letter-spacing:2px;margin-top:4px">Payment Receipt</div>
            <div style="display:inline-block;padding:6px 16px;border-radius:20px;font-size:12px;font-weight:bold;background:#d1fae5;color:#065f46;margin-top:12px">PAID</div>
          </div>
          <div style="border-top:1px solid #eee;padding-top:20px">
            <div style="display:flex;justify-content:space-between;padding:8px 0;font-size:14px"><span style="color:#666">Receipt #</span><span style="font-family:monospace;font-weight:600">${d.receiptNumber || 'N/A'}</span></div>
            <div style="display:flex;justify-content:space-between;padding:8px 0;font-size:14px"><span style="color:#666">Reference</span><span style="font-family:monospace;font-size:12px">${d.reference || 'N/A'}</span></div>
            <div style="display:flex;justify-content:space-between;padding:8px 0;font-size:14px"><span style="color:#666">Date</span><span>${d.date || new Date().toLocaleString()}</span></div>
            <div style="display:flex;justify-content:space-between;padding:8px 0;font-size:14px"><span style="color:#666">Payment Method</span><span style="text-transform:capitalize">${d.channel || 'Card'}</span></div>
            ${d.productName ? `<div style="display:flex;justify-content:space-between;padding:8px 0;font-size:14px"><span style="color:#666">Product</span><span style="font-weight:600">${d.productName}</span></div>` : ''}
            ${d.sellerName ? `<div style="display:flex;justify-content:space-between;padding:8px 0;font-size:14px"><span style="color:#666">Seller</span><span>${d.sellerName}</span></div>` : ''}
          </div>
          <div style="border-top:2px solid #1a1a1a;margin-top:16px;padding-top:16px">
            <div style="display:flex;justify-content:space-between;font-size:20px;font-weight:bold">
              <span>Total Paid</span><span style="color:#4f46e5">${d.amount || '0'} ${d.currency || ''}</span>
            </div>
          </div>
          <div style="text-align:center;margin-top:24px;font-size:12px;color:#999">
            <p>Thank you for your payment.</p>
            <p>For support: support@dright.com</p>
            <p>This receipt was generated electronically by ${appName}.</p>
          </div>
        </div>
      </div>`,
    }),
    admin_payment_alert: (d) => ({
      subject: `[ADMIN] Payment Alert - ${appName}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
        <h1 style="color:#6366f1">Payment Alert</h1>
        <p>A payment has been successfully processed.</p>
        <div style="background:#f3f4f6;padding:16px;border-radius:8px;margin:16px 0">
          <p><strong>Reference:</strong> ${d.reference || 'N/A'}</p>
          <p><strong>Amount:</strong> ${d.amount || '0'} ${d.currency || ''}</p>
          <p><strong>Type:</strong> ${d.purpose || 'N/A'}</p>
          <p><strong>Channel:</strong> ${d.channel || 'N/A'}</p>
        </div>
        <a href="${baseUrl}/admin/payments" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0">View in Admin Panel</a>
      </div>`,
    }),
    support_ticket_update: (d) => ({
      subject: `Support ticket update - ${appName}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
        <h1 style="color:#6366f1">Support Ticket Update</h1>
        <p>Your ticket <strong>#${d.ticketId || 'N/A'}</strong> has been updated.</p>
        <p>Status: ${d.status || 'Updated'}</p>
        <p>Reply: ${d.reply || 'Check your dashboard for details.'}</p>
      </div>`,
    }),
    report_status_update: (d) => ({
      subject: `Report status update - ${appName}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
        <h1 style="color:#6366f1">Report Status Update</h1>
        <p>Your report <strong>#${d.reportId || 'N/A'}</strong> status has been updated to: <strong>${d.status || 'Updated'}</strong>.</p>
        <p>${d.message || ''}</p>
      </div>`,
    }),
    admin_invitation: (d) => ({
      subject: `Admin invitation - ${appName}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
        <h1 style="color:#6366f1">You're Invited to Join ${appName} Admin</h1>
        <p>You've been invited to join as <strong>${d.role || 'Admin'}</strong>.</p>
        <a href="${baseUrl}/accept-invite?token=${d.token || ''}" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0">Accept Invitation</a>
      </div>`,
    }),
    two_factor_auth: (d) => ({
      subject: `Two-factor authentication code - ${appName}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
        <h1 style="color:#6366f1">Two-Factor Authentication Code</h1>
        <p>Use this code to complete authentication:</p>
        <div style="font-size:32px;font-weight:bold;letter-spacing:8px;background:#f3f4f6;padding:20px;border-radius:8px;text-align:center;margin:16px 0">${d.code || '000000'}</div>
        <p style="color:#666;font-size:14px">This code expires in 5 minutes.</p>
      </div>`,
    }),
  };

  const templateFn = templates[type];
  if (!templateFn) {
    return { subject: `${appName} notification`, html: `<div style="font-family:sans-serif;padding:20px"><p>${JSON.stringify(data)}</p></div>` };
  }
  return templateFn(data);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = getSupabaseClient(req);
    const body = await req.json();
    const { templateType, to, data = {}, userId, from, replyTo } = body;

    if (!to) throw new Error("Missing recipient email");
    if (!templateType) throw new Error("Missing template type");

    const { subject, html } = getTemplate(templateType, data);
    const result = await sendWithRetry({ to, subject, html, from, replyTo, templateType, userId, metadata: data }, supabase);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
