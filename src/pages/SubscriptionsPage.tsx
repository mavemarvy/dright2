import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Loader2, Check, Crown, Sparkles, Zap, TrendingUp, CreditCard,
  Clock3, Boxes, CalendarDays,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useCurrency } from '../contexts/CurrencyContext';
import {
  useSubscriptionPlans,
  useUserSubscriptions,
  cancelSubscription,
  initializePayment,
  type SubscriptionPlan,
} from '../lib/paystackService';
import { getMyPlatformAccess, type PlatformAccessStatus } from '../lib/platformAccess';
import {
  getMyListingCapacity,
  type ListingCapacityPack,
  type ListingCapacityStatus,
} from '../lib/listingAllowance';

const PLAN_ICONS: Record<string, any> = {
  affiliate: TrendingUp,
  vendor: Crown,
  premium: Sparkles,
  ai: Zap,
  advertising: CreditCard,
  platform_access: Crown,
};

const PLAN_COLORS: Record<string, string> = {
  affiliate: 'from-blue-500 to-blue-400',
  vendor: 'from-purple-500 to-purple-400',
  premium: 'from-amber-500 to-amber-400',
  ai: 'from-cyan-500 to-cyan-400',
  advertising: 'from-emerald-500 to-emerald-400',
  platform_access: 'from-indigo-600 to-primary-500',
};

