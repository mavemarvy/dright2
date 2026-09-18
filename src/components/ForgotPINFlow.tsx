import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle, KeyRound, Loader2, Mail, ShieldCheck, X } from 'lucide-react';
import {
  requestPinResetEmail,
  resetPinWithEmailCode,
  resetPinWithRecoveryCode,
  validatePin,
} from '../lib/paymentSecurity';

interface Props {
  open: boolean;
  userId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function ForgotPINFlow({ open, userId, onSuccess, onCancel }: Props) {
  const [step, setStep] = useState<'recover' | 'done'>('recover');
  const [method, setMethod] = useState<'email' | 'recovery'>('email');
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const [emailCode, setEmailCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setStep('recover');
      setMethod('email');
      setEmailCodeSent(false);
      setEmailCode('');
      setRecoveryCode('');
      setNewPin('');
      setConfirmPin('');
      setMessage(null);
      setError(null);
      window.setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const validateNewPin = () => {
    if (newPin !== confirmPin) {
      setError('PINs do not match.');
      return false;
    }
    const validation = validatePin(newPin);
    if (!validation.valid) {
      setError(validation.error || 'Invalid PIN.');
      return false;
    }
    return true;
  };

  const sendEmailCode = async () => {
    setError(null);
    setMessage(null);
    setLoading(true);
    const result = await requestPinResetEmail();
    setLoading(false);
    if (!result.success) {
      setError(result.error || 'Could not send PIN reset code.');
      return;
    }
    setEmailCodeSent(true);
    setMessage('A 6-digit PIN reset code was sent to your verified DRIGHT email address.');
  };

  const handleEmailReset = async () => {
    setError(null);
    if (!validateNewPin()) return;
    setLoading(true);
    const result = await resetPinWithEmailCode(emailCode, newPin);
    setLoading(false);
    if (!result.success) {
      const suffix = typeof result.attemptsRemaining === 'number'
        ? ` (${result.attemptsRemaining} attempt${result.attemptsRemaining === 1 ? '' : 's'} remaining)`
        : '';
      setError((result.error || 'Failed to reset PIN.') + suffix);
      return;
    }
    setStep('done');
  };

  const handleRecoveryReset = async () => {
    setError(null);
    if (!recoveryCode.trim()) return setError('Enter one of your saved recovery codes.');
    if (!validateNewPin()) return;

    setLoading(true);
    const result = await resetPinWithRecoveryCode(userId, recoveryCode, newPin);
    setLoading(false);
    if (!result.success) {
      setError(result.error || 'Failed to reset PIN.');
      return;
    }
    setStep('done');
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl max-h-[92vh] overflow-y-auto" onClick={(event) => event.stopPropagation()}>
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
        {message && (
          <div className="mb-4 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-sm text-emerald-700 dark:text-emerald-300">
            {message}
          </div>
        )}

        {step === 'recover' ? (
          <div>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button
                type="button"
                onClick={() => { setMethod('email'); setError(null); setMessage(null); }}
                className={`rounded-xl border px-3 py-2.5 text-sm font-semibold flex items-center justify-center gap-2 ${method === 'email' ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'}`}
              >
                <Mail className="w-4 h-4" /> Email code
              </button>
              <button
                type="button"
                onClick={() => { setMethod('recovery'); setError(null); setMessage(null); }}
                className={`rounded-xl border px-3 py-2.5 text-sm font-semibold flex items-center justify-center gap-2 ${method === 'recovery' ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'}`}
              >
                <ShieldCheck className="w-4 h-4" /> Saved code
              </button>
            </div>

            {method === 'email' ? (
              <>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                  DRIGHT will email a one-time 6-digit code to your verified account email. The code expires after 10 minutes.
                </p>
                {!emailCodeSent ? (
                  <button
                    type="button"
                    onClick={() => void sendEmailCode()}
                    disabled={loading}
                    className="w-full py-3 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                    Send PIN reset code
                  </button>
                ) : (
                  <>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">6-digit email code</label>
                    <input
                      ref={inputRef}
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={emailCode}
                      onChange={(event) => setEmailCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xl tracking-[0.35em] text-center font-bold focus:outline-none focus:ring-2 focus:ring-primary-500 mb-4"
                    />
                  </>
                )}
              </>
            ) : (
              <>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                  Use one unused recovery code you previously saved in Security Center. This works even if email delivery is unavailable.
                </p>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">Saved recovery code</label>
                <input
                  ref={inputRef}
                  type="text"
                  value={recoveryCode}
                  onChange={(event) => setRecoveryCode(event.target.value.toUpperCase())}
                  placeholder="XXXXXXXX-XXXXXXXX"
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500 mb-4"
                />
              </>
            )}

            {(method === 'recovery' || emailCodeSent) && (
              <>
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
                  onClick={() => void (method === 'email' ? handleEmailReset() : handleRecoveryReset())}
                  disabled={loading || newPin.length < 4 || confirmPin.length < 4 || (method === 'email' ? emailCode.length !== 6 : !recoveryCode.trim())}
                  className="w-full py-3 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                  Reset PIN securely
                </button>
              </>
            )}

            {method === 'email' && emailCodeSent && (
              <button
                type="button"
                onClick={() => { setEmailCodeSent(false); setEmailCode(''); setMessage(null); setError(null); }}
                className="w-full mt-3 py-2.5 text-sm font-medium text-primary-600 dark:text-primary-300"
              >
                Request another email code
              </button>
            )}
          </div>
        ) : (
          <div className="text-center py-4">
            <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <p className="text-lg font-bold text-gray-900 dark:text-white mb-1">PIN Reset Successfully</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              DRIGHT created a security notification and emailed confirmation of the reset. Generate a fresh recovery-code set from Security Center.
            </p>
            <button type="button" onClick={onSuccess} className="px-6 py-2.5 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700">
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
