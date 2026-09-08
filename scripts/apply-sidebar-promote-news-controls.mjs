import fs from 'node:fs';
import path from 'node:path';

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

function write(rel, text) {
  fs.writeFileSync(path.join(process.cwd(), rel), text);
}

function replaceRequired(text, from, to, label) {
  if (text.includes(to)) return text;
  if (!text.includes(from)) throw new Error(`[sidebar-promote-news-controls] Missing anchor: ${label}`);
  return text.replace(from, to);
}

// AppShell: restore desktop interface controls and expose News + Promote.
{
  const rel = 'src/components/AppShell.tsx';
  let text = read(rel);
  const original = text;

  text = replaceRequired(
    text,
    "  Gift,\n} from 'lucide-react';",
    "  Gift, Newspaper, Rocket,\n} from 'lucide-react';",
    'sidebar icons import',
  );

  text = replaceRequired(
    text,
`type NavEntry = {
  path: string;
  labelKey: TranslationKey;
  icon: React.ComponentType<{ className?: string }>;
  roles?: string[];
};`,
`type NavEntry = {
  path: string;
  labelKey?: TranslationKey;
  label?: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: string[];
};

const navLabel = (item: NavEntry, t: (key: TranslationKey) => string): string =>
  item.label ?? (item.labelKey ? t(item.labelKey) : item.path);`,
    'allow explicit nav labels',
  );

  text = replaceRequired(
    text,
`const primaryNav: NavEntry[] = [
  { path: '/', labelKey: 'dashboard', icon: LayoutDashboard },
  { path: '/market', labelKey: 'market', icon: Store },
];`,
`const primaryNav: NavEntry[] = [
  { path: '/', labelKey: 'dashboard', icon: LayoutDashboard },
  { path: '/market', labelKey: 'market', icon: Store },
  { path: '/news', label: 'News', icon: Newspaper },
  { path: '/promote', label: 'Promote', icon: Rocket },
];`,
    'top level News and Promote navigation',
  );

  text = text.replaceAll('t(item.labelKey)', 'navLabel(item, t)');

  text = replaceRequired(
    text,
`          {/* Admin Link */}`,
`          {/* Desktop interface controls stay inside the scrollable sidebar so they never cover navigation. */}
          {!collapsed && <UIPreferencesToggles />}

          {/* Admin Link */}`,
    'restore desktop interface options',
  );

  if (text !== original) {
    write(rel, text);
    console.log('[sidebar-promote-news-controls] updated AppShell.tsx');
  }
}

// App route: News is a protected sidebar field using the existing announcements/news source.
{
  const rel = 'src/App.tsx';
  let text = read(rel);
  const original = text;
  text = replaceRequired(
    text,
    `<Route element={<ProtectedRoute><AppShell/></ProtectedRoute>}><Route path="/" element={<DashboardPage/>}/>`,
    `<Route element={<ProtectedRoute><AppShell/></ProtectedRoute>}><Route path="/" element={<DashboardPage/>}/><Route path="/news" element={<AnnouncementsPage/>}/>`,
    'protected News route',
  );
  if (text !== original) {
    write(rel, text);
    console.log('[sidebar-promote-news-controls] updated App.tsx');
  }
}

// AnnouncementsPage: make /news a dedicated news-first field while preserving /announcements.
{
  const rel = 'src/pages/AnnouncementsPage.tsx';
  let text = read(rel);
  const original = text;

  text = replaceRequired(
    text,
    `import { useState, useEffect } from 'react';\nimport { motion } from 'framer-motion';`,
    `import { useState, useEffect } from 'react';\nimport { useLocation } from 'react-router-dom';\nimport { motion } from 'framer-motion';`,
    'news route location import',
  );

  text = replaceRequired(
    text,
`export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');`,
`export default function AnnouncementsPage() {
  const location = useLocation();
  const newsField = location.pathname === '/news';
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>(newsField ? 'news' : 'all');

  useEffect(() => {
    setFilter(newsField ? 'news' : 'all');
  }, [newsField]);`,
    'news-first filter state',
  );

  text = replaceRequired(
    text,
    `      <SeoHead title="Announcements" description="Latest news, updates, and promotions from DRIGHT." canonical="/announcements" />`,
    `      <SeoHead\n        title={newsField ? 'News' : 'Announcements'}\n        description={newsField ? 'Latest news from DRIGHT.' : 'Latest news, updates, and promotions from DRIGHT.'}\n        canonical={newsField ? '/news' : '/announcements'}\n      />`,
    'news SEO metadata',
  );

  text = replaceRequired(
    text,
`          <h1 className="text-3xl sm:text-4xl font-bold mb-3">Announcements</h1>
          <p className="text-blue-100">Stay up to date with the latest from DRIGHT</p>`,
`          <h1 className="text-3xl sm:text-4xl font-bold mb-3">{newsField ? 'News' : 'Announcements'}</h1>
          <p className="text-blue-100">{newsField ? 'Latest DRIGHT stories, product news, and platform updates' : 'Stay up to date with the latest from DRIGHT'}</p>`,
    'news field heading',
  );

  text = replaceRequired(
    text,
    `<div className="text-center py-12 text-gray-400"><Bell className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>No announcements available.</p></div>`,
    `<div className="text-center py-12 text-gray-400"><Bell className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>{newsField ? 'No news available.' : 'No announcements available.'}</p></div>`,
    'news empty state',
  );

  if (text !== original) {
    write(rel, text);
    console.log('[sidebar-promote-news-controls] updated AnnouncementsPage.tsx');
  }
}
