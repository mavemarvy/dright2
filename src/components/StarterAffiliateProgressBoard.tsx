import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Crown, Infinity as InfinityIcon, Loader2, ShoppingBag, Target, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  getMyDrightStarterAffiliateProgress,
  type DrightStarterAffiliateProgress,
} from '../lib/drightStarter';

export default function StarterAffiliateProgressBoard({
  className = '',
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { user } = useAuth();
  const [progress, setProgress] = useState<DrightStarterAffiliateProgress | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!user?.id) {
      setProgress(null);
      return;
    }
    setLoading(true);
    try {
      setProgress(await getMyDrightStarterAffiliateProgress());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    if (!user?.id) return;
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [user?.id]);

  if (!user?.id) return null;

  if (loading && !progress) {
    return (
      <div className={'rounded-2xl border border-violet-200 bg-violet-50/60 p-4 dark:border-violet-900 dark:bg-violet-950/20 ' + className}>
        <div className="flex items-center gap-2 text-sm font-semibold text-violet-700 dark:text-violet-300">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading affiliate level…
        </div>
      </div>
    );
  }

  if (!progress?.enabled) return null;

  const percent = Math.max(0, Math.min(100, progress.progress_percent));
  const maxLevel = progress.max_level;
  const nextLevel = progress.next_level_number;
  const productAccessText = progress.starter_only
    ? 'DRIGHT Starter only'
    : progress.product_limit == null
      ? 'Unlimited affiliate products'
      : 'Up to ' + progress.product_limit.toLocaleString() + ' affiliate products';

  return (
    <section className={'overflow-hidden rounded-3xl border border-violet-300/50 bg-gradient-to-br from-violet-950 via-indigo-950 to-slate-950 text-white shadow-xl ' + className}>
      <div className={compact ? 'p-4' : 'p-5 sm:p-6'}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className={'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ' + (maxLevel ? 'bg-amber-400/15 text-amber-300' : 'bg-violet-400/15 text-violet-200')}>
              {maxLevel ? <Crown className="h-6 w-6" /> : <Target className="h-6 w-6" />}
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-200">DRIGHT Starter Affiliate</p>
              <h2 className={(compact ? 'text-base' : 'text-xl') + ' mt-1 font-black'}>
                {maxLevel ? 'Super Affiliate level reached' : 'Grow your affiliate level'}
              </h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-violet-100/70 sm:text-sm">
                Verified DRIGHT Starter affiliate sales move you through Levels 0–10. Each level can unlock a larger affiliate-product allowance configured by DRIGHT.
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Crown className={'h-4 w-4 ' + (maxLevel ? 'text-amber-300' : 'text-violet-200')} />
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-white/55">Affiliate level</p>
                  <p className="text-sm font-black">{progress.current_level_label}</p>
                </div>
              </div>
            </div>
            <div className={'rounded-2xl px-3 py-2 text-center ' + (maxLevel ? 'bg-amber-300 text-slate-950' : 'bg-white text-slate-950')}>
              <p className="text-[9px] font-black uppercase tracking-wide text-slate-500">Level</p>
              <p className="text-xl font-black">{progress.current_level_number}</p>
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-white/7 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wide text-white/50">Affiliate product access</p>
              <p className="mt-1 font-black text-violet-100">{productAccessText}</p>
            </div>
            {progress.product_limit == null && !progress.starter_only ? (
              <InfinityIcon className="h-6 w-6 text-emerald-300" />
            ) : (
              <ShoppingBag className="h-6 w-6 text-violet-300" />
            )}
          </div>
          <p className="mt-2 text-[11px] leading-4 text-white/50">
            This controls which products you can generate affiliate links for. It does not hide products from you as a buyer and does not stop normal purchases.
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/7 p-3">
            <p className="text-[9px] font-bold uppercase tracking-wide text-white/50">Total verified sales</p>
            <p className="mt-1 text-xl font-black">{progress.sales.toLocaleString()}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/7 p-3">
            <p className="text-[9px] font-bold uppercase tracking-wide text-white/50">Sales in this level</p>
            <p className="mt-1 text-xl font-black">{progress.sales_in_current_level.toLocaleString()}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/7 p-3">
            <p className="text-[9px] font-bold uppercase tracking-wide text-white/50">Needed for next</p>
            <p className="mt-1 text-xl font-black">{maxLevel ? '—' : progress.sales_required_this_level.toLocaleString()}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/7 p-3">
            <p className="text-[9px] font-bold uppercase tracking-wide text-white/50">Remaining</p>
            <p className={'mt-1 text-xl font-black ' + (maxLevel ? 'text-emerald-300' : 'text-amber-300')}>
              {maxLevel ? '0' : progress.remaining_sales.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-violet-100">
              {maxLevel ? 'Highest level completed' : 'Progress to Level ' + nextLevel}
            </span>
            <span className="font-black text-white">{percent}%</span>
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-white/10">
            <div
              className={'h-full rounded-full transition-all duration-500 ' + (maxLevel ? 'bg-emerald-400' : 'bg-gradient-to-r from-violet-400 via-fuchsia-400 to-amber-300')}
              style={{ width: percent + '%' }}
            />
          </div>
          {!maxLevel && (
            <p className="mt-2 text-xs text-violet-100/70">
              Get <strong>{progress.remaining_sales.toLocaleString()}</strong> more verified Starter sale{progress.remaining_sales === 1 ? '' : 's'} to reach <strong>{progress.next_level_label}</strong>
              {progress.next_level_total_sales != null && <> at <strong>{progress.next_level_total_sales.toLocaleString()}</strong> total verified sales.</>}.
            </p>
          )}
        </div>

        {!compact && progress.levels.length > 0 && (
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-200">Level path</p>
              <p className="text-[10px] text-white/45">0 → 10</p>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {progress.levels.map(level => {
                const unlocked = level.is_unlocked;
                const current = level.is_current;
                return (
                  <div
                    key={level.level_number}
                    className={'min-w-[108px] rounded-xl border px-3 py-2 ' + (
                      current
                        ? 'border-amber-300/60 bg-amber-300/10'
                        : unlocked
                          ? 'border-emerald-300/25 bg-emerald-400/10'
                          : 'border-white/10 bg-white/5'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={'text-xs font-black ' + (current ? 'text-amber-200' : unlocked ? 'text-emerald-200' : 'text-white/55')}>L{level.level_number}</span>
                      {unlocked && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />}
                    </div>
                    <p className="mt-1 truncate text-[10px] font-semibold text-white/75">{level.title}</p>
                    <p className="mt-1 text-[9px] text-white/40">{level.entry_sales.toLocaleString()} sales</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          {!maxLevel && (
            <Link to="/dright/starter" className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-white px-4 text-sm font-black text-slate-950 hover:bg-violet-50">
              <Target className="h-4 w-4" /> Sell Starter product <ArrowRight className="h-4 w-4" />
            </Link>
          )}
          {progress.current_level_number > 0 && (
            <Link to="/market?affiliate=1" className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-400 px-4 text-sm font-black text-emerald-950 hover:bg-emerald-300">
              <ShoppingBag className="h-4 w-4" /> Affiliate catalog
            </Link>
          )}
          <Link to="/challenges?section=affiliate&challenge=starter_affiliate" className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-violet-300/30 bg-violet-400/10 px-4 text-sm font-black text-violet-100 hover:bg-violet-400/20">
            <Trophy className="h-4 w-4" /> Starter leaderboard
          </Link>
        </div>

        {!compact && (
          <p className="mt-4 text-[10px] leading-4 text-white/45">
            Levels, sales requirements and affiliate-product limits are controlled by DRIGHT. When an admin changes them, your cumulative thresholds, current level, remaining sales and product allowance recalculate automatically.
            {!progress.affiliate_access_limited && <span> Your account is currently not restricted by the level-based affiliate catalog rule.</span>}
          </p>
        )}
      </div>
    </section>
  );
}
