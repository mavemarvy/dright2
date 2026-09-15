import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity, BrainCircuit, CheckCircle2, Clock3, Database, RefreshCw,
  RotateCcw, Save, Search, Shield, ShoppingBag, Sparkles, Users, Zap,
} from 'lucide-react';
import {
  DEFAULT_ALGORITHM_SETTINGS,
  fetchAlgorithmSettings,
  fetchRecommendationDiagnostics,
  fetchSemanticEngineStatus,
  processSemanticQueue,
  queueSemanticReindex,
  updateAlgorithmSettings,
  type AlgorithmSettings,
  type RecommendationDiagnostics,
  type SemanticEngineStatus,
} from '../../lib/algorithmSettings';

type NumericKey = { [K in keyof AlgorithmSettings]: AlgorithmSettings[K] extends number ? K : never }[keyof AlgorithmSettings];
interface NumericControl { key: NumericKey; label: string; description: string; min: number; max: number; step?: number; }
interface Section { title: string; description: string; icon: typeof Activity; controls: NumericControl[]; }

const controls = (rows: (string | number)[][]): NumericControl[] => rows.map(([key,label,description,min,max,step]) => ({
  key:key as NumericKey,label:String(label),description:String(description),min:Number(min),max:Number(max),step:Number(step ?? 1),
}));

