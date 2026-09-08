import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const changed = [];
const warnings = [];

function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function write(rel, text) { fs.writeFileSync(path.join(root, rel), text); changed.push(rel); }
function ensureImport(text, modulePath, names = ['formatDisplayCurrency']) {
  const escapedModule = modulePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const missing = names.filter(name => !new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*['\"]${escapedModule}['\"]`).test(text));
  if (!missing.length) return text;
  return `import { ${missing.join(', ')} } from '${modulePath}';\n${text}`;
}
function replaceIfPresent(text, from, to) {
  return text.includes(from) ? text.replaceAll(from, to) : text;
}
function edit(rel, modulePath, fn, names = ['formatDisplayCurrency']) {
  const before = read(rel);
  let after = fn(before);
  if (after !== before && modulePath) after = ensureImport(after, modulePath, names);
  if (after !== before) write(rel, after);
}
function jsxDollarExpressions(text) {
  return text.replace(/>(\s*)\$\{([^{}\n]+)\}/g, (_m, spacing, expr) => `>${spacing}{formatDisplayCurrency(Number(${expr}))}`);
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

// Direct rendered monetary values. Canonical DRIGHT marketplace amounts are USD
// unless an explicit source currency is supplied in a dedicated rule below.
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
]) simpleMoney(rel, modulePath);

// Campaign wallet signed rows need one formatted monetary value rather than a
// manually concatenated currency symbol.
edit('src/pages/CampaignWalletPage.tsx', '../lib/currency', text =>
  text.replace(
    "{Number(tx.amount) >= 0 ? '+' : ''}${Number(tx.amount).toFixed(2)}",
    "{Number(tx.amount) >= 0 ? `+${formatDisplayCurrency(Number(tx.amount))}` : formatDisplayCurrency(Number(tx.amount))}",
  )
);

// Campaign builder reward presets include JSX text before an expression.
edit('src/pages/CampaignBuilderPage.tsx', '../lib/currency', text =>
  text.replace(/>\$\{r\}<\/button>/g, '>{formatDisplayCurrency(Number(r))}</button>')
);

// Explicit NGN source values: convert the source amount safely for display.
edit('src/pages/SubscriptionCheckoutPage.tsx', '../lib/currency', text =>
  text.replace(/>₦\{plan\.amount\.toLocaleString\(\)\}<\/span>/g, '>{formatDisplayCurrency(Number(plan.amount), \'NGN\')}</span>')
);

// Standalone symbols in labels/defaults become explicit ISO currency codes.
edit('src/components/PromotionWizard.tsx', null, text =>
  text.replace("{pricing?.currency === 'USD' ? '$' : ''}", "{pricing?.currency || 'USD'}")
);
edit('src/components/profile/EmployerProfile.tsx', null, text =>
  text.replace("Salary: {job.salary_currency || '$'}", "Salary currency: {job.salary_currency || 'USD'}")
);
edit('src/pages/ProfilePage.tsx', null, text =>
  text.replace("currency: '$',", "currency: 'USD',")
);

// AI/context strings quote amounts in the same display currency the user sees.
edit('src/lib/ai/productQA.ts', '../currency', text =>
  text.replace("`Price: ${ctx.isFree ? 'Free' : '$' + ctx.price.toFixed(2)}`", "`Price: ${ctx.isFree ? 'Free' : formatDisplayCurrency(ctx.price)}`")
);
edit('src/lib/aiEngine.ts', './currency', text => {
  let out = text.replace(
    "suggestions.push('Review your pricing: competitive pricing within $5-$50 range converts best')",
    "suggestions.push(`Review your pricing: competitive pricing within ${formatDisplayCurrency(5)}-${formatDisplayCurrency(50)} range converts best`)",
  );
  out = out.replace(
    "`Your price is above the category average ($${avgPrice.toFixed(2)}). Consider lowering to $${suggestedOptimal.toFixed(2)} for better conversion.`",
    "`Your price is above the category average (${formatDisplayCurrency(avgPrice)}). Consider lowering to ${formatDisplayCurrency(suggestedOptimal)} for better conversion.`",
  );
  out = out.replace(
    "`Your price is below market value. You could increase to $${suggestedOptimal.toFixed(2)} without losing sales.`",
    "`Your price is below market value. You could increase to ${formatDisplayCurrency(suggestedOptimal)} without losing sales.`",
  );
  out = out.replace(
    "`Your price is competitive. The optimal range is $${suggestedMin.toFixed(2)}-$${suggestedMax.toFixed(2)}.`",
    "`Your price is competitive. The optimal range is ${formatDisplayCurrency(suggestedMin)}-${formatDisplayCurrency(suggestedMax)}.`",
  );
  out = out.replace(
    "I recommend a $${suggestedBudget} budget over ${suggestedDuration} days.",
    "I recommend a ${formatDisplayCurrency(suggestedBudget)} budget over ${suggestedDuration} days.",
  );
  return out;
});
edit('src/lib/aiProvider.ts', './currency', text => {
  let out = text;
  out = out.replaceAll('**Starter ($5, 3 days)**', '**Starter (${formatDisplayCurrency(5)}, 3 days)**');
  out = out.replaceAll('**Growth ($15, 7 days)**', '**Growth (${formatDisplayCurrency(15)}, 7 days)**');
  out = out.replaceAll('**Pro ($50, 30 days)**', '**Pro (${formatDisplayCurrency(50)}, 30 days)**');
  return out;
});

// Analytics assistant: remove USD-symbol-specific parsing and generate its goal dynamically.
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

// Notification formatter now accepts ISO currency codes instead of defaulting to
// a presentation symbol. Existing invalid legacy values safely fall back to USD.
edit('src/lib/notificationTemplates.ts', null, text => {
  let out = text.replace("export function formatCurrency(amount: number, currency = '$', locale = 'en-US'): string {", "export function formatCurrency(amount: number, currency = 'USD', locale = 'en-US'): string {");
  out = out.replace("currency: currency === '$' ? 'USD' : currency,", "currency: /^[A-Z]{3}$/i.test(currency) ? currency.toUpperCase() : 'USD',");
  return out;
});

// Admin AI costs preserve sub-cent precision while changing display currency.
edit('src/pages/admin/AdminAIConfigPage.tsx', '../../lib/currency', text =>
  text.replace("value={`$${cost.toFixed(4)}`}", "value={formatDisplayCurrency(cost, 'USD', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}")
);
edit('src/pages/admin/AdminAIPage.tsx', '../../lib/currency', text =>
  text.replace("${usage.estimatedCost.toFixed(4)}", "{formatDisplayCurrency(usage.estimatedCost, 'USD', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}")
);

// Admin insight copy containing a fixed USD threshold becomes selected-currency copy.
edit('src/pages/admin/AdminAiInsightsPage.tsx', '../../lib/currency', text =>
  text.replace(
    "description: 'Users with lifetime value > $500 have not logged in for 14+ days and have abandoned recent carts.'",
    "description: `Users with lifetime value > ${formatDisplayCurrency(500)} have not logged in for 14+ days and have abandoned recent carts.`",
  )
);

// Admin promotion pricing is stored/configured in canonical USD; make that source
// currency explicit rather than showing a generic dollar symbol.
edit('src/pages/admin/AdminPromotionsPage.tsx', null, text => {
  let out = text.replaceAll("prefix: '$'", "prefix: 'USD'");
  return out;
});

// Sales-team application amounts use the shared display formatter.
edit('src/pages/admin/SalesTeamMarketerApplicationsPage.tsx', '../../lib/currency', text =>
  text.replace(
    "const money=(v:any)=>typeof v==='number'&&Number.isFinite(v)?`$${v.toLocaleString(undefined,{maximumFractionDigits:2})}`:'UNKNOWN';",
    "const money=(v:any)=>typeof v==='number'&&Number.isFinite(v)?formatDisplayCurrency(v):'UNKNOWN';",
  )
);

// Upload-product free explanation contains no currency-bearing amount.
edit('src/pages/UploadProductPage.tsx', '../lib/currency', text =>
  text.replace('Price = $0. Sales still count toward weekly streaks.', 'Price is free. Sales still count toward weekly streaks.')
);

// Local SEO uses $/$$/$$$ as standardized price-level categories, not money.
edit('src/pages/admin/AdminLocalSeoPage.tsx', null, text =>
  text.replace("const PRICE_RANGES = ['$', '$$', '$$$', '$$$$'];", "const PRICE_RANGES = ['$', '$$', '$$$', '$$$$']; // currency-audit-ignore: SEO price-level taxonomy")
);

// Admin system settings edit canonical USD values. Keep the configuration source
// currency explicit so admins are never shown converted values while editing USD.
edit('src/pages/admin/AdminSystemSettingsPage.tsx', null, text => {
  let out = text.replace('{grade} ($/week)', '{grade} (USD/week)');
  out = out.replace('Partnership range: $200-$500 (use $350 as default mid-point).', 'Partnership range: USD 200-USD 500 (use USD 350 as default mid-point).');
  return out;
});

console.log(`[currency-hardening] changed ${changed.length} file(s)`);
for (const rel of changed) console.log(`  ${rel}`);
if (warnings.length) {
  console.warn(`[currency-hardening] ${warnings.length} warning(s)`);
  for (const warning of warnings) console.warn(`  ${warning}`);
}
