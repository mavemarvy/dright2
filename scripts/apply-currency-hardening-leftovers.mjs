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

function ensureImport(text, modulePath) {
  const escaped = modulePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const already = new RegExp(`import\\s*\\{[^}]*\\bformatDisplayCurrency\\b[^}]*\\}\\s*from\\s*['\"]${escaped}['\"]`).test(text);
  return already ? text : `import { formatDisplayCurrency } from '${modulePath}';\n${text}`;
}

function edit(rel, modulePath, transform) {
  const before = read(rel);
  let after = transform(before);
  if (after !== before && modulePath) after = ensureImport(after, modulePath);
  if (after !== before) write(rel, after);
}

edit('src/components/analytics/ProductPerformanceTable.tsx', '../../lib/currency', text =>
  text.replace(
    '<p className="text-2xl font-bold text-green-500">${projectedRevenue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>',
    '<p className="text-2xl font-bold text-green-500">{formatDisplayCurrency(projectedRevenue)}</p>',
  )
);

edit('src/lib/aiProvider.ts', './currency', text => {
  let out = text.replace(
    '**Premium ($30, 14 days)**',
    '**Premium (${formatDisplayCurrency(30)}, 14 days)**',
  );
  out = out.replace('• **Average price**: ${avg.toFixed(2)}', '• **Average price**: ${formatDisplayCurrency(avg)}');
  out = out.replace('• **Median price**: ${median.toFixed(2)}', '• **Median price**: ${formatDisplayCurrency(median)}');
  out = out.replace('• **Price range**: ${min.toFixed(2)} - ${max.toFixed(2)}', '• **Price range**: ${formatDisplayCurrency(min)} - ${formatDisplayCurrency(max)}');
  out = out.replace('a $2-3 difference can change conversion by 30%', 'a ${formatDisplayCurrency(2)}-${formatDisplayCurrency(3)} difference can change conversion by 30%');
  return out;
});

edit('src/pages/admin/AdminAdminPerformancePage.tsx', '../../lib/currency', text => {
  let out = text.replace(
    'value={`$${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 0 })}`}',
    "value={formatDisplayCurrency(totalRevenue, 'USD', { maximumFractionDigits: 0 })}",
  );
  out = out.replace(
    '${Number(r.revenue_influenced).toLocaleString(undefined, { minimumFractionDigits: 0 })}',
    "{formatDisplayCurrency(Number(r.revenue_influenced), 'USD', { maximumFractionDigits: 0 })}",
  );
  return out;
});

edit('src/pages/admin/AdminCrmDashboardPage.tsx', '../../lib/currency', text => {
  let out = text.replace(
    'value={`$${totalLTV.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}',
    "value={formatDisplayCurrency(totalLTV, 'USD', { maximumFractionDigits: 0 })}",
  );
  out = out.replace(
    '${Number(c.lifetime_value).toLocaleString(undefined, { minimumFractionDigits: 0 })}',
    "{formatDisplayCurrency(Number(c.lifetime_value), 'USD', { maximumFractionDigits: 0 })}",
  );
  return out;
});

edit('src/pages/admin/AdminMarketingDashboardPage.tsx', '../../lib/currency', text => {
  let out = text.replaceAll(
    'value={`$${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 0 })}`}',
    "value={formatDisplayCurrency(totalRevenue, 'USD', { maximumFractionDigits: 0 })}",
  );
  out = out.replace(
    '${Number(c.budget).toLocaleString(undefined, { minimumFractionDigits: 0 })}',
    "{formatDisplayCurrency(Number(c.budget), 'USD', { maximumFractionDigits: 0 })}",
  );
  out = out.replace(
    '${remaining.toLocaleString(undefined, { minimumFractionDigits: 0 })} left',
    "{formatDisplayCurrency(remaining, 'USD', { maximumFractionDigits: 0 })} left",
  );
  return out;
});

edit('src/pages/admin/AdminPromotionsPage.tsx', '../../lib/currency', text =>
  text.replace(
    '<span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">${pkg.price}</span>',
    '<span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">{formatDisplayCurrency(Number(pkg.price))}</span>',
  )
);

// Google/local SEO commonly represents price levels as $, $$, $$$, $$$$.
// These are taxonomy tokens rather than monetary amounts, so mark only lines
// containing those standalone string tokens as intentional audit exceptions.
edit('src/pages/admin/AdminLocalSeoPage.tsx', null, text =>
  text
    .split(/\r?\n/)
    .map(line => {
      if (line.includes('currency-audit-ignore')) return line;
      if (/(['"])\${1,4}\1/.test(line)) {
        return `${line} // currency-audit-ignore: local SEO price-level taxonomy`;
      }
      return line;
    })
    .join('\n')
);

console.log(`[currency-hardening-leftovers] changed ${changed.length} file(s)`);
for (const rel of changed) console.log(`  ${rel}`);
