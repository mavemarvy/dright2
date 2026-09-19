import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, AlertCircle, RefreshCw, ShoppingBag, UserPlus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useCurrency } from '../contexts/CurrencyContext';

type GuestPaymentStatus = 'verifying' | 'pending' | 'success' | 'failed';

interface GuestVerificationResult {
  success?: boolean;
  status?: string;
  error?: string;
  message?: string;
  reference?: string;
  guest_order_id?: string;
  product_id?: string;
  product_name?: string;
  amount?: number;
  currency?: string;
  channel?: string | null;
}

export default function GuestPaymentCallbackPage() {
  const [params] = useSearchParams();
  const reference = params.get('reference') || params.get('trxref') || '';
  const { format } = useCurrency();
  const [status, setStatus] = useState<GuestPaymentStatus>('verifying');
  const [message, setMessage] = useState('Confirming your payment with Paystack…');
  const [result, setResult] = useState<GuestVerificationResult | null>(null);
  const attemptsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const verify = useCallback(async () => {
    if (!reference) {
      setStatus('failed');
      setMessage('No guest payment reference was returned.');
      return;
    }

    attemptsRef.current += 1;
    const { data, error } = await supabase.functions.invoke('guest-payment-verify', {
      body: { reference },
    });
    const payload = (data || {}) as GuestVerificationResult;

    if (payload.success || payload.status === 'success') {
      setResult(payload);
      setStatus('success');
      setMessage('Your payment was confirmed successfully.');
      return;
    }

    const gatewayStatus = String(payload.status || '').toLowerCase();
    if (['failed', 'abandoned', 'reversed', 'processing_error'].includes(gatewayStatus)) {
      setResult(payload);
      setStatus('failed');
      setMessage(payload.error || payload.message || 'Payment could not be completed.');
      return;
    }

    if (error && !payload.status) {
      setStatus('failed');
      setMessage(payload.error || error.message || 'Unable to verify guest payment.');
      return;
    }

    if (attemptsRef.current >= 20) {
      setResult(payload);
      setStatus('pending');
      setMessage('Payment is still being confirmed. If you were charged, keep this reference and check again.');
      return;
    }

    setStatus('pending');
    setMessage(payload.message || 'Payment is still processing…');
    timerRef.current = setTimeout(() => void verify(), 3000);
  }, [reference]);

  useEffect(() => {
    void verify();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [verify]);

  const amountLabel = result?.amount != null
    ? format(Number(result.amount), result.currency || 'USD')
    : null;

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-950 px-4 py-10 flex items-center justify-center">
      <section className="w-full max-w-md rounded-3xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xl p-6 sm:p-8 text-center">
        {(status === 'verifying' || status === 'pending') && (
          <div className="w-16 h-16 rounded-full bg-primary-100 dark:bg-primary-950/40 flex items-center justify-center mx-auto mb-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
          </div>
        )}
        {status === 'success' && (
          <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-9 h-9 text-emerald-600" />
          </div>
        )}
        {status === 'failed' && (
          <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-950/40 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-9 h-9 text-red-600" />
          </div>
        )}

        <h1 className="text-xl font-black text-gray-900 dark:text-gray-100">
          {status === 'success' ? 'Payment Successful' : status === 'failed' ? 'Payment Problem' : 'Guest Payment'}
        </h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{message}</p>

        {status === 'success' && (
          <div className="mt-5 rounded-2xl bg-gray-50 dark:bg-gray-800 p-4 text-left space-y-2">
            {result?.product_name && (
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-gray-500 dark:text-gray-400">Item</span>
                <span className="font-semibold text-gray-900 dark:text-gray-100 text-right">{result.product_name}</span>
              </div>
            )}
            {amountLabel && (
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-gray-500 dark:text-gray-400">Paid</span>
                <span className="font-bold text-primary-600">{amountLabel}</span>
              </div>
            )}
            {result?.channel && (
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-gray-500 dark:text-gray-400">Method</span>
                <span className="font-semibold capitalize text-gray-900 dark:text-gray-100">{result.channel}</span>
              </div>
            )}
          </div>
        )}

        {reference && (
          <p className="mt-4 text-[11px] font-mono break-all text-gray-400">Ref: {reference}</p>
        )}

        <div className="mt-6 grid gap-3">
          {status === 'failed' || status === 'pending' ? (
            <button
              type="button"
              onClick={() => {
                attemptsRef.current = 0;
                setStatus('verifying');
                setMessage('Checking your payment again…');
                void verify();
              }}
              className="w-full min-h-[48px] rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-bold flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" /> Check Payment Again
            </button>
          ) : null}

          {result?.product_id && status === 'success' && (
            <Link
              to={`/product/${result.product_id}`}
              className="w-full min-h-[48px] rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-bold flex items-center justify-center gap-2"
            >
              <ShoppingBag className="w-4 h-4" /> Return to Product
            </Link>
          )}

          <Link
            to="/market"
            className="w-full min-h-[48px] rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 font-semibold flex items-center justify-center gap-2"
          >
            <ShoppingBag className="w-4 h-4" /> Continue Shopping
          </Link>

          {status === 'success' && (
            <Link
              to="/sign-up"
              className="w-full min-h-[48px] rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 font-semibold flex items-center justify-center gap-2"
            >
              <UserPlus className="w-4 h-4" /> Create an Account
            </Link>
          )}
        </div>
      </section>
    </main>
  );
}
