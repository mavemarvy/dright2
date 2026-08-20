import { useState, useMemo } from 'react';
import {
  Users, UserCheck, UserPlus, ShieldCheck, Store, Share2, ShoppingBag,
  DollarSign, TrendingUp, BarChart3, Package, Briefcase, Megaphone,
  Clock, ArrowDownCircle, LifeBuoy, FileCheck, Activity, Download,
  AlertTriangle,
} from 'lucide-react';
import { useAdminAnalyticsV2 } from '../../lib/analyticsHooksV2';
import { useAnalyticsKPIs, computeKPIStatus, exportToCSV, useExecutiveKPIs } from '../../lib/analyticsPlatformHooks';
import { TimePeriodSelector, LineChart, BarChart, DonutChart } from '../../components/analytics/Charts';
import { AnalyticsState } from '../../components/analytics/AnalyticsState';
import { formatCurrency } from '../../lib/currency';
import type { TimePeriod } from '../../components/analytics/Charts';

export default function AdminEnterpriseAnalyticsPage() {
  const [period, setPeriod] = useState<TimePeriod>('30d');
  const days = useMemo(() => {
    const map: Record<TimePeriod, number> = { today: 1, yesterday: 1, '7d': 7, '30d': 30, '90d': 90, '1y': 365, lifetime: 9999 };
    return map[period];
  }, [period]);

  const { data, loading, error } = useAdminAnalyticsV2(days);
  const { kpis } = useAnalyticsKPIs();
  const { data: execData } = useExecutiveKPIs(days);

  const a = (data || {}) as Record<string, any>;

  // Build KPI cards with status
  const marketplaceKPIs = kpis.filter(k => k.category === 'marketplace');
  const revenueKPIs = kpis.filter(k => k.category === 'revenue');
  const operationsKPIs = kpis.filter(k => k.category === 'operations');

  const getValueForKPI = (metricKey: string): number => {
    const keys: Record<string, string> = {
      total_users: 'total_users', active_users: 'active_users', new_registrations: 'new_users',
      verified_users: 'verified_users', total_sellers: 'total_sellers', total_affiliates: 'total_affiliates',
      revenue_today: 'revenue_today', revenue_weekly: 'revenue_week', revenue_monthly: 'revenue_month',
      pending_reviews: 'pending_reviews', pending_withdrawals: 'pending_withdrawals',
      open_tickets: 'open_tickets', pending_kyc: 'pending_verifications',
      total_products: 'total_products', conversion_rate: 'conversion_rate', avg_order_value: 'avg_order_value',
    };
    const dataKey = keys[metricKey] || metricKey;
    return Number(a[dataKey] || execData?.[dataKey] || 0);
  };

  const formatKPIValue = (value: number, unit: string) => {
    if (unit === 'currency') return formatCurrency(value);
    if (unit === 'percent') return `${value.toFixed(2)}%`;
    return value.toLocaleString();
  };

  const handleExport = () => {
    const rows = kpis.map(k => {
      const val = getValueForKPI(k.metric_key);
      const kpiWithValue = computeKPIStatus(k, val);
      return {
        metric: k.display_name,
        category: k.category,
        current_value: val,
        unit: k.unit,
        target: k.target_value || 0,
        status: kpiWithValue.status_level,
      };
    });
    exportToCSV('enterprise-kpis', ['metric', 'category', 'current_value', 'unit', 'target', 'status'], rows);
  };

  // Chart data
  const viewsData = (a.daily_views || []).slice(-14).map((d: Record<string, number | string>) => ({
    label: String(d.date || d.label || ''),
    value: Number(d.views || d.value || 0),
  }));

  const revenueData = (a.daily_revenue || []).slice(-14).map((d: Record<string, number | string>) => ({
    label: String(d.date || d.label || ''),
    value: Number(d.revenue || d.value || 0),
  }));

  const categoryData = (a.top_categories || []).slice(0, 6).map((c: Record<string, number | string>) => ({
    label: String(c.category || c.name || ''),
    value: Number(c.views || c.count || 0),
  }));

  const signupsData = (a.daily_signups || []).slice(-14).map((d: Record<string, number | string>) => ({
    label: String(d.date || d.label || ''),
    value: Number(d.signups || d.count || d.value || 0),
  }));

  const sections = [
    { title: 'Marketplace', kpis: marketplaceKPIs, color: 'text-indigo-500', bg: 'bg-indigo-50' },
    { title: 'Revenue', kpis: revenueKPIs, color: 'text-green-500', bg: 'bg-green-50' },
    { title: 'Operations', kpis: operationsKPIs, color: 'text-amber-500', bg: 'bg-amber-50' },
  ];

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Enterprise Analytics</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Real-time mission control dashboard</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <Download className="w-4 h-4" /> Export KPIs
          </button>
          <TimePeriodSelector value={period} onChange={setPeriod} />
        </div>
      </div>

      <AnalyticsState loading={loading} error={error} syncing={false} offline={false} hasData={Object.keys(a).length > 0}>
        <div className="space-y-8">
          {/* KPI Sections */}
          {sections.map(section => (
            <div key={section.title}>
              <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">{section.title}</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {section.kpis.map(kpi => {
                  const val = getValueForKPI(kpi.metric_key);
                  const kpiWithValue = computeKPIStatus(kpi, val);
                  const statusColors: Record<string, string> = {
                    healthy: 'border-green-200 dark:border-green-800',
                    warning: 'border-amber-200 dark:border-amber-800',
                    critical: 'border-red-200 dark:border-red-800',
                    unknown: 'border-gray-200 dark:border-gray-800',
                  };
                  const Icon = iconMap[kpi.icon || ''] || Activity;
                  return (
                    <div key={kpi.id} className={`bg-white dark:bg-gray-900 rounded-xl border-2 ${statusColors[kpiWithValue.status_level]} p-4 shadow-sm`}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{kpi.display_name}</p>
                          <p className="text-2xl font-bold text-gray-900 dark:text-white truncate">
                            {formatKPIValue(val, kpi.unit)}
                          </p>
                          {kpi.target_value !== null && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              Target: {formatKPIValue(kpi.target_value, kpi.unit)}
                            </p>
                          )}
                        </div>
                        <div className={`p-2 rounded-lg ${section.bg} ${section.color} shrink-0`}>
                          <Icon className="w-5 h-5" />
                        </div>
                      </div>
                      {kpiWithValue.status_level === 'critical' && (
                        <div className="flex items-center gap-1 mt-2 text-xs text-red-500">
                          <AlertTriangle className="w-3 h-3" /> Critical
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Daily Views (14 days)</h3>
              <LineChart data={viewsData} color="#6366f1" height={200} formatValue={(v) => v.toLocaleString()} />
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Daily Revenue (14 days)</h3>
              <BarChart data={revenueData} color="#10b981" height={200} formatValue={(v) => formatCurrency(v)} />
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">New Signups (14 days)</h3>
              <BarChart data={signupsData} color="#8b5cf6" height={200} formatValue={(v) => v.toLocaleString()} />
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Top Categories by Views</h3>
              {categoryData.length > 0 ? (
                <DonutChart data={categoryData} />
              ) : (
                <div className="flex items-center justify-center text-gray-400 text-sm h-[180px]">No category data</div>
              )}
            </div>
          </div>

          {/* Top Products / Sellers / Search Terms */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {[
              { title: 'Top Products', items: (a.top_products || []).slice(0, 5), key: 'name', valKey: 'views' },
              { title: 'Top Sellers', items: (a.top_sellers || []).slice(0, 5), key: 'name', valKey: 'revenue' },
              { title: 'Top Search Terms', items: (a.top_search_keywords || []).slice(0, 5), key: 'keyword', valKey: 'count' },
            ].map(section => (
              <div key={section.title} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-3">{section.title}</h3>
                <div className="space-y-2">
                  {(section.items as Array<Record<string, number | string>>).map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-sm py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <span className="text-gray-700 dark:text-gray-300 truncate flex-1 mr-2">
                        {String(item[section.key] || item.name || item.keyword || '—')}
                      </span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {typeof item[section.valKey] === 'number'
                          ? section.valKey === 'revenue' ? formatCurrency(item[section.valKey] as number) : (item[section.valKey] as number).toLocaleString()
                          : String(item[section.valKey] || '0')}
                      </span>
                    </div>
                  ))}
                  {(section.items as unknown[]).length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-4">No data yet</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </AnalyticsState>
    </div>
  );
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Users, UserCheck, UserPlus, ShieldCheck, Store, Share2, ShoppingBag,
  DollarSign, TrendingUp, BarChart3, Package, Briefcase, Megaphone,
  Clock, ArrowDownCircle, LifeBuoy, FileCheck, Activity, Target: TrendingUp,
};
