import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Palette,
  Save,
  Loader2,
  CheckCircle,
  AlertCircle,
  Globe,
  Wrench,
  Eye,
  EyeOff,
  Users,
  BarChart3,
  Gamepad2,
  RefreshCw,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { clearBusinessSettingsCache } from '../../lib/seo';

interface SiteSettings {
  id: string;
  site_name: string;
  maintenance_mode: boolean;
}

interface BusinessFooterSettings {
  id: string;
  public_footer_visible: boolean;
}

interface CommunityStatsSettings {
  display_mode: 'live' | 'gamified';
  gamified_active_users: number;
  gamified_verified_sellers: number;
  gamified_affiliates: number;
  gamified_sales: number;
  updated_at?: string;
}

interface CommunityLiveStats {
  active_users: number;
  verified_sellers: number;
  affiliates: number;
  sales: number;
}

interface CommunityStatsAdminResponse {
  success?: boolean;
  settings?: CommunityStatsSettings;
  live?: CommunityLiveStats;
  error?: string;
}

export default function AdminSiteSettingsPage() {
  const { adminRole } = useAuth();
  const isSuperAdmin = adminRole === 'super_admin';
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [businessFooterSettings, setBusinessFooterSettings] = useState<BusinessFooterSettings | null>(null);
  const [canManageBusinessFooter, setCanManageBusinessFooter] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingBusinessFooter, setSavingBusinessFooter] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [communityStats, setCommunityStats] = useState<CommunityStatsSettings | null>(null);
  const [communityLive, setCommunityLive] = useState<CommunityLiveStats | null>(null);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [communitySaving, setCommunitySaving] = useState(false);
  const [communityMessage, setCommunityMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    if (isSuperAdmin) void loadCommunityStats();
  }, [isSuperAdmin]);

  const fetchSettings = async () => {
    const [siteResult, businessResult, permissionResult] = await Promise.all([
      supabase
        .from('site_settings')
        .select('*')
        .eq('singleton', true)
        .maybeSingle(),
      supabase
        .from('business_settings')
        .select('id, public_footer_visible')
        .eq('is_singleton', true)
        .maybeSingle(),
      supabase.rpc('has_dright_permission', { p_module: 'site_settings', p_action: 'manage' }),
    ]);

    if (siteResult.error) {
      setError('Failed to load site settings');
    } else if (siteResult.data) {
      setSettings(siteResult.data as SiteSettings);
    }

    if (businessResult.error) {
      setError(prev => prev || 'Failed to load public business information visibility');
    } else if (businessResult.data) {
      setBusinessFooterSettings(businessResult.data as BusinessFooterSettings);
    }

    setCanManageBusinessFooter(permissionResult.data === true);
    setLoading(false);
  };

  const loadCommunityStats = async () => {
    if (!isSuperAdmin) return;
    setCommunityLoading(true);
    setCommunityMessage(null);
    try {
      const { data, error } = await supabase.functions.invoke('community-stats', {
        body: { action: 'get_admin' },
      });
      if (error) throw error;
      const result = (data || {}) as CommunityStatsAdminResponse;
      if (!result.success || !result.settings || !result.live) {
        throw new Error(result.error || 'Unable to load Welcome-page statistics');
      }
      setCommunityStats({
        ...result.settings,
        gamified_active_users: Number(result.settings.gamified_active_users || 0),
        gamified_verified_sellers: Number(result.settings.gamified_verified_sellers || 0),
        gamified_affiliates: Number(result.settings.gamified_affiliates || 0),
        gamified_sales: Number(result.settings.gamified_sales || 0),
      });
      setCommunityLive({
        active_users: Number(result.live.active_users || 0),
        verified_sellers: Number(result.live.verified_sellers || 0),
        affiliates: Number(result.live.affiliates || 0),
        sales: Number(result.live.sales || 0),
      });
    } catch (err) {
      setCommunityMessage(err instanceof Error ? err.message : 'Unable to load Welcome-page statistics');
    } finally {
      setCommunityLoading(false);
    }
  };

  const saveCommunityStats = async () => {
    if (!isSuperAdmin || !communityStats) return;
    setCommunitySaving(true);
    setCommunityMessage(null);
    try {
      const payload = {
        action: 'update',
        display_mode: communityStats.display_mode,
        gamified_active_users: Math.max(0, Math.trunc(Number(communityStats.gamified_active_users) || 0)),
        gamified_verified_sellers: Math.max(0, Math.trunc(Number(communityStats.gamified_verified_sellers) || 0)),
        gamified_affiliates: Math.max(0, Math.trunc(Number(communityStats.gamified_affiliates) || 0)),
        gamified_sales: Math.max(0, Math.trunc(Number(communityStats.gamified_sales) || 0)),
      };
      const { data, error } = await supabase.functions.invoke('community-stats', { body: payload });
      if (error) throw error;
      const result = (data || {}) as CommunityStatsAdminResponse;
      if (!result.success || !result.settings || !result.live) {
        throw new Error(result.error || 'Unable to save Welcome-page statistics');
      }
      setCommunityStats({
        ...result.settings,
        gamified_active_users: Number(result.settings.gamified_active_users || 0),
        gamified_verified_sellers: Number(result.settings.gamified_verified_sellers || 0),
        gamified_affiliates: Number(result.settings.gamified_affiliates || 0),
        gamified_sales: Number(result.settings.gamified_sales || 0),
      });
      setCommunityLive({
        active_users: Number(result.live.active_users || 0),
        verified_sellers: Number(result.live.verified_sellers || 0),
        affiliates: Number(result.live.affiliates || 0),
        sales: Number(result.live.sales || 0),
      });
      setCommunityMessage(
        result.settings.display_mode === 'live'
          ? 'Welcome page is now showing live DRIGHT analytics.'
          : 'Welcome page is now showing the configured community-highlight values.'
      );
    } catch (err) {
      setCommunityMessage(err instanceof Error ? err.message : 'Unable to save Welcome-page statistics');
    } finally {
      setCommunitySaving(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);

    try {
      const { error } = await supabase
        .from('site_settings')
        .update({
          site_name: settings.site_name,
          maintenance_mode: settings.maintenance_mode,
        })
        .eq('id', settings.id);

      if (error) throw error;

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3500);
    } catch (err) {
      setError('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleBusinessFooterToggle = async () => {
    if (!businessFooterSettings || !canManageBusinessFooter || savingBusinessFooter) return;

    const previous = businessFooterSettings;
    const nextVisible = !previous.public_footer_visible;

    setBusinessFooterSettings({ ...previous, public_footer_visible: nextVisible });
    setSavingBusinessFooter(true);
    setError(null);

    try {
      const { data, error: footerError } = await supabase
        .from('business_settings')
        .update({
          public_footer_visible: nextVisible,
          updated_at: new Date().toISOString(),
        })
        .eq('id', previous.id)
        .select('id, public_footer_visible')
        .single();

      if (footerError || !data) {
        throw footerError || new Error('Business footer visibility was not saved.');
      }

      const saved = data as BusinessFooterSettings;
      setBusinessFooterSettings(saved);
      clearBusinessSettingsCache();

      window.dispatchEvent(new CustomEvent('dright:business-settings-updated', {
        detail: saved,
      }));

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3500);
    } catch (err) {
      console.error('Failed to update public business footer visibility:', err);
      setBusinessFooterSettings(previous);
      setError('Failed to update the public business information footer. Please try again.');
    } finally {
      setSavingBusinessFooter(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-gray-300 border-t-warning rounded-full animate-spin" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-error">
          <AlertCircle className="w-5 h-5" />
          <p>Failed to load site settings.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Palette className="w-6 h-6 text-warning" />
            Site Settings
          </h1>
          <p className="text-sm text-gray-500 mt-1">Manage the site name, public information and maintenance mode</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-warning hover:bg-orange-600 text-white rounded-xl font-medium transition-colors flex items-center gap-2 disabled:opacity-50 min-h-[48px]"
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
        <div className="flex items-center gap-2 bg-error-muted text-error rounded-xl p-3">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {/* Site Name */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <Globe className="w-5 h-5 text-primary-600" />
          Branding
        </h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Site Name</label>
          <input
            type="text"
            value={settings.site_name}
            onChange={(e) => setSettings({ ...settings, site_name: e.target.value })}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-warning focus:ring-2 focus:ring-warning/20 outline-none text-gray-900"
          />
        </div>
      </div>

      {/* Public Business Information Footer */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              {businessFooterSettings?.public_footer_visible === false
                ? <EyeOff className="w-5 h-5 text-gray-500" />
                : <Eye className="w-5 h-5 text-primary-600" />}
              Public Business Information Footer
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-xl">
              Show or hide the entire public business block containing the DRIGHT address, phone, email,
              opening hours, service area, categories, social links and website. Hiding it keeps the saved data.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={businessFooterSettings?.public_footer_visible !== false}
            disabled={!businessFooterSettings || !canManageBusinessFooter || savingBusinessFooter}
            onClick={() => void handleBusinessFooterToggle()}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              businessFooterSettings?.public_footer_visible !== false ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
            }`}
            title={canManageBusinessFooter ? 'Toggle public business information footer' : 'You do not have permission to change this setting'}
          >
            {savingBusinessFooter ? (
              <Loader2 className="w-4 h-4 text-white animate-spin mx-auto" />
            ) : (
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  businessFooterSettings?.public_footer_visible !== false ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            )}
          </button>
        </div>

        <div className="flex items-center justify-between rounded-xl bg-gray-50 dark:bg-gray-900/40 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {businessFooterSettings?.public_footer_visible !== false ? 'Visible' : 'Hidden'}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {savingBusinessFooter
                ? 'Saving visibility setting…'
                : businessFooterSettings?.public_footer_visible !== false
                  ? 'The business-information block is shown wherever DRIGHT uses the public footer. Changes save immediately.'
                  : 'The public business-information block is completely hidden. Changes save immediately.'}
            </p>
          </div>
        </div>

        {!canManageBusinessFooter && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Your admin role can view this setting but cannot change it.
          </p>
        )}
      </div>

      {isSuperAdmin && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary-600" />
                Welcome Page Community Statistics
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-xl">
                Choose whether the public Welcome page shows live DRIGHT activity or configured community-highlight values.
                Live mode always reads the database directly.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadCommunityStats()}
              disabled={communityLoading || communitySaving}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${communityLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {communityLoading && !communityStats ? (
            <div className="py-8 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
            </div>
          ) : communityStats ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  ['Active Users', communityLive?.active_users ?? 0],
                  ['Verified Sellers', communityLive?.verified_sellers ?? 0],
                  ['Affiliates', communityLive?.affiliates ?? 0],
                  ['Successful Sales', communityLive?.sales ?? 0],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-700 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-gray-400">{label}</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-1">{Number(value).toLocaleString()}</p>
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1">Live database value</p>
                  </div>
                ))}
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Public display mode</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCommunityStats({ ...communityStats, display_mode: 'live' })}
                    className={`p-3 rounded-xl border text-left transition-colors ${
                      communityStats.display_mode === 'live'
                        ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
                        : 'border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-gray-100">
                      <Users className="w-4 h-4" /> Live Analytics
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Shows the actual current DRIGHT counts.</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCommunityStats({ ...communityStats, display_mode: 'gamified' })}
                    className={`p-3 rounded-xl border text-left transition-colors ${
                      communityStats.display_mode === 'gamified'
                        ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-gray-100">
                      <Gamepad2 className="w-4 h-4" /> Gamified Display
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Shows configured community-highlight values.</p>
                  </button>
                </div>
              </div>

              <div className={communityStats.display_mode === 'gamified' ? 'space-y-3' : 'space-y-3 opacity-60'}>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ['Active Users', 'gamified_active_users'],
                    ['Verified Sellers', 'gamified_verified_sellers'],
                    ['Affiliates', 'gamified_affiliates'],
                    ['Successful Sales', 'gamified_sales'],
                  ].map(([label, field]) => (
                    <label key={field} className="block">
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        disabled={communityStats.display_mode !== 'gamified'}
                        value={communityStats[field as keyof CommunityStatsSettings] as number}
                        onChange={(e) => setCommunityStats({
                          ...communityStats,
                          [field]: Math.max(0, Math.trunc(Number(e.target.value) || 0)),
                        })}
                        className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-800"
                      />
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  Gamified values are display values, not live analytics. The public page uses neutral “community momentum” wording in this mode rather than calling them real-time numbers.
                </p>
              </div>

              {communityMessage && (
                <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 p-3 text-sm">
                  {communityMessage}
                </div>
              )}

              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-gray-400">
                  {communityStats.updated_at ? `Last saved ${new Date(communityStats.updated_at).toLocaleString()}` : 'Not saved yet'}
                </p>
                <button
                  type="button"
                  onClick={() => void saveCommunityStats()}
                  disabled={communitySaving || communityLoading}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 disabled:opacity-50"
                >
                  {communitySaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save community stats
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-red-600">{communityMessage || 'Unable to load community statistics.'}</p>
          )}
        </div>
      )}

      {/* Maintenance Mode */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <Wrench className="w-5 h-5 text-warning" />
          Maintenance Mode
        </h2>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.maintenance_mode}
            onChange={(e) => setSettings({ ...settings, maintenance_mode: e.target.checked })}
            className="mt-0.5 w-5 h-5 rounded border-2 border-gray-300 text-warning focus:ring-warning"
          />
          <div>
            <p className="text-sm font-medium text-gray-900">Enable maintenance mode</p>
            <p className="text-xs text-gray-500 mt-1">
              When enabled, regular users will see a maintenance notice instead of the dashboard.
            </p>
          </div>
        </label>
      </div>
    </div>
  );
}