const SECTIONS: Section[] = [
  {
    title: 'General / DDS', description: 'Global listing quality and demand-score controls.', icon: Activity,
    controls: controls([
      ['search_weight','Search weight','Text/search relevance contribution.',0,100],
      ['click_weight','Click / CTR weight','Qualified marketplace engagement contribution.',0,100],
      ['conversion_weight','Conversion weight','Purchase/conversion contribution.',0,100],
      ['rating_weight','Rating weight','Confidence-weighted rating contribution.',0,100],
      ['review_weight','Review weight','Review volume/recency contribution.',0,100],
      ['freshness_weight','Freshness weight','Boost for newer eligible listings.',0,100],
      ['velocity_weight','Velocity weight','Recent momentum contribution.',0,100],
      ['trust_weight','Trust weight','Seller verification and reputation contribution.',0,100],
      ['trending_threshold','Trending threshold','Score required to classify a listing as trending.',0,100],
      ['fraud_sensitivity','Fraud sensitivity','Sensitivity used by quality/fraud checks.',0,100],
      ['min_reviews_for_confidence','Reviews for confidence','Review count needed before rating confidence matures.',1,100],
      ['trending_decay_rate','Trending decay','How quickly old trending momentum decays.',0.1,1,0.05],
    ]),
  },
  {
    title: 'Social Discovery', description: 'Social Field relevance, engagement, three-graph affinity, diversity and feed delivery.', icon: Users,
    controls: controls([
      ['social_feed_batch_size','Feed batch size','Items requested per Social batch.',5,100],
      ['social_exploration_percentage','Exploration %','Share reserved for controlled discovery outside dominant interests.',0,50],
      ['social_recency_weight','Recency weight','Recency contribution.',0,100],
      ['social_watch_weight','Watch weight','Watch/dwell contribution.',0,100],
      ['social_completion_weight','Completion weight','Video completion contribution.',0,100],
      ['social_save_weight','Save weight','Save/favorite contribution.',0,100],
      ['social_share_weight','Share weight','Share contribution.',0,100],
      ['social_comment_weight','Comment weight','Comment contribution.',0,100],
      ['social_follow_weight','Follow weight','Follow conversion contribution.',0,100],
      ['social_friend_affinity','Friend affinity','Mutual/social graph affinity.',0,100],
      ['social_creator_affinity','Creator affinity','Learned creator affinity.',0,100],
      ['social_interest_weight','Interest graph weight','Behavioral category-interest contribution.',0,100],
      ['social_commerce_affinity_weight','Commerce graph weight','Commerce-intent contribution without turning Social into a catalogue.',0,50],
      ['social_trend_weight','Trend weight','Trend contribution.',0,100],
      ['social_fresh_boost','Fresh-content boost','Controlled opportunity for new content.',0,100],
      ['social_negative_penalty','Negative feedback penalty','Penalty for skip/hide/not-interested signals.',0,100],
      ['social_creator_window','Creator diversity window','Window used for creator repetition controls.',2,50],
      ['social_creator_max_per_window','Max creator posts / window','Maximum posts by one creator inside the diversity window.',1,10],
      ['social_category_window','Category diversity window','Window used for category repetition controls.',2,50],
      ['social_category_max_per_window','Max category posts / window','Maximum posts from one category inside the window.',1,20],
      ['social_qualified_view_ms','Qualified-view threshold (ms)','Minimum visible/watch time for a qualified view.',500,15000,100],
      ['social_fast_skip_ms','Fast-skip threshold (ms)','Threshold used to identify a rapid skip.',250,10000,100],
    ]),
  },
  {
    title: 'Marketplace Personalization', description: 'Canonical Marketplace V2 ranking weights. Search relevance remains dominant when a query exists.', icon: ShoppingBag,
    controls: controls([
      ['marketplace_relevance_weight','Relevance','Text/context relevance.',0,100],
      ['marketplace_seller_verification_weight','Seller verification','Verified-seller contribution.',0,100],
      ['marketplace_listing_quality_weight','Listing quality','DDS/listing quality contribution.',0,100],
      ['marketplace_conversion_rate_weight','Conversion rate','Conversion-rate contribution.',0,100],
      ['marketplace_sales_history_weight','Sales history','Bounded sales-history contribution.',0,100],
      ['marketplace_rating_weight','Ratings','Rating contribution.',0,100],
      ['marketplace_freshness_weight','Freshness','Fresh listing contribution.',0,100],
      ['marketplace_trending_weight','Trending','DDS/trending contribution.',0,100],
      ['marketplace_interest_weight','Interest graph','Category-interest affinity.',0,100],
      ['marketplace_seller_affinity_weight','Seller/social affinity','Learned seller/store affinity.',0,100],
      ['marketplace_commerce_weight','Commerce graph','Purchase/checkout/wishlist affinity.',0,100],
      ['marketplace_exploration_percentage','Exploration %','Controlled organic exploration.',0,50],
      ['marketplace_page_size','Page size','Server-ranked items returned per page.',10,60],
      ['search_personalization_weight','Search personalization','Secondary personalized reranking after query relevance.',0,30],
    ]),
  },
  {
    title: 'Jobs Discovery', description: 'Dedicated job ranking controls; job relevance remains separate from Marketplace and Social scoring.', icon: Search,
    controls: controls([
      ['jobs_page_size','Page size','Server-ranked jobs returned per page.',10,60],
      ['jobs_search_weight','Search relevance','Direct job-query relevance.',0,100],
      ['jobs_category_affinity_weight','Category affinity','Learned job/category interest.',0,100],
      ['jobs_skills_weight','Skills match','Skill/requirement match contribution.',0,100],
      ['jobs_location_weight','Location relevance','Configured location/context contribution.',0,100],
      ['jobs_application_history_weight','Application history','Application-intent contribution.',0,100],
      ['jobs_employer_affinity_weight','Employer affinity','Learned employer interaction contribution.',0,100],
      ['jobs_freshness_weight','Freshness','Fresh job contribution.',0,100],
      ['jobs_exploration_percentage','Exploration %','Controlled opportunity for relevant jobs outside dominant history.',0,50],
    ]),
  },
  {
    title: 'Communities Discovery', description: 'Community recommendation controls built on interests, social graph activity, growth and freshness.', icon: Users,
    controls: controls([
      ['communities_interest_weight','Interest graph','Topic/category affinity contribution.',0,100],
      ['communities_friend_weight','Social graph','Friend/follow relationship contribution.',0,100],
      ['communities_activity_weight','Activity','Recent healthy community activity contribution.',0,100],
      ['communities_growth_weight','Growth','Bounded membership/engagement momentum contribution.',0,100],
      ['communities_freshness_weight','Freshness','Fresh-community/content contribution.',0,100],
      ['communities_exploration_percentage','Exploration %','Controlled discovery outside dominant interests.',0,50],
    ]),
  },
  {
    title: 'Interest Learning', description: 'Server-side behavioral learning weights and decay. Clients cannot directly award themselves affinity.', icon: BrainCircuit,
    controls: controls([
      ['interest_half_life_days','Interest half-life (days)','Recency decay for learned interests.',1,365],
      ['interest_score_cap','Score cap','Maximum normalized interest magnitude.',10,500],
      ['interest_search_weight','Search signal','Search-category signal.',0,50],
      ['interest_view_weight','View signal','Qualified view signal.',0,50],
      ['interest_dwell_weight','Dwell signal','Long-dwell signal.',0,50],
      ['interest_completion_weight','Completion signal','Watch completion signal.',0,50],
      ['interest_reaction_weight','Reaction signal','Reaction signal.',0,50],
      ['interest_comment_weight','Comment signal','Comment signal.',0,50],
      ['interest_save_weight','Save signal','Save/favorite signal.',0,50],
      ['interest_share_weight','Share signal','Share signal.',0,50],
      ['interest_follow_weight','Follow signal','Creator follow signal.',0,50],
      ['interest_profile_visit_weight','Profile visit','Creator/profile visit signal.',0,50],
      ['interest_wishlist_weight','Wishlist','Commerce intent from wishlist.',0,50],
      ['interest_checkout_weight','Checkout','Strong commerce intent from checkout.',0,50],
      ['interest_purchase_weight','Purchase','Strongest commerce signal.',0,100],
      ['interest_skip_penalty','Skip penalty','Small negative signal for fast skips.',0,50],
      ['interest_hide_penalty','Hide penalty','Negative signal for explicit hide.',0,100],
      ['interest_not_interested_penalty','Not interested penalty','Strong explicit negative-interest signal.',0,100],
      ['interest_block_penalty','Block penalty','Strong account/creator suppression signal.',0,100],
      ['interest_recompute_window_days','Recompute window (days)','Maximum raw-history window for recomputation.',7,730],
      ['interest_top_category_limit','Top-category limit','Number of strongest category interests retained.',3,50],
    ]),
  },
  {
    title: 'Semantic Intelligence', description: 'Optional pgvector layer. Behavioral ranking remains the fallback and core system.', icon: Sparkles,
    controls: controls([
      ['semantic_similarity_weight','General semantic weight','Global similarity contribution.',0,100],
      ['semantic_min_similarity','Minimum similarity','Minimum cosine similarity accepted.',0,1,0.01],
      ['semantic_candidate_limit','Candidate limit','Maximum vector candidates requested.',5,200],
      ['semantic_cold_start_weight','Cold-start semantic weight','Semantic contribution when behavior is sparse.',0,100],
      ['semantic_search_weight','Semantic search weight','Intent-rich search contribution.',0,100],
      ['semantic_marketplace_weight','Marketplace semantic weight','Marketplace hybrid-ranking contribution.',0,100],
      ['semantic_social_weight','Social semantic weight','Social hybrid-ranking contribution.',0,100],
      ['semantic_jobs_weight','Jobs semantic weight','Job-intent semantic contribution.',0,100],
      ['semantic_services_weight','Services semantic weight','Service semantic contribution.',0,100],
      ['semantic_courses_weight','Courses semantic weight','Learning/course semantic contribution.',0,100],
      ['semantic_communities_weight','Communities semantic weight','Community topic-similarity contribution.',0,100],
      ['semantic_promotion_weight','Promotion semantic weight','Secondary ad relevance signal.',0,50],
      ['semantic_rollout_percentage','Rollout %','Foundation for controlled semantic rollout.',0,100],
      ['embedding_daily_request_limit','Daily embedding requests','Cost-control request ceiling.',0,100000],
      ['embedding_monthly_request_limit','Monthly embedding requests','Monthly cost-control ceiling.',0,1000000],
      ['embedding_estimated_cost_per_million_tokens','Estimated cost / 1M tokens','Owner-configured estimate used for observability only.',0,100,0.01],
    ]),
  },
  {
    title: 'Promotion Relevance', description: 'Sponsored delivery remains separate from organic ranking and uses its existing eligibility/auction path.', icon: Zap,
    controls: controls([
      ['promotion_interest_weight','Behavioral interest weight','Interest relevance contribution for eligible campaigns.',0,100],
      ['promotion_min_relevance','Minimum relevance','Campaign relevance floor before delivery.',0,1,0.01],
    ]),
  },
];

