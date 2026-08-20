import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Star, Search, Star as StarIcon, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Review {
  id: string;
  reviewer_id: string;
  target_type: string;
  target_id: string;
  rating: number;
  review_text: string | null;
  created_at: string;
  reviewer_email?: string;
  reviewer_name?: string;
  target_label?: string;
}

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [ratingFilter, setRatingFilter] = useState<'all' | '1' | '2' | '3' | '4' | '5'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'product' | 'seller' | 'sales_team'>('all');

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('reviews')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      if (!data || data.length === 0) {
        setReviews([]);
        return;
      }

      const reviewerIds = [...new Set(data.map((r) => r.reviewer_id))];
      const { data: users } = await supabase
        .from('users')
        .select('id, email, full_name')
        .in('id', reviewerIds);
      const userMap = new Map(
        (users || []).map((u) => [u.id, { email: u.email, name: u.full_name }]),
      );

      const productIds = [
        ...new Set(
          data.filter((r) => r.target_type === 'product').map((r) => r.target_id),
        ),
      ];
      let productMap = new Map<string, string>();
      if (productIds.length > 0) {
        const { data: products } = await supabase
          .from('products')
          .select('id, name')
          .in('id', productIds);
        productMap = new Map((products || []).map((p) => [p.id, p.name]));
      }

      const sellerIds = [
        ...new Set(
          data.filter((r) => r.target_type === 'seller').map((r) => r.target_id),
        ),
      ];
      let sellerMap = new Map<string, string>();
      if (sellerIds.length > 0) {
        const { data: sellers } = await supabase
          .from('users')
          .select('id, email')
          .in('id', sellerIds);
        sellerMap = new Map((sellers || []).map((s) => [s.id, s.email]));
      }

      const mapped: Review[] = data.map((r) => {
        let targetLabel: string | undefined;
        if (r.target_type === 'product') {
          targetLabel = productMap.get(r.target_id) || 'Unknown Product';
        } else if (r.target_type === 'seller') {
          targetLabel = sellerMap.get(r.target_id) || 'Unknown Seller';
        } else if (r.target_type === 'sales_team') {
          targetLabel = 'Sales Team';
        }
        return {
          ...r,
          reviewer_email: userMap.get(r.reviewer_id)?.email || 'Unknown',
          reviewer_name: userMap.get(r.reviewer_id)?.name || 'Unknown',
          target_label: targetLabel,
        };
      });

      setReviews(mapped);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load reviews';
      setError(msg);
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  const filteredReviews = reviews.filter((r) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      (r.review_text?.toLowerCase().includes(q) ?? false) ||
      r.reviewer_email?.toLowerCase().includes(q) ||
      r.target_label?.toLowerCase().includes(q);
    const matchesRating = ratingFilter === 'all' || r.rating === parseInt(ratingFilter);
    const matchesType = typeFilter === 'all' || r.target_type === typeFilter;
    return matchesSearch && matchesRating && matchesType;
  });

  const avgRating =
    reviews.length > 0
      ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
      : '0.0';

  const ratingCounts = {
    5: reviews.filter((r) => r.rating === 5).length,
    4: reviews.filter((r) => r.rating === 4).length,
    3: reviews.filter((r) => r.rating === 3).length,
    2: reviews.filter((r) => r.rating === 2).length,
    1: reviews.filter((r) => r.rating === 1).length,
  };

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Star className="w-6 h-6 text-warning" />
          Reviews
        </h1>
        <p className="text-gray-500 mt-1">Monitor all product, seller, and sales team reviews</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100"
        >
          <div className="flex items-center gap-3 mb-2">
            <Star className="w-6 h-6 text-warning" />
            <span className="text-sm text-gray-500">Total Reviews</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{reviews.length}</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100"
        >
          <div className="flex items-center gap-3 mb-2">
            <StarIcon className="w-6 h-6 text-warning" />
            <span className="text-sm text-gray-500">Avg Rating</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{avgRating}</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100"
        >
          <div className="flex items-center gap-3 mb-2">
            <StarIcon className="w-6 h-6 text-success" />
            <span className="text-sm text-gray-500">5-Star</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{ratingCounts[5]}</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100"
        >
          <div className="flex items-center gap-3 mb-2">
            <StarIcon className="w-6 h-6 text-error" />
            <span className="text-sm text-gray-500">1-Star</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{ratingCounts[1]}</p>
        </motion.div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search reviews..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none bg-white text-gray-900"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['all', 'product', 'seller', 'sales_team'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-3 rounded-xl font-medium transition-all min-h-[48px] capitalize ${
                typeFilter === t
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-primary-300'
              }`}
            >
              {t === 'all' ? 'All Types' : t.replace('_', ' ')}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {(['all', '1', '2', '3', '4', '5'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRatingFilter(r)}
              className={`px-3 py-3 rounded-xl font-medium transition-all min-h-[48px] ${
                ratingFilter === r
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-primary-300'
              }`}
            >
              {r === 'all' ? 'All' : `${r}★`}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-gray-300 border-t-warning rounded-full animate-spin" />
        </div>
      ) : filteredReviews.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <Star className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-900 font-semibold text-lg">No reviews found</p>
          <p className="text-sm text-gray-500 mt-1">
            {reviews.length === 0 ? 'User reviews will appear here' : 'Try adjusting your filters'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredReviews.map((r, idx) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03 }}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5"
            >
              <div className="flex items-start justify-between gap-4 mb-2">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <StarIcon
                          key={star}
                          className={`w-4 h-4 ${star <= r.rating ? 'text-warning fill-warning' : 'text-gray-200'}`}
                        />
                      ))}
                    </div>
                    <span className="text-sm font-medium text-gray-900">{r.reviewer_name}</span>
                    <span className="text-xs text-gray-400">{r.reviewer_email}</span>
                  </div>
                  <p className="text-xs text-gray-500 capitalize">
                    {r.target_type.replace('_', ' ')}
                    {r.target_label && `: ${r.target_label}`}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <p className="text-xs text-gray-400">{formatDate(r.created_at)}</p>
                </div>
              </div>
              {r.review_text && (
                <p className="text-sm text-gray-700 mt-2">{r.review_text}</p>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
