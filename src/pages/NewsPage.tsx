import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Bell, Loader2, Megaphone, Sparkles, Tag, X } from 'lucide-react';
import SeoHead from '../components/SeoHead';
import { DrightMark } from '../components/DrightBrand';
import SponsoredPlacementCard from '../components/promotion/SponsoredPlacementCard';
import { supabase } from '../lib/supabase';

type NewsType = 'news' | 'promo' | 'update';
type NewsFilter = 'all' | NewsType;

interface NewsItem {
  id: string;
  title: string;
  message: string;
  type: NewsType;
  is_active: boolean;
  created_at: string;
}

const categories: { value: NewsFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'news', label: 'News' },
  { value: 'promo', label: 'Promo' },
  { value: 'update', label: 'Update' },
];

const typeConfig: Record<NewsType, { icon: typeof Megaphone; label: string; accent: string; badge: string }> = {
  news: {
    icon: Megaphone,
    label: 'News',
    accent: 'text-blue-300',
    badge: 'border-blue-400/20 bg-blue-500/10 text-blue-300',
  },
  promo: {
    icon: Tag,
    label: 'Promo',
    accent: 'text-emerald-300',
    badge: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300',
  },
  update: {
    icon: AlertTriangle,
    label: 'Update',
    accent: 'text-amber-300',
    badge: 'border-amber-400/20 bg-amber-500/10 text-amber-300',
  },
};

export default function NewsPage() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<NewsFilter>('news');
  const [welcomeVisible, setWelcomeVisible] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('global_announcements')
        .select('id,title,message,type,is_active,created_at')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (!active) return;
      setItems((data || []) as NewsItem[]);
      setLoading(false);
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  const filtered = filter === 'all' ? items : items.filter(item => item.type === filter);
  const sponsoredPlacement = filter === 'all' ? 'announcement_banner' : filter === 'news' ? 'news' : 'announcement_feed';

  return (
    <div className="min-h-[calc(100vh-7rem)] bg-[#0d1017] text-white">
      <SeoHead
        title="News"
        description="Latest DRIGHT stories, product news, promotions, and platform updates."
        canonical="/news"
      />

      {welcomeVisible && (
        <div className="border-b border-white/5 bg-[#141822] px-4 py-3 sm:px-6">
          <div className="mx-auto flex max-w-5xl items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[#1e2331] text-[#7180ff]">
              <Sparkles className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-[#1e2331] px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-[#7180ff]">NEW</span>
                <p className="truncate text-sm font-semibold text-white">Welcome to DRIGHT Marketplace</p>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-neutral-400">Discover products, services, opportunities, creators, stores, communities, and the latest platform stories.</p>
            </div>
            <button
              type="button"
              onClick={() => setWelcomeVisible(false)}
              className="rounded-lg p-1.5 text-neutral-600 transition hover:bg-white/5 hover:text-neutral-300"
              aria-label="Dismiss welcome message"
            >
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
                {Array.from({ length: 16 }).map((_, index) => (
                  <span key={index} className="h-1 w-1 rounded-full bg-slate-300" />
                ))}
              </div>
              <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl">News</h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-neutral-300 sm:text-base">Latest DRIGHT stories, product news, promotions, and platform updates.</p>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 pb-12 sm:px-6">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 py-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {categories.map(category => {
            const active = filter === category.value;
            return (
              <button
                key={category.value}
                type="button"
                onClick={() => setFilter(category.value)}
                className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                  active
                    ? 'border-transparent bg-[#4353ff] text-white shadow-[0_8px_24px_rgba(67,83,255,0.28)]'
                    : 'border-neutral-700 bg-[#1e2331] text-neutral-300 hover:border-neutral-500 hover:text-white'
                }`}
              >
                {category.label}
              </button>
            );
          })}
        </div>

        <SponsoredPlacementCard
          placement={sponsoredPlacement}
          variant={filter === 'all' ? 'compact' : 'feed'}
          className="mb-6"
          heading={filter === 'news' ? 'Sponsored news' : 'Sponsored announcement'}
        />

        {loading ? (
          <div className="flex min-h-[280px] items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-[#7180ff]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center px-6 text-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-full border border-white/5 bg-white/[0.02]">
              <Bell className="h-14 w-14 text-neutral-800" strokeWidth={1} />
            </div>
            <p className="mt-6 text-lg font-medium text-neutral-600">No {filter === 'all' ? 'news' : categories.find(c => c.value === filter)?.label.toLowerCase()} available.</p>
            <p className="mt-2 max-w-sm text-sm text-neutral-700">New DRIGHT stories and platform updates will appear here when published.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((item, index) => {
              const config = typeConfig[item.type] || typeConfig.news;
              const Icon = config.icon;
              return (
                <motion.article
                  key={item.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.04, 0.2) }}
                  className="rounded-2xl border border-white/[0.07] bg-[#141822] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.18)] sm:p-5"
                >
                  <div className="flex items-start gap-3.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.07] bg-[#1e2331]">
                      <Icon className={`h-5 w-5 ${config.accent}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${config.badge}`}>{config.label}</span>
                        <span className="text-[11px] text-neutral-600">{new Date(item.created_at).toLocaleDateString()}</span>
                      </div>
                      <h2 className="mt-2 text-base font-semibold leading-snug text-white sm:text-lg">{item.title}</h2>
                      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-neutral-400">{item.message}</p>
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
