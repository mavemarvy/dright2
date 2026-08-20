import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useKycProfile, useKycSubmissions, useKycDocuments, createKycProfile, createKycSubmission, uploadKycDocument, replaceKycDocument, useKycAuditLogs } from '../lib/kycHooks';
import { KYC_STATUS_LABELS, KYC_DOC_TYPES, KYC_REVIEW_ESTIMATE, USER_TYPE_LABELS } from '../lib/kycTypes';
import type { KycDocument } from '../lib/kycTypes';
import { Shield, Upload, FileText, CheckCircle, Clock, XCircle, AlertCircle, RefreshCw, Download, History } from 'lucide-react';

const STATUS_ICONS: Record<string, React.ReactNode> = {
  not_started: <Clock className="w-5 h-5 text-gray-400" />,
  pending_submission: <AlertCircle className="w-5 h-5 text-amber-500" />,
  submitted: <Clock className="w-5 h-5 text-blue-500" />,
  under_review: <Clock className="w-5 h-5 text-blue-500" />,
  approved: <CheckCircle className="w-5 h-5 text-green-500" />,
  rejected: <XCircle className="w-5 h-5 text-red-500" />,
  more_info_required: <AlertCircle className="w-5 h-5 text-orange-500" />,
  expired: <XCircle className="w-5 h-5 text-gray-400" />,
};

const STATUS_COLORS: Record<string, string> = {
  not_started: 'bg-gray-50 text-gray-600 border-gray-200',
  pending_submission: 'bg-amber-50 text-amber-700 border-amber-200',
  submitted: 'bg-blue-50 text-blue-700 border-blue-200',
  under_review: 'bg-blue-50 text-blue-700 border-blue-200',
  approved: 'bg-green-50 text-green-700 border-green-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  more_info_required: 'bg-orange-50 text-orange-700 border-orange-200',
  expired: 'bg-gray-50 text-gray-500 border-gray-200',
};

