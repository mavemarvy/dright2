import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const ROOT = path.resolve(process.cwd(), 'src');
const STRICT = process.argv.includes('--strict');
const QUIET = process.argv.includes('--quiet');

const ALLOWLIST = new Set([
  path.normalize('src/lib/currency.ts'),
]);

const MONEY_SYMBOL_PATTERN = /(?:[$€£₦₵₹]\s*\d|\d\s*[$€£₦₵₹]|^\s*[$€£₦₵₹]\s*$|(?:C|A|US|CA)\$\s*\d)/;

function walk(dir) {
  const output = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) output.push(...walk(absolute));
    else if (/\.(?:ts|tsx)$/.test(entry.name)) output.push(absolute);
  }
  return output;
}

function literalText(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

const findings = [];

for (const file of walk(ROOT)) {
  const relative = path.normalize(path.relative(process.cwd(), file));
  if (ALLOWLIST.has(relative)) continue;

  const source = fs.readFileSync(file, 'utf8');
  const sourceLines = source.split(/\r?\n/);
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  function inspectText(text, node) {
    if (!text || !MONEY_SYMBOL_PATTERN.test(text)) return;
    const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    findings.push({
      file: relative.replaceAll('\\', '/'),
      line: location.line + 1,
      text: text.replace(/\s+/g, ' ').trim().slice(0, 140),
      sourceLine: (sourceLines[location.line] || '').trim().replace(/\s+/g, ' ').slice(0, 220),
    });
  }

  function visit(node) {
    const direct = literalText(node);
    if (direct !== null) inspectText(direct, node);

    if (ts.isTemplateExpression(node)) {
      inspectText(node.head.text, node.head);
      for (const span of node.templateSpans) inspectText(span.literal.text, span.literal);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

if (!QUIET) {
  if (findings.length === 0) {
    console.log('[currency-audit] PASS: no hard-coded monetary currency symbols found in src/.');
  } else {
    console.warn(`[currency-audit] Found ${findings.length} hard-coded monetary currency string(s):`);
    for (const item of findings) {
      console.warn(`  ${item.file}:${item.line}  ${JSON.stringify(item.text)}`);
      console.warn(`    ${item.sourceLine}`);
    }
    console.warn('[currency-audit] Monetary UI must use useCurrency().format(amount, sourceCurrency) or the shared currency helpers.');
  }
}

if (STRICT && findings.length > 0) process.exit(1);
