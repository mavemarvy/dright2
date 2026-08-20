// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT Product Performance Table — Comprehensive BI dashboard
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { LineChart, BarChart } from './Charts';
import { AnalyticsLoading, AnalyticsNoData } from './AnalyticsState';
import { TrendingUp, TrendingDown, Star, Eye, DollarSign, ShoppingCart, AlertCircle, Download } from 'lucide-react';
import { formatCurrency } from '../../lib/currency';

interface ProductRow {
  id: string;
  name: string;
  approval_status: string;
  category: string;
  subcategory: string | null;
  created_at: string;
  updated_at: string;
  uploaded_by: string;
  price: number;
  image_url: string | null;
  views: number;
  unique_visitors: number;
  purchases: number;
  revenue: number;
  conversion: number;
  average_rating: number;
  review_count: number;
  wishlist_saves: number;
  shares: number;
  chat_requests: number;
  trending_score: number;
  virality_score: number;
  recommendation_score: number;
  seo_score: number;
  marketplace_ranking: number | null;
}

export function ProductPerformanceTable({ sellerId }: { sellerId?: string }) {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<keyof ProductRow>('views');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const pageSize = 10;

  useEffect(() => {
    loadProducts();
  }, [sellerId]);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const uid = sellerId || user?.id;
      if (!uid) return;
      const { data, error } = await supabase.rpc('get_seller_products_performance', { p_seller_id: uid, p_days: 30 });
      if (error) throw error;
      setProducts(data || []);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    let result = products;
    if (search) result = result.filter((p) => p.name?.toLowerCase().includes(search.toLowerCase()));
    result = [...result].sort((a, b) => {
      const av = a[sortBy] as number | string;
      const bv = b[sortBy] as number | string;
      if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'desc' ? bv - av : av - bv;
      return sortDir === 'desc' ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv));
    });
    return result;
  }, [products, search, sortBy, sortDir]);

  const paginated = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(filtered.length / pageSize);

  const handleSort = (col: keyof ProductRow) => {
    if (sortBy === col) setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    else { setSortBy(col); setSortDir('desc'); }
  };


  if (loading) return <AnalyticsLoading message="Loading product performance..." />;

  return (
    <div className="space-y-4">
      {/* Search + Export */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <input
          type="text"
          placeholder="Search products..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
        <AnalyticsExport data={filtered as unknown as Record<string, unknown>[]} filename="product-performance" />
      </div>

      {!filtered.length ? <AnalyticsNoData message="No products found" /> : (
        <>
          {/* Table */}
          <div className="overflow-x-auto bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left p-3 font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:text-indigo-500" onClick={() => handleSort('name')}>Product</th>
                  <th className="text-left p-3 font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:text-indigo-500" onClick={() => handleSort('approval_status')}>Status</th>
                  <th className="text-right p-3 font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:text-indigo-500" onClick={() => handleSort('views')}>Views</th>
                  <th className="text-right p-3 font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:text-indigo-500" onClick={() => handleSort('unique_visitors')}>Visitors</th>
                  <th className="text-right p-3 font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:text-indigo-500" onClick={() => handleSort('purchases')}>Sales</th>
                  <th className="text-right p-3 font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:text-indigo-500" onClick={() => handleSort('revenue')}>Revenue</th>
                  <th className="text-right p-3 font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:text-indigo-500" onClick={() => handleSort('conversion')}>Conv.</th>
                  <th className="text-right p-3 font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:text-indigo-500" onClick={() => handleSort('average_rating')}>Rating</th>
                  <th className="text-right p-3 font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:text-indigo-500" onClick={() => handleSort('trending_score')}>Trend</th>
                  <th className="text-right p-3 font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:text-indigo-500" onClick={() => handleSort('marketplace_ranking')}>Rank</th>
                  <th className="text-center p-3 font-medium text-gray-600 dark:text-gray-400">Analysis</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((p) => (
                  <tr key={p.id} className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {p.image_url && <img src={p.image_url} alt={p.name} className="w-8 h-8 rounded-lg object-cover" />}
                        <span className="font-medium text-gray-900 dark:text-white truncate max-w-[200px]">{p.name}</span>
                      </div>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        p.approval_status === 'approved' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                        p.approval_status === 'pending' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                        'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      }`}>{p.approval_status}</span>
                    </td>
                    <td className="text-right p-3 text-gray-700 dark:text-gray-300">{p.views?.toLocaleString() || 0}</td>
                    <td className="text-right p-3 text-gray-700 dark:text-gray-300">{p.unique_visitors?.toLocaleString() || 0}</td>
                    <td className="text-right p-3 text-gray-700 dark:text-gray-300">{p.purchases?.toLocaleString() || 0}</td>
                    <td className="text-right p-3 font-medium text-green-600">{formatCurrency(p.revenue || 0)}</td>
                    <td className="text-right p-3 text-gray-700 dark:text-gray-300">{(p.conversion || 0).toFixed(1)}%</td>
                    <td className="text-right p-3">
                      <span className="inline-flex items-center gap-1 text-gray-700 dark:text-gray-300">
                        <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                        {(p.average_rating || 0).toFixed(1)}
                        <span className="text-gray-400 text-xs">({p.review_count || 0})</span>
                      </span>
                    </td>
                    <td className="text-right p-3">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                        (p.trending_score || 0) > 50 ? 'text-green-500' : 'text-gray-400'
                      }`}>
                        {(p.trending_score || 0).toFixed(0)}
                        {(p.trending_score || 0) > 50 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      </span>
                    </td>
                    <td className="text-right p-3 text-gray-700 dark:text-gray-300">#{p.marketplace_ranking || '—'}</td>
                    <td className="text-center p-3">
                      <button
                        onClick={() => setSelectedProduct(p.id)}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 transition-colors"
                      >
                        View Analysis
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="px-3 py-1.5 rounded-lg text-sm bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 disabled:opacity-50 hover:bg-gray-200 dark:hover:bg-gray-700">Prev</button>
              <span className="text-sm text-gray-500 dark:text-gray-400">Page {page + 1} of {totalPages}</span>
              <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} className="px-3 py-1.5 rounded-lg text-sm bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 disabled:opacity-50 hover:bg-gray-200 dark:hover:bg-gray-700">Next</button>
            </div>
          )}
        </>
      )}

      {/* Analysis Modal */}
      {selectedProduct && (
        <ProductAnalysisModal productId={selectedProduct} onClose={() => setSelectedProduct(null)} />
      )}
    </div>
  );
}

// ─── Analytics Export Component ───────────────────────────────────────────────

export function AnalyticsExport({ data, filename }: { data: Record<string, unknown>[]; filename: string }) {
  const exportCSV = () => {
    if (!data.length) return;
    const headers = Object.keys(data[0]);
    const rows = data.map((row) => headers.map((h) => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    downloadFile(csv, `${filename}.csv`, 'text/csv');
  };

  const exportJSON = () => {
    downloadFile(JSON.stringify(data, null, 2), `${filename}.json`, 'application/json');
  };

  const exportExcel = () => {
    if (!data.length) return;
    const headers = Object.keys(data[0]);
    const rows = data.map((row) => headers.map((h) => String(row[h] ?? '')).join('\t'));
    const tsv = [headers.join('\t'), ...rows].join('\n');
    downloadFile(tsv, `${filename}.xls`, 'application/vnd.ms-excel');
  };

  return (
    <div className="flex items-center gap-2">
      <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-700">
        <Download className="w-3.5 h-3.5" /> CSV
      </button>
      <button onClick={exportExcel} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-700">
        <Download className="w-3.5 h-3.5" /> Excel
      </button>
      <button onClick={exportJSON} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-700">
        <Download className="w-3.5 h-3.5" /> JSON
      </button>
    </div>
  );
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Product Analysis Modal ───────────────────────────────────────────────────

function ProductAnalysisModal({ productId, onClose }: { productId: string; onClose: () => void }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<string>('overview');

  useEffect(() => {
    loadAnalysis();
  }, [productId]);

  const loadAnalysis = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_product_performance_detail', { p_product_id: productId, p_days: 30 });
      if (error) throw error;
      setData(data as Record<string, unknown>);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const tabs = ['overview', 'traffic', 'sales', 'audience', 'marketing', 'competitors', 'recommendations', 'forecast', 'history'];


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">{(data?.product_name as string) || 'Product Analysis'}</h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 py-2 border-b border-gray-200 dark:border-gray-800 overflow-x-auto">
          {tabs.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize whitespace-nowrap transition-colors ${
              tab === t ? 'bg-indigo-600 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}>{t}</button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? <AnalyticsLoading /> : !data ? <AnalyticsNoData /> : (
            <ProductAnalysisTab tab={tab} data={data} formatCurrency={formatCurrency} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Analysis Tab Content ─────────────────────────────────────────────────────

function ProductAnalysisTab({ tab, data, formatCurrency }: { tab: string; data: Record<string, unknown>; formatCurrency: (v: number) => string }) {
  const num = (k: string) => Number(data[k]) || 0;
  const str = (k: string) => String(data[k] || '—');
  const arr = (k: string) => (data[k] as Record<string, unknown>[]) || [];

  if (tab === 'overview') {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Views', value: num('views').toLocaleString(), icon: Eye, color: 'text-indigo-500' },
            { label: 'Revenue', value: formatCurrency(num('revenue')), icon: DollarSign, color: 'text-green-500' },
            { label: 'Purchases', value: num('purchases').toLocaleString(), icon: ShoppingCart, color: 'text-blue-500' },
            { label: 'Conversion', value: `${num('conversion').toFixed(1)}%`, icon: TrendingUp, color: 'text-purple-500' },
          ].map((s, i) => (
            <div key={i} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
              <s.icon className={`w-4 h-4 ${s.color} mb-1`} />
              <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{s.value}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            ['Category', str('category')], ['Subcategory', str('subcategory')], ['Status', str('status')],
            ['Published', new Date(str('published_date')).toLocaleDateString()], ['Last Updated', new Date(str('last_updated')).toLocaleDateString()],
            ['Avg Rating', `${num('average_rating').toFixed(1)} (${num('review_count')} reviews)`],
            ['Trending Score', num('trending_score').toFixed(0)], ['Virality Score', num('virality_score').toFixed(0)],
            ['Recommendation Score', num('recommendation_score').toFixed(0)], ['SEO Score', num('seo_score').toFixed(0)],
            ['Marketplace Ranking', data.marketplace_ranking ? `#${data.marketplace_ranking}` : '—'],
            ['Bounce Rate', `${num('bounce_rate').toFixed(1)}%`], ['Avg Session Time', `${num('average_session_time')}s`],
          ].map(([label, value], i) => (
            <div key={i} className="flex justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
              <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">{value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (tab === 'traffic') {
    const dailyViews = arr('daily_views').map((d) => ({ label: new Date(d.date as string).toLocaleDateString('en', { month: 'short', day: 'numeric' }), value: Number(d.count) }));
    const hourlyViews = arr('hourly_views').map((d) => ({ label: `${d.hour}:00`, value: Number(d.count) }));
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[['Views', num('views')], ['Unique Visitors', num('unique_visitors')], ['Returning Visitors', num('returning_visitors')], ['CTR', `${num('ctr').toFixed(1)}%`]].map(([l, v], i) => (
            <div key={i} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">{l}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{typeof v === 'number' ? v.toLocaleString() : v}</p>
            </div>
          ))}
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Daily Views</h4>
          {dailyViews.length ? <LineChart data={dailyViews} color="#6366f1" /> : <AnalyticsNoData />}
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Hourly Views (24h)</h4>
          {hourlyViews.length ? <BarChart data={hourlyViews} color="#8b5cf6" height={180} /> : <AnalyticsNoData />}
        </div>
      </div>
    );
  }

  if (tab === 'sales') {
    const revenueTimeline = arr('revenue_timeline').map((d) => ({ label: new Date(d.date as string).toLocaleDateString('en', { month: 'short', day: 'numeric' }), value: Number(d.revenue) }));
    const salesTimeline = arr('sales_timeline').map((d) => ({ label: new Date(d.date as string).toLocaleDateString('en', { month: 'short', day: 'numeric' }), value: Number(d.count) }));
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[['Revenue', formatCurrency(num('revenue'))], ['Net Revenue', formatCurrency(num('net_revenue'))], ['Purchases', num('purchases')], ['Refunds', num('refunds')]].map(([l, v], i) => (
            <div key={i} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">{l}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{typeof v === 'number' ? v.toLocaleString() : v}</p>
            </div>
          ))}
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Revenue Timeline</h4>
          {revenueTimeline.length ? <BarChart data={revenueTimeline} color="#10b981" formatValue={formatCurrency} /> : <AnalyticsNoData />}
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Sales Timeline</h4>
          {salesTimeline.length ? <LineChart data={salesTimeline} color="#3b82f6" /> : <AnalyticsNoData />}
        </div>
      </div>
    );
  }

  if (tab === 'audience') {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[['Top Country', str('top_buyer_country')], ['Top City', str('top_buyer_city')], ['Top Device', str('top_device')], ['Top Browser', str('top_browser')], ['Top Source', str('top_referral_source')], ['Repeat Buyers', num('repeat_buyers')]].map(([l, v], i) => (
            <div key={i} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">{l}</p>
              <p className="text-sm font-bold text-gray-900 dark:text-white capitalize">{typeof v === 'number' ? v.toLocaleString() : v}</p>
            </div>
          ))}
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Recent Visitors</h4>
          {arr('recent_visitors').length ? (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {arr('recent_visitors').map((v, i) => (
                <div key={i} className="flex items-center justify-between text-sm p-2 rounded-lg bg-white dark:bg-gray-900">
                  <span className="text-gray-600 dark:text-gray-400">{(v.country as string) || 'Unknown'}</span>
                  <span className="text-gray-400 text-xs">{(v.device as string) || '—'} · {new Date(v.created_at as string).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          ) : <AnalyticsNoData />}
        </div>
      </div>
    );
  }

  if (tab === 'marketing') {
    const affiliateTimeline = arr('affiliate_timeline').map((d) => ({ label: new Date(d.date as string).toLocaleDateString('en', { month: 'short', day: 'numeric' }), value: Number(d.clicks) }));
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[['Affiliate Clicks', num('affiliate_clicks')], ['Affiliate Sales', num('affiliate_sales')], ['Affiliate Conv.', `${num('affiliate_conversion').toFixed(1)}%`], ['Commission Paid', formatCurrency(num('commission_paid'))]].map(([l, v], i) => (
            <div key={i} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">{l}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{typeof v === 'number' ? v.toLocaleString() : v}</p>
            </div>
          ))}
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Top Keywords</h4>
          {arr('top_keywords').length ? (
            <div className="flex flex-wrap gap-2">
              {arr('top_keywords').map((k, i) => (
                <span key={i} className="px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-sm text-indigo-700 dark:text-indigo-400">{String(k.keyword)} ({String(k.count)})</span>
              ))}
            </div>
          ) : <AnalyticsNoData />}
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Affiliate Timeline</h4>
          {affiliateTimeline.length ? <BarChart data={affiliateTimeline} color="#f59e0b" /> : <AnalyticsNoData />}
        </div>
      </div>
    );
  }

  if (tab === 'competitors' || tab === 'benchmarking') {
    const bench = data.benchmark as Record<string, number> | undefined;
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            ['Yesterday Views', bench?.prev_day_views || 0, bench?.today_views || 0],
            ['Last Week Views', bench?.prev_week_views || 0, bench?.this_week_views || 0],
            ['Last Month Views', bench?.prev_month_views || 0, bench?.this_month_views || 0],
          ].map(([label, prev, curr], i) => {
            const p = prev as number; const c = curr as number;
            const change = p > 0 ? ((c - p) / p * 100).toFixed(1) : '0';
            const isUp = c >= p;
            return (
              <div key={i} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">{label as string}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-lg font-bold text-gray-900 dark:text-white">{c.toLocaleString()}</span>
                  <span className={`text-xs ${isUp ? 'text-green-500' : 'text-red-500'}`}>{isUp ? '+' : ''}{change}%</span>
                </div>
                <p className="text-xs text-gray-400">was {p.toLocaleString()}</p>
              </div>
            );
          })}
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Category Average</h4>
          <p className="text-sm text-gray-600 dark:text-gray-400">Your product has {(num('views')).toLocaleString()} views vs category average of {(bench?.category_avg_views || 0).toLocaleString()}.</p>
        </div>
      </div>
    );
  }

  if (tab === 'recommendations') {
    return <AIRecommendations data={data} />;
  }

  if (tab === 'forecast') {
    return <AIForecast data={data} />;
  }

  if (tab === 'history') {
    const conv = arr('conversion_timeline').map((d) => ({ label: new Date(d.date as string).toLocaleDateString('en', { month: 'short', day: 'numeric' }), value: Number(d.rate) }));
    return (
      <div className="space-y-4">
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Conversion Timeline</h4>
          {conv.length ? <LineChart data={conv} color="#10b981" /> : <AnalyticsNoData />}
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Weekly Views</h4>
          {arr('weekly_views').length ? <BarChart data={arr('weekly_views').map((d) => ({ label: new Date(d.week as string).toLocaleDateString('en', { month: 'short', day: 'numeric' }), value: Number(d.count) }))} color="#8b5cf6" /> : <AnalyticsNoData />}
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Monthly Views</h4>
          {arr('monthly_views').length ? <LineChart data={arr('monthly_views').map((d) => ({ label: new Date(d.month as string).toLocaleDateString('en', { month: 'short', year: '2-digit' }), value: Number(d.count) }))} color="#6366f1" /> : <AnalyticsNoData />}
        </div>
      </div>
    );
  }

  return <AnalyticsNoData />;
}

