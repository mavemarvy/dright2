import { useState } from 'react';
import {
  Sparkles, Loader2, TrendingUp, DollarSign, Tag, Lightbulb,
  Gauge, CheckCircle2, AlertCircle,
} from 'lucide-react';
import {
  useListingQuality, usePricingIntelligence, useSEOKeywords, usePromotionAdvice,
} from '../lib/aiHooks';

interface Props {
  product: {
    id: string;
    name: string;
    description: string;
    price: number;
    image_url: string | null;
    category: string;
    tags: string[];
    total_sales: number;
    view_count: number;
    average_rating: number;
    total_reviews: number;
    is_free: boolean;
  };
}

export default function AISellerInsights({ product }: Props) {
  const [activeTab, setActiveTab] = useState<'quality' | 'pricing' | 'seo' | 'promotion'>('quality');
  const { score, loading: qLoading, analyze: analyzeQuality } = useListingQuality();
  const { pricing, loading: pLoading, analyze: analyzePricing } = usePricingIntelligence();
  const { keywords, loading: kLoading, generate: generateKeywords } = useSEOKeywords();
  const { advice, loading: aLoading, analyze: analyzePromotion } = usePromotionAdvice();

  const handleAnalyze = async () => {
    if (activeTab === 'quality') {
      await analyzeQuality(product.id, product);
    } else if (activeTab === 'pricing') {
      await analyzePricing(product.category, Number(product.price), product.is_free);
    } else if (activeTab === 'seo') {
      await generateKeywords(product.name, product.description || '', product.category, product.tags || []);
    } else if (activeTab === 'promotion') {
      await analyzePromotion(product.id, 0, product.category, Number(product.view_count) || 0, Number(product.total_sales) || 0);
    }
  };

  const loading = qLoading || pLoading || kLoading || aLoading;

  const tabs = [
    { key: 'quality' as const, label: 'Quality Score', icon: Gauge },
    { key: 'pricing' as const, label: 'Pricing', icon: DollarSign },
    { key: 'seo' as const, label: 'SEO & Keywords', icon: Tag },
    { key: 'promotion' as const, label: 'Promotion', icon: TrendingUp },
  ];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-primary-50 to-blue-50">
        <Sparkles className="w-5 h-5 text-primary-500" />
        <h3 className="font-bold text-gray-900">AI Seller Insights</h3>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-50 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.key ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" /> {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-4">
        {!score && !pricing && !keywords && !advice && (
          <div className="text-center py-6">
            <Lightbulb className="w-10 h-10 text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Get AI-powered insights for this listing</p>
            <button onClick={handleAnalyze} disabled={loading} className="mt-3 px-4 py-2 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : `Analyze ${tabs.find(t => t.key === activeTab)?.label}`}
            </button>
          </div>
        )}

        {/* Quality Score Result */}
        {activeTab === 'quality' && score && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${
                score.overall_score >= 80 ? 'bg-green-50' : score.overall_score >= 60 ? 'bg-amber-50' : 'bg-red-50'
              }`}>
                <span className={`text-2xl font-bold ${
                  score.overall_score >= 80 ? 'text-green-600' : score.overall_score >= 60 ? 'text-amber-600' : 'text-red-500'
                }`}>{score.overall_score}</span>
              </div>
              <div className="flex-1">
                <p className="font-bold text-gray-900">Listing Quality Score</p>
                <p className="text-xs text-gray-500">{score.estimated_impact}</p>
              </div>
              <button onClick={handleAnalyze} className="text-xs text-primary-600 hover:text-primary-700 font-medium">Refresh</button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Title', score: score.title_score },
                { label: 'Description', score: score.description_score },
                { label: 'Image', score: score.image_score },
                { label: 'Pricing', score: score.pricing_score },
                { label: 'Keywords', score: score.keyword_score },
                { label: 'Engagement', score: score.engagement_score },
                { label: 'Conversion', score: score.conversion_score },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-20">{s.label}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div className={`h-full rounded-full ${s.score >= 70 ? 'bg-green-500' : s.score >= 50 ? 'bg-amber-500' : 'bg-red-400'}`} style={{ width: `${s.score}%` }} />
                  </div>
                  <span className="text-xs font-medium text-gray-700 w-8 text-right">{s.score}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-gray-500 uppercase">Suggestions</p>
              {score.suggestions.map((s, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-gray-600">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <span>{s}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pricing Result */}
        {activeTab === 'pricing' && pricing && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-400">Min</p>
                <p className="text-lg font-bold text-gray-900">${pricing.suggested_min}</p>
              </div>
              <div className="bg-primary-50 rounded-xl p-3 text-center">
                <p className="text-xs text-primary-400">Optimal</p>
                <p className="text-lg font-bold text-primary-600">${pricing.suggested_optimal}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-400">Max</p>
                <p className="text-lg font-bold text-gray-900">${pricing.suggested_max}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-gray-500">Competitors: <strong className="text-gray-900">{pricing.competitor_count}</strong></span>
              <span className="text-gray-500">Avg Price: <strong className="text-gray-900">${pricing.avg_competitor_price}</strong></span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                pricing.demand_level === 'high' ? 'bg-green-50 text-green-600' : pricing.demand_level === 'medium' ? 'bg-amber-50 text-amber-600' : 'bg-gray-100 text-gray-500'
              }`}>{pricing.demand_level} demand</span>
            </div>
            <p className="text-sm text-gray-600 bg-blue-50 rounded-xl p-3">{pricing.recommendation}</p>
          </div>
        )}

        {/* SEO Result */}
        {activeTab === 'seo' && keywords && (
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Primary Keywords</p>
              <div className="flex flex-wrap gap-1.5">
                {keywords.primary_keywords.map(k => <span key={k} className="text-xs bg-primary-50 text-primary-700 px-2 py-1 rounded-full">{k}</span>)}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Long-Tail Keywords</p>
              <div className="flex flex-wrap gap-1.5">
                {keywords.long_tail_keywords.map(k => <span key={k} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">{k}</span>)}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Suggested Tags</p>
              <div className="flex flex-wrap gap-1.5">
                {keywords.suggested_tags.map(k => <span key={k} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">#{k}</span>)}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Search Phrases</p>
              <ul className="space-y-1">
                {keywords.search_phrases.map(p => <li key={p} className="text-xs text-gray-600 flex items-center gap-1"><Tag className="w-3 h-3 text-gray-400" /> {p}</li>)}
              </ul>
            </div>
          </div>
        )}

        {/* Promotion Result */}
        {activeTab === 'promotion' && advice && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-gray-50 rounded-xl p-3"><p className="text-xs text-gray-400">Suggested Budget</p><p className="text-lg font-bold text-gray-900">${advice.suggested_budget}</p></div>
              <div className="bg-gray-50 rounded-xl p-3"><p className="text-xs text-gray-400">Duration</p><p className="text-lg font-bold text-gray-900">{advice.suggested_duration} days</p></div>
              <div className="bg-gray-50 rounded-xl p-3"><p className="text-xs text-gray-400">Est. Reach</p><p className="text-lg font-bold text-gray-900">{advice.estimated_reach.toLocaleString()}</p></div>
              <div className="bg-gray-50 rounded-xl p-3"><p className="text-xs text-gray-400">Est. Clicks</p><p className="text-lg font-bold text-gray-900">{advice.estimated_clicks.toLocaleString()}</p></div>
              <div className="bg-gray-50 rounded-xl p-3"><p className="text-xs text-gray-400">Est. Conversions</p><p className="text-lg font-bold text-gray-900">{advice.estimated_conversions}</p></div>
              <div className="bg-gray-50 rounded-xl p-3"><p className="text-xs text-gray-400">Objective</p><p className="text-lg font-bold text-gray-900 capitalize">{advice.suggested_objective}</p></div>
            </div>
            <p className="text-sm text-gray-600 bg-primary-50 rounded-xl p-3">{advice.reasoning}</p>
          </div>
        )}

        {(score || pricing || keywords || advice) && (
          <button onClick={handleAnalyze} disabled={loading} className="mt-3 w-full py-2 text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center justify-center gap-1">
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Re-analyze
          </button>
        )}
      </div>
    </div>
  );
}
