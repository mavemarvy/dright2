import { useState, useRef, useEffect } from 'react';
import { Loader2, Lock, X, CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { validatePin, hashPin } from '../lib/paymentSecurity';

interface Props {
  open: boolean;
  userId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function PINSetupModal({ open, userId, onSuccess, onCancel }: Props) {
  const [step, setStep] = useState<'create' | 'confirm'>('create');
  const [pin, setPin] = useState('');
  const [confirmPinStr, setConfirmPinStr] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [strength, setStrength] = useState<'weak' | 'medium' | 'strong' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setStep('create'); setPin(''); setConfirmPinStr(''); setError(null); setStrength(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const calculateStrength = (p: string): 'weak' | 'medium' | 'strong' => {
    if (p.length >= 8 && !/(\d)\1{2,}/.test(p) && !/(0123|1234|2345|3456|4567|5678|6789|9876|8765|7654|6543|5432|4321|3210)/.test(p)) return 'strong';
    if (p.length >= 6) return 'medium';
    return 'weak';
  };

  const handlePinChange = (v: string) => {
    const clean = v.replace(/\D/g, '').slice(0, 8);
    setPin(clean);
    if (clean.length >= 4) setStrength(calculateStrength(clean));
    else setStrength(null);
  };

  const handleCreateNext = () => {
    setError(null);
    const validation = validatePin(pin);
    if (!validation.valid) { setError(validation.error || 'Invalid PIN'); return; }
    setStep('confirm');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleConfirm = async () => {
    setError(null);
    if (pin !== confirmPinStr) { setError('PINs do not match'); return; }
    setLoading(true);
    const pinHash = await hashPin(pin);
    const { error } = await supabase.rpc('set_payment_pin', { p_user_id: userId, p_pin_hash: pinHash, p_pin_length: pin.length });
    setLoading(false);
    if (error) { setError(error.message); return; }
    onSuccess();
  };

  if (!open) return null;

  const strengthColors = { weak: 'bg-red-500', medium: 'bg-amber-500', strong: 'bg-emerald-500' };
  const strengthLabels = { weak: 'Weak', medium: 'Medium', strong: 'Strong' };

  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center">
              <Lock className="w-5 h-5 text-primary-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              {step === 'create' ? 'Create Payment PIN' : 'Confirm PIN'}
            </h2>
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

        <p className="text-sm text-gray-500 mb-4">
          {step === 'create' ? 'Choose a 4–8 digit PIN. Avoid common patterns like 123456 or repeated digits.' : 'Re-enter your PIN to confirm.'}
        </p>

        <div className="relative mb-4">
          <input
            ref={inputRef}
            type={show ? 'text' : 'password'}
            inputMode="numeric"
            value={step === 'create' ? pin : confirmPinStr}
            onChange={e => step === 'create' ? handlePinChange(e.target.value) : setConfirmPinStr(e.target.value.replace(/\D/g, '').slice(0, 8))}
            onPaste={e => e.preventDefault()}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                if (step === 'create' && pin.length >= 4) handleCreateNext();
                else if (step === 'confirm' && confirmPinStr.length >= 4) handleConfirm();
              }
            }}
            placeholder="••••"
            maxLength={8}
            autoComplete="off"
            className="w-full px-4 py-3 pr-10 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-2xl tracking-[0.5em] text-center focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
            {show ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>

        {step === 'create' && strength && (
          <div className="mb-4">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-600 overflow-hidden">
                <div className={`h-full transition-all ${strengthColors[strength]}`} style={{ width: strength === 'weak' ? '33%' : strength === 'medium' ? '66%' : '100%' }} />
              </div>
              <span className="text-xs text-gray-500">{strengthLabels[strength]}</span>
            </div>
          </div>
        )}

        {step === 'create' ? (
          <button onClick={handleCreateNext} disabled={pin.length < 4}
            className="w-full py-3 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            Continue
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => { setStep('create'); setConfirmPinStr(''); setError(null); }}
              className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              Back
            </button>
            <button onClick={handleConfirm} disabled={loading || confirmPinStr.length < 4}
              className="flex-1 py-3 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Setting...</> : <><CheckCircle className="w-4 h-4" /> Set PIN</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
