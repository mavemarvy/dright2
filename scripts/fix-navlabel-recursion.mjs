import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), 'src/components/AppShell.tsx');
let source = fs.readFileSync(file, 'utf8');
const broken = "const navLabel = (item: NavEntry, t: (key: TranslationKey) => string): string =>\n  item.label ?? (item.labelKey ? navLabel(item, t) : item.path);";
const fixed = "const navLabel = (item: NavEntry, t: (key: TranslationKey) => string): string =>\n  item.label ?? (item.labelKey ? t(item.labelKey) : item.path);";

if (!source.includes(broken) && !source.includes(fixed)) {
  throw new Error('Expected navLabel implementation not found');
}

if (source.includes(broken)) {
  source = source.replace(broken, fixed);
  fs.writeFileSync(file, source);
  console.log('Fixed recursive navLabel implementation');
} else {
  console.log('navLabel already fixed');
}
