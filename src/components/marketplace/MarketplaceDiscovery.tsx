import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Star, BadgeCheck, Package, Briefcase,
  ChevronRight, Sparkles, Users,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/currency';
import ProductCard, { type MarketplaceProduct } from './ProductCard';
import { useAuth } from '../../contexts/AuthContext';
import { useWishlist } from '../../lib/marketplaceHooks';

// ─── Shared section shell ──────────────────────────────────────────────────────

function SectionShell({
  title, subtitle, icon, children, viewAllLink,
}: {
  title: string; subtitle?: string; icon: React.ReactNode;
  children: React.ReactNode; viewAllLink?: string;
}) {
  return (
    <section className="py-8 sm:py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center text-primary-600">
              {icon}
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">{title}</h2>
              {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
            </div>
          </div>
          {viewAllLink && (
            <Link to={viewAllLink} className="flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700">
              View all <ChevronRight className="w-4 h-4" />
            </Link>
          )}
        </div>
        {children}
      </div>
    </section>
  );
}

function SkeletonRow({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="h-48 bg-gray-100 animate-pulse" />
          <div className="p-4 space-y-2">
            <div className="h-3 bg-gray-100 rounded animate-pulse w-1/2" />
            <div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" />
            <div className="h-6 bg-gray-100 rounded animate-pulse w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── New Arrivals ──────────────────────────────────────────────────────────────

export function NewArrivalsSection() {
  const { user } = useAuth();
  const { wishlistIds, toggleWishlist } = useWishlist(user?.id);
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('products')
        .select('id, name, description, price, commission_rate, image_url, category, uploaded_by, created_at, is_free, stock_quantity, product_type, total_reviews, average_rating, total_sales, view_count, is_featured, is_sponsored')
        .eq('is_active', true)
        .eq('is_hidden', false)
        .eq('approval_status', 'approved')
        .order('created_at', { ascending: false })
        .limit(8);
      if (!data || data.length === 0) { setLoading(false); return; }

      const sellerIds = [...new Set(data.map(p => p.uploaded_by))];
      const { data: sellers } = await supabase
        .from('users')
        .select('id, full_name, avatar_url, store_title, is_verified, account_status')
        .in('id', sellerIds);
      const sellerMap = new Map((sellers || []).map(s => [s.id, s]));
      const enriched = data.map(p => {
        const seller = sellerMap.get(p.uploaded_by);
        return { ...p, seller_name: seller?.full_name || null, seller_avatar: seller?.avatar_url || null, seller_verified: seller?.is_verified || false, store_name: seller?.store_title || null } as MarketplaceProduct;
      });
      setProducts(enriched);
      setLoading(false);
    })();
  }, []);

  if (!loading && products.length === 0) return null;

  return (
    <SectionShell title="New Arrivals" subtitle="Fresh listings just published" icon={<Sparkles className="w-5 h-5" />} viewAllLink="/market?sort=newest">
      {loading ? <SkeletonRow /> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
          {products.map((p, i) => (
            <ProductCard key={p.id} product={p} index={i} inWishlist={wishlistIds.has(p.id)} onToggleWishlist={toggleWishlist} onQuickView={() => {}} onShare={() => {}} onCopyAffiliate={() => {}} />
          ))}
        </div>
      )}
    </SectionShell>
  );
}

// ─── Featured Sellers ──────────────────────────────────────────────────────────

interface FeaturedSeller {
  id: string; full_name: string; avatar_url: string | null;
  store_title: string | null; is_verified: boolean;
  average_rating: number; total_reviews: number; product_count: number;
}

