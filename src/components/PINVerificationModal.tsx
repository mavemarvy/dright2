import { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2, Lock, X, AlertCircle } from 'lucide-react';
import { verifyPin } from '../lib/paymentSecurity';

interface Props {
  open: boolean;
  userId: string;
  context?: string;
  title?: string;
  onSuccess: () => void;
  onCancel: () => void;
  onForgotPin?: () => void;
}

export default function PINVerificationModal({ open, userId, context = 'transaction', title = 'Confirm Payment', onSuccess, onCancel, onForgotPin }: Props) {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPin(''); setError(null); setAttemptsRemaining(null); setLockedUntil(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleSubmit = useCallback(async () => {
    if (pin.length < 4) return;
    setLoading(true); setError(null);
    const result = await verifyPin(userId, pin, context);
    setLoading(false);
    if (result.success) { onSuccess(); setPin(''); return; }
    if (result.locked_until) { setLockedUntil(result.locked_until); setError(result.error || 'PIN locked'); return; }
    if (result.attempts_remaining !== undefined) setAttemptsRemaining(result.attempts_remaining);
    setError(result.error || 'Incorrect PIN');
    setPin('');
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [pin, userId, context, onSuccess]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && pin.length >= 4) { e.preventDefault(); handleSubmit(); }
  };

  const handlePaste = (e: React.ClipboardEvent) => { e.preventDefault(); };

  const handleKeyClick = (key: string) => {
    if (pin.length < 8) setPin(pin + key);
  };

  const handleBackspace = () => { setPin(pin.slice(0, -1)); };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center">
              <Lock className="w-5 h-5 text-primary-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{title}</h2>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {lockedUntil && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <p className="text-sm text-red-600 dark:text-red-400">Locked until {new Date(lockedUntil).toLocaleString()}</p>
          </div>
        )}

        {error && !lockedUntil && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <p className="text-sm text-red-600 dark:text-red-400">{error}{attemptsRemaining !== null && attemptsRemaining > 0 ? ` (${attemptsRemaining} attempts left)` : ''}</p>
          </div>
        )}

        <p className="text-sm text-gray-500 mb-4 text-center">Enter your payment PIN to authorize this transaction</p>

        {/* Hidden input for desktop keyboard */}
        <input
          ref={inputRef}
          type="tel"
          inputMode="numeric"
          value={pin}
          onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 8); setPin(v); }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          autoComplete="off"
          className="sr-only"
          aria-hidden="true"
        />

        {/* PIN dots */}
        <div className="flex justify-center gap-2 mb-6">
          {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
            <div key={i} className={`w-3 h-3 rounded-full transition-colors ${i < pin.length ? 'bg-primary-500' : 'bg-gray-200 dark:bg-gray-600'}`} />
          ))}
        </div>

        {/* Mobile keypad */}
        <div className="grid grid-cols-3 gap-2 mb-4 md:hidden">
          {['1','2','3','4','5','6','7','8','9'].map(k => (
            <button key={k} onClick={() => handleKeyClick(k)} disabled={loading || !!lockedUntil}
              className="py-3 rounded-xl bg-gray-50 dark:bg-gray-700 text-lg font-semibold text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-600 active:scale-95 transition-all disabled:opacity-40">
              {k}
            </button>
          ))}
          <div />
          <button onClick={() => handleKeyClick('0')} disabled={loading || !!lockedUntil}
            className="py-3 rounded-xl bg-gray-50 dark:bg-gray-700 text-lg font-semibold text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-600 active:scale-95 transition-all disabled:opacity-40">0</button>
          <button onClick={handleBackspace} disabled={loading}
            className="py-3 rounded-xl bg-gray-50 dark:bg-gray-700 text-lg font-semibold text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-600 active:scale-95 transition-all">
            ⌫
          </button>
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading || pin.length < 4 || !!lockedUntil}
          className="w-full py-3 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors">
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying...</> : 'Confirm'}
        </button>

        {onForgotPin && (
          <button onClick={onForgotPin} className="w-full mt-3 text-sm text-primary-600 hover:text-primary-700 font-medium">
            Forgot PIN?
          </button>
        )}
      </div>
    </div>
  );
}
