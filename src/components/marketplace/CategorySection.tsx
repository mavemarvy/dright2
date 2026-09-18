import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Smartphone, Shirt, Download, GraduationCap, Sparkles, Briefcase, Code,
  Megaphone, Heart, Home, Sprout, Gamepad2, BookOpen, Music, Building2,
  Watch, Laptop, Car, Building, ChevronRight, ChevronDown, Package, LayoutGrid, List,
} from 'lucide-react';
import type { MarketplaceCategory } from '../../lib/marketplace';
import { supabase } from '../../lib/supabase';
import { useLanguage } from '../../contexts/LanguageContext';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Smartphone, Shirt, Download, GraduationCap, Sparkles, Briefcase, Code,
  Megaphone, Heart, Home, Sprout, Gamepad2, BookOpen, Music, Building2,
  Watch, Laptop, Car, Building,
};

const RECENT_CATEGORIES_KEY = 'dright_recent_categories';

function getRecentCategories(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_CATEGORIES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function addRecentCategory(categoryId: string): void {
  try {
    const existing = getRecentCategories().filter(id => id !== categoryId);
    localStorage.setItem(RECENT_CATEGORIES_KEY, JSON.stringify([categoryId, ...existing].slice(0, 5)));
  } catch { /* ignore */ }
}

interface CategorySectionProps {
  onCategorySelect: (categoryId: string, subcategory?: string) => void;
  categoryCounts?: Record<string, number>;
}

export default function CategorySection({ onCategorySelect, categoryCounts }: CategorySectionProps) {
  const [categories, setCategories] = useState<MarketplaceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [sectionVisible, setSectionVisible] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [recentCategories, setRecentCategories] = useState<string[]>([]);
  const { t } = useLanguage();

  useEffect(() => {
    let cancelled = false;

    const loadCategories = async () => {
      const [categoryResult, settingsResult] = await Promise.all([
        supabase
          .from('marketplace_categories')
          .select('id, name, icon, color, subcategories, popular, sort_order')
          .eq('is_visible', true)
          .order('sort_order', { ascending: true }),
        supabase
          .from('marketplace_ui_settings')
          .select('categories_section_visible, categories_default_collapsed')
          .eq('key', 'default')
          .maybeSingle(),
      ]);

      if (cancelled) return;

      if (categoryResult.error) {
        console.error('[marketplace] category registry unavailable', categoryResult.error);
        setCategories([]);
        setSectionVisible(false);
      } else {
        setCategories((categoryResult.data || []).map(row => ({
          id: row.id,
          name: row.name,
          icon: row.icon,
          color: row.color,
          subcategories: row.subcategories || [],
          popular: row.popular,
        })));
        setSectionVisible(settingsResult.data?.categories_section_visible ?? true);
        setCollapsed(settingsResult.data?.categories_default_collapsed ?? true);
      }

      setRecentCategories(getRecentCategories());
      setLoading(false);
    };

    void loadCategories();
    return () => { cancelled = true; };
  }, []);

  if (loading || !sectionVisible || categories.length === 0) return null;

  const visibleCategories = showAll ? categories : categories.slice(0, 10);

  const handleSelect = (categoryName: string, categoryId: string) => {
    addRecentCategory(categoryId);
    setRecentCategories(getRecentCategories());
    onCategorySelect(categoryName);
  };

  const recentCats = recentCategories
    .map(id => categories.find(c => c.id === id))
    .filter((c): c is MarketplaceCategory => c !== undefined)
    .slice(0, 3);

  return (
    <div className="py-2">
      <div className="flex items-center justify-between gap-3 mb-3">
        <button
          type="button"
          onClick={() => setCollapsed(value => !value)}
          className="flex-1 min-w-0 flex items-center justify-between gap-3 text-left rounded-2xl px-4 py-3 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 hover:border-primary-200 dark:hover:border-primary-700 transition-colors"
          aria-expanded={!collapsed}
        >
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('browseListings')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {collapsed ? `${categories.length} categories available · tap to expand` : 'Find exactly what you need'}
            </p>
          </div>
          <ChevronDown className={`w-5 h-5 text-gray-400 shrink-0 transition-transform ${collapsed ? '' : 'rotate-180'}`} />
        </button>

        {!collapsed && (
          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-white dark:bg-gray-700 text-primary-600 shadow-sm' : 'text-gray-400'}`}
                aria-label={t('gridView')}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-white dark:bg-gray-700 text-primary-600 shadow-sm' : 'text-gray-400'}`}
                aria-label={t('listView')}
              >
                <List className="w-4 h-4" />
              </button>
            </div>

            {categories.length > 10 && (
              <button
                type="button"
                onClick={() => setShowAll(value => !value)}
                className="flex items-center gap-1 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 font-medium whitespace-nowrap"
              >
                {showAll ? 'Show less' : 'See all'}
                <ChevronRight className={`w-4 h-4 transition-transform ${showAll ? '-rotate-90' : ''}`} />
              </button>
            )}
          </div>
        )}
      </div>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            {recentCats.length > 0 && !showAll && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Recently Visited</p>
                <div className="flex flex-wrap gap-2">
                  {recentCats.map(cat => {
                    const Icon = ICON_MAP[cat.icon] || Package;
                    return (
                      <button
                        key={`recent-${cat.id}`}
                        type="button"
                        onClick={() => handleSelect(cat.name, cat.id)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 text-sm font-medium hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors"
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {cat.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {viewMode === 'grid' && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
                {visibleCategories.map((cat, idx) => {
                  const Icon = ICON_MAP[cat.icon] || Package;
                  const count = categoryCounts?.[cat.id];
                  return (
                    <motion.button
                      key={cat.id}
                      type="button"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(idx * 0.03, 0.3) }}
                      onClick={() => handleSelect(cat.name, cat.id)}
                      className="group relative bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 hover:shadow-lg hover:border-primary-200 dark:hover:border-primary-700 transition-all duration-300 text-left overflow-hidden"
                    >
                      <div className={`w-11 h-11 rounded-xl ${cat.color} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm leading-tight mb-1">{cat.name}</h3>
                      {count !== undefined && (
                        <p className="text-xs text-gray-400">{count} listing{count !== 1 ? 's' : ''}</p>
                      )}
                      {cat.subcategories.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {cat.subcategories.slice(0, 3).map(sub => (
                            <span key={sub} className="text-[10px] text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                              {sub}
                            </span>
                          ))}
                          {cat.subcategories.length > 3 && (
                            <span className="text-[10px] text-gray-400">+{cat.subcategories.length - 3}</span>
                          )}
                        </div>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            )}

            {viewMode === 'list' && (
              <div className="space-y-2">
                {visibleCategories.map((cat, idx) => {
                  const Icon = ICON_MAP[cat.icon] || Package;
                  const count = categoryCounts?.[cat.id];
                  return (
                    <motion.button
                      key={cat.id}
                      type="button"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(idx * 0.02, 0.2) }}
                      onClick={() => handleSelect(cat.name, cat.id)}
                      className="group w-full flex items-center gap-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 hover:shadow-md hover:border-primary-200 dark:hover:border-primary-700 transition-all duration-300 text-left"
                    >
                      <div className={`w-10 h-10 rounded-xl ${cat.color} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}>
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{cat.name}</h3>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {cat.subcategories.slice(0, 4).join(' · ')}
                          {cat.subcategories.length > 4 && ` · +${cat.subcategories.length - 4}`}
                        </p>
                      </div>
                      {count !== undefined && (
                        <span className="text-xs text-gray-400 shrink-0">{count} listing{count !== 1 ? 's' : ''}</span>
                      )}
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-primary-500 transition-colors shrink-0" />
                    </motion.button>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
