import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Check, Crown, Sparkles, Zap, TrendingUp, CreditCard } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getCurrencySymbol } from '../lib/currency';
import { useSubscriptionPlans, useUserSubscriptions, cancelSubscription, type SubscriptionPlan } from '../lib/paystackService';

const PLAN_ICONS: Record<string, any> = {
  affiliate: TrendingUp, vendor: Crown, premium: Sparkles, ai: Zap, advertising: CreditCard,
};
const PLAN_COLORS: Record<string, string> = {
  affiliate: 'from-blue-500 to-blue-400', vendor: 'from-purple-500 to-purple-400',
  premium: 'from-amber-500 to-amber-400', ai: 'from-cyan-500 to-cyan-400', advertising: 'from-emerald-500 to-emerald-400',
};

export default function SubscriptionsPage() {
  const { user } = useAuth();
  const cSym = getCurrencySymbol('NGN');
  const navigate = useNavigate();
  const { plans, loading } = useSubscriptionPlans();
  const { subscriptions, reload } = useUserSubscriptions(user?.id);
  const [subscribing] = useState<string | null>(null);

  const activeSubIds = new Set(subscriptions.filter(s => s.status === 'active' || s.status === 'trialing').map(s => s.plan_id));

  const handleSubscribe = (plan: SubscriptionPlan) => {
    if (!user) return;
    navigate(`/subscriptions/checkout?plan_id=${plan.id}`);
  };

  const handleCancel = async (subId: string) => {
    await cancelSubscription(subId);
    reload();
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>;

  const grouped = plans.reduce((acc, p) => { (acc[p.plan_type] = acc[p.plan_type] || []).push(p); return acc; }, {} as Record<string, SubscriptionPlan[]>);

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center"><Crown className="w-5 h-5 text-primary-600" /></div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Subscriptions</h1>
          <p className="text-sm text-gray-500">Upgrade your DRIGHT experience with premium plans</p>
        </div>
      </div>

      {null}

      {subscriptions.filter(s => s.status === 'active' || s.status === 'trialing').length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase mb-3">Active Subscriptions</h2>
          <div className="space-y-2">
            {subscriptions.filter(s => s.status === 'active' || s.status === 'trialing').map(s => (
              <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/30">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{s.plan?.name || 'Plan'}</p>
                  <p className="text-xs text-gray-400">
                    {s.status === 'trialing' ? 'Trial ends' : 'Renews'} {new Date(s.current_period_end).toLocaleDateString()}
                    {s.cancel_at_period_end && ' • Canceled'}
                  </p>
                </div>
                {!s.cancel_at_period_end && <button onClick={() => handleCancel(s.id)} className="text-xs text-red-500 hover:text-red-600 font-medium">Cancel</button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {Object.entries(grouped).map(([type, typePlans]) => {
        const Icon = PLAN_ICONS[type] || Crown;
        return (
          <div key={type}>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 capitalize flex items-center gap-2">
              <Icon className="w-4 h-4" /> {type} Plans
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {typePlans.map(plan => {
                const isActive = activeSubIds.has(plan.id);
                const color = PLAN_COLORS[plan.plan_type] || PLAN_COLORS.premium;
                return (
                  <div key={plan.id} className={`relative bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 ${isActive ? 'ring-2 ring-emerald-400' : ''}`}>
                    {isActive && <span className="absolute -top-2 right-4 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-xs font-medium">Active</span>}
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center mb-3`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">{plan.name}</h3>
                    <p className="text-sm text-gray-500 mt-0.5">{plan.description}</p>
                    <div className="flex items-baseline gap-1 mt-3">
                      <span className="text-2xl font-bold text-gray-900 dark:text-white">{cSym}{plan.amount.toLocaleString()}</span>
                      <span className="text-sm text-gray-400">/{plan.interval}</span>
                    </div>
                    {plan.trial_days > 0 && <p className="text-xs text-emerald-600 mt-1">{plan.trial_days} days free trial</p>}
                    <ul className="mt-4 space-y-1.5">
                      {plan.features.map((f, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                          <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" /> {f}
                        </li>
                      ))}
                    </ul>
                    <button onClick={() => handleSubscribe(plan)} disabled={isActive || subscribing === plan.id}
                      className={`w-full mt-4 py-2.5 rounded-xl font-semibold text-sm transition-colors ${isActive ? 'bg-gray-100 text-gray-400' : `bg-gradient-to-r ${color} text-white hover:opacity-90`}`}>
                      {subscribing === plan.id ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : isActive ? 'Current Plan' : `Subscribe for ${cSym}${plan.amount.toLocaleString()}`}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
