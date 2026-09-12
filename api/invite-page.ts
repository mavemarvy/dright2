function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end();
  }

  const rawToken = Array.isArray(req.query?.token) ? req.query.token[0] : req.query?.token;
  const token = typeof rawToken === 'string' ? rawToken.trim() : '';

  if (!token || !/^[A-Za-z0-9_-]{8,256}$/.test(token)) {
    return res.status(400).send('Invalid invite token');
  }

  try {
    const forwardedHost = String(req.headers['x-forwarded-host'] || req.headers.host || 'www.dright.store')
      .split(',')[0]
      .trim();
    const host = forwardedHost || 'www.dright.store';
    const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim() || 'https';
    const origin = `${proto}://${host}`;

    const upstream = await fetch(`${origin}/index.html`, {
      headers: { 'User-Agent': 'DRIGHT invite metadata renderer' },
    });

    if (!upstream.ok) {
      throw new Error(`Unable to load application shell (${upstream.status})`);
    }

    let html = await upstream.text();
    const inviteUrl = `https://www.dright.store/invite/${encodeURIComponent(token)}`;
    const imageUrl = 'https://www.dright.store/dright-og-v9.jpg';
    const safeInviteUrl = escapeHtml(inviteUrl);
    const safeImageUrl = escapeHtml(imageUrl);

    html = html
      .replace(
        /<link rel="canonical" href="[^"]*"\s*\/?>/i,
        `<link rel="canonical" href="${safeInviteUrl}" />`,
      )
      .replace(
        /<meta property="og:url" content="[^"]*"\s*\/?>/i,
        `<meta property="og:url" content="${safeInviteUrl}" />`,
      )
      .replace(/https:\/\/www\.dright\.store\/dright-og-v9\.jpg/g, safeImageUrl)
      .replace(/https:\/\/www\.dright\.store\/api\/dright-og-v8\?brand=exact-reference-v8/g, safeImageUrl)
      .replace(/https:\/\/www\.dright\.store\/dright-og-v6\.jpg\?v=6/g, safeImageUrl)
      .replace(/https:\/\/www\.dright\.store\/api\/dright-og-v5\?brand=premium-metallic-v5/g, safeImageUrl)
      .replace(/https:\/\/www\.dright\.store\/api\/dright-og-v4(?:\?brand=metallic-v4)?/g, safeImageUrl);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (req.method === 'HEAD') return res.status(200).end();
    return res.status(200).send(html);
  } catch (error) {
    console.error('invite page renderer error:', error);
    return res.status(502).send('Invite page is temporarily unavailable');
  }
}
