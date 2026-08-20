import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Smartphone, Shirt, Download, GraduationCap, Sparkles, Briefcase, Code,
  Megaphone, Heart, Home, Sprout, Gamepad2, BookOpen, Music, Building2,
  Watch, Laptop, Car, Building, ChevronRight, Package, LayoutGrid, List,
} from 'lucide-react';
import { MARKETPLACE_CATEGORIES } from '../../lib/marketplace';
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
    const updated = [categoryId, ...existing].slice(0, 5);
    localStorage.setItem(RECENT_CATEGORIES_KEY, JSON.stringify(updated));
  } catch { /* ignore */ }
}

interface CategorySectionProps {
  onCategorySelect: (categoryId: string, subcategory?: string) => void;
  categoryCounts?: Record<string, number>;
}

export default function CategorySection({ onCategorySelect, categoryCounts }: CategorySectionProps) {
  const [showAll, setShowAll] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [recentCategories, setRecentCategories] = useState<string[]>([]);
  const { t } = useLanguage();

  useEffect(() => {
    setRecentCategories(getRecentCategories());
  }, []);

  const visibleCategories = showAll
    ? MARKETPLACE_CATEGORIES
    : MARKETPLACE_CATEGORIES.slice(0, 10);

  const handleSelect = (categoryId: string) => {
    addRecentCategory(categoryId);
    setRecentCategories(getRecentCategories());
    onCategorySelect(categoryId);
  };

  const recentCats = recentCategories
    .map(id => MARKETPLACE_CATEGORIES.find(c => c.id === id || c.name === id))
    .filter((c): c is NonNullable<typeof c> => c !== undefined)
    .slice(0, 3);

  return (
    <div className="py-2">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{t('browseListings')}</h2>
          <p className="text-sm text-gray-500 mt-0.5">Find exactly what you need</p>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="hidden sm:flex items-center gap-1 bg-gray-100 rounded-xl p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-400'}`}
              aria-label={t('gridView')}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-400'}`}
              aria-label={t('listView')}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
          {MARKETPLACE_CATEGORIES.length > 10 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              {showAll ? 'Show less' : 'See all'}
              <ChevronRight className={`w-4 h-4 transition-transform ${showAll ? '-rotate-90' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* Recently visited categories */}
      {recentCats.length > 0 && !showAll && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Recently Visited</p>
          <div className="flex flex-wrap gap-2">
            {recentCats.map(cat => {
              const Icon = ICON_MAP[cat.icon] || Package;
              return (
                <button
                  key={`recent-${cat.id}`}
                  onClick={() => handleSelect(cat.name)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-50 text-primary-700 text-sm font-medium hover:bg-primary-100 transition-colors"
                >
                  <Icon className="w-3.5 h-3.5" />
                  {cat.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Grid view */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
          {visibleCategories.map((cat, idx) => {
            const Icon = ICON_MAP[cat.icon] || Package;
            const count = categoryCounts?.[cat.id];
            return (
              <motion.button
                key={cat.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(idx * 0.03, 0.3) }}
                onClick={() => handleSelect(cat.name)}
                className="group relative bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-lg hover:border-primary-200 transition-all duration-300 text-left overflow-hidden"
              >

                <div className={`w-11 h-11 rounded-xl ${cat.color} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="font-semibold text-gray-900 text-sm leading-tight mb-1">{cat.name}</h3>
                {count !== undefined && (
                  <p className="text-xs text-gray-400">{count} listing{count !== 1 ? 's' : ''}</p>
                )}
                {cat.subcategories.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {cat.subcategories.slice(0, 3).map(sub => (
                      <span key={sub} className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
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

      {/* List view */}
      {viewMode === 'list' && (
        <div className="space-y-2">
          {visibleCategories.map((cat, idx) => {
            const Icon = ICON_MAP[cat.icon] || Package;
            const count = categoryCounts?.[cat.id];
            return (
              <motion.button
                key={cat.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(idx * 0.02, 0.2) }}
                onClick={() => handleSelect(cat.name)}
                className="group w-full flex items-center gap-4 bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-md hover:border-primary-200 transition-all duration-300 text-left"
              >
                <div className={`w-10 h-10 rounded-xl ${cat.color} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 text-sm">{cat.name}</h3>
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
    </div>
  );
}
