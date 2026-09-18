import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const app = read('src/App.tsx');
const userShell = read('src/components/AppShell.tsx');
const adminShell = read('src/components/AdminShell.tsx');
const adminPermissions = read('src/lib/adminPermissions.ts');

function unique(values) { return [...new Set(values)]; }
function quotedPaths(source) {
  return unique([...source.matchAll(/\bpath:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]));
}
function routePaths(source) {
  return unique([...source.matchAll(/<Route\s+[^>]*path=['"]([^'"]+)['"]/g)].map((m) => m[1]));
}
function adminNavEntries(source) {
  return [...source.matchAll(/\{\s*path:\s*['"]([^'"]+)['"],\s*label:\s*['"][^'"]+['"],\s*icon:\s*[^,]+,\s*page:\s*['"]([^'"]+)['"]\s*\}/g)]
    .map((m) => ({ path: m[1], page: m[2] }));
}
function adminPermissionMappings(source) {
  const entries = [...source.matchAll(/['"](\/admin[^'"]*)['"]\s*:\s*['"]([^'"]+)['"]/g)]
    .map((m) => [m[1], m[2]]);
  return new Map(entries);
}

const appRoutes = routePaths(app);
const userPaths = quotedPaths(userShell).filter((path) => path.startsWith('/'));
const adminEntries = adminNavEntries(adminShell);
const permissionMap = adminPermissionMappings(adminPermissions);
const failures = [];

function appHasUserPath(path) {
  if (appRoutes.includes(path)) return true;
  return appRoutes.some((route) => route.endsWith('/*') && path.startsWith(route.slice(0, -2)));
}

function appHasAdminPath(path) {
  if (path === '/admin') return appRoutes.includes('/admin');
  const child = path.replace(/^\/admin\/?/, '');
  return appRoutes.includes(child);
}

for (const path of userPaths) {
  if (!appHasUserPath(path)) failures.push(`User sidebar route is missing from App.tsx: ${path}`);
}

for (const { path, page } of adminEntries) {
  if (!appHasAdminPath(path)) failures.push(`Admin sidebar route is missing from App.tsx: ${path}`);
  const mapped = permissionMap.get(path);
  if (!mapped) failures.push(`Admin route has no canAccessPath permission mapping: ${path}`);
  else if (mapped !== page) failures.push(`Admin permission mismatch for ${path}: sidebar=${page}, canAccessPath=${mapped}`);
}

const duplicateAdminPaths = adminEntries.map((entry) => entry.path).filter((path, index, arr) => arr.indexOf(path) !== index);
for (const path of unique(duplicateAdminPaths)) failures.push(`Duplicate Admin sidebar path: ${path}`);

if (failures.length) {
  console.error('[navigation-audit] FAILED');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(`[navigation-audit] PASS: ${userPaths.length} user sidebar routes and ${adminEntries.length} admin sidebar routes are wired and permission-aligned.`);
