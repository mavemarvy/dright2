import { TrendingUp, Megaphone, CheckCircle } from 'lucide-react';
import type { ProfileData } from './profileTypes';

interface AffiliateProfileProps {
  profile: ProfileData;
  promotedCategories: string[];
}

export function AffiliateProfile({ profile, promotedCategories }: AffiliateProfileProps) {
  return (
    <div className="space-y-6">
      {/* Affiliate Stats */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-5">
          <TrendingUp className="w-5 h-5 text-indigo-500" />
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Affiliate Partner</h3>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <AffiliateMetric
            label="Status"
            value={profile.marketer_status === 'active' ? 'Active' : 'Inactive'}
            icon={CheckCircle}
            color={profile.marketer_status === 'active' ? 'text-green-500' : 'text-gray-400'}
          />
          <AffiliateMetric
            label="Marketer Level"
            value={profile.marketer_status === 'active' ? `Level ${profile.weekly_sales_count || 0}` : '—'}
            icon={TrendingUp}
            color="text-indigo-500"
          />
          <AffiliateMetric
            label="Weekly Sales"
            value={(profile.weekly_sales_count || 0).toLocaleString()}
            icon={Megaphone}
            color="text-purple-500"
          />
        </div>
      </div>

      {/* Promoted Categories */}
      {promotedCategories.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 sm:p-6">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Categories Promoted</h3>
          <div className="flex flex-wrap gap-2">
            {promotedCategories.map((cat, i) => (
              <span
                key={i}
                className="px-3 py-1.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400"
              >
                {cat}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* About */}
      {profile.bio && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 sm:p-6">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-2">About</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{profile.bio}</p>
        </div>
      )}
    </div>
  );
}

function AffiliateMetric({ label, value, icon: Icon, color }: { label: string; value: string; icon: typeof TrendingUp; color: string }) {
  return (
    <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800">
      <Icon className={`w-4 h-4 ${color} mb-1.5`} />
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-sm font-bold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}
