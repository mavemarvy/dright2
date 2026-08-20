import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, Loader2, Clock, ShieldCheck, XCircle, ArrowRight, Home,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

export type UploadType = 'PRODUCT' | 'SERVICE' | 'COURSE' | 'JOB';

type ReviewStage = 'submitted' | 'under_review' | 'approved' | 'rejected';

interface PostUploadConfirmationProps {
  uploadType: UploadType;
  /** The id of the row to watch in real time. For products, the products row; for jobs, the jobs row. */
  itemId: string;
  /** When true, the component is visible; when false, nothing renders. */
  visible: boolean;
  /** Called when the user dismisses or the redirect countdown fires. */
  onDismiss: () => void;
}

const TYPE_LABELS: Record<UploadType, { noun: string; verb: string }> = {
  PRODUCT: { noun: 'product', verb: 'uploaded' },
  SERVICE: { noun: 'service', verb: 'submitted' },
  COURSE: { noun: 'course', verb: 'submitted' },
  JOB: { noun: 'job', verb: 'posted' },
};

const STAGES: { key: ReviewStage; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'submitted', label: 'Submitted', icon: CheckCircle2 },
  { key: 'under_review', label: 'Under Review', icon: Clock },
  { key: 'approved', label: 'Approved', icon: ShieldCheck },
];

function formatHours(hours: number): string {
  if (hours < 1) return 'less than an hour';
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}

