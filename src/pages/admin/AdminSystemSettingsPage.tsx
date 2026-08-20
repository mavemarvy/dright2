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
import { useAuth } from '../../contexts/AuthContext';

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
  const { profile } = useAuth();
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchConfig();
  }, []);

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
    if (!config) return;
    setSaving(true);
    setError(null);

    try {
      const { error } = await supabase
        .from('system_config')
        .update({
          admin_task_percent: config.admin_task_percent,
          marketer_task_pcts: config.marketer_task_pcts,
          advertiser_task_pcts: config.advertiser_task_pcts,
          marketer_sub_prices: config.marketer_sub_prices,
          advertiser_sub_prices: config.advertiser_sub_prices,
          admin_cut_percent: config.admin_cut_percent,
          updated_at: new Date().toISOString(),
          updated_by: profile?.id,
        })
        .eq('id', config.id);

      if (error) throw error;

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3500);
    } catch (err) {
      console.error('Save error:', err);
      setError('Failed to save settings. Please try again.');
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
                {grade} ($/week)
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
          Partnership range: $200-$500 (use $350 as default mid-point).
        </p>
      </div>
    </div>
  );
}
