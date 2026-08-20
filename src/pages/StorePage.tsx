import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Store, Package, Plus, Edit2, Trash2, Eye, EyeOff, Users,
  Loader2, AlertCircle, Check, X, Clock, Search, ChevronDown,
  DollarSign, Percent, Sparkles, Download, Video, Shield, Star,
  Image as ImageIcon, Upload, MapPin,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';

import {
  fetchSystemConfig,
  calculateSubscriptionTotal,
  getTaskPercentForTier,
  ALL_TIERS,
  type SalesTeamTier,
  type Duration,
  type SystemConfig,
} from '../lib/pricing';
import { formatCurrency } from '../lib/currency';

type ProductStatus = 'all' | 'approved' | 'pending' | 'rejected';

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  commission_rate: number;
  image_url: string | null;
  category: string;
  uploaded_by: string;
  created_at: string;
  is_active: boolean;
  is_hidden: boolean;
  is_free: boolean;
  approval_status: string;
  rejection_reason: string | null;
  product_type: string;
  sales_team_tier: string | null;
  stock_quantity: number | null;
  admin_task_percent: number;
  sales_team_task_percent: number;
  affiliate_commission_percent: number;
  demo_video_url: string | null;
  total_reviews: number;
  average_rating: number;
}

const STATUS_TABS: { value: ProductStatus; label: string; icon: typeof Package }[] = [
  { value: 'all', label: 'All', icon: Package },
  { value: 'approved', label: 'Approved', icon: Check },
  { value: 'pending', label: 'Pending', icon: Clock },
  { value: 'rejected', label: 'Rejected', icon: X },
];

const DURATIONS: { value: Duration; label: string }[] = [
  { value: '1_week', label: '1 Week' },
  { value: '2_weeks', label: '2 Weeks' },
  { value: '1_month', label: '1 Month' },
];

