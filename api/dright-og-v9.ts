import sharp from 'sharp';

const WIDTH = 1200;
const HEIGHT = 630;
let cachedImage: Buffer | null = null;

function buildSvg() {
  return `
  <svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#020713"/>
        <stop offset="0.52" stop-color="#071426"/>
        <stop offset="1" stop-color="#020711"/>
      </linearGradient>
      <radialGradient id="globe" cx="42%" cy="38%" r="67%">
        <stop offset="0" stop-color="#24466d" stop-opacity="0.95"/>
        <stop offset="0.45" stop-color="#0d2744" stop-opacity="0.96"/>
        <stop offset="0.78" stop-color="#07182b" stop-opacity="0.98"/>
        <stop offset="1" stop-color="#020711"/>
      </radialGradient>
      <linearGradient id="tileBorder" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#f8fbff"/>
        <stop offset="0.18" stop-color="#99b9dc"/>
        <stop offset="0.52" stop-color="#32465e"/>
        <stop offset="0.79" stop-color="#dbeafe"/>
        <stop offset="1" stop-color="#111827"/>
      </linearGradient>
      <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#242a34"/>
        <stop offset="0.36" stop-color="#0e131b"/>
        <stop offset="1" stop-color="#020305"/>
      </linearGradient>
      <linearGradient id="metal" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffffff"/>
        <stop offset="0.19" stop-color="#e7edf5"/>
        <stop offset="0.44" stop-color="#a9b5c5"/>
        <stop offset="0.68" stop-color="#f7f9fc"/>
        <stop offset="1" stop-color="#75869a"/>
      </linearGradient>
      <linearGradient id="titleMetal" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff"/>
        <stop offset="0.42" stop-color="#f3f6fa"/>
        <stop offset="0.72" stop-color="#c4ccd6"/>
        <stop offset="1" stop-color="#8390a0"/>
      </linearGradient>
      <radialGradient id="blueGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0" stop-color="#60a5fa" stop-opacity="0.48"/>
        <stop offset="1" stop-color="#60a5fa" stop-opacity="0"/>
      </radialGradient>
      <filter id="blur24"><feGaussianBlur stdDeviation="24"/></filter>
      <filter id="blur10"><feGaussianBlur stdDeviation="10"/></filter>
      <filter id="shadow" x="-30%" y="-30%" width="160%" height="180%">
        <feDropShadow dx="0" dy="16" stdDeviation="18" flood-color="#000000" flood-opacity="0.9"/>
      </filter>
      <filter id="textShadow" x="-20%" y="-30%" width="150%" height="180%">
        <feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#000" flood-opacity="0.75"/>
      </filter>
      <clipPath id="earthClip"><circle cx="997" cy="255" r="315"/></clipPath>
    </defs>

    <rect width="1200" height="630" fill="url(#bg)"/>
    <ellipse cx="1030" cy="272" rx="390" ry="330" fill="#0b4a8b" opacity="0.14" filter="url(#blur24)"/>

    <!-- Earth -->
    <circle cx="997" cy="255" r="315" fill="url(#globe)" stroke="#5f91c8" stroke-opacity="0.45" stroke-width="2"/>
    <g clip-path="url(#earthClip)" opacity="0.9">
      <path d="M790 138 C842 74 927 55 1006 72 C1056 83 1099 109 1130 143 C1091 139 1069 153 1050 174 C1019 208 990 211 958 196 C923 179 892 185 863 208 C830 235 803 214 780 194 Z" fill="#183f65"/>
      <path d="M930 224 C965 206 1013 209 1040 234 C1061 254 1067 279 1056 299 C1041 327 1016 332 1002 361 C984 398 952 427 910 426 C884 425 864 411 850 386 C834 356 841 326 861 302 C880 279 898 242 930 224 Z" fill="#1b456d"/>
      <path d="M1082 203 C1120 187 1168 194 1196 223 C1225 253 1234 295 1216 329 C1196 368 1155 384 1118 371 C1086 360 1069 333 1071 299 C1073 265 1053 231 1082 203 Z" fill="#163858"/>
      <path d="M775 308 C807 291 842 294 868 317 C890 336 900 363 891 386 C882 410 856 422 833 414 C803 404 786 381 780 352 Z" fill="#132f4c"/>
      <path d="M1001 76 C1030 113 1029 160 1012 204 M930 83 C915 131 920 179 938 221 M1095 105 C1065 151 1057 201 1070 244 M842 143 C888 163 930 169 977 168 M821 234 C896 254 969 252 1042 236 M849 345 C919 360 988 354 1054 331" fill="none" stroke="#74a4d1" stroke-opacity="0.14" stroke-width="1.2"/>
    </g>

    <!-- Network arcs -->
    <g fill="none" stroke="#dbeafe" stroke-opacity="0.42" stroke-width="1.3">
      <path d="M781 221 Q900 86 1046 160"/>
      <path d="M828 294 Q972 103 1162 182"/>
      <path d="M898 348 Q1062 164 1192 276"/>
      <path d="M870 191 Q985 146 1113 305"/>
      <path d="M955 122 Q1101 112 1184 221"/>
    </g>
    <g fill="#fff">
      <circle cx="781" cy="221" r="4"/><circle cx="900" cy="139" r="4"/><circle cx="1046" cy="160" r="4"/>
      <circle cx="828" cy="294" r="3"/><circle cx="972" cy="203" r="5"/><circle cx="1162" cy="182" r="4"/>
      <circle cx="898" cy="348" r="3"/><circle cx="1087" cy="232" r="4"/><circle cx="1192" cy="276" r="4"/>
      <circle cx="1113" cy="305" r="4"/><circle cx="955" cy="122" r="3"/><circle cx="1184" cy="221" r="3"/>
    </g>
    <g fill="#93c5fd" opacity="0.95" filter="url(#blur10)">
      <circle cx="972" cy="203" r="13"/><circle cx="1087" cy="232" r="12"/><circle cx="1162" cy="182" r="10"/>
    </g>

    <!-- left-side darkening -->
    <rect width="810" height="630" fill="url(#bg)" opacity="0.56"/>

    <!-- blue pedestal -->
    <ellipse cx="248" cy="513" rx="210" ry="48" fill="url(#blueGlow)" filter="url(#blur10)"/>
    <ellipse cx="250" cy="493" rx="148" ry="18" fill="#8dc5ff" opacity="0.23" filter="url(#blur10)"/>

    <!-- metallic D tile -->
    <g filter="url(#shadow)">
      <rect x="73" y="146" width="316" height="316" rx="58" fill="url(#tileBorder)"/>
      <rect x="81" y="154" width="300" height="300" rx="52" fill="url(#tile)" stroke="#9bbce0" stroke-opacity="0.48" stroke-width="2"/>
      <path d="M96 174 Q231 128 366 179 L366 246 Q230 196 96 238 Z" fill="#fff" opacity="0.085"/>
      <path d="M150 205 H229 C294 205 335 244 335 304 C335 365 294 405 229 405 H150 Z M203 252 V358 H228 C260 358 280 339 280 304 C280 271 260 252 228 252 Z" fill="#263342" opacity="0.8" transform="translate(0,8)"/>
      <path d="M150 198 H229 C294 198 335 237 335 298 C335 359 294 398 229 398 H150 Z M203 245 V351 H228 C260 351 280 332 280 298 C280 264 260 245 228 245 Z" fill="url(#metal)" stroke="#cbd5e1" stroke-opacity="0.45" stroke-width="1"/>
    </g>

    <!-- reflection -->
    <g opacity="0.11" transform="translate(0 944) scale(1 -1)">
      <rect x="91" y="484" width="280" height="162" rx="52" fill="url(#tileBorder)"/>
      <path d="M156 506 H224 C277 506 310 539 310 590 H156 Z" fill="url(#metal)"/>
    </g>

    <!-- branding -->
    <g filter="url(#textShadow)">
      <text x="457" y="294" font-family="Arial, Helvetica, sans-serif" font-size="106" font-weight="800" letter-spacing="18" fill="url(#titleMetal)">DRIGHT</text>
      <text x="1084" y="242" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700" fill="#9ca3af">TM</text>
    </g>
    <text x="464" y="365" font-family="Arial, Helvetica, sans-serif" font-size="43" font-weight="300" letter-spacing="12" fill="#f1f5f9">Global Marketplace</text>
    <text x="486" y="437" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="400" letter-spacing="1" fill="#d6dbe3">Products, services, opportunities, creators,</text>
    <text x="523" y="473" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="400" letter-spacing="1" fill="#d6dbe3">stores, and communities worldwide.</text>

    <!-- footer -->
    <line x1="454" y1="548" x2="560" y2="548" stroke="#a8b2c0" stroke-opacity="0.74" stroke-width="1.4"/>
    <text x="584" y="557" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="400" letter-spacing="7" fill="#d7dde6">dright.store</text>
    <line x1="803" y1="548" x2="910" y2="548" stroke="#a8b2c0" stroke-opacity="0.74" stroke-width="1.4"/>
  </svg>`;
}

async function renderImage() {
  if (!cachedImage) {
    cachedImage = await sharp(Buffer.from(buildSvg()))
      .jpeg({ quality: 91, chromaSubsampling: '4:4:4' })
      .toBuffer();
  }
  return cachedImage;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end();
  }

  try {
    const image = await renderImage();
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Length', String(image.length));
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method === 'HEAD') return res.status(200).end();
    return res.status(200).send(image);
  } catch (error) {
    console.error('DRIGHT OG v9 render failed:', error);
    return res.status(500).send('Unable to render DRIGHT social preview');
  }
}
