import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Store, Package, Star, ChevronLeft, Download, Sparkles, Video,
  AlertCircle, Loader2, MessageSquare, MapPin,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import SeoHead from '../components/SeoHead';
import { startOrFindConversation } from '../lib/chatHooks';
import {
  type StoreTheme,
} from '../lib/storeThemes';
import { formatCurrency } from '../lib/currency';

interface StoreInfo {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  store_title: string | null;
  store_banner_url: string | null;
  store_description: string | null;
  store_location: string | null;
  store_theme: StoreTheme | null;
  average_rating: number;
  total_reviews: number;
  account_status: string;
}

interface StoreProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  category: string;
  is_free: boolean;
  product_type: string;
  approval_status: string;
  is_hidden: boolean;
  total_reviews: number;
  average_rating: number;
  created_at: string;
}

interface StoreJob {
  id: string;
  title: string;
  category: string;
  job_type: string;
  work_setup: string;
  region: string;
  created_at: string;
}

export default function PublicStorePage() {
  const { userId } = useParams<{ userId: string }>();
  const { user } = useAuth();
  const { t } = useLanguage();
  
  const navigate = useNavigate();
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [jobs, setJobs] = useState<StoreJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'products' | 'jobs'>('products');
  const [contactingStore, setContactingStore] = useState(false);

  useEffect(() => {
    if (!userId) return;
    fetchStoreData();
  }, [userId]);

  const fetchStoreData = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: storeData, error: storeErr } = await supabase
        .from('users')
        .select('id, full_name, avatar_url, store_title, store_banner_url, store_description, store_location, store_theme, average_rating, total_reviews, account_status')
        .eq('id', userId!)
        .maybeSingle();

      if (storeErr || !storeData) {
        setError('Store not found');
        setLoading(false);
        return;
      }
      setStore(storeData as StoreInfo);

      const [prodRes, jobRes] = await Promise.all([
        supabase
          .from('products')
          .select('id, name, description, price, image_url, category, is_free, product_type, approval_status, is_hidden, total_reviews, average_rating, created_at')
          .eq('uploaded_by', userId!)
          .eq('approval_status', 'approved')
          .eq('is_hidden', false)
          .order('created_at', { ascending: false }),
        supabase
          .from('jobs')
          .select('id, title, category, job_type, work_setup, region, created_at')
          .eq('employer_id', userId!)
          .order('created_at', { ascending: false })
          .limit(10),
      ]);

      if (prodRes.data) setProducts(prodRes.data as StoreProduct[]);
      if (jobRes.data) setJobs(jobRes.data as StoreJob[]);
    } catch (err) {
      console.error('Error fetching store:', err);
      setError('Failed to load store');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  if (error || !store) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center">
        <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 mb-4">{error || 'Store not found'}</p>
        <Link to="/market" className="text-primary-600 hover:underline">Back to Marketplace</Link>
      </div>
    );
  }

  const storeName = store.store_title || `${store.full_name || 'Seller'}'s Store`;

  return (
    <div className="min-h-screen bg-gray-50">
      <SeoHead
        title={storeName}
        description={`Shop from ${store.full_name || 'this seller'} on Dright. ${products.length} products available.`}
        canonical={`/shop/${store.id}`}
        keywords={[store.full_name || '', storeName, 'dright store', 'marketplace']}
        breadcrumbs={[
          { name: 'Home', url: '/welcome' },
          { name: 'Marketplace', url: '/market' },
          { name: storeName },
        ]}
      />

      {/* Banner */}
      <div
        className="relative h-48 md:h-64 overflow-hidden bg-gradient-to-br from-primary-600 to-primary-400"
      >
        {store.store_banner_url ? (
          <img src={store.store_banner_url} alt={`${storeName} banner`} className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Store className="w-20 h-20 text-white/30" />
          </div>
        )}
        <Link
          to="/market"
          className="absolute top-4 left-4 inline-flex items-center gap-2 px-3 py-2 bg-white/90 backdrop-blur text-gray-700 rounded-xl text-sm font-medium hover:bg-white transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> {t('backToMarket')}
        </Link>
      </div>

      {/* Store Header */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 -mt-12 relative z-10">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col md:flex-row md:items-center gap-4">
          <div
            className="w-20 h-20 md:w-24 md:h-24 rounded-2xl flex items-center justify-center overflow-hidden shrink-0 ring-4 ring-white bg-primary-600"
          >
            {store.avatar_url ? (
              <img src={store.avatar_url} alt={store.full_name || 'Seller'} className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl font-bold text-white">
                {(store.full_name || 'S')[0]?.toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-gray-900">{storeName}</h1>
            <p className="text-sm text-gray-500 mt-0.5">by {store.full_name || 'Anonymous'}</p>
            {store.store_location && (
              <p className="text-sm text-gray-600 flex items-center gap-1 mt-1">
                <MapPin className="w-4 h-4 text-primary-500" /> {store.store_location}
              </p>
            )}
            {store.store_description && (
              <p className="text-sm text-gray-600 mt-2 leading-relaxed">{store.store_description}</p>
            )}
            <div className="flex items-center gap-3 mt-2">
              {store.total_reviews > 0 && (
                <div className="flex items-center gap-1">
                  <Star className="w-4 h-4 fill-warning text-warning" />
                  <span className="text-sm font-medium text-gray-700">
                    {Number(store.average_rating || 0).toFixed(1)}
                  </span>
                  <span className="text-sm text-gray-400">({store.total_reviews} {t('reviews')})</span>
                </div>
              )}
              <span className="text-xs font-medium text-success bg-success-muted px-2 py-0.5 rounded-full">
                {products.length} {t('products')}
              </span>
              {jobs.length > 0 && (
                <span className="text-xs font-medium text-primary-700 bg-primary-50 px-2 py-0.5 rounded-full">
                  {jobs.length} {t('jobs')}
                </span>
              )}
            </div>
          </div>
          {user ? (
            <button
              disabled={contactingStore || user.id === userId}
              onClick={async () => {
                if (!userId || !store) return;
                setContactingStore(true);
                try {
                  const convId = await startOrFindConversation({
                    currentUserId: user.id,
                    otherUserId: userId,
                    contextType: 'store_inquiry',
                    contextId: userId,
                    contextData: {
                      title: store.store_title || store.full_name || 'Store',
                      image_url: store.avatar_url,
                      rating: store.average_rating,
                      store_name: store.store_title || store.full_name || undefined,
                      location: store.store_location || undefined,
                    },
                  });
                  if (convId) navigate(`/chat?conv=${convId}`);
                } finally {
                  setContactingStore(false);
                }
              }}
              className="inline-flex items-center gap-2 px-5 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold transition-colors shrink-0 disabled:opacity-60"
            >
              {contactingStore ? <Loader2 className="w-5 h-5 animate-spin" /> : <MessageSquare className="w-5 h-5" />}
              {t('contact')}
            </button>
          ) : (
            <Link
              to="/sign-in"
              className="inline-flex items-center gap-2 px-5 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold transition-colors shrink-0"
            >
              <MessageSquare className="w-5 h-5" />
              {t('contact')}
            </Link>
          )}
        </div>

        {/* Tabs */}
        {jobs.length > 0 && (
          <div className="flex gap-2 mt-6">
            <button
              onClick={() => setActiveTab('products')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                activeTab === 'products' ? 'text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-primary-300'
              }`}
              style={activeTab === 'products' ? { backgroundColor: '#4f46e5' } : {}}
            >
              {t('products')} ({products.length})
            </button>
            <button
              onClick={() => setActiveTab('jobs')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                activeTab === 'jobs' ? 'text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-primary-300'
              }`}
              style={activeTab === 'jobs' ? { backgroundColor: '#4f46e5' } : {}}
            >
              {t('jobs')} ({jobs.length})
            </button>
          </div>
        )}

        {/* Products Grid */}
        {activeTab === 'products' && (
          <div className="mt-6 mb-12">
            {products.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-20 h-20 bg-gray-100 rounded-3xl flex items-center justify-center mb-4">
                  <Package className="w-10 h-10 text-gray-400" />
                </div>
                <p className="text-gray-500">{t('noProducts')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {products.map((product, index) => (
                  <motion.div
                    key={product.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04 }}
                    className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow group flex flex-col"
                  >
                    <Link to={`/product/${product.id}`} className="block relative h-40 bg-gray-50 overflow-hidden">
                      {product.image_url ? (
                        <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
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
                    </Link>
                    <div className="p-4 flex flex-col flex-1">
                      <Link to={`/product/${product.id}`}>
                        <h3 className="font-semibold text-gray-900 text-sm leading-tight line-clamp-2 mb-1.5 hover:text-primary-600 transition-colors">
                          {product.name}
                        </h3>
                      </Link>
                      {product.description && (
                        <p className="text-xs text-gray-500 line-clamp-2 mb-3">{product.description}</p>
                      )}
                      <div className="flex items-center justify-between mt-auto">
                        {product.is_free ? (
                          <p className="text-lg font-bold text-success">{t('free')}</p>
                        ) : (
                          <p className="text-lg font-bold text-gray-900">{formatCurrency(Number(product.price))}</p>
                        )}
                        {product.total_reviews > 0 && (
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <Star className="w-3 h-3 fill-warning text-warning" />
                            {Number(product.average_rating || 0).toFixed(1)}
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Jobs List */}
        {activeTab === 'jobs' && (
          <div className="mt-6 mb-12">
            {jobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <p className="text-gray-500">{t('noJobs')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {jobs.map((job, index) => (
                  <motion.div
                    key={job.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04 }}
                  >
                    <Link
                      to={`/jobs/${job.id}`}
                      className="block bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 hover:text-primary-600 transition-colors">{job.title}</h3>
                          <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-gray-500">
                            <span className="bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full">{job.category}</span>
                            <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{job.job_type}</span>
                            <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{job.work_setup}</span>
                            <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{job.region}</span>
                          </div>
                        </div>
                        <span className="text-xs text-gray-400 shrink-0">
                          {new Date(job.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
