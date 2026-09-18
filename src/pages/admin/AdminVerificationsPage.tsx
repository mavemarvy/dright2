import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileCheck,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  ExternalLink,
  User,
  ShieldCheck,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { emitEvent } from '../../lib/notificationEvents';
import { useAuth } from '../../contexts/AuthContext';

interface Verification {
  id: string;
  promoter_id: string;
  screenshot_url: string;
  transaction_details: string;
  status: string;
  submitted_at: string;
  promoter_email?: string;
  promoter_name?: string;
}

export default function AdminVerificationsPage() {
  const { user } = useAuth();
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    void fetchVerifications();
  }, [user, statusFilter]);

  const fetchVerifications = async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase.from('verifications').select('*');
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      query = query.order('submitted_at', { ascending: false });

      const { data, error: queryError } = await query;
      if (queryError) throw queryError;

      if (data && data.length > 0) {
        const promoterIds = [...new Set(data.map(v => v.promoter_id))];
        const { data: promoters, error: usersError } = await supabase
          .from('users')
          .select('id, email, full_name')
          .in('id', promoterIds);
        if (usersError) throw usersError;

        const promoterMap = new Map(
          promoters?.map(p => [p.id, { email: p.email, name: p.full_name }]) || []
        );
        setVerifications(data.map(v => ({
          ...v,
          promoter_email: promoterMap.get(v.promoter_id)?.email || 'Unknown',
          promoter_name: promoterMap.get(v.promoter_id)?.name || 'Unknown',
        })) as Verification[]);
      } else {
        setVerifications([]);
      }
    } catch (fetchError) {
      console.error('Error fetching verifications:', fetchError);
      setError(fetchError instanceof Error ? fetchError.message : 'Could not load sales verifications.');
      setVerifications([]);
    } finally {
      setLoading(false);
    }
  };

  const recordReview = async (verification: Verification, status: 'approved' | 'rejected') => {
    setProcessingId(verification.id);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from('verifications')
        .update({ status })
        .eq('id', verification.id)
        .eq('status', 'pending');
      if (updateError) throw updateError;

      const { error: logError } = await supabase.from('admin_logs').insert({
        admin_id: user?.id,
        action_type: status === 'approved' ? 'approve_verification' : 'reject_verification',
        target_id: verification.id,
        target_type: 'verification',
        details: {
          verification_id: verification.id,
          review_only: true,
          financial_credit: false,
          note: 'Financial rewards are processed only by DRIGHT authoritative payment/commission services.',
        },
      });
      if (logError) console.warn('Verification review audit log warning:', logError.message);

      try {
        await emitEvent({
          module: 'admin',
          eventType: 'support_ticket_update',
          recipientIds: verification.promoter_id,
          actorId: user?.id,
          metadata: {
            ticketTitle: status === 'approved' ? 'Sales proof reviewed: approved' : 'Sales proof reviewed: rejected',
            actionUrl: '/profile',
          },
        });
      } catch (notificationError) {
        console.warn('Verification notification warning:', notificationError);
      }

      await fetchVerifications();
    } catch (reviewError) {
      console.error('Error reviewing verification:', reviewError);
      setError(reviewError instanceof Error ? reviewError.message : 'Could not update this verification.');
    } finally {
      setProcessingId(null);
    }
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

  const filteredVerifications = verifications.filter(v => {
    const q = searchQuery.toLowerCase();
    return v.transaction_details.toLowerCase().includes(q) || v.promoter_email?.toLowerCase().includes(q);
  });

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Sales Verifications</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Review proof-of-sale submissions. Approval validates the evidence only; it never credits a wallet from the browser.</p>
      </div>

      <div className="mb-5 rounded-2xl border border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/30 p-4 flex gap-3">
        <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-blue-900 dark:text-blue-100 text-sm">Server-authoritative financial processing</p>
          <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">Seller earnings, affiliate commissions, referral rewards and payouts are released only by verified payment/order services. This review page cannot create money or directly modify balances.</p>
        </div>
      </div>

      {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by transaction or promoter..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {(['pending', 'approved', 'rejected', 'all'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-3 rounded-xl font-medium transition-all min-h-[48px] whitespace-nowrap ${
                statusFilter === status
                  ? 'bg-primary-600 text-white'
                  : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-primary-300'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="flex items-center justify-center py-20"><div className="w-10 h-10 border-4 border-gray-300 border-t-warning rounded-full animate-spin" /></div>}

      {!loading && filteredVerifications.length === 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-12 text-center">
          <FileCheck className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-900 dark:text-gray-100 font-semibold text-lg">No verifications to review</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{statusFilter === 'pending' ? 'New verification requests will appear here' : 'Try a different filter'}</p>
        </div>
      )}

      {!loading && filteredVerifications.length > 0 && (
        <div className="space-y-4">
          {filteredVerifications.map((verification, index) => (
            <motion.div
              key={verification.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden"
            >
              <div className="flex flex-col lg:flex-row gap-4 p-5">
                <button
                  type="button"
                  className="w-full lg:w-48 h-48 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 shrink-0 cursor-pointer group relative"
                  onClick={() => { setSelectedImage(verification.screenshot_url); setShowImageModal(true); }}
                  aria-label="Open proof of sale image"
                >
                  <img src={verification.screenshot_url} alt="Proof of sale" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  <span className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center"><ExternalLink className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" /></span>
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <User className="w-4 h-4 text-gray-400" />
                        <span className="font-medium text-gray-900 dark:text-gray-100">{verification.promoter_name || verification.promoter_email}</span>
                        <span className="text-gray-400 text-sm">({verification.promoter_email})</span>
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                        verification.status === 'approved' ? 'bg-success-muted text-success' : verification.status === 'rejected' ? 'bg-error-muted text-error' : 'bg-warning-muted text-warning'
                      }`}>
                        {verification.status === 'approved' && <CheckCircle className="w-3 h-3" />}
                        {verification.status === 'rejected' && <XCircle className="w-3 h-3" />}
                        {verification.status === 'pending' && <Clock className="w-3 h-3" />}
                        {verification.status}
                      </span>
                    </div>
                    <div className="text-right text-sm text-gray-500 dark:text-gray-400"><p>{formatDate(verification.submitted_at)}</p></div>
                  </div>

                  <div className="bg-gray-50 dark:bg-gray-950 rounded-xl p-3 mb-3">
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Transaction Details</p>
                    <p className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">{verification.transaction_details}</p>
                  </div>

                  {verification.status === 'pending' && (
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        onClick={() => void recordReview(verification, 'approved')}
                        disabled={processingId === verification.id}
                        className="flex-1 flex items-center justify-center gap-2 py-3 bg-success text-white rounded-xl font-medium hover:bg-green-700 transition-colors disabled:opacity-50 min-h-[48px]"
                      >
                        {processingId === verification.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <><CheckCircle className="w-5 h-5" />Approve Proof</>}
                      </button>
                      <button
                        onClick={() => void recordReview(verification, 'rejected')}
                        disabled={processingId === verification.id}
                        className="flex-1 flex items-center justify-center gap-2 py-3 bg-error-muted text-error rounded-xl font-medium hover:bg-error hover:text-white transition-colors disabled:opacity-50 min-h-[48px]"
                      >
                        {processingId === verification.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <><XCircle className="w-5 h-5" />Reject</>}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showImageModal && selectedImage && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
            onClick={() => setShowImageModal(false)}
          >
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="max-w-4xl max-h-[90vh] overflow-auto">
              <img src={selectedImage} alt="Proof of sale screenshot" className="max-w-full max-h-[85vh] rounded-lg" onClick={(e) => e.stopPropagation()} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
