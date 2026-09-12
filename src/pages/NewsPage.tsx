import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  AtSign,
  Bell,
  ExternalLink,
  Loader2,
  Megaphone,
  Newspaper,
  Pin,
  Share2,
  ShoppingBag,
  Sparkles,
  Tag,
  TrendingUp,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import SeoHead from '../components/SeoHead';
import { DrightMark } from '../components/DrightBrand';
import SponsoredPlacementCard from '../components/promotion/SponsoredPlacementCard';
import { supabase } from '../lib/supabase';

type ContentKind = 'news' | 'announcement';
type NewsCategory = 'news' | 'update' | 'market' | 'affiliate' | 'announcement' | 'promo' | 'referral';
type NewsFilter = 'all' | NewsCategory;
type SortOption = 'newest' | 'oldest' | 'trending';
type MediaType = 'image' | 'video';

interface NewsItem {
  id: string;
  title: string;
  message: string;
  type: NewsCategory;
  content_kind: ContentKind;
  show_in_news: boolean;
  is_active: boolean;
  is_pinned: boolean;
  is_trending: boolean;
  mention_all: boolean;
  view_count: number;
  media_url: string | null;
  media_type: MediaType | null;
  external_url: string | null;
  cta_label: string | null;
  created_at: string;
  published_at: string;
  updated_at: string;
}

const categories: { value: NewsFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'news', label: 'News' },
  { value: 'update', label: 'Updates' },
  { value: 'market', label: 'Market' },
  { value: 'affiliate', label: 'Affiliate' },
  { value: 'announcement', label: 'Announcements' },
  { value: 'promo', label: 'Promo' },
  { value: 'referral', label: 'Referral' },
];

