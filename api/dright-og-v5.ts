import sharp from 'sharp';

const WIDTH = 1200;
const HEIGHT = 630;

let cachedPng: Buffer | null = null;

function previewSvg() {
  return `
  <svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#020817"/>
        <stop offset="0.48" stop-color="#07172a"/>
        <stop offset="1" stop-color="#02040a"/>
      </linearGradient>
      <radialGradient id="blueGlow" cx="0.24" cy="0.5" r="0.68">
        <stop offset="0" stop-color="#2c6bb7" stop-opacity="0.34"/>
        <stop offset="0.58" stop-color="#103c72" stop-opacity="0.12"/>
        <stop offset="1" stop-color="#000" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="earthGlow" cx="0.5" cy="0.48" r="0.58">
        <stop offset="0" stop-color="#164776" stop-opacity="0.92"/>
        <stop offset="0.56" stop-color="#0b2848" stop-opacity="0.9"/>
        <stop offset="1" stop-color="#020914" stop-opacity="0.98"/>
      </radialGradient>
      <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#313844"/>
        <stop offset="0.46" stop-color="#121820"/>
        <stop offset="1" stop-color="#030507"/>
      </linearGradient>
      <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#f8fafc"/>
        <stop offset="0.2" stop-color="#bcd5f1"/>
        <stop offset="0.5" stop-color="#64748b"/>
        <stop offset="0.78" stop-color="#dbeafe"/>
        <stop offset="1" stop-color="#334155"/>
      </linearGradient>
      <linearGradient id="metal" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffffff"/>
        <stop offset="0.18" stop-color="#dbeafe"/>
        <stop offset="0.34" stop-color="#94a3b8"/>
        <stop offset="0.5" stop-color="#f8fafc"/>
        <stop offset="0.68" stop-color="#a7b6c8"/>
        <stop offset="0.84" stop-color="#e2e8f0"/>
        <stop offset="1" stop-color="#64748b"/>
      </linearGradient>
      <linearGradient id="word" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff"/>
        <stop offset="0.5" stop-color="#edf3fa"/>
        <stop offset="1" stop-color="#9aa9bc"/>
      </linearGradient>
      <filter id="shadow" x="-35%" y="-35%" width="170%" height="190%">
        <feGaussianBlur stdDeviation="18"/>
      </filter>
      <filter id="soft" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="7"/>
      </filter>
      <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="3.6" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <clipPath id="earthClip"><circle cx="1050" cy="255" r="315"/></clipPath>
    </defs>

    <rect width="1200" height="630" fill="url(#bg)"/>
    <rect width="1200" height="630" fill="url(#blueGlow)"/>

    <!-- subtle stars -->
    <g fill="#dbeafe" opacity="0.32">
      <circle cx="78" cy="78" r="1.2"/><circle cx="154" cy="109" r="1"/><circle cx="671" cy="77" r="1.2"/>
      <circle cx="732" cy="128" r="1"/><circle cx="843" cy="68" r="1.4"/><circle cx="934" cy="93" r="1"/>
      <circle cx="1126" cy="79" r="1.5"/><circle cx="888" cy="428" r="1"/><circle cx="760" cy="540" r="1.2"/>
    </g>

    <!-- earth -->
    <circle cx="1050" cy="255" r="318" fill="#07101e" stroke="#74b6ff" stroke-opacity="0.33" stroke-width="2"/>
    <circle cx="1050" cy="255" r="310" fill="url(#earthGlow)"/>
    <g clip-path="url(#earthClip)" opacity="0.92">
      <path d="M868 110 C930 67 1055 58 1157 96 C1236 125 1276 172 1290 226 C1262 212 1210 199 1165 201 C1124 203 1101 223 1074 245 C1044 268 1000 279 966 262 C936 247 929 215 902 198 C877 182 843 181 820 189 C827 159 844 132 868 110Z" fill="#112f50"/>
      <path d="M1002 267 C1040 247 1074 251 1110 276 C1143 298 1166 334 1167 373 C1168 416 1148 452 1123 480 C1100 505 1081 522 1062 540 C1032 532 1004 515 982 489 C954 455 943 417 950 380 C958 338 971 287 1002 267Z" fill="#0e2b4c"/>
      <path d="M1174 255 C1210 235 1265 241 1295 267 C1315 284 1327 305 1332 330 C1284 316 1249 317 1218 330 C1195 340 1178 358 1159 376 C1154 333 1155 287 1174 255Z" fill="#0d2744"/>
      <path d="M833 212 C874 201 909 215 931 243 C944 260 952 278 963 290 C943 302 921 311 899 310 C871 308 848 295 829 277 C808 257 793 237 781 217 C798 216 816 216 833 212Z" fill="#143557"/>
      <g fill="#f6d89b" opacity="0.93">
        <circle cx="980" cy="157" r="3.2"/><circle cx="1010" cy="180" r="2.4"/><circle cx="1046" cy="169" r="2.8"/>
        <circle cx="1087" cy="201" r="3.2"/><circle cx="1117" cy="228" r="2.5"/><circle cx="1150" cy="240" r="2.4"/>
        <circle cx="1137" cy="295" r="2.8"/><circle cx="1102" cy="340" r="2.4"/><circle cx="1065" cy="386" r="2.3"/>
        <circle cx="1023" cy="429" r="2.7"/><circle cx="1234" cy="316" r="2.2"/><circle cx="1264" cy="353" r="2.5"/>
        <circle cx="917" cy="238" r="2.5"/><circle cx="875" cy="249" r="2.1"/><circle cx="966" cy="220" r="2.3"/>
      </g>
      <g fill="none" stroke="#cfe8ff" stroke-opacity="0.55" stroke-width="1.7">
        <path d="M892 241 Q1001 83 1137 295"/>
        <path d="M917 238 Q1090 105 1264 353"/>
        <path d="M980 157 Q1110 55 1234 316"/>
        <path d="M1010 180 Q1092 138 1150 240"/>
        <path d="M1065 386 Q1112 265 1264 353"/>
      </g>
    </g>
    <path d="M744 132 Q954 17 1196 76" fill="none" stroke="#8bc5ff" stroke-width="2" stroke-opacity="0.52"/>
    <circle cx="852" cy="79" r="4" fill="#fff5d6" filter="url(#glow)"/>
    <circle cx="1144" cy="91" r="4.2" fill="#fff5d6" filter="url(#glow)"/>

    <!-- icon glow -->
    <ellipse cx="262" cy="514" rx="188" ry="34" fill="#236ab2" opacity="0.25" filter="url(#shadow)"/>
    <rect x="74" y="139" width="354" height="354" rx="82" fill="#265c92" opacity="0.23" filter="url(#shadow)"/>

    <!-- metallic tile -->
    <rect x="77" y="116" width="365" height="365" rx="82" fill="url(#rim)"/>
    <rect x="83" y="122" width="353" height="353" rx="77" fill="url(#tile)" stroke="#cfe5ff" stroke-opacity="0.35" stroke-width="2"/>
    <path d="M101 143 Q258 105 414 151 L414 230 Q263 189 101 228Z" fill="#ffffff" opacity="0.075"/>
    <path d="M104 448 Q257 485 411 443" fill="none" stroke="#243849" stroke-width="3" opacity="0.8"/>

    <!-- D shadow and face -->
    <path d="M153 190 H259 C338 190 387 234 387 299 C387 365 338 409 259 409 H153 Z M214 243 V356 H255 C297 356 324 334 324 299 C324 265 297 243 255 243 Z" fill="#000000" opacity="0.84" transform="translate(0 11)" filter="url(#soft)"/>
    <path d="M153 190 H259 C338 190 387 234 387 299 C387 365 338 409 259 409 H153 Z M214 243 V356 H255 C297 356 324 334 324 299 C324 265 297 243 255 243 Z" fill="url(#metal)" stroke="#f8fafc" stroke-opacity="0.55" stroke-width="2"/>
    <path d="M167 201 H252 C319 201 365 236 374 286" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" opacity="0.34"/>

    <!-- wordmark -->
    <text x="503" y="291" fill="url(#word)" font-family="Arial, Helvetica, sans-serif" font-size="94" font-weight="800" letter-spacing="16">DRIGHT</text>
    <text x="509" y="353" fill="#d8e1ec" font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="400" letter-spacing="9">GLOBAL MARKETPLACE</text>
    <rect x="510" y="381" width="542" height="1" fill="#8ea4bc" opacity="0.42"/>
    <text x="511" y="425" fill="#cbd5e1" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="400">Products • Services • Opportunities • Creators • Stores • Communities</text>

    <!-- domain -->
    <rect x="510" y="492" width="96" height="1.4" fill="#9db2c8" opacity="0.42"/>
    <text x="628" y="503" fill="#e2e8f0" font-family="Arial, Helvetica, sans-serif" font-size="27" font-weight="500" letter-spacing="5">dright.store</text>
    <rect x="830" y="492" width="96" height="1.4" fill="#9db2c8" opacity="0.42"/>

    <text x="1148" y="590" text-anchor="end" fill="#8fa8c4" font-family="Arial, Helvetica, sans-serif" font-size="17" letter-spacing="2">WORLDWIDE</text>
  </svg>`;
}

async function makePng() {
  return sharp(Buffer.from(previewSvg()))
    .resize(WIDTH, HEIGHT, { fit: 'fill' })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end();
  }

  if (!cachedPng) cachedPng = await makePng();

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Length', String(cachedPng.length));
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', 'inline; filename="dright-social-preview-v5.png"');

  if (req.method === 'HEAD') return res.status(200).end();
  return res.status(200).send(cachedPng);
}
