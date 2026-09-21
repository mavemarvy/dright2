import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, Clock3, Crown, Gift, Target, TrendingUp } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  getMyPlatformAccess,
  getMySalesProgressionStatus,
  type PlatformAccessStatus,
  type SalesProgressionStatus,
} from '../../lib/platformAccess';
import {
  getMyDrightStarterAffiliateProgress,
  type DrightStarterAffiliateProgress,
} from '../../lib/drightStarter';

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function daysBetween(now: number, end?: string | null): number {
  if (!end) return 0;
  const diff = new Date(end).getTime() - now;
  return Math.max(0, Math.ceil(diff / 86400000));
}

function formatClock(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const days = Math.floor(safe / 86400);
  const hours = Math.floor((safe % 86400) / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export default function ProfileProgressOverview() {
  const { user } = useAuth();
  const [access, setAccess] = useState<PlatformAccessStatus | null>(null);
  const [affiliate, setAffiliate] = useState<DrightStarterAffiliateProgress | null>(null);
  const [sales, setSales] = useState<SalesProgressionStatus | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!user) {
      setAccess(null);
      setAffiliate(null);
      setSales(null);
      return;
    }
    let active = true;
    void Promise.all([
      getMyPlatformAccess(),
      getMyDrightStarterAffiliateProgress(),
      getMySalesProgressionStatus(),
    ]).then(([nextAccess, nextAffiliate, nextSales]) => {
      if (!active) return;
      setAccess(nextAccess);
      setAffiliate(nextAffiliate);
      setSales(nextSales);
    });
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(id);
  }, []);

  const subscription = useMemo(() => {
    if (!access) return null;

    if (access.subscription_active && access.subscription_period_end) {
      const totalStart = access.subscription_period_start ? new Date(access.subscription_period_start).getTime() : now;
      const totalEnd = new Date(access.subscription_period_end).getTime();
      const total = Math.max(1, totalEnd - totalStart);
      const elapsed = Math.max(0, Math.min(total, now - totalStart));
      return {
        label: access.subscription_plan_name || 'DRIGHT Platform Access',
        state: 'Active subscription',
        detail: `${daysBetween(now, access.subscription_period_end)} day${daysBetween(now, access.subscription_period_end) === 1 ? '' : 's'} remaining`,
        percent: clampPercent((elapsed / total) * 100),
        used: access.subscription_days_used ?? 0,
        remaining: daysBetween(now, access.subscription_period_end),
      };
    }

    if (access.trial_active && access.trial_end) {
      const starter = access.trial_source === 'dright_starter_purchase';
      const total = Math.max(1, access.trial_total_days || access.trial_days || 1);
      const remaining = daysBetween(now, access.trial_end);
      const used = Math.max(0, total - remaining);
      return {
        label: starter ? 'DRIGHT Starter Access' : 'Professional access trial',
        state: starter ? 'Verified Starter trial' : 'Free trial',
        detail: `${remaining} day${remaining === 1 ? '' : 's'} remaining`,
        percent: clampPercent((used / total) * 100),
        used,
        remaining,
      };
    }

    if (access.access_state === 'buyer_free') {
      return {
        label: 'Buyer Access',
        state: 'Free access',
        detail: 'Buying and buyer features remain free.',
        percent: 0,
        used: 0,
        remaining: 0,
      };
    }

    return {
      label: 'DRIGHT Platform Access',
      state: access.access_state === 'subscription_required' ? 'Subscription required' : 'Access status',
      detail: access.access_state === 'subscription_required'
        ? 'Professional access period has ended.'
        : 'Open Subscriptions for current access details.',
      percent: 100,
      used: 0,
      remaining: 0,
    };
  }, [access, now]);

  if (!user || (!subscription && !affiliate?.applies && !sales?.eligible)) return null;

  const affiliatePercent = affiliate?.target_sales
    ? clampPercent((affiliate.sales / affiliate.target_sales) * 100)
    : 0;
  const salesPercent = sales?.weekly_target
    ? clampPercent((sales.weekly_sales / sales.weekly_target) * 100)
    : 0;
  const liveSalesSeconds = sales?.period_end
    ? Math.max(0, Math.floor((new Date(sales.period_end).getTime() - now) / 1000))
    : sales?.seconds_remaining || 0;

  return (
    <section className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm p-4 md:p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-400">Progress & Access</p>
          <h2 className="text-base font-black text-gray-900 dark:text-white mt-0.5">Your DRIGHT status at a glance</h2>
        </div>
        <Link to="/subscriptions" className="text-xs font-bold text-primary-600 hover:text-primary-700">Manage</Link>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {subscription && (
          <div className="rounded-2xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/60 dark:bg-indigo-950/20 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300">
                  <Crown className="w-4 h-4" />
                  <span className="text-[11px] font-black uppercase tracking-wide">Subscription</span>
                </div>
                <p className="font-bold text-sm text-gray-900 dark:text-white mt-2 truncate">{subscription.label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subscription.state}</p>
              </div>
              <Clock3 className="w-5 h-5 text-indigo-500 shrink-0" />
            </div>
            <div className="mt-3 h-2 rounded-full bg-indigo-100 dark:bg-indigo-900/50 overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${subscription.percent}%` }} />
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
              <span className="font-semibold text-gray-700 dark:text-gray-200">{subscription.detail}</span>
              {subscription.used > 0 && <span className="text-gray-400">{subscription.used}d used</span>}
            </div>
          </div>
        )}

        {affiliate?.applies && affiliate.enabled && (
          <div className="rounded-2xl border border-violet-100 dark:border-violet-900/40 bg-violet-50/60 dark:bg-violet-950/20 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5 text-violet-700 dark:text-violet-300">
                  <Target className="w-4 h-4" />
                  <span className="text-[11px] font-black uppercase tracking-wide">Affiliate unlock</span>
                </div>
                <p className="font-bold text-sm text-gray-900 dark:text-white mt-2">
                  {affiliate.completed ? affiliate.unlock_label : `${affiliate.sales} sold · ${affiliate.remaining_sales} remaining`}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Goal: {affiliate.target_sales} verified sales</p>
              </div>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${affiliate.completed ? 'bg-emerald-500 text-white' : 'bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-300'}`}>
                {affiliate.completed ? <BadgeCheck className="w-5 h-5" /> : <Gift className="w-5 h-5" />}
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <div className="flex-1 h-2 rounded-full bg-violet-100 dark:bg-violet-900/50 overflow-hidden">
                <div className="h-full bg-violet-500 rounded-full" style={{ width: `${affiliatePercent}%` }} />
              </div>
              <Gift className={`w-4 h-4 shrink-0 ${affiliate.completed ? 'text-emerald-500' : 'text-violet-400'}`} />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px]">
              <span className="font-bold text-violet-700 dark:text-violet-300">{affiliate.sales}/{affiliate.target_sales}</span>
              <Link to="/challenges" className="font-semibold text-violet-600 dark:text-violet-300">View challenge</Link>
            </div>
          </div>
        )}

        {sales?.eligible && (
          <div className="rounded-2xl border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50/60 dark:bg-emerald-950/20 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                  <TrendingUp className="w-4 h-4" />
                  <span className="text-[11px] font-black uppercase tracking-wide">Sales Team week</span>
                </div>
                <p className="font-bold text-sm text-gray-900 dark:text-white mt-2">{sales.stage_label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {sales.weekly_sales}/{sales.weekly_target} sales · {sales.remaining_sales} remaining
                </p>
              </div>
              <Clock3 className="w-5 h-5 text-emerald-600 shrink-0" />
            </div>
            <div className="mt-3 h-2 rounded-full bg-emerald-100 dark:bg-emerald-900/50 overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${salesPercent}%` }} />
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
              <span className="font-semibold text-gray-700 dark:text-gray-200">
                {sales.target_met ? 'Target reached' : `${sales.remaining_sales} to protect/advance level`}
              </span>
              <span className="font-bold text-emerald-700 dark:text-emerald-300">{formatClock(liveSalesSeconds)} left</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
