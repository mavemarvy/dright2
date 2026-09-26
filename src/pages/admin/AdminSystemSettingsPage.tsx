import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Settings,
  Save,
  Loader2,
  CheckCircle,
  AlertCircle,
  Percent,
  DollarSign,
  TrendingUp,
  Award,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import AdminDrightStarterProductSettings from '../../components/admin/AdminDrightStarterProductSettings';
import {
  getAdminPlatformAccessPolicy,
  updateAdminPlatformAccessPolicy,
  type PlatformAccessAdminPolicy,
} from '../../lib/platformAccess';

interface ConfigData {
  id: string;
  admin_task_percent: number;
  marketer_task_pcts: Record<string, number>;
  advertiser_task_pcts: Record<string, number>;
  marketer_sub_prices: Record<string, number>;
  advertiser_sub_prices: Record<string, number>;
  admin_cut_percent: number;
}

const MARKETER_LEVELS = ['3', '4', '5'];
const ADVERTISER_GRADES = ['A', 'B', 'C', 'Pro', 'Super', 'Partnership'];

export default function AdminSystemSettingsPage() {
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [platformPolicy, setPlatformPolicy] = useState<PlatformAccessAdminPolicy | null>(null);
  const [platformLoading, setPlatformLoading] = useState(true);
  const [platformSaving, setPlatformSaving] = useState(false);
  const [platformMessage, setPlatformMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchConfig();
    void loadPlatformPolicy();
  }, []);

  const loadPlatformPolicy = async () => {
    setPlatformLoading(true);
    try {
      const policy = await getAdminPlatformAccessPolicy();
      setPlatformPolicy(policy);
    } finally {
      setPlatformLoading(false);
    }
  };

  const savePlatformPolicy = async () => {
    if (!platformPolicy || platformSaving) return;
    setPlatformSaving(true);
    setPlatformMessage(null);
    try {
      if (platformPolicy.settings.enabled && Number(platformPolicy.settings.monthly_price) <= 0) {
        setPlatformMessage('Set a monthly price above 0 before enabling paid platform access.');
        return;
      }
      const next = await updateAdminPlatformAccessPolicy(platformPolicy);
      setPlatformPolicy(next);
      setPlatformMessage('DRIGHT platform subscription policy saved.');
    } catch (err) {
      console.error('Platform access policy save failed', err);
      setPlatformMessage(err instanceof Error ? err.message : 'Unable to save platform subscription policy.');
    } finally {
      setPlatformSaving(false);
    }
  };

  const togglePlatformRole = (roleKey: string) => {
    if (!platformPolicy) return;
    setPlatformPolicy({
      ...platformPolicy,
      roles: platformPolicy.roles.map(role =>
        role.role_key === roleKey && !role.locked_free
          ? { ...role, requires_subscription: !role.requires_subscription }
          : role
      ),
    });
  };

  const togglePlatformFeature = (featureKey: string) => {
    if (!platformPolicy) return;
    setPlatformPolicy({
      ...platformPolicy,
      features: platformPolicy.features.map(feature =>
        feature.feature_key === featureKey
          ? { ...feature, requires_subscription: !feature.requires_subscription }
          : feature
      ),
    });
  };

  const fetchConfig = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('system_config')
      .select('*')
      .eq('singleton', true)
      .maybeSingle();

    if (error) {
      setError('Failed to load system config');
      console.error(error);
    } else if (data) {
      setConfig({
        id: data.id,
        admin_task_percent: Number(data.admin_task_percent),
        marketer_task_pcts: data.marketer_task_pcts as Record<string, number>,
        advertiser_task_pcts: data.advertiser_task_pcts as Record<string, number>,
        marketer_sub_prices: data.marketer_sub_prices as Record<string, number>,
        advertiser_sub_prices: data.advertiser_sub_prices as Record<string, number>,
        admin_cut_percent: Number(data.admin_cut_percent),
      });
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!config || saving) return;
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const { data, error: saveError } = await supabase.rpc('admin_update_system_config', {
        p_admin_task_percent: Number(config.admin_task_percent),
        p_marketer_task_pcts: config.marketer_task_pcts,
        p_advertiser_task_pcts: config.advertiser_task_pcts,
        p_marketer_sub_prices: config.marketer_sub_prices,
        p_advertiser_sub_prices: config.advertiser_sub_prices,
        p_admin_cut_percent: Number(config.admin_cut_percent),
      });

      if (saveError) throw saveError;

      const saved = (data ?? {}) as Partial<ConfigData>;
      setConfig(current => current ? {
        ...current,
        admin_task_percent: Number(saved.admin_task_percent ?? current.admin_task_percent),
        marketer_task_pcts: (saved.marketer_task_pcts ?? current.marketer_task_pcts) as Record<string, number>,
        advertiser_task_pcts: (saved.advertiser_task_pcts ?? current.advertiser_task_pcts) as Record<string, number>,
        marketer_sub_prices: (saved.marketer_sub_prices ?? current.marketer_sub_prices) as Record<string, number>,
        advertiser_sub_prices: (saved.advertiser_sub_prices ?? current.advertiser_sub_prices) as Record<string, number>,
        admin_cut_percent: Number(saved.admin_cut_percent ?? current.admin_cut_percent),
      } : current);

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3500);
    } catch (err) {
      console.error('System settings save failed:', err);
      const message = err && typeof err === 'object' && 'message' in err
        ? String((err as { message?: unknown }).message || '')
        : '';
      setError(message ? `Failed to save settings: ${message}` : 'Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const updateMarketerTask = (level: string, value: number) => {
    if (!config) return;
    setConfig({
      ...config,
      marketer_task_pcts: { ...config.marketer_task_pcts, [level]: value },
    });
  };

  const updateAdvertiserTask = (grade: string, value: number) => {
    if (!config) return;
    setConfig({
      ...config,
      advertiser_task_pcts: { ...config.advertiser_task_pcts, [grade]: value },
    });
  };

  const updateMarketerPrice = (level: string, value: number) => {
    if (!config) return;
    setConfig({
      ...config,
      marketer_sub_prices: { ...config.marketer_sub_prices, [level]: value },
    });
  };

  const updateAdvertiserPrice = (grade: string, value: number) => {
    if (!config) return;
    setConfig({
      ...config,
      advertiser_sub_prices: { ...config.advertiser_sub_prices, [grade]: value },
    });
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-warning" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-error">
          <AlertCircle className="w-5 h-5" />
          <p>Failed to load system configuration.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Settings className="w-6 h-6 text-warning" />
            System Settings
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure task percentages and subscription prices for all sales team tiers.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-warning hover:bg-orange-600 text-white rounded-xl font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Changes
        </button>
      </div>

      {success && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 bg-success-muted text-success rounded-xl p-3"
        >
          <CheckCircle className="w-5 h-5" />
          Settings saved successfully!
        </motion.div>
      )}
      {error && (
        <div className="flex items-center gap-2 bg-error/10 text-error rounded-xl p-3">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}


      {/* DRIGHT Platform Access Subscription */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-900">DRIGHT Platform Access Subscription</h2>
            <p className="text-sm text-gray-500 mt-1">
              Buyers always keep free platform access. Paid access only gates the professional roles and features enabled below.
            </p>
          </div>
          {platformPolicy && (
            <button
              type="button"
              onClick={savePlatformPolicy}
              disabled={platformSaving}
              className="px-4 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {platformSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Platform Subscription
            </button>
          )}
        </div>

        {platformMessage && (
          <div className="rounded-xl bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700">
            {platformMessage}
          </div>
        )}

        {platformLoading ? (
          <div className="py-8 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
          </div>
        ) : !platformPolicy ? (
          <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 text-sm text-gray-500">
            Platform subscription controls are unavailable for this admin account.
          </div>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <label className="sm:col-span-2 flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-4">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Paid platform access</p>
                  <p className="text-xs text-gray-500 mt-0.5">Turn enforcement on/off globally.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setPlatformPolicy({
                    ...platformPolicy,
                    settings: { ...platformPolicy.settings, enabled: !platformPolicy.settings.enabled },
                  })}
                  className={`relative w-12 h-7 rounded-full transition-colors ${platformPolicy.settings.enabled ? 'bg-primary-600' : 'bg-gray-300'}`}
                  aria-pressed={platformPolicy.settings.enabled}
                >
                  <span className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ${platformPolicy.settings.enabled ? 'translate-x-5' : ''}`} />
                </button>
              </label>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Price</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={platformPolicy.settings.monthly_price}
                  onChange={(e) => setPlatformPolicy({
                    ...platformPolicy,
                    settings: { ...platformPolicy.settings, monthly_price: Number(e.target.value || 0) },
                  })}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                <input
                  type="text"
                  maxLength={3}
                  value={platformPolicy.settings.currency}
                  onChange={(e) => setPlatformPolicy({
                    ...platformPolicy,
                    settings: { ...platformPolicy.settings, currency: e.target.value.toUpperCase().slice(0, 3) },
                  })}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none uppercase"
                />
              </div>

              <label className="sm:col-span-2 flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-4">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Standard signup free trial</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Default is 30 days for users who did not claim DRIGHT Starter Access. Starter buyers use the independent Starter-product access duration below.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPlatformPolicy({
                    ...platformPolicy,
                    settings: { ...platformPolicy.settings, trial_enabled: !platformPolicy.settings.trial_enabled },
                  })}
                  className={`relative w-12 h-7 rounded-full transition-colors ${platformPolicy.settings.trial_enabled ? 'bg-success' : 'bg-gray-300'}`}
                  aria-pressed={platformPolicy.settings.trial_enabled}
                >
                  <span className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ${platformPolicy.settings.trial_enabled ? 'translate-x-5' : ''}`} />
                </button>
              </label>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Standard Trial Days</label>
                <input
                  type="number"
                  min="0"
                  max="730"
                  disabled={!platformPolicy.settings.trial_enabled}
                  value={platformPolicy.settings.trial_days}
                  onChange={(e) => setPlatformPolicy({
                    ...platformPolicy,
                    settings: { ...platformPolicy.settings, trial_days: Math.max(0, Number(e.target.value || 0)) },
                  })}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Grace Period (days)</label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={platformPolicy.settings.grace_period_days}
                  onChange={(e) => setPlatformPolicy({
                    ...platformPolicy,
                    settings: { ...platformPolicy.settings, grace_period_days: Math.max(0, Number(e.target.value || 0)) },
                  })}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none"
                />
              </div>
            </div>

            <div>
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-gray-900">Who needs the monthly subscription?</h3>
                <p className="text-xs text-gray-500 mt-0.5">Buyer is permanently free. Toggle each earning/professional role independently.</p>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                {platformPolicy.roles.map(role => (
                  <div key={role.role_key} className="rounded-xl border border-gray-200 p-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{role.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{role.description}</p>
                      {role.locked_free && (
                        <span className="inline-block mt-2 text-[11px] font-semibold text-success">Always free</span>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={role.locked_free}
                      onClick={() => togglePlatformRole(role.role_key)}
                      className={`relative shrink-0 w-12 h-7 rounded-full transition-colors disabled:opacity-70 ${role.requires_subscription ? 'bg-primary-600' : 'bg-gray-300'}`}
                      aria-pressed={role.requires_subscription}
                    >
                      <span className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ${role.requires_subscription ? 'translate-x-5' : ''}`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-gray-900">Features unavailable without payment</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  These switches decide which role tools are locked after the trial when the user has no active platform subscription.
                </p>
              </div>
              <div className="space-y-3">
                {platformPolicy.features.map(feature => (
                  <div key={feature.feature_key} className="rounded-xl border border-gray-200 p-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{feature.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{feature.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => togglePlatformFeature(feature.feature_key)}
                      className={`relative shrink-0 w-12 h-7 rounded-full transition-colors ${feature.requires_subscription ? 'bg-primary-600' : 'bg-gray-300'}`}
                      aria-pressed={feature.requires_subscription}
                    >
                      <span className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ${feature.requires_subscription ? 'translate-x-5' : ''}`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {!platformPolicy.settings.enabled && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-3">
                The policy is configured but currently OFF. No user is blocked until you set a positive price, turn Paid platform access ON, and save.
              </p>
            )}
          </>
        )}
      </div>

      <AdminDrightStarterProductSettings />

      {/* Global settings */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <Percent className="w-5 h-5 text-warning" />
          Global Settings
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Default Admin Task (%)
            </label>
            <input
              type="number"
              value={config.admin_task_percent}
              onChange={(e) =>
                setConfig({ ...config, admin_task_percent: parseFloat(e.target.value) || 0 })
              }
              step="0.5"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-warning focus:ring-2 focus:ring-warning/20 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Admin Cut on Contract Expiry (%)
            </label>
            <input
              type="number"
              value={config.admin_cut_percent}
              onChange={(e) =>
                setConfig({ ...config, admin_cut_percent: parseFloat(e.target.value) || 0 })
              }
              step="0.5"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-warning focus:ring-2 focus:ring-warning/20 outline-none"
            />
          </div>
        </div>
      </div>

      {/* Marketer Task Percents */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-success" />
          Marketer Task Percentages
        </h2>
        <div className="grid grid-cols-3 gap-4">
          {MARKETER_LEVELS.map((level) => (
            <div key={level}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Marketer L{level} (%)
              </label>
              <input
                type="number"
                value={config.marketer_task_pcts[level] || 0}
                onChange={(e) => updateMarketerTask(level, parseFloat(e.target.value) || 0)}
                step="0.5"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-success focus:ring-2 focus:ring-success/20 outline-none"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Advertiser Task Percents */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <Award className="w-5 h-5 text-warning" />
          Advertiser Task Percentages
        </h2>
        <div className="grid grid-cols-3 gap-4">
          {ADVERTISER_GRADES.map((grade) => (
            <div key={grade}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {grade} (%)
              </label>
              <input
                type="number"
                value={config.advertiser_task_pcts[grade] || 0}
                onChange={(e) => updateAdvertiserTask(grade, parseFloat(e.target.value) || 0)}
                step="0.5"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-warning focus:ring-2 focus:ring-warning/20 outline-none"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Marketer Subscription Prices */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-success" />
          Marketer Subscription Prices (Weekly Base)
        </h2>
        <div className="grid grid-cols-3 gap-4">
          {MARKETER_LEVELS.map((level) => (
            <div key={level}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Marketer L{level} ($/week)
              </label>
              <input
                type="number"
                value={config.marketer_sub_prices[level] || 0}
                onChange={(e) => updateMarketerPrice(level, parseFloat(e.target.value) || 0)}
                step="1"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-success focus:ring-2 focus:ring-success/20 outline-none"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Advertiser Subscription Prices */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-warning" />
          Advertiser Subscription Prices (Weekly Base)
        </h2>
        <div className="grid grid-cols-3 gap-4">
          {ADVERTISER_GRADES.map((grade) => (
            <div key={grade}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {grade} (USD/week)
              </label>
              <input
                type="number"
                value={config.advertiser_sub_prices[grade] || 0}
                onChange={(e) => updateAdvertiserPrice(grade, parseFloat(e.target.value) || 0)}
                step="1"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-warning focus:ring-2 focus:ring-warning/20 outline-none"
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500">
          Note: 2-week duration = 2x base price, 1-month duration = 4x base price.
          Partnership range: USD 200-USD 500 (use USD 350 as default mid-point).
        </p>
      </div>
    </div>
  );
}
