import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  Ban,
  Trash2,
  Copy,
  Award,
  Eye,
  EyeOff,
  Users,
  Video,
  FileText,
  ExternalLink,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { emitEvent } from '../../lib/notificationEvents';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency } from '../../lib/currency';

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  commission_rate: number;
  image_url: string | null;
  category: string;
  approval_status: string;
  rejection_reason: string | null;
  created_at: string;
  uploaded_by: string;
  uploader_email?: string;
  is_hidden?: boolean;
  is_active?: boolean;
  is_free?: boolean;
  stock_quantity?: number | null;
  initial_stock?: number | null;
  product_type?: string;
  has_dright_sales_team?: boolean;
}

interface PortfolioItem {
  id: string;
  item_type: 'IMAGE' | 'VIDEO' | 'PDF' | 'LINK';
  file_url: string | null;
  external_url: string | null;
  link_platform: string | null;
  title: string | null;
  is_approved: boolean;
  created_at: string;
}

interface DuplicateMatch {
  id: string;
  name: string;
  uploaded_by: string;
  uploader_email: string;
  category: string;
  price: number;
  approval_status: string;
  similarity: number;
}

export default function AdminProductsPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'suspended' | 'removed' | 'all'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Modals
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [suspendReason, setSuspendReason] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);

  // Portfolio modal
  const [showPortfolioModal, setShowPortfolioModal] = useState(false);
  const [portfolioProduct, setPortfolioProduct] = useState<Product | null>(null);
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, [user, statusFilter]);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      let query = supabase.from('products').select('*');

      if (statusFilter !== 'all') {
        query = query.eq('approval_status', statusFilter);
      }

      query = query.order('created_at', { ascending: false });
      const { data } = await query;

      if (data && data.length > 0) {
        const uploaderIds = [...new Set(data.map(p => p.uploaded_by))];
        const { data: uploaders } = await supabase
          .from('users')
          .select('id, email')
          .in('id', uploaderIds);

        const uploaderMap = new Map(uploaders?.map(u => [u.id, u.email]) || []);
        setProducts(data.map(p => ({
          ...p,
          uploader_email: uploaderMap.get(p.uploaded_by) || 'Unknown',
        })) as Product[]);
      } else {
        setProducts([]);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  const approveProduct = async (productId: string) => {
    setProcessingId(productId);
    try {
      const { error } = await supabase
        .from('products')
        .update({ approval_status: 'approved', rejection_reason: null, is_hidden: false, is_active: true })
        .eq('id', productId);
      if (error) throw error;

      await supabase.from('admin_logs').insert({
        admin_id: user?.id,
        action_type: 'approve_product',
        target_id: productId,
        target_type: 'product',
        details: { product_id: productId },
      });

      const product = products.find(p => p.id === productId);
      if (product) {
        await emitEvent({
          module: 'marketplace',
          eventType: 'product_approved',
          recipientIds: product.uploaded_by,
          actorId: user?.id,
          metadata: {
            productTitle: product.name,
            productImage: product.image_url,
            actionUrl: `/product/${productId}`,
          },
        });
      }

      fetchProducts();
    } catch (error) {
      console.error('Error approving product:', error);
    } finally {
      setProcessingId(null);
    }
  };

  const openRejectModal = (product: Product) => {
    setSelectedProduct(product);
    setRejectionReason('');
    setShowRejectModal(true);
  };

  const rejectProduct = async () => {
    if (!selectedProduct || !rejectionReason.trim()) return;
    setProcessingId(selectedProduct.id);
    try {
      const { error } = await supabase
        .from('products')
        .update({ approval_status: 'rejected', rejection_reason: rejectionReason.trim() })
        .eq('id', selectedProduct.id);
      if (error) throw error;

      await supabase.from('admin_logs').insert({
        admin_id: user?.id,
        action_type: 'reject_product',
        target_id: selectedProduct.id,
        target_type: 'product',
        details: { reason: rejectionReason.trim() },
      });

      await emitEvent({
        module: 'marketplace',
        eventType: 'product_rejected',
        recipientIds: selectedProduct.uploaded_by,
        actorId: user?.id,
        metadata: {
          productTitle: selectedProduct.name,
          reason: rejectionReason.trim(),
          actionUrl: `/product/${selectedProduct.id}`,
        },
      });

      setShowRejectModal(false);
      setSelectedProduct(null);
      fetchProducts();
    } catch (error) {
      console.error('Error rejecting product:', error);
    } finally {
      setProcessingId(null);
    }
  };

  const openSuspendModal = (product: Product) => {
    setSelectedProduct(product);
    setSuspendReason('');
    setShowSuspendModal(true);
  };

  const suspendProduct = async () => {
    if (!selectedProduct || !suspendReason.trim()) return;
    setProcessingId(selectedProduct.id);
    try {
      const { error } = await supabase
        .from('products')
        .update({ approval_status: 'suspended', is_hidden: true, rejection_reason: suspendReason.trim() })
        .eq('id', selectedProduct.id);
      if (error) throw error;

      await supabase.from('admin_logs').insert({
        admin_id: user?.id,
        action_type: 'suspend_product',
        target_id: selectedProduct.id,
        target_type: 'product',
        details: { reason: suspendReason.trim() },
      });

      await emitEvent({
        module: 'marketplace',
        eventType: 'product_rejected',
        recipientIds: selectedProduct.uploaded_by,
        actorId: user?.id,
        metadata: {
          productTitle: selectedProduct.name,
          reason: `Suspended: ${suspendReason.trim()}`,
          actionUrl: `/product/${selectedProduct.id}`,
        },
      });

      setShowSuspendModal(false);
      setSelectedProduct(null);
      fetchProducts();
    } catch (error) {
      console.error('Error suspending product:', error);
    } finally {
      setProcessingId(null);
    }
  };

  const openDeleteModal = (product: Product) => {
    setSelectedProduct(product);
    setDeleteReason('');
    setShowDeleteModal(true);
  };

  const deleteProduct = async () => {
    if (!selectedProduct || !deleteReason.trim()) return;
    setProcessingId(selectedProduct.id);
    try {
      const { error } = await supabase
        .from('products')
        .update({ approval_status: 'removed', is_hidden: true, is_active: false, rejection_reason: deleteReason.trim() })
        .eq('id', selectedProduct.id);
      if (error) throw error;

      await supabase.from('admin_logs').insert({
        admin_id: user?.id,
        action_type: 'delete_product',
        target_id: selectedProduct.id,
        target_type: 'product',
        details: { reason: deleteReason.trim() },
      });

      await emitEvent({
        module: 'marketplace',
        eventType: 'product_removed_by_admin',
        recipientIds: selectedProduct.uploaded_by,
        actorId: user?.id,
        metadata: {
          productTitle: selectedProduct.name,
          reason: deleteReason.trim(),
          actionUrl: `/product/${selectedProduct.id}`,
        },
      });

      setShowDeleteModal(false);
      setSelectedProduct(null);
      fetchProducts();
    } catch (error) {
      console.error('Error deleting product:', error);
    } finally {
      setProcessingId(null);
    }
  };

  const checkDuplicates = async (product: Product) => {
    setSelectedProduct(product);
    setCheckingDuplicates(true);
    setShowDuplicateModal(true);
    setDuplicates([]);

    try {
      // Fetch all other products (excluding the current one)
      const { data } = await supabase
        .from('products')
        .select('id, name, uploaded_by, category, price, approval_status')
        .neq('id', product.id)
        .neq('approval_status', 'removed');

      if (!data || data.length === 0) {
        setDuplicates([]);
        setCheckingDuplicates(false);
        return;
      }

      // Fetch uploader emails
      const uploaderIds = [...new Set(data.map(p => p.uploaded_by))];
      const { data: uploaders } = await supabase
        .from('users')
        .select('id, email')
        .in('id', uploaderIds);
      const emailMap = new Map(uploaders?.map(u => [u.id, u.email]) || []);

      const normalize = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
      const targetName = normalize(product.name);
      const targetWords = new Set(targetName.split(' ').filter(w => w.length > 2));

      const matches: DuplicateMatch[] = data
        .map(p => {
          const normName = normalize(p.name);
          const words = new Set(normName.split(' ').filter(w => w.length > 2));
          // Jaccard similarity on significant words
          const intersection = [...targetWords].filter(w => words.has(w)).length;
          const union = new Set([...targetWords, ...words]).size;
          const wordSim = union > 0 ? intersection / union : 0;
          // Direct name similarity
          const nameSim = targetName === normName ? 1 :
            targetName.includes(normName) || normName.includes(targetName) ? 0.85 :
            wordSim;
          return {
            id: p.id,
            name: p.name,
            uploaded_by: p.uploaded_by,
            uploader_email: emailMap.get(p.uploaded_by) || 'Unknown',
            category: p.category,
            price: Number(p.price),
            approval_status: p.approval_status,
            similarity: Math.round(nameSim * 100),
          };
        })
        .filter(m => m.similarity >= 50)
        .sort((a, b) => b.similarity - a.similarity);

      setDuplicates(matches);
    } catch (error) {
      console.error('Error checking duplicates:', error);
    } finally {
      setCheckingDuplicates(false);
    }
  };

  const openPortfolioModal = async (product: Product) => {
    setPortfolioProduct(product);
    setShowPortfolioModal(true);
    setPortfolioLoading(true);
    try {
      const { data } = await supabase
        .from('portfolio_items')
        .select('id, item_type, file_url, external_url, link_platform, title, is_approved, created_at')
        .eq('product_id', product.id)
        .order('position', { ascending: true });
      setPortfolioItems(data as PortfolioItem[] || []);
    } catch (err) {
      console.error('Error fetching portfolio items:', err);
    } finally {
      setPortfolioLoading(false);
    }
  };

  const togglePortfolioItemApproval = async (itemId: string, currentlyApproved: boolean) => {
    await supabase.from('portfolio_items').update({ is_approved: !currentlyApproved }).eq('id', itemId);
    setPortfolioItems(prev => prev.map(i => i.id === itemId ? { ...i, is_approved: !currentlyApproved } : i));
  };

  const deletePortfolioItem = async (itemId: string) => {
    await supabase.from('portfolio_items').delete().eq('id', itemId);
    setPortfolioItems(prev => prev.filter(i => i.id !== itemId));
  };

  const toggleSalesTeamSupport = async (product: Product) => {
    const newVal = !product.has_dright_sales_team;
    await supabase.from('products').update({ has_dright_sales_team: newVal }).eq('id', product.id);
    setProducts(prev => prev.map(p => p.id === product.id ? { ...p, has_dright_sales_team: newVal } : p));
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const filteredProducts = products.filter(p => {
    const q = searchQuery.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
  });

  const statusFilters: Array<'pending' | 'approved' | 'rejected' | 'suspended' | 'removed' | 'all'> =
    ['pending', 'approved', 'rejected', 'suspended', 'removed', 'all'];

  const getStatusBadge = (status: string) => {
    const config: Record<string, { class: string; icon: typeof Clock }> = {
      approved: { class: 'bg-success-muted text-success', icon: CheckCircle },
      rejected: { class: 'bg-error-muted text-error', icon: XCircle },
      pending: { class: 'bg-warning-muted text-warning', icon: Clock },
      suspended: { class: 'bg-purple-100 text-purple-700', icon: Ban },
      removed: { class: 'bg-gray-200 text-gray-600', icon: Trash2 },
    };
    const c = config[status] || config.pending;
    const Icon = c.icon;
    return (
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${c.class}`}>
        <Icon className="w-3 h-3" />
        {status}
      </span>
    );
  };

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Product Approvals</h1>
        <p className="text-gray-500 mt-1">Review, approve, suspend, or remove marketplace products</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all bg-white text-gray-900"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {statusFilters.map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-3 rounded-xl font-medium transition-all min-h-[48px] ${
                statusFilter === status
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-primary-300'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-gray-300 border-t-warning rounded-full animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!loading && filteredProducts.length === 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-900 font-semibold text-lg">
            {searchQuery ? 'No matching products' : 'No products to review'}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {statusFilter === 'pending'
              ? 'New product submissions will appear here'
              : 'Try a different filter'}
          </p>
        </div>
      )}

      {/* Product List */}
      {!loading && filteredProducts.length > 0 && (
        <div className="space-y-4">
          {filteredProducts.map((product, index) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className={`bg-white rounded-2xl shadow-sm border overflow-hidden ${
                product.is_hidden ? 'border-purple-200 opacity-75' : 'border-gray-100'
              }`}
            >
              <div className="flex flex-col sm:flex-row gap-4 p-5">
                {/* Product Image */}
                <div className="w-full sm:w-32 h-32 rounded-xl overflow-hidden bg-gray-100 shrink-0">
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-10 h-10 text-gray-300" />
                    </div>
                  )}
                </div>

                {/* Product Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div>
                      <h3 className="font-semibold text-gray-900 text-lg">{product.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          {product.category}
                        </span>
                        {getStatusBadge(product.approval_status)}
                        {product.is_hidden && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">
                            hidden
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {product.is_free ? (
                        <p className="text-xl font-bold text-success">FREE</p>
                      ) : (
                        <p className="text-xl font-bold text-gray-900">{formatCurrency(product.price)}</p>
                      )}
                      {product.is_free ? (
                        <p className="text-sm text-success font-medium">Free product</p>
                      ) : (
                        <p className="text-sm text-success font-medium">{product.commission_rate}% commission</p>
                      )}
                      {product.stock_quantity !== null && product.stock_quantity !== undefined && (
                        <p className={`text-xs mt-1 ${product.stock_quantity === 0 ? 'text-error' : product.stock_quantity <= 10 ? 'text-warning' : 'text-gray-400'}`}>
                          {product.stock_quantity} / {product.initial_stock || product.stock_quantity} in stock
                        </p>
                      )}
                    </div>
                  </div>

                  {product.description && (
                    <p className="text-sm text-gray-600 line-clamp-2 mb-2">{product.description}</p>
                  )}

                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span>Uploaded {formatDate(product.created_at)}</span>
                    <span>by {product.uploader_email}</span>
                  </div>

                  {product.rejection_reason && (
                    <div className="mt-3 p-2 bg-error-muted rounded-lg text-sm text-error">
                      <strong>Note:</strong> {product.rejection_reason}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex sm:flex-col gap-2 shrink-0 flex-wrap">
                  {product.approval_status === 'pending' && (
                    <>
                      <button
                        onClick={() => approveProduct(product.id)}
                        disabled={processingId === product.id}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-success text-white rounded-xl font-medium hover:bg-green-700 transition-colors disabled:opacity-50 min-h-[48px]"
                      >
                        {processingId === product.id ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                          <><CheckCircle className="w-5 h-5" /><span className="hidden sm:inline">Approve</span></>
                        )}
                      </button>
                      <button
                        onClick={() => openRejectModal(product)}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-error-muted text-error rounded-xl font-medium hover:bg-error hover:text-white transition-colors min-h-[48px]"
                      >
                        <XCircle className="w-5 h-5" /><span className="hidden sm:inline">Reject</span>
                      </button>
                    </>
                  )}

                  {product.approval_status === 'approved' && (
                    <button
                      onClick={() => openSuspendModal(product)}
                      disabled={processingId === product.id}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-purple-100 text-purple-700 rounded-xl font-medium hover:bg-purple-200 transition-colors disabled:opacity-50 min-h-[48px]"
                    >
                      {processingId === product.id ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                        <><Ban className="w-5 h-5" /><span className="hidden sm:inline">Suspend</span></>
                      )}
                    </button>
                  )}

                  {product.approval_status === 'suspended' && (
                    <button
                      onClick={() => approveProduct(product.id)}
                      disabled={processingId === product.id}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-success text-white rounded-xl font-medium hover:bg-green-700 transition-colors disabled:opacity-50 min-h-[48px]"
                    >
                      {processingId === product.id ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                        <><CheckCircle className="w-5 h-5" /><span className="hidden sm:inline">Reactivate</span></>
                      )}
                    </button>
                  )}

                  {product.approval_status !== 'removed' && (
                    <button
                      onClick={() => openDeleteModal(product)}
                      disabled={processingId === product.id}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200 transition-colors disabled:opacity-50 min-h-[48px]"
                    >
                      <Trash2 className="w-5 h-5" /><span className="hidden sm:inline">Remove</span>
                    </button>
                  )}

                  {/* Duplicate check button */}
                  <button
                    onClick={() => checkDuplicates(product)}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-blue-50 text-blue-600 rounded-xl font-medium hover:bg-blue-100 transition-colors min-h-[48px]"
                  >
                    <Copy className="w-5 h-5" /><span className="hidden sm:inline">Check Duplicates</span>
                  </button>

                  {/* Portfolio management (SERVICE only) */}
                  {product.product_type === 'SERVICE' && (
                    <>
                      <button
                        onClick={() => openPortfolioModal(product)}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-purple-50 text-purple-600 rounded-xl font-medium hover:bg-purple-100 transition-colors min-h-[48px]"
                      >
                        <Award className="w-5 h-5" /><span className="hidden sm:inline">Portfolio</span>
                      </button>
                      <button
                        onClick={() => toggleSalesTeamSupport(product)}
                        className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium transition-colors min-h-[48px] ${
                          product.has_dright_sales_team
                            ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        <Users className="w-5 h-5" />
                        <span className="hidden sm:inline">{product.has_dright_sales_team ? 'Sales: On' : 'Sales: Off'}</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Reject Modal */}
      <AnimatePresence>
        {showRejectModal && selectedProduct && (
          <Modal
            icon={<AlertTriangle className="w-6 h-6 text-error" />}
            iconBg="bg-error-muted"
            title="Reject Product"
            subtitle={selectedProduct.name}
            onClose={() => setShowRejectModal(false)}
          >
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason for rejection (seller will be asked to re-edit and resubmit)
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Explain why this product is being rejected and what needs to be changed..."
                rows={3}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-error focus:ring-2 focus:ring-error/20 outline-none transition-all text-gray-900 resize-none"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowRejectModal(false)} className="flex-1 py-3 border border-gray-200 rounded-xl font-medium text-gray-600 hover:bg-gray-50 transition-colors min-h-[48px]">Cancel</button>
              <button
                onClick={rejectProduct}
                disabled={!rejectionReason.trim() || processingId === selectedProduct.id}
                className="flex-1 py-3 bg-error text-white rounded-xl font-medium hover:bg-red-600 transition-colors disabled:opacity-50 min-h-[48px] flex items-center justify-center"
              >
                {processingId === selectedProduct.id ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Reject Product'}
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Suspend Modal */}
      <AnimatePresence>
        {showSuspendModal && selectedProduct && (
          <Modal
            icon={<Ban className="w-6 h-6 text-purple-600" />}
            iconBg="bg-purple-100"
            title="Suspend Product"
            subtitle={selectedProduct.name}
            onClose={() => setShowSuspendModal(false)}
          >
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason for suspension (product will be hidden from the marketplace)
              </label>
              <textarea
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder="Explain why this product is being suspended..."
                rows={3}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition-all text-gray-900 resize-none"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowSuspendModal(false)} className="flex-1 py-3 border border-gray-200 rounded-xl font-medium text-gray-600 hover:bg-gray-50 transition-colors min-h-[48px]">Cancel</button>
              <button
                onClick={suspendProduct}
                disabled={!suspendReason.trim() || processingId === selectedProduct.id}
                className="flex-1 py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 min-h-[48px] flex items-center justify-center"
              >
                {processingId === selectedProduct.id ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Suspend Product'}
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Delete Modal */}
      <AnimatePresence>
        {showDeleteModal && selectedProduct && (
          <Modal
            icon={<Trash2 className="w-6 h-6 text-error" />}
            iconBg="bg-error-muted"
            title="Remove Product"
            subtitle={selectedProduct.name}
            onClose={() => setShowDeleteModal(false)}
          >
            <div className="p-3 bg-error-muted rounded-lg text-sm text-error mb-4">
              This will permanently remove the product from the marketplace. The seller will be notified.
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason for removal
              </label>
              <textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Explain why this product is being permanently removed..."
                rows={3}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-error focus:ring-2 focus:ring-error/20 outline-none transition-all text-gray-900 resize-none"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteModal(false)} className="flex-1 py-3 border border-gray-200 rounded-xl font-medium text-gray-600 hover:bg-gray-50 transition-colors min-h-[48px]">Cancel</button>
              <button
                onClick={deleteProduct}
                disabled={!deleteReason.trim() || processingId === selectedProduct.id}
                className="flex-1 py-3 bg-error text-white rounded-xl font-medium hover:bg-red-600 transition-colors disabled:opacity-50 min-h-[48px] flex items-center justify-center"
              >
                {processingId === selectedProduct.id ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Remove Product'}
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Duplicate Check Modal */}
      <AnimatePresence>
        {showDuplicateModal && selectedProduct && (
          <Modal
            icon={<Copy className="w-6 h-6 text-blue-600" />}
            iconBg="bg-blue-50"
            title="Duplicate Check"
            subtitle={selectedProduct.name}
            onClose={() => setShowDuplicateModal(false)}
            wide
          >
            {checkingDuplicates ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                <span className="ml-3 text-gray-500">Checking for duplicates...</span>
              </div>
            ) : duplicates.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="w-12 h-12 text-success mx-auto mb-3" />
                <p className="text-gray-900 font-semibold">No duplicates found</p>
                <p className="text-sm text-gray-500 mt-1">This product appears to be unique on the marketplace.</p>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2 mb-4 p-3 bg-warning-muted rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
                  <p className="text-sm text-warning font-medium">
                    {duplicates.length} potential duplicate{duplicates.length > 1 ? 's' : ''} found. Review to prevent copyright/ownership issues.
                  </p>
                </div>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {duplicates.map((dup) => (
                    <div key={dup.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{dup.name}</p>
                        <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                          <span>by {dup.uploader_email}</span>
                          <span>•</span>
                          <span>{dup.category}</span>
                          <span>•</span>
                          <span>{formatCurrency(dup.price)}</span>
                          <span>•</span>
                          {getStatusBadge(dup.approval_status)}
                        </div>
                      </div>
                      <div className="shrink-0 ml-3">
                        <div className={`text-lg font-bold ${dup.similarity >= 85 ? 'text-error' : dup.similarity >= 70 ? 'text-warning' : 'text-blue-600'}`}>
                          {dup.similarity}%
                        </div>
                        <div className="text-xs text-gray-400 text-center">match</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Modal>
        )}
      </AnimatePresence>

      {/* Portfolio Management Modal */}
      <AnimatePresence>
        {showPortfolioModal && portfolioProduct && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowPortfolioModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 p-6 border-b border-gray-100">
                <div className="p-3 bg-purple-50 rounded-xl"><Award className="w-6 h-6 text-purple-600" /></div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-gray-900">Portfolio Items</h3>
                  <p className="text-sm text-gray-500 truncate">{portfolioProduct.name}</p>
                </div>
                <button onClick={() => setShowPortfolioModal(false)} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-3">
                {portfolioLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
                  </div>
                ) : portfolioItems.length === 0 ? (
                  <div className="text-center py-12">
                    <Award className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No portfolio items for this service</p>
                  </div>
                ) : (
                  portfolioItems.map(item => (
                    <div key={item.id} className="flex items-center gap-4 p-3 bg-gray-50 rounded-xl">
                      {/* Preview */}
                      <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-200 shrink-0 flex items-center justify-center">
                        {item.item_type === 'IMAGE' && item.file_url ? (
                          <img src={item.file_url} alt="" className="w-full h-full object-cover" />
                        ) : item.item_type === 'VIDEO' ? (
                          <Video className="w-6 h-6 text-red-400" />
                        ) : item.item_type === 'PDF' ? (
                          <FileText className="w-6 h-6 text-orange-400" />
                        ) : (
                          <ExternalLink className="w-6 h-6 text-blue-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            item.item_type === 'IMAGE' ? 'bg-blue-100 text-blue-700' :
                            item.item_type === 'VIDEO' ? 'bg-red-100 text-red-700' :
                            item.item_type === 'PDF' ? 'bg-orange-100 text-orange-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>{item.item_type}</span>
                          {item.link_platform && <span className="text-xs text-gray-500">{item.link_platform}</span>}
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${item.is_approved ? 'bg-success-muted text-success' : 'bg-error-muted text-error'}`}>
                            {item.is_approved ? 'Approved' : 'Hidden'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5 truncate">
                          {item.file_url || item.external_url || '—'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => togglePortfolioItemApproval(item.id, item.is_approved)}
                          className={`p-2 rounded-lg transition-colors ${item.is_approved ? 'bg-gray-200 hover:bg-error-muted text-gray-600 hover:text-error' : 'bg-success-muted hover:bg-success text-success hover:text-white'}`}
                          title={item.is_approved ? 'Hide this item' : 'Approve this item'}
                        >
                          {item.is_approved ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => deletePortfolioItem(item.id)}
                          className="p-2 bg-error-muted text-error rounded-lg hover:bg-error hover:text-white transition-colors"
                          title="Delete permanently"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Modal({
  icon,
  iconBg,
  title,
  subtitle,
  onClose,
  children,
  wide,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.95 }}
        className={`bg-white rounded-2xl shadow-xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} p-6`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className={`p-3 ${iconBg} rounded-xl`}>{icon}</div>
          <div>
            <h3 className="font-bold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-500">{subtitle}</p>
          </div>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}
