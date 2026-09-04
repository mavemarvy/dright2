import type { VercelRequest, VercelResponse } from '@vercel/node';

const SUPABASE_URL = 'https://vtiardblxpaeekbfvhjo.supabase.co';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!key) {
      return res.status(500).json({ success: false, error: 'Supabase client key is not configured' });
    }

    const upstream = await fetch(`${SUPABASE_URL}/functions/v1/turnstile-verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(req.body ?? {}),
    });

    const text = await upstream.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = { success: false, error: text || 'Invalid response from verification service' };
    }

    return res.status(upstream.status).json(data);
  } catch (error) {
    console.error('turnstile proxy error:', error);
    return res.status(502).json({
      success: false,
      error: error instanceof Error ? error.message : 'Verification service unavailable',
    });
  }
}