const categoryConfig: Record<NewsCategory, { icon: LucideIcon; label: string; accent: string; badge: string }> = {
  news: { icon: Newspaper, label: 'News', accent: 'text-blue-300', badge: 'border-blue-400/20 bg-blue-500/10 text-blue-300' },
  update: { icon: AlertTriangle, label: 'Update', accent: 'text-amber-300', badge: 'border-amber-400/20 bg-amber-500/10 text-amber-300' },
  market: { icon: ShoppingBag, label: 'Market', accent: 'text-cyan-300', badge: 'border-cyan-400/20 bg-cyan-500/10 text-cyan-300' },
  affiliate: { icon: Users, label: 'Affiliate', accent: 'text-violet-300', badge: 'border-violet-400/20 bg-violet-500/10 text-violet-300' },
  announcement: { icon: Megaphone, label: 'Announcement', accent: 'text-slate-200', badge: 'border-slate-400/20 bg-slate-500/10 text-slate-200' },
  promo: { icon: Tag, label: 'Promo', accent: 'text-emerald-300', badge: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300' },
  referral: { icon: Share2, label: 'Referral', accent: 'text-pink-300', badge: 'border-pink-400/20 bg-pink-500/10 text-pink-300' },
};

function itemCategory(item: NewsItem): NewsCategory {
  if (item.content_kind === 'announcement') return 'announcement';
  return categoryConfig[item.type] ? item.type : 'news';
}

export default function NewsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const targetItemId = searchParams.get('item');
  const viewedTargetRef = useRef<string | null>(null);
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<NewsFilter>('all');
  const [sort, setSort] = useState<SortOption>('newest');
  const [welcomeVisible, setWelcomeVisible] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('global_announcements')
        .select('id,title,message,type,content_kind,show_in_news,is_active,is_pinned,is_trending,mention_all,view_count,media_url,media_type,external_url,cta_label,created_at,published_at,updated_at')
        .eq('is_active', true)
        .order('published_at', { ascending: false });

      if (!active) return;
      const visible = ((data || []) as NewsItem[]).filter((item) => item.content_kind === 'news' || item.show_in_news);
      setItems(visible);
      setLoading(false);
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!targetItemId || loading || !items.some((item) => item.id === targetItemId)) return;

    const node = document.getElementById(`news-${targetItemId}`);
    if (node) {
      window.requestAnimationFrame(() => node.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    }

    if (viewedTargetRef.current !== targetItemId) {
      viewedTargetRef.current = targetItemId;
      void supabase.rpc('record_global_content_view', { p_content_id: targetItemId });
    }
  }, [items, loading, targetItemId]);

  const filtered = useMemo(() => {
    const categoryFiltered = filter === 'all'
      ? items
      : filter === 'announcement'
        ? items.filter((item) => item.content_kind === 'announcement')
        : items.filter((item) => item.content_kind === 'news' && item.type === filter);

    return [...categoryFiltered].sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      if (sort === 'oldest') return new Date(a.published_at).getTime() - new Date(b.published_at).getTime();
      if (sort === 'trending') {
        if (a.is_trending !== b.is_trending) return a.is_trending ? -1 : 1;
        if ((b.view_count || 0) !== (a.view_count || 0)) return (b.view_count || 0) - (a.view_count || 0);
      }
      return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
    });
  }, [filter, items, sort]);

  const sponsoredPlacement = filter === 'promo' ? 'announcement_feed' : 'news';

  const selectItem = (id: string) => {
    setSearchParams({ item: id });
  };

  return (
    <div className="min-h-[calc(100vh-7rem)] bg-[#0d1017] text-white">
      <SeoHead title="News" description="Latest DRIGHT stories, marketplace news, affiliate and referral updates, promotions, and platform announcements." canonical="/news" />

      {welcomeVisible && (
        <div className="border-b border-white/5 bg-[#141822] px-4 py-3 sm:px-6">
          <div className="mx-auto flex max-w-5xl items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[#1e2331] text-[#7180ff]">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-[#1e2331] px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-[#7180ff]">NEW</span>
                <p className="truncate text-sm font-semibold text-white">Welcome to DRIGHT News</p>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-neutral-400">News, market stories, affiliate and referral updates, promotions, and announcements from across DRIGHT.</p>
            </div>
            <button type="button" onClick={() => setWelcomeVisible(false)} className="rounded-lg p-1.5 text-neutral-600 transition hover:bg-white/5 hover:text-neutral-300" aria-label="Dismiss welcome message">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <section className="relative overflow-hidden border-b border-white/5 bg-gradient-to-b from-[#141822] via-[#11151e] to-[#0d1017] px-4 py-7 sm:px-6 sm:py-10">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#4353ff]/10 blur-3xl" />
        <div className="pointer-events-none absolute left-1/2 top-0 h-px w-[70%] -translate-x-1/2 bg-gradient-to-r from-transparent via-blue-400/30 to-transparent" />

        <div className="relative mx-auto max-w-5xl">
          <div className="flex items-center gap-5 sm:gap-8">
            <div className="relative shrink-0">
              <div className="absolute inset-0 rounded-[2rem] bg-blue-500/20 blur-2xl" />
              <div className="relative rounded-[1.8rem] border border-white/10 bg-gradient-to-br from-[#2a2f39] via-[#111318] to-black p-1 shadow-2xl sm:rounded-[2.2rem]">
                <DrightMark size={104} className="sm:hidden" title="DRIGHT" />
                <DrightMark size={132} className="hidden sm:block" title="DRIGHT" />
              </div>
            </div>

            <div className="relative min-w-0 flex-1">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-neutral-300 shadow-inner sm:h-12 sm:w-12">
                <Megaphone className="h-6 w-6" />
              </div>
              <div className="absolute right-0 top-0 grid grid-cols-4 gap-2 opacity-20" aria-hidden="true">
                {Array.from({ length: 16 }).map((_, index) => <span key={index} className="h-1 w-1 rounded-full bg-slate-300" />)}
              </div>
              <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl">News</h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-neutral-300 sm:text-base">Latest DRIGHT stories, product news, market updates, affiliate opportunities, referrals, promotions, and announcements.</p>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 pb-12 sm:px-6">
        <div className="flex flex-col gap-3 border-b border-white/5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {categories.map((category) => {
              const active = filter === category.value;
              return (
                <button key={category.value} type="button" onClick={() => setFilter(category.value)} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-all ${active ? 'border-transparent bg-[#4353ff] text-white shadow-[0_8px_24px_rgba(67,83,255,0.28)]' : 'border-neutral-700 bg-[#1e2331] text-neutral-300 hover:border-neutral-500 hover:text-white'}`}>
                  {category.label}
                </button>
              );
            })}
          </div>

          <select value={sort} onChange={(event) => setSort(event.target.value as SortOption)} className="min-h-[42px] rounded-xl border border-neutral-700 bg-[#1e2331] px-3 text-sm font-medium text-neutral-200 outline-none focus:border-[#7180ff]" aria-label="Sort news">
            <option value="newest">Recently posted</option>
            <option value="oldest">Oldest first</option>
            <option value="trending">Trending</option>
          </select>
        </div>

        <SponsoredPlacementCard placement={sponsoredPlacement} variant={filter === 'all' ? 'compact' : 'feed'} className="my-6" heading={filter === 'promo' ? 'Sponsored promotion' : 'Sponsored news'} />

        {loading ? (
          <div className="flex min-h-[280px] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#7180ff]" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center px-6 text-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-full border border-white/5 bg-white/[0.02]"><Bell className="h-14 w-14 text-neutral-800" strokeWidth={1} /></div>
            <p className="mt-6 text-lg font-medium text-neutral-600">No {filter === 'all' ? 'news' : categories.find((category) => category.value === filter)?.label.toLowerCase()} available.</p>
            <p className="mt-2 max-w-sm text-sm text-neutral-700">Published DRIGHT content will appear here.</p>
          </div>
        ) : (
          <div className="space-y-5 py-1">
            {filtered.map((item, index) => {
              const effectiveCategory = itemCategory(item);
              const config = categoryConfig[effectiveCategory];
              const Icon = config.icon;
              const targeted = targetItemId === item.id;

              return (
                <motion.article
                  id={`news-${item.id}`}
                  key={item.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.04, 0.2) }}
                  className={`overflow-hidden rounded-2xl border bg-[#141822] shadow-[0_18px_50px_rgba(0,0,0,0.18)] transition ${targeted ? 'border-[#7180ff] ring-2 ring-[#4353ff]/30' : item.is_pinned ? 'border-blue-400/20' : 'border-white/[0.07]'}`}
                >
                  {item.media_url && (
                    <div className="max-h-[540px] overflow-hidden bg-black">
                      {item.media_type === 'video' ? (
                        <video src={item.media_url} controls playsInline preload="metadata" className="max-h-[540px] w-full object-contain" />
                      ) : (
                        <img src={item.media_url} alt="" loading="lazy" className="max-h-[540px] w-full object-cover" />
                      )}
                    </div>
                  )}

                  <div className="p-4 sm:p-5">
                    <div className="flex items-start gap-3.5">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.07] bg-[#1e2331]">
                        <Icon className={`h-5 w-5 ${config.accent}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${config.badge}`}>{config.label}</span>
                          {item.is_pinned && <span className="inline-flex items-center gap-1 rounded-full border border-blue-400/20 bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-300"><Pin className="h-3 w-3" />Pinned</span>}
                          {item.is_trending && <span className="inline-flex items-center gap-1 rounded-full border border-orange-400/20 bg-orange-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-300"><TrendingUp className="h-3 w-3" />Trending</span>}
                          {item.mention_all && <span className="inline-flex items-center gap-1 rounded-full border border-violet-400/20 bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-300"><AtSign className="h-3 w-3" />All DRIGHT</span>}
                          <span className="text-[11px] text-neutral-600">{new Date(item.published_at).toLocaleDateString()}</span>
                        </div>

                        <button type="button" onClick={() => selectItem(item.id)} className="mt-2 block text-left">
                          <h2 className="text-base font-semibold leading-snug text-white hover:text-blue-200 sm:text-lg">{item.title}</h2>
                        </button>
                        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-neutral-400">{item.message}</p>

                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          {item.external_url && (
                            <a href={item.external_url} target="_blank" rel="noreferrer" className="inline-flex min-h-[38px] items-center gap-2 rounded-xl bg-[#4353ff] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#5261ff]">
                              {item.cta_label || 'Learn more'} <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                          <button type="button" onClick={() => selectItem(item.id)} className="min-h-[38px] rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-medium text-neutral-300 transition hover:bg-white/[0.07] hover:text-white">
                            Open post · {item.view_count || 0} views
                          </button>
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
