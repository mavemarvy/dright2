import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock, AlertCircle, CheckCircle2, XCircle, RefreshCw,
} from 'lucide-react';

interface ModerationBannerProps {
  approvalStatus: string;
  visible: boolean;
}

const STATUS_CONFIG: Record<string, {
  icon: typeof Clock;
  color: string;
  bg: string;
  label: string;
}> = {
  pending: { icon: Clock, color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', label: 'Pending Review' },
  under_review: { icon: AlertCircle, color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', label: 'Under Review' },
  approved: { icon: CheckCircle2, color: 'text-success', bg: 'bg-success-muted border-success/20', label: 'Approved' },
  rejected: { icon: XCircle, color: 'text-error', bg: 'bg-error-muted border-error/20', label: 'Rejected' },
  returned: { icon: RefreshCw, color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', label: 'Returned for Changes' },
};

export default function ModerationBanner({ approvalStatus, visible }: ModerationBannerProps) {
  if (!visible) return null;

  const status = approvalStatus?.toLowerCase() || 'pending';
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = cfg.icon;

  const showReviewMessage = status === 'pending' || status === 'under_review';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        className={`rounded-2xl border p-4 mb-6 ${cfg.bg}`}
      >
        <div className="flex items-start gap-3">
          <Icon className={`w-5 h-5 ${cfg.color} shrink-0 mt-0.5`} />
          <div className="flex-1">
            <p className={`font-semibold ${cfg.color}`}>{cfg.label}</p>
            {showReviewMessage && (
              <p className="text-sm text-gray-600 mt-1">
                Your listing is currently under review. Reviews typically take a few hours and may take up to{' '}
                <strong>7 days</strong>.
              </p>
            )}
            {status === 'rejected' && (
              <p className="text-sm text-gray-600 mt-1">
                This listing was rejected. Please review and update it to comply with marketplace guidelines.
              </p>
            )}
            {status === 'returned' && (
              <p className="text-sm text-gray-600 mt-1">
                This listing was returned for changes. Please update it and resubmit.
              </p>
            )}
            {status === 'approved' && (
              <p className="text-sm text-gray-600 mt-1">
                Your listing is approved and visible to buyers.
              </p>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