export default function StorePage() {
  const { user, isAccountLocked, isAccountBanned, profile, refreshProfile } = useAuth();
  const { t } = useLanguage();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<ProductStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Store branding
  const [storeTitle, setStoreTitle] = useState('');
  const [storeBannerUrl, setStoreBannerUrl] = useState<string | null>(null);
  const [storeDescription, setStoreDescription] = useState('');
  const [storeLocation, setStoreLocation] = useState('');
  const [editingStore, setEditingStore] = useState(false);
  const [savingStore, setSavingStore] = useState(false);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [uploadingBanner, setUploadingBanner] = useState(false);

  // Sales team modal
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [teamModalProduct, setTeamModalProduct] = useState<Product | null>(null);
  const [selectedTier, setSelectedTier] = useState<SalesTeamTier>('Mkt L3');
  const [selectedDuration, setSelectedDuration] = useState<Duration>('1_week');
  const [systemConfig, setSystemConfig] = useState<SystemConfig | null>(null);
  const [teamSubmitting, setTeamSubmitting] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [teamSuccess, setTeamSuccess] = useState(false);

  // Quick edit modal
  const [editModalProduct, setEditModalProduct] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState({ name: '', description: '', price: '', category: 'General' });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState(false);

  useEffect(() => {
    fetchSystemConfig().then(setSystemConfig);
    if (user) fetchProducts();
  }, [user]);

  useEffect(() => {
    if (profile) {
      setStoreTitle(profile.store_title || '');
      setStoreBannerUrl(profile.store_banner_url || null);
      setStoreDescription(profile.store_description || '');
      setStoreLocation(profile.store_location || '');
    }
  }, [profile]);

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingBanner(true);
    setStoreError(null);
    try {
      const ext = file.name.split('.').pop();
      const path = `store-banners/${user.id}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('product-images')
        .upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage
        .from('product-images')
        .getPublicUrl(path);
      setStoreBannerUrl(urlData.publicUrl);
    } catch (err) {
      console.error('Banner upload error:', err);
      setStoreError('Failed to upload banner image');
    } finally {
      setUploadingBanner(false);
    }
  };

  const handleSaveStore = async () => {
    if (!user) return;
    setSavingStore(true);
    setStoreError(null);
    try {
      const { error: updateErr } = await supabase
        .from('users')
        .update({
          store_title: storeTitle.trim() || null,
          store_banner_url: storeBannerUrl,
          store_description: storeDescription.trim() || null,
          store_location: storeLocation.trim() || null,
        })
        .eq('id', user.id);
      if (updateErr) throw updateErr;
      await refreshProfile();
      setEditingStore(false);
    } catch (err) {
      console.error('Save store error:', err);
      setStoreError('Failed to save store settings');
    } finally {
      setSavingStore(false);
    }
  };

  const fetchProducts = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await supabase
        .from('products')
        .select('*')
        .eq('uploaded_by', user?.id)
        .order('created_at', { ascending: false });
      if (fetchErr) throw fetchErr;
      setProducts((data as Product[]) || []);
    } catch (err) {
      console.error('Error fetching store products:', err);
      setError('Failed to load your store products');
    } finally {
      setLoading(false);
    }
  };

  
  const statusCounts = useMemo(() => {
    const counts: Record<ProductStatus, number> = {
      all: products.length,
      approved: 0,
      pending: 0,
      rejected: 0,
    };
    for (const p of products) {
      if (p.approval_status === 'approved') counts.approved++;
      else if (p.approval_status === 'pending') counts.pending++;
      else if (p.approval_status === 'rejected') counts.rejected++;
    }
    return counts;
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesStatus =
        statusFilter === 'all' ? true : p.approval_status === statusFilter;
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [products, statusFilter, searchQuery]);

  const openTeamModal = (product: Product) => {
    if (isAccountLocked || isAccountBanned) return;
    setTeamModalProduct(product);
    setSelectedTier((product.sales_team_tier as SalesTeamTier) || 'Mkt L3');
    setShowTeamModal(true);
    setTeamError(null);
    setTeamSuccess(false);
  };

  const closeTeamModal = () => {
    setShowTeamModal(false);
    setTeamModalProduct(null);
    setTeamError(null);
    setTeamSuccess(false);
  };

  const handleCreateContract = async () => {
    if (!teamModalProduct || !user || !systemConfig) return;
    setTeamSubmitting(true);
    setTeamError(null);

    try {
      let query = supabase
        .from('users')
        .select('id')
        .eq('is_admin', false);

      if (selectedTier.startsWith('Mkt')) {
        const level = parseInt(selectedTier.replace('Mkt L', ''));
        query = query.eq('marketer_status', 'approved').eq('marketer_level', level);
      } else {
        const grade = selectedTier.replace('Adv ', '');
        query = query.eq('advertiser_status', 'approved').eq('advertiser_grade', grade);
      }

      query = query.limit(1);
      const { data: teamMembers, error: teamErr } = await query.maybeSingle();
      if (teamErr) throw teamErr;
      if (!teamMembers) {
        setTeamError(`No ${selectedTier} available. Try a different tier.`);
        setTeamSubmitting(false);
        return;
      }

      const totalAmount = calculateSubscriptionTotal(selectedTier, selectedDuration, systemConfig);
      const expiresAt = getExpiryDate(selectedDuration);

      const { error: contractErr } = await supabase.from('sales_team_contracts').insert({
        seller_id: user.id,
        sales_team_id: teamMembers.id,
        product_id: teamModalProduct.id,
        duration: selectedDuration,
        total_amount: totalAmount,
        status: 'active',
        admin_cut_applied: false,
        expires_at: expiresAt,
      });

      if (contractErr) throw contractErr;

      await supabase
        .from('products')
        .update({
          sales_team_tier: selectedTier,
          sales_team_task_percent: getTaskPercentForTier(selectedTier, systemConfig),
        })
        .eq('id', teamModalProduct.id);

      setTeamSuccess(true);
      setTimeout(() => closeTeamModal(), 2500);
      fetchProducts();
    } catch (err) {
      console.error('Contract creation error:', err);
      setTeamError('Failed to create contract. Please try again.');
    } finally {
      setTeamSubmitting(false);
    }
  };

  const openEditModal = (product: Product) => {
    setEditModalProduct(product);
    setEditForm({
      name: product.name,
      description: product.description || '',
      price: String(product.price),
      category: product.category,
    });
    setEditError(null);
    setEditSuccess(false);
  };

  const closeEditModal = () => {
    setEditModalProduct(null);
    setEditError(null);
    setEditSuccess(false);
  };

  const handleQuickEdit = async () => {
    if (!editModalProduct || !user) return;
    setEditSubmitting(true);
    setEditError(null);

    try {
      const changes: Record<string, unknown> = {};
      if (editForm.name.trim() !== editModalProduct.name) changes.name = editForm.name.trim();
      if (editForm.description.trim() !== (editModalProduct.description || '')) changes.description = editForm.description.trim() || null;
      const newPrice = parseFloat(editForm.price);
      if (!isNaN(newPrice) && newPrice !== Number(editModalProduct.price)) changes.price = newPrice;
      if (editForm.category !== editModalProduct.category) changes.category = editForm.category;

      if (Object.keys(changes).length === 0) {
        setEditError('No changes detected');
        setEditSubmitting(false);
        return;
      }

      // Submit as edit for approval (preserves existing flow)
      const originalSnapshot: Record<string, unknown> = {
        name: editModalProduct.name,
        description: editModalProduct.description || '',
        price: Number(editModalProduct.price),
        category: editModalProduct.category,
        image_url: editModalProduct.image_url,
      };

      const { error: insertErr } = await supabase.from('product_edits').insert({
        product_id: editModalProduct.id,
        proposed_by: user.id,
        status: 'pending',
        proposed_changes: changes,
        original_snapshot: originalSnapshot,
      });

      if (insertErr) throw insertErr;

      setEditSuccess(true);
      setTimeout(() => closeEditModal(), 2000);
    } catch (err) {
      console.error('Quick edit error:', err);
      setEditError('Failed to submit edit. Please try again.');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleToggleVisibility = async (product: Product) => {
    try {
      const { error } = await supabase
        .from('products')
        .update({ is_hidden: !product.is_hidden })
        .eq('id', product.id);
      if (error) throw error;
      fetchProducts();
    } catch (err) {
      console.error('Toggle visibility error:', err);
      setError('Failed to update product visibility');
    }
  };

  const handleDeleteProduct = async (product: Product) => {
    if (!confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', product.id);
      if (error) throw error;
      fetchProducts();
    } catch (err) {
      console.error('Delete error:', err);
      setError('Failed to delete product');
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; cls: string; icon: typeof Check }> = {
      approved: { label: 'Approved', cls: 'bg-success-muted text-success', icon: Check },
      pending: { label: 'Pending', cls: 'bg-warning-muted text-warning', icon: Clock },
      rejected: { label: 'Rejected', cls: 'bg-error-muted text-error', icon: X },
      draft: { label: 'Draft', cls: 'bg-gray-100 text-gray-600', icon: Edit2 },
      removed: { label: 'Removed', cls: 'bg-gray-100 text-gray-500', icon: X },
    };
    const info = map[status] || map.draft;
    const Icon = info.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${info.cls}`}>
        <Icon className="w-3 h-3" />{info.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-primary-600 to-primary-500 rounded-2xl flex items-center justify-center shadow-lg shadow-primary-600/20">
            <Store className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('myStore')}</h1>
            <p className="text-gray-500 text-sm mt-0.5">
              Manage all your products — approved, pending, rejected, and drafts
            </p>
          </div>
        </div>
        <Link
          to="/upload-product"
          className="flex items-center gap-2 px-4 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold transition-colors shadow-md shadow-primary-600/20 min-h-[48px]"
        >
          <Plus className="w-5 h-5" />
          <span>{t('postAd')}</span>
        </Link>
      </div>

      {(isAccountLocked || isAccountBanned) && (
        <div className={`rounded-2xl p-4 mb-6 flex items-center gap-3 ${isAccountBanned ? 'bg-error-muted border border-error/20' : 'bg-warning-muted border border-warning/20'}`}>
          <Shield className={`w-5 h-5 ${isAccountBanned ? 'text-error' : 'text-warning'}`} />
          <p className={`text-sm font-medium ${isAccountBanned ? 'text-error' : 'text-warning'}`}>
            {isAccountBanned
              ? 'Your account is BANNED. Editing and sales team actions are disabled.'
              : 'Your account is LOCKED. Editing and sales team actions are temporarily disabled.'}
          </p>
        </div>
      )}

      {/* Store Branding Banner */}
      <div className="rounded-2xl overflow-hidden shadow-sm border border-gray-100 mb-6">
        <div
          className="relative h-36 md:h-44 overflow-hidden bg-gradient-to-br from-primary-600 to-primary-400"
        >
          {storeBannerUrl ? (
            <img src={storeBannerUrl} alt="Store banner" className="w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Store className="w-16 h-16 text-white/30" />
            </div>
          )}
          {!editingStore && (
            <button
              onClick={() => setEditingStore(true)}
              className="absolute top-3 right-3 inline-flex items-center gap-1.5 px-3 py-2 bg-white/90 backdrop-blur text-gray-700 rounded-xl text-sm font-medium hover:bg-white transition-colors"
            >
              <Edit2 className="w-4 h-4" /> {t('customize')}
            </button>
          )}
        </div>
        <div className="bg-white p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-gray-400">{t('storeTitle')}</p>
            <p className="text-lg font-bold text-gray-900 truncate">
              {storeTitle || `${profile?.full_name || 'My'}'s Store`}
            </p>
            {storeLocation && (
              <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3" /> {storeLocation}
              </p>
            )}
          </div>
          <Link
            to={`/shop/${user?.id}`}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-primary-600 hover:text-primary-700 shrink-0"
          >
            <Eye className="w-4 h-4" /> {t('visitStore')}
          </Link>
        </div>
      </div>

      {/* Store Branding Editor */}
      {editingStore && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-primary-600" /> {t('customize')}
            </h3>
            <button onClick={() => setEditingStore(false)} className="p-1 text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          {storeError && (
            <div className="flex items-center gap-2 text-sm text-error bg-error-muted rounded-lg px-3 py-2 mb-3">
              <AlertCircle className="w-4 h-4 shrink-0" />{storeError}
            </div>
          )}

          <div className="space-y-5">
            {/* Store Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('storeTitle')}</label>
              <input
                type="text"
                value={storeTitle}
                onChange={(e) => setStoreTitle(e.target.value)}
                placeholder="e.g. Marvelous Digital Shop"
                maxLength={60}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none text-gray-900"
              />
            </div>

            {/* Store Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('storeDescription')}</label>
              <textarea
                value={storeDescription}
                onChange={(e) => setStoreDescription(e.target.value.slice(0, 500))}
                placeholder="Tell customers about your store, what you sell, and what makes you special..."
                rows={4}
                maxLength={500}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none text-gray-900 resize-none"
              />
              <p className="text-xs text-gray-400 mt-1 text-right">{storeDescription.length}/500</p>
            </div>

            {/* Store Location */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('storeLocation')}</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={storeLocation}
                  onChange={(e) => setStoreLocation(e.target.value)}
                  placeholder="e.g. Lagos, Nigeria"
                  maxLength={100}
                  className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none text-gray-900"
                />
              </div>
            </div>

            {/* Banner Image */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('bannerImage')}</label>
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium cursor-pointer transition-colors">
                  {uploadingBanner ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {uploadingBanner ? 'Uploading...' : t('uploadBanner')}
                  <input type="file" accept="image/*" onChange={handleBannerUpload} className="hidden" disabled={uploadingBanner} />
                </label>
                {storeBannerUrl && (
                  <button
                    onClick={() => setStoreBannerUrl(null)}
                    className="text-sm text-error hover:underline"
                  >
                    {t('remove')}
                  </button>
                )}
              </div>
              {storeBannerUrl && (
                <div className="mt-3 rounded-xl overflow-hidden h-24 bg-gray-50">
                  <img src={storeBannerUrl} alt="Banner preview" className="w-full h-full object-cover" />
                </div>
              )}
            </div>

            {/* Save / Cancel */}
            <div className="flex gap-2 pt-2 border-t border-gray-100">
              <button
                onClick={() => setEditingStore(false)}
                className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleSaveStore}
                disabled={savingStore}
                className="flex-1 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {savingStore ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {t('saveStore')}
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {error && (
        <div className="rounded-2xl p-4 mb-6 flex items-center gap-3 bg-error-muted text-error">
          <AlertCircle className="w-5 h-5" />
          <p className="text-sm font-medium">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto p-1 hover:bg-error/10 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Stats summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <SummaryCard label={t('products')} value={statusCounts.all} icon={Package} color="bg-primary-100 text-primary-600" />
        <SummaryCard label="Approved" value={statusCounts.approved} icon={Check} color="bg-success-muted text-success" />
        <SummaryCard label="Pending" value={statusCounts.pending} icon={Clock} color="bg-warning-muted text-warning" />
        <SummaryCard label="Rejected" value={statusCounts.rejected} icon={X} color="bg-error-muted text-error" />
      </div>

      {/* Status tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {STATUS_TABS.map((tab) => {
          const count = statusCounts[tab.value];
          const isActive = statusFilter === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-primary-300'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              <span className={`px-1.5 py-0.5 rounded-full text-xs ${isActive ? 'bg-white/20' : 'bg-gray-100 text-gray-500'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder={t('search')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all bg-white text-gray-900"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Empty state */}
      {filteredProducts.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-20 text-center"
        >
          <div className="w-24 h-24 bg-gray-100 rounded-3xl flex items-center justify-center mb-5">
            <Store className="w-12 h-12 text-gray-400" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">
            {products.length === 0 ? 'Your store is empty' : 'No products match your filters'}
          </h3>
          <p className="text-gray-500 max-w-xs mb-6">
            {products.length === 0
              ? 'Start adding products to your store to see them here.'
              : 'Try a different status filter or search term.'}
          </p>
          {products.length === 0 && (
            <Link
              to="/upload-product"
              className="flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold transition-colors"
            >
              <Plus className="w-5 h-5" />
              Post First Ad
            </Link>
          )}
        </motion.div>
      )}

      {/* Product grid */}
      {filteredProducts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProducts.map((product, index) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow group flex flex-col"
            >
              {/* Image */}
              <Link to={`/product/${product.id}`} className="block relative h-40 bg-gray-50 overflow-hidden">
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="w-12 h-12 text-gray-300" />
                  </div>
                )}
                <span className="absolute top-3 left-3 bg-white/90 backdrop-blur text-xs font-semibold text-gray-700 px-2.5 py-1 rounded-full shadow-sm">
                  {product.category}
                </span>
                {product.product_type && product.product_type !== 'PHYSICAL' && (
                  <span className="absolute bottom-3 left-3 bg-primary-600/90 backdrop-blur text-xs font-semibold text-white px-2 py-0.5 rounded-full shadow-sm flex items-center gap-1">
                    {product.product_type === 'DIGITAL' && <Download className="w-3 h-3" />}
                    {product.product_type === 'SERVICE' && <Sparkles className="w-3 h-3" />}
                    {product.product_type === 'COURSE' && <Video className="w-3 h-3" />}
                    {product.product_type}
                  </span>
                )}
                <div className="absolute top-3 right-3">
                  {statusBadge(product.approval_status)}
                </div>
                {product.is_hidden && (
                  <span className="absolute bottom-3 right-3 bg-gray-800/80 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                    <EyeOff className="w-3 h-3" /> Hidden
                  </span>
                )}
              </Link>

              {/* Info */}
              <div className="p-5 flex flex-col flex-1">
                <Link to={`/product/${product.id}`}>
                  <h3 className="font-semibold text-gray-900 text-base leading-tight line-clamp-2 mb-1.5 hover:text-primary-600 transition-colors">
                    {product.name}
                  </h3>
                </Link>
                {product.description && (
                  <p className="text-sm text-gray-500 line-clamp-2 mb-3">
                    {product.description}
                  </p>
                )}

                {/* Rejection reason */}
                {product.approval_status === 'rejected' && product.rejection_reason && (
                  <div className="mb-3 p-2 bg-error-muted rounded-lg text-xs text-error flex items-start gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>{product.rejection_reason}</span>
                  </div>
                )}

                {/* Price + commission */}
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs text-gray-400">Price</p>
                    {product.is_free ? (
                      <p className="text-lg font-bold text-success">FREE</p>
                    ) : (
                      <p className="text-lg font-bold text-gray-900">{formatCurrency(Number(product.price))}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Commission</p>
                    <p className="text-sm font-bold text-success flex items-center gap-0.5">
                      <Percent className="w-3 h-3" />
                      {product.commission_rate}%
                    </p>
                  </div>
                </div>

                {/* Sales team tier */}
                {product.sales_team_tier && (
                  <div className="mb-3 flex items-center gap-1.5 text-xs">
                    <Users className="w-3.5 h-3.5 text-warning" />
                    <span className="bg-warning/10 text-warning px-2 py-0.5 rounded-full font-medium">
                      {product.sales_team_tier}
                    </span>
                  </div>
                )}

                {/* Rating */}
                {product.total_reviews > 0 && (
                  <div className="mb-3 flex items-center gap-1 text-xs text-gray-500">
                    <Star className="w-3.5 h-3.5 fill-warning text-warning" />
                    <span className="font-medium text-gray-700">
                      {Number(product.average_rating || 0).toFixed(1)}
                    </span>
                    <span>({product.total_reviews} reviews)</span>
                  </div>
                )}

                {/* Action buttons */}
                <div className="mt-auto grid grid-cols-2 gap-2">
                  <Link
                    to={`/product/${product.id}/edit`}
                    className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />Edit
                  </Link>
                  <button
                    onClick={() => openTeamModal(product)}
                    disabled={isAccountLocked || isAccountBanned}
                    className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium bg-warning/10 text-warning hover:bg-warning/20 transition-colors disabled:opacity-50"
                  >
                    <Users className="w-4 h-4" />
                    {product.sales_team_tier ? 'Team' : 'Add Team'}
                  </button>
                </div>

                {/* Secondary actions */}
                <div className="flex items-center justify-between mt-2 text-xs">
                  <button
                    onClick={() => openEditModal(product)}
                    disabled={isAccountLocked || isAccountBanned}
                    className="text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1 disabled:opacity-50"
                  >
                    <Edit2 className="w-3 h-3" />Quick Edit
                  </button>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleToggleVisibility(product)}
                      disabled={isAccountLocked || isAccountBanned}
                      title={product.is_hidden ? 'Show product' : 'Hide product'}
                      className="text-gray-500 hover:text-gray-700 disabled:opacity-50"
                    >
                      {product.is_hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleDeleteProduct(product)}
                      disabled={isAccountLocked || isAccountBanned}
                      title="Delete product"
                      className="text-gray-400 hover:text-error disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Sales Team Modal */}
      <AnimatePresence>
        {showTeamModal && teamModalProduct && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={closeTeamModal}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Users className="w-5 h-5 text-warning" />
                  {teamModalProduct.sales_team_tier ? 'Change Sales Team' : 'Add Sales Team'}
                </h3>
                <button onClick={closeTeamModal} className="p-1 text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-gray-500">
                Product: <span className="font-medium text-gray-900">{teamModalProduct.name}</span>
              </p>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Sales Team Tier</label>
                <div className="relative">
                  <select
                    value={selectedTier}
                    onChange={(e) => setSelectedTier(e.target.value as SalesTeamTier)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-primary-500 outline-none appearance-none bg-white pr-10"
                  >
                    {ALL_TIERS.map((tier) => (
                      <option key={tier} value={tier}>{tier}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Duration</label>
                <div className="grid grid-cols-3 gap-2">
                  {DURATIONS.map((d) => (
                    <button
                      key={d.value}
                      onClick={() => setSelectedDuration(d.value)}
                      className={`py-2 rounded-xl text-sm font-medium transition-colors ${
                        selectedDuration === d.value
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {systemConfig && (
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Total Subscription</span>
                    <span className="font-bold text-gray-900">
                      ${calculateSubscriptionTotal(selectedTier, selectedDuration, systemConfig).toFixed(2)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Funds will be locked in the sales team's balance and released on contract expiry.
                  </p>
                </div>
              )}

              {teamError && (
                <div className="flex items-center gap-2 text-error text-sm">
                  <AlertCircle className="w-4 h-4" />{teamError}
                </div>
              )}
              {teamSuccess && (
                <div className="flex items-center gap-2 text-success text-sm">
                  <Check className="w-4 h-4" />Sales team contract created!
                </div>
              )}

              <button
                onClick={handleCreateContract}
                disabled={teamSubmitting || teamSuccess}
                className="w-full py-3 bg-warning hover:bg-orange-600 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {teamSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <><Shield className="w-4 h-4" />Create Contract</>
                )}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick Edit Modal */}
      <AnimatePresence>
        {editModalProduct && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={closeEditModal}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Edit2 className="w-5 h-5 text-primary-600" />Quick Edit
                </h3>
                <button onClick={closeEditModal} className="p-1 text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-gray-500">
                Changes require admin approval before going live.
              </p>

              {editError && (
                <div className="flex items-center gap-2 text-error text-sm bg-error-muted rounded-lg p-2">
                  <AlertCircle className="w-4 h-4" />{editError}
                </div>
              )}
              {editSuccess && (
                <div className="flex items-center gap-2 text-success text-sm bg-success-muted rounded-lg p-2">
                  <Check className="w-4 h-4" />Edit submitted for approval!
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none text-gray-900 resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Price ($)</label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editForm.price}
                        onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                        className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none text-gray-900"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                    <select
                      value={editForm.category}
                      onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-primary-500 outline-none bg-white text-gray-900"
                    >
                      {['General', 'Electronics', 'Fashion', 'Health & Beauty', 'Home & Garden',
                        'Food & Beverage', 'Sports & Fitness', 'Books & Media', 'Toys & Games',
                        'Software & Digital', 'Design', 'Consulting', 'Writing', 'Development',
                        'Marketing', 'Education', 'Business'].map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={closeEditModal}
                  className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleQuickEdit}
                  disabled={editSubmitting || editSuccess}
                  className="flex-1 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {editSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <><Edit2 className="w-4 h-4" />Submit for Approval</>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <div className={`p-2 rounded-xl ${color} w-fit mb-2`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

function getExpiryDate(duration: Duration): string {
  const now = new Date();
  if (duration === '1_week') now.setDate(now.getDate() + 7);
  else if (duration === '2_weeks') now.setDate(now.getDate() + 14);
  else now.setMonth(now.getMonth() + 1);
  return now.toISOString();
}
