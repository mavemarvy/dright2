// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT Buyer Analytics Dashboard — Real-time, server-verified
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react';
import {
  ShoppingBag, CheckCircle, Download, Heart, Package, Briefcase, GraduationCap,
  DollarSign, TrendingUp, Gift, Wallet, Star,
} from 'lucide-react';
import { BarChart, StatCard } from './Charts';
import { AnalyticsState, AnalyticsNoData } from './AnalyticsState';
import { useBuyerAnalyticsV2 } from '../../lib/analyticsHooksV2';
import { formatCurrency } from '../../lib/currency';

const formatStatValue = (v: number | string) => formatCurrency(typeof v === "string" ? parseFloat(v) : v);

export function BuyerAnalyticsDashboard() {
  const { data, loading, error, syncing, offline } = useBuyerAnalyticsV2();


  const monthlySpendingData = useMemo(() => {
    if (!data?.monthly_spending?.length) return [];
    return data.monthly_spending.map((d) => ({
      label: new Date(d.month).toLocaleDateString('en', { month: 'short', year: '2-digit' }),
      value: Number(d.spent),
    }));
  }, [data?.monthly_spending]);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-indigo-500" />
        Buyer Analytics
      </h2>

      <AnalyticsState loading={loading} error={error} syncing={syncing} offline={offline} hasData={!!data}>
        {data && (
          <div className="space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              <StatCard label="Orders" value={data.orders} icon={ShoppingBag} color="text-indigo-500" bg="bg-indigo-50" loading={loading} />
              <StatCard label="Purchases" value={data.purchases} icon={CheckCircle} color="text-green-500" bg="bg-green-50" loading={loading} />
              <StatCard label="Downloads" value={data.downloads} icon={Download} color="text-purple-500" bg="bg-purple-50" loading={loading} />
              <StatCard label="Wishlist" value={data.wishlist_count} icon={Heart} color="text-pink-500" bg="bg-pink-50" loading={loading} />
              <StatCard label="Total Spent" value={data.total_spent} icon={DollarSign} color="text-green-600" bg="bg-green-50" formatValue={formatStatValue} loading={loading} />
              <StatCard label="Wallet Balance" value={data.wallet_balance} icon={Wallet} color="text-amber-500" bg="bg-amber-50" formatValue={formatStatValue} loading={loading} />
            </div>

            {/* Saved items breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <StatCard label="Saved Products" value={data.saved_products} icon={Package} color="text-blue-500" bg="bg-blue-50" loading={loading} />
              <StatCard label="Saved Services" value={data.saved_services} icon={Briefcase} color="text-orange-500" bg="bg-orange-50" loading={loading} />
              <StatCard label="Saved Courses" value={data.saved_courses} icon={GraduationCap} color="text-purple-500" bg="bg-purple-50" loading={loading} />
            </div>

            {/* Spending chart */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-green-500" /> Monthly Spending
              </h3>
              {monthlySpendingData.length ? <BarChart data={monthlySpendingData} color="#10b981" formatValue={formatStatValue} /> : <AnalyticsNoData />}
            </div>

            {/* Recently Viewed + Recently Purchased */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Recently Viewed</h3>
                {data.recently_viewed?.length ? (
                  <div className="space-y-2">
                    {data.recently_viewed.map((item, i) => (
                      <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.name} className="w-10 h-10 rounded-lg object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                            <Package className="w-5 h-5 text-gray-400" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{item.name || 'Unknown'}</p>
                          <p className="text-xs text-gray-400">{new Date(item.viewed_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <AnalyticsNoData />}
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Recently Purchased</h3>
                {data.recently_purchased?.length ? (
                  <div className="space-y-2">
                    {data.recently_purchased.map((item, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{item.product_name || 'Unknown'}</p>
                          <p className="text-xs text-gray-400">{new Date(item.date).toLocaleDateString()}</p>
                        </div>
                        <span className="text-sm font-medium text-green-500">{formatCurrency(item.price)}</span>
                      </div>
                    ))}
                  </div>
                ) : <AnalyticsNoData />}
              </div>
            </div>

            {/* Favorite Categories + Rewards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-500" /> Favorite Categories
                </h3>
                {data.favorite_categories?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {data.favorite_categories.map((c, i) => (
                      <span key={i} className="px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-sm text-amber-700 dark:text-amber-400">
                        {c.category} <span className="font-medium">{c.count}</span>
                      </span>
                    ))}
                  </div>
                ) : <AnalyticsNoData />}
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <Gift className="w-4 h-4 text-purple-500" /> Reward History
                </h3>
                {data.reward_history?.length ? (
                  <div className="space-y-2">
                    {data.reward_history.map((r, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                        <span className="text-sm text-gray-600 dark:text-gray-400 capitalize">{r.type}</span>
                        <span className="text-sm font-medium text-purple-500">{formatCurrency(r.amount)}</span>
                      </div>
                    ))}
                  </div>
                ) : <AnalyticsNoData />}
              </div>
            </div>

            {/* Referral earnings */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <Wallet className="w-4 h-4 text-indigo-500" /> Referral Earnings
              </h3>
              <p className="text-3xl font-bold text-indigo-500">{formatCurrency(data.referral_earnings)}</p>
            </div>
          </div>
        )}
      </AnalyticsState>
    </div>
  );
}
