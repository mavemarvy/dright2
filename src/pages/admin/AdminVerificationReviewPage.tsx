import { useState, useMemo } from 'react';
import { useKycReviewQueue, reviewKycSubmission, useKycDocuments } from '../../lib/kycHooks';
import { KYC_DOC_TYPE_LABELS } from '../../lib/kycTypes';
import type { KycSubmission, KycProfile } from '../../lib/kycTypes';
import { PageHeader, LoadingBar, EmptyState, StatusChip } from '../../components/admin/RbacComponents';
import { Shield, CheckCircle, XCircle, FileText, AlertCircle, Eye, Download, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

const SUBMISSION_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  under_review: 'Under Review',
  approved: 'Approved',
  rejected: 'Rejected',
  more_info_required: 'More Info Required',
};

export default function AdminVerificationReviewPage() {
  const { profile } = useAuth();
  const [tab, setTab] = useState('pending');
  const { items, loading, refetch } = useKycReviewQueue(tab === 'all' ? undefined : tab);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<(KycSubmission & { profile: KycProfile | null }) | null>(null);

  const handleAction = async (
    submission: KycSubmission,
    action: 'approved' | 'rejected' | 'more_info_requested',
    notes: string, internalNotes?: string, rejectionReason?: string,
  ) => {
    if (!profile?.id) return;
    setError(null);
    try {
      await reviewKycSubmission(submission.id, profile.id, action, notes, internalNotes, rejectionReason);
      void refetch();
      setReviewing(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Action failed'); }
  };

  const tabs = [
    { key: 'pending', label: 'Pending' },
    { key: 'under_review', label: 'Under Review' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
    { key: 'more_info_required', label: 'More Info' },
    { key: 'all', label: 'All' },
  ];

  return (
    <div className="p-4 md:p-8">
      <PageHeader title="Verification Review Dashboard" subtitle="Review user KYC submissions, approve or reject verifications" />

      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700">{error}</div>}

      <div className="flex gap-1 mb-4 border-b border-gray-100 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${tab === t.key ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading && <LoadingBar />}

      {!loading && items.length === 0 ? (
        <EmptyState message="No submissions in this queue" icon={<Shield className="w-12 h-12" />} />
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">User</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">User Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Version</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Submitted</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-mono text-gray-500">{item.user_id.slice(0, 8)}...</td>
                    <td className="px-4 py-3 text-sm text-gray-600 capitalize">{item.profile?.user_type ?? '—'}</td>
                    <td className="px-4 py-3"><StatusChip status={item.status} labels={SUBMISSION_STATUS_LABELS} /></td>
                    <td className="px-4 py-3 text-sm text-gray-400">v{item.version}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{new Date(item.submitted_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setReviewing(item)}
                        className="px-2.5 py-1 text-xs font-medium text-primary-600 border border-primary-200 rounded-lg hover:bg-primary-50 flex items-center gap-1 ml-auto">
                        <Eye className="w-3 h-3" /> Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {reviewing && (
        <ReviewDialog submission={reviewing} onClose={() => setReviewing(null)} onAction={handleAction} />
      )}
    </div>
  );
}

function ReviewDialog({ submission, onClose, onAction }: {
  submission: KycSubmission & { profile: KycProfile | null };
  onClose: () => void;
  onAction: (s: KycSubmission, action: 'approved' | 'rejected' | 'more_info_requested', notes: string, internalNotes?: string, rejectionReason?: string) => void;
}) {
  const { documents, loading } = useKycDocuments(submission.id);
  const [notes, setNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [userInfo, setUserInfo] = useState<{ email: string; full_name: string | null } | null>(null);

  useMemo(() => {
    (async () => {
      const { data } = await supabase
        .from('users')
        .select('email, full_name')
        .eq('id', submission.user_id)
        .maybeSingle();
      setUserInfo(data);
    })();
  }, [submission.user_id]);

  const handleDownload = (url: string, name: string) => {
    const a = document.createElement('a');
    a.href = url; a.download = name; a.target = '_blank'; a.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Review Submission v{submission.version}</h2>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-5 h-5 text-gray-400" /></button>
          </div>
          <div className="mt-2 text-sm text-gray-500">
            <p><span className="font-medium">User:</span> {userInfo?.email ?? submission.user_id.slice(0, 8)}</p>
            <p><span className="font-medium">Type:</span> <span className="capitalize">{submission.profile?.user_type ?? '—'}</span></p>
            <p><span className="font-medium">Status:</span> <StatusChip status={submission.status} labels={SUBMISSION_STATUS_LABELS} /></p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <h3 className="font-semibold text-sm text-gray-700 mb-3">Submitted Documents ({documents.length})</h3>
          {loading ? <LoadingBar /> : documents.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No documents uploaded</p>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center"><FileText className="w-4 h-4 text-primary-500" /></div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{KYC_DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}</p>
                      <p className="text-xs text-gray-400">{doc.doc_name ?? 'Unnamed'} · v{doc.version}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusChip status={doc.status} labels={{ pending: 'Pending', approved: 'Approved', rejected: 'Rejected', expired: 'Expired', replaced: 'Replaced' }} />
                    <button onClick={() => handleDownload(doc.doc_url, doc.doc_name ?? 'document')}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="Download">
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 space-y-3">
            <div>
              <label className="text-sm font-medium text-gray-700">Reviewer Notes (visible to user)</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Internal Notes (admin only)</label>
              <textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} rows={2}
                className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Rejection Reason (if rejecting)</label>
              <input value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-gray-100 flex flex-wrap justify-end gap-2">
          <button onClick={() => onAction(submission, 'approved', notes, internalNotes)}
            className="px-4 py-2 text-sm font-medium text-green-600 border border-green-200 rounded-xl hover:bg-green-50 flex items-center gap-1">
            <CheckCircle className="w-4 h-4" /> Approve
          </button>
          <button onClick={() => onAction(submission, 'rejected', notes, internalNotes, rejectionReason)}
            className="px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-xl hover:bg-red-50 flex items-center gap-1">
            <XCircle className="w-4 h-4" /> Reject
          </button>
          <button onClick={() => onAction(submission, 'more_info_requested', notes, internalNotes)}
            className="px-4 py-2 text-sm font-medium text-orange-600 border border-orange-200 rounded-xl hover:bg-orange-50 flex items-center gap-1">
            <AlertCircle className="w-4 h-4" /> Request More Info
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl">Close</button>
        </div>
      </div>
    </div>
  );
}
