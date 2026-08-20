import { useState } from 'react';
import { Shield, CheckCircle2, AlertCircle, Upload, X, Loader2, FileText, Building2, User } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmitted?: () => void;
}

const INDIVIDUAL_DOCS = [
  { key: 'government_id', label: 'Government ID', required: true },
  { key: 'passport', label: 'Passport', required: false },
  { key: 'drivers_license', label: "Driver's License", required: false },
  { key: 'selfie', label: 'Selfie Verification', required: true },
  { key: 'proof_of_address', label: 'Proof of Address', required: true },
];

const BUSINESS_DOCS = [
  { key: 'business_certificate', label: 'Business Certificate', required: true },
  { key: 'tax_id', label: 'Tax ID', required: true },
  { key: 'cac', label: 'CAC Registration', required: false },
  { key: 'company_address', label: 'Business Address Proof', required: true },
  { key: 'business_logo', label: 'Business Logo', required: false },
  { key: 'business_website', label: 'Website Screenshot', required: false },
];

export default function VerificationWizard({ open, onClose, onSubmitted }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState<'type' | 'upload' | 'submit' | 'done'>('type');
  const [verifType, setVerifType] = useState<'individual' | 'business'>('individual');
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, { url: string; name: string; size: number; type: string } | null>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open || !user) return null;

  const docs = verifType === 'individual' ? INDIVIDUAL_DOCS : BUSINESS_DOCS;
  const requiredDocs = docs.filter(d => d.required);
  const allRequiredUploaded = requiredDocs.every(d => uploadedFiles[d.key]);

  const handleUpload = async (docKey: string, file: File) => {
    setUploading(docKey);
    setError(null);
    const ext = file.name.split('.').pop();
    const path = `${user.id}/verification/${docKey}_${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
    if (upErr) { setError(upErr.message); setUploading(null); return; }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
    setUploadedFiles(prev => ({ ...prev, [docKey]: { url: publicUrl, name: file.name, size: file.size, type: file.type } }));
    setUploading(null);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    const { data: reqData, error: reqErr } = await supabase
      .from('verification_requests')
      .insert({ user_id: user.id, type: verifType, status: 'submitted' })
      .select('id')
      .single();
    if (reqErr) { setError(reqErr.message); setSubmitting(false); return; }

    const reqId = reqData.id;
    const docInserts = Object.entries(uploadedFiles).filter(([, v]) => v).map(([docType, file]) => ({
      verification_request_id: reqId,
      user_id: user.id,
      doc_type: docType,
      file_url: file!.url,
      file_name: file!.name,
      file_size: file!.size,
      mime_type: file!.type,
    }));

    if (docInserts.length > 0) {
      const { error: docErr } = await supabase.from('verification_documents').insert(docInserts);
      if (docErr) { setError(docErr.message); setSubmitting(false); return; }
    }

    setSubmitting(false);
    setStep('done');
    onSubmitted?.();
  };

  const reset = () => {
    setStep('type'); setVerifType('individual'); setUploadedFiles({}); setError(null);
  };

  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Get Verified</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-5">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {step === 'type' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500 mb-4">Choose your verification type:</p>
              {[
                { key: 'individual', label: 'Individual', desc: 'Verify your personal identity with government ID and selfie.', icon: User },
                { key: 'business', label: 'Business', desc: 'Verify your business with registration documents and certificates.', icon: Building2 },
              ].map(opt => (
                <button key={opt.key} onClick={() => { setVerifType(opt.key as any); setStep('upload'); }}
                  className="w-full p-4 rounded-xl border-2 border-gray-100 dark:border-gray-700 hover:border-primary-400 text-left transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
                      <opt.icon className="w-5 h-5 text-primary-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">{opt.label}</p>
                      <p className="text-sm text-gray-500 mt-0.5">{opt.desc}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {step === 'upload' && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <button onClick={() => setStep('type')} className="text-sm text-gray-500 hover:text-gray-700">← Back</button>
                <span className="text-sm text-gray-400">|</span>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 capitalize">{verifType} Verification</span>
              </div>
              <div className="space-y-3">
                {docs.map(doc => (
                  <div key={doc.key} className="p-3 rounded-xl border border-gray-100 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-gray-400" />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{doc.label}</span>
                        {doc.required && <span className="text-xs text-red-500">*required</span>}
                      </div>
                      {uploadedFiles[doc.key] && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                    </div>
                    {uploadedFiles[doc.key] ? (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 truncate">{uploadedFiles[doc.key]!.name}</span>
                        <button onClick={() => setUploadedFiles(prev => ({ ...prev, [doc.key]: null }))}
                          className="text-xs text-red-500 hover:text-red-600">Remove</button>
                      </div>
                    ) : (
                      <label className="flex items-center justify-center gap-2 p-2.5 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-600 cursor-pointer hover:border-primary-400 transition-colors">
                        {uploading === doc.key ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" /> : <Upload className="w-4 h-4 text-gray-400" />}
                        <span className="text-xs text-gray-500">{uploading === doc.key ? 'Uploading...' : 'Click to upload'}</span>
                        <input type="file" className="hidden" accept="image/*,.pdf" onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(doc.key, f); }} />
                      </label>
                    )}
                  </div>
                ))}
              </div>
              <button onClick={() => setStep('submit')} disabled={!allRequiredUploaded}
                className="w-full mt-4 py-3 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {allRequiredUploaded ? 'Review & Submit' : `Upload ${requiredDocs.filter(d => !uploadedFiles[d.key]).length} more required document(s)`}
              </button>
            </div>
          )}

          {step === 'submit' && (
            <div>
              <p className="text-sm text-gray-500 mb-4">Review your verification submission:</p>
              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/30">
                  <span className="text-sm text-gray-500">Type</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white capitalize">{verifType}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/30">
                  <span className="text-sm text-gray-500">Documents</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{Object.values(uploadedFiles).filter(Boolean).length} files</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep('upload')} className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 font-semibold hover:bg-gray-50 dark:hover:bg-gray-700">Back</button>
                <button onClick={handleSubmit} disabled={submitting}
                  className="flex-1 py-3 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />} Submit for Review
                </button>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Verification Submitted!</h3>
              <p className="text-sm text-gray-500 mb-6">Our team will review your documents within 24–48 hours. You'll be notified when your verification is approved.</p>
              <button onClick={() => { reset(); onClose(); }} className="px-6 py-2.5 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700">Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
