import fs from 'node:fs';
import path from 'node:path';

const rel = 'src/pages/admin/AdminLocalSeoPage.tsx';
const file = path.join(process.cwd(), rel);
const source = fs.readFileSync(file, 'utf8');
const needle = "const PRICE_RANGES = ['$', '$$', '$$$', '$$$$'];";

if (!source.includes(needle)) {
  console.log('[currency-hardening-prep] Local SEO price taxonomy already prepared or not present.');
  process.exit(0);
}

const replacement = "const PRICE_RANGES /* currency-audit-ignore: local SEO price-level taxonomy */ = ['$', '$$', '$$$', '$$$$'];";
const next = source.replace(needle, () => replacement);
fs.writeFileSync(file, next);
console.log('[currency-hardening-prep] Safely marked Local SEO price-level taxonomy.');