// ─── AI Recommendations ───────────────────────────────────────────────────────

function AIRecommendations({ data }: { data: Record<string, unknown> }) {
  const num = (k: string) => Number(data[k]) || 0;
  const str = (k: string) => String(data[k] || '');
  const recommendations: { title: string; reason: string; priority: 'high' | 'medium' | 'low' }[] = [];

  if (num('ctr') < 2) recommendations.push({ title: 'Improve thumbnail image', reason: `CTR is ${num('ctr').toFixed(1)}% — below 2% suggests your thumbnail isn't attracting clicks. A higher-contrast, clearer thumbnail could increase click-through.`, priority: 'high' });
  if (num('bounce_rate') > 60) recommendations.push({ title: 'Improve product description', reason: `Bounce rate is ${num('bounce_rate').toFixed(1)}% — visitors leave without engaging. Add more detail, better formatting, and clearer value proposition.`, priority: 'high' });
  if (num('conversion') < 1 && num('views') > 50) recommendations.push({ title: 'Lower price or offer discount', reason: `${num('views')} views but only ${num('conversion').toFixed(1)}% conversion. Price may be above market expectation. Consider a limited-time discount.`, priority: 'high' });
  if (num('affiliate_clicks') < 10 && num('views') > 100) recommendations.push({ title: 'Use affiliate marketing', reason: `Only ${num('affiliate_clicks')} affiliate clicks with ${num('views')} views. Increase affiliate commission to attract more promoters.`, priority: 'medium' });
  if (num('shares') < 5) recommendations.push({ title: 'Add social sharing incentives', reason: `${num('shares')} shares is low. Add a share button or offer a small discount for sharing.`, priority: 'medium' });
  if (num('seo_score') < 50) recommendations.push({ title: 'Improve SEO keywords', reason: `SEO score is ${num('seo_score').toFixed(0)}/100. Add meta title, description, and relevant tags.`, priority: 'medium' });
  if (num('average_session_time') < 30) recommendations.push({ title: 'Add more screenshots', reason: `Average viewing time is ${num('average_session_time')}s — visitors don't stay long. More images and a video demo could increase engagement.`, priority: 'medium' });
  if (num('repeat_buyers') === 0 && num('purchases') > 0) recommendations.push({ title: 'Target returning buyers', reason: `No repeat buyers yet. Send a follow-up message or offer a loyalty discount to previous customers.`, priority: 'low' });
  if (num('cart_adds') > num('purchases') * 2) recommendations.push({ title: 'Reduce checkout friction', reason: `${num('cart_adds')} cart adds but only ${num('purchases')} purchases. Simplify checkout or offer free shipping.`, priority: 'high' });
  if (str('top_referral_source') && str('top_referral_source') !== 'direct') recommendations.push({ title: `Promote in high-converting countries`, reason: `Top source is ${str('top_referral_source')}. Double down on this channel with targeted campaigns.`, priority: 'low' });

  if (!recommendations.length) recommendations.push({ title: 'Great performance!', reason: 'Your product metrics look healthy. Keep monitoring and maintain current strategy.', priority: 'low' });

  const priorityColors = { high: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400', medium: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400', low: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' };

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-indigo-500" /> AI Smart Recommendations
      </h4>
      {recommendations.map((r, i) => (
        <div key={i} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
          <div className="flex items-start justify-between gap-3">
            <h5 className="font-medium text-gray-900 dark:text-white">{r.title}</h5>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${priorityColors[r.priority]} capitalize`}>{r.priority}</span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{r.reason}</p>
        </div>
      ))}
    </div>
  );
}

// ─── AI Forecast ──────────────────────────────────────────────────────────────

function AIForecast({ data }: { data: Record<string, unknown> }) {
  const num = (k: string) => Number(data[k]) || 0;
  const bench = data.benchmark as Record<string, number> | undefined;
  const todayViews = bench?.today_views || 0;
  const weekViews = bench?.this_week_views || 0;
  const dailyAvg = weekViews > 0 ? weekViews / 7 : todayViews;
  const projectedMonth = dailyAvg * 30;
  const projectedRevenue = num('revenue') > 0 && num('views') > 0 ? (num('revenue') / num('views')) * projectedMonth : 0;
  const trend = bench && bench.prev_week_views > 0 ? ((weekViews - bench.prev_week_views) / bench.prev_week_views * 100) : 0;

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-indigo-500" /> AI Forecast & Predictions
      </h4>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">Projected Monthly Views</p>
          <p className="text-2xl font-bold text-indigo-500">{projectedMonth.toLocaleString()}</p>
          <p className="text-xs text-gray-400">based on {dailyAvg.toFixed(0)}/day avg</p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">Projected Monthly Revenue</p>
          <p className="text-2xl font-bold text-green-500">${projectedRevenue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
          <p className="text-xs text-gray-400">at current conversion rate</p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">Weekly Trend</p>
          <p className={`text-2xl font-bold ${trend >= 0 ? 'text-green-500' : 'text-red-500'}`}>{trend >= 0 ? '+' : ''}{trend.toFixed(1)}%</p>
          <p className="text-xs text-gray-400">vs last week</p>
        </div>
      </div>
      <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-4">
        <h5 className="text-sm font-medium text-indigo-700 dark:text-indigo-400 mb-2">AI Analysis</h5>
        <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          {trend > 20 && <p>Views are trending strongly upward (+{trend.toFixed(0)}% week-over-week). This suggests growing interest — consider increasing inventory or running a promotion to capitalize on the momentum.</p>}
          {trend < -20 && <p>Views are declining ({trend.toFixed(0)}% week-over-week). This may indicate market saturation or seasonal decline. Consider refreshing your thumbnail, updating keywords, or running a targeted ad campaign.</p>}
          {trend >= -20 && trend <= 20 && <p>Views are stable. Performance is consistent — maintain current strategy and look for opportunities to differentiate from competitors.</p>}
          {num('conversion') < 1 && num('views') > 100 && <p>Conversion rate is below 1% despite decent traffic. The issue is likely in the listing quality or pricing, not traffic generation. Focus on improving product images and description.</p>}
          {num('conversion') >= 3 && <p>Conversion rate of {num('conversion').toFixed(1)}% is strong. This product is performing above marketplace average — consider scaling with affiliate partnerships or paid promotion.</p>}
          {num('repeat_buyers') > 0 && <p>You have {num('repeat_buyers')} repeat buyers, indicating customer satisfaction. Consider creating a bundle or loyalty offer to encourage more repeat purchases.</p>}
        </div>
      </div>
    </div>
  );
}
