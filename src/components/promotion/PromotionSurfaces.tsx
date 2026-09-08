import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight, Bell, BriefcaseBusiness, ChevronLeft, ChevronRight, CircleHelp,
  Image as ImageIcon, Megaphone, Package, Sparkles, Store, X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  type AdPlacement, type PromotableAsset, type PromotionTierCode,
  type SponsoredDeliveryItem, fetchSponsoredDelivery, recordSponsoredDeliveryEvent,
} from '../../lib/universalPromotion';

type OfficialBanner = {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  media_url: string | null;
  desktop_image: string | null;
  tablet_image: string | null;
  mobile_image: string | null;
  cta_label: string | null;
  button_text: string | null;
  cta_link: string | null;
  button_link: string | null;
  badge_text: string | null;
};

type GalleryItem =
  | { kind: 'paid'; item: SponsoredDeliveryItem }
  | { kind: 'official'; item: OfficialBanner };

const TIER_LABEL: Record<PromotionTierCode, string> = {
  normal: 'Normal',
  plus: 'Plus',
  platinum: 'Platinum',
};

async function fetchOfficialBanners(limit = 5): Promise<OfficialBanner[]> {
  const { data } = await supabase
    .from('promotional_banners')
    .select('id,title,subtitle,description,media_url,desktop_image,tablet_image,mobile_image,cta_label,button_text,cta_link,button_link,badge_text')
    .eq('is_active', true)
    .eq('is_deleted', false)
    .order('priority', { ascending: false })
    .order('display_order', { ascending: true })
    .limit(limit);
  return (data || []) as OfficialBanner[];
}

function navigateTo(destination: string, navigate: ReturnType<typeof useNavigate>) {
  if (destination.startsWith('/')) navigate(destination);
  else window.location.assign(destination);
}

function fallbackIcon(type?: string) {
  if (type === 'job') return BriefcaseBusiness;
  if (type === 'store') return Store;
  if (type === 'profile' || type === 'sales_team') return Sparkles;
  return Package;
}

