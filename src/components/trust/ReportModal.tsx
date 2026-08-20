import { useState } from 'react';
import { Flag, X, Loader2, AlertCircle, Upload, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Props {
  open: boolean;
  onClose: () => void;
  targetType: string;
  targetId: string;
  targetLabel?: string;
}

const REPORT_REASONS = [
  { key: 'spam', label: 'Spam' },
  { key: 'scam', label: 'Scam / Fraud' },
  { key: 'copyright', label: 'Copyright Violation' },
  { key: 'fake', label: 'Fake / Misleading' },
  { key: 'abuse', label: 'Abuse' },
  { key: 'harassment', label: 'Harassment' },
  { key: 'duplicate', label: 'Duplicate' },
  { key: 'other', label: 'Other' },
];

const TARGET_LABELS: Record<string, string> = {
  product: 'Product', service: 'Service', course: 'Course', seller: 'Seller',
  affiliate: 'Affiliate', advertiser: 'Advertiser', chat: 'Chat Message',
  review: 'Review', portfolio: 'Portfolio Item', message: 'Message', user: 'User',
};

export default function ReportModal({ open, onClose, targetType, targetId, targetLabel }: Props) {
  const { user } = useAuth();
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!open || !user) return null;

  const handleUploadEvidence = async (files: FileList) => {
    setUploading(true);
    const urls: string[] = [];
    for (const file of Array.from(files)) {
      const path = `${user.id}/reports/${Date.now()}_${file.name}`;
      const { error: err } = await supabase.storage.from('avatars').upload(path, file);
      if (!err) {
        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
        urls.push(publicUrl);
      }
    }
    setEvidenceUrls(prev => [...prev, ...urls]);
    setUploading(false);
  };

  const handleSubmit = async () => {
    if (!reason) { setError('Please select a reason'); return; }
    setSubmitting(true); setError(null);
    const { error: err } = await supabase.from('user_reports').insert({
      reporter_id: user.id, target_type: targetType, target_id: targetId,
      reason, description: description || null, evidence_urls: evidenceUrls, status: 'pending',
    });
    setSubmitting(false);
    if (err) { setError(err.message); return; }
    setDone(true);
  };

  const reset = () => { setReason(''); setDescription(''); setEvidenceUrls([]); setError(null); setDone(false); };

  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Flag className="w-5 h-5 text-red-500" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Report {targetLabel || TARGET_LABELS[targetType] || 'Content'}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <div className="p-5">
          {done ? (
            <div className="text-center py-6">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <p className="font-semibold text-gray-900 dark:text-white mb-1">Report Submitted</p>
              <p className="text-sm text-gray-500 mb-4">Our team will review this report and take appropriate action.</p>
              <button onClick={() => { reset(); onClose(); }} className="px-6 py-2.5 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700">Done</button>
            </div>
          ) : (
            <div className="space-y-4">
              {error && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center gap-2"><AlertCircle className="w-4 h-4 text-red-500" /><p className="text-sm text-red-600">{error}</p></div>}
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Reason</label>
                <div className="grid grid-cols-2 gap-2">
                  {REPORT_REASONS.map(r => (
                    <button key={r.key} onClick={() => setReason(r.key)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${reason === r.key ? 'bg-primary-600 text-white border-primary-600' : 'border-gray-200 dark:border-gray-600 text-gray-600 hover:border-primary-300'}`}>
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">Description (optional)</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
                  placeholder="Provide more details..."
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">Evidence (optional)</label>
                <label className="flex items-center justify-center gap-2 p-2.5 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-600 cursor-pointer hover:border-primary-400">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" /> : <Upload className="w-4 h-4 text-gray-400" />}
                  <span className="text-xs text-gray-500">{uploading ? 'Uploading...' : 'Upload screenshots/evidence'}</span>
                  <input type="file" multiple className="hidden" onChange={e => { if (e.target.files) handleUploadEvidence(e.target.files); }} />
                </label>
                {evidenceUrls.length > 0 && <p className="text-xs text-gray-500 mt-1">{evidenceUrls.length} file(s) attached</p>}
              </div>
              <button onClick={handleSubmit} disabled={submitting || !reason}
                className="w-full py-3 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600 disabled:opacity-50 flex items-center justify-center gap-2">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flag className="w-4 h-4" />} Submit Report
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
