import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package, Download, Clock, CheckCircle, Loader2,
  ShoppingCart, RefreshCw, MessageSquare,
  ChevronLeft, Sparkles, XCircle, AlertCircle, Play,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import VideoPlayer from '../components/VideoPlayer';
import { BuyerAnalyticsDashboard } from '../components/analytics/BuyerAnalyticsDashboard';
import { formatCurrency } from '../lib/currency';

interface Order {
  id: string;
  product_id: string;
  seller_id: string;
  order_type: string;
  status: string;
  base_price: number;
  tier_price: number;
  customization_price: number;
  final_price: number;
  buyer_requirements: string | null;
  delivery_url: string | null;
  download_token: string | null;
  is_free_order: boolean;
  created_at: string;
  completed_at: string | null;
  selected_tier_id: string | null;
  customization_options: any;
  product_name?: string;
  product_image?: string | null;
  product_type?: string;
  seller_email?: string;
}

type Tab = 'active' | 'completed' | 'downloads';

export default function BuyerDashboardPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('active');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [downloadLoading, setDownloadLoading] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [playingVideoFor, setPlayingVideoFor] = useState<string | null>(null);
  const [orderVideoUrls, setOrderVideoUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (user) fetchOrders();
  }, [user]);

  // Auto-refresh when returning from payment callback
  useEffect(() => {
    const handler = () => { if (user) fetchOrders(); };
    window.addEventListener('wallet-updated', handler);
    return () => window.removeEventListener('wallet-updated', handler);
  }, [user]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('buyer_id', user!.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!data || data.length === 0) { setOrders([]); return; }

      // Fetch product names and seller emails
      const productIds = [...new Set(data.map(o => o.product_id))];
      const sellerIds = [...new Set(data.map(o => o.seller_id))];

      const [productsRes, sellersRes] = await Promise.all([
        supabase.from('products').select('id, name, image_url, product_type').in('id', productIds),
        supabase.from('users').select('id, email').in('id', sellerIds),
      ]);

      const productMap = new Map(productsRes.data?.map(p => [p.id, p]) || []);
      const sellerMap = new Map(sellersRes.data?.map(s => [s.id, s.email]) || []);

      setOrders(data.map(o => ({
        ...o,
        product_name: productMap.get(o.product_id)?.name || 'Unknown Product',
        product_image: productMap.get(o.product_id)?.image_url || null,
        product_type: productMap.get(o.product_id)?.product_type || 'PHYSICAL',
        seller_email: sellerMap.get(o.seller_id) || 'Unknown',
      })) as Order[]);
    } catch (err) {
      console.error('Error fetching orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestRevision = async (orderId: string) => {
    setActionLoading(orderId);
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'REVISION_REQUESTED' })
        .eq('id', orderId);
      if (error) throw error;
      fetchOrders();
    } catch (err) {
      console.error('Error requesting revision:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCompleteOrder = async (orderId: string) => {
    setActionLoading(orderId);
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'COMPLETED', completed_at: new Date().toISOString() })
        .eq('id', orderId);
      if (error) throw error;
      fetchOrders();
    } catch (err) {
      console.error('Error completing order:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDownload = async (order: Order) => {
    if (!order.download_token) return;
    setDownloadLoading(order.id);
    setDownloadError(null);
    setDownloadSuccess(null);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-download`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          download_token: order.download_token,
          order_id: order.id,
          user_id: user?.id,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.verified) {
        setDownloadError(data.error || 'Download verification failed');
        return;
      }
      // Auto-open download or access link in a new tab
      if (data.download_url) {
        window.open(data.download_url, '_blank');
      } else if (data.access_link) {
        window.open(data.access_link, '_blank');
      }
      // Store video URL if available
      if (data.video_url) {
        setOrderVideoUrls(prev => ({ ...prev, [order.id]: data.video_url }));
      }
      setDownloadSuccess(`Access verified! ${data.download_url ? 'Download started.' : 'Access link opened.'} ${data.days_remaining ? `${data.days_remaining} days remaining.` : ''}`);
    } catch (err: any) {
      setDownloadError(err.message || 'Failed to verify download');
    } finally {
      setDownloadLoading(null);
    }
  };

  
  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const activeStatuses = ['PENDING', 'IN_PROGRESS', 'DELIVERED', 'REVISION_REQUESTED'];
  const activeOrders = orders.filter(o => activeStatuses.includes(o.status));
  const completedOrders = orders.filter(o => o.status === 'COMPLETED');
  const downloadOrders = orders.filter(o =>
    (o.order_type === 'DIGITAL' || o.order_type === 'COURSE') &&
    o.status === 'COMPLETED' && o.download_token
  );

  const displayOrders = tab === 'active' ? activeOrders : tab === 'completed' ? completedOrders : downloadOrders;

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { color: string; icon: typeof Clock; label: string }> = {
      PENDING: { color: 'bg-warning-muted text-warning', icon: Clock, label: 'Pending' },
      IN_PROGRESS: { color: 'bg-blue-50 text-blue-600', icon: Loader2, label: 'In Progress' },
      DELIVERED: { color: 'bg-purple-50 text-purple-600', icon: Package, label: 'Delivered' },
      REVISION_REQUESTED: { color: 'bg-orange-50 text-orange-600', icon: RefreshCw, label: 'Revision Requested' },
      COMPLETED: { color: 'bg-success-muted text-success', icon: CheckCircle, label: 'Completed' },
      CANCELLED: { color: 'bg-gray-100 text-gray-500', icon: XCircle, label: 'Cancelled' },
    };
    return configs[status] || configs.PENDING;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-gray-300 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Orders</h1>
        <p className="text-gray-500 mt-1">Track your purchases, downloads, and service orders</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {([
          { value: 'active', label: 'Active', count: activeOrders.length },
          { value: 'completed', label: 'Completed', count: completedOrders.length },
          { value: 'downloads', label: 'Downloads', count: downloadOrders.length },
        ] as const).map(t => (
          <button key={t.value} onClick={() => setTab(t.value)}
            className={`px-4 py-3 rounded-xl font-medium transition-all flex items-center gap-2 min-h-[48px] ${
              tab === t.value ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-primary-300'
            }`}>
            {t.label}
            {t.count > 0 && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${tab === t.value ? 'bg-white/20' : 'bg-gray-100'}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {displayOrders.length === 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-900 font-semibold text-lg">
            {tab === 'active' ? 'No active orders' : tab === 'completed' ? 'No completed orders' : 'No downloads yet'}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {tab === 'downloads' ? 'Your digital purchases will appear here' : 'Browse the marketplace to find products'}
          </p>
          <Link to="/market" className="mt-4 inline-flex items-center gap-2 px-4 py-3 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 transition-colors">
            <ShoppingCart className="w-4 h-4" />Browse Market
          </Link>
        </div>
      )}

      {/* Orders list */}
      <div className="space-y-4">
        {displayOrders.map((order, idx) => {
          const statusCfg = getStatusConfig(order.status);
          const StatusIcon = statusCfg.icon;
          const isDigital = order.order_type === 'DIGITAL' || order.order_type === 'COURSE';
          const isService = order.order_type === 'SERVICE';

          return (
            <motion.div key={order.id}
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="flex flex-col sm:flex-row gap-4 p-5">
                {/* Product image */}
                <Link to={`/product/${order.product_id}`} className="w-full sm:w-28 h-28 rounded-xl overflow-hidden bg-gray-100 shrink-0">
                  {order.product_image ? (
                    <img src={order.product_image} alt={order.product_name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      {isDigital ? <Download className="w-8 h-8 text-gray-300" /> : isService ? <Sparkles className="w-8 h-8 text-gray-300" /> : <Package className="w-8 h-8 text-gray-300" />}
                    </div>
                  )}
                </Link>

                {/* Order info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <Link to={`/product/${order.product_id}`} className="font-semibold text-gray-900 hover:text-primary-600">{order.product_name}</Link>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${statusCfg.color}`}>
                          <StatusIcon className="w-3 h-3" />{statusCfg.label}
                        </span>
                        <span className="text-xs text-gray-400">{formatDate(order.created_at)}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {order.is_free_order ? (
                        <p className="text-lg font-bold text-success">FREE</p>
                      ) : (
                        <p className="text-lg font-bold text-gray-900">{formatCurrency(Number(order.final_price))}</p>
                      )}
                    </div>
                  </div>

                  {/* Service requirements */}
                  {isService && order.buyer_requirements && (
                    <div className="mt-2 p-2 bg-gray-50 rounded-lg text-sm text-gray-600">
                      <p className="text-xs font-medium text-gray-500 flex items-center gap-1 mb-1"><MessageSquare className="w-3 h-3" />Your Requirements:</p>
                      <p className="line-clamp-2">{order.buyer_requirements}</p>
                    </div>
                  )}

                  {/* Customizations */}
                  {isService && order.customization_options && Array.isArray(order.customization_options) && order.customization_options.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {order.customization_options.map((opt: any, i: number) => (
                        <span key={i} className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full">{opt.name}</span>
                      ))}
                    </div>
                  )}

                  {/* Download status messages */}
                  {downloadError && downloadLoading !== order.id && (
                    <div className="mt-2 rounded-lg p-3 bg-error-muted border border-error/20 text-error flex items-center gap-2 text-sm">
                      <AlertCircle className="w-4 h-4 shrink-0" />{downloadError}
                    </div>
                  )}
                  {downloadSuccess && downloadLoading !== order.id && !downloadError && (
                    <div className="mt-2 rounded-lg p-3 bg-success-muted border border-success/20 text-success flex items-center gap-2 text-sm">
                      <CheckCircle className="w-4 h-4 shrink-0" />{downloadSuccess}
                    </div>
                  )}

                  {/* In-app video player */}
                  <AnimatePresence>
                    {playingVideoFor === order.id && orderVideoUrls[order.id] && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-3 overflow-hidden"
                      >
                        <VideoPlayer url={orderVideoUrls[order.id]} title={`${order.product_name} — Demo Video`} />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Seller info */}
                  <p className="text-xs text-gray-500 mt-2">Seller: {order.seller_email}</p>

                  {/* Actions */}
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {/* Download button for digital */}
                    {isDigital && order.status === 'COMPLETED' && order.download_token && (
                      <button onClick={() => handleDownload(order)} disabled={downloadLoading === order.id}
                        className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 transition-colors min-h-[44px] disabled:opacity-50">
                        {downloadLoading === order.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}Verify & Download
                      </button>
                    )}

                    {/* Play demo video button */}
                    {isDigital && order.status === 'COMPLETED' && orderVideoUrls[order.id] && (
                      <button onClick={() => setPlayingVideoFor(playingVideoFor === order.id ? null : order.id)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:border-primary-300 transition-colors min-h-[44px]">
                        <Play className="w-4 h-4 text-primary-600" />{playingVideoFor === order.id ? 'Hide Video' : 'Play Demo'}
                      </button>
                    )}

                    {/* Complete order (service, delivered) */}
                    {isService && order.status === 'DELIVERED' && (
                      <button onClick={() => handleCompleteOrder(order.id)} disabled={actionLoading === order.id}
                        className="flex items-center gap-2 px-4 py-2.5 bg-success text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-colors min-h-[44px] disabled:opacity-50">
                        {actionLoading === order.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}Accept Delivery
                      </button>
                    )}

                    {/* Request revision (service, delivered) */}
                    {isService && order.status === 'DELIVERED' && (
                      <button onClick={() => handleRequestRevision(order.id)} disabled={actionLoading === order.id}
                        className="flex items-center gap-2 px-4 py-2.5 bg-orange-50 text-orange-600 rounded-xl text-sm font-medium hover:bg-orange-100 transition-colors min-h-[44px] disabled:opacity-50">
                        <RefreshCw className="w-4 h-4" />Request Revision
                      </button>
                    )}

                    {/* View product */}
                    <Link to={`/product/${order.product_id}`}
                      className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors min-h-[44px]">
                      <ChevronLeft className="w-4 h-4" />View Product
                    </Link>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Real-time Buyer Analytics */}
      <div className="mt-8">
        <BuyerAnalyticsDashboard />
      </div>
    </div>
  );
}
