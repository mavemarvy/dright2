import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle, KeyRound, Loader2, X } from 'lucide-react';
import { resetPinWithRecoveryCode, validatePin } from '../lib/paymentSecurity';

interface Props {
  open: boolean;
  userId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function ForgotPINFlow({ open, userId, onSuccess, onCancel }: Props) {
  const [step, setStep] = useState<'recover' | 'done'>('recover');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setStep('recover');
      setRecoveryCode('');
      setNewPin('');
      setConfirmPin('');
      setError(null);
      window.setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleResetPin = async () => {
    setError(null);

    if (!recoveryCode.trim()) {
      setError('Enter one of your saved recovery codes.');
      return;
    }

    if (newPin !== confirmPin) {
      setError('PINs do not match.');
      return;
    }

    const validation = validatePin(newPin);
    if (!validation.valid) {
      setError(validation.error || 'Invalid PIN.');
      return;
    }

    setLoading(true);
    const result = await resetPinWithRecoveryCode(userId, recoveryCode, newPin);
    setLoading(false);

    if (result.success) {
      setStep('done');
      setRecoveryCode('');
      setNewPin('');
      setConfirmPin('');
    } else {
      setError(result.error || 'Failed to reset PIN.');
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
              <KeyRound className="w-5 h-5 text-amber-500" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Recover Payment PIN</h2>
          </div>
          <button type="button" onClick={onCancel} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {step === 'recover' ? (
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              Enter one unused recovery code you previously saved, then choose a new payment PIN. The code is consumed only if the reset succeeds.
            </p>

            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">Recovery code</label>
            <input
              ref={inputRef}
              type="text"
              value={recoveryCode}
              onChange={(event) => setRecoveryCode(event.target.value.toUpperCase())}
              placeholder="ABCDE-12345"
              autoComplete="off"
              spellCheck={false}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500 mb-4"
            />

            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">New PIN</label>
            <input
              type="password"
              inputMode="numeric"
              value={newPin}
              onChange={(event) => setNewPin(event.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="4–8 digits"
              maxLength={8}
              onPaste={(event) => event.preventDefault()}
              autoComplete="new-password"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-lg tracking-[0.35em] text-center focus:outline-none focus:ring-2 focus:ring-primary-500 mb-3"
            />

            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">Confirm new PIN</label>
            <input
              type="password"
              inputMode="numeric"
              value={confirmPin}
              onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="Repeat PIN"
              maxLength={8}
              onPaste={(event) => event.preventDefault()}
              autoComplete="new-password"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-lg tracking-[0.35em] text-center focus:outline-none focus:ring-2 focus:ring-primary-500 mb-4"
            />

            <button
              type="button"
              onClick={handleResetPin}
              disabled={loading || !recoveryCode.trim() || newPin.length < 4 || confirmPin.length < 4}
              className="w-full py-3 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              Reset PIN securely
            </button>

            <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
              No saved recovery code? Contact DRIGHT Support. Support should never ask you to reveal an existing PIN.
            </p>
          </div>
        ) : (
          <div className="text-center py-4">
            <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <p className="text-lg font-bold text-gray-900 dark:text-white mb-1">PIN Reset Successfully</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Your old recovery-code set has been invalidated. Generate a new set from Security Center.
            </p>
            <button type="button" onClick={onSuccess} className="px-6 py-2.5 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 transition-colors">
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
