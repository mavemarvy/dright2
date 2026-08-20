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
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface SiteSettings {
  id: string;
  site_name: string;
  favicon_url: string | null;
  logo_url: string | null;
  maintenance_mode: boolean;
}

export default function AdminSiteSettingsPage() {
  const {} = useAuth();
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    const { data, error } = await supabase
      .from('site_settings')
      .select('*')
      .eq('singleton', true)
      .maybeSingle();

    if (error) {
      setError('Failed to load site settings');
    } else if (data) {
      setSettings(data as SiteSettings);
    }
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
