import { useEffect, useState } from 'react';
import { TrendingUp, Megaphone, CheckCircle, Crown } from 'lucide-react';
import type { ProfileData } from './profileTypes';
import { supabase } from '../../lib/supabase';

interface AffiliateProfileProps {
  profile: ProfileData;
  promotedCategories: string[];
}

export function AffiliateProfile({ profile, promotedCategories }: AffiliateProfileProps) {
  const [affiliateLevel, setAffiliateLevel] = useState<{
    enabled: boolean;
    sales: number;
    target_sales: number;
    remaining_sales: number;
    completed: boolean;
    progress_percent: number;
    current_level_label: string;
    current_level_number: number;
    next_level_label: string | null;
    next_level_number: number | null;
    product_limit: number | null;
    starter_only: boolean;
    max_level: boolean;
  } | null>(null);

  useEffect(() => {
    let active = true;
    void supabase.rpc('get_public_dright_affiliate_level', { p_user_id: profile.id }).then(({ data, error }) => {
      if (!active || error || !data || typeof data !== 'object') return;
      const row = data as Record<string, unknown>;
      setAffiliateLevel({
        enabled: row.enabled === true,
        sales: Number(row.sales ?? 0),
        target_sales: Number(row.target_sales ?? 20),
        remaining_sales: Number(row.remaining_sales ?? 0),
        completed: row.completed === true,
        progress_percent: Number(row.progress_percent ?? 0),
        current_level_label: String(row.current_level_label || 'Starter Affiliate'),
        current_level_number: Number(row.current_level_number ?? 0),
        next_level_label: row.next_level_label == null ? null : String(row.next_level_label),
        next_level_number: row.next_level_number == null ? null : Number(row.next_level_number),
        product_limit: row.product_limit == null ? null : Number(row.product_limit),
        starter_only: row.starter_only === true,
        max_level: row.max_level === true,
      });
    });
    return () => { active = false; };
  }, [profile.id]);

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
            label="Affiliate Level"
            value={profile.marketer_status === 'active'
              ? affiliateLevel?.current_level_label || 'Affiliate Level 0'
              : '—'}
            icon={Crown}
            color={affiliateLevel?.max_level ? 'text-amber-500' : 'text-indigo-500'}
          />
          <AffiliateMetric
            label="Weekly Sales"
            value={(profile.weekly_sales_count || 0).toLocaleString()}
            icon={Megaphone}
            color="text-purple-500"
          />
        </div>

        {profile.marketer_status === 'active' && affiliateLevel?.enabled && (
          <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/20">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-indigo-500">Starter affiliate level</p>
                <p className="mt-1 text-sm font-bold text-gray-900 dark:text-white">
                  Level {affiliateLevel.current_level_number} · {affiliateLevel.current_level_label}
                </p>
              </div>
              <span className="rounded-xl bg-white px-3 py-2 text-xs font-black text-indigo-700 shadow-sm dark:bg-gray-900 dark:text-indigo-300">
                {affiliateLevel.starter_only
                  ? 'Starter only'
                  : affiliateLevel.product_limit == null
                    ? 'Unlimited products'
                    : affiliateLevel.product_limit.toLocaleString() + ' products'}
              </span>
            </div>
            {!affiliateLevel.max_level ? (
              <div className="mt-3">
                <div className="h-2 overflow-hidden rounded-full bg-indigo-100 dark:bg-indigo-950">
                  <div
                    className="h-full rounded-full bg-indigo-500"
                    style={{ width: Math.max(0, Math.min(100, affiliateLevel.progress_percent)) + '%' }}
                  />
                </div>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {affiliateLevel.remaining_sales} verified Starter sale{affiliateLevel.remaining_sales === 1 ? '' : 's'} remaining to reach {affiliateLevel.next_level_label || 'the next affiliate level'}.
                </p>
              </div>
            ) : (
              <p className="mt-3 text-xs font-bold text-amber-600 dark:text-amber-300">Super Affiliate level reached.</p>
            )}
          </div>
        )}
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