export function FeaturedSellersSection() {
  const [sellers, setSellers] = useState<FeaturedSeller[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('products')
        .select('uploaded_by, total_sales, average_rating, total_reviews')
        .eq('is_active', true)
        .eq('approval_status', 'approved')
        .order('total_sales', { ascending: false })
        .limit(100);

      if (!data || data.length === 0) { setLoading(false); return; }

      const sellerMap = new Map<string, { totalSales: number; totalRating: number; totalReviews: number; productCount: number }>();
      for (const p of data) {
        const existing = sellerMap.get(p.uploaded_by) || { totalSales: 0, totalRating: 0, totalReviews: 0, productCount: 0 };
        existing.totalSales += p.total_sales ?? 0;
        existing.totalRating += (p.average_rating ?? 0) * (p.total_reviews ?? 0);
        existing.totalReviews += p.total_reviews ?? 0;
        existing.productCount += 1;
        sellerMap.set(p.uploaded_by, existing);
      }

      const topSellerIds = [...sellerMap.entries()]
        .sort((a, b) => b[1].totalSales - a[1].totalSales)
        .slice(0, 6)
        .map(([id]) => id);

      if (topSellerIds.length === 0) { setLoading(false); return; }

      const { data: sellerData } = await supabase
        .from('users')
        .select('id, full_name, avatar_url, store_title, is_verified')
        .in('id', topSellerIds);

      const enriched = topSellerIds.map(id => {
        const seller = sellerData?.find(s => s.id === id);
        const stats = sellerMap.get(id)!;
        return {
          id, full_name: seller?.full_name || 'Seller',
          avatar_url: seller?.avatar_url || null,
          store_title: seller?.store_title || null,
          is_verified: seller?.is_verified || false,
          average_rating: stats.totalReviews > 0 ? stats.totalRating / stats.totalReviews : 0,
          total_reviews: stats.totalReviews,
          product_count: stats.productCount,
        };
      });
      setSellers(enriched);
      setLoading(false);
    })();
  }, []);

  if (!loading && sellers.length === 0) return null;

  return (
    <SectionShell title="Featured Sellers" subtitle="Top-performing creators on Dright" icon={<Users className="w-5 h-5" />}>
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 text-center">
              <div className="w-16 h-16 rounded-full bg-gray-100 animate-pulse mx-auto mb-3" />
              <div className="h-4 bg-gray-100 rounded animate-pulse w-2/3 mx-auto mb-2" />
              <div className="h-3 bg-gray-100 rounded animate-pulse w-1/2 mx-auto" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {sellers.map((seller, i) => (
            <motion.div
              key={seller.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Link
                to={`/store/${seller.id}`}
                className="block bg-white rounded-2xl border border-gray-100 p-5 text-center hover:shadow-md hover:border-gray-200 transition-all group"
              >
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary-100 to-purple-100 flex items-center justify-center mx-auto mb-3 overflow-hidden ring-2 ring-white shadow-sm group-hover:scale-105 transition-transform">
                  {seller.avatar_url ? (
                    <img src={seller.avatar_url} alt={seller.full_name} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <span className="text-xl font-bold text-primary-600">{seller.full_name[0]?.toUpperCase()}</span>
                  )}
                </div>
                <div className="flex items-center justify-center gap-1 mb-1">
                  <h3 className="font-semibold text-gray-900 text-sm truncate max-w-[120px]">{seller.store_title || seller.full_name}</h3>
                  {seller.is_verified && <BadgeCheck className="w-4 h-4 text-blue-500 shrink-0" />}
                </div>
                <div className="flex items-center justify-center gap-2 text-xs text-gray-400 mb-2">
                  {(seller.average_rating ?? 0) > 0 && (
                    <span className="flex items-center gap-0.5">
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      {seller.average_rating.toFixed(1)}
                    </span>
                  )}
                  <span className="flex items-center gap-0.5">
                    <Package className="w-3 h-3" /> {seller.product_count}
                  </span>
                </div>
                <span className="inline-block text-xs font-medium text-primary-600 bg-primary-50 rounded-full px-3 py-1">Visit Store</span>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </SectionShell>
  );
}

// ─── Featured Services ──────────────────────────────────────────────────────────

export function FeaturedServicesSection() {
  const { user } = useAuth();
  const { wishlistIds, toggleWishlist } = useWishlist(user?.id);
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('products')
        .select('id, name, description, price, commission_rate, image_url, category, uploaded_by, created_at, is_free, product_type, total_reviews, average_rating, total_sales, view_count, is_featured, is_sponsored')
        .eq('is_active', true)
        .eq('is_hidden', false)
        .eq('approval_status', 'approved')
        .or('category.ilike.%service%,category.ilike.%freelanc%')
        .order('total_sales', { ascending: false })
        .limit(4);
      if (!data || data.length === 0) { setLoading(false); return; }

      const sellerIds = [...new Set(data.map(p => p.uploaded_by))];
      const { data: sellers } = await supabase
        .from('users')
        .select('id, full_name, avatar_url, store_title, is_verified, account_status')
        .in('id', sellerIds);
      const sellerMap = new Map((sellers || []).map(s => [s.id, s]));
      const enriched = data.map(p => {
        const seller = sellerMap.get(p.uploaded_by);
        return { ...p, seller_name: seller?.full_name || null, seller_avatar: seller?.avatar_url || null, seller_verified: seller?.is_verified || false, store_name: seller?.store_title || null } as MarketplaceProduct;
      });
      setProducts(enriched);
      setLoading(false);
    })();
  }, []);

  if (!loading && products.length === 0) return null;

  return (
    <SectionShell title="Featured Services" subtitle="Professional work from verified providers" icon={<Briefcase className="w-5 h-5" />} viewAllLink="/market?category=Services">
      {loading ? <SkeletonRow count={4} /> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
          {products.map((p, i) => (
            <ProductCard key={p.id} product={p} index={i} inWishlist={wishlistIds.has(p.id)} onToggleWishlist={toggleWishlist} onQuickView={() => {}} onShare={() => {}} onCopyAffiliate={() => {}} />
          ))}
        </div>
      )}
    </SectionShell>
  );
}

