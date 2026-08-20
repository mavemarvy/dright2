import {
  LayoutGrid, Info, Store, Package, Briefcase, Star, Award,
  Sparkles, Megaphone, TrendingUp,
} from 'lucide-react';
import type { ProfileSectionConfig } from './profileTypes';

const iconMap: Record<string, typeof LayoutGrid> = {
  LayoutGrid, Info, Store, Package, Briefcase, Star, Award,
  Sparkles, Megaphone, TrendingUp,
};

interface ProfileTabsProps {
  sections: ProfileSectionConfig[];
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function ProfileTabs({ sections, activeTab, onTabChange }: ProfileTabsProps) {
  const visibleSections = sections
    .filter((s) => s.visible)
    .sort((a, b) => a.order - b.order);

  return (
    <div className="flex gap-1 mt-6 border-b border-gray-200 dark:border-gray-800 overflow-x-auto pb-px">
      {visibleSections.map((section) => {
        const Icon = iconMap[section.icon] || LayoutGrid;
        const isActive = activeTab === section.key;
        return (
          <button
            key={section.key}
            onClick={() => onTabChange(section.key)}
            className={`inline-flex items-center gap-1.5 px-3 sm:px-4 py-2.5 rounded-t-lg text-sm font-medium whitespace-nowrap transition-colors ${
              isActive
                ? 'border-b-2 border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Icon className="w-4 h-4" />
            {section.label}
          </button>
        );
      })}
    </div>
  );
}
