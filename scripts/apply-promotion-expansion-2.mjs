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
  if (!text.includes(from)) throw new Error(`[promotion-expansion] Missing anchor: ${label}`);
  return text.replace(from, to);
}

function edit(rel, transform) {
  const before = read(rel);
  const after = transform(before);
  if (after !== before) write(rel, after);
}

edit('src/pages/NotificationsPage.tsx', text => {
  let out = replaceRequired(
    text,
    "import NotificationCard from '../components/NotificationCard';",
    "import NotificationCard from '../components/NotificationCard';\nimport SponsoredPlacementCard from '../components/promotion/SponsoredPlacementCard';",
    'NotificationsPage sponsored import',
  );

  out = replaceRequired(
    out,
    "        {hook.loading ? (",
    "        {!filters.showArchived && (filters.category === 'all' || filters.category === 'promotions') && (\n          <SponsoredPlacementCard placement=\"notifications\" variant=\"notification\" className=\"mb-4\" />\n        )}\n\n        {hook.loading ? (",
    'NotificationsPage sponsored slot',
  );
  return out;
});

edit('src/pages/LeaderboardPage.tsx', text => {
  let out = replaceRequired(
    text,
    "import { LEVEL_ICONS, LEVEL_COLORS, type WorkerLevel } from '../lib/campaignTypes';",
    "import { LEVEL_ICONS, LEVEL_COLORS, type WorkerLevel } from '../lib/campaignTypes';\nimport LeaderboardInformationFeed from '../components/promotion/LeaderboardInformationFeed';",
    'LeaderboardPage information feed import',
  );

  out = replaceRequired(
    out,
    "      {/* Full Leaderboard */}",
    "      <LeaderboardInformationFeed />\n\n      {/* Full Leaderboard */}",
    'LeaderboardPage information feed slot',
  );
  return out;
});

edit('src/pages/DashboardPage.tsx', text => {
  let out = replaceRequired(
    text,
    "import { formatCurrency } from '../lib/currency';",
    "import { formatCurrency } from '../lib/currency';\nimport SponsoredPlacementCard from '../components/promotion/SponsoredPlacementCard';",
    'DashboardPage recommendation import',
  );

  out = replaceRequired(
    out,
    "      {/* Global Announcements */}",
    "      {/* Paid recommendations are server-ranked and frequency-capped. */}\n      <SponsoredPlacementCard placement=\"recommendations\" variant=\"recommendation\" className=\"mb-6\" />\n\n      {/* Global Announcements */}",
    'DashboardPage recommendation slot',
  );
  return out;
});

console.log(`[promotion-expansion] changed ${changed.length} file(s)`);
for (const rel of changed) console.log(`  ${rel}`);
