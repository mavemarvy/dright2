import { Star, Package, ShoppingBag, Clock, Calendar, Eye, TrendingUp, Award } from 'lucide-react';
import type { ProfileStats as ProfileStatsType } from './profileTypes';
import { formatStatValue } from './profileTypes';

interface ProfileStatsProps {
  stats: ProfileStatsType;
  showStats: boolean;
}

export function ProfileStats({ stats, showStats }: ProfileStatsProps) {
  if (!showStats) return null;

  const statItems = [
    { label: 'Listings', value: stats.total_listings, type: 'count' as const, icon: Package, color: 'text-blue-500' },
    { label: 'Total Sales', value: stats.total_sales, type: 'count' as const, icon: ShoppingBag, color: 'text-green-500' },
    { label: 'Reviews', value: stats.total_reviews, type: 'count' as const, icon: Star, color: 'text-amber-500' },
    { label: 'Avg Rating', value: stats.average_rating, type: 'rating' as const, icon: Award, color: 'text-purple-500' },
    { label: 'Response Time', value: stats.response_time_hours, type: 'hours' as const, icon: Clock, color: 'text-indigo-500' },
    { label: 'Years on Dright', value: stats.years_on_dright, type: 'years' as const, icon: Calendar, color: 'text-teal-500' },
    { label: 'Followers', value: stats.followers, type: 'count' as const, icon: TrendingUp, color: 'text-pink-500' },
    { label: 'Profile Views', value: stats.profile_views, type: 'count' as const, icon: Eye, color: 'text-orange-500' },
  ].filter((s) => {
    if (s.type === 'rating') return s.value > 0;
    return s.value > 0 || s.label === 'Listings' || s.label === 'Years on Dright';
  });

  if (statItems.length === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {statItems.map((stat, i) => (
        <div key={i} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
          <stat.icon className={`w-5 h-5 ${stat.color} mb-2`} />
          <p className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">
            {formatStatValue(stat.value, stat.type)}
          </p>
        </div>
      ))}
    </div>
  );
}
