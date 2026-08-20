import {
  Package, Eye, Heart, TrendingUp, Star, Loader2, BarChart3,
} from 'lucide-react';
import {
  useMarketplaceAnalytics, useCategoryAnalytics,
} from '../../lib/adminIntelligenceHooks';
import { formatCurrency } from '../../lib/currency';

export default function AdminMarketplaceAnalyticsPage() {
  const { analytics, loading } = useMarketplaceAnalytics();
  const { categories, loading: catLoading } = useCategoryAnalytics();

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-primary-500 animate-spin" /></div>;
  }


  const cards = [
    { label: 'Total Listings', value: analytics?.total_listings || 0, icon: Package, color: 'text-blue-500', bg: 'bg-blue-50' },
    { label: 'Active Listings', value: analytics?.active_listings || 0, icon: Package, color: 'text-green-500', bg: 'bg-green-50' },
    { label: 'Hidden', value: analytics?.hidden_listings || 0, icon: Eye, color: 'text-gray-500', bg: 'bg-gray-100' },
    { label: 'Pending Review', value: analytics?.pending_listings || 0, icon: BarChart3, color: 'text-amber-500', bg: 'bg-amber-50' },
    { label: 'Total Sales', value: analytics?.total_sales || 0, icon: TrendingUp, color: 'text-purple-500', bg: 'bg-purple-50' },
    { label: 'Revenue', value: formatCurrency(analytics?.total_revenue || 0), icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Total Views', value: analytics?.total_views || 0, icon: Eye, color: 'text-cyan-500', bg: 'bg-cyan-50' },
    { label: 'Wishlist Items', value: analytics?.total_wishlist || 0, icon: Heart, color: 'text-pink-500', bg: 'bg-pink-50' },
    { label: 'Conversion Rate', value: `${(analytics?.conversion_rate || 0).toFixed(2)}%`, icon: Star, color: 'text-yellow-500', bg: 'bg-yellow-50' },
  ];

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
          <BarChart3 className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Marketplace Analytics</h1>
          <p className="text-sm text-gray-500">Listing performance and category insights</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
        {cards.map(c => (
          <div key={c.label} className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center mb-2`}>
              <c.icon className={`w-5 h-5 ${c.color}`} />
            </div>
            <p className="text-2xl font-bold text-gray-900">{c.value}</p>
            <p className="text-sm text-gray-500">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <h3 className="font-bold text-gray-900 mb-4">Category Performance</h3>
        {catLoading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 text-primary-500 animate-spin" /></div>
        ) : categories.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No category data yet</p>
        ) : (
          <div className="space-y-2">
            {categories.map(cat => (
              <div key={cat.category} className="flex items-center gap-4 p-3 rounded-xl hover:bg-gray-50 transition-colors">
                <div className="flex-1">
                  <p className="font-medium text-gray-900 text-sm">{cat.category}</p>
                  <p className="text-xs text-gray-400">{cat.listing_count} listings · {cat.total_sales} sales · {(cat.avg_rating || 0).toFixed(1)} rating</p>
                </div>
                <span className="text-sm font-bold text-gray-700">{formatCurrency(cat.revenue)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
