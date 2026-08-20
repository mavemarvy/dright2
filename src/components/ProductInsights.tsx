import { useState, useEffect, useCallback } from 'react';
import {
  Eye, ShoppingBag, Heart, TrendingUp, DollarSign, Star,
  Loader2, BarChart3, Package, MousePointerClick, Sparkles, Link2,
  ChevronDown, CheckCircle2, Lightbulb, Target,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface ProductInsight {
  product_id: string;
  name: string;
  image_url: string | null;
  price: number;
  is_free: boolean;
  view_count: number;
  total_sales: number;
  average_rating: number;
  total_reviews: number;
  wishlist_count: number;
  revenue: number;
  conversion_rate: number;
  impressions: number;
  clicks: number;
  reach: number;
  affiliate_clicks: number;
}

interface ViewSourceBreakdown {
  view_source: string;
  view_count: number;
}

interface AggregatedStats {
  totalViews: number;
  totalSales: number;
  totalRevenue: number;
  totalWishlist: number;
  avgConversion: number;
  totalImpressions: number;
  totalClicks: number;
  totalReach: number;
  totalAffiliateClicks: number;
  topPerforming: ProductInsight | null;
  leastPerforming: ProductInsight | null;
}

const SOURCE_LABELS: Record<string, string> = {
  marketplace: 'Marketplace',
  affiliate: 'Affiliate Link',
  profile: 'Profile / Store',
  store: 'Store Page',
  recommendation: 'Recommendation',
  search: 'Search',
  direct: 'Direct',
};

const SOURCE_COLORS: Record<string, string> = {
  marketplace: 'bg-blue-500',
  affiliate: 'bg-orange-500',
  profile: 'bg-purple-500',
  store: 'bg-indigo-500',
  recommendation: 'bg-green-500',
  search: 'bg-cyan-500',
  direct: 'bg-gray-500',
};

function generateProductAnalysis(p: ProductInsight, rank: number, total: number): string[] {
  const insights: string[] = [];

  if (p.conversion_rate > 5) {
    insights.push(`Excellent conversion rate of ${p.conversion_rate.toFixed(1)}% — this product is performing well above the marketplace average of 1-2%.`);
  } else if (p.conversion_rate > 2) {
    insights.push(`Good conversion rate of ${p.conversion_rate.toFixed(1)}% — above average. Consider running a promotion to push it even higher.`);
  } else if (p.conversion_rate > 0 && p.view_count > 10) {
    insights.push(`Conversion rate of ${p.conversion_rate.toFixed(1)}% is below average. Review your listing quality — images, description, and pricing may need improvement.`);
  } else if (p.view_count > 0 && p.total_sales === 0) {
    insights.push(`This product has ${p.view_count} views but no sales yet. Consider adjusting the price, improving the description, or adding more images.`);
  }

  if (p.view_count > 50 && p.total_sales < 2) {
    insights.push(`High view count (${p.view_count}) but low sales (${p.total_sales}). Buyers are interested but not converting — check if your price is competitive.`);
  }

  if (p.average_rating >= 4.5 && p.total_reviews >= 3) {
    insights.push(`Strong rating of ${p.average_rating.toFixed(1)} stars from ${p.total_reviews} reviews. Use this social proof in your promotional materials.`);
  } else if (p.average_rating > 0 && p.average_rating < 3.5) {
    insights.push(`Low rating of ${p.average_rating.toFixed(1)} stars may be hurting sales. Address buyer feedback and improve product quality.`);
  }

  if (p.wishlist_count > 5 && p.total_sales < p.wishlist_count) {
    insights.push(`${p.wishlist_count} people have wishlisted this product but haven't purchased. Consider a limited-time discount to convert them.`);
  }

  if (p.affiliate_clicks > 0) {
    insights.push(`Affiliate links are driving ${p.affiliate_clicks} clicks — your referral network is working. Keep promoting through affiliate channels.`);
  }

  if (p.impressions > 0) {
    const ctr = ((p.clicks / p.impressions) * 100).toFixed(1);
    insights.push(`Ad performance: ${p.impressions} impressions, ${p.clicks} clicks (${ctr}% CTR). ${Number(ctr) > 2 ? 'Above average CTR.' : 'Consider improving your ad creative.'}`);
  }

  if (rank === 1) {
    insights.push(`This is your top-performing product. Double down on what's working — consider creating similar products or expanding this category.`);
  }
  if (rank === total && total > 1) {
    insights.push(`This is your lowest-performing product. If improvements don't help after 30 days, consider unpublishing it to keep your store focused on what sells.`);
  }

  if (insights.length === 0) {
    insights.push(`Not enough data yet to generate insights. Keep promoting this product and check back in a few days.`);
  }

  return insights;
}

function generateOverallAnalysis(stats: AggregatedStats, productCount: number): string[] {
  const insights: string[] = [];

  if (stats.totalViews > 100 && stats.avgConversion < 1) {
    insights.push(`Your overall conversion rate is ${stats.avgConversion.toFixed(1)}% — below the marketplace average of 1-2%. Focus on improving listing quality across all products.`);
  } else if (stats.avgConversion > 3) {
    insights.push(`Your conversion rate of ${stats.avgConversion.toFixed(1)}% is excellent. You're converting well above average.`);
  }

  if (stats.totalWishlist > 10 && stats.totalSales < stats.totalWishlist) {
    insights.push(`${stats.totalWishlist} total wishlist adds vs ${stats.totalSales} sales. Run a promotion targeting wishlisted items to convert interest into purchases.`);
  }

  if (stats.totalAffiliateClicks > 20) {
    insights.push(`Affiliate links are generating ${stats.totalAffiliateClicks} clicks. Your referral network is active — keep engaging your affiliates.`);
  }

  if (stats.totalRevenue > 0) {
    insights.push(`Total revenue of $${stats.totalRevenue.toFixed(2)} across ${productCount} products. ${stats.totalRevenue / productCount > 50 ? 'Strong per-product average.' : 'Consider pricing optimization.'}`);
  }

  if (stats.topPerforming && stats.leastPerforming && stats.topPerforming.view_count > stats.leastPerforming.view_count * 3) {
    insights.push(`Your top product gets ${Math.round((stats.topPerforming.view_count / Math.max(stats.leastPerforming.view_count, 1)) * 100) / 100}x more views than your lowest. Consider applying the top product's strategies to underperformers.`);
  }

  if (insights.length === 0) {
    insights.push(`You have ${productCount} products listed. Keep promoting and gathering data — insights will appear as your products get more views.`);
  }

  return insights;
}

export default function ProductInsights() {
  const { user } = useAuth();
  const [insights, setInsights] = useState<ProductInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AggregatedStats | null>(null);
  const [viewSources, setViewSources] = useState<Record<string, ViewSourceBreakdown[]>>({});
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');
  const timeRangeDays = timeRange === '7d' ? 7 : timeRange === '90d' ? 90 : 30;

  const fetchInsights = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase.rpc('get_seller_product_performance_v2', {
        p_seller_id: user.id,
        p_days: timeRangeDays,
      });
      if (error) throw error;

      const enriched: ProductInsight[] = ((data || []) as Array<Record<string, unknown>>).map((p: Record<string, unknown>) => ({
        product_id: p.product_id as string,
        name: p.name as string,
        image_url: p.image_url as string | null,
        price: Number(p.price),
        is_free: p.is_free as boolean,
        view_count: Number(p.view_count) || 0,
        total_sales: Number(p.total_sales) || 0,
        average_rating: Number(p.average_rating) || 0,
        total_reviews: Number(p.total_reviews) || 0,
        wishlist_count: Number(p.wishlist_count) || 0,
        revenue: Number(p.revenue) || 0,
        conversion_rate: Number(p.conversion_rate) || 0,
        impressions: Number(p.impressions) || 0,
        clicks: Number(p.clicks) || 0,
        reach: Number(p.reach) || 0,
        affiliate_clicks: Number(p.affiliate_clicks) || 0,
      }));

      setInsights(enriched);

      const totalViews = enriched.reduce((s, p) => s + p.view_count, 0);
      const totalSales = enriched.reduce((s, p) => s + p.total_sales, 0);
      const totalRevenue = enriched.reduce((s, p) => s + p.revenue, 0);
      const totalWishlist = enriched.reduce((s, p) => s + p.wishlist_count, 0);
      const avgConversion = enriched.length > 0
        ? enriched.reduce((s, p) => s + p.conversion_rate, 0) / enriched.length
        : 0;
      const totalImpressions = enriched.reduce((s, p) => s + p.impressions, 0);
      const totalClicks = enriched.reduce((s, p) => s + p.clicks, 0);
      const totalReach = enriched.reduce((s, p) => s + p.reach, 0);
      const totalAffiliateClicks = enriched.reduce((s, p) => s + p.affiliate_clicks, 0);

      setStats({
        totalViews, totalSales, totalRevenue, totalWishlist, avgConversion,
        totalImpressions, totalClicks, totalReach, totalAffiliateClicks,
        topPerforming: enriched[0] || null,
        leastPerforming: enriched[enriched.length - 1] || null,
      });
    } catch (err) {
      console.error('ProductInsights fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [user, timeRangeDays]);

  const fetchViewSources = useCallback(async (productId: string) => {
    try {
      const { data, error } = await supabase.rpc('get_product_view_sources_v2', {
        p_product_id: productId,
      });
      if (error) throw error;
      setViewSources(prev => ({ ...prev, [productId]: (data || []) as ViewSourceBreakdown[] }));
    } catch {
      // silent fail
    }
  }, []);

  useEffect(() => { fetchInsights(); }, [fetchInsights, timeRangeDays]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
      </div>
    );
  }

  if (insights.length === 0) {
    return (
      <div className="text-center py-12">
        <BarChart3 className="w-12 h-12 text-gray-200 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">No products to analyze yet</p>
        <p className="text-sm text-gray-400 mt-1">Upload products to see performance insights</p>
      </div>
    );
  }

  const statCards = [
    { label: 'Total Views', value: stats?.totalViews.toLocaleString() || '0', icon: Eye, color: 'bg-blue-500' },
    { label: 'Total Sales', value: stats?.totalSales.toLocaleString() || '0', icon: ShoppingBag, color: 'bg-green-500' },
    { label: 'Revenue', value: `$${(stats?.totalRevenue || 0).toFixed(2)}`, icon: DollarSign, color: 'bg-amber-500' },
    { label: 'Wishlist Adds', value: stats?.totalWishlist.toLocaleString() || '0', icon: Heart, color: 'bg-pink-500' },
    { label: 'Avg Conversion', value: `${(stats?.avgConversion || 0).toFixed(1)}%`, icon: TrendingUp, color: 'bg-purple-500' },
    { label: 'Impressions', value: stats?.totalImpressions.toLocaleString() || '0', icon: Sparkles, color: 'bg-cyan-500' },
    { label: 'Clicks', value: stats?.totalClicks.toLocaleString() || '0', icon: MousePointerClick, color: 'bg-indigo-500' },
    { label: 'Reach', value: stats?.totalReach.toLocaleString() || '0', icon: TrendingUp, color: 'bg-teal-500' },
    { label: 'Affiliate Clicks', value: stats?.totalAffiliateClicks.toLocaleString() || '0', icon: Link2, color: 'bg-orange-500' },
    { label: 'Products', value: insights.length.toString(), icon: Package, color: 'bg-gray-500' },
  ];

  const overallAnalysis = stats ? generateOverallAnalysis(stats, insights.length) : [];

  return (
    <div className="space-y-6">
      {/* Time range selector */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['7d', '30d', '90d'] as const).map(range => (
          <button
            key={range}
            onClick={() => setTimeRange(range)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors min-h-[40px] ${
              timeRange === range ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {range === '7d' ? 'Last 7 days' : range === '30d' ? 'Last 30 days' : 'Last 90 days'}
          </button>
        ))}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {statCards.map(card => (
          <div key={card.label} className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className={`w-8 h-8 rounded-xl ${card.color} flex items-center justify-center mb-2`}>
              <card.icon className="w-4 h-4 text-white" />
            </div>
            <p className="text-xl font-bold text-gray-900">{card.value}</p>
            <p className="text-xs text-gray-400">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Overall Analysis Panel */}
      <div className="bg-gradient-to-br from-primary-50 to-blue-50 rounded-2xl border border-primary-100 p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-xl bg-primary-600 flex items-center justify-center">
            <Lightbulb className="w-4 h-4 text-white" />
          </div>
          <h3 className="font-bold text-gray-900">Performance Analysis</h3>
        </div>
        <div className="space-y-2">
          {overallAnalysis.map((insight, i) => (
            <div key={i} className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary-500 shrink-0 mt-0.5" />
              <p className="text-sm text-gray-700">{insight}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Top & Least performing */}
      {stats?.topPerforming && stats?.leastPerforming && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-success-muted flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-success" />
              </div>
              <h3 className="font-bold text-gray-900 text-sm">Top Performing</h3>
            </div>
            <div className="flex items-center gap-3">
              {stats.topPerforming.image_url ? (
                <img src={stats.topPerforming.image_url} alt="" className="w-12 h-12 rounded-xl object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
                  <Package className="w-5 h-5 text-gray-300" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{stats.topPerforming.name}</p>
                <p className="text-xs text-gray-400">{stats.topPerforming.view_count} views · {stats.topPerforming.total_sales} sales · ${stats.topPerforming.revenue.toFixed(2)} revenue</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-error-muted flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-error rotate-180" />
              </div>
              <h3 className="font-bold text-gray-900 text-sm">Needs Attention</h3>
            </div>
            <div className="flex items-center gap-3">
              {stats.leastPerforming.image_url ? (
                <img src={stats.leastPerforming.image_url} alt="" className="w-12 h-12 rounded-xl object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
                  <Package className="w-5 h-5 text-gray-300" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{stats.leastPerforming.name}</p>
                <p className="text-xs text-gray-400">{stats.leastPerforming.view_count} views · {stats.leastPerforming.total_sales} sales</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Per-product breakdown */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">Product Performance Breakdown</h3>
          <p className="text-xs text-gray-400 mt-1">Click "View Analysis" on any product to see detailed insights and recommendations</p>
        </div>
        <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-3 text-left font-medium text-gray-500 whitespace-nowrap">Product</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500 whitespace-nowrap">Views</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500 whitespace-nowrap">Sales</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500 whitespace-nowrap">Revenue</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500 whitespace-nowrap">Wishlist</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500 whitespace-nowrap">Rating</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500 whitespace-nowrap">Conversion</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500 whitespace-nowrap">Impr.</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500 whitespace-nowrap">Clicks</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500 whitespace-nowrap">Reach</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500 whitespace-nowrap">Aff. Clicks</th>
                <th className="px-4 py-3 text-center font-medium text-gray-500 whitespace-nowrap">Analysis</th>
              </tr>
            </thead>
            <tbody>
              {insights.map((p, idx) => {
                const isExpanded = selectedProduct === p.product_id;
                const sources = viewSources[p.product_id];
                const analysis = generateProductAnalysis(p, idx + 1, insights.length);

                return (
                  <ProductRow
                    key={p.product_id}
                    product={p}
                    isExpanded={isExpanded}
                    sources={sources}
                    analysis={analysis}
                    rowBg={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                    onToggle={() => {
                      if (isExpanded) {
                        setSelectedProduct(null);
                      } else {
                        setSelectedProduct(p.product_id);
                        if (!sources) fetchViewSources(p.product_id);
                      }
                    }}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ProductRow({
  product,
  isExpanded,
  sources,
  analysis,
  rowBg,
  onToggle,
}: {
  product: ProductInsight;
  isExpanded: boolean;
  sources?: ViewSourceBreakdown[];
  analysis: string[];
  rowBg: string;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className={rowBg}>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {product.image_url ? (
              <img src={product.image_url} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                <Package className="w-4 h-4 text-gray-300" />
              </div>
            )}
            <span className="font-medium text-gray-900 truncate max-w-[180px]">{product.name}</span>
          </div>
        </td>
        <td className="px-4 py-3 text-right text-gray-600">{product.view_count || 0}</td>
        <td className="px-4 py-3 text-right text-gray-600">{product.total_sales || 0}</td>
        <td className="px-4 py-3 text-right font-medium text-gray-900">{product.is_free ? '—' : `$${product.revenue.toFixed(2)}`}</td>
        <td className="px-4 py-3 text-right text-gray-600">{product.wishlist_count}</td>
        <td className="px-4 py-3 text-right">
          {product.average_rating > 0 ? (
            <span className="flex items-center justify-end gap-1">
              <Star className="w-3 h-3 fill-warning text-warning" />
              {product.average_rating.toFixed(1)}
            </span>
          ) : <span className="text-gray-300">—</span>}
        </td>
        <td className="px-4 py-3 text-right">
          <span className={`font-medium ${product.conversion_rate > 5 ? 'text-success' : product.conversion_rate > 1 ? 'text-warning' : 'text-gray-400'}`}>
            {product.conversion_rate.toFixed(1)}%
          </span>
        </td>
        <td className="px-4 py-3 text-right text-gray-600">{product.impressions || 0}</td>
        <td className="px-4 py-3 text-right text-gray-600">{product.clicks || 0}</td>
        <td className="px-4 py-3 text-right text-gray-600">{product.reach || 0}</td>
        <td className="px-4 py-3 text-right text-gray-600">{product.affiliate_clicks || 0}</td>
        <td className="px-4 py-3 text-center">
          <button
            onClick={onToggle}
            className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1 mx-auto"
          >
            {isExpanded ? (
              <>Hide <ChevronDown className="w-3 h-3 rotate-180" /></>
            ) : (
              <>View Analysis <ChevronDown className="w-3 h-3" /></>
            )}
          </button>
        </td>
      </tr>
      {isExpanded && (
        <tr className="bg-primary-50/30">
          <td colSpan={12} className="px-4 py-4">
            <div className="space-y-4">
              {/* Analysis insights */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Target className="w-4 h-4 text-primary-500" />
                  <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Product Analysis</span>
                </div>
                <div className="space-y-2">
                  {analysis.map((insight, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-sm text-gray-700">{insight}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* View source breakdown */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Eye className="w-4 h-4 text-blue-500" />
                  <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">View Sources</span>
                </div>
                {!sources ? (
                  <p className="text-xs text-gray-400">Loading source data...</p>
                ) : sources.length === 0 ? (
                  <p className="text-xs text-gray-400">No view source data yet. As this product gets more views, you'll see where traffic comes from.</p>
                ) : (
                  <div className="space-y-2">
                    {(() => {
                      const total = sources.reduce((s, v) => s + v.view_count, 0) || 1;
                      return sources.map(vs => {
                        const pct = (vs.view_count / total) * 100;
                        return (
                          <div key={vs.view_source} className="flex items-center gap-2">
                            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${SOURCE_COLORS[vs.view_source] || 'bg-gray-400'}`} />
                            <span className="text-xs text-gray-600 w-28 shrink-0">{SOURCE_LABELS[vs.view_source] || vs.view_source}</span>
                            <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden min-w-[60px]">
                              <div
                                className={`h-full rounded-full ${SOURCE_COLORS[vs.view_source] || 'bg-gray-400'}`}
                                style={{ width: `${Math.max(2, pct)}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-500 w-20 text-right shrink-0">{vs.view_count} ({pct.toFixed(0)}%)</span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>

              {/* Quick stats summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-gray-100">
                <div className="text-center">
                  <p className="text-lg font-bold text-gray-900">{product.view_count}</p>
                  <p className="text-xs text-gray-400">Views</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-gray-900">{product.total_sales}</p>
                  <p className="text-xs text-gray-400">Sales</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-gray-900">{product.conversion_rate.toFixed(1)}%</p>
                  <p className="text-xs text-gray-400">Conversion</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-gray-900">{product.is_free ? '—' : `$${product.revenue.toFixed(2)}`}</p>
                  <p className="text-xs text-gray-400">Revenue</p>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