export default function PostUploadConfirmation({
  uploadType, itemId, visible, onDismiss,
}: PostUploadConfirmationProps) {
  const navigate = useNavigate();
  const [timeframe, setTimeframe] = useState<{ min_hours: number; max_hours: number } | null>(null);
  const [stage, setStage] = useState<ReviewStage>('submitted');
  const [countdown, setCountdown] = useState(4);
  const [rejectedReason, setRejectedReason] = useState<string | null>(null);

  // Fetch admin-configured review timeframes
  useEffect(() => {
    if (!visible) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('review_timeframes')
        .select('min_hours, max_hours')
        .eq('upload_type', uploadType)
        .maybeSingle();
      if (active && data) setTimeframe(data);
    })();
    return () => { active = false; };
  }, [uploadType, visible]);

  // Fetch the current status once on mount
  const fetchStatus = useCallback(async () => {
    if (uploadType === 'JOB') {
      const { data } = await supabase
        .from('jobs')
        .select('status')
        .eq('id', itemId)
        .maybeSingle();
      if (data) {
        const s = data.status;
        if (s === 'closed') setStage('rejected');
        else if (s === 'active') setStage('approved');
        else setStage('under_review');
      }
    } else {
      const { data } = await supabase
        .from('products')
        .select('approval_status, rejection_reason')
        .eq('id', itemId)
        .maybeSingle();
      if (data) {
        const s = data.approval_status;
        if (s === 'approved') setStage('approved');
        else if (s === 'rejected') {
          setStage('rejected');
          setRejectedReason(data.rejection_reason || null);
        } else if (s === 'pending') setStage('submitted');
        else if (s === 'suspended' || s === 'removed') setStage('under_review');
      }
    }
  }, [uploadType, itemId]);

  useEffect(() => {
    if (!visible || !itemId) return;
    fetchStatus();
  }, [visible, itemId, fetchStatus]);

  // Realtime subscription to status changes
  useEffect(() => {
    if (!visible || !itemId) return;
    const table = uploadType === 'JOB' ? 'jobs' : 'products';
    const channel = supabase
      .channel(`post-upload-${table}-${itemId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table, filter: `id=eq.${itemId}` },
        (payload) => {
          const newRow = payload.new as Record<string, unknown>;
          if (uploadType === 'JOB') {
            const s = newRow.status as string;
            if (s === 'closed') setStage('rejected');
            else if (s === 'active') setStage('approved');
            else setStage('under_review');
          } else {
            const s = newRow.approval_status as string;
            if (s === 'approved') setStage('approved');
            else if (s === 'rejected') {
              setStage('rejected');
              setRejectedReason((newRow.rejection_reason as string) || null);
            } else if (s === 'pending') setStage('submitted');
            else if (s === 'suspended' || s === 'removed') setStage('under_review');
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [visible, itemId, uploadType]);

  // Countdown to auto-redirect (only while pending/under review)
  useEffect(() => {
    if (!visible) return;
    if (stage === 'approved' || stage === 'rejected') return;
    if (countdown <= 0) {
      onDismiss();
      navigate('/dashboard');
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [visible, countdown, stage, navigate, onDismiss]);

  const goToDashboard = () => {
    onDismiss();
    navigate('/dashboard');
  };

  const labels = TYPE_LABELS[uploadType];

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.92, y: 16, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.92, y: 16, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 260 }}
            className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 sm:p-8 space-y-6"
          >
            {/* Success animation */}
            <div className="flex flex-col items-center text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', damping: 14, stiffness: 220, delay: 0.05 }}
                className="w-20 h-20 rounded-full bg-success-muted flex items-center justify-center mb-4"
              >
                <motion.div
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                >
                  <CheckCircle2 className="w-12 h-12 text-success" />
                </motion.div>
              </motion.div>
              <h2 className="text-xl font-bold text-gray-900">
                Your {labels.noun} has been {labels.verb}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                It is now waiting for review.
              </p>
            </div>

            {/* Review timeframe */}
            {timeframe && (
              <div className="bg-primary-50 border border-primary-100 rounded-2xl p-4 text-center">
                <p className="text-sm text-gray-700">
                  Review may take anywhere from{' '}
                  <span className="font-semibold text-primary-700">
                    {formatHours(timeframe.min_hours)}
                  </span>{' '}
                  to{' '}
                  <span className="font-semibold text-primary-700">
                    {formatHours(timeframe.max_hours)}
                  </span>
                  .
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Stay tuned — we'll notify you in your notification bar once it's approved.
                </p>
              </div>
            )}

            {/* Real-time status indicator */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Review Progress
              </p>
              <div className="flex items-center justify-between">
                {STAGES.map((s, idx) => {
                  const activeIdx =
                    stage === 'rejected' ? -1 :
                    stage === 'approved' ? 2 :
                    stage === 'under_review' ? 1 :
                    0;
                  const isActive = idx <= activeIdx;
                  const isCurrent = idx === activeIdx;
                  return (
                    <div key={s.key} className="flex-1 flex flex-col items-center relative">
                      {idx < STAGES.length - 1 && (
                        <div
                          className={`absolute top-5 left-1/2 w-full h-0.5 ${
                            idx < activeIdx ? 'bg-success' : 'bg-gray-200'
                          }`}
                        />
                      )}
                      <motion.div
                        initial={false}
                        animate={{
                          scale: isCurrent ? 1.15 : 1,
                          backgroundColor: isActive ? '#10b981' : '#f3f4f6',
                        }}
                        className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center ${
                          isActive ? 'text-white' : 'text-gray-400'
                        }`}
                      >
                        {isCurrent && stage !== 'approved' ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <s.icon className="w-5 h-5" />
                        )}
                      </motion.div>
                      <span
                        className={`mt-2 text-xs font-medium ${
                          isActive ? 'text-gray-900' : 'text-gray-400'
                        }`}
                      >
                        {s.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Rejected state */}
              <AnimatePresence>
                {stage === 'rejected' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-error-muted border border-error/20 rounded-2xl p-3 flex items-start gap-2"
                  >
                    <XCircle className="w-5 h-5 text-error shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-error">Your {labels.noun} was rejected.</p>
                      {rejectedReason && (
                        <p className="text-xs text-error/80 mt-0.5">{rejectedReason}</p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Approved state */}
              <AnimatePresence>
                {stage === 'approved' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-success-muted border border-success/20 rounded-2xl p-3 flex items-start gap-2"
                  >
                    <ShieldCheck className="w-5 h-5 text-success shrink-0 mt-0.5" />
                    <p className="text-sm font-medium text-success">
                      Your {labels.noun} has been approved and is now live!
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2">
              <button
                onClick={goToDashboard}
                className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium flex items-center justify-center gap-2 transition-colors"
              >
                <Home className="w-4 h-4" />
                Go to Dashboard
                {stage !== 'approved' && stage !== 'rejected' && countdown > 0 && (
                  <span className="ml-1 text-xs opacity-80">({countdown}s)</span>
                )}
              </button>
              <button
                onClick={onDismiss}
                className="w-full py-2.5 text-gray-500 hover:text-gray-700 text-sm font-medium flex items-center justify-center gap-1 transition-colors"
              >
                Stay on this page <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
