// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT Advanced Analytics Components — Scores, Trending, Predictions,
// Promotion, Affiliate Deep, Campaign V2, Referral Intelligence,
// Admin Intelligence, Recommendation AI, AI Business Advisor
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { BarChart, FunnelChart, DonutChart } from './Charts';
import { AnalyticsLoading, AnalyticsNoData, AnalyticsState } from './AnalyticsState';
import {
  TrendingUp, TrendingDown, Zap, Star, Eye, DollarSign, Target, Activity,
  Award, Brain, Sparkles, AlertCircle, CheckCircle, Clock, Globe,
  Smartphone, Calendar, ArrowUp, ArrowDown, Flame, Rocket, Users, Bell, Cpu,
  Percent, ShoppingCart, Share2,
} from 'lucide-react';
import { formatCurrency } from '../../lib/currency';

// ─── Helper ───────────────────────────────────────────────────────────────────

const num = (d: Record<string, unknown> | null, k: string) => (d ? Number(d[k]) || 0 : 0);
const str = (d: Record<string, unknown> | null, k: string) => (d ? String(d[k] || '—') : '—');
const arr = (d: Record<string, unknown> | null, k: string) => (d ? (d[k] as Record<string, unknown>[]) || [] : []);

// ─── 1. Marketplace Score Card ────────────────────────────────────────────────

