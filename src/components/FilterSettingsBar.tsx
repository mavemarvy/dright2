import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Save, Trash2, RotateCcw, Eraser, Bookmark, Check, AlertCircle,
  Loader2, ChevronDown, FolderOpen, X,
} from 'lucide-react';
import {
  type FilterState, type SavedFilterConfig,
  DEFAULT_FILTER_STATE, EMPTY_FILTER_STATE,
  fetchSavedConfigs, saveConfig, updateConfig, deleteConfig,
} from '../lib/filterConfigs';

interface FilterSettingsBarProps {
  userId: string | undefined;
  filterState: FilterState;
  onFilterChange: (state: FilterState) => void;
}

type ToastType = 'success' | 'error';
interface Toast { type: ToastType; message: string; }

export default function FilterSettingsBar({ userId, filterState, onFilterChange }: FilterSettingsBarProps) {
  const [configs, setConfigs] = useState<SavedFilterConfig[]>([]);
  const [loadingConfigs, setLoadingConfigs] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLoadDropdown, setShowLoadDropdown] = useState(false);
  const [configName, setConfigName] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const showToast = useCallback((type: ToastType, message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Load saved configs on mount
  useEffect(() => {
    if (!userId) return;
    loadConfigs();
  }, [userId]);

  const loadConfigs = async () => {
    if (!userId) return;
    setLoadingConfigs(true);
    try {
      const data = await fetchSavedConfigs(userId);
      setConfigs(data);
    } catch {
      showToast('error', 'Failed to load saved filters');
    } finally {
      setLoadingConfigs(false);
    }
  };

  // Auto-save: when a config is active, debounce-save filter changes
  useEffect(() => {
    if (!activeConfigId) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      try {
        await updateConfig(activeConfigId, filterState);
      } catch {
        // Silent fail on auto-save — don't toast on every debounce miss
      }
    }, 1000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [filterState, activeConfigId]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowLoadDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleClear = () => {
    onFilterChange(EMPTY_FILTER_STATE);
    setActiveConfigId(null);
    showToast('success', 'All filters cleared');
  };

  const handleReset = () => {
    onFilterChange(DEFAULT_FILTER_STATE);
    setActiveConfigId(null);
    showToast('success', 'Filters reset to defaults');
  };

  const handleSave = async () => {
    if (!userId || !configName.trim()) return;
    setSaving(true);
    try {
      const newConfig = await saveConfig(userId, configName.trim(), filterState);
      setConfigs(prev => [newConfig, ...prev]);
      setActiveConfigId(newConfig.id);
      setShowSaveModal(false);
      setConfigName('');
      showToast('success', `Saved "${newConfig.name}"`);
    } catch {
      showToast('error', 'Failed to save filter configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleLoad = (config: SavedFilterConfig) => {
    onFilterChange({
      searchQuery: config.searchQuery,
      categoryFilter: config.categoryFilter,
      sortBy: config.sortBy,
      locationFilter: config.locationFilter,
      priceMin: config.priceMin,
      priceMax: config.priceMax,
      dateFilter: config.dateFilter,
    });
    setActiveConfigId(config.id);
    setShowLoadDropdown(false);
    showToast('success', `Loaded "${config.name}"`);
  };

  const handleDelete = async (configId: string, configName: string) => {
    setDeletingId(configId);
    try {
      await deleteConfig(configId);
      setConfigs(prev => prev.filter(c => c.id !== configId));
      if (activeConfigId === configId) setActiveConfigId(null);
      showToast('success', `Deleted "${configName}"`);
    } catch {
      showToast('error', 'Failed to delete configuration');
    } finally {
      setDeletingId(null);
    }
  };

  if (!userId) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-400 mr-1">Filter controls:</span>
        <button
          onClick={handleClear}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg px-3 py-1.5 transition-colors"
        >
          <Eraser className="w-4 h-4" /> Clear
        </button>
        <button
          onClick={handleReset}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-lg px-3 py-1.5 transition-colors"
        >
          <RotateCcw className="w-4 h-4" /> Reset
        </button>
        <span className="text-xs text-gray-300 ml-2">Sign in to save configurations</span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm mb-3 ${
              toast.type === 'success'
                ? 'bg-success-muted text-success'
                : 'bg-error-muted text-error'
            }`}
          >
            {toast.type === 'success' ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-wrap items-center gap-2">
        {/* Active config name */}
        {activeConfigId && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-700 bg-primary-50 rounded-lg px-2.5 py-1.5">
            <Bookmark className="w-3.5 h-3.5" />
            {configs.find(c => c.id === activeConfigId)?.name || 'Active'}
          </span>
        )}

        {/* Save current */}
        <button
          onClick={() => setShowSaveModal(true)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg px-3 py-1.5 transition-colors"
        >
          <Save className="w-4 h-4" />
          Save As
        </button>

        {/* Load saved */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowLoadDropdown(!showLoadDropdown)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg px-3 py-1.5 transition-colors"
          >
            <FolderOpen className="w-4 h-4" />
            Load
            <ChevronDown className="w-3.5 h-3.5" />
          </button>

          <AnimatePresence>
            {showLoadDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute top-full left-0 mt-1 w-72 bg-white rounded-xl shadow-lg border border-gray-100 z-20 max-h-80 overflow-y-auto"
              >
                {loadingConfigs ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                  </div>
                ) : configs.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-gray-400">
                    No saved configurations yet
                  </div>
                ) : (
                  <ul className="py-1">
                    {configs.map(config => (
                      <li key={config.id} className="group flex items-center gap-1 px-2 hover:bg-gray-50 transition-colors">
                        <button
                          onClick={() => handleLoad(config)}
                          className={`flex-1 text-left px-2 py-2.5 rounded-lg transition-colors ${
                            activeConfigId === config.id ? 'bg-primary-50 text-primary-700' : 'text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <span className="text-sm font-medium block truncate">{config.name}</span>
                          <span className="text-xs text-gray-400">
                            {config.categoryFilter !== 'All' && config.categoryFilter !== '' ? config.categoryFilter : 'All categories'}
                            {config.locationFilter && ` · ${config.locationFilter}`}
                          </span>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(config.id, config.name); }}
                          disabled={deletingId === config.id}
                          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-error p-1.5 transition-all shrink-0"
                        >
                          {deletingId === config.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Divider */}
        <div className="h-6 w-px bg-gray-200 mx-1" />

        {/* Clear — empties all fields */}
        <button
          onClick={handleClear}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg px-3 py-1.5 transition-colors"
        >
          <Eraser className="w-4 h-4" />
          Clear
        </button>

        {/* Reset — restores predefined defaults (visually distinct: filled amber) */}
        <button
          onClick={handleReset}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-lg px-3 py-1.5 transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          Reset
        </button>
      </div>

      {/* Save Modal */}
      <AnimatePresence>
        {showSaveModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
            onClick={() => setShowSaveModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Save className="w-5 h-5 text-primary-600" /> Save Filter Configuration
                </h3>
                <button onClick={() => setShowSaveModal(false)} className="text-gray-400 hover:text-gray-600 p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-gray-500 mb-3">
                Save your current filter settings with a name so you can quickly load them later.
              </p>
              <input
                type="text"
                value={configName}
                onChange={e => setConfigName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                placeholder="e.g., Remote Marketing Jobs"
                autoFocus
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all mb-4"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setShowSaveModal(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!configName.trim() || saving}
                  className="inline-flex items-center gap-1.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-xl px-4 py-2 transition-colors disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
