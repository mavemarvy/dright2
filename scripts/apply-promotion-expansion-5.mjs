import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const changed = [];

function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function write(rel, text) { fs.writeFileSync(path.join(root, rel), text); changed.push(rel); }
function replaceRequired(text, from, to, label) {
  if (text.includes(to)) return text;
  if (!text.includes(from)) throw new Error(`[promotion-expansion-5] Missing anchor: ${label}`);
  return text.replace(from, to);
}
function edit(rel, transform) {
  const before = read(rel);
  const after = transform(before);
  if (after !== before) write(rel, after);
}

edit('src/pages/ActivityFeedPage.tsx', text => {
  let out = replaceRequired(
    text,
    "import { notificationRelativeTime } from '../lib/notificationHooks';",
    "import { notificationRelativeTime } from '../lib/notificationHooks';\nimport SponsoredPlacementCard from '../components/promotion/SponsoredPlacementCard';",
    'activity feed sponsored import',
  );
  out = replaceRequired(
    out,
    "      <div className=\"max-w-5xl mx-auto px-4 sm:px-6 py-4 pb-24 md:pb-8\">\n        {loading ? (",
    "      <div className=\"max-w-5xl mx-auto px-4 sm:px-6 py-4 pb-24 md:pb-8\">\n        <SponsoredPlacementCard placement=\"feed\" variant=\"feed\" className=\"mb-4\" heading=\"Sponsored for your activity feed\" />\n\n        {loading ? (",
    'activity feed sponsored slot',
  );
  return out;
});

edit('src/pages/PublicStorePage.tsx', text => {
  let out = replaceRequired(
    text,
    "import { formatCurrency } from '../lib/currency';",
    "import { formatCurrency } from '../lib/currency';\nimport SponsoredPlacementCard from '../components/promotion/SponsoredPlacementCard';",
    'public store sponsored import',
  );
  out = replaceRequired(
    out,
    "        {/* Tabs */}",
    "        <SponsoredPlacementCard placement=\"store\" variant=\"compact\" className=\"mt-6\" />\n\n        {/* Tabs */}",
    'public store sponsored slot',
  );
  return out;
});

edit('src/pages/PublicProfilePage.tsx', text => {
  let out = replaceRequired(
    text,
    "import { AnalyticsLoading, AnalyticsNoData } from '../components/analytics/AnalyticsState';",
    "import { AnalyticsLoading, AnalyticsNoData } from '../components/analytics/AnalyticsState';\nimport SponsoredPlacementCard from '../components/promotion/SponsoredPlacementCard';",
    'public profile sponsored import',
  );
  out = replaceRequired(
    out,
    "      {/* Tab Content */}\n      <div className=\"max-w-5xl mx-auto px-4 py-6\">\n        {tab === 'overview'",
    "      {/* Tab Content */}\n      <div className=\"max-w-5xl mx-auto px-4 py-6\">\n        {!isOwner && (\n          <SponsoredPlacementCard placement=\"profile_discovery\" variant=\"compact\" className=\"mb-6\" />\n        )}\n\n        {tab === 'overview'",
    'public profile sponsored slot',
  );
  return out;
});

edit('src/pages/MarketPage.tsx', text => {
  let out = replaceRequired(
    text,
    "  const isBrowsing = !searchQuery && filters.category === 'All';",
    "  const isBrowsing = !searchQuery && filters.category === 'All';\n\n  const contextualPlacement =\n    searchQuery.trim()\n      ? 'search'\n      : filters.productType?.toUpperCase() === 'COURSE'\n        ? 'course_feed'\n        : filters.productType?.toUpperCase() === 'SERVICE'\n          ? 'service_feed'\n          : filters.category !== 'All'\n            ? 'category'\n            : null;",
    'market contextual placement selector',
  );
  out = replaceRequired(
    out,
    "        <FilterSettingsBar\n          userId={user?.id}\n          filterState={filterState}\n          onFilterChange={handleFilterChange}\n        />\n\n        {loading && (",
    "        <FilterSettingsBar\n          userId={user?.id}\n          filterState={filterState}\n          onFilterChange={handleFilterChange}\n        />\n\n        {contextualPlacement && (\n          <SponsoredPlacementCard placement={contextualPlacement} variant=\"compact\" className=\"mt-4\" />\n        )}\n\n        {loading && (",
    'market contextual sponsored slot',
  );
  return out;
});

console.log(`[promotion-expansion-5] changed ${changed.length} file(s)`);
for (const rel of changed) console.log(`  ${rel}`);
