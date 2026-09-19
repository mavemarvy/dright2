import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Palette,
  Save,
  Loader2,
  CheckCircle,
  AlertCircle,
  Globe,
  Image as ImageIcon,
  Wrench,
  Eye,
  EyeOff,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { clearBusinessSettingsCache } from '../../lib/seo';

interface SiteSettings {
  id: string;
  site_name: string;
  favicon_url: string | null;
  logo_url: string | null;
  maintenance_mode: boolean;
}

interface BusinessFooterSettings {
  id: string;
  public_footer_visible: boolean;
}

export default function AdminSiteSettingsPage() {
  const {} = useAuth();
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [businessFooterSettings, setBusinessFooterSettings] = useState<BusinessFooterSettings | null>(null);
  const [canManageBusinessFooter, setCanManageBusinessFooter] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingBusinessFooter, setSavingBusinessFooter] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

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

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);

    try {
      const { error } = await supabase
        .from('site_settings')
        .update({
          site_name: settings.site_name,
          favicon_url: settings.favicon_url,
          logo_url: settings.logo_url,
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

  const uploadImage = async (file: File, type: 'favicon' | 'logo') => {
    const setUploading = type === 'favicon' ? setUploadingFavicon : setUploadingLogo;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `site-assets/${type}-${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('product-images')
        .upload(path, file, { upsert: false });

      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage
        .from('product-images')
        .getPublicUrl(path);

      if (settings) {
        setSettings({
          ...settings,
          [type === 'favicon' ? 'favicon_url' : 'logo_url']: urlData.publicUrl,
        });
      }
    } catch (err) {
      setError(`Failed to upload ${type}. Please try again.`);
    } finally {
      setUploading(false);
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
          <p className="text-sm text-gray-500 mt-1">Manage site branding and maintenance mode</p>
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

      {/* Favicon */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <ImageIcon className="w-5 h-5 text-primary-600" />
          Favicon
        </h2>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl border border-gray-200 overflow-hidden bg-gray-50 flex items-center justify-center shrink-0">
            {settings.favicon_url ? (
              <img src={settings.favicon_url} alt="Favicon" className="w-full h-full object-cover" />
            ) : (
              <ImageIcon className="w-8 h-8 text-gray-300" />
            )}
          </div>
          <label className="flex-1 cursor-pointer">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadImage(file, 'favicon');
              }}
            />
            <div className="px-4 py-3 border-2 border-dashed border-gray-300 hover:border-warning rounded-xl text-center text-sm text-gray-600 hover:bg-warning-muted/30 transition-colors">
              {uploadingFavicon ? (
                <Loader2 className="w-5 h-5 animate-spin mx-auto" />
              ) : (
                'Click to upload favicon'
              )}
            </div>
          </label>
        </div>
      </div>

      {/* Logo */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <ImageIcon className="w-5 h-5 text-primary-600" />
          Logo
        </h2>
        <div className="flex items-center gap-4">
          <div className="w-32 h-16 rounded-xl border border-gray-200 overflow-hidden bg-gray-50 flex items-center justify-center shrink-0">
            {settings.logo_url ? (
              <img src={settings.logo_url} alt="Logo" className="w-full h-full object-contain" />
            ) : (
              <ImageIcon className="w-8 h-8 text-gray-300" />
            )}
          </div>
          <label className="flex-1 cursor-pointer">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadImage(file, 'logo');
              }}
            />
            <div className="px-4 py-3 border-2 border-dashed border-gray-300 hover:border-warning rounded-xl text-center text-sm text-gray-600 hover:bg-warning-muted/30 transition-colors">
              {uploadingLogo ? (
                <Loader2 className="w-5 h-5 animate-spin mx-auto" />
              ) : (
                'Click to upload logo'
              )}
            </div>
          </label>
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