function StatusPill({ ok, label }: { ok: boolean | undefined; label: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${ok ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
    {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}{label}
  </span>;
}

export default function AdminAlgorithmPage() {
  const [settings, setSettings] = useState<AlgorithmSettings>(DEFAULT_ALGORITHM_SETTINGS);
  const [diagnostics, setDiagnostics] = useState<RecommendationDiagnostics>({});
  const [semantic, setSemantic] = useState<SemanticEngineStatus>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [semanticBusy, setSemanticBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [nextSettings, nextDiagnostics, nextSemantic] = await Promise.all([
        fetchAlgorithmSettings(), fetchRecommendationDiagnostics(), fetchSemanticEngineStatus(),
      ]);
      setSettings(nextSettings); setDiagnostics(nextDiagnostics); setSemantic(nextSemantic);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load algorithm configuration');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const updateNumber = (key: NumericKey, value: number) => setSettings(prev => ({ ...prev, [key]: value }));
  const semanticProviderSummary = useMemo(() => `${settings.semantic_provider} · ${settings.semantic_embedding_model} · ${settings.semantic_embedding_dimensions}D`, [settings]);

  const save = async () => {
    setSaving(true); setMessage(null);
    try { await updateAlgorithmSettings(settings); setMessage('Algorithm settings saved.'); await reload(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to save algorithm settings'); }
    finally { setSaving(false); }
  };

  const reindex = async (status?: 'failed' | 'stale') => {
    setSemanticBusy(true); setMessage(null);
    try { const count = await queueSemanticReindex(undefined, status); setMessage(`${count} semantic entities queued.`); await reload(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to queue semantic reindex'); }
    finally { setSemanticBusy(false); }
  };

  const processQueue = async () => {
    setSemanticBusy(true); setMessage(null);
    try {
      const result = await processSemanticQueue(20);
      setMessage(result.paused ? 'Embedding generation is paused. Enable it before processing.' : `Processed ${result.processed}: ${result.ready} ready, ${result.failed} failed.`);
      await reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to process embedding queue'); }
    finally { setSemanticBusy(false); }
  };

  if (loading) return <div className="flex justify-center py-24"><div className="h-9 w-9 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" /></div>;

  return <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-8">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2"><Database className="h-6 w-6 text-primary-500" /><h1 className="text-2xl font-bold text-gray-900 dark:text-white">Algorithm Configuration</h1></div>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Canonical source: <strong>{diagnostics.canonical_source || 'algorithm_settings'}</strong>. Interest, social, commerce, jobs, communities, Marketplace and promotions keep surface-specific weights.</p>
      </div>
      <button onClick={() => void reload()} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-gray-200 px-4 text-sm dark:border-gray-700"><RefreshCw className="h-4 w-4" />Refresh</button>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"><div className="text-xs text-gray-500">Algorithm</div><div className="mt-1 text-xl font-bold">v{diagnostics.algorithm_version || 4}</div></div>
      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"><div className="text-xs text-gray-500">Interest profiles</div><div className="mt-1 text-xl font-bold">{diagnostics.interest_profiles_total ?? 0}</div><div className="text-xs text-gray-500">{diagnostics.interest_profiles_pending ?? 0} pending</div></div>
      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"><div className="text-xs text-gray-500">Listing intelligence</div><div className="mt-1 text-xl font-bold">{diagnostics.listing_scores_count ?? 0}</div><div className="text-xs text-gray-500">{diagnostics.listing_intelligence_pending ?? 0} pending</div></div>
      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"><div className="text-xs text-gray-500">Semantic index</div><div className="mt-1 text-xl font-bold">{semantic.indexed_entities ?? diagnostics.semantic_indexed ?? 0}</div><div className="text-xs text-gray-500">{semantic.stale_embeddings ?? diagnostics.semantic_stale ?? 0} stale</div></div>
    </div>

    <div className="flex flex-wrap gap-2">
      <StatusPill ok={diagnostics.social_feed_v2} label="Social V2" />
      <StatusPill ok={diagnostics.marketplace_feed_v2} label="Marketplace V2" />
      <StatusPill ok={diagnostics.jobs_feed_v2} label="Jobs V2" />
      <StatusPill ok={diagnostics.promotion_delivery_v2} label="Promotion V2" />
      <StatusPill ok={diagnostics.interest_cron_active} label="Interest cron" />
      <StatusPill ok={diagnostics.listing_intelligence_cron_active} label="Listing intelligence" />
      <StatusPill ok={diagnostics.storage_cron_active} label="Storage monitor" />
      <StatusPill ok={semantic.pgvector_available ?? diagnostics.pgvector_available} label="pgvector" />
    </div>

    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div><div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-indigo-500" /><h2 className="font-bold">Semantic Intelligence</h2></div><p className="mt-1 text-sm text-gray-500">Optional enhancement. Turning this off immediately restores behavioral-only ranking without a deployment.</p></div>
        <div className="text-right text-xs text-gray-500"><div>{semanticProviderSummary}</div><div>{semantic.pgvector_available ? 'pgvector available' : 'pgvector unavailable'}</div></div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="flex items-center justify-between rounded-xl bg-white p-4 dark:bg-gray-900"><div><div className="font-semibold">Semantic recommendation delivery</div><div className="text-xs text-gray-500">Kill switch for vector contribution to user-facing discovery.</div></div><input type="checkbox" checked={settings.semantic_recommendations_enabled} onChange={e => setSettings(p => ({ ...p, semantic_recommendations_enabled:e.target.checked }))} className="h-5 w-5 accent-indigo-600" /></label>
        <label className="flex items-center justify-between rounded-xl bg-white p-4 dark:bg-gray-900"><div><div className="font-semibold">Embedding generation</div><div className="text-xs text-gray-500">Independent cost-control switch for creating/updating vectors.</div></div><input type="checkbox" checked={settings.embedding_generation_enabled} onChange={e => setSettings(p => ({ ...p, embedding_generation_enabled:e.target.checked }))} className="h-5 w-5 accent-indigo-600" /></label>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
        <div><span className="text-gray-500">Indexed</span><div className="font-bold">{semantic.indexed_entities ?? 0}</div></div>
        <div><span className="text-gray-500">Pending</span><div className="font-bold">{semantic.pending_embeddings ?? 0}</div></div>
        <div><span className="text-gray-500">Failed</span><div className="font-bold">{semantic.failed_embeddings ?? 0}</div></div>
        <div><span className="text-gray-500">Stale</span><div className="font-bold">{semantic.stale_embeddings ?? 0}</div></div>
        <div><span className="text-gray-500">Generated today</span><div className="font-bold">{semantic.generated_today ?? 0}</div></div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button disabled={semanticBusy} onClick={() => void reindex('failed')} className="rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-gray-700">Reindex failed</button>
        <button disabled={semanticBusy} onClick={() => void reindex('stale')} className="rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-gray-700">Reindex stale</button>
        <button disabled={semanticBusy} onClick={() => void processQueue()} className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white">Process next 20</button>
      </div>
    </motion.section>

    {SECTIONS.map(section => <motion.section key={section.title} initial={{ opacity:0,y:8 }} animate={{ opacity:1,y:0 }} className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4 flex items-start gap-3"><section.icon className="mt-0.5 h-5 w-5 text-primary-500" /><div><h2 className="font-bold text-gray-900 dark:text-white">{section.title}</h2><p className="text-xs text-gray-500">{section.description}</p></div></div>
      <div className="grid gap-4 md:grid-cols-2">
        {section.controls.map(control => <label key={control.key} className="rounded-xl border border-gray-100 p-3 dark:border-gray-700">
          <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{control.label}</span><input type="number" min={control.min} max={control.max} step={control.step ?? 1} value={settings[control.key]} onChange={e => updateNumber(control.key, Number(e.target.value))} className="w-24 rounded-lg border border-gray-200 bg-transparent px-2 py-1.5 text-right text-sm dark:border-gray-600" /></div>
          <p className="mt-1 text-[11px] text-gray-500">{control.description}</p>
          <input type="range" min={control.min} max={control.max} step={control.step ?? 1} value={settings[control.key]} onChange={e => updateNumber(control.key, Number(e.target.value))} className="mt-2 w-full accent-primary-600" />
        </label>)}
      </div>
    </motion.section>)}

    {message && <div className="rounded-xl bg-primary-500/10 px-4 py-3 text-sm text-primary-600 dark:text-primary-300">{message}</div>}
    <div className="sticky bottom-4 flex flex-wrap gap-3 rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-lg backdrop-blur dark:border-gray-700 dark:bg-gray-900/95">
      <button onClick={() => void save()} disabled={saving} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-primary-600 px-5 font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save settings'}</button>
      <button onClick={() => setSettings(DEFAULT_ALGORITHM_SETTINGS)} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-gray-100 px-4 dark:bg-gray-800"><RotateCcw className="h-4 w-4" />Reset form defaults</button>
      <div className="ml-auto hidden items-center gap-2 text-xs text-gray-500 md:flex"><Shield className="h-4 w-4" />Server/RLS validation remains authoritative<Search className="ml-2 h-4 w-4" /></div>
    </div>
  </div>;
}