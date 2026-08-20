import { useState, useRef, useEffect } from 'react';
import { Loader2, Mail, Lock, X, AlertCircle, CheckCircle, KeyRound } from 'lucide-react';
import { requestPinReset, verifyRecoveryToken, resetPinWithToken, validatePin } from '../lib/paymentSecurity';

interface Props {
  open: boolean;
  userId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function ForgotPINFlow({ open, userId, onSuccess, onCancel }: Props) {
  const [step, setStep] = useState<'request' | 'verify' | 'reset' | 'done'>('request');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setStep('request'); setRecoveryCode(''); setNewPin(''); setConfirmPin('');
      setError(null); setInfo(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleRequestReset = async () => {
    setError(null); setLoading(true);
    const result = await requestPinReset(userId);
    setLoading(false);
    if (result.success && result.token) {
      setInfo('A recovery token has been generated. Use it below to verify your identity.');
      setStep('verify');
    } else setError(result.error || 'Failed to generate recovery token');
  };

  const handleVerifyToken = async () => {
    setError(null); setLoading(true);
    const result = await verifyRecoveryToken(recoveryCode);
    setLoading(false);
    if (result.success) {
      setInfo('Identity verified. Create a new PIN.');
      setStep('reset');
    } else setError(result.error || 'Invalid or expired token');
  };

  const handleResetPin = async () => {
    setError(null);
    if (newPin !== confirmPin) { setError('PINs do not match'); return; }
    const validation = validatePin(newPin);
    if (!validation.valid) { setError(validation.error || 'Invalid PIN'); return; }
    setLoading(true);
    const result = await resetPinWithToken(userId, newPin);
    setLoading(false);
    if (result.success) { setStep('done'); }
    else setError(result.error || 'Failed to reset PIN');
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
              <KeyRound className="w-5 h-5 text-amber-500" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Forgot PIN</h2>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}
        {info && (
          <div className="mb-4 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-500" />
            <p className="text-sm text-emerald-600 dark:text-emerald-400">{info}</p>
          </div>
        )}

        {step === 'request' && (
          <div>
            <p className="text-sm text-gray-500 mb-4">We'll generate a recovery token. Use it to verify your identity and create a new PIN.</p>
            <button onClick={handleRequestReset} disabled={loading}
              className="w-full py-3 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Generate Recovery Token
            </button>
          </div>
        )}

        {step === 'verify' && (
          <div>
            <p className="text-sm text-gray-500 mb-3">Enter the recovery token that was generated for you:</p>
            <input
              ref={inputRef}
              type="text"
              value={recoveryCode}
              onChange={e => setRecoveryCode(e.target.value)}
              placeholder="Recovery token"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500 mb-4"
            />
            <button onClick={handleVerifyToken} disabled={loading || !recoveryCode}
              className="w-full py-3 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />} Verify Identity
            </button>
          </div>
        )}

        {step === 'reset' && (
          <div>
            <p className="text-sm text-gray-500 mb-3">Create your new payment PIN (4–8 digits):</p>
            <input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              value={newPin}
              onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="New PIN"
              maxLength={8}
              onPaste={e => e.preventDefault()}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-2xl tracking-[0.5em] text-center focus:outline-none focus:ring-2 focus:ring-primary-500 mb-3"
            />
            <input
              type="password"
              inputMode="numeric"
              value={confirmPin}
              onChange={e => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="Confirm new PIN"
              maxLength={8}
              onPaste={e => e.preventDefault()}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-2xl tracking-[0.5em] text-center focus:outline-none focus:ring-2 focus:ring-primary-500 mb-4"
            />
            <button onClick={handleResetPin} disabled={loading || newPin.length < 4 || confirmPin.length < 4}
              className="w-full py-3 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Reset PIN
            </button>
          </div>
        )}

        {step === 'done' && (
          <div className="text-center py-4">
            <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <p className="text-lg font-bold text-gray-900 dark:text-white mb-1">PIN Reset Successfully</p>
            <p className="text-sm text-gray-500 mb-4">You can now use your new PIN for payments.</p>
            <button onClick={onSuccess} className="px-6 py-2.5 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 transition-colors">
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
