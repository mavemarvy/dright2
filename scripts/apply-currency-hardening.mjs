import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const changed = [];
const warnings = [];

function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function write(rel, text) { fs.writeFileSync(path.join(root, rel), text); changed.push(rel); }
function ensureImport(text, modulePath, names = ['formatDisplayCurrency']) {
  const missing = names.filter(name => !new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*['\"]${modulePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['\"]`).test(text));
  if (!missing.length) return text;
  return `import { ${missing.join(', ')} } from '${modulePath}';\n${text}`;
}
function replaceExact(text, from, to, rel) {
  if (!text.includes(from)) { warnings.push(`${rel}: pattern not found: ${from.slice(0, 100)}`); return text; }
  return text.replaceAll(from, to);
}
function edit(rel, modulePath, fn) {
  const before = read(rel);
  let after = fn(before);
  if (after !== before && modulePath) after = ensureImport(after, modulePath);
  if (after !== before) write(rel, after);
}
function jsxDollarExpressions(text) {
  return text.replace(/>\$\{([^{}\n]+)\}/g, (_m, expr) => `>{formatDisplayCurrency(Number(${expr}))}`);
}
function templateDollarExpressions(text) {
  return text.replace(/\$\$\{([^{}\n]+)\}/g, (_m, expr) => `\${formatDisplayCurrency(Number(${expr}))}`);
}
function simpleMoney(rel, modulePath, extra) {
  edit(rel, modulePath, text => {
    let out = jsxDollarExpressions(text);
    out = templateDollarExpressions(out);
    return extra ? extra(out) : out;
  });
}

// Direct rendered monetary values (canonical DRIGHT amounts are USD unless a
// source currency is explicitly supplied below).
for (const [rel, modulePath] of [
  ['src/components/AISellerInsights.tsx', '../lib/currency'],
  ['src/components/GuestCheckout.tsx', '../lib/currency'],
  ['src/components/ProductInsights.tsx', '../lib/currency'],
  ['src/components/SalesAnalyticsSection.tsx', '../lib/currency'],
  ['src/components/UniversalAIAssistant.tsx', '../lib/currency'],
  ['src/components/analytics/ProductPerformanceTable.tsx', '../../lib/currency'],
  ['src/components/marketplace/SmartSearch.tsx', '../../lib/currency'],
  ['src/components/profile/UnifiedPublicProfile.tsx', '../../lib/currency'],
  ['src/pages/CampaignBuilderPage.tsx', '../lib/currency'],
  ['src/pages/CampaignDetailPage.tsx', '../lib/currency'],
  ['src/pages/CampaignWalletPage.tsx', '../lib/currency'],
  ['src/pages/CreatorCampaignsPage.tsx', '../lib/currency'],
  ['src/pages/CreatorDashboardPage.tsx', '../lib/currency'],
  ['src/pages/LandingPage.tsx', '../lib/currency'],
  ['src/pages/LeaderboardPage.tsx', '../lib/currency'],
  ['src/pages/MarketPage.tsx', '../lib/currency'],
  ['src/pages/PublicProfilePage.tsx', '../lib/currency'],
  ['src/pages/StorePage.tsx', '../lib/currency'],
  ['src/pages/UploadProductPage.tsx', '../lib/currency'],
  ['src/pages/admin/AdminAdminPerformancePage.tsx', '../../lib/currency'],
  ['src/pages/admin/AdminCrmDashboardPage.tsx', '../../lib/currency'],
  ['src/pages/admin/AdminMarketingDashboardPage.tsx', '../../lib/currency'],
  ['src/pages/admin/AdminProductEditsPage.tsx', '../../lib/currency'],
  ['src/pages/admin/SalesTeamMarketerApplicationsPage.tsx', '../../lib/currency'],
]) simpleMoney(rel, modulePath);

// ProductInsights has a human-readable analysis sentence in addition to JSX.
edit('src/components/ProductInsights.tsx', '../lib/currency', text =>
  text.replace(
    /Total revenue of \$\$\{stats\.totalRevenue\.toFixed\(2\)\}/g,
    'Total revenue of ${formatDisplayCurrency(stats.totalRevenue)}',
  )
);

// Campaign builder reward presets include JSX text before an expression.
edit('src/pages/CampaignBuilderPage.tsx', '../lib/currency', text => {
  let out = text.replace(/>\$\{r\}<\/button>/g, '>{formatDisplayCurrency(Number(r))}</button>');
  out = out.replace('Price = $0. Sales still count toward weekly streaks.', 'Price is free. Sales still count toward weekly streaks.');
  return out;
});

// Explicit NGN source values: convert from NGN to the selected display currency.
edit('src/pages/SubscriptionCheckoutPage.tsx', '../lib/currency', text =>
  text.replace(/>₦\{plan\.amount\.toLocaleString\(\)\}<\/span>/g, '>{formatDisplayCurrency(Number(plan.amount), \'NGN\')}</span>')
);

// AI/context strings should quote amounts in the same display currency the user sees.
edit('src/lib/ai/productQA.ts', '../currency', text =>
  text.replace("`Price: ${ctx.isFree ? 'Free' : '$' + ctx.price.toFixed(2)}`", "`Price: ${ctx.isFree ? 'Free' : formatDisplayCurrency(ctx.price)}`")
);
edit('src/lib/aiEngine.ts', './currency', text =>
  text.replace("suggestions.push('Review your pricing: competitive pricing within $5-$50 range converts best')", "suggestions.push(`Review your pricing: competitive pricing within ${formatDisplayCurrency(5)}-${formatDisplayCurrency(50)} range converts best`)")
);
edit('src/lib/aiProvider.ts', './currency', text => {
  let out = text;
  out = out.replaceAll('**Starter ($5, 3 days)**', '**Starter (${formatDisplayCurrency(5)}, 3 days)**');
  out = out.replaceAll('**Growth ($15, 7 days)**', '**Growth (${formatDisplayCurrency(15)}, 7 days)**');
  out = out.replaceAll('**Pro ($50, 30 days)**', '**Pro (${formatDisplayCurrency(50)}, 30 days)**');
  return out;
});

// Analytics assistant: remove USD-specific parsing and generate its sample goal dynamically.
edit('src/components/analytics/AdvancedAnalytics.tsx', '../../lib/currency', text => {
  let out = text.replace("'How do I reach $5,000 this month?',", '`How do I reach ${formatDisplayCurrency(5000)} this month?`,');
  out = out.replace("(qLower.includes('$') || qLower.includes('revenue') || qLower.includes('money'))", "(qLower.includes('revenue') || qLower.includes('money') || qLower.includes('income') || qLower.includes('sales'))");
  return out;
});

// Smart collection copy is a display-currency example, not a USD business rule.
edit('src/pages/SmartCollectionsPage.tsx', '../lib/currency', text => {
  let out = text.replace("subtitle: 'Great products under $50'", 'subtitle: `Great products under ${formatDisplayCurrency(50)}`');
  out = out.replace("subtitle: 'High-end products $100+'", 'subtitle: `High-end products ${formatDisplayCurrency(100)}+`');
  return out;
});

// Admin AI costs preserve sub-cent precision while changing display currency.
for (const [rel, modulePath] of [
  ['src/pages/admin/AdminAIConfigPage.tsx', '../../lib/currency'],
  ['src/pages/admin/AdminAIPage.tsx', '../../lib/currency'],
]) {
  edit(rel, modulePath, text => templateDollarExpressions(text).replace(
    /formatDisplayCurrency\(Number\(([^)]+\.toFixed\(4\))\)\)/g,
    'formatDisplayCurrency(Number($1), \'USD\', { minimumFractionDigits: 4, maximumFractionDigits: 4 })',
  ));
}

// Admin insight copy containing a fixed USD threshold becomes selected-currency copy.
edit('src/pages/admin/AdminAiInsightsPage.tsx', '../../lib/currency', text =>
  text.replace("description: 'Users with lifetime value > $500 have not logged in for 14+ days and have abandoned recent carts.'", "description: `Users with lifetime value > ${formatDisplayCurrency(500)} have not logged in for 14+ days and have abandoned recent carts.`")
);

// Upload-product free explanation contains no currency-bearing amount after this change.
edit('src/pages/UploadProductPage.tsx', '../lib/currency', text =>
  text.replace('Price = $0. Sales still count toward weekly streaks.', 'Price is free. Sales still count toward weekly streaks.')
);

// Local SEO uses $/$$/$$$ as standardized price-level categories, not money.
edit('src/pages/admin/AdminLocalSeoPage.tsx', null, text =>
  text.replace("const PRICE_RANGES = ['$', '$$', '$$$', '$$$$'];", "const PRICE_RANGES = ['$', '$$', '$$$', '$$$$']; // currency-audit-ignore: SEO price-level taxonomy")
);

// System-setting copy should not imply the admin's configured price is permanently USD.
edit('src/pages/admin/AdminSystemSettingsPage.tsx', '../../lib/currency', text =>
  text.replace('Partnership range: $200-$500 (use $350 as default mid-point).', 'Partnership range: ${formatDisplayCurrency(200)}-${formatDisplayCurrency(500)} (use ${formatDisplayCurrency(350)} as default mid-point).')
);

console.log(`[currency-hardening] changed ${changed.length} file(s)`);
for (const rel of changed) console.log(`  ${rel}`);
if (warnings.length) {
  console.warn(`[currency-hardening] ${warnings.length} warning(s)`);
  for (const warning of warnings) console.warn(`  ${warning}`);
}
