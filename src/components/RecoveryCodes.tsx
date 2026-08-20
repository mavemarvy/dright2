import { useState, useEffect, useCallback } from 'react';
import { Loader2, Download, RefreshCw, KeyRound, AlertCircle, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Props {
  open: boolean;
  userId: string;
  onClose: () => void;
}

export default function RecoveryCodes({ open, userId, onClose }: Props) {
  const [codes, setCodes] = useState<string[]>([]);
  const [status, setStatus] = useState<{ total: number; remaining: number; used: number } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCodes, setShowCodes] = useState(false);

  const loadStatus = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_recovery_codes_status', { p_user_id: userId });
    if (error) return;
    setStatus(data as any);
  }, [userId]);

  useEffect(() => { if (open) loadStatus(); }, [open, loadStatus]);

  const handleGenerate = async () => {
    setGenerating(true); setError(null);
    const { data, error } = await supabase.rpc('generate_recovery_codes', { p_user_id: userId });
    setGenerating(false);
    if (error) { setError(error.message); return; }
    const result = data as any;
    if (result.success) { setCodes(result.codes); setShowCodes(true); loadStatus(); }
  };

  const handleDownload = () => {
    const text = `DRIGHT — Payment Recovery Codes\n\nGenerated: ${new Date().toLocaleString()}\n\n${codes.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\nEach code can be used once. Store them safely.\nDo not share these codes with anyone.`;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'dright-recovery-codes.txt'; a.click();
    URL.revokeObjectURL(url);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center">
              <KeyRound className="w-5 h-5 text-primary-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Recovery Codes</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {status && !showCodes && (
          <div className="mb-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-700/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-500">Remaining codes</span>
              <span className="text-sm font-semibold text-gray-900 dark:text-white">{status.remaining} / {status.total || 10}</span>
            </div>
            <div className="w-full h-2 rounded-full bg-gray-200 dark:bg-gray-600 overflow-hidden">
              <div className="h-full bg-primary-500 transition-all" style={{ width: `${((status.remaining / (status.total || 10)) * 100)}%` }} />
            </div>
          </div>
        )}

        {showCodes && codes.length > 0 ? (
          <div>
            <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">Save these codes in a secure location. Each code can only be used once. You won't be able to see them again after closing.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {codes.map((code, i) => (
                <div key={i} className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 font-mono text-sm text-center text-gray-900 dark:text-white">
                  {code}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={handleDownload}
                className="flex-1 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 flex items-center justify-center gap-2 transition-colors">
                <Download className="w-4 h-4" /> Download
              </button>
              <button onClick={() => { setShowCodes(false); setCodes([]); }}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 text-sm font-semibold text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                Close
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm text-gray-500 mb-4">
              {status && status.total > 0
                ? 'Regenerate recovery codes? This will invalidate all existing codes.'
                : 'Generate 10 one-time recovery codes. Use them to reset your payment PIN if you forget it.'}
            </p>
            <button onClick={handleGenerate} disabled={generating}
              className="w-full py-3 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {status && status.total > 0 ? 'Regenerate Codes' : 'Generate Codes'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