export function MarketplaceScoreCard({ entityType, entityId }: { entityType: string; entityId: string }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc('get_marketplace_scores', { p_entity_type: entityType, p_entity_id: entityId });
        if (error) throw error;
        setData(data as Record<string, unknown>);
      } catch { setData(null); }
      finally { setLoading(false); }
    };
    load();
  }, [entityType, entityId]);

  if (loading) return <AnalyticsLoading message="Calculating marketplace scores..." />;
  if (!data) return <AnalyticsNoData message="Unable to calculate scores" />;

  const scores = [
    { key: 'overall_score', label: 'Overall Score', icon: Award, color: 'from-indigo-500 to-purple-600', explanation: '' },
    { key: 'quality_score', label: 'Quality Score', icon: Star, color: 'from-amber-500 to-orange-600', explanation: str(data, 'quality_explanation') },
    { key: 'trust_score', label: 'Trust Score', icon: CheckCircle, color: 'from-green-500 to-emerald-600', explanation: str(data, 'trust_explanation') },
    { key: 'engagement_score', label: 'Engagement Score', icon: Activity, color: 'from-pink-500 to-rose-600', explanation: str(data, 'engagement_explanation') },
    { key: 'conversion_score', label: 'Conversion Score', icon: Target, color: 'from-blue-500 to-cyan-600', explanation: str(data, 'conversion_explanation') },
    { key: 'popularity_score', label: 'Popularity Score', icon: Eye, color: 'from-purple-500 to-violet-600', explanation: str(data, 'popularity_explanation') },
    { key: 'freshness_score', label: 'Freshness Score', icon: Clock, color: 'from-teal-500 to-cyan-600', explanation: str(data, 'freshness_explanation') },
    { key: 'seo_score', label: 'SEO Score', icon: Globe, color: 'from-sky-500 to-blue-600', explanation: str(data, 'seo_explanation') },
    { key: 'recommendation_score', label: 'Recommendation Score', icon: Sparkles, color: 'from-violet-500 to-purple-600', explanation: '' },
    { key: 'promotion_score', label: 'Promotion Score', icon: Rocket, color: 'from-orange-500 to-red-600', explanation: str(data, 'promotion_explanation') },
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
        <Award className="w-5 h-5 text-indigo-500" /> Marketplace Algorithm Scores
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
        {scores.map((s, i) => {
          const score = num(data, s.key);
          return (
            <div key={i} className={`rounded-xl p-4 text-white bg-gradient-to-br ${s.color}`}>
              <s.icon className="w-5 h-5 mb-2 opacity-80" />
              <p className="text-xs opacity-80">{s.label}</p>
              <p className="text-2xl font-bold">{score.toFixed(0)}<span className="text-sm opacity-70">/100</span></p>
              {s.explanation && s.explanation !== '—' && (
                <p className="text-xs opacity-75 mt-1">{s.explanation}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 2. Trending Engine ───────────────────────────────────────────────────────

export function TrendingEngineDashboard() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc('get_trending_engine', { p_scope: 'marketplace', p_limit: 10 });
        if (error) throw error;
        setData(data as Record<string, unknown>);
      } catch { setData(null); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  if (loading) return <AnalyticsLoading message="Loading trending engine..." />;
  if (!data) return <AnalyticsNoData />;

  const renderTrendingList = (items: Record<string, unknown>[], title: string, IconComp: React.ComponentType<{ className?: string }>, color: string) => {
    if (!items.length) return null;
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
          <IconComp className={`w-4 h-4 ${color}`} /> {title}
        </h4>
        <div className="space-y-2">
          {items.slice(0, 5).map((item, i) => {
            const growth = Number(item.growth_rate) || 0;
            const momentum = Number(item.momentum_score) || 0;
            return (
              <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1">{String(item.name || 'Unknown')}</span>
                <div className="flex items-center gap-2 ml-2">
                  <span className="text-xs text-gray-500">{Number(item.views || item.this_week || 0).toLocaleString()} views</span>
                  {growth !== 0 && (
                    <span className={`text-xs font-medium flex items-center gap-0.5 ${growth > 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {growth > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                      {Math.abs(growth).toFixed(0)}%
                    </span>
                  )}
                  {momentum !== 0 && (
                    <span className={`text-xs font-medium ${momentum > 0 ? 'text-green-500' : 'text-red-500'}`}>{momentum > 0 ? '+' : ''}{momentum}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const viralItems = arr(data, 'viral_products').map((v) => ({ ...v, views: Number(v.viral_score) || 0, growth_rate: 0, momentum_score: 0 }));
  const decliningItems = arr(data, 'declining_products').map((d) => ({ ...d, views: Number(d.this_week) || 0, growth_rate: -Number(d.decline_rate) || 0, momentum_score: 0 }));
  const growingSellers = arr(data, 'fastest_growing_sellers');

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
        <Flame className="w-5 h-5 text-orange-500" /> Trending Engine
      </h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {renderTrendingList(arr(data, 'trending_today'), 'Trending Today', Zap, 'text-orange-500')}
        {renderTrendingList(arr(data, 'trending_this_week'), 'Trending This Week', TrendingUp, 'text-indigo-500')}
        {renderTrendingList(arr(data, 'fastest_growing_products'), 'Fastest Growing Products', Rocket, 'text-green-500')}
        {renderTrendingList(growingSellers as Record<string, unknown>[], 'Fastest Growing Sellers', Award, 'text-purple-500')}
        {renderTrendingList(viralItems, 'Viral Products', Flame, 'text-pink-500')}
        {renderTrendingList(decliningItems, 'Declining Products', TrendingDown, 'text-red-500')}
      </div>
    </div>
  );
}

// ─── 3. Recommendation AI ─────────────────────────────────────────────────────

export function RecommendationAI({ sellerId, entityId }: { sellerId: string; entityId?: string }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const params: Record<string, unknown> = { p_seller_id: sellerId };
        if (entityId) params.p_entity_id = entityId;
        const { data, error } = await supabase.rpc('get_recommendation_ai', params);
        if (error) throw error;
        setData(data as Record<string, unknown>);
      } catch { setData(null); }
      finally { setLoading(false); }
    };
    load();
  }, [sellerId, entityId]);

  if (loading) return <AnalyticsLoading message="AI is analyzing your data..." />;
  if (!data) return <AnalyticsNoData />;

  const recommendations = [
    { icon: Clock, label: 'Best Time to Post', value: str(data, 'best_time_label'), color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-900/20' },
    { icon: Calendar, label: 'Best Day to Promote', value: str(data, 'best_day_to_promote'), color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/20' },
    { icon: DollarSign, label: 'Suggested Price', value: formatCurrency(num(data, 'suggested_price')), color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-900/20' },
    { icon: Percent, label: 'Suggested Affiliate Commission', value: `${num(data, 'suggested_affiliate_commission')}%`, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20' },
    { icon: Target, label: 'Suggested Discount', value: `${num(data, 'suggested_discount')}%`, color: 'text-pink-500', bg: 'bg-pink-50 dark:bg-pink-900/20' },
    { icon: ShoppingCart, label: 'Est. Sales if Promoted', value: `${num(data, 'estimated_sales_if_promoted')} units`, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20' },
    { icon: TrendingUp, label: 'Estimated ROI', value: `${num(data, 'estimated_roi').toFixed(1)}x`, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
    { icon: DollarSign, label: 'Suggested Campaign Budget', value: formatCurrency(num(data, 'suggested_campaign_budget')), color: 'text-violet-500', bg: 'bg-violet-50 dark:bg-violet-900/20' },
    { icon: DollarSign, label: 'Suggested Ad Budget', value: formatCurrency(num(data, 'suggested_ad_budget')), color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-900/20' },
  ];

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
        <Brain className="w-4 h-4 text-indigo-500" /> AI Recommendations
      </h4>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {recommendations.map((r, i) => (
          <div key={i} className={`rounded-xl p-3 ${r.bg}`}>
            <r.icon className={`w-4 h-4 ${r.color} mb-1`} />
            <p className="text-xs text-gray-500 dark:text-gray-400">{r.label}</p>
            <p className={`text-lg font-bold ${r.color}`}>{r.value}</p>
          </div>
        ))}
      </div>
      {str(data, 'price_analysis') !== '—' && (
        <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">{str(data, 'price_analysis')}</p>
        </div>
      )}
      {arr(data, 'best_countries').length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Best Countries to Target</h5>
          <div className="flex flex-wrap gap-2">
            {arr(data, 'best_countries').map((c, i) => (
              <span key={i} className="px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-sm text-indigo-700 dark:text-indigo-400">
                {String(c.country)} ({Number(c.conversions)} conversions)
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 4. Promotion Analytics ───────────────────────────────────────────────────

export function PromotionAnalyticsDashboard({ promotionId }: { promotionId: string }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc('get_promotion_analytics', { p_promotion_id: promotionId, p_days: 30 });
        if (error) throw error;
        setData(data as Record<string, unknown>);
      } catch { setData(null); }
      finally { setLoading(false); }
    };
    load();
  }, [promotionId]);

  if (loading) return <AnalyticsLoading />;
  if (!data) return <AnalyticsNoData />;

  const health = str(data, 'campaign_health');
  const healthColors: Record<string, string> = {
    profitable: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400',
    break_even: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
    underperforming: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400',
    monitoring: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {[
          ['Money Spent', formatCurrency(num(data, 'money_spent')), DollarSign, 'text-red-500'],
          ['Remaining Budget', formatCurrency(num(data, 'remaining_budget')), DollarSign, 'text-green-500'],
          ['CPM', formatCurrency(num(data, 'cpm')), Eye, 'text-indigo-500'],
          ['CPC', formatCurrency(num(data, 'cpc')), Target, 'text-blue-500'],
          ['CPA', formatCurrency(num(data, 'cpa')), ShoppingCart, 'text-purple-500'],
          ['CTR', `${num(data, 'ctr').toFixed(1)}%`, TrendingUp, 'text-green-500'],
          ['Reach', num(data, 'reach').toLocaleString(), Eye, 'text-cyan-500'],
          ['Impressions', num(data, 'impressions').toLocaleString(), Activity, 'text-orange-500'],
          ['Purchases', num(data, 'purchases').toLocaleString(), ShoppingCart, 'text-blue-500'],
          ['Revenue', formatCurrency(num(data, 'revenue_generated')), DollarSign, 'text-green-500'],
          ['Profit', formatCurrency(num(data, 'profit')), DollarSign, num(data, 'profit') >= 0 ? 'text-green-500' : 'text-red-500'],
          ['ROAS', `${num(data, 'roas').toFixed(2)}x`, TrendingUp, 'text-indigo-500'],
        ].map(([l, v, icon, color], i) => {
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
      <div className={`rounded-xl p-4 ${healthColors[health] || healthColors.monitoring}`}>
        <p className="text-sm font-medium capitalize">Campaign Health: {health}</p>
      </div>
      {arr(data, 'daily_breakdown').length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Daily Performance</h4>
          <BarChart data={arr(data, 'daily_breakdown').map((d) => ({ label: new Date(d.date as string).toLocaleDateString('en', { month: 'short', day: 'numeric' }), value: Number(d.clicks) || 0 }))} color="#f59e0b" />
        </div>
      )}
    </div>
  );
}

// ─── 5. Affiliate Deep Analytics ──────────────────────────────────────────────

export function AffiliateDeepAnalytics({ affiliateId }: { affiliateId: string }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc('get_affiliate_deep_analytics', { p_affiliate_id: affiliateId, p_days: 30 });
        if (error) throw error;
        setData(data as Record<string, unknown>);
      } catch { setData(null); }
      finally { setLoading(false); }
    };
    load();
  }, [affiliateId]);

  if (loading) return <AnalyticsLoading />;
  if (!data) return <AnalyticsNoData />;

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Affiliate Funnel</h4>
        <FunnelChart steps={arr(data, 'funnel').map((s) => ({ step: String(s.step), count: Number(s.count) || 0 }))} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Top Products</h4>
          {arr(data, 'top_products').length > 0 ? (
            <div className="space-y-2">
              {arr(data, 'top_products').map((p, i) => (
                <div key={i} className="flex justify-between text-sm p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                  <span className="text-gray-700 dark:text-gray-300 truncate">{String(p.name || 'Unknown')}</span>
                  <span className="text-indigo-500 font-medium">{Number(p.clicks).toLocaleString()} clicks</span>
                </div>
              ))}
            </div>
          ) : <AnalyticsNoData />}
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Top Countries</h4>
          {arr(data, 'top_countries').length > 0 ? (
            <DonutChart data={arr(data, 'top_countries').map((c) => ({ label: String(c.country || ''), value: Number(c.count) || 0 }))} />
          ) : <AnalyticsNoData />}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
          <Globe className="w-4 h-4 text-cyan-500 mb-1" />
          <p className="text-xs text-gray-500 dark:text-gray-400">Top Traffic Source</p>
          <p className="text-sm font-bold text-gray-900 dark:text-white capitalize">{str(data, 'top_traffic_source')}</p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
          <Smartphone className="w-4 h-4 text-purple-500 mb-1" />
          <p className="text-xs text-gray-500 dark:text-gray-400">Top Device</p>
          <p className="text-sm font-bold text-gray-900 dark:text-white capitalize">{str(data, 'top_device')}</p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
          <DollarSign className="w-4 h-4 text-green-500 mb-1" />
          <p className="text-xs text-gray-500 dark:text-gray-400">Commission Forecast</p>
          <p className="text-sm font-bold text-green-500">{formatCurrency(num(data, 'commission_forecast'))}</p>
        </div>
      </div>
    </div>
  );
}

// ─── 6. Creator Campaign Analytics V2 ─────────────────────────────────────────

export function CreatorCampaignAnalyticsV2({ campaignId }: { campaignId: string }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc('get_creator_campaign_analytics_v2', { p_campaign_id: campaignId, p_days: 30 });
        if (error) throw error;
        setData(data as Record<string, unknown>);
      } catch { setData(null); }
      finally { setLoading(false); }
    };
    load();
  }, [campaignId]);

  if (loading) return <AnalyticsLoading />;
  if (!data) return <AnalyticsNoData />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {[
          ['Video Views', num(data, 'video_views'), Eye, 'text-indigo-500'],
          ['Avg Watch Time', `${num(data, 'average_watch_time')}s`, Clock, 'text-purple-500'],
          ['Viewer Retention', `${num(data, 'viewer_retention')}%`, Activity, 'text-cyan-500'],
          ['Likes', num(data, 'likes'), Star, 'text-amber-500'],
          ['Comments', num(data, 'comments'), 'text-orange-500' as unknown as React.ComponentType<{ className?: string }>, 'text-orange-500'],
          ['Shares', num(data, 'shares'), Share2, 'text-pink-500'],
          ['Saves', num(data, 'saves'), CheckCircle, 'text-green-500'],
          ['CTR', `${num(data, 'ctr').toFixed(1)}%`, Target, 'text-blue-500'],
          ['Purchases', num(data, 'purchases_generated'), ShoppingCart, 'text-emerald-500'],
          ['Revenue', formatCurrency(num(data, 'revenue_generated')), DollarSign, 'text-green-500'],
          ['Creator ROI', `${num(data, 'creator_roi').toFixed(0)}%`, TrendingUp, 'text-indigo-500'],
        ].map((item, i) => {
          const [l, v, icon, color] = item;
          const Icon = icon as React.ComponentType<{ className?: string }>;
          return (
            <div key={i} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
              <Icon className={`w-4 h-4 ${color as string} mb-1`} />
              <p className="text-xs text-gray-500 dark:text-gray-400">{l as string}</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{typeof v === 'number' ? v.toLocaleString() : v as string}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 7. Referral Intelligence ─────────────────────────────────────────────────

export function ReferralIntelligenceDashboard({ userId }: { userId?: string }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const uid = userId || user?.id;
        const { data, error } = await supabase.rpc('get_referral_intelligence', { p_user_id: uid, p_days: 30 });
        if (error) throw error;
        setData(data as Record<string, unknown>);
      } catch { setData(null); }
      finally { setLoading(false); }
    };
    load();
  }, [userId]);

  if (loading) return <AnalyticsLoading message="Loading referral intelligence..." />;
  if (!data) return <AnalyticsNoData />;

  const conversionRates = data.stage_conversion_rates as Record<string, number> | undefined;

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Referral Funnel (11 Stages)</h4>
        <FunnelChart steps={arr(data, 'funnel').map((s) => ({ step: String(s.step), count: Number(s.count) || 0 }))} />
      </div>
      {conversionRates && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">Invite → Signup</p>
            <p className="text-2xl font-bold text-indigo-500">{(conversionRates.invite_to_signup || 0).toFixed(1)}%</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">Signup → Purchase</p>
            <p className="text-2xl font-bold text-purple-500">{(conversionRates.signup_to_purchase || 0).toFixed(1)}%</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">Purchase → Reward</p>
            <p className="text-2xl font-bold text-green-500">{(conversionRates.purchase_to_reward || 0).toFixed(1)}%</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 8. Admin Intelligence Dashboard ──────────────────────────────────────────

export function AdminIntelligenceDashboard() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc('get_admin_intelligence_v2', { p_days: 30 });
        if (error) throw error;
        setData(data as Record<string, unknown>);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed');
      }
      finally { setLoading(false); }
    };
    load();
  }, []);

  if (loading) return <AnalyticsLoading message="Loading admin intelligence..." />;
  if (error === 'Unauthorized: admin access required') return <AnalyticsState loading={false} error="Permission Denied" syncing={false} offline={false} hasData={false}><></></AnalyticsState>;
  if (!data) return <AnalyticsNoData />;

  const platformGrowth = data.platform_growth as Record<string, number> | undefined;
  const aiUsage = data.ai_usage as Record<string, unknown> | undefined;
  const pushPerf = data.push_performance as Record<string, number> | undefined;
  const emailPerf = data.email_performance as Record<string, number> | undefined;
  void emailPerf;
  const fraudAlerts = data.fraud_alerts as Record<string, unknown> | undefined;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
        <Brain className="w-5 h-5 text-indigo-500" /> Admin Intelligence
      </h3>

      {/* Growth + Active Users */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {[
          ['DAU', num(data, 'dau'), Activity, 'text-green-500'],
          ['WAU', num(data, 'wau'), Users, 'text-blue-500'],
          ['MAU', num(data, 'mau'), Users, 'text-purple-500'],
          ['Churn Rate', `${num(data, 'churn_rate').toFixed(1)}%`, TrendingDown, 'text-red-500'],
          ['Retention', `${num(data, 'retention_rate').toFixed(1)}%`, TrendingUp, 'text-green-500'],
          ['LTV', formatCurrency(num(data, 'ltv')), DollarSign, 'text-indigo-500'],
          ['CAC', formatCurrency(num(data, 'cac')), DollarSign, 'text-amber-500'],
          ['User Growth', `${(platformGrowth?.user_growth_rate || 0).toFixed(1)}%`, Rocket, 'text-emerald-500'],
          ['Revenue Growth', `${(platformGrowth?.revenue_growth || 0).toFixed(1)}%`, TrendingUp, 'text-green-500'],
          ['Listing Growth', `${(platformGrowth?.listing_growth || 0).toFixed(1)}%`, Rocket, 'text-blue-500'],
          ['AI Requests', num(aiUsage as Record<string, unknown> || {}, 'total_requests'), Cpu, 'text-purple-500'],
          ['Push Open Rate', `${(pushPerf?.open_rate || 0).toFixed(1)}%`, Bell, 'text-cyan-500'],
        ].map((item, i) => {
          const [l, v, icon, color] = item;
          const Icon = icon as React.ComponentType<{ className?: string }>;
          return (
            <div key={i} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
              <Icon className={`w-4 h-4 ${color as string} mb-1`} />
              <p className="text-xs text-gray-500 dark:text-gray-400">{l as string}</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{typeof v === 'number' ? v.toLocaleString() : v as string}</p>
            </div>
          );
        })}
      </div>

      {/* Category + Country Growth */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Category Growth</h4>
          {arr(data, 'category_growth').length > 0 ? (
            <div className="space-y-2">
              {arr(data, 'category_growth').map((c, i) => (
                <div key={i} className="flex justify-between text-sm p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                  <span className="text-gray-700 dark:text-gray-300">{String(c.category)}</span>
                  <span className={Number(c.growth) >= 0 ? 'text-green-500' : 'text-red-500'}>{Number(c.growth) >= 0 ? '+' : ''}{Number(c.growth).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          ) : <AnalyticsNoData />}
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Country Growth</h4>
          {arr(data, 'country_growth').length > 0 ? (
            <div className="space-y-2">
              {arr(data, 'category_growth').map((c, i) => (
                <div key={i} className="flex justify-between text-sm p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                  <span className="text-gray-700 dark:text-gray-300">{String(c.category)}</span>
                  <span className="text-indigo-500">{Number(c.users || c.count || 0).toLocaleString()} users</span>
                </div>
              ))}
            </div>
          ) : <AnalyticsNoData />}
        </div>
      </div>

      {/* Fraud Alerts */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-500" /> Fraud Detection
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">Suspicious Sellers</p>
            <p className="text-2xl font-bold text-red-500">{Number(fraudAlerts?.suspicious_sellers || 0)}</p>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">Fake Reviews</p>
            <p className="text-2xl font-bold text-red-500">{Number(fraudAlerts?.fake_reviews || 0)}</p>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">Fake Clicks</p>
            <p className="text-2xl font-bold text-red-500">{Number(fraudAlerts?.fake_clicks || 0)}</p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">Bot Detection</p>
            <p className="text-2xl font-bold text-amber-500">{Number(fraudAlerts?.bot_detection || 0)}</p>
          </div>
        </div>
        {arr(fraudAlerts as Record<string, unknown> || {}, 'recent_alerts').length > 0 && (
          <div className="space-y-2">
            {arr(fraudAlerts as Record<string, unknown> || {}, 'recent_alerts').slice(0, 5).map((a, i) => (
              <div key={i} className="flex items-center gap-2 text-sm p-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="capitalize">{String(a.type).replace(/_/g, ' ')}</span>
                <span className="text-gray-400 ml-auto">{new Date(a.created_at as string).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 9. Prediction Engine ─────────────────────────────────────────────────────

export function PredictionEngineDashboard({ sellerId }: { sellerId?: string }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [window, setWindow] = useState('30d');

  const windows = [
    { label: 'Tomorrow', value: 'tomorrow' },
    { label: '7 Days', value: '7d' },
    { label: '30 Days', value: '30d' },
    { label: '90 Days', value: '90d' },
    { label: '1 Year', value: '1y' },
  ];

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc('get_prediction_engine', {
          p_entity_type: 'seller', p_entity_id: sellerId || null, p_window: window,
        });
        if (error) throw error;
        setData(data as Record<string, unknown>);
      } catch { setData(null); }
      finally { setLoading(false); }
    };
    load();
  }, [sellerId, window]);

  if (loading) return <AnalyticsLoading message="Running prediction engine..." />;
  if (!data) return <AnalyticsNoData />;

  const invForecast = data.inventory_forecast as Record<string, number> | undefined;
  const affForecast = data.affiliate_forecast as Record<string, number> | undefined;
  const refForecast = data.referral_forecast as Record<string, number> | undefined;
  const campForecast = data.campaign_forecast as Record<string, number> | undefined;
  const confidence = str(data, 'confidence');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Brain className="w-5 h-5 text-indigo-500" /> Prediction Engine
        </h3>
        <div className="flex gap-1.5">
          {windows.map((w) => (
            <button key={w.value} onClick={() => setWindow(w.value)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${window === w.value ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>{w.label}</button>
          ))}
        </div>
      </div>

      <div className={`rounded-xl p-3 text-sm font-medium ${confidence === 'high' ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' : confidence === 'medium' ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' : 'bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
        Confidence: {confidence} · Growth rate: {num(data, 'growth_rate').toFixed(1)}%
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ['Sales Forecast', num(data, 'sales_forecast').toLocaleString(), ShoppingCart, 'text-blue-500'],
          ['Revenue Forecast', formatCurrency(num(data, 'revenue_forecast')), DollarSign, 'text-green-500'],
          ['View Forecast', num(data, 'view_forecast').toLocaleString(), Eye, 'text-indigo-500'],
          ['Affiliate Clicks', Number(affForecast?.estimated_clicks || 0).toLocaleString(), Target, 'text-amber-500'],
          ['Affiliate Commission', formatCurrency(Number(affForecast?.estimated_commission || 0)), DollarSign, 'text-violet-500'],
          ['Referral Signups', Number(refForecast?.estimated_signups || 0).toLocaleString(), Users, 'text-purple-500'],
          ['Referral Earnings', formatCurrency(Number(refForecast?.estimated_earnings || 0)), DollarSign, 'text-pink-500'],
          ['Campaign Reach', Number(campForecast?.estimated_reach || 0).toLocaleString(), Rocket, 'text-orange-500'],
        ].map((item, i) => {
          const [l, v, icon, color] = item;
          const Icon = icon as React.ComponentType<{ className?: string }>;
          return (
            <div key={i} className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 rounded-xl p-3 border border-gray-200 dark:border-gray-700">
              <Icon className={`w-4 h-4 ${color as string} mb-1`} />
              <p className="text-xs text-gray-500 dark:text-gray-400">{l as string}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{v as string}</p>
            </div>
          );
        })}
      </div>

      {invForecast && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Inventory Forecast</h4>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Current stock: <span className="font-medium text-gray-900 dark:text-white">{Number(invForecast.current_stock).toLocaleString()} units</span>
            {invForecast.estimated_days_of_stock && (
              <span> · Estimated {Math.round(Number(invForecast.estimated_days_of_stock))} days of stock at current sales rate</span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── 10. AI Business Advisor ──────────────────────────────────────────────────

export function AIBusinessAdvisor({ sellerId }: { sellerId?: string }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyticsData, setAnalyticsData] = useState<Record<string, unknown> | null>(null);

  const suggestions = [
    'Why did my sales drop?',
    'Which products should I promote?',
    'Which country should I target?',
    'How do I reach $5,000 this month?',
    'Which affiliate should I increase commission for?',
    'Why isn\'t my service converting?',
    'What is my weakest-performing product?',
    'Which campaign should I stop?',
  ];

  useEffect(() => {
    const loadAnalytics = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const uid = sellerId || user?.id;
        if (!uid) return;
        const { data } = await supabase.rpc('get_seller_analytics_v2', { p_seller_id: uid, p_days: 30 });
        setAnalyticsData(data as Record<string, unknown>);
      } catch { /* ignore */ }
    };
    loadAnalytics();
  }, [sellerId]);

  const generateAnswer = (q: string): string => {
    if (!analyticsData) return 'I need to load your analytics data first. Please try again in a moment.';

    const d = analyticsData;
    const qLower = q.toLowerCase();

    if (qLower.includes('sales') && qLower.includes('drop')) {
      const conv = num(d, 'conversion_rate');
      const views = num(d, 'total_views');
      const purchases = num(d, 'purchases');
      return `Your conversion rate is ${conv}%, with ${views} views generating ${purchases} purchases in the last 30 days. ${conv < 2 ? 'This is below the marketplace average of 3%. ' : ''}Common causes for sales drops include: (1) Seasonal trends — check if views also declined. ${views > 100 ? 'Your views look healthy, so the issue is likely in conversion, not traffic. ' : 'Your views are low — focus on improving visibility through SEO and promotions. '}(2) Price competitiveness — compare your prices to category averages. (3) Product freshness — if your listing is old, consider updating images and description. (4) Review quality — ${num(d, 'orders_completed')} completed orders should generate reviews. ${num(d, 'cart_adds') > num(d, 'purchases') * 2 ? `You have ${num(d, 'cart_adds')} cart adds but only ${purchases} purchases — this suggests checkout friction. Simplify your checkout process or offer free shipping.` : ''}`;
    }

    if (qLower.includes('promote')) {
      const shares = num(d, 'shares');
      const favorites = num(d, 'favorites');
      return `Based on your analytics, your most engaged products have ${favorites} favorites and ${shares} shares. Products with high engagement but low sales (${num(d, 'cart_adds')} cart adds, ${num(d, 'checkout_starts')} checkout starts) are the best candidates for promotion — they have demand but need a push. I recommend promoting products with the highest wishlist saves first, as these users have already shown intent. Your top traffic source is ${arr(d, 'traffic_sources')[0]?.source || 'direct'}, so focus your promotion budget there for maximum ROI.`;
    }

    if (qLower.includes('country') || qLower.includes('target')) {
      const countries = arr(d, 'top_countries');
      if (countries.length > 0) {
        return `Your top countries by views are: ${countries.slice(0, 3).map((c) => `${c.country} (${c.count} views)`).join(', ')}. ${countries[0] ? `Focus your marketing on ${countries[0].country} — you already have ${countries[0].count} views from there. ` : ''}Consider translating your product descriptions for these markets and running targeted promotions in these regions. Your conversion rate from these countries will be higher because users are already discovering your products organically.`;
      }
      return 'Not enough geographic data yet. As you get more views, I\'ll be able to recommend the best countries to target.';
    }

    if (qLower.includes('reach') && (qLower.includes('$') || qLower.includes('revenue') || qLower.includes('money'))) {
      const revenue = num(d, 'revenue');
      const avgDaily = revenue / 30;
      const targetMatch = q.match(/\$?([\d,]+)/);
      const target = targetMatch ? parseFloat(targetMatch[1].replace(/,/g, '')) : 5000;
      const daysNeeded = avgDaily > 0 ? Math.ceil(target / avgDaily) : 0;
      return `To reach $${target.toLocaleString()}, at your current rate of $${avgDaily.toFixed(2)}/day, you would need ${daysNeeded > 0 ? daysNeeded + ' days' : 'a significant increase in sales'}. ${avgDaily < target / 30 ? 'You need to increase your daily revenue. Recommendations: (1) Promote your best-performing products — they have ${num(d, "total_views")} views. (2) Increase affiliate commission to attract more promoters. (3) Run a limited-time discount to boost conversion rate (currently ${num(d, "conversion_rate")}%). (4) Target your top countries: ' + (arr(d, "top_countries").slice(0, 2).map((c) => c.country).join(", ") || "gathering data") + '. (5) Improve your SEO score to get more organic traffic.' : 'You\'re on track! Keep your current strategy and consider scaling with paid promotions.'}`;
    }

    if (qLower.includes('affiliate') && qLower.includes('commission')) {
      const conv = num(d, 'conversion_rate');
      return `Your affiliate performance: ${num(d, 'shares')} shares, ${conv}% conversion rate. ${conv < 2 ? 'Since your conversion is low, increasing affiliate commission to 15-20% will attract more affiliates who can drive traffic. The increased commission pays for itself if the additional sales volume compensates.' : 'Your conversion rate is decent — a 10% commission should attract quality affiliates without eating into margins. Focus on recruiting affiliates from your top countries: ' + arr(d, 'top_countries').slice(0, 2).map((c) => c.country).join(', ') + '.'}`;
    }

    if (qLower.includes('convert') || qLower.includes('converting')) {
      const conv = num(d, 'conversion_rate');
      const views = num(d, 'total_views');
      const carts = num(d, 'cart_adds');
      const checkouts = num(d, 'checkout_starts');
      return `Your conversion rate is ${conv}%. Funnel: ${views} views → ${carts} cart adds → ${checkouts} checkouts → ${num(d, 'purchases')} purchases. ${carts > checkouts * 2 ? 'Major drop-off from cart to checkout — simplify your checkout process. ' : ''}${checkouts > num(d, 'purchases') * 2 ? 'Major drop-off from checkout to purchase — pricing or shipping cost may be the issue. ' : ''}${conv < 1 ? 'Overall conversion is very low. Focus on: (1) Better product images, (2) Clearer description, (3) Competitive pricing, (4) Social proof through reviews.' : 'Conversion is reasonable. Continue optimizing.'}`;
    }

    if (qLower.includes('weakest') || qLower.includes('worst')) {
      const conv = num(d, 'conversion_rate');
      return `Looking at your 30-day data: your bounce rate is ${num(d, 'bounce_rate')}%, average session time is ${num(d, 'avg_session_time')}s. ${num(d, 'bounce_rate') > 60 ? 'High bounce rate suggests your product pages need better images and descriptions. ' : ''}${num(d, 'avg_session_time') < 30 ? 'Low session time means visitors aren\'t engaging — add more detail and visual content. ' : ''}Your weakest area appears to be ${conv < 2 ? 'conversion (below 2%)' : num(d, 'shares') < 5 ? 'social sharing' : 'traffic volume'}. Focus on improving this metric first for the biggest impact.`;
    }

    if (qLower.includes('campaign') && (qLower.includes('stop') || qLower.includes('end'))) {
      return `Based on your traffic sources: ${arr(d, 'traffic_sources').map((s) => `${s.source}: ${s.count}`).join(', ') || 'limited data'}. I recommend stopping campaigns with the lowest traffic contribution. Your best-performing source is ${arr(d, 'traffic_sources')[0]?.source || 'direct'}. Shift your budget from underperforming channels to your top source for better ROI.`;
    }

    return `Based on your 30-day analytics: ${num(d, 'total_views')} views, ${num(d, 'purchases')} purchases, ${formatCurrency(num(d, 'revenue'))} revenue, ${num(d, 'conversion_rate')}% conversion rate. Ask me specific questions about sales, promotions, targeting, or conversion for detailed insights.`;
  };

  const handleAsk = (q?: string) => {
    const questionText = q || question;
    if (!questionText.trim()) return;
    setLoading(true);
    setQuestion(questionText);
    setTimeout(() => {
      setAnswer(generateAnswer(questionText));
      setLoading(false);
    }, 800);
  };

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
            <Brain className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold">AI Business Advisor</h3>
            <p className="text-xs opacity-80">Ask AI about your business performance</p>
          </div>
        </div>

        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
            placeholder="Ask anything about your business..."
            className="flex-1 px-4 py-2.5 rounded-xl bg-white/20 text-white placeholder-white/60 text-sm focus:outline-none focus:bg-white/30"
          />
          <button
            onClick={() => handleAsk()}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl bg-white text-indigo-700 text-sm font-medium hover:bg-indigo-50 disabled:opacity-50"
          >
            {loading ? 'Thinking...' : 'Ask'}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {suggestions.map((s, i) => (
            <button key={i} onClick={() => handleAsk(s)} className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs hover:bg-white/20 transition-colors">
              {s}
            </button>
          ))}
        </div>
      </div>

      {answer && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-indigo-500" />
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{answer}</p>
          </div>
        </div>
      )}
    </div>
  );
}
