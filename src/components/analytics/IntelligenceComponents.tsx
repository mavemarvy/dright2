// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT Analytics Intelligence Components — Live Leaderboards, Heatmaps,
// Customer Journey, Benchmarking, Financial Dashboard, Fraud Detection
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { AnalyticsLoading, AnalyticsNoData } from './AnalyticsState';
import { FunnelChart } from './Charts';
import {
  TrendingUp, Eye, DollarSign, ShoppingCart, Award, Users, Globe,
  Smartphone, Clock, AlertCircle, Shield, Activity, Target,
  ArrowUp, ArrowDown, Flame, Calendar, MapPin,
} from 'lucide-react';
import { formatCurrency } from '../../lib/currency';


const num = (d: Record<string, unknown> | null, k: string) => (d ? Number(d[k]) || 0 : 0);
const str = (d: Record<string, unknown> | null, k: string) => (d ? String(d[k] || '—') : '—');
const arr = (d: Record<string, unknown> | null, k: string) => (d ? (d[k] as Record<string, unknown>[]) || [] : []);

// ─── Live Leaderboards ───────────────────────────────────────────────────────

export function LiveLeaderboards() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('30d');
  const [category, setCategory] = useState('products');

  const periods = [
    { label: 'Today', value: 'today' },
    { label: '7 Days', value: '7d' },
    { label: '30 Days', value: '30d' },
    { label: '90 Days', value: '90d' },
    { label: '1 Year', value: '1y' },
  ];
  const categories = ['products', 'sellers', 'affiliates', 'referrers', 'services', 'jobs', 'courses'];

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc('get_live_leaderboards', { p_category: category, p_period: period });
        if (error) throw error;
        setData(data as Record<string, unknown>);
      } catch { setData(null); }
      finally { setLoading(false); }
    };
    load();
  }, [category, period]);

  const items = arr(data, category);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Award className="w-5 h-5 text-amber-500" /> Live Leaderboards
        </h3>
        <div className="flex gap-1.5">
          {periods.map((p) => (
            <button key={p.value} onClick={() => setPeriod(p.value)} className={`px-2.5 py-1 rounded-lg text-xs font-medium ${period === p.value ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>{p.label}</button>
          ))}
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {categories.map((c) => (
          <button key={c} onClick={() => setCategory(c)} className={`px-3 py-1 rounded-lg text-xs font-medium capitalize ${category === c ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>{c}</button>
        ))}
      </div>

      {loading ? <AnalyticsLoading /> : !items.length ? <AnalyticsNoData message={`No ${category} data for this period`} /> : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          {items.slice(0, 10).map((item, i) => (
            <div key={i} className={`flex items-center gap-3 p-3 ${i < items.length - 1 ? 'border-b border-gray-100 dark:border-gray-800/50' : ''} hover:bg-gray-50 dark:hover:bg-gray-800/30`}>
              <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                i === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                i === 1 ? 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300' :
                i === 2 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                'bg-gray-50 text-gray-400 dark:bg-gray-800'
              }`}>{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{String(item.name || 'Unknown')}</p>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {Number(item.views || 0).toLocaleString()}</span>
                  {Number(item.sales || 0) > 0 && <span className="flex items-center gap-1"><ShoppingCart className="w-3 h-3" /> {Number(item.sales).toLocaleString()}</span>}
                  {Number(item.revenue || 0) > 0 && <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" /> {formatCurrency(Number(item.revenue))}</span>}
                  {Number(item.conversions || 0) > 0 && <span className="flex items-center gap-1"><Target className="w-3 h-3" /> {Number(item.conversions).toLocaleString()}</span>}
                  {Number(item.signups || 0) > 0 && <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {Number(item.signups).toLocaleString()}</span>}
                </div>
              </div>
              {i === 0 && <Flame className="w-4 h-4 text-orange-500 shrink-0" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Heatmap Dashboard ────────────────────────────────────────────────────────

export function HeatmapDashboard({ sellerId }: { sellerId?: string }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const uid = sellerId || user?.id;
        const { data, error } = await supabase.rpc('get_heatmap_data', { p_seller_id: uid, p_days: 30 });
        if (error) throw error;
        setData(data as Record<string, unknown>);
      } catch { setData(null); }
      finally { setLoading(false); }
    };
    load();
  }, [sellerId]);

  if (loading) return <AnalyticsLoading message="Loading heatmap data..." />;
  if (!data) return <AnalyticsNoData />;

  const hourly = arr(data, 'hourly_views');
  const daily = arr(data, 'daily_views');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const maxHourly = Math.max(...hourly.map((h) => Number(h.count) || 0), 1);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
        <Activity className="w-5 h-5 text-indigo-500" /> Traffic Heatmap
      </h3>

      {/* Best metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {[
          ['Best Hour', str(data, 'best_selling_hour') !== '—' ? `${str(data, 'best_selling_hour')}:00` : '—', Clock, 'text-indigo-500'],
          ['Best Day', str(data, 'best_selling_day') !== '—' ? days[Number(str(data, 'best_selling_day'))] : '—', Calendar, 'text-purple-500'],
          ['Best Country', str(data, 'best_country'), Globe, 'text-green-500'],
          ['Best City', str(data, 'best_city'), MapPin, 'text-blue-500'],
          ['Best Device', str(data, 'best_device'), Smartphone, 'text-orange-500'],
          ['Avg Session', `${num(data, 'avg_session')}s`, Clock, 'text-cyan-500'],
        ].map((item, i) => {
          const [l, v, icon, color] = item;
          const Icon = icon as React.ComponentType<{ className?: string }>;
          return (
            <div key={i} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
              <Icon className={`w-4 h-4 ${color as string} mb-1`} />
              <p className="text-xs text-gray-500 dark:text-gray-400">{l as string}</p>
              <p className="text-sm font-bold text-gray-900 dark:text-white capitalize">{v as string}</p>
            </div>
          );
        })}
      </div>

      {/* Hourly Heatmap */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Hourly Views</h4>
        <div className="grid grid-cols-12 gap-1">
          {Array.from({ length: 24 }, (_, h) => {
            const hourData = hourly.find((hd) => Number(hd.hour) === h);
            const count = hourData ? Number(hourData.count) : 0;
            const intensity = count / maxHourly;
            return (
              <div key={h} className="text-center">
                <div
                  className="h-12 rounded-md flex items-center justify-center text-xs"
                  style={{
                    backgroundColor: count > 0 ? `rgba(99, 102, 241, ${Math.max(0.15, intensity)})` : 'rgba(0,0,0,0.03)',
                    color: intensity > 0.5 ? 'white' : 'inherit',
                  }}
                  title={`${h}:00 - ${count} views`}
                >
                  {count > 0 ? count : ''}
                </div>
                <p className="text-[10px] text-gray-400 mt-1">{h}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Daily Distribution */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Daily Distribution</h4>
        <div className="space-y-2">
          {daily.map((d) => {
            const count = Number(d.count) || 0;
            const maxDay = Math.max(...daily.map((dd) => Number(dd.count) || 0), 1);
            return (
              <div key={Number(d.day)} className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-10">{days[Number(d.day)] || '?'}</span>
                <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-6 overflow-hidden">
                  <div className="bg-gradient-to-r from-purple-500 to-pink-500 h-full rounded-full" style={{ width: `${(count / maxDay) * 100}%` }} />
                </div>
                <span className="text-xs text-gray-500 w-12 text-right">{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Customer Journey ─────────────────────────────────────────────────────────

export function CustomerJourneyDashboard({ sellerId }: { sellerId?: string }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const uid = sellerId || user?.id;
        const { data, error } = await supabase.rpc('get_customer_journey', { p_seller_id: uid, p_days: 30 });
        if (error) throw error;
        setData(data as Record<string, unknown>);
      } catch { setData(null); }
      finally { setLoading(false); }
    };
    load();
  }, [sellerId]);

  if (loading) return <AnalyticsLoading message="Mapping customer journey..." />;
  if (!data) return <AnalyticsNoData />;

  const steps = arr(data, 'funnel');

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
        <Activity className="w-5 h-5 text-indigo-500" /> Customer Journey
      </h3>
      <FunnelChart steps={steps.map((s) => ({ step: String(s.step), count: Number(s.count) || 0 }))} />
    </div>
  );
}

// ─── Competitor Benchmarking ──────────────────────────────────────────────────

export function CompetitorBenchmarking({ sellerId }: { sellerId?: string }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const uid = sellerId || user?.id;
        const { data, error } = await supabase.rpc('get_competitor_benchmarking', { p_seller_id: uid, p_days: 30 });
        if (error) throw error;
        setData(data as Record<string, unknown>);
      } catch { setData(null); }
      finally { setLoading(false); }
    };
    load();
  }, [sellerId]);

  if (loading) return <AnalyticsLoading message="Benchmarking..." />;
  if (!data) return <AnalyticsNoData />;

  const seller = data.seller as Record<string, number> | undefined;
  const mktAvg = data.marketplace_avg as Record<string, number> | undefined;
  const metrics = ['views', 'sales', 'revenue', 'conversion', 'avg_price', 'reviews'];

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
        <Target className="w-5 h-5 text-indigo-500" /> Competitor Benchmarking
      </h3>

      {data.ranking != null && (
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl p-4 text-white">
          <p className="text-xs opacity-80">Your Marketplace Ranking</p>
          <p className="text-3xl font-bold">#{String(data.ranking)}</p>
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
              <th className="text-left p-3 font-medium text-gray-600 dark:text-gray-400">Metric</th>
              <th className="text-right p-3 font-medium text-gray-600 dark:text-gray-400">You</th>
              <th className="text-right p-3 font-medium text-gray-600 dark:text-gray-400">Marketplace Avg</th>
              <th className="text-right p-3 font-medium text-gray-600 dark:text-gray-400">vs Avg</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((m) => {
              const sv = seller?.[m] || 0;
              const av = mktAvg?.[m] || 0;
              const diff = av > 0 ? ((sv - av) / av * 100) : 0;
              const formatVal = (v: number) => m === 'revenue' || m === 'avg_price' ? formatCurrency(v) : v.toLocaleString();
              return (
                <tr key={m} className="border-b border-gray-100 dark:border-gray-800/50">
                  <td className="p-3 capitalize text-gray-700 dark:text-gray-300">{m.replace('_', ' ')}</td>
                  <td className="text-right p-3 font-medium text-gray-900 dark:text-white">{formatVal(sv)}</td>
                  <td className="text-right p-3 text-gray-500">{formatVal(Math.round(av))}</td>
                  <td className="text-right p-3">
                    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${diff >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {diff >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                      {Math.abs(diff).toFixed(0)}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Financial Dashboard ──────────────────────────────────────────────────────

export function FinancialDashboard({ sellerId }: { sellerId?: string }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const uid = sellerId || user?.id;
        const { data, error } = await supabase.rpc('get_financial_dashboard', { p_seller_id: uid, p_days: 30 });
        if (error) throw error;
        setData(data as Record<string, unknown>);
      } catch { setData(null); }
      finally { setLoading(false); }
    };
    load();
  }, [sellerId]);

  if (loading) return <AnalyticsLoading message="Loading financial dashboard..." />;
  if (!data) return <AnalyticsNoData />;

  const metrics = [
    ['Gross Revenue', formatCurrency(num(data, 'gross_revenue')), DollarSign, 'text-green-500'],
    ['Net Revenue', formatCurrency(num(data, 'net_revenue')), DollarSign, 'text-emerald-500'],
    ['Platform Fee', formatCurrency(num(data, 'platform_fee')), DollarSign, 'text-orange-500'],
    ['Commission Paid', formatCurrency(num(data, 'commission_paid')), DollarSign, 'text-amber-500'],
    ['Refunds', formatCurrency(num(data, 'refunds')), DollarSign, 'text-red-500'],
    ['Pending Revenue', formatCurrency(num(data, 'pending_revenue')), DollarSign, 'text-blue-500'],
    ['Withdrawable', formatCurrency(num(data, 'withdrawable_balance')), DollarSign, 'text-green-500'],
    ['Affiliate Payouts', formatCurrency(num(data, 'affiliate_payouts')), DollarSign, 'text-purple-500'],
    ['Creator Payouts', formatCurrency(num(data, 'creator_payouts')), DollarSign, 'text-pink-500'],
    ['Promotion Spend', formatCurrency(num(data, 'promotion_spending')), DollarSign, 'text-orange-500'],
    ['ROI', `${num(data, 'roi').toFixed(1)}%`, TrendingUp, 'text-indigo-500'],
    ['Profit Margin', `${num(data, 'profit_margin').toFixed(1)}%`, TrendingUp, 'text-green-500'],
    ['Tax Estimate', formatCurrency(num(data, 'tax_estimate')), DollarSign, 'text-gray-500'],
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
        <DollarSign className="w-5 h-5 text-green-500" /> Financial Dashboard
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {metrics.map((m, i) => {
          const [l, v, icon, color] = m;
          const Icon = icon as React.ComponentType<{ className?: string }>;
          return (
            <div key={i} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
              <Icon className={`w-4 h-4 ${color as string} mb-1`} />
              <p className="text-xs text-gray-500 dark:text-gray-400">{l as string}</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{v as string}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Fraud Detection ──────────────────────────────────────────────────────────

export function FraudDetectionDashboard({ sellerId }: { sellerId?: string }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const uid = sellerId || user?.id;
        const { data, error } = await supabase.rpc('get_fraud_detection', { p_seller_id: uid, p_days: 30 });
        if (error) throw error;
        setData(data as Record<string, unknown>);
      } catch { setData(null); }
      finally { setLoading(false); }
    };
    load();
  }, [sellerId]);

  if (loading) return <AnalyticsLoading message="Scanning for fraud..." />;
  if (!data) return <AnalyticsNoData />;

  const riskScore = num(data, 'risk_score');
  const riskBg = riskScore < 20 ? 'from-green-500 to-emerald-600' : riskScore < 50 ? 'from-amber-500 to-orange-600' : 'from-red-500 to-rose-600';

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
        <Shield className="w-5 h-5 text-red-500" /> Fraud Detection
      </h3>

      <div className={`bg-gradient-to-br ${riskBg} rounded-xl p-4 text-white`}>
        <Shield className="w-6 h-6 mb-2" />
        <p className="text-xs opacity-80">Risk Score</p>
        <p className="text-3xl font-bold">{riskScore.toFixed(0)}<span className="text-sm opacity-70">/100</span></p>
        <p className="text-xs opacity-80 mt-1">
          {riskScore < 20 ? 'Low risk — no suspicious activity detected' : riskScore < 50 ? 'Moderate risk — some anomalies detected' : 'High risk — immediate review recommended'}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ['Fake Views', num(data, 'fake_views'), 'text-red-500'],
          ['Fake Clicks', num(data, 'fake_clicks'), 'text-red-500'],
          ['Bot Traffic', num(data, 'bot_traffic'), 'text-amber-500'],
          ['Rapid Refresh', num(data, 'rapid_refresh'), 'text-orange-500'],
          ['Referral Fraud', num(data, 'referral_fraud'), 'text-red-500'],
        ].map((m, i) => {
          const [l, v, color] = m;
          return (
            <div key={i} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
              <AlertCircle className={`w-4 h-4 ${color as string} mb-1`} />
              <p className="text-xs text-gray-500 dark:text-gray-400">{l as string}</p>
              <p className={`text-lg font-bold ${color as string}`}>{(v as number).toLocaleString()}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