export default function SubscriptionsPage() {
  const { user } = useAuth();
  const { format } = useCurrency();
  const navigate = useNavigate();
  const { plans, loading } = useSubscriptionPlans();
  const { subscriptions, reload } = useUserSubscriptions(user?.id);

  const [platformAccess, setPlatformAccess] = useState<PlatformAccessStatus | null>(null);
  const [listingCapacity, setListingCapacity] = useState<ListingCapacityStatus | null>(null);
  const [buyingPackId, setBuyingPackId] = useState<string | null>(null);
  const [listingMessage, setListingMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setPlatformAccess(null);
      setListingCapacity(null);
      return;
    }

    let active = true;
    void Promise.all([
      getMyPlatformAccess(),
      getMyListingCapacity(),
    ]).then(([access, capacity]) => {
      if (!active) return;
      setPlatformAccess(access);
      setListingCapacity(capacity);
    });

    return () => { active = false; };
  }, [user]);

  const activeSubIds = new Set(
    subscriptions
      .filter(subscription => subscription.status === 'active' || subscription.status === 'trialing')
      .map(subscription => subscription.plan_id),
  );

  const handleSubscribe = (plan: SubscriptionPlan) => {
    if (!user) return;
    navigate(`/subscriptions/checkout?plan_id=${plan.id}`);
  };

  const handleCancel = async (subId: string) => {
    await cancelSubscription(subId);
    reload();
  };

  const handleBuyListingPack = async (pack: ListingCapacityPack) => {
    if (!user || pack.amount <= 0) return;

    setBuyingPackId(pack.id);
    setListingMessage(null);

    const result = await initializePayment({
      amount: pack.amount,
      purpose: 'listing_capacity',
      reference_id: pack.id,
      metadata: {
        pack_id: pack.id,
        pack_name: pack.name,
        custom_redirect: '/subscriptions',
      },
    });

    if ('error' in result) {
      setListingMessage(result.error);
      setBuyingPackId(null);
      return;
    }

    window.location.href = result.authorization_url;
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  const grouped = plans.reduce((acc, plan) => {
    (acc[plan.plan_type] = acc[plan.plan_type] || []).push(plan);
    return acc;
  }, {} as Record<string, SubscriptionPlan[]>);

  const accessTimer = platformAccess?.subscription_active && platformAccess.subscription_period_end
    ? {
        label: platformAccess.subscription_plan_name || 'DRIGHT Platform Access',
        type: 'Subscription',
        used: Number(platformAccess.subscription_days_used || 0),
        remaining: Number(platformAccess.subscription_days_remaining || 0),
        total: Math.max(
          1,
          Number(platformAccess.subscription_days_used || 0)
            + Number(platformAccess.subscription_days_remaining || 0),
        ),
        end: platformAccess.subscription_period_end,
      }
    : platformAccess?.trial_active && platformAccess.trial_end
      ? {
          label: platformAccess.trial_source === 'dright_starter_purchase'
            ? 'DRIGHT Starter Access'
            : 'Professional Access Trial',
          type: platformAccess.trial_source === 'dright_starter_purchase'
            ? 'Verified Starter Trial'
            : 'Free Trial',
          used: Number(platformAccess.trial_days_used || 0),
          remaining: Number(platformAccess.trial_days_remaining || 0),
          total: Math.max(
            1,
            Number(platformAccess.trial_total_days || platformAccess.trial_days || 1),
          ),
          end: platformAccess.trial_end,
        }
      : null;

  const accessProgress = accessTimer
    ? Math.min(100, Math.max(0, (accessTimer.used / accessTimer.total) * 100))
    : 0;

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
          <Crown className="w-5 h-5 text-primary-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Subscriptions & Capacity</h1>
          <p className="text-sm text-gray-500">
            Platform access, listing capacity, and optional add-ons are separate.
          </p>
        </div>
      </div>

      {platformAccess && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-600">
                DRIGHT Platform Access
              </p>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mt-1">
                {platformAccess.access_state === 'trial'
                  ? (
                    platformAccess.trial_source === 'dright_starter_purchase'
                      ? 'DRIGHT Starter access active'
                      : 'Professional access free trial'
                  )
                  : platformAccess.access_state === 'subscribed'
                    ? 'Platform subscription active'
                    : platformAccess.access_state === 'subscription_required'
                      ? 'Platform subscription required'
                      : platformAccess.access_state === 'configuration_pending'
                        ? 'Platform subscription is being configured'
                        : platformAccess.access_state === 'policy_off'
                          ? 'Platform subscription is currently disabled'
                          : 'Buyer access is free'}
              </h2>

              {accessTimer ? (
                <div className="mt-3 max-w-xl">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-gray-700 dark:text-gray-200">
                      <Clock3 className="w-3.5 h-3.5 text-primary-500" />
                      {accessTimer.label} · {accessTimer.type}
                    </span>
                    <span className="text-gray-500">
                      {accessTimer.remaining} day{accessTimer.remaining === 1 ? '' : 's'} remaining
                    </span>
                  </div>
                  <div className="mt-2 h-2.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-primary-500"
                      style={{ width: `${accessProgress}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-gray-400">
                    <span>{accessTimer.used} days used</span>
                    <span>Ends {new Date(accessTimer.end).toLocaleDateString()}</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500 mt-1">
                  {platformAccess.access_state === 'subscription_required'
                    ? 'Your professional-access period has ended. Subscribe to use the paid-role features selected by Admin.'
                    : platformAccess.access_state === 'subscribed'
                      ? 'Your professional-role tools remain available while this subscription is active.'
                      : platformAccess.access_state === 'policy_off'
                        ? 'Admin has not enabled the professional-role monthly access subscription.'
                        : 'Browsing, buying, purchases, and buyer features remain free.'}
                </p>
              )}

              <p className="text-xs text-emerald-600 mt-2 font-medium">
                Buyer access always remains free.
              </p>
            </div>

            {platformAccess.access_state === 'subscription_required' && platformAccess.plan_id && (
              <button
                onClick={() => navigate(`/subscriptions/checkout?plan_id=${platformAccess.plan_id}`)}
                className="shrink-0 px-4 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold"
              >
                Subscribe
                {platformAccess.price && platformAccess.price > 0
                  ? ` · ${format(platformAccess.price, platformAccess.currency || 'USD')}/month`
                  : ''}
              </button>
            )}
          </div>
        </div>
      )}

      {listingCapacity?.authenticated && listingCapacity.enabled && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Boxes className="w-5 h-5 text-primary-600" />
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                  Listing Capacity
                </h2>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Free monthly listing allowance first. Paid capacity is only needed after your available slots are used.
              </p>
            </div>

            {listingCapacity.period_end && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 dark:bg-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-200">
                <CalendarDays className="w-3.5 h-3.5" />
                Resets {new Date(listingCapacity.period_end).toLocaleDateString()}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl bg-primary-50 dark:bg-primary-950/20 p-3">
              <p className="text-[11px] uppercase tracking-wide text-primary-600 font-semibold">
                Free allowance
              </p>
              <p className="text-xl font-black text-gray-900 dark:text-white mt-1">
                {listingCapacity.free_allowance ?? 0}
              </p>
            </div>
            <div className="rounded-xl bg-gray-50 dark:bg-gray-700/40 p-3">
              <p className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">
                Used
              </p>
              <p className="text-xl font-black text-gray-900 dark:text-white mt-1">
                {listingCapacity.free_used ?? 0}
              </p>
            </div>
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/20 p-3">
              <p className="text-[11px] uppercase tracking-wide text-emerald-600 font-semibold">
                Free remaining
              </p>
              <p className="text-xl font-black text-gray-900 dark:text-white mt-1">
                {listingCapacity.free_remaining ?? 0}
              </p>
            </div>
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 p-3">
              <p className="text-[11px] uppercase tracking-wide text-amber-600 font-semibold">
                Purchased remaining
              </p>
              <p className="text-xl font-black text-gray-900 dark:text-white mt-1">
                {listingCapacity.extra_remaining ?? 0}
              </p>
            </div>
          </div>

          {listingMessage && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {listingMessage}
            </div>
          )}

          {(listingCapacity.packs?.length || 0) > 0 ? (
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-2">
                Buy extra listing capacity
              </h3>
              <div className="grid sm:grid-cols-2 gap-3">
                {(listingCapacity.packs || []).map(pack => (
                  <div
                    key={pack.id}
                    className="rounded-xl border border-gray-200 dark:border-gray-700 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-gray-900 dark:text-white">{pack.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {pack.description || `${pack.listing_count} additional listing slots`}
                        </p>
                      </div>
                      <span className="rounded-full bg-primary-50 text-primary-700 px-2.5 py-1 text-xs font-bold">
                        +{pack.listing_count}
                      </span>
                    </div>

                    <div className="mt-3 flex items-end justify-between gap-3">
                      <div>
                        <p className="text-lg font-black text-gray-900 dark:text-white">
                          {format(pack.amount, pack.currency)}
                        </p>
                        <p className="text-[11px] text-gray-400">
                          valid {pack.validity_days} day{pack.validity_days === 1 ? '' : 's'}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={buyingPackId === pack.id || pack.amount <= 0}
                        onClick={() => void handleBuyListingPack(pack)}
                        className="rounded-lg bg-primary-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                      >
                        {buyingPackId === pack.id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : pack.amount > 0
                            ? 'Buy capacity'
                            : 'Not priced'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-500">
              No paid capacity packs are enabled right now. Admin can add quantities, prices,
              currencies, durations, and category/type restrictions without changing code.
            </p>
          )}

          <p className="text-[11px] text-gray-400">
            Promotions affect visibility only. They do not add listing slots. Editing an existing
            listing does not consume another slot.
          </p>
        </div>
      )}

      {subscriptions.filter(
        subscription => subscription.status === 'active' || subscription.status === 'trialing',
      ).length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase mb-3">
            Active Subscriptions
          </h2>
          <div className="space-y-2">
            {subscriptions
              .filter(subscription => (
                subscription.status === 'active' || subscription.status === 'trialing'
              ))
              .map(subscription => (
                <div
                  key={subscription.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/30"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {subscription.plan?.name || 'Plan'}
                    </p>
                    <p className="text-xs text-gray-400">
                      {subscription.status === 'trialing' ? 'Access ends' : 'Renews'}{' '}
                      {new Date(subscription.current_period_end).toLocaleDateString()}
                      {subscription.cancel_at_period_end && ' • Canceled'}
                    </p>
                  </div>
                  {!subscription.cancel_at_period_end && (
                    <button
                      onClick={() => void handleCancel(subscription.id)}
                      className="text-xs text-red-500 hover:text-red-600 font-medium"
                    >
                      Cancel
                    </button>
                  )}
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
              <Icon className="w-4 h-4" />
              {type === 'ai' ? 'AI Add-ons' : `${type.replace(/_/g, ' ')} Plans`}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {typePlans.map(plan => {
                const isActive = activeSubIds.has(plan.id);
                const color = PLAN_COLORS[plan.plan_type] || PLAN_COLORS.premium;

                return (
                  <div
                    key={plan.id}
                    className={`relative bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 ${isActive ? 'ring-2 ring-emerald-400' : ''}`}
                  >
                    {isActive && (
                      <span className="absolute -top-2 right-4 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-xs font-medium">
                        Active
                      </span>
                    )}

                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center mb-3`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>

                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">{plan.name}</h3>

                    <div className="flex items-baseline gap-1 mt-3">
                      <span className="text-2xl font-bold text-gray-900 dark:text-white">
                        {format(plan.amount, plan.currency || 'USD')}
                      </span>
                      <span className="text-sm text-gray-400">/{plan.interval}</span>
                    </div>

                    {plan.features.length > 0 && (
                      <ul className="mt-4 space-y-1.5">
                        {plan.features.map((feature, index) => (
                          <li
                            key={index}
                            className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300"
                          >
                            <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                            {feature}
                          </li>
                        ))}
                      </ul>
                    )}

                    <button
                      onClick={() => handleSubscribe(plan)}
                      disabled={isActive}
                      className={`w-full mt-4 py-2.5 rounded-xl font-semibold text-sm transition-colors ${
                        isActive
                          ? 'bg-gray-100 text-gray-400'
                          : `bg-gradient-to-r ${color} text-white hover:opacity-90`
                      }`}
                    >
                      {isActive
                        ? 'Current Plan'
                        : `Subscribe for ${format(plan.amount, plan.currency || 'USD')}`}
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
