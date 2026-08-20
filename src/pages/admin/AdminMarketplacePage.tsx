import { useState, useEffect, useCallback } from 'react';
import {
  Store, Star, Flag, Package, TrendingUp, Save,
  Loader2, Check, X, Trash2, Plus,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { RankingWeights } from '../../lib/rankingEngine';

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

type Tab = 'featured' | 'moderation' | 'ranking' | 'collections';

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

  const fetchData = useCallback(async () => {
    const [featRes, repRes, colRes, wRes] = await Promise.all([
      supabase.from('featured_products').select('*').eq('is_active', true).order('created_at', { ascending: false }).limit(20),
      supabase.from('moderation_reports').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('marketplace_collections').select('*').order('display_order', { ascending: true }),
      supabase.from('marketplace_ranking_weights').select('*').maybeSingle(),
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

  const tabs: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
    { id: 'featured', label: 'Featured & Sponsored', icon: Star },
    { id: 'moderation', label: 'Moderation Queue', icon: Flag },
    { id: 'ranking', label: 'Ranking Weights', icon: TrendingUp },
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
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-warning to-orange-600 flex items-center justify-center">
          <Store className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Marketplace Controls</h1>
          <p className="text-sm text-gray-500">Manage promotions, moderation, ranking, and collections</p>
        </div>
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
