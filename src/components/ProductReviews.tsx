import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, X, Send, Loader2, MessageSquare } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ProfileLink } from './Social';

interface Review {
  id: string;
  reviewer_id: string;
  rating: number;
  review_text: string | null;
  created_at: string;
  reviewer?: {
    id: string;
    full_name?: string | null;
    username?: string | null;
    avatar_url?: string | null;
    is_verified?: boolean;
  } | null;
}

interface Props {
  productId: string;
  productName: string;
  darkMode?: boolean;
}

export default function ProductReviews({ productId, productName, darkMode }: Props) {
  const { user, isAccountLocked, isAccountBanned } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [, setLoading] = useState(true);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetchReviews();
  }, [productId]);

  const fetchReviews = async () => {
    const { data } = await supabase
      .from('reviews')
      .select('id, reviewer_id, rating, review_text, created_at, reviewer:users!reviews_reviewer_id_fkey(id, full_name, username, avatar_url, is_verified)')
      .eq('target_type', 'product')
      .eq('target_id', productId)
      .order('created_at', { ascending: false });

    setReviews((data as unknown as Review[]) || []);
    setLoading(false);
  };

  const submitReview = async () => {
    if (!user) return;
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/review-trigger`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            reviewer_id: user.id,
            target_type: 'product',
            target_id: productId,
            rating,
            review_text: reviewText.trim(),
          }),
        },
      );

      if (!response.ok) throw new Error('Failed to submit review');

      setSuccess(true);
      setReviewText('');
      setRating(5);
      setShowReviewForm(false);
      fetchReviews();
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError('Failed to submit review. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const avgRating = reviews.length > 0
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : 0;

  const renderStars = (value: number, interactive: boolean = false) => {
    return [1, 2, 3, 4, 5].map((star) => (
      <Star
        key={star}
        className={`w-${interactive ? '6' : '4'} h-${interactive ? '6' : '4'} ${
          star <= (interactive ? (hoverRating || rating) : value)
            ? 'fill-warning text-warning'
            : 'text-gray-300'
        } ${interactive ? 'cursor-pointer transition-colors' : ''}`}
        onClick={interactive ? () => setRating(star) : undefined}
        onMouseEnter={interactive ? () => setHoverRating(star) : undefined}
        onMouseLeave={interactive ? () => setHoverRating(0) : undefined}
      />
    ));
  };

  const dm = darkMode;

  return (
    <div className={`mt-3 border-t pt-3 ${dm ? 'border-gray-800' : 'border-gray-100'}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {reviews.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Star className="w-5 h-5 fill-yellow-400 text-yellow-400" />
              <span className={`font-bold text-lg ${dm ? 'text-white' : 'text-gray-900'}`}>
                {avgRating.toFixed(1)}
              </span>
              <span className={`text-sm ${dm ? 'text-gray-400' : 'text-gray-500'}`}>
                · {reviews.length} reviews
              </span>
            </div>
          )}
          {reviews.length === 0 && (
            <span className={`text-sm font-medium ${dm ? 'text-gray-400' : 'text-gray-700'}`}>No reviews yet</span>
          )}
        </div>
        {user && !isAccountLocked && !isAccountBanned && (
          <button
            onClick={() => setShowReviewForm(true)}
            className={`text-xs font-medium flex items-center gap-1 ${dm ? 'text-green-400 hover:text-green-300' : 'text-primary-600 hover:text-primary-700'}`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Write Review
          </button>
        )}
      </div>

      {success && (
        <div className="bg-success-muted text-success rounded-lg p-2 text-xs mb-2">
          Review submitted!
        </div>
      )}

      {/* Reviews List (dark mode shows inline Upwork-style) */}
      {dm && reviews.length > 0 && (
        <div className="space-y-4 mt-4">
          {/* Rating distribution */}
          {[5, 4, 3, 2, 1].map(stars => {
            const count = reviews.filter(r => Math.round(r.rating) === stars).length;
            const pct = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
            return (
              <div key={stars} className="flex items-center gap-3">
                <span className="text-gray-400 text-sm w-10">{stars} stars</span>
                <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-gray-300 rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-green-400 text-sm w-8 text-right">({count})</span>
              </div>
            );
          })}
          {/* Individual reviews */}
          <div className="space-y-5 pt-2">
            {reviews.map(review => {
              const reviewer = review.reviewer;
              return (
                <div key={review.id} className="space-y-1">
                  <div className="flex items-center gap-3">
                    <ProfileLink
                      userId={review.reviewer_id}
                      username={reviewer?.username || undefined}
                      displayName={reviewer?.full_name || undefined}
                      avatar={reviewer?.avatar_url}
                      size="sm"
                      showName={true}
                      showBadge={true}
                      verified={reviewer?.is_verified}
                      className="flex-1 min-w-0"
                    />
                    <div className="flex items-center gap-2">
                      <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                      <span className="text-yellow-400 text-sm font-medium">{Number(review.rating).toFixed(2)}</span>
                      <span className="text-gray-500 text-xs">
                        {new Date(review.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                  </div>
                  {review.review_text && (
                    <p className="text-gray-300 text-sm leading-relaxed pl-13 ml-13">{review.review_text}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Review Form Modal */}
      <AnimatePresence>
        {showReviewForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowReviewForm(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-900">Review: {productName}</h3>
                <button onClick={() => setShowReviewForm(false)} className="p-1 text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {error && (
                <div className="bg-error-muted text-error rounded-lg p-2 text-sm">{error}</div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Rating</label>
                <div className="flex gap-1">{renderStars(rating, true)}</div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Review (optional)</label>
                <textarea
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  placeholder="Share your experience..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none resize-none text-sm"
                />
              </div>

              <button
                onClick={submitReview}
                disabled={submitting}
                className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" /> Submit Review</>}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
