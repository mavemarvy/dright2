import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Crown, Loader2, ShoppingBag, Target, Trophy } from 'lucide-react';
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
          <Loader2 className="h-4 w-4 animate-spin" /> Loading Starter affiliate progress…
        </div>
      </div>
    );
  }
  if (!progress?.enabled || !progress.applies) return null;

  const percent = Math.max(0, Math.min(100, progress.progress_percent));
  const completed = progress.completed;

  return (
    <section className={'overflow-hidden rounded-3xl border border-violet-300/50 bg-gradient-to-br from-violet-950 via-indigo-950 to-slate-950 text-white shadow-xl ' + className}>
      <div className={compact ? 'p-4' : 'p-5 sm:p-6'}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className={'flex shrink-0 items-center justify-center rounded-2xl ' + (completed ? 'h-12 w-12 bg-emerald-400/15 text-emerald-300' : 'h-12 w-12 bg-violet-400/15 text-violet-200')}>
              {completed ? <CheckCircle2 className="h-6 w-6" /> : <Target className="h-6 w-6" />}
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-200">DRIGHT Starter Affiliate</p>
              <h2 className={(compact ? 'text-base' : 'text-xl') + ' mt-1 font-black'}>
                {completed ? 'Starter requirement completed' : 'Complete Starter to unlock more affiliate products'}
              </h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-violet-100/70 sm:text-sm">
                {completed
                  ? 'Your verified Starter affiliate sales reached the current requirement. Eligible affiliate products are now available according to DRIGHT access rules.'
                  : 'This is the requirement you need to complete before the wider affiliate marketplace unlocks.'}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Crown className={'h-4 w-4 ' + (completed ? 'text-amber-300' : 'text-violet-200')} />
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-white/55">Affiliate level</p>
                  <p className="text-sm font-black">{progress.current_level_label}</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl bg-white px-3 py-2 text-center text-slate-950">
              <p className="text-[9px] font-black uppercase tracking-wide text-slate-500">Level</p>
              <p className="text-xl font-black">{progress.current_level_number}</p>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/7 p-3">
            <p className="text-[9px] font-bold uppercase tracking-wide text-white/50">Verified sales</p>
            <p className="mt-1 text-xl font-black">{progress.sales.toLocaleString()}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/7 p-3">
            <p className="text-[9px] font-bold uppercase tracking-wide text-white/50">Required</p>
            <p className="mt-1 text-xl font-black">{progress.target_sales.toLocaleString()}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/7 p-3">
            <p className="text-[9px] font-bold uppercase tracking-wide text-white/50">Remaining</p>
            <p className={'mt-1 text-xl font-black ' + (completed ? 'text-emerald-300' : 'text-amber-300')}>
              {progress.remaining_sales.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-violet-100">Starter task progress</span>
            <span className="font-black text-white">{progress.sales}/{progress.target_sales} · {percent}%</span>
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-white/10">
            <div
              className={'h-full rounded-full transition-all duration-500 ' + (completed ? 'bg-emerald-400' : 'bg-gradient-to-r from-violet-400 via-fuchsia-400 to-amber-300')}
              style={{ width: percent + '%' }}
            />
          </div>
          {!completed && (
            <p className="mt-2 text-xs text-violet-100/65">
              Get {progress.remaining_sales.toLocaleString()} more verified Starter sale{progress.remaining_sales === 1 ? '' : 's'} to move from <strong>{progress.base_level_label}</strong> to <strong>{progress.unlock_label}</strong>.
            </p>
          )}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {completed ? (
            <Link to="/market?affiliate=1" className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-white px-4 text-sm font-black text-slate-950 hover:bg-violet-50">
              <ShoppingBag className="h-4 w-4" /> View affiliate products <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <Link to="/dright/starter" className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-white px-4 text-sm font-black text-slate-950 hover:bg-violet-50">
              <Target className="h-4 w-4" /> Complete Starter task <ArrowRight className="h-4 w-4" />
            </Link>
          )}
          <Link to="/challenges?section=affiliate&challenge=starter_affiliate" className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-violet-300/30 bg-violet-400/10 px-4 text-sm font-black text-violet-100 hover:bg-violet-400/20">
            <Trophy className="h-4 w-4" /> Starter leaderboard
          </Link>
        </div>

        {!compact && (
          <p className="mt-4 text-[10px] leading-4 text-white/45">
            The requirement is dynamic. If DRIGHT changes the target from {progress.target_sales}, this board automatically recalculates sales completed, sales remaining, percentage and affiliate level from the current setting.
          </p>
        )}
      </div>
    </section>
  );
}