// ─── Jobs & Opportunities ───────────────────────────────────────────────────────

interface JobListing {
  id: string; name: string; description: string | null;
  price: number; image_url: string | null; category: string;
  uploaded_by: string; created_at: string; product_type: string;
  seller_name: string | null; seller_avatar: string | null;
  seller_verified: boolean;
}

export function JobsSection() {
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('products')
        .select('id, name, description, price, image_url, category, uploaded_by, created_at, product_type')
        .eq('is_active', true)
        .eq('is_hidden', false)
        .eq('approval_status', 'approved')
        .or('category.ilike.%job%,product_type.eq.job')
        .order('created_at', { ascending: false })
        .limit(6);
      if (!data || data.length === 0) { setLoading(false); return; }

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
        } as JobListing;
      });
      setJobs(enriched);
      setLoading(false);
    })();
  }, []);

  if (!loading && jobs.length === 0) return null;

  return (
    <SectionShell title="Jobs & Opportunities" subtitle="Find work or hire talent" icon={<Briefcase className="w-5 h-5" />} viewAllLink="/jobs">
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex gap-3">
                <div className="w-12 h-12 rounded-xl bg-gray-100 animate-pulse shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" />
                  <div className="h-3 bg-gray-100 rounded animate-pulse w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {jobs.map((job, i) => (
            <motion.div
              key={job.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Link
                to={`/product/${job.id}`}
                className="block bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-md hover:border-gray-200 transition-all group"
              >
                <div className="flex gap-3 items-start mb-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-100 to-amber-100 flex items-center justify-center overflow-hidden shrink-0">
                    {job.image_url ? (
                      <img src={job.image_url} alt={job.name} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <Briefcase className="w-6 h-6 text-orange-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 text-sm line-clamp-2 group-hover:text-primary-600 transition-colors">{job.name}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">{job.category}</p>
                  </div>
                </div>
                <p className="text-xs text-gray-500 line-clamp-2 mb-3">{job.description}</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="w-6 h-6 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center">
                      {job.seller_avatar ? (
                        <img src={job.seller_avatar} alt={job.seller_name || ''} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[10px] font-bold text-gray-500">{job.seller_name?.[0]?.toUpperCase() || 'U'}</span>
                      )}
                    </div>
                    <span className="text-xs text-gray-600 truncate max-w-[100px]">{job.seller_name}</span>
                    {job.seller_verified && <BadgeCheck className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                  </div>
                  <span className="text-sm font-bold text-gray-900">{formatCurrency(job.price)}</span>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </SectionShell>
  );
}
