import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BriefcaseBusiness, Megaphone, Package, Sparkles, Store } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  type SponsoredDeliveryItem,
  fetchSponsoredDelivery,
  recordSponsoredDeliveryEvent,
} from '../../lib/universalPromotion';

type SponsoredPlacementVariant = 'notification' | 'feed' | 'recommendation' | 'compact';

interface SponsoredPlacementCardProps {
  placement: string;
  variant?: SponsoredPlacementVariant;
  className?: string;
  heading?: string;
}

const tierLabel: Record<SponsoredDeliveryItem['tier_code'], string> = {
  normal: 'Normal',
  plus: 'Plus',
  platinum: 'Platinum',
};

function fallbackIcon(type: SponsoredDeliveryItem['asset_type']) {
  if (type === 'job') return BriefcaseBusiness;
  if (type === 'store') return Store;
  if (type === 'profile' || type === 'sales_team') return Sparkles;
  return Package;
}

export default function SponsoredPlacementCard({
  placement,
  variant = 'compact',
  className = '',
  heading,
}: SponsoredPlacementCardProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [item, setItem] = useState<SponsoredDeliveryItem | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const trackedImpression = useRef<string | null>(null);

  useEffect(() => {
    if (!user || dismissed) {
      setItem(null);
      return;
    }

    let alive = true;
    void (async () => {
      const items = await fetchSponsoredDelivery(placement, 1);
      if (alive) setItem(items[0] || null);
    })();

    return () => {
      alive = false;
    };
  }, [user?.id, placement, dismissed]);

  useEffect(() => {
    if (!user || !item || trackedImpression.current === item.campaign_asset_id) return;
    const timer = window.setTimeout(() => {
      trackedImpression.current = item.campaign_asset_id;
      void recordSponsoredDeliveryEvent(item, 'impression', user.id);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [item, user]);

  if (!user || !item || dismissed) return null;

  const Icon = fallbackIcon(item.asset_type);
  const title = item.title || 'Sponsored on DRIGHT';
  const description = item.description || 'A relevant sponsored opportunity selected for this DRIGHT surface.';
  const destination = item.destination || '/market';
  const cta = item.cta_label || 'Learn more';

  const open = () => {
    void recordSponsoredDeliveryEvent(item, 'click', user.id);
    if (destination.startsWith('/')) navigate(destination);
    else window.location.assign(destination);
  };

  const sponsorMeta = (
    <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wide">
      <span className="rounded-full bg-primary-50 px-2 py-1 text-primary-700 dark:bg-primary-950/60 dark:text-primary-300">
        {item.sponsored_label || 'Sponsored'}
      </span>
      <span className="text-gray-400">{tierLabel[item.tier_code]} Ads</span>
    </div>
  );

  if (variant === 'notification') {
    return (
      <aside className={`rounded-2xl border border-primary-100 bg-white p-4 shadow-sm dark:border-primary-900/50 dark:bg-gray-800 ${className}`} aria-label="Sponsored recommendation">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-950/50 dark:text-primary-300">
            {item.image_url ? <img src={item.image_url} alt="" className="h-full w-full object-cover" /> : <Icon className="h-5 w-5" />}
          </div>
          <button onClick={open} className="min-w-0 flex-1 text-left">
            {sponsorMeta}
            <p className="mt-1.5 truncate text-sm font-bold text-gray-900 dark:text-gray-100">{title}</p>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500 dark:text-gray-400">{description}</p>
            <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary-600 dark:text-primary-400">
              {cta}<ArrowRight className="h-3.5 w-3.5" />
            </span>
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-medium text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
            aria-label="Hide this sponsored recommendation"
          >
            Hide
          </button>
        </div>
      </aside>
    );
  }

  if (variant === 'feed') {
    return (
      <aside className={`overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900 ${className}`} aria-label="Sponsored leaderboard post">
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 text-primary-700 dark:bg-primary-950/60 dark:text-primary-300">
              <Megaphone className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 dark:text-white">{heading || 'Sponsored spotlight'}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{tierLabel[item.tier_code]} Ads · {item.asset_type.replaceAll('_', ' ')}</p>
            </div>
          </div>
          <button onClick={() => setDismissed(true)} className="rounded-lg px-2 py-1 text-xs text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">Hide</button>
        </div>
        {item.image_url && (
          <button onClick={open} className="block aspect-[16/7] w-full overflow-hidden bg-gray-100 dark:bg-gray-800">
            <img src={item.image_url} alt="" className="h-full w-full object-cover" />
          </button>
        )}
        <div className="p-4 sm:p-5">
          {sponsorMeta}
          <button onClick={open} className="mt-2 block w-full text-left">
            <h3 className="text-lg font-black text-gray-950 dark:text-white">{title}</h3>
            <p className="mt-1 line-clamp-3 text-sm leading-6 text-gray-500 dark:text-gray-400">{description}</p>
          </button>
          <button onClick={open} className="mt-4 inline-flex min-h-[40px] items-center gap-2 rounded-full bg-gray-950 px-4 py-2 text-xs font-bold text-white dark:bg-white dark:text-gray-950">
            {cta}<ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </aside>
    );
  }

  if (variant === 'recommendation') {
    return (
      <aside className={`rounded-3xl border border-primary-100 bg-gradient-to-br from-primary-50 via-white to-cyan-50 p-4 shadow-sm dark:border-primary-900/40 dark:from-primary-950/30 dark:via-gray-900 dark:to-cyan-950/20 sm:p-5 ${className}`} aria-label="Sponsored recommendation">
        <div className="flex items-start gap-4">
          <button onClick={open} className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white text-primary-600 shadow-sm dark:bg-gray-800">
            {item.image_url ? <img src={item.image_url} alt="" className="h-full w-full object-cover" /> : <Icon className="h-8 w-8" />}
          </button>
          <div className="min-w-0 flex-1">
            {sponsorMeta}
            <button onClick={open} className="mt-1.5 block w-full text-left">
              <p className="truncate font-black text-gray-950 dark:text-white">{title}</p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500 dark:text-gray-400">{description}</p>
            </button>
            <div className="mt-2 flex items-center justify-between gap-2">
              <button onClick={open} className="inline-flex items-center gap-1 text-xs font-bold text-primary-600 dark:text-primary-400">{cta}<ArrowRight className="h-3.5 w-3.5" /></button>
              <button onClick={() => setDismissed(true)} className="text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">Hide</button>
            </div>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className={`flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-900 ${className}`} aria-label="Sponsored content">
      <button onClick={open} className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gray-100 text-primary-600 dark:bg-gray-800">
        {item.image_url ? <img src={item.image_url} alt="" className="h-full w-full object-cover" /> : <Icon className="h-6 w-6" />}
      </button>
      <button onClick={open} className="min-w-0 flex-1 text-left">
        {sponsorMeta}
        <p className="mt-1 truncate text-sm font-bold text-gray-900 dark:text-white">{title}</p>
        <p className="truncate text-xs text-gray-500 dark:text-gray-400">{description}</p>
      </button>
      <ArrowRight className="h-4 w-4 shrink-0 text-gray-400" />
    </aside>
  );
}
