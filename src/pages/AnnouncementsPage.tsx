import { useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  AtSign,
  Bell,
  ExternalLink,
  Loader2,
  Megaphone,
  Pin,
  Share2,
  ShoppingBag,
  Tag,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react';
import SeoHead from '../components/SeoHead';
import SponsoredPlacementCard from '../components/promotion/SponsoredPlacementCard';
import { supabase } from '../lib/supabase';
import NewsPage from './NewsPage';

type AnnouncementCategory = 'announcement' | 'update' | 'market' | 'affiliate' | 'promo' | 'referral' | 'news';
type Filter = 'all' | Exclude<AnnouncementCategory, 'news'>;
type SortOption = 'newest' | 'oldest' | 'trending';

interface Announcement {
  id: string;
  title: string;
  message: string;
  type: AnnouncementCategory;
  content_kind: 'announcement' | 'news';
  show_in_news: boolean;
  is_active: boolean;
  is_pinned: boolean;
  is_trending: boolean;
  mention_all: boolean;
  view_count: number;
  media_url: string | null;
  media_type: 'image' | 'video' | null;
  external_url: string | null;
  cta_label: string | null;
  created_at: string;
  published_at: string;
  updated_at: string;
}

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'announcement', label: 'Announcements' },
  { value: 'update', label: 'Updates' },
  { value: 'market', label: 'Market' },
  { value: 'affiliate', label: 'Affiliate' },
  { value: 'promo', label: 'Promo' },
  { value: 'referral', label: 'Referral' },
];

