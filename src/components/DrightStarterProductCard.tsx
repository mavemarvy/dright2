import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, Copy, ExternalLink, Rocket, Star, Target, Trophy, WalletCards } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { canUsePlatformFeature } from '../lib/platformAccess';
import {
  buildDrightStarterAffiliateLink,
  fetchDrightStarterProduct,
  getMyDrightStarterAffiliateProgress,
  renderDrightStarterTemplate,
  type DrightStarterAffiliateProgress,
  type DrightStarterPublicSettings,
} from '../lib/drightStarter';
import { formatDisplayCurrency } from '../lib/currency';

export default function DrightStarterProductCard({ className = '' }: { className?: string }) {
  const { user, profile } = useAuth();
  const [settings, setSettings] = useState<DrightStarterPublicSettings | null>(null);
  const [canAffiliate, setCanAffiliate] = useState(false);
  const [progress, setProgress] = useState<DrightStarterAffiliateProgress | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void fetchDrightStarterProduct().then(setSettings);
    if (user) {
      void canUsePlatformFeature('affiliate_marketing').then(setCanAffiliate);
      void getMyDrightStarterAffiliateProgress().then(setProgress);
    } else {
      setCanAffiliate(false);
      setProgress(null);
    }
  }, [user]);

  if (!settings?.available || !settings.product || !settings.store) return null;

  const { product } = settings;
  const share = async () => {
    if (!profile?.referral_code) return;
    const link = buildDrightStarterAffiliateLink(profile.referral_code);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.location.assign(link);
    }
  };

  return (
    <section className={`overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-700 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white shadow-xl ${className}`}>
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-300">
            <BadgeCheck className="w-4 h-4 text-emerald-400" />
            Official DRIGHT first product
          </div>
          {product.official_rating_enabled && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold">
              <Star className="w-3.5 h-3.5 fill-amber-300 text-amber-300" />
              {product.official_rating.toFixed(1)} DRIGHT rating
            </span>
          )}
        </div>

        <div className="mt-4 grid gap-5 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <h2 className="text-xl sm:text-2xl font-black">{product.title}</h2>
            <p className="mt-2 text-sm text-slate-300 max-w-2xl">{product.subtitle}</p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-white/10 px-3 py-1.5">{product.category}</span>
              <span className="rounded-full bg-emerald-500/15 text-emerald-200 px-3 py-1.5">
                Earn {product.affiliate_commission_percent}% per verified referral
              </span>
              <span className="rounded-full bg-blue-500/15 text-blue-200 px-3 py-1.5">
                {product.included_trial_days} days access included
              </span>
            </div>
          </div>
          <div className="sm:text-right">
            <p className="text-xs text-slate-400">Starter price</p>
            <p className="text-2xl font-black">{formatDisplayCurrency(product.price, product.currency)}</p>
          </div>
        </div>

        {progress?.applies && progress.enabled && (
          <div className="mt-5 rounded-2xl border border-violet-400/20 bg-violet-500/10 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-200 flex items-center gap-1.5">
                  <Target className="w-4 h-4" /> Starter Affiliate Challenge
                </p>
                <p className="text-sm text-violet-100 mt-1">
                  {renderDrightStarterTemplate(
                    progress.description_template,
                    product.included_trial_days,
                    progress.target_sales,
                  )}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-xs font-black">
                {progress.sales}/{progress.target_sales}
              </span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-violet-300 transition-all"
                style={{ width: `${Math.min(100, progress.target_sales > 0 ? (progress.sales / progress.target_sales) * 100 : 0)}%` }}
              />
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-violet-200">
              <span>
                {progress.completed
                  ? `${progress.unlock_label} unlocked`
                  : `${progress.remaining_sales} verified sale${progress.remaining_sales === 1 ? '' : 's'} remaining`}
              </span>
              <Link to="/challenges?section=affiliate&challenge=starter_affiliate" className="font-bold text-white hover:underline">
                View challenge
              </Link>
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-col sm:flex-row gap-3">
          <Link
            to="/dright/starter"
            className="min-h-[46px] inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-white text-slate-950 font-bold px-4 hover:bg-slate-100"
          >
            <Rocket className="w-4 h-4" /> View Starter Product
          </Link>
          {user && canAffiliate && profile?.referral_code ? (
            <button
              type="button"
              onClick={share}
              className="min-h-[46px] inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4"
            >
              {copied ? <BadgeCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Affiliate link copied' : 'Copy & sell this product'}
            </button>
          ) : user ? (
            <Link
              to="/subscriptions"
              className="min-h-[46px] inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 font-semibold px-4"
            >
              <WalletCards className="w-4 h-4" /> Affiliate access
            </Link>
          ) : (
            <Link
              to="/sign-in"
              className="min-h-[46px] inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 font-semibold px-4"
            >
              <ExternalLink className="w-4 h-4" /> Sign in to affiliate
            </Link>
          )}
        <Link
          to="/challenges?section=affiliate&challenge=starter_affiliate"
          className="mt-3 min-h-[42px] inline-flex w-full items-center justify-center gap-2 rounded-xl border border-violet-300/30 bg-violet-500/10 px-4 text-sm font-bold text-violet-100 hover:bg-violet-500/20"
        >
          <Trophy className="w-4 h-4" /> View Starter Affiliate Leaderboard
        </Link>

        </div>
      </div>
    </section>
  );
}