export function CompactPromoStrip({ className = '' }: { className?: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [delivery, setDelivery] = useState<SponsoredDeliveryItem | null>(null);
  const [banner, setBanner] = useState<OfficialBanner | null>(null);
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem('dright-promo-strip-dismissed') === '1');
  const tracked = useRef<string | null>(null);

  useEffect(() => {
    if (dismissed) return;
    let alive = true;
    void (async () => {
      if (user) {
        const paid = await fetchSponsoredDelivery('flyer', 1);
        if (!alive) return;
        if (paid[0]) {
          setDelivery(paid[0]);
          setBanner(null);
          return;
        }
      }
      const official = await fetchOfficialBanners(1);
      if (alive) setBanner(official[0] || null);
    })();
    return () => { alive = false; };
  }, [user?.id, dismissed]);

  useEffect(() => {
    if (!user || !delivery || tracked.current === delivery.campaign_asset_id) return;
    tracked.current = delivery.campaign_asset_id;
    void recordSponsoredDeliveryEvent(delivery, 'impression', user.id);
  }, [delivery, user]);

  if (dismissed || (!delivery && !banner)) return null;

  const title = delivery?.title || banner?.title || 'Discover something useful on DRIGHT';
  const subtitle = delivery?.description || banner?.subtitle || banner?.description || 'Relevant opportunities, clearly labelled.';
  const image = delivery?.image_url || banner?.mobile_image || banner?.media_url || banner?.desktop_image || null;
  const label = delivery ? 'Sponsored' : banner?.badge_text || 'DRIGHT Update';
  const cta = delivery?.cta_label || banner?.button_text || banner?.cta_label || 'Explore';
  const destination = delivery?.destination || banner?.button_link || banner?.cta_link || '/market';

  const open = () => {
    if (delivery && user) void recordSponsoredDeliveryEvent(delivery, 'click', user.id);
    navigateTo(destination, navigate);
  };

  return (
    <div className={`relative overflow-hidden border-b border-primary-100 bg-gradient-to-r from-primary-50 via-white to-blue-50 dark:from-gray-950 dark:via-gray-950 dark:to-primary-950 ${className}`}>
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-3 py-2 sm:px-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary-600 text-white shadow-sm">
          {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : <Sparkles className="h-4 w-4" />}
        </div>
        <button onClick={open} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-700 dark:bg-primary-900/50 dark:text-primary-200">{label}</span>
            <span className="truncate text-sm font-bold text-gray-900 dark:text-white">{title}</span>
          </div>
          <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
        </button>
        <button onClick={open} className="hidden shrink-0 items-center gap-1 rounded-full bg-gray-950 px-3 py-1.5 text-xs font-semibold text-white sm:flex dark:bg-white dark:text-gray-950">
          {cta}<ArrowRight className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => {
            sessionStorage.setItem('dright-promo-strip-dismissed', '1');
            setDismissed(true);
          }}
          className="shrink-0 rounded-full p-2 text-gray-400 hover:bg-white/80 hover:text-gray-700 dark:hover:bg-gray-800"
          aria-label="Dismiss promotional strip"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function DiscoveryPromoGallery({ placement = 'login_gallery' }: { placement?: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(`dright-gallery-dismissed:${placement}`) === '1');
  const tracked = useRef(new Set<string>());

  useEffect(() => {
    if (dismissed) return;
    let alive = true;
    void (async () => {
      if (user) {
        const paid = await fetchSponsoredDelivery(placement, 5);
        if (!alive) return;
        if (paid.length) {
          setItems(paid.map(item => ({ kind: 'paid' as const, item })));
          return;
        }
      }
      const official = await fetchOfficialBanners(5);
      if (alive) setItems(official.map(item => ({ kind: 'official' as const, item })));
    })();
    return () => { alive = false; };
  }, [user?.id, placement, dismissed]);

  useEffect(() => {
    if (items.length < 2) return;
    const timer = window.setInterval(() => setActive(value => (value + 1) % items.length), 6500);
    return () => window.clearInterval(timer);
  }, [items.length]);

  useEffect(() => {
    const current = items[active];
    if (!current || current.kind !== 'paid' || !user) return;
    const key = current.item.campaign_asset_id;
    if (tracked.current.has(key)) return;
    const timer = window.setTimeout(() => {
      tracked.current.add(key);
      void recordSponsoredDeliveryEvent(current.item, 'impression', user.id);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [active, items, user]);

  if (dismissed || !items.length) return null;

  const current = items[Math.min(active, items.length - 1)];
  const paid = current.kind === 'paid' ? current.item : null;
  const official = current.kind === 'official' ? current.item : null;
  const title = paid?.title || official?.title || 'Discover on DRIGHT';
  const description = paid?.description || official?.subtitle || official?.description || 'Useful opportunities selected for this discovery surface.';
  const image = paid?.image_url || official?.mobile_image || official?.media_url || official?.desktop_image || null;
  const destination = paid?.destination || official?.button_link || official?.cta_link || '/market';
  const cta = paid?.cta_label || official?.button_text || official?.cta_label || 'View more';
  const Icon = fallbackIcon(paid?.asset_type);
  const gradients = [
    'from-cyan-100 via-sky-50 to-indigo-100 dark:from-cyan-950 dark:via-gray-950 dark:to-indigo-950',
    'from-orange-100 via-amber-50 to-rose-100 dark:from-orange-950 dark:via-gray-950 dark:to-rose-950',
    'from-lime-100 via-emerald-50 to-teal-100 dark:from-lime-950 dark:via-gray-950 dark:to-teal-950',
    'from-violet-100 via-fuchsia-50 to-pink-100 dark:from-violet-950 dark:via-gray-950 dark:to-pink-950',
  ];

  const open = () => {
    if (paid && user) void recordSponsoredDeliveryEvent(paid, 'click', user.id);
    navigateTo(destination, navigate);
  };

  return (
    <section className="relative overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800 sm:px-5">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-600 text-white"><Megaphone className="h-4 w-4" /></div>
          <div>
            <p className="text-sm font-bold text-gray-900 dark:text-white">DRIGHT Discovery</p>
            <p className="text-[11px] text-gray-500">Relevant promotions without crowding your feed</p>
          </div>
        </div>
        <button
          onClick={() => {
            sessionStorage.setItem(`dright-gallery-dismissed:${placement}`, '1');
            setDismissed(true);
          }}
          className="rounded-full p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label="Dismiss gallery"
        ><X className="h-4 w-4" /></button>
      </div>

      <div className={`relative grid min-h-[280px] overflow-hidden bg-gradient-to-br ${gradients[active % gradients.length]} md:min-h-[320px] md:grid-cols-[1.05fr_.95fr]`}>
        <div className="relative z-10 flex flex-col justify-center p-6 sm:p-8 md:p-10">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-800 backdrop-blur dark:bg-gray-900/70 dark:text-gray-100">{paid ? paid.sponsored_label : 'Featured'}</span>
            {paid && <span className="rounded-full border border-gray-900/10 bg-white/50 px-2.5 py-1 text-[10px] font-semibold uppercase text-gray-600 backdrop-blur dark:border-white/10 dark:bg-gray-900/40 dark:text-gray-300">{TIER_LABEL[paid.tier_code]} Ads</span>}
          </div>
          <h2 className="max-w-xl text-3xl font-black leading-tight text-gray-950 dark:text-white sm:text-4xl">{title}</h2>
          <p className="mt-3 max-w-lg text-sm leading-6 text-gray-700 dark:text-gray-300 sm:text-base">{description}</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button onClick={open} className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-gray-950 px-5 py-2.5 text-sm font-bold text-white shadow-lg transition hover:-translate-y-0.5 dark:bg-white dark:text-gray-950">
              {cta}<ArrowRight className="h-4 w-4" />
            </button>
            {paid && <span className="inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400"><CircleHelp className="h-3.5 w-3.5" />Eligible sponsored placement matched by DRIGHT.</span>}
          </div>
        </div>
        <div className="relative flex min-h-[220px] items-end justify-center overflow-hidden px-6 pt-2 md:min-h-0 md:items-center md:px-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,.8),transparent_65%)] dark:bg-[radial-gradient(circle_at_center,rgba(255,255,255,.08),transparent_65%)]" />
          {image ? (
            <img src={image} alt="" className="relative z-10 max-h-64 w-auto max-w-full rounded-3xl object-contain drop-shadow-2xl md:max-h-72" />
          ) : (
            <div className="relative z-10 flex h-44 w-44 items-center justify-center rounded-[2.5rem] bg-white/70 shadow-2xl backdrop-blur dark:bg-gray-900/70"><Icon className="h-20 w-20 text-primary-600" /></div>
          )}
        </div>
      </div>

      {items.length > 1 && (
        <div className="flex items-center justify-between px-4 py-3 sm:px-5">
          <div className="flex items-center gap-1.5">
            {items.map((_, index) => (
              <button
                key={index}
                onClick={() => setActive(index)}
                aria-label={`Show promotion ${index + 1}`}
                className={`h-1.5 rounded-full transition-all ${index === active ? 'w-7 bg-primary-600' : 'w-2 bg-gray-300 dark:bg-gray-700'}`}
              />
            ))}
          </div>
          <div className="flex gap-1">
            <button onClick={() => setActive(value => (value - 1 + items.length) % items.length)} className="rounded-full border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800" aria-label="Previous promotion"><ChevronLeft className="h-4 w-4" /></button>
            <button onClick={() => setActive(value => (value + 1) % items.length)} className="rounded-full border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800" aria-label="Next promotion"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}
    </section>
  );
}

export function AdPreviewStudio({
  asset,
  placements,
  tier,
  headline,
  description,
  ctaLabel,
}: {
  asset: PromotableAsset | null;
  placements: AdPlacement[];
  tier: PromotionTierCode;
  headline: string;
  description: string;
  ctaLabel: string;
}) {
  const [device, setDevice] = useState<'mobile' | 'tablet' | 'desktop'>('mobile');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const width = device === 'mobile' ? 'max-w-[360px]' : device === 'tablet' ? 'max-w-[680px]' : 'max-w-[900px]';
  const title = headline.trim() || asset?.title || 'Your DRIGHT promotion';
  const desc = description.trim() || asset?.subtitle || 'Preview how this campaign can appear in the selected DRIGHT placement.';
  const image = asset?.image_url;
  const sorted = useMemo(() => [...placements].sort((a, b) => a.sort_order - b.sort_order), [placements]);

  const media = () => image
    ? <img src={image} alt="" className="h-full w-full object-cover" />
    : <div className="flex h-full w-full items-center justify-center bg-gray-100 dark:bg-gray-800"><ImageIcon className="h-8 w-8 text-gray-300" /></div>;

  const renderPreview = (placement: AdPlacement) => {
    const key = placement.preview_key;
    if (key === 'notification') {
      return <div className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-900"><div className="h-11 w-11 overflow-hidden rounded-xl">{media()}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><Bell className="h-3.5 w-3.5 text-primary-600" /><span className="text-[10px] font-bold uppercase text-primary-600">Sponsored</span></div><p className="mt-1 truncate text-sm font-bold text-gray-900 dark:text-white">{title}</p><p className="line-clamp-2 text-xs text-gray-500">{desc}</p></div></div>;
    }
    if (['login_gallery', 'floating_flyer', 'announcement_banner'].includes(key)) {
      return <div className="grid overflow-hidden rounded-3xl bg-gradient-to-br from-primary-100 via-white to-cyan-100 shadow-sm dark:from-primary-950 dark:via-gray-900 dark:to-cyan-950 sm:grid-cols-[1fr_.7fr]"><div className="p-5"><span className="text-[10px] font-bold uppercase text-primary-700 dark:text-primary-300">Sponsored · {TIER_LABEL[tier]}</span><p className="mt-2 text-xl font-black text-gray-950 dark:text-white">{title}</p><p className="mt-1 line-clamp-3 text-xs leading-5 text-gray-600 dark:text-gray-300">{desc}</p><span className="mt-4 inline-flex rounded-full bg-gray-950 px-3 py-1.5 text-xs font-bold text-white dark:bg-white dark:text-gray-950">{ctaLabel || 'Learn More'}</span></div><div className="min-h-36">{media()}</div></div>;
    }
    if (['feed_post', 'announcement_post', 'news_sponsored', 'leaderboard_post'].includes(key)) {
      return <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"><div className="flex items-center gap-2 p-3"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 text-primary-700"><Sparkles className="h-4 w-4" /></div><div><p className="text-sm font-bold text-gray-900 dark:text-white">DRIGHT advertiser</p><p className="text-[10px] font-semibold uppercase text-gray-400">Sponsored</p></div></div><div className="aspect-[16/8]">{media()}</div><div className="p-4"><p className="font-bold text-gray-900 dark:text-white">{title}</p><p className="mt-1 text-sm text-gray-500">{desc}</p><div className="mt-3 flex items-center justify-between"><span className="rounded-full bg-primary-600 px-3 py-1.5 text-xs font-bold text-white">{ctaLabel || 'Learn More'}</span><div className="flex gap-3 text-xs text-gray-400"><span>Like</span><span>Save</span><span>Comments</span></div></div></div></div>;
    }
    if (key === 'search_result') {
      return <div className="flex gap-3 rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900"><div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl">{media()}</div><div className="min-w-0 flex-1"><span className="text-[10px] font-bold uppercase text-primary-600">Sponsored</span><p className="mt-1 truncate font-bold text-gray-900 dark:text-white">{title}</p><p className="line-clamp-2 text-xs text-gray-500">{desc}</p><span className="mt-2 inline-block text-xs font-semibold text-primary-600">{ctaLabel || 'View details'} →</span></div></div>;
    }
    if (['profile_card', 'sales_team_profile'].includes(key)) {
      return <div className="rounded-2xl border border-gray-200 bg-white p-4 text-center dark:border-gray-700 dark:bg-gray-900"><div className="mx-auto h-20 w-20 overflow-hidden rounded-full">{media()}</div><span className="mt-3 inline-block text-[10px] font-bold uppercase text-primary-600">Sponsored professional</span><p className="mt-1 font-black text-gray-900 dark:text-white">{title}</p><p className="text-xs text-gray-500">{desc}</p><button className="mt-3 rounded-full bg-primary-600 px-4 py-2 text-xs font-bold text-white">{ctaLabel || 'View Profile'}</button></div>;
    }
    return <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"><div className="aspect-[16/10]">{media()}</div><div className="p-3"><span className="text-[10px] font-bold uppercase text-primary-600">Sponsored</span><p className="mt-1 font-bold text-gray-900 dark:text-white">{title}</p><p className="line-clamp-2 text-xs text-gray-500">{desc}</p><button className="mt-3 rounded-full bg-gray-950 px-3 py-1.5 text-xs font-bold text-white dark:bg-white dark:text-gray-950">{ctaLabel || 'Learn More'}</button></div></div>;
  };

  return (
    <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-950 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="font-black text-gray-900 dark:text-white">Ad Preview Studio</h3><p className="text-xs text-gray-500">Code-based DRIGHT templates using your actual campaign content.</p></div>
        <div className="flex flex-wrap gap-2">
          {(['mobile', 'tablet', 'desktop'] as const).map(value => <button key={value} onClick={() => setDevice(value)} className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${device === value ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 dark:bg-gray-900 dark:text-gray-300'}`}>{value}</button>)}
          {(['light', 'dark'] as const).map(value => <button key={value} onClick={() => setTheme(value)} className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${theme === value ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-white text-gray-600 dark:bg-gray-900 dark:text-gray-300'}`}>{value}</button>)}
        </div>
      </div>
      {!asset ? (
        <div className="rounded-2xl border border-dashed border-gray-300 p-10 text-center text-sm text-gray-400">Select an asset to generate placement previews.</div>
      ) : (
        <div className={`${theme === 'dark' ? 'dark' : ''} ${width} mx-auto space-y-5`}>
          {sorted.map(placement => <div key={placement.code}><div className="mb-2 flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-wide text-gray-500">{placement.name}</p><span className="text-[10px] text-gray-400">{placement.preview_key}</span></div>{renderPreview(placement)}</div>)}
        </div>
      )}
    </div>
  );
}

export function PromotionEntryButton({ className = '' }: { className?: string }) {
  return (
    <Link to="/promote" className={`inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary-600 to-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary-600/20 transition hover:-translate-y-0.5 ${className}`}>
      <Megaphone className="h-4 w-4" />Promote
    </Link>
  );
}