const CONFIG: Record<Exclude<AnnouncementCategory, 'news'>, { icon: LucideIcon; label: string; color: string; bg: string }> = {
  announcement: { icon: Megaphone, label: 'Announcement', color: 'text-slate-700 dark:text-slate-200', bg: 'bg-slate-100 dark:bg-slate-700' },
  update: { icon: AlertTriangle, label: 'Update', color: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-50 dark:bg-amber-900/20' },
  market: { icon: ShoppingBag, label: 'Market', color: 'text-cyan-700 dark:text-cyan-300', bg: 'bg-cyan-50 dark:bg-cyan-900/20' },
  affiliate: { icon: Users, label: 'Affiliate', color: 'text-violet-700 dark:text-violet-300', bg: 'bg-violet-50 dark:bg-violet-900/20' },
  promo: { icon: Tag, label: 'Promo', color: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
  referral: { icon: Share2, label: 'Referral', color: 'text-pink-700 dark:text-pink-300', bg: 'bg-pink-50 dark:bg-pink-900/20' },
};

function normalizedCategory(type: AnnouncementCategory): Exclude<AnnouncementCategory, 'news'> {
  return type === 'news' ? 'announcement' : type;
}

function AnnouncementsContent() {
  const [searchParams, setSearchParams] = useSearchParams();
  const targetItemId = searchParams.get('item');
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<SortOption>('newest');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('global_announcements')
        .select('id,title,message,type,content_kind,show_in_news,is_active,is_pinned,is_trending,mention_all,view_count,media_url,media_type,external_url,cta_label,created_at,published_at,updated_at')
        .eq('is_active', true)
        .eq('content_kind', 'announcement')
        .order('published_at', { ascending: false });

      if (!active) return;
      setAnnouncements((data || []) as Announcement[]);
      setLoading(false);
    };
    void load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!targetItemId || loading || !announcements.some((item) => item.id === targetItemId)) return;
    const node = document.getElementById(`announcement-${targetItemId}`);
    if (node) window.requestAnimationFrame(() => node.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }, [announcements, loading, targetItemId]);

  const filtered = useMemo(() => {
    const list = filter === 'all'
      ? announcements
      : announcements.filter((announcement) => normalizedCategory(announcement.type) === filter);

    return [...list].sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      if (sort === 'oldest') return new Date(a.published_at).getTime() - new Date(b.published_at).getTime();
      if (sort === 'trending') {
        if (a.is_trending !== b.is_trending) return a.is_trending ? -1 : 1;
        if ((b.view_count || 0) !== (a.view_count || 0)) return (b.view_count || 0) - (a.view_count || 0);
      }
      return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
    });
  }, [announcements, filter, sort]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <SeoHead title="Announcements" description="Official DRIGHT announcements, platform updates, promotions, marketplace, affiliate, and referral notices." canonical="/announcements" />

      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 px-4 py-12 text-white sm:py-14">
        <div className="mx-auto max-w-4xl text-center">
          <Megaphone className="mx-auto mb-4 h-12 w-12 opacity-80" />
          <h1 className="mb-3 text-3xl font-bold sm:text-4xl">Announcements</h1>
          <p className="text-blue-100">Official DRIGHT announcements and important platform notices.</p>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-8 sm:py-10">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {FILTERS.map((item) => (
              <button key={item.value} type="button" onClick={() => setFilter(item.value)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${filter === item.value ? 'bg-blue-600 text-white' : 'border border-gray-200 bg-white text-gray-600 hover:border-blue-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}>
                {item.label}
              </button>
            ))}
          </div>
          <select value={sort} onChange={(event) => setSort(event.target.value as SortOption)} className="min-h-[42px] rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200" aria-label="Sort announcements">
            <option value="newest">Recently posted</option>
            <option value="oldest">Oldest first</option>
            <option value="trending">Trending</option>
          </select>
        </div>

        <SponsoredPlacementCard placement="announcement_banner" variant="compact" className="mb-6" heading="Sponsored announcement" />

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-14 text-center text-gray-400"><Bell className="mx-auto mb-3 h-12 w-12 opacity-30" /><p>No announcements available.</p></div>
        ) : (
          <div className="space-y-5">
            {filtered.map((announcement, index) => {
              const category = normalizedCategory(announcement.type);
              const config = CONFIG[category];
              const Icon = config.icon;
              const targeted = targetItemId === announcement.id;

              return (
                <motion.article id={`announcement-${announcement.id}`} key={announcement.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.04, 0.2) }} className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition dark:bg-gray-800 ${targeted ? 'border-blue-500 ring-2 ring-blue-500/20' : announcement.is_pinned ? 'border-blue-200 dark:border-blue-800' : 'border-gray-100 dark:border-gray-700'}`}>
                  {announcement.media_url && (
                    <div className="max-h-[520px] overflow-hidden bg-black">
                      {announcement.media_type === 'video' ? <video src={announcement.media_url} controls playsInline preload="metadata" className="max-h-[520px] w-full object-contain" /> : <img src={announcement.media_url} alt="" loading="lazy" className="max-h-[520px] w-full object-cover" />}
                    </div>
                  )}

                  <div className="p-5">
                    <div className="flex items-start gap-3">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${config.bg}`}><Icon className={`h-5 w-5 ${config.color}`} /></div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium uppercase ${config.bg} ${config.color}`}>{config.label}</span>
                          {announcement.is_pinned && <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"><Pin className="h-3 w-3" />Pinned</span>}
                          {announcement.is_trending && <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold uppercase text-orange-700 dark:bg-orange-900/20 dark:text-orange-300"><TrendingUp className="h-3 w-3" />Trending</span>}
                          {announcement.mention_all && <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold uppercase text-violet-700 dark:bg-violet-900/20 dark:text-violet-300"><AtSign className="h-3 w-3" />All DRIGHT</span>}
                          {announcement.show_in_news && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">Also in News</span>}
                          <span className="text-xs text-gray-400">{new Date(announcement.published_at).toLocaleDateString()}</span>
                        </div>
                        <button type="button" onClick={() => setSearchParams({ item: announcement.id })} className="text-left"><h2 className="text-lg font-semibold text-gray-900 hover:text-blue-600 dark:text-white dark:hover:text-blue-300">{announcement.title}</h2></button>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-600 dark:text-gray-300">{announcement.message}</p>

                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          {announcement.external_url && <a href={announcement.external_url} target="_blank" rel="noreferrer" className="inline-flex min-h-[38px] items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700">{announcement.cta_label || 'Learn more'} <ExternalLink className="h-3.5 w-3.5" /></a>}
                          {announcement.show_in_news && <a href={`/news?item=${announcement.id}`} className="inline-flex min-h-[38px] items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">View in News <ExternalLink className="h-3.5 w-3.5" /></a>}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AnnouncementsPage() {
  const location = useLocation();
  return location.pathname === '/news' ? <NewsPage /> : <AnnouncementsContent />;
}
