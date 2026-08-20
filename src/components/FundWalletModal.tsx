import { useState } from 'react';
import { Loader2, X, CreditCard, Wallet, Zap, CheckCircle2, AlertCircle } from 'lucide-react';
import { initializePayment, verifyPayment } from '../lib/paystackService';
import { useAuth } from '../contexts/AuthContext';
import { getCurrencySymbol } from '../lib/currency';

interface Props {
  open: boolean;
  onClose: () => void;
  onFunded?: () => void;
  purpose?: string;
  referenceId?: string;
  presetAmount?: number;
  title?: string;
}

const QUICK_AMOUNTS = [500, 1000, 2500, 5000, 10000, 25000];

export default function FundWalletModal({ open, onClose, onFunded, purpose = 'wallet_funding', referenceId, presetAmount, title = 'Fund Wallet' }: Props) {
  const { user } = useAuth();
  const cSym = getCurrencySymbol('NGN');
  const [amount, setAmount] = useState(presetAmount?.toString() || '');
  const [channel, setChannel] = useState<string>('card');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!open || !user) return null;

  const handlePay = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt < 100) { setError(`Minimum amount is ${cSym}100`); return; }
    setLoading(true); setError(null);

    const result = await initializePayment({
      amount: amt, purpose, reference_id: referenceId,
      channels: channel === 'card' ? ['card'] :
                channel === 'bank' ? ['bank'] :
                channel === 'ussd' ? ['ussd'] :
                channel === 'transfer' ? ['bank_transfer'] :
                channel === 'mobile_money' ? ['mobile_money'] :
                ['card', 'bank', 'ussd', 'bank_transfer'],
    });

    setLoading(false);

    if ('error' in result) { setError(result.error); return; }

    // Open Paystack checkout in new tab
    window.open(result.authorization_url, '_blank');

    // Start polling for verification
    setVerifying(true);
    let attempts = 0;
    const poll = setInterval(async () => {
      attempts++;
      const verify = await verifyPayment(result.reference);
      if (verify.success) {
        clearInterval(poll);
        setVerifying(false);
        setSuccess(true);
        onFunded?.();
      } else if (verify.status === 'failed' || attempts > 60) {
        clearInterval(poll);
        setVerifying(false);
      }
    }, 3000);
  };

  const reset = () => { setAmount(''); setError(null); setSuccess(false); setVerifying(false); };

  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-primary-600" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{title}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <div className="p-5">
          {success ? (
            <div className="text-center py-6">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <p className="font-semibold text-gray-900 dark:text-white mb-1">Payment Successful!</p>
              <p className="text-sm text-gray-500 mb-4">Your wallet has been funded with {cSym}{parseFloat(amount).toLocaleString()}</p>
              <button onClick={() => { reset(); onClose(); }} className="px-6 py-2.5 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700">Done</button>
            </div>
          ) : verifying ? (
            <div className="text-center py-8">
              <Loader2 className="w-10 h-10 animate-spin text-primary-600 mx-auto mb-3" />
              <p className="font-medium text-gray-900 dark:text-white">Waiting for payment confirmation...</p>
              <p className="text-sm text-gray-500 mt-1">Complete your payment in the new tab</p>
            </div>
          ) : (
            <div className="space-y-4">
              {error && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center gap-2"><AlertCircle className="w-4 h-4 text-red-500" /><p className="text-sm text-red-600">{error}</p></div>}

              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Amount (NGN)</label>
                <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Enter amount"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-primary-500" />
                <div className="flex flex-wrap gap-2 mt-2">
                  {QUICK_AMOUNTS.map(a => (
                    <button key={a} onClick={() => setAmount(a.toString())}
                      className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-sm font-medium text-gray-600 hover:bg-primary-50 hover:text-primary-600 transition-colors">
                      {cSym}{a.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Payment Method</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'card', label: 'Card', icon: CreditCard },
                    { key: 'transfer', label: 'Transfer', icon: Wallet },
                    { key: 'ussd', label: 'USSD', icon: Zap },
                  ].map(ch => (
                    <button key={ch.key} onClick={() => setChannel(ch.key)}
                      className={`p-3 rounded-xl border-2 text-center transition-colors ${channel === ch.key ? 'border-primary-500 bg-primary-50' : 'border-gray-100 dark:border-gray-600'}`}>
                      <ch.icon className={`w-5 h-5 mx-auto mb-1 ${channel === ch.key ? 'text-primary-600' : 'text-gray-400'}`} />
                      <span className="text-xs font-medium">{ch.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={handlePay} disabled={loading || !amount}
                className="w-full py-3.5 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5" />}
                Pay {cSym}{amount ? parseFloat(amount).toLocaleString() : '0'}
              </button>
              <p className="text-xs text-gray-400 text-center">Secured by Paystack. Your card details are never stored.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
