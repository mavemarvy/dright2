import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Heart, Trash2, Package,
  FolderPlus,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useWishlist, useRecentlyViewed } from '../lib/marketplaceHooks';
import { getRecentlyViewedIds, clearRecentlyViewed } from '../lib/marketplace';
import ProductCard, { type MarketplaceProduct } from '../components/marketplace/ProductCard';
import { formatCurrency } from '../lib/currency';

export default function WishlistPage() {
  const { user } = useAuth();
    const { wishlistIds, toggleWishlist } = useWishlist(user?.id);
  const { recentlyViewed, refetch: refetchRecent } = useRecentlyViewed(user?.id);

  const [wishlistProducts, setWishlistProducts] = useState<MarketplaceProduct[]>([]);
  const [recentProducts, setRecentProducts] = useState<MarketplaceProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFolder, setActiveFolder] = useState('All');
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [folders, setFolders] = useState<string[]>(['All']);
  const [newFolderName, setNewFolderName] = useState('');


  const fetchWishlistProducts = useCallback(async () => {
    if (!user || wishlistIds.size === 0) {
      setWishlistProducts([]);
      setLoading(false);
      return;
    }
    const ids = Array.from(wishlistIds);
    const { data } = await supabase
      .from('products')
      .select(`
        id, name, description, price, commission_rate, image_url, category,
        uploaded_by, created_at, sales_team_tier, is_free, stock_quantity,
        initial_stock, product_type, demo_video_url, total_reviews,
        average_rating, total_sales, view_count
      `)
      .in('id', ids)
      .eq('is_active', true)
      .eq('is_hidden', false)
      .eq('approval_status', 'approved');

    if (data) {
      // Fetch folder info from wishlist
      const { data: wishlistData } = await supabase
        .from('wishlist')
        .select('product_id, folder')
        .eq('user_id', user.id);
      const folderMap = new Map((wishlistData || []).map(w => [w.product_id, w.folder]));
      const uniqueFolders = new Set<string>(['All']);
      for (const w of wishlistData || []) {
        if (w.folder) uniqueFolders.add(w.folder);
      }
      setFolders(Array.from(uniqueFolders));

      // Fetch seller info
      const sellerIds = [...new Set(data.map(p => p.uploaded_by))];
      const { data: sellers } = await supabase
        .from('users')
        .select('id, full_name, avatar_url, is_verified')
        .in('id', sellerIds);
      const sellerMap = new Map((sellers || []).map(s => [s.id, s]));

      const enriched = data.map(p => {
        const seller = sellerMap.get(p.uploaded_by);
        return {
          ...p,
          seller_name: seller?.full_name || null,
          seller_avatar: seller?.avatar_url || null,
          seller_verified: seller?.is_verified || false,
          _folder: folderMap.get(p.id),
        } as MarketplaceProduct & { _folder?: string | null };
      });
      setWishlistProducts(enriched);
    }
    setLoading(false);
  }, [user, wishlistIds]);

  const fetchRecentProducts = useCallback(async () => {
    const ids = recentlyViewed.length > 0
      ? recentlyViewed
      : getRecentlyViewedIds();
    if (ids.length === 0) {
      setRecentProducts([]);
      return;
    }
    const { data } = await supabase
      .from('products')
      .select(`
        id, name, description, price, commission_rate, image_url, category,
        uploaded_by, created_at, sales_team_tier, is_free, stock_quantity,
        initial_stock, product_type, demo_video_url, total_reviews,
        average_rating, total_sales, view_count
      `)
      .in('id', ids.slice(0, 12))
      .eq('is_active', true)
      .eq('is_hidden', false)
      .eq('approval_status', 'approved');

    if (data) {
      const sellerIds = [...new Set(data.map(p => p.uploaded_by))];
      const { data: sellers } = await supabase
        .from('users')
        .select('id, full_name, avatar_url, is_verified')
        .in('id', sellerIds);
      const sellerMap = new Map((sellers || []).map(s => [s.id, s]));
      const orderMap = new Map(ids.map((id, idx) => [id, idx]));
      const enriched = data
        .map(p => {
          const seller = sellerMap.get(p.uploaded_by);
          return {
            ...p,
            seller_name: seller?.full_name || null,
            seller_avatar: seller?.avatar_url || null,
            seller_verified: seller?.is_verified || false,
          } as MarketplaceProduct;
        })
        .sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999));
      setRecentProducts(enriched);
    }
  }, [recentlyViewed]);

  useEffect(() => {
    fetchWishlistProducts();
  }, [fetchWishlistProducts]);

  useEffect(() => {
    fetchRecentProducts();
  }, [fetchRecentProducts]);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !user) return;
    setFolders(prev => [...prev, newFolderName.trim()]);
    setNewFolderName('');
    setShowFolderModal(false);
  };

  const handleClearRecent = () => {
    clearRecentlyViewed();
    setRecentProducts([]);
    refetchRecent();
  };

  const filteredWishlist = activeFolder === 'All'
    ? wishlistProducts
    : wishlistProducts.filter(p => (p as MarketplaceProduct & { _folder?: string | null })._folder === activeFolder);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      {/* Wishlist section */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Heart className="w-6 h-6 text-red-500 fill-red-500" /> My Wishlist
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {wishlistProducts.length} saved item{wishlistProducts.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setShowFolderModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition-colors"
        >
          <FolderPlus className="w-4 h-4" /> New Folder
        </button>
      </div>

      {/* Folder tabs */}
      {folders.length > 1 && (
        <div className="flex items-center gap-2 mb-6 overflow-x-auto">
          {folders.map(folder => (
            <button
              key={folder}
              onClick={() => setActiveFolder(folder)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors shrink-0 ${
                activeFolder === folder
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {folder}
            </button>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="h-48 bg-gray-100 animate-pulse" />
              <div className="p-4 space-y-3">
                <div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" />
                <div className="h-6 bg-gray-100 rounded animate-pulse w-1/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty wishlist */}
      {!loading && wishlistProducts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-24 h-24 bg-gray-100 rounded-3xl flex items-center justify-center mb-5">
            <Heart className="w-12 h-12 text-gray-300" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Your wishlist is empty</h3>
          <p className="text-gray-500 mb-6">Save products you love to find them quickly later.</p>
          <Link
            to="/market"
            className="flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold transition-colors"
          >
            Browse Marketplace
          </Link>
        </div>
      )}

      {/* Wishlist grid */}
      {!loading && filteredWishlist.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filteredWishlist.map((product, index) => (
            <ProductCard
              key={product.id}
              product={product}
              index={index}
              inWishlist={true}
              onToggleWishlist={toggleWishlist}
              onQuickView={() => {}}
              onShare={() => {}}
              onCopyAffiliate={() => {}}
            />
          ))}
        </div>
      )}

      {/* Recently viewed section */}
      {!loading && recentProducts.length > 0 && (
        <div className="mt-12">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Recently Viewed</h2>
              <p className="text-sm text-gray-500 mt-0.5">Continue where you left off</p>
            </div>
            <button
              onClick={handleClearRecent}
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-error transition-colors"
            >
              <Trash2 className="w-4 h-4" /> Clear
            </button>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
            {recentProducts.map(product => (
              <Link
                key={product.id}
                to={`/product/${product.id}`}
                className="shrink-0 w-48 bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-md transition-shadow group"
              >
                <div className="relative h-32 bg-gray-50 overflow-hidden">
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-10 h-10 text-gray-300" />
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <p className="text-sm font-medium text-gray-900 line-clamp-1">{product.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{product.category}</p>
                  <p className="text-sm font-bold text-gray-900 mt-1">
                    {product.is_free ? 'FREE' : formatCurrency(product.price)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Folder modal */}
      <AnimatePresence>
        {showFolderModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowFolderModal(false)}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4"
            >
              <h3 className="text-lg font-bold text-gray-900">Create New Folder</h3>
              <input
                type="text"
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                placeholder="Folder name..."
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none"
                onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); }}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowFolderModal(false)}
                  className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateFolder}
                  disabled={!newFolderName.trim()}
                  className="flex-1 py-2.5 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 transition-colors disabled:opacity-50"
                >
                  Create
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
