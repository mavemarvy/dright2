import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const changed = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function write(rel, text) {
  fs.writeFileSync(path.join(root, rel), text);
  changed.push(rel);
}

function replaceRequired(text, from, to, label) {
  if (text.includes(to)) return text;
  if (!text.includes(from)) throw new Error(`[promotion-expansion-3] Missing anchor: ${label}`);
  return text.replace(from, to);
}

function edit(rel, transform) {
  const before = read(rel);
  const after = transform(before);
  if (after !== before) write(rel, after);
}

edit('src/pages/AnnouncementsPage.tsx', text => {
  let out = replaceRequired(
    text,
    "import SeoHead from '../components/SeoHead';",
    "import SeoHead from '../components/SeoHead';\nimport SponsoredPlacementCard from '../components/promotion/SponsoredPlacementCard';",
    'Announcements sponsored import',
  );

  out = replaceRequired(
    out,
    "  const filtered = filter === 'all' ? announcements : announcements.filter(a => a.type === filter);",
    "  const filtered = filter === 'all' ? announcements : announcements.filter(a => a.type === filter);\n  const sponsoredPlacement = filter === 'all' ? 'announcement_banner' : filter === 'news' ? 'news' : 'announcement_feed';",
    'Announcements placement selector',
  );

  out = replaceRequired(
    out,
    "        {loading ? (",
    "        <SponsoredPlacementCard\n          placement={sponsoredPlacement}\n          variant={filter === 'all' ? 'compact' : 'feed'}\n          className=\"mb-6\"\n          heading={filter === 'news' ? 'Sponsored news' : 'Sponsored announcement'}\n        />\n\n        {loading ? (",
    'Announcements sponsored slot',
  );
  return out;
});

edit('src/pages/MarketPage.tsx', text => {
  let out = replaceRequired(
    text,
    "import ShareMenu from '../components/marketplace/ShareMenu';",
    "import ShareMenu from '../components/marketplace/ShareMenu';\nimport SponsoredPlacementCard from '../components/promotion/SponsoredPlacementCard';",
    'Market sponsored import',
  );

  out = replaceRequired(
    out,
    "          <DiscoverySections />\n          <ContinueBrowsing />",
    "          <DiscoverySections />\n          {filters.sortBy !== 'trending' && (\n            <SponsoredPlacementCard placement=\"suggestions\" variant=\"recommendation\" className=\"my-8\" />\n          )}\n          <ContinueBrowsing />",
    'Market suggestions slot',
  );

  out = replaceRequired(
    out,
    "        <div className=\"flex items-center justify-between mb-4 mt-4\">",
    "        {filters.sortBy === 'trending' && (\n          <SponsoredPlacementCard placement=\"trending\" variant=\"compact\" className=\"mt-4\" />\n        )}\n\n        <div className=\"flex items-center justify-between mb-4 mt-4\">",
    'Market trending slot',
  );
  return out;
});

console.log(`[promotion-expansion-3] changed ${changed.length} file(s)`);
for (const rel of changed) console.log(`  ${rel}`);
