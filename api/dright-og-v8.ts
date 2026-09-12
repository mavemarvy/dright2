const IMAGE_URL = 'https://www.dright.store/dright-og-v9.jpg';

export default function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end();
  }

  res.setHeader('Location', IMAGE_URL);
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(308).end();
}
