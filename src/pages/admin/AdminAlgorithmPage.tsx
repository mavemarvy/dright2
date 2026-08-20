import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Settings2, Save, RotateCcw, TrendingUp, Shield, Star, Activity, Zap, Clock } from 'lucide-react';
import { fetchAlgorithmWeights, updateAlgorithmWeights, DEFAULT_WEIGHTS, type AlgorithmWeights } from '../../lib/ddsEngine';

interface WeightConfig {
  key: keyof AlgorithmWeights;
  label: string;
  description: string;
  icon: typeof TrendingUp;
  min: number;
  max: number;
  step: number;
}

const WEIGHT_CONFIGS: WeightConfig[] = [
  { key: 'search_weight', label: 'Search Weight', description: 'Relevance of search query matching', icon: Activity, min: 0, max: 100, step: 1 },
  { key: 'click_weight', label: 'Click Weight', description: 'Impact of clicks and CTR on ranking', icon: TrendingUp, min: 0, max: 100, step: 1 },
  { key: 'conversion_weight', label: 'Conversion Weight', description: 'Weight of purchase conversions', icon: Zap, min: 0, max: 100, step: 1 },
  { key: 'rating_weight', label: 'Rating Weight', description: 'Influence of confidence-weighted ratings', icon: Star, min: 0, max: 100, step: 1 },
  { key: 'review_weight', label: 'Review Weight', description: 'Impact of review volume and recency', icon: Star, min: 0, max: 100, step: 1 },
  { key: 'freshness_weight', label: 'Freshness Weight', description: 'Boost for recently listed items', icon: Clock, min: 0, max: 100, step: 1 },
  { key: 'velocity_weight', label: 'Velocity Weight', description: 'Impact of recent growth momentum', icon: TrendingUp, min: 0, max: 100, step: 1 },
  { key: 'trust_weight', label: 'Trust Weight', description: 'Seller verification and reputation', icon: Shield, min: 0, max: 100, step: 1 },
];

const THRESHOLD_CONFIGS: WeightConfig[] = [
  { key: 'trending_threshold', label: 'Trending Threshold', description: 'Minimum velocity score to enter trending', icon: TrendingUp, min: 0, max: 100, step: 1 },
  { key: 'fraud_sensitivity', label: 'Fraud Sensitivity', description: 'How aggressively to flag suspicious activity', icon: Shield, min: 0, max: 100, step: 1 },
  { key: 'min_reviews_for_confidence', label: 'Min Reviews for Confidence', description: 'Reviews needed before full rating confidence', icon: Star, min: 1, max: 50, step: 1 },
  { key: 'trending_decay_rate', label: 'Trending Decay Rate', description: 'How fast trending momentum fades (0-1)', icon: Clock, min: 0.1, max: 1, step: 0.05 },
];

export default function AdminAlgorithmPage() {
  const [weights, setWeights] = useState<AlgorithmWeights>(DEFAULT_WEIGHTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fetchWeights = useCallback(async () => {
    setLoading(true);
    const w = await fetchAlgorithmWeights();
    setWeights(w);
    setLoading(false);
  }, []);

  useEffect(() => { fetchWeights(); }, [fetchWeights]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    const ok = await updateAlgorithmWeights(weights);
    setSaving(false);
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }, [weights]);

  const handleReset = useCallback(() => {
    setWeights(DEFAULT_WEIGHTS);
  }, []);

  const updateWeight = useCallback((key: keyof AlgorithmWeights, value: number) => {
    setWeights(prev => ({ ...prev, [key]: value }));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center">
          <Settings2 className="w-5 h-5 text-primary-600 dark:text-primary-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Algorithm Configuration</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Tune the DRIGHT Demand Score ranking engine</p>
        </div>
      </div>

      {/* Weight Sliders */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 mb-4"
      >
        <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Ranking Weights</h2>
        <div className="space-y-5">
          {WEIGHT_CONFIGS.map(cfg => (
            <div key={cfg.key}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <cfg.icon className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{cfg.label}</span>
                </div>
                <span className="text-sm font-bold text-primary-600 dark:text-primary-400 tabular-nums">
                  {weights[cfg.key]}
                </span>
              </div>
              <p className="text-xs text-gray-400 mb-2">{cfg.description}</p>
              <input
                type="range"
                min={cfg.min}
                max={cfg.max}
                step={cfg.step}
                value={weights[cfg.key]}
                onChange={(e) => updateWeight(cfg.key, Number(e.target.value))}
                className="w-full accent-primary-600 cursor-pointer min-h-[24px]"
                aria-label={cfg.label}
              />
            </div>
          ))}
        </div>
      </motion.div>

      {/* Thresholds */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 mb-4"
      >
        <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Thresholds & Sensitivity</h2>
        <div className="space-y-5">
          {THRESHOLD_CONFIGS.map(cfg => (
            <div key={cfg.key}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <cfg.icon className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{cfg.label}</span>
                </div>
                <span className="text-sm font-bold text-primary-600 dark:text-primary-400 tabular-nums">
                  {cfg.step < 1 ? weights[cfg.key].toFixed(2) : weights[cfg.key]}
                </span>
              </div>
              <p className="text-xs text-gray-400 mb-2">{cfg.description}</p>
              <input
                type="range"
                min={cfg.min}
                max={cfg.max}
                step={cfg.step}
                value={weights[cfg.key]}
                onChange={(e) => updateWeight(cfg.key, Number(e.target.value))}
                className="w-full accent-primary-600 cursor-pointer min-h-[24px]"
                aria-label={cfg.label}
              />
            </div>
          ))}
        </div>
      </motion.div>

      {/* Actions */}
      <div className="flex items-center gap-3 sticky bottom-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50 min-h-[44px]"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
        <button
          onClick={handleReset}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 min-h-[44px]"
        >
          <RotateCcw className="w-4 h-4" />
          Reset to Defaults
        </button>
        {saved && (
          <motion.span
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-sm text-success font-medium"
          >
            Settings saved successfully
          </motion.span>
        )}
      </div>
    </div>
  );
}
