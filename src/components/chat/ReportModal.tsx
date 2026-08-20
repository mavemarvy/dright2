import { useState } from 'react';
import { X, Flag } from 'lucide-react';
import { reportUser } from '../../lib/chatPart3Hooks';
import { REPORT_REASONS } from '../../lib/chatTypes';
import type { ReportReason } from '../../lib/chatTypes';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  reporterId: string;
  reportedUserId: string;
  conversationId?: string | null;
  messageId?: string | null;
}

export default function ReportModal({
  isOpen, onClose, reporterId, reportedUserId, conversationId, messageId,
}: ReportModalProps) {
  const [reason, setReason] = useState<ReportReason>('spam');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setSubmitting(true);
    const ok = await reportUser({
      reporterId, reportedUserId, conversationId, messageId, reason, description,
    });
    setSubmitting(false);
    if (ok) {
      setDone(true);
      setTimeout(() => { setDone(false); onClose(); }, 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-6 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {done ? (
          <div className="text-center py-8">
            <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <Flag className="w-7 h-7 text-green-500" />
            </div>
            <h3 className="font-bold text-gray-900 mb-1">Report Submitted</h3>
            <p className="text-sm text-gray-500">Our team will review this report.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Flag className="w-5 h-5 text-red-500" />
                <h3 className="font-bold text-gray-900">Report User</h3>
              </div>
              <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Reason</label>
                <div className="grid grid-cols-2 gap-2">
                  {REPORT_REASONS.map(r => (
                    <button
                      key={r.value}
                      onClick={() => setReason(r.value)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left ${
                        reason === r.value
                          ? 'bg-red-50 text-red-700 border border-red-200'
                          : 'bg-gray-50 text-gray-600 border border-transparent hover:bg-gray-100'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">
                  Description <span className="text-gray-400">(optional)</span>
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Provide additional details..."
                  rows={3}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-red-300 resize-none"
                />
              </div>

              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600 disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
