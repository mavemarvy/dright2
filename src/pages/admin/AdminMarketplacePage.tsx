import { Link } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import {
  Store, Star, Flag, Package, TrendingUp, Save,
  Loader2, Check, X, Trash2, Plus, Eye, EyeOff, Settings2, ShieldCheck, BadgeCheck,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { RankingWeights } from '../../lib/rankingEngine';
import AdminTaxonomyManager from '../../components/admin/AdminTaxonomyManager';

interface FeaturedProduct {
  id: string;
  product_id: string;
  promotion_type: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  product_name?: string;
}

interface ModerationReport {
  id: string;
  reporter_id: string | null;
  target_type: string;
  target_id: string;
  reason: string;
  report_category: string;
  status: string;
  created_at: string;
}

interface Collection {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  icon: string;
  color: string;
  collection_type: string;
  is_active: boolean;
  is_auto_generated: boolean;
  display_order: number;
}

interface MarketplaceCategoryAdmin {
  id: string;
  name: string;
  icon: string;
  color: string;
  subcategories: string[];
  popular: boolean;
  is_visible: boolean;
  sort_order: number;
}

interface MarketplaceUiSettings {
  key: string;
  categories_section_visible: boolean;
  categories_default_collapsed: boolean;
  recommended_section_visible: boolean;
  recently_viewed_section_visible: boolean;
  continue_browsing_section_visible: boolean;
  new_arrivals_section_visible: boolean;
}

type MarketplaceDiscoveryVisibilityKey =
  | 'recommended_section_visible'
  | 'recently_viewed_section_visible'
  | 'continue_browsing_section_visible'
  | 'new_arrivals_section_visible';

type MarketplaceDiscoverySection =
  | 'recommended'
  | 'recently_viewed'
  | 'continue_browsing'
  | 'new_arrivals';

interface ListingEngineSettings {
  id: boolean;
  taxonomy_enabled: boolean;
  dynamic_forms_enabled: boolean;
  seller_commission_policy_enabled: boolean;
  legacy_fallback_enabled: boolean;
  engine_version: number;
}

interface SellerCommissionPolicyAdmin {
  id: string;
  listing_type_code: string;
  default_percentage: number;
  min_percentage: number;
  max_percentage: number;
  allow_seller_override: boolean;
  priority: number;
}

type Tab = 'featured' | 'moderation' | 'ranking' | 'categories' | 'engine' | 'collections';

const PROMOTION_TYPES = [
  { value: 'featured', label: 'Featured', color: 'bg-purple-500' },
  { value: 'sponsored', label: 'Sponsored', color: 'bg-amber-500' },
  { value: 'homepage_banner', label: 'Homepage Banner', color: 'bg-blue-500' },
  { value: 'category_spotlight', label: 'Category Spotlight', color: 'bg-teal-500' },
  { value: 'flash_deal', label: 'Flash Deal', color: 'bg-red-500' },
  { value: 'recommended', label: 'Recommended', color: 'bg-green-500' },
  { value: 'trending', label: 'Trending', color: 'bg-orange-500' },
];

export default function AdminMarketplacePage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('featured');
  const [featured, setFeatured] = useState<FeaturedProduct[]>([]);
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [weights, setWeights] = useState<RankingWeights | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedPromoType, setSelectedPromoType] = useState('featured');
  const [promoDuration, setPromoDuration] = useState(7);
  const [categories, setCategories] = useState<MarketplaceCategoryAdmin[]>([]);
  const [categorySettings, setCategorySettings] = useState<MarketplaceUiSettings>({
    key: 'default',
    categories_section_visible: true,
    categories_default_collapsed: true,
    recommended_section_visible: true,
    recently_viewed_section_visible: true,
    continue_browsing_section_visible: true,
    new_arrivals_section_visible: true,
  });
  const [canManageCategories, setCanManageCategories] = useState(false);
  const [categorySavingId, setCategorySavingId] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [engineSettings, setEngineSettings] = useState<ListingEngineSettings>({
    id: true,
    taxonomy_enabled: false,
    dynamic_forms_enabled: false,
    seller_commission_policy_enabled: false,
    legacy_fallback_enabled: true,
    engine_version: 1,
  });
  const [commissionPolicies, setCommissionPolicies] = useState<SellerCommissionPolicyAdmin[]>([]);
  const [engineSaving, setEngineSaving] = useState(false);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [engineSaved, setEngineSaved] = useState(false);

  const fetchData = useCallback(async () => {
    const [
      featRes,
      repRes,
      colRes,
      wRes,
      catRes,
      categorySettingsRes,
      categoryPermissionRes,
      engineSettingsRes,
      commissionPoliciesRes,
    ] = await Promise.all([
      supabase.from('featured_products').select('*').eq('is_active', true).order('created_at', { ascending: false }).limit(20),
      supabase.from('moderation_reports').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('marketplace_collections').select('*').order('display_order', { ascending: true }),
      supabase.from('marketplace_ranking_weights').select('*').maybeSingle(),
      supabase.from('marketplace_categories').select('*').order('sort_order', { ascending: true }),
      supabase.from('marketplace_ui_settings').select('*').eq('key', 'default').maybeSingle(),
      supabase.rpc('has_dright_permission', { p_module: 'marketplace', p_action: 'manage_categories' }),
      supabase.from('marketplace_engine_settings').select('*').eq('id', true).maybeSingle(),
      supabase
        .from('marketplace_seller_commission_policies')
        .select('id,listing_type_code,default_percentage,min_percentage,max_percentage,allow_seller_override,priority')
        .is('category_id', null)
        .eq('commission_kind', 'affiliate')
        .eq('priority', 100)
        .eq('is_active', true)
        .order('listing_type_code', { ascending: true }),
    ]);

    if (featRes.data) {
      const productIds = featRes.data.map(f => f.product_id);
      if (productIds.length > 0) {
        const { data: prods } = await supabase.from('products').select('id, name').in('id', productIds);
        const prodMap = new Map((prods || []).map(p => [p.id, p.name]));
        setFeatured(featRes.data.map(f => ({ ...f, product_name: prodMap.get(f.product_id) || 'Unknown' })));
      } else {
        setFeatured(featRes.data);
      }
    }
    if (repRes.data) setReports(repRes.data as ModerationReport[]);
    if (colRes.data) setCollections(colRes.data as Collection[]);
    if (wRes.data) setWeights(wRes.data as RankingWeights);
    if (catRes.data) setCategories(catRes.data as MarketplaceCategoryAdmin[]);
    if (categorySettingsRes.data) setCategorySettings(categorySettingsRes.data as MarketplaceUiSettings);
    if (engineSettingsRes.data) setEngineSettings(engineSettingsRes.data as ListingEngineSettings);
    if (commissionPoliciesRes.data) {
      setCommissionPolicies(
        commissionPoliciesRes.data.map(policy => ({
          ...policy,
          default_percentage: Number(policy.default_percentage),
          min_percentage: Number(policy.min_percentage),
          max_percentage: Number(policy.max_percentage),
          priority: Number(policy.priority),
        })) as SellerCommissionPolicyAdmin[]
      );
    }
    setCanManageCategories(categoryPermissionRes.data === true);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSearchProducts = async (term: string) => {
    setSearchTerm(term);
    if (term.trim().length < 2) { setSearchResults([]); return; }
    const { data } = await supabase
      .from('products')
      .select('id, name')
      .ilike('name', `%${term}%`)
      .eq('is_active', true)
      .limit(8);
    setSearchResults(data || []);
  };

  const handleAddFeatured = async () => {
    if (!selectedProductId || !user) return;
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + promoDuration);
    const { data } = await supabase
      .from('featured_products')
      .insert({
        product_id: selectedProductId,
        promotion_type: selectedPromoType,
        end_date: endDate.toISOString(),
        created_by: user.id,
      })
      .select('*')
      .single();
    if (data) {
      const { data: prod } = await supabase.from('products').select('name').eq('id', selectedProductId).maybeSingle();
      setFeatured(prev => [{ ...data, product_name: prod?.name || 'Unknown' }, ...prev]);
      setSelectedProductId('');
      setSearchTerm('');
      setSearchResults([]);
    }
  };

  const handleRemoveFeatured = async (id: string) => {
    await supabase.from('featured_products').delete().eq('id', id);
    setFeatured(prev => prev.filter(f => f.id !== id));
  };

  const handleResolveReport = async (id: string, status: string) => {
    if (!user) return;
    await supabase
      .from('moderation_reports')
      .update({ status, resolved_by: user.id, resolved_at: new Date().toISOString() })
      .eq('id', id);
    setReports(prev => prev.filter(r => r.id !== id));
    await supabase.from('moderation_audit_logs').insert({
      admin_id: user.id,
      action: `report_${status}`,
      target_type: 'moderation_report',
      target_id: id,
    });
  };

  const handleSaveWeights = async () => {
    if (!weights) return;
    setSaving(true);
    await supabase.from('marketplace_ranking_weights').update({
      relevance_weight: weights.relevance_weight,
      seller_verification_weight: weights.seller_verification_weight,
      listing_quality_weight: weights.listing_quality_weight,
      conversion_rate_weight: weights.conversion_rate_weight,
      sales_history_weight: weights.sales_history_weight,
      rating_weight: weights.rating_weight,
      freshness_weight: weights.freshness_weight,
      trending_weight: weights.trending_weight,
      updated_at: new Date().toISOString(),
    }).eq('is_singleton', true);
    setSaving(false);
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2000);
  };

  const handleToggleCollection = async (id: string, isActive: boolean) => {
    await supabase.from('marketplace_collections').update({ is_active: !isActive, updated_at: new Date().toISOString() }).eq('id', id);
    setCollections(prev => prev.map(c => c.id === id ? { ...c, is_active: !isActive } : c));
  };

  const handleAddCollection = async () => {
    const slug = `custom-${Date.now()}`;
    const { data } = await supabase.from('marketplace_collections').insert({
      slug,
      title: 'New Collection',
      collection_type: 'custom',
      is_auto_generated: false,
      display_order: collections.length,
    }).select('*').single();
    if (data) setCollections(prev => [...prev, data as Collection]);
  };

  const handleToggleCategory = async (category: MarketplaceCategoryAdmin) => {
    setCategorySavingId(category.id);
    setCategoryError(null);
    const { error } = await supabase.rpc('set_marketplace_category_visibility', {
      p_category_id: category.id,
      p_visible: !category.is_visible,
    });
    if (error) {
      setCategoryError(error.message);
    } else {
      setCategories(prev => prev.map(item =>
        item.id === category.id ? { ...item, is_visible: !item.is_visible } : item
      ));
    }
    setCategorySavingId(null);
  };

  const handleCategorySectionSettings = async (
    visible: boolean,
    defaultCollapsed: boolean,
  ) => {
    setCategorySavingId('section');
    setCategoryError(null);
    const { error } = await supabase.rpc('set_marketplace_category_section', {
      p_visible: visible,
      p_default_collapsed: defaultCollapsed,
    });
    if (error) {
      setCategoryError(error.message);
    } else {
      setCategorySettings(prev => ({
        ...prev,
        categories_section_visible: visible,
        categories_default_collapsed: defaultCollapsed,
      }));
    }
    setCategorySavingId(null);
  };

  const handleDiscoverySectionVisibility = async (
    section: MarketplaceDiscoverySection,
    key: MarketplaceDiscoveryVisibilityKey,
  ) => {
    if (!canManageCategories) return;

    const nextVisible = !categorySettings[key];
    setCategorySavingId(`discovery:${section}`);
    setCategoryError(null);

    const { error } = await supabase.rpc('set_marketplace_discovery_section_visibility', {
      p_section: section,
      p_visible: nextVisible,
    });

    if (error) {
      setCategoryError(error.message);
    } else {
      setCategorySettings(prev => ({ ...prev, [key]: nextVisible }));
    }

    setCategorySavingId(null);
  };

  const handleEngineToggle = async (
    key: 'taxonomy_enabled' | 'dynamic_forms_enabled' | 'seller_commission_policy_enabled',
  ) => {
    if (!canManageCategories) return;
    const next = { ...engineSettings, [key]: !engineSettings[key] };
    if (next[key] && !window.confirm(
      'Enable this listing-engine capability? Legacy fallback remains ON and existing DRIGHT2 financial systems stay authoritative.'
    )) return;

    setEngineSaving(true);
    setEngineError(null);
    const { error } = await supabase.rpc('admin_update_marketplace_engine_settings', {
      p_taxonomy_enabled: next.taxonomy_enabled,
      p_dynamic_forms_enabled: next.dynamic_forms_enabled,
      p_seller_commission_policy_enabled: next.seller_commission_policy_enabled,
    });

    if (error) {
      setEngineError(error.message);
    } else {
      setEngineSettings({ ...next, legacy_fallback_enabled: true });
      setEngineSaved(true);
      setTimeout(() => setEngineSaved(false), 2000);
    }
    setEngineSaving(false);
  };

  const updateCommissionPolicy = (
    id: string,
    key: 'default_percentage' | 'min_percentage' | 'max_percentage' | 'allow_seller_override',
    value: number | boolean,
  ) => {
    setCommissionPolicies(current => current.map(policy =>
      policy.id === id ? { ...policy, [key]: value } : policy
    ));
  };

  const handleSaveCommissionPolicies = async () => {
    if (!canManageCategories) return;
    for (const policy of commissionPolicies) {
      if (
        policy.min_percentage < 0
        || policy.max_percentage > 100
        || policy.min_percentage > policy.default_percentage
        || policy.default_percentage > policy.max_percentage
      ) {
        setEngineError(`${policy.listing_type_code}: require 0 ≤ min ≤ default ≤ max ≤ 100.`);
        return;
      }
    }

    setEngineSaving(true);
    setEngineError(null);
    const results = await Promise.all(commissionPolicies.map(policy =>
      supabase.rpc('admin_upsert_marketplace_seller_commission_policy', {
        p_listing_type_code: policy.listing_type_code,
        p_default_percentage: policy.default_percentage,
        p_min_percentage: policy.min_percentage,
        p_max_percentage: policy.max_percentage,
        p_allow_seller_override: policy.allow_seller_override,
      })
    ));
    const failed = results.find(result => result.error);
    if (failed?.error) {
      setEngineError(failed.error.message);
    } else {
      setEngineSaved(true);
      setTimeout(() => setEngineSaved(false), 2000);
    }
    setEngineSaving(false);
  };

  const tabs: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
    { id: 'featured', label: 'Featured & Sponsored', icon: Star },
    { id: 'moderation', label: 'Moderation Queue', icon: Flag },
    { id: 'ranking', label: 'Ranking Weights', icon: TrendingUp },
    ...(canManageCategories ? [{ id: 'categories' as const, label: 'Categories', icon: Package }] : []),
    ...(canManageCategories ? [{ id: 'engine' as const, label: 'Listing Engine', icon: Settings2 }] : []),
    { id: 'collections', label: 'Collections', icon: Package },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-warning animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-warning to-orange-600 flex items-center justify-center">
            <Store className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Marketplace Controls</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Manage promotions, moderation, ranking, categories, and collections</p>
          </div>
        </div>
        <Link
          to="/admin/dright-store"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 text-white px-4 py-2.5 text-sm font-bold shadow-sm"
        >
          <BadgeCheck className="w-4 h-4 text-emerald-400" />
          Official DRIGHT Store
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-colors whitespace-nowrap ${
              activeTab === tab.id ? 'bg-warning text-gray-900' : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-100'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Featured & Sponsored Tab */}
      {activeTab === 'featured' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="font-bold text-gray-900 mb-4">Add Promotion</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1.5">Search Product</label>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => handleSearchProducts(e.target.value)}
                  placeholder="Type product name..."
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-warning outline-none"
                />
                {searchResults.length > 0 && (
                  <div className="mt-1 border border-gray-100 rounded-xl overflow-hidden">
                    {searchResults.map(p => (
                      <button
                        key={p.id}
                        onClick={() => { setSelectedProductId(p.id); setSearchTerm(p.name); setSearchResults([]); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1.5">Promotion Type</label>
                  <select
                    value={selectedPromoType}
                    onChange={e => setSelectedPromoType(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-warning outline-none"
                  >
                    {PROMOTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1.5">Duration (days)</label>
                  <input
                    type="number"
                    value={promoDuration}
                    onChange={e => setPromoDuration(Number(e.target.value))}
                    min={1}
                    max={90}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-warning outline-none"
                  />
                </div>
              </div>
              <button
                onClick={handleAddFeatured}
                disabled={!selectedProductId}
                className="w-full py-2.5 bg-warning text-gray-900 rounded-xl font-semibold text-sm hover:bg-amber-500 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" /> Add Promotion
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="font-bold text-gray-900 mb-4">Active Promotions ({featured.length})</h2>
            {featured.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No active promotions</p>
            ) : (
              <div className="space-y-2">
                {featured.map(f => {
                  const promo = PROMOTION_TYPES.find(p => p.value === f.promotion_type);
                  return (
                    <div key={f.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                      <span className={`px-2 py-1 rounded-lg text-xs font-semibold text-white ${promo?.color || 'bg-gray-400'}`}>
                        {promo?.label || f.promotion_type}
                      </span>
                      <span className="flex-1 text-sm font-medium text-gray-700 truncate">{f.product_name}</span>
                      <span className="text-xs text-gray-400">Ends {new Date(f.end_date).toLocaleDateString()}</span>
                      <button onClick={() => handleRemoveFeatured(f.id)} className="p-1.5 text-gray-400 hover:text-error">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Moderation Tab */}
      {activeTab === 'moderation' && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="font-bold text-gray-900 mb-4">Moderation Reports ({reports.length})</h2>
          {reports.length === 0 ? (
            <div className="text-center py-8">
              <Flag className="w-10 h-10 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No pending reports</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map(r => (
                <div key={r.id} className="p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 rounded-lg text-xs font-semibold bg-error-muted text-error">{r.target_type}</span>
                        <span className="text-xs text-gray-400">{r.report_category}</span>
                        <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString()}</span>
                      </div>
                      <p className="text-sm text-gray-700">{r.reason}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => handleResolveReport(r.id, 'resolved')}
                      className="px-3 py-1.5 bg-success text-white rounded-lg text-xs font-medium hover:bg-green-600 flex items-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" /> Resolve
                    </button>
                    <button
                      onClick={() => handleResolveReport(r.id, 'dismissed')}
                      className="px-3 py-1.5 bg-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-300 flex items-center gap-1"
                    >
                      <X className="w-3.5 h-3.5" /> Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Ranking Weights Tab */}
      {activeTab === 'ranking' && weights && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-900">Adaptive Ranking Weights</h2>
            {savedMsg && <span className="text-sm text-success flex items-center gap-1"><Check className="w-4 h-4" /> Saved</span>}
          </div>
          <p className="text-sm text-gray-500 mb-4">Adjust how products are ranked in search and recommendations. Higher weight = more influence on ranking score.</p>
          <div className="space-y-4">
            {(Object.keys(weights) as Array<keyof RankingWeights>).map(key => (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-gray-600 capitalize">
                    {key.replace(/_/g, ' ').replace('weight', '')}
                  </label>
                  <span className="text-sm font-bold text-gray-900">{weights[key]}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={50}
                  step={1}
                  value={weights[key]}
                  onChange={e => setWeights(prev => prev ? { ...prev, [key]: Number(e.target.value) } : prev)}
                  className="w-full accent-warning"
                />
              </div>
            ))}
          </div>
          <button
            onClick={handleSaveWeights}
            disabled={saving}
            className="mt-6 w-full py-2.5 bg-warning text-gray-900 rounded-xl font-semibold text-sm hover:bg-amber-500 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> Save Weights</>}
          </button>
        </div>
      )}

      {/* Categories Tab */}
      {activeTab === 'categories' && canManageCategories && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-bold text-gray-900 dark:text-gray-100">Marketplace Categories</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Hide placeholder categories until DRIGHT has real listings for them. Hidden categories disappear from the public marketplace.
                </p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 whitespace-nowrap">
                {categories.filter(category => category.is_visible).length} visible
              </span>
            </div>

            {categoryError && (
              <div className="mt-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/50 p-3 text-sm text-red-700 dark:text-red-300">
                {categoryError}
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-3 mt-5">
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">Categories section</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Master visibility on the marketplace.</p>
                </div>
                <button
                  type="button"
                  disabled={categorySavingId === 'section'}
                  onClick={() => void handleCategorySectionSettings(
                    !categorySettings.categories_section_visible,
                    categorySettings.categories_default_collapsed,
                  )}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 ${
                    categorySettings.categories_section_visible
                      ? 'bg-success text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                  }`}
                >
                  {categorySettings.categories_section_visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  {categorySettings.categories_section_visible ? 'Visible' : 'Hidden'}
                </button>
              </div>

              <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">Default state</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">How categories appear when the marketplace opens.</p>
                </div>
                <button
                  type="button"
                  disabled={categorySavingId === 'section'}
                  onClick={() => void handleCategorySectionSettings(
                    categorySettings.categories_section_visible,
                    !categorySettings.categories_default_collapsed,
                  )}
                  className="px-3 py-2 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 disabled:opacity-50"
                >
                  {categorySettings.categories_default_collapsed ? 'Collapsed' : 'Expanded'}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="font-bold text-gray-900 dark:text-gray-100">Marketplace Discovery Sections</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Independently show or hide these marketplace sections for users. Other discovery sections remain unchanged.
                </p>
              </div>
              <Eye className="w-5 h-5 text-gray-400 shrink-0" />
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              {([
                ['recommended', 'recommended_section_visible', 'Recommended For You', 'Personalized recommendations based on user activity.'],
                ['recently_viewed', 'recently_viewed_section_visible', 'Recently Viewed', 'The recently viewed product row inside discovery.'],
                ['continue_browsing', 'continue_browsing_section_visible', 'Continue Browsing', 'The separate continue-browsing history section.'],
                ['new_arrivals', 'new_arrivals_section_visible', 'New Arrivals', 'Fresh listings recently published.'],
              ] as const).map(([section, key, label, description]) => {
                const visible = categorySettings[key];
                const savingKey = `discovery:${section}`;
                return (
                  <div
                    key={section}
                    className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between gap-3"
                  >
                    <div>
                      <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">{label}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
                    </div>
                    <button
                      type="button"
                      disabled={categorySavingId === savingKey}
                      onClick={() => void handleDiscoverySectionVisibility(section, key)}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 min-w-[88px] justify-center transition-colors disabled:opacity-50 ${
                        visible
                          ? 'bg-success text-white'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                      }`}
                    >
                      {categorySavingId === savingKey
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : visible
                          ? <Eye className="w-3.5 h-3.5" />
                          : <EyeOff className="w-3.5 h-3.5" />}
                      {visible ? 'Visible' : 'Hidden'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
            <div className="space-y-2">
              {categories.map(category => (
                <div
                  key={category.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-transparent dark:border-gray-700"
                >
                  <div className={`w-10 h-10 rounded-xl ${category.color} flex items-center justify-center shrink-0`}>
                    <Package className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{category.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      {category.subcategories.slice(0, 5).join(' · ')}
                      {category.subcategories.length > 5 ? ` · +${category.subcategories.length - 5}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={categorySavingId === category.id}
                    onClick={() => void handleToggleCategory(category)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 ${
                      category.is_visible
                        ? 'bg-success text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {categorySavingId === category.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : category.is_visible
                        ? <Eye className="w-3.5 h-3.5" />
                        : <EyeOff className="w-3.5 h-3.5" />}
                    {category.is_visible ? 'Visible' : 'Hidden'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Listing Engine Tab */}
      {activeTab === 'engine' && canManageCategories && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-amber-700 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-amber-900">Protected compatibility mode</p>
              <p className="text-sm text-amber-800 mt-1">
                Legacy fallback is locked ON. These switches do not replace Sales Team attribution,
                Admin Task, promotions, platform accounting, commission distribution, orders, payouts, or refunds.
              </p>
            </div>
          </div>

          {engineError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {engineError}
            </div>
          )}
          {engineSaved && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700 flex items-center gap-2">
              <Check className="w-4 h-4" /> Listing engine settings saved.
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="font-bold text-gray-900">Engine Capabilities</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Enable each capability independently after preview testing.
                </p>
              </div>
              <span className="text-xs font-semibold rounded-full bg-gray-100 text-gray-600 px-2.5 py-1">
                v{engineSettings.engine_version}
              </span>
            </div>

            <div className="space-y-3">
              {([
                ['taxonomy_enabled', 'Dynamic Taxonomy', 'Use the new listing-type/category tree in create-listing forms.'],
                ['dynamic_forms_enabled', 'Dynamic Context Fields', 'Render schema-driven fields based on listing type and category.'],
                ['seller_commission_policy_enabled', 'Seller Commission Policy', 'Apply configurable seller-facing affiliate commission limits/defaults.'],
              ] as const).map(([key, label, description]) => (
                <div key={key} className="rounded-xl border border-gray-200 p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-sm text-gray-900">{label}</p>
                    <p className="text-xs text-gray-500 mt-1">{description}</p>
                  </div>
                  <button
                    type="button"
                    disabled={engineSaving}
                    onClick={() => void handleEngineToggle(key)}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold min-w-[82px] disabled:opacity-50 ${
                      engineSettings[key]
                        ? 'bg-success text-white'
                        : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    {engineSettings[key] ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              ))}

              <div className="rounded-xl border border-green-200 bg-green-50 p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-sm text-green-900">Legacy Fallback</p>
                  <p className="text-xs text-green-700 mt-1">
                    Existing listings remain valid even without taxonomy or extension metadata.
                  </p>
                </div>
                <span className="px-3 py-2 rounded-lg text-xs font-semibold bg-green-600 text-white">
                  Locked ON
                </span>
              </div>
            </div>
          </div>

          <AdminTaxonomyManager />

          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="font-bold text-gray-900">Seller Affiliate Commission Policies</h2>
                <p className="text-sm text-gray-500 mt-1">
                  These are listing-form defaults and bounds. They do not replace authoritative payout rules.
                </p>
              </div>
              <button
                type="button"
                disabled={engineSaving}
                onClick={() => void handleSaveCommissionPolicies()}
                className="px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
              >
                {engineSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Policies
              </button>
            </div>

            <div className="space-y-3">
              {commissionPolicies.map(policy => (
                <div key={policy.id} className="rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <p className="font-semibold text-sm text-gray-900">{policy.listing_type_code}</p>
                    <label className="flex items-center gap-2 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={policy.allow_seller_override}
                        onChange={event => updateCommissionPolicy(
                          policy.id,
                          'allow_seller_override',
                          event.target.checked
                        )}
                      />
                      Seller configurable
                    </label>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <label className="block">
                      <span className="block text-xs text-gray-500 mb-1">Minimum %</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="0.5"
                        value={policy.min_percentage}
                        onChange={event => updateCommissionPolicy(policy.id, 'min_percentage', Number(event.target.value))}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block">
                      <span className="block text-xs text-gray-500 mb-1">Default %</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="0.5"
                        value={policy.default_percentage}
                        onChange={event => updateCommissionPolicy(policy.id, 'default_percentage', Number(event.target.value))}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block">
                      <span className="block text-xs text-gray-500 mb-1">Maximum %</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="0.5"
                        value={policy.max_percentage}
                        onChange={event => updateCommissionPolicy(policy.id, 'max_percentage', Number(event.target.value))}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Collections Tab */}
      {activeTab === 'collections' && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-900">Marketplace Collections</h2>
            <button
              onClick={handleAddCollection}
              className="flex items-center gap-1.5 px-3 py-2 bg-warning text-gray-900 rounded-xl text-sm font-semibold hover:bg-amber-500"
            >
              <Plus className="w-4 h-4" /> Add Collection
            </button>
          </div>
          <div className="space-y-2">
            {collections.map(c => (
              <div key={c.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <div className={`w-8 h-8 rounded-lg ${c.color} flex items-center justify-center shrink-0`}>
                  <Package className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{c.title}</p>
                  <p className="text-xs text-gray-400">{c.collection_type} · {c.is_auto_generated ? 'Auto' : 'Manual'}</p>
                </div>
                <button
                  onClick={() => handleToggleCollection(c.id, c.is_active)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    c.is_active ? 'bg-success text-white' : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {c.is_active ? 'Active' : 'Hidden'}
                </button>
              </div>
            ))}
            {collections.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">No collections configured</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
