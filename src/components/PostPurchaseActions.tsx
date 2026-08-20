import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Flag, MessageSquare, X, Lock, Send } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface PostPurchaseActionsProps {
  productId: string;
  sellerId: string;
  hasPurchased?: boolean;
}

const REPORT_REASONS = [
  { value: 'counterfeit', label: 'Counterfeit or fake product' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'misleading', label: 'Misleading description or images' },
  { value: 'scam', label: 'Scam or fraud' },
  { value: 'other', label: 'Other' },
];

const FEEDBACK_CATEGORIES = [
  { value: 'general', label: 'General Feedback' },
  { value: 'bug', label: 'Bug Report' },
  { value: 'suggestion', label: 'Suggestion' },
  { value: 'complaint', label: 'Complaint' },
];

export default function PostPurchaseActions({ productId }: PostPurchaseActionsProps) {
  const { user } = useAuth();
  const [modal, setModal] = useState<null | 'review' | 'report' | 'feedback'>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const [reviewData, setReviewData] = useState({ rating: 5, text: '' });
  const [reportData, setReportData] = useState({ reason: '', description: '' });
  const [feedbackData, setFeedbackData] = useState({ category: 'general', message: '' });

  const closeModal = () => {
    setModal(null);
    setSuccess(false);
    setReviewData({ rating: 5, text: '' });
    setReportData({ reason: '', description: '' });
    setFeedbackData({ category: 'general', message: '' });
  };

  const submitReview = async () => {
    if (!user) return;
    setSubmitting(true);
    await supabase.from('reviews').insert({
      reviewer_id: user.id,
      target_type: 'product',
      target_id: productId,
      rating: reviewData.rating,
      review_text: reviewData.text,
    });
    setSubmitting(false);
    setSuccess(true);
  };

  const submitReport = async () => {
    if (!user) return;
    setSubmitting(true);
    await supabase.from('fraud_reports').insert({
      reporter_id: user.id,
      reported_id: productId,
      report_type: reportData.reason,
      description: reportData.description,
      status: 'pending',
    });
    setSubmitting(false);
    setSuccess(true);
  };

  const submitFeedback = async () => {
    if (!user) return;
    setSubmitting(true);
    await supabase.from('feedback').insert({
      user_id: user.id,
      category: feedbackData.category,
      message: feedbackData.message,
    });
    setSubmitting(false);
    setSuccess(true);
  };

  const AuthGate = ({ message }: { message: string }) => (
    <div className="text-center py-8">
      <div className="w-16 h-16 bg-primary-50 rounded-full flex items-center justify-center mx-auto mb-4">
        <Lock className="w-8 h-8 text-primary-400" />
      </div>
      <h4 className="text-lg font-semibold text-gray-900 mb-2">Sign up to continue</h4>
      <p className="text-sm text-gray-500 mb-6 max-w-xs mx-auto">{message}</p>
      <div className="flex flex-col gap-3">
        <Link to="/sign-up" onClick={closeModal} className="bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl py-3 transition-colors">
          Sign Up
        </Link>
        <Link to="/sign-in" onClick={closeModal} className="text-gray-600 font-medium hover:text-gray-900 transition-colors text-sm">
          Already have an account? Log in
        </Link>
      </div>
    </div>
  );

  const SuccessState = ({ message }: { message: string }) => (
    <div className="text-center py-8">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', damping: 15 }}
        className="w-16 h-16 bg-success-muted rounded-full flex items-center justify-center mx-auto mb-4"
      >
        <Send className="w-8 h-8 text-success" />
      </motion.div>
      <h4 className="text-lg font-bold text-gray-900 mb-2">Submitted!</h4>
      <p className="text-sm text-gray-500 mb-6">{message}</p>
      <button onClick={closeModal} className="text-primary-600 font-medium hover:text-primary-700 transition-colors text-sm">
        Close
      </button>
    </div>
  );

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setModal('review')}
          className="flex items-center gap-2 bg-white border border-gray-200 text-gray-900 font-medium rounded-xl px-4 py-2.5 hover:bg-gray-50 transition-colors text-sm"
        >
          <Star className="w-4 h-4 text-warning" />
          Write a Review
        </button>
        <button
          onClick={() => setModal('report')}
          className="flex items-center gap-2 bg-white border border-gray-200 text-gray-900 font-medium rounded-xl px-4 py-2.5 hover:bg-gray-50 transition-colors text-sm"
        >
          <Flag className="w-4 h-4 text-error" />
          Report Product
        </button>
        <button
          onClick={() => setModal('feedback')}
          className="flex items-center gap-2 bg-white border border-gray-200 text-gray-900 font-medium rounded-xl px-4 py-2.5 hover:bg-gray-50 transition-colors text-sm"
        >
          <MessageSquare className="w-4 h-4 text-primary-600" />
          Submit Feedback
        </button>
      </div>

      <AnimatePresence>
        {modal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeModal}
            className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          >
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900">
                  {modal === 'review' && 'Write a Review'}
                  {modal === 'report' && 'Report Product'}
                  {modal === 'feedback' && 'Submit Feedback'}
                </h3>
                <button onClick={closeModal} className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5">
                {/* Review */}
                {modal === 'review' && !user && <AuthGate message="Sign up to leave reviews and rate products you've purchased." />}
                {modal === 'review' && user && !success && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-2 block">Rating</label>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map(n => (
                          <button key={n} onClick={() => setReviewData({ ...reviewData, rating: n })}>
                            <Star className={`w-8 h-8 ${n <= reviewData.rating ? 'fill-warning text-warning' : 'text-gray-300'}`} />
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1.5 block">Your Review</label>
                      <textarea
                        value={reviewData.text}
                        onChange={(e) => setReviewData({ ...reviewData, text: e.target.value })}
                        placeholder="Share your experience with this product..."
                        rows={4}
                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-200 resize-none"
                      />
                    </div>
                    <button
                      onClick={submitReview}
                      disabled={!reviewData.text.trim() || submitting}
                      className="w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl py-3 disabled:opacity-50 transition-colors"
                    >
                      {submitting ? 'Submitting...' : 'Submit Review'}
                    </button>
                  </div>
                )}
                {modal === 'review' && user && success && <SuccessState message="Your review has been published." />}

                {/* Report */}
                {modal === 'report' && !user && <AuthGate message="Sign up to report products and help keep the marketplace safe." />}
                {modal === 'report' && user && !success && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-2 block">Reason</label>
                      <select
                        value={reportData.reason}
                        onChange={(e) => setReportData({ ...reportData, reason: e.target.value })}
                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-200 bg-white"
                      >
                        <option value="">Select a reason...</option>
                        {REPORT_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1.5 block">Description</label>
                      <textarea
                        value={reportData.description}
                        onChange={(e) => setReportData({ ...reportData, description: e.target.value })}
                        placeholder="Provide details about the issue..."
                        rows={4}
                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-200 resize-none"
                      />
                    </div>
                    <button
                      onClick={submitReport}
                      disabled={!reportData.reason || !reportData.description.trim() || submitting}
                      className="w-full bg-error hover:bg-red-600 text-white font-semibold rounded-xl py-3 disabled:opacity-50 transition-colors"
                    >
                      {submitting ? 'Submitting...' : 'Submit Report'}
                    </button>
                  </div>
                )}
                {modal === 'report' && user && success && <SuccessState message="Your report has been submitted. Our team will review it shortly." />}

                {/* Feedback */}
                {modal === 'feedback' && !user && <AuthGate message="Sign up to submit feedback and help us improve the platform." />}
                {modal === 'feedback' && user && !success && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-2 block">Category</label>
                      <select
                        value={feedbackData.category}
                        onChange={(e) => setFeedbackData({ ...feedbackData, category: e.target.value })}
                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-200 bg-white"
                      >
                        {FEEDBACK_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1.5 block">Message</label>
                      <textarea
                        value={feedbackData.message}
                        onChange={(e) => setFeedbackData({ ...feedbackData, message: e.target.value })}
                        placeholder="Tell us what you think..."
                        rows={4}
                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-200 resize-none"
                      />
                    </div>
                    <button
                      onClick={submitFeedback}
                      disabled={!feedbackData.message.trim() || submitting}
                      className="w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl py-3 disabled:opacity-50 transition-colors"
                    >
                      {submitting ? 'Submitting...' : 'Submit Feedback'}
                    </button>
                  </div>
                )}
                {modal === 'feedback' && user && success && <SuccessState message="Thank you for your feedback!" />}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
