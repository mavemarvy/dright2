import { useState, useEffect } from 'react';
import {
  Sparkles, Loader2, TrendingUp, FileText, AlertTriangle,
  Brain, RefreshCw, Download, Zap, Clock, BarChart3, Activity,
  CheckCircle, XCircle,
} from 'lucide-react';
import { useForecast, useMarketplaceReport, useFraudAnalysis } from '../../lib/aiHooks';
import { useAuth } from '../../contexts/AuthContext';
import { useExecutiveKPIs } from '../../lib/adminIntelligenceHooks';
import { getUsageStats } from '../../lib/aiProvider';
import { getAIUsageStats, checkAllProvidersHealth, checkAIHealth, checkGeminiHealth, testGemini, type AIHealthResponse } from '../../lib/groqService';
import { supabase } from '../../lib/supabase';

export default function AdminAIPage() {
  const { user } = useAuth();
  const { kpis } = useExecutiveKPIs();
  const { forecast, loading: fLoading, generate: genForecast } = useForecast();
  const { report, loading: rLoading, generate: genReport } = useMarketplaceReport();
  const { analysis, loading: frLoading, analyze: analyzeFraud } = useFraudAnalysis();
  const usage = getUsageStats();
  const [forecastTarget, setForecastTarget] = useState('Digital Services');
  const [reportType, setReportType] = useState('daily_summary');

  // Groq AI analytics
  const [groqStats, setGroqStats] = useState<ReturnType<typeof getAIUsageStats> extends Promise<infer T> ? T : never>(null as any);
  const [groqHealth, setGroqHealth] = useState<{ success: boolean; provider: string; configured: boolean; model?: string } | null>(null);
  const [allHealth, setAllHealth] = useState<AIHealthResponse | null>(null);
  const [geminiHealth, setGeminiHealth] = useState<{ success: boolean; provider: string; configured: boolean; model?: string; error?: string } | null>(null);
  const [openaiHealth, setOpenaiHealth] = useState<{ success: boolean; provider: string; configured: boolean; model?: string; error?: string } | null>(null);
  const [aiMetrics, setAiMetrics] = useState<any>(null);
  const [geminiTestResult, setGeminiTestResult] = useState<string | null>(null);
  const [groqLoading, setGroqLoading] = useState(false);
  const [geminiTesting, setGeminiTesting] = useState(false);

  const loadGroqStats = async () => {
    setGroqLoading(true);
    const [stats, health, allH, gemH] = await Promise.all([getAIUsageStats(7), checkAIHealth(), checkAllProvidersHealth(), checkGeminiHealth()]);
    setGroqStats(stats);
    setGroqHealth(health);
    setAllHealth(allH);
    setGeminiHealth(gemH);

    // Fetch extended metrics from ai-health endpoint
    try {
      const { data: healthData } = await supabase.functions.invoke('ai-health', { method: 'GET' });
      if (healthData) {
        setAiMetrics(healthData);
        if (healthData.providers?.openai) {
          setOpenaiHealth({
            success: healthData.providers.openai.configured,
            provider: healthData.providers.openai.provider,
            configured: healthData.providers.openai.configured,
            model: healthData.providers.openai.model,
          });
        }
      }
    } catch (err) {
      console.error('Failed to fetch AI metrics:', err);
    }

    setGroqLoading(false);
  };

  useEffect(() => { loadGroqStats(); }, []);

  const handleGeminiTest = async () => {
    setGeminiTesting(true);
    const res = await testGemini(user?.id);
    setGeminiTestResult(res.success ? res.content : `Error: ${res.error}`);
    setGeminiTesting(false);
  };

  const insights = generateAdminInsights(kpis);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center">
          <Brain className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">AI Admin Assistant</h1>
          <p className="text-sm text-gray-500">Intelligent insights and marketplace forecasting</p>
        </div>
      </div>

      {/* AI Insights */}
      <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl border border-purple-100 p-6 mb-6">
        <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2"><Sparkles className="w-5 h-5 text-purple-500" /> AI Insights</h3>
        <div className="space-y-2">
          {insights.map((insight, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-gray-700">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                insight.type === 'warning' ? 'bg-amber-100' : insight.type === 'alert' ? 'bg-red-100' : 'bg-green-100'
              }`}>
                {insight.type === 'warning' ? <AlertTriangle className="w-3 h-3 text-amber-600" /> :
                 insight.type === 'alert' ? <AlertTriangle className="w-3 h-3 text-red-500" /> :
                 <TrendingUp className="w-3 h-3 text-green-600" />}
              </div>
              <span>{insight.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Forecasting */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
        <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-primary-500" /> Marketplace Forecasting</h3>
        <div className="flex items-center gap-2 mb-4">
          <input type="text" value={forecastTarget} onChange={e => setForecastTarget(e.target.value)} placeholder="Category or search term" className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary-500" />
          <select value={forecastTarget.includes(' ') ? 'search_trend' : 'category_growth'} onChange={e => setForecastTarget(e.target.value === 'category_growth' ? 'Digital Services' : 'video editing')} className="px-3 py-2 rounded-xl border border-gray-200 text-sm">
            <option value="category_growth">Category Growth</option>
            <option value="search_trend">Search Trend</option>
          </select>
          <button onClick={() => genForecast(forecastTarget.includes(' ') ? 'search_trend' : 'category_growth', forecastTarget)} disabled={fLoading} className="px-4 py-2 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors flex items-center gap-1">
            {fLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Forecast
          </button>
        </div>
        {forecast && (
          <div className="bg-primary-50 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                forecast.prediction.trend === 'growing' ? 'bg-green-100 text-green-700' :
                forecast.prediction.trend === 'declining' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'
              }`}>{forecast.prediction.trend}</span>
              <span className="text-sm font-bold text-gray-900">{Math.abs(forecast.prediction.growth_rate).toFixed(0)}% {forecast.prediction.growth_rate > 0 ? 'growth' : 'decline'}</span>
              <span className="text-xs text-gray-400">Confidence: {forecast.prediction.confidence.toFixed(0)}%</span>
            </div>
            <p className="text-sm text-gray-600">{forecast.prediction.description}</p>
            <p className="text-xs text-gray-400 mt-2">This is an estimate based on marketplace data. Actual results may vary.</p>
          </div>
        )}
      </div>

      {/* Reports */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900 flex items-center gap-2"><FileText className="w-5 h-5 text-blue-500" /> Marketplace Reports</h3>
          <button className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"><Download className="w-3 h-3" /> Export</button>
        </div>
        <div className="flex items-center gap-2 mb-4">
          <select value={reportType} onChange={e => setReportType(e.target.value)} className="px-3 py-2 rounded-xl border border-gray-200 text-sm">
            <option value="daily_summary">Daily Summary</option>
            <option value="weekly_trends">Weekly Trends</option>
            <option value="monthly_growth">Monthly Growth</option>
          </select>
          <button onClick={() => genReport(reportType)} disabled={rLoading} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-1">
            {rLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Generate
          </button>
        </div>
        {report && (
          <div className="bg-blue-50 rounded-xl p-4">
            <p className="font-bold text-gray-900 text-sm">{report.title}</p>
            <p className="text-sm text-gray-600 mt-1">{report.summary}</p>
          </div>
        )}
      </div>

      {/* Fraud Analysis */}
      {user && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
          <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-500" /> Fraud Intelligence</h3>
          <button onClick={() => analyzeFraud(user.id)} disabled={frLoading} className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center gap-1">
            {frLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />} Analyze Risk
          </button>
          {analysis && (
            <div className="mt-3">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${analysis.risk_score >= 50 ? 'bg-red-50' : analysis.risk_score >= 25 ? 'bg-amber-50' : 'bg-green-50'}`}>
                  <span className={`text-lg font-bold ${analysis.risk_score >= 50 ? 'text-red-500' : analysis.risk_score >= 25 ? 'text-amber-600' : 'text-green-600'}`}>{analysis.risk_score}</span>
                </div>
                <div>
                  <p className="font-medium text-gray-900">Risk Score: {analysis.risk_score}/100</p>
                  <p className="text-xs text-gray-400">{analysis.factors.length} risk factor(s) detected</p>
                </div>
              </div>
              {analysis.factors.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {analysis.factors.map((f, i) => <li key={i} className="text-xs text-gray-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-amber-500" /> {f}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* AI Usage Stats */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><Brain className="w-5 h-5 text-gray-400" /> AI Usage</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center"><p className="text-2xl font-bold text-gray-900">{usage.totalRequests}</p><p className="text-xs text-gray-400">Total Requests</p></div>
          <div className="text-center"><p className="text-2xl font-bold text-gray-900">{usage.totalTokens.toLocaleString()}</p><p className="text-xs text-gray-400">Tokens Used</p></div>
          <div className="text-center"><p className="text-2xl font-bold text-gray-900">${usage.estimatedCost.toFixed(4)}</p><p className="text-xs text-gray-400">Est. Cost</p></div>
        </div>
      </div>

      {/* AI Provider Manager — Provider Status Cards */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
        <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><Brain className="w-5 h-5 text-gray-400" /> AI Provider Status</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Groq */}
          <div className={`rounded-xl border p-4 ${groqHealth?.configured ? 'border-orange-200 bg-orange-50/50' : 'border-gray-200 bg-gray-50'}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-orange-500" />
                <span className="font-semibold text-gray-900">Groq</span>
                <span className="px-1.5 py-0.5 text-xs bg-orange-100 text-orange-700 rounded-full">Primary</span>
              </div>
              {groqHealth?.configured
                ? <CheckCircle className="w-5 h-5 text-green-500" />
                : <XCircle className="w-5 h-5 text-red-400" />}
            </div>
            <p className="text-xs text-gray-500">Model: {groqHealth?.model || 'llama-3.3-70b'}</p>
            {aiMetrics?.providers?.groq && (
              <div className="mt-2 space-y-1 text-xs text-gray-400">
                <p>{aiMetrics.providers.groq.requests} requests · {aiMetrics.providers.groq.tokens.toLocaleString()} tokens</p>
                <p>Avg latency: {aiMetrics.providers.groq.avgLatencyMs}ms</p>
                {aiMetrics.providers.groq.errors > 0 && (
                  <p className="text-red-500">{aiMetrics.providers.groq.errors} errors</p>
                )}
              </div>
            )}
            {!groqHealth?.configured && <p className="text-xs text-red-400 mt-1">Set GROQ_API_KEY in edge function secrets</p>}
          </div>

          {/* Gemini */}
          <div className={`rounded-xl border p-4 ${geminiHealth?.configured ? 'border-blue-200 bg-blue-50/50' : 'border-gray-200 bg-gray-50'}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-500" />
                <span className="font-semibold text-gray-900">Google Gemini</span>
                <span className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">Fallback 1</span>
              </div>
              {geminiHealth?.configured
                ? <CheckCircle className="w-5 h-5 text-green-500" />
                : <XCircle className="w-5 h-5 text-red-400" />}
            </div>
            <p className="text-xs text-gray-500">Model: {geminiHealth?.model || 'gemini-2.0-flash-lite'}</p>
            {aiMetrics?.providers?.gemini && (
              <div className="mt-2 space-y-1 text-xs text-gray-400">
                <p>{aiMetrics.providers.gemini.requests} requests · {aiMetrics.providers.gemini.tokens.toLocaleString()} tokens</p>
                <p>Avg latency: {aiMetrics.providers.gemini.avgLatencyMs}ms</p>
                {aiMetrics.providers.gemini.errors > 0 && (
                  <p className="text-red-500">{aiMetrics.providers.gemini.errors} errors</p>
                )}
              </div>
            )}
            {!geminiHealth?.configured && <p className="text-xs text-red-400 mt-1">Set GEMINI_API_KEY in edge function secrets</p>}
            {geminiHealth?.configured && (
              <button onClick={handleGeminiTest} disabled={geminiTesting} className="mt-2 text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
                {geminiTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} Test Gemini
              </button>
            )}
            {geminiTestResult && <p className="text-xs text-gray-600 mt-1 truncate">{geminiTestResult}</p>}
          </div>

          {/* OpenAI */}
          <div className={`rounded-xl border p-4 ${openaiHealth?.configured ? 'border-green-200 bg-green-50/50' : 'border-gray-200 bg-gray-50'}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-green-600" />
                <span className="font-semibold text-gray-900">OpenAI</span>
                <span className="px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">Fallback 2</span>
              </div>
              {openaiHealth?.configured
                ? <CheckCircle className="w-5 h-5 text-green-500" />
                : <XCircle className="w-5 h-5 text-red-400" />}
            </div>
            <p className="text-xs text-gray-500">Model: {openaiHealth?.model || 'gpt-4o-mini'}</p>
            {aiMetrics?.providers?.openai && (
              <div className="mt-2 space-y-1 text-xs text-gray-400">
                <p>{aiMetrics.providers.openai.requests} requests · {aiMetrics.providers.openai.tokens.toLocaleString()} tokens</p>
                <p>Avg latency: {aiMetrics.providers.openai.avgLatencyMs}ms</p>
                {aiMetrics.providers.openai.errors > 0 && (
                  <p className="text-red-500">{aiMetrics.providers.openai.errors} errors</p>
                )}
              </div>
            )}
            {!openaiHealth?.configured && <p className="text-xs text-red-400 mt-1">Set OPENAI_API_KEY in edge function secrets</p>}
          </div>
        </div>

        {/* Provider Manager Status */}
        {allHealth && (
          <div className="mt-4 flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> Primary: {allHealth.primary}</span>
            <span className="flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Fallback: {allHealth.fallback}</span>
            <span className={`flex items-center gap-1 ${allHealth.any_available ? 'text-green-600' : 'text-red-500'}`}>
              {allHealth.any_available ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
              {allHealth.any_available ? 'At least one provider available' : 'No providers available'}
            </span>
          </div>
        )}
      </div>

      {/* Groq AI Analytics */}
      <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-2xl border border-orange-100 p-6 mt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900 flex items-center gap-2"><Zap className="w-5 h-5 text-orange-500" /> Groq AI Analytics</h3>
          <button onClick={loadGroqStats} disabled={groqLoading} className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
            <RefreshCw className={`w-4 h-4 ${groqLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Health Status */}
        {groqHealth && (
          <div className="flex items-center gap-2 mb-4">
            <span className={`w-2 h-2 rounded-full ${groqHealth.configured ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-xs text-gray-600">{groqHealth.configured ? `Connected · Model: ${groqHealth.model || 'llama-3.3-70b'}` : 'Not configured — set GROQ_API_KEY in edge function secrets'}</span>
          </div>
        )}

        {/* Stats Grid */}
        {groqStats && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="bg-white/60 rounded-xl p-3">
                <Activity className="w-4 h-4 text-orange-500 mb-1" />
                <p className="text-xl font-bold text-gray-900">{groqStats.totalRequests}</p>
                <p className="text-xs text-gray-500">Requests (7d)</p>
              </div>
              <div className="bg-white/60 rounded-xl p-3">
                <Zap className="w-4 h-4 text-amber-500 mb-1" />
                <p className="text-xl font-bold text-gray-900">{groqStats.totalTokens.toLocaleString()}</p>
                <p className="text-xs text-gray-500">Tokens Used</p>
              </div>
              <div className="bg-white/60 rounded-xl p-3">
                <Clock className="w-4 h-4 text-blue-500 mb-1" />
                <p className="text-xl font-bold text-gray-900">{groqStats.avgLatency}ms</p>
                <p className="text-xs text-gray-500">Avg Response</p>
              </div>
              <div className="bg-white/60 rounded-xl p-3">
                <AlertTriangle className="w-4 h-4 text-red-500 mb-1" />
                <p className="text-xl font-bold text-gray-900">{groqStats.errors}</p>
                <p className="text-xs text-gray-500">Errors</p>
              </div>
            </div>

            {/* Feature Breakdown */}
            {Object.keys(groqStats.byFeature).length > 0 && (
              <div className="bg-white/60 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1"><BarChart3 className="w-3 h-3" /> Most Used Features</p>
                <div className="space-y-2">
                  {Object.entries(groqStats.byFeature)
                    .sort((a, b) => b[1].requests - a[1].requests)
                    .map(([feature, stats]) => (
                      <div key={feature} className="flex items-center gap-2">
                        <span className="text-xs text-gray-600 capitalize w-32 truncate">{feature.replace(/-/g, ' ')}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-orange-400 to-amber-400 rounded-full"
                            style={{ width: `${Math.min(100, (stats.requests / groqStats.totalRequests) * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-400 w-16 text-right">{stats.requests} req</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Expanded Analytics: Cache & Fallback */}
            {aiMetrics?.metrics && (
              <div className="bg-white/60 rounded-xl p-4 mt-3">
                <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1"><Activity className="w-3 h-3" /> Cache & Performance</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <p className="text-lg font-bold text-green-600">{aiMetrics.metrics.cacheHitRate?.toFixed(1) || '0'}%</p>
                    <p className="text-xs text-gray-400">Cache Hit Rate</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-amber-600">{aiMetrics.metrics.fallbackRate?.toFixed(1) || '0'}%</p>
                    <p className="text-xs text-gray-400">Fallback Rate</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-blue-600">{aiMetrics.metrics.activeUsers || 0}</p>
                    <p className="text-xs text-gray-400">Active Users</p>
                  </div>
                </div>
              </div>
            )}

            {/* Popular Prompts */}
            {aiMetrics?.metrics?.byFeature && aiMetrics.metrics.byFeature.length > 0 && (
              <div className="bg-white/60 rounded-xl p-4 mt-3">
                <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Feature Usage Breakdown</p>
                <div className="space-y-1.5">
                  {aiMetrics.metrics.byFeature.slice(0, 6).map((f: { feature: string; requests: number; tokens: number }) => (
                    <div key={f.feature} className="flex items-center justify-between text-xs">
                      <span className="text-gray-600 capitalize">{f.feature.replace(/-/g, ' ')}</span>
                      <span className="text-gray-400">{f.requests} req · {f.tokens.toLocaleString()} tokens</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {groqStats.totalRequests === 0 && (
              <p className="text-sm text-gray-400 text-center py-3">No AI requests in the last 7 days. Try the AI Assistant to see analytics here.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function generateAdminInsights(kpis: ReturnType<typeof useExecutiveKPIs>['kpis']): { type: 'good' | 'warning' | 'alert'; text: string }[] {
  if (!kpis) return [{ type: 'good', text: 'Loading marketplace data...' }];
  const insights: { type: 'good' | 'warning' | 'alert'; text: string }[] = [];

  if (kpis.pending_listings > 5) insights.push({ type: 'warning', text: `${kpis.pending_listings} listings need moderation review — high queue may delay seller onboarding` });
  if (kpis.pending_verifications > 3) insights.push({ type: 'warning', text: `${kpis.pending_verifications} seller verification requests pending — process to maintain trust` });
  if (kpis.pending_withdrawals > 0) insights.push({ type: 'alert', text: `${kpis.pending_withdrawals} withdrawal requests need processing` });
  if (kpis.new_users_today > 0) insights.push({ type: 'good', text: `${kpis.new_users_today} new users registered today — ${kpis.active_users_today} total active users` });
  if (kpis.total_revenue > 0) insights.push({ type: 'good', text: `Marketplace revenue: $${kpis.total_revenue.toFixed(2)} total, $${kpis.promotion_revenue.toFixed(2)} from promotions` });
  if (kpis.total_wishlist > 0) insights.push({ type: 'good', text: `${kpis.total_wishlist} items wishlisted — indicates active buyer interest` });
  if (kpis.avg_rating > 0) insights.push({ type: kpis.avg_rating >= 4 ? 'good' : 'warning', text: `Average marketplace rating: ${kpis.avg_rating.toFixed(1)}/5 from ${kpis.total_reviews} reviews` });
  if (kpis.total_page_views > 100) insights.push({ type: 'good', text: `${kpis.total_page_views} total page views — healthy marketplace traffic` });
  if (insights.length === 0) insights.push({ type: 'good', text: 'Marketplace is operating normally. No urgent actions needed.' });

  return insights;
}
