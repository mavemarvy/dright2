import { useEffect, useState } from 'react';
import { CreditCard, Loader2, Save, ShieldCheck, Users } from 'lucide-react';
import {
  getAdminSubscriptionCatalog,
  getAdminPlatformAccessPolicy,
  updateAdminPlatformAccessPolicy,
  updateAdminSubscriptionPlan,
  type AdminSubscriptionCatalog,
  type AdminSubscriptionPlan,
  type PlatformAccessAdminPolicy,
} from '../../lib/platformAccess';

function Toggle({ value, disabled, onChange }: { value: boolean; disabled?: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={value}
      disabled={disabled}
      onClick={onChange}
      className={`relative h-7 w-12 rounded-full transition-colors disabled:opacity-50 ${value ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`}
    >
      <span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white transition-transform ${value ? 'translate-x-5' : ''}`} />
    </button>
  );
}

const intervals = ['daily', 'weekly', 'monthly', 'yearly'] as const;

export default function AdminSubscriptionsPage() {
  const [catalog, setCatalog] = useState<AdminSubscriptionCatalog | null>(null);
  const [policy, setPolicy] = useState<PlatformAccessAdminPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [savingPlanId, setSavingPlanId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([getAdminSubscriptionCatalog(), getAdminPlatformAccessPolicy()])
      .then(([nextCatalog, nextPolicy]) => {
        if (!active) return;
        setCatalog(nextCatalog);
        setPolicy(nextPolicy);
        setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const updatePlan = (id: string, patch: Partial<AdminSubscriptionPlan>) => {
    setCatalog(current => current ? {
      ...current,
      plans: current.plans.map(plan => plan.id === id ? { ...plan, ...patch } : plan),
    } : current);
  };

  const savePlan = async (plan: AdminSubscriptionPlan) => {
    setSavingPlanId(plan.id);
    setMessage(null);
    try {
      const next = await updateAdminSubscriptionPlan(plan);
      updatePlan(plan.id, next);
      setMessage(`${next.name} saved.`);
      if (next.plan_type === 'platform_access') {
        const nextPolicy = await getAdminPlatformAccessPolicy();
        setPolicy(nextPolicy);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save subscription plan.');
    } finally {
      setSavingPlanId(null);
    }
  };

  const savePolicy = async () => {
    if (!policy) return;
    setSavingPolicy(true);
    setMessage(null);
    try {
      const next = await updateAdminPlatformAccessPolicy(policy);
      setPolicy(next);
      const nextCatalog = await getAdminSubscriptionCatalog();
      setCatalog(nextCatalog);
      setMessage('Platform access policy saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save platform access policy.');
    } finally {
      setSavingPolicy(false);
    }
  };

  if (loading) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-primary-600" /></div>;
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-primary-600 flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white">Subscriptions</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Manage DRIGHT plans, role access, trials, pricing, billing cadence, and feature gates.</p>
          </div>
        </div>
      </div>

      {message && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
          {message}
        </div>
      )}

      {policy && (
        <section className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-600" />
                <h2 className="font-black text-gray-900 dark:text-white">DRIGHT Platform Access</h2>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Buyer access stays free. Admin chooses which professional roles and features require the monthly access subscription.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void savePolicy()}
              disabled={savingPolicy}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {savingPolicy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Access Policy
            </button>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <label className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Platform subscription</p>
                <p className="text-xs text-gray-500 mt-0.5">Master switch.</p>
              </div>
              <Toggle
                value={policy.settings.enabled}
                onChange={() => setPolicy({ ...policy, settings: { ...policy.settings, enabled: !policy.settings.enabled } })}
              />
            </label>
            <label className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Free trial</p>
                <p className="text-xs text-gray-500 mt-0.5">Turn off to charge from day one.</p>
              </div>
              <Toggle
                value={policy.settings.trial_enabled}
                onChange={() => setPolicy({ ...policy, settings: { ...policy.settings, trial_enabled: !policy.settings.trial_enabled } })}
              />
            </label>
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/20 p-4">
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Buyer access</p>
              <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">Always free and locked by policy.</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label>
              <span className="block text-xs font-semibold text-gray-500 mb-1">Monthly price</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={policy.settings.monthly_price}
                onChange={e => setPolicy({ ...policy, settings: { ...policy.settings, monthly_price: Number(e.target.value) } })}
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5 text-sm"
              />
            </label>
            <label>
              <span className="block text-xs font-semibold text-gray-500 mb-1">Currency</span>
              <input
                value={policy.settings.currency}
                maxLength={3}
                onChange={e => setPolicy({ ...policy, settings: { ...policy.settings, currency: e.target.value.toUpperCase() } })}
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5 text-sm uppercase"
              />
            </label>
            <label>
              <span className="block text-xs font-semibold text-gray-500 mb-1">Trial days</span>
              <input
                type="number"
                min={0}
                max={730}
                disabled={!policy.settings.trial_enabled}
                value={policy.settings.trial_days}
                onChange={e => setPolicy({ ...policy, settings: { ...policy.settings, trial_days: Number(e.target.value) } })}
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5 text-sm disabled:opacity-50"
              />
            </label>
            <label>
              <span className="block text-xs font-semibold text-gray-500 mb-1">Grace days</span>
              <input
                type="number"
                min={0}
                max={60}
                value={policy.settings.grace_period_days}
                onChange={e => setPolicy({ ...policy, settings: { ...policy.settings, grace_period_days: Number(e.target.value) } })}
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5 text-sm"
              />
            </label>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-gray-500" />
              <h3 className="text-sm font-black text-gray-900 dark:text-white">Roles requiring subscription</h3>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {policy.roles.map(role => (
                <div key={role.role_key} className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{role.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{role.description}</p>
                  </div>
                  <Toggle
                    value={role.requires_subscription}
                    disabled={role.locked_free}
                    onChange={() => setPolicy({
                      ...policy,
                      roles: policy.roles.map(item => item.role_key === role.role_key
                        ? { ...item, requires_subscription: item.locked_free ? false : !item.requires_subscription }
                        : item),
                    })}
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-black text-gray-900 dark:text-white mb-3">Feature gates when unpaid</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {policy.features.map(feature => (
                <div key={feature.feature_key} className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{feature.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{feature.description}</p>
                    </div>
                    <Toggle
                      value={feature.requires_subscription && feature.is_active}
                      onChange={() => setPolicy({
                        ...policy,
                        features: policy.features.map(item => item.feature_key === feature.feature_key
                          ? { ...item, requires_subscription: !item.requires_subscription, is_active: true }
                          : item),
                      })}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="font-black text-gray-900 dark:text-white">Subscription Catalog</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Prices and billing cadence are server-authoritative. DRIGHT Platform Access remains monthly.</p>
        </div>
        <div className="grid lg:grid-cols-2 gap-4">
          {(catalog?.plans || []).map(plan => (
            <div key={plan.id} className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wide text-primary-600">{plan.plan_type.replace(/_/g, ' ')}</p>
                  <input
                    value={plan.name}
                    onChange={e => updatePlan(plan.id, { name: e.target.value })}
                    className="mt-1 w-full bg-transparent text-lg font-black text-gray-900 dark:text-white outline-none border-b border-transparent focus:border-gray-200"
                  />
                </div>
                <Toggle value={plan.is_active} onChange={() => updatePlan(plan.id, { is_active: !plan.is_active })} />
              </div>

              <textarea
                rows={2}
                value={plan.description || ''}
                onChange={e => updatePlan(plan.id, { description: e.target.value })}
                placeholder="Plan description"
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5 text-sm"
              />

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <label>
                  <span className="block text-[11px] font-semibold text-gray-500 mb-1">Price</span>
                  <input type="number" min={0} step="0.01" value={plan.amount} onChange={e => updatePlan(plan.id, { amount: Number(e.target.value) })}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2.5 py-2 text-sm" />
                </label>
                <label>
                  <span className="block text-[11px] font-semibold text-gray-500 mb-1">Currency</span>
                  <input value={plan.currency} maxLength={3} onChange={e => updatePlan(plan.id, { currency: e.target.value.toUpperCase() })}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2.5 py-2 text-sm uppercase" />
                </label>
                <label>
                  <span className="block text-[11px] font-semibold text-gray-500 mb-1">Interval</span>
                  <select value={plan.plan_type === 'platform_access' ? 'monthly' : plan.interval} disabled={plan.plan_type === 'platform_access'}
                    onChange={e => updatePlan(plan.id, { interval: e.target.value as AdminSubscriptionPlan['interval'] })}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2.5 py-2 text-sm disabled:opacity-60">
                    {intervals.map(interval => <option key={interval} value={interval}>{interval}</option>)}
                  </select>
                </label>
                <label>
                  <span className="block text-[11px] font-semibold text-gray-500 mb-1">Trial days {plan.plan_type === 'platform_access' ? '(use Access Policy above)' : ''}</span>
                  <input type="number" min={0} max={730} value={plan.plan_type === 'platform_access' ? 0 : plan.trial_days} disabled={plan.plan_type === 'platform_access'} onChange={e => updatePlan(plan.id, { trial_days: Number(e.target.value) })}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2.5 py-2 text-sm disabled:opacity-60" />
                </label>
              </div>

              <label>
                <span className="block text-[11px] font-semibold text-gray-500 mb-1">Grace period (days)</span>
                <input type="number" min={0} max={60} value={plan.grace_period_days} onChange={e => updatePlan(plan.id, { grace_period_days: Number(e.target.value) })}
                  className="w-28 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2.5 py-2 text-sm" />
              </label>

              <label>
                <span className="block text-[11px] font-semibold text-gray-500 mb-1">Features — one per line</span>
                <textarea
                  rows={4}
                  value={plan.features.join('\n')}
                  onChange={e => updatePlan(plan.id, { features: e.target.value.split('\n').map(item => item.trim()).filter(Boolean) })}
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5 text-sm"
                />
              </label>

              <button
                type="button"
                disabled={savingPlanId === plan.id}
                onClick={() => void savePlan(plan)}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 dark:bg-white dark:text-slate-950 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              >
                {savingPlanId === plan.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Plan
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
