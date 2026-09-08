import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const changed = [];

function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function write(rel, text) { fs.writeFileSync(path.join(root, rel), text); changed.push(rel); }
function replaceRequired(text, from, to, label) {
  if (text.includes(to)) return text;
  if (!text.includes(from)) throw new Error(`[promotion-expansion-4] Missing anchor: ${label}`);
  return text.replace(from, to);
}
function edit(rel, transform) {
  const before = read(rel);
  const after = transform(before);
  if (after !== before) write(rel, after);
}

edit('src/components/AppShell.tsx', text => {
  let out = replaceRequired(
    text,
    "import AbandonedPaymentBanner from './AbandonedPaymentBanner';",
    "import AbandonedPaymentBanner from './AbandonedPaymentBanner';\nimport { CompactPromoStrip } from './promotion/PromotionSurfaces';",
    'AppShell flyer import',
  );
  out = replaceRequired(
    out,
    "      <main id=\"main-content\" className={`${mainPadding} pb-20 md:pb-0 transition-all duration-300`}>\n        <AbandonedPaymentBanner />",
    "      <main id=\"main-content\" className={`${mainPadding} pb-20 md:pb-0 transition-all duration-300`}>\n        <CompactPromoStrip />\n        <AbandonedPaymentBanner />",
    'AppShell flyer slot',
  );
  return out;
});

edit('src/pages/DashboardPage.tsx', text => {
  let out = replaceRequired(
    text,
    "import SponsoredPlacementCard from '../components/promotion/SponsoredPlacementCard';",
    "import SponsoredPlacementCard from '../components/promotion/SponsoredPlacementCard';\nimport { DiscoveryPromoGallery } from '../components/promotion/PromotionSurfaces';",
    'Dashboard login gallery import',
  );
  out = replaceRequired(
    out,
    "      {/* AI Daily Summary */}\n      <div className=\"mb-6\">\n        <DailySummaryWidget />\n      </div>",
    "      {/* Post-login discovery gallery: dismissible and session-scoped. */}\n      <div className=\"mb-6\">\n        <DiscoveryPromoGallery placement=\"login_gallery\" />\n      </div>\n\n      {/* AI Daily Summary */}\n      <div className=\"mb-6\">\n        <DailySummaryWidget />\n      </div>",
    'Dashboard login gallery slot',
  );
  return out;
});

edit('src/pages/ProductDetailPage.tsx', text => {
  let out = replaceRequired(
    text,
    "import { formatCurrency } from '../lib/currency';",
    "import { formatCurrency } from '../lib/currency';\nimport SponsoredPlacementCard from '../components/promotion/SponsoredPlacementCard';",
    'Product detail sponsored import',
  );
  out = replaceRequired(
    out,
    "      {/* Personalized Recommendations */}\n      <PersonalizedRecommendations",
    "      {/* One contextual paid related-listing slot before organic recommendations. */}\n      <SponsoredPlacementCard placement=\"product_detail\" variant=\"compact\" className=\"mt-10\" />\n\n      {/* Personalized Recommendations */}\n      <PersonalizedRecommendations",
    'Product detail sponsored slot',
  );
  return out;
});

edit('src/pages/JobBoardPage.tsx', text => {
  let out = replaceRequired(
    text,
    "import NapFooter from '../components/NapFooter';",
    "import NapFooter from '../components/NapFooter';\nimport SponsoredPlacementCard from '../components/promotion/SponsoredPlacementCard';",
    'Job board sponsored import',
  );
  out = replaceRequired(
    out,
    "            {loading ? (\n              <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 gap-4' : 'space-y-3'}>",
    "            <SponsoredPlacementCard placement=\"jobs\" variant=\"compact\" className=\"mb-5\" />\n\n            {loading ? (\n              <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 gap-4' : 'space-y-3'}>",
    'Job board sponsored slot',
  );
  return out;
});

edit('src/pages/CreatorCampaignsPage.tsx', text => {
  let out = replaceRequired(
    text,
    "import { formatCurrency } from '../lib/currency';",
    "import { formatCurrency } from '../lib/currency';\nimport SponsoredPlacementCard from '../components/promotion/SponsoredPlacementCard';",
    'Creator campaigns sponsored import',
  );
  out = replaceRequired(
    out,
    "      {/* Campaign Grid */}\n      {loading && campaigns.length === 0 ? (",
    "      {/* Paid campaign/task discovery stays separate from organic ranking. */}\n      <SponsoredPlacementCard placement=\"campaign_feed\" variant=\"compact\" className=\"mb-6\" />\n\n      {/* Campaign Grid */}\n      {loading && campaigns.length === 0 ? (",
    'Creator campaigns sponsored slot',
  );
  return out;
});

console.log(`[promotion-expansion-4] changed ${changed.length} file(s)`);
for (const rel of changed) console.log(`  ${rel}`);