export default function UserVerificationSection() {
  const { profile } = useAuth();
  const userId = profile?.id ?? null;
  const { profile: kycProfile, loading: profileLoading, refetch: refetchProfile } = useKycProfile(userId);
  const [activeSubmission, setActiveSubmission] = useState<string | null>(null);
  const { submissions, loading: subsLoading } = useKycSubmissions(kycProfile?.id ?? null);
  const { documents, refetch: refetchDocs } = useKycDocuments(activeSubmission);
  const { logs } = useKycAuditLogs(userId ?? undefined, 10);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (submissions.length > 0 && !activeSubmission) {
      setActiveSubmission(submissions[0].id);
    }
  }, [submissions, activeSubmission]);

  const handleStartVerification = async () => {
    if (!userId) return;
    setError(null);
    try {
      let prof = kycProfile;
      if (!prof) {
        prof = await createKycProfile(userId, (profile as { user_type?: string })?.user_type ?? 'buyer');
        void refetchProfile();
      }
      if (prof) {
        const sub = await createKycSubmission(prof.id, userId);
        if (sub) setActiveSubmission(sub.id);
        setSuccess('Verification started. Please upload your documents below.');
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to start verification'); }
  };

  const handleUpload = async (docType: string, file: File) => {
    if (!activeSubmission || !userId) return;
    setUploading(true);
    setError(null);
    try {
      await uploadKycDocument(activeSubmission, userId, docType, file);
      void refetchDocs();
      setSuccess('Document uploaded successfully');
    } catch (e) { setError(e instanceof Error ? e.message : 'Upload failed'); }
    setUploading(false);
  };

  const handleReplace = async (oldDocId: string, docType: string, file: File) => {
    if (!activeSubmission || !userId) return;
    setUploading(true);
    setError(null);
    try {
      await replaceKycDocument(oldDocId, activeSubmission, userId, docType, file);
      void refetchDocs();
      setSuccess('Document replaced successfully');
    } catch (e) { setError(e instanceof Error ? e.message : 'Replace failed'); }
    setUploading(false);
  };

  const handleDownloadReceipt = () => {
    if (!kycProfile) return;
    const text = `DRIGHT Verification Receipt\n\nUser ID: ${userId}\nStatus: ${KYC_STATUS_LABELS[kycProfile.status] ?? kycProfile.status}\nType: ${USER_TYPE_LABELS[kycProfile.user_type] ?? kycProfile.user_type}\nDate: ${new Date().toLocaleString()}\n`;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'DRIGHT_Verification_Receipt.txt'; a.click();
    URL.revokeObjectURL(url);
  };

  if (profileLoading) {
    return <div className="flex items-center justify-center py-8"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  const status = kycProfile?.status ?? 'not_started';

  return (
    <div className="space-y-4">
      {/* Status Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center"><Shield className="w-5 h-5 text-primary-500" /></div>
            <div>
              <h3 className="font-bold text-gray-900">Identity Verification</h3>
              <p className="text-xs text-gray-400">{USER_TYPE_LABELS[kycProfile?.user_type ?? 'buyer']}</p>
            </div>
          </div>
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border ${STATUS_COLORS[status] ?? STATUS_COLORS.not_started}`}>
            {STATUS_ICONS[status]} {KYC_STATUS_LABELS[status] ?? 'Not Started'}
          </span>
        </div>

        {kycProfile?.notes && status === 'more_info_required' && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 mb-3">
            <p className="text-sm text-orange-700 font-medium">Reviewer feedback:</p>
            <p className="text-sm text-orange-600 mt-1">{kycProfile.notes}</p>
          </div>
        )}
        {kycProfile?.notes && status === 'rejected' && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3">
            <p className="text-sm text-red-700 font-medium">Rejection reason:</p>
            <p className="text-sm text-red-600 mt-1">{kycProfile.notes}</p>
          </div>
        )}

        <p className="text-xs text-gray-400 mb-4">{KYC_REVIEW_ESTIMATE}</p>

        <div className="flex flex-wrap gap-2">
          {(status === 'not_started' || status === 'pending_submission') && (
            <button onClick={handleStartVerification} disabled={subsLoading}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl disabled:opacity-50">
              <Upload className="w-4 h-4" /> Start Verification
            </button>
          )}
          {status === 'approved' && (
            <button onClick={handleDownloadReceipt}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-600 border border-primary-200 rounded-xl hover:bg-primary-50">
              <Download className="w-4 h-4" /> Download Receipt
            </button>
          )}
          {(status === 'rejected' || status === 'more_info_required') && activeSubmission && (
            <button onClick={handleStartVerification}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl">
              <RefreshCw className="w-4 h-4" /> Resubmit
            </button>
          )}
        </div>
      </div>

      {/* Document Upload */}
      {activeSubmission && (status === 'pending_submission' || status === 'submitted' || status === 'rejected' || status === 'more_info_required') && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-bold text-gray-900 mb-4">Upload Documents</h3>
          {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3 text-sm text-red-700">{error}</div>}
          {success && <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-3 text-sm text-green-700">{success}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {KYC_DOC_TYPES.map((dt) => {
              const existingDoc = documents.find((d) => d.doc_type === dt.value && d.status !== 'replaced');
              return (
                <DocumentUploader
                  key={dt.value}
                  label={dt.label}
                  docType={dt.value}
                  existingDoc={existingDoc ?? null}
                  uploading={uploading}
                  onUpload={(file) => handleUpload(dt.value, file)}
                  onReplace={(docId, file) => handleReplace(docId, dt.value, file)}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Submission History */}
      {submissions.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2"><History className="w-4 h-4 text-gray-400" /> Submission History</h3>
          <div className="space-y-2">
            {submissions.map((sub) => (
              <div key={sub.id} className="flex items-center justify-between p-2.5 border border-gray-100 rounded-xl">
                <div>
                  <p className="text-sm font-medium text-gray-900">Submission v{sub.version}</p>
                  <p className="text-xs text-gray-400">{new Date(sub.submitted_at).toLocaleDateString()}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[sub.status] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                  {KYC_STATUS_LABELS[sub.status] ?? sub.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Audit Trail */}
      {logs.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-bold text-gray-900 mb-3">Activity Log</h3>
          <div className="space-y-1">
            {logs.map((log) => (
              <div key={log.id} className="flex items-center gap-2 text-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-primary-400" />
                <span className="text-gray-700">{log.action.replace(/_/g, ' ')}</span>
                <span className="text-xs text-gray-400 ml-auto">{new Date(log.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DocumentUploader({ label, docType, existingDoc, uploading, onUpload, onReplace }: {
  label: string;
  docType: string;
  existingDoc: KycDocument | null;
  uploading: boolean;
  onUpload: (file: File) => void;
  onReplace: (docId: string, file: File) => void;
}) {
  const inputId = `kyc-upload-${docType}`;
  return (
    <div className="border border-gray-100 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        {existingDoc && (
          <span className={`text-xs px-1.5 py-0.5 rounded-full border ${
            existingDoc.status === 'approved' ? 'bg-green-50 text-green-600 border-green-200' :
            existingDoc.status === 'rejected' ? 'bg-red-50 text-red-600 border-red-200' :
            'bg-amber-50 text-amber-600 border-amber-200'
          }`}>{existingDoc.status}</span>
        )}
      </div>
      {existingDoc ? (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-gray-500 flex-1 min-w-0">
            <FileText className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{existingDoc.doc_name ?? 'Document'}</span>
          </div>
          <label htmlFor={inputId} className="cursor-pointer px-2 py-1 text-xs font-medium text-primary-600 border border-primary-200 rounded-lg hover:bg-primary-50">
            <RefreshCw className="w-3 h-3 inline mr-1" /> Replace
          </label>
          <input id={inputId} type="file" className="hidden" accept="image/*,.pdf"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onReplace(existingDoc.id, f); e.target.value = ''; }} />
        </div>
      ) : (
        <label htmlFor={inputId} className={`flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium text-primary-600 border-2 border-dashed border-primary-200 rounded-xl hover:bg-primary-50 cursor-pointer ${uploading ? 'opacity-50' : ''}`}>
          <Upload className="w-4 h-4" /> Upload
          <input id={inputId} type="file" className="hidden" accept="image/*,.pdf"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }} />
        </label>
      )}
    </div>
  );
}
