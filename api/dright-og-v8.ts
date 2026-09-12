import { createHash } from 'node:crypto';

import part00 from './og-v8/part00';
import part01 from './og-v8/part01';
import part02 from './og-v8/part02';
import part03 from './og-v8/part03';
import part04 from './og-v8/part04';
import part05 from './og-v8/part05';
import part06 from './og-v8/part06';
import part07 from './og-v8/part07';
import part08 from './og-v8/part08';
import part09 from './og-v8/part09';

const EXPECTED_LENGTH = 86140;
const EXPECTED_SHA256 = '54462fca41aebbd5f81b7ac6b58c97004ee9bc1c6081c7a9ab528d2d416d1ffc';

const IMAGE_BASE64 = [
  part00,
  part01,
  part02,
  part03,
  part04,
  part05,
  part06,
  part07,
  part08,
  part09,
].join('');

const IMAGE = Buffer.from(IMAGE_BASE64, 'base64');
const IMAGE_SHA256 = createHash('sha256').update(IMAGE).digest('hex');
const IMAGE_IS_VALID = IMAGE.length === EXPECTED_LENGTH && IMAGE_SHA256 === EXPECTED_SHA256;

export default function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end();
  }

  if (!IMAGE_IS_VALID) {
    console.error('DRIGHT OG v8 integrity failure', {
      actualLength: IMAGE.length,
      expectedLength: EXPECTED_LENGTH,
      actualSha256: IMAGE_SHA256,
      expectedSha256: EXPECTED_SHA256,
    });
    return res.status(500).send('Social preview image integrity check failed');
  }

  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Content-Length', String(IMAGE.length));
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('ETag', `\"sha256-${IMAGE_SHA256}\"`);

  if (req.method === 'HEAD') return res.status(200).end();
  return res.status(200).send(IMAGE);
}
