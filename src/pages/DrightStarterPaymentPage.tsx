import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, UserPlus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { setPendingDrightStarterPurchase } from '../lib/drightStarter';
import { formatCurrencyValue } from '../lib/currency';
import { DrightMark } from '../components/DrightBrand';

type PaymentState = 'verifying' | 'pending' | 'success' | 'failed';

interface Result {
  success?: boolean;
  status?: string;
  error?: string;
  message?: string;
  reference?: string;
  purchase_id?: string;
  title?: string;
  amount?: number;
  currency?: string;
  included_trial_days?: number;
}

export default function DrightStarterPaymentPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const reference = params.get('reference') || params.get('trxref') || '';
  const [state, setState] = useState<PaymentState>('verifying');
  const [message, setMessage] = useState('Confirming your DRIGHT Starter payment…');
  const [result, setResult] = useState<Result | null>(null);
  const attempts = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const verify = useCallback(async () => {
    if (!reference) {
      setState('failed');
      setMessage('No Starter payment reference was returned.');
      return;
    }

    attempts.current += 1;
    const { data, error } = await supabase.functions.invoke('dright-starter-payment-verify', {
      body: { reference },
    });
    const payload = (data || {}) as Result;

    if (payload.success || payload.status === 'success') {
      setResult(payload);
      setPendingDrightStarterPurchase(reference);
      setState('success');
      setMessage('Payment confirmed. Taking you to create your DRIGHT account…');
      redirectTimer.current = setTimeout(() => {
        navigate('/sign-up?starter_reference=' + encodeURIComponent(reference), { replace: true });
      }, 2200);
      return;
    }

    const gateway = String(payload.status || '').toLowerCase();
    if (['failed', 'abandoned', 'reversed'].includes(gateway)) {
      setResult(payload);
      setState('failed');
      setMessage(payload.error || payload.message || 'Payment could not be completed.');
      return;
    }

    if (error && !payload.status) {
      setState('failed');
      setMessage(payload.error || error.message || 'Unable to verify payment.');
      return;
    }

    if (attempts.current >= 20) {
      setResult(payload);
      setState('pending');
      setMessage('Payment is still being confirmed. If you were charged, keep this reference and check again.');
      return;
    }

    setState('pending');
    setMessage(payload.message || 'Payment is still processing…');
    timer.current = setTimeout(() => void verify(), 3000);
  }, [navigate, reference]);

  useEffect(() => {
    void verify();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    };
  }, [verify]);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 flex items-center justify-center">
      <section className="w-full max-w-md rounded-3xl bg-white shadow-2xl p-6 sm:p-8 text-center">
        <DrightMark size={58} className="mx-auto mb-5" />

        {(state === 'verifying' || state === 'pending') && (
          <div className="w-14 h-14 mx-auto rounded-full bg-primary-50 flex items-center justify-center mb-4">
            <Loader2 className="w-7 h-7 animate-spin text-primary-600" />
          </div>
        )}
        {state === 'success' && (
          <div className="w-14 h-14 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
        )}
        {state === 'failed' && (
          <div className="w-14 h-14 mx-auto rounded-full bg-red-50 flex items-center justify-center mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
        )}

        <h1 className="text-xl font-black text-slate-900">
          {state === 'success' ? 'DRIGHT Starter Purchased' : state === 'failed' ? 'Payment Problem' : 'Confirming Starter Payment'}
        </h1>
        <p className="mt-2 text-sm text-slate-500">{message}</p>

        {state === 'success' && result && (
          <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-left space-y-2">
            <Row label="Product" value={result.title || 'DRIGHT Starter Access'} />
            {result.amount != null && <Row label="Paid" value={formatCurrencyValue(Number(result.amount), result.currency || 'NGN')} />}
            <Row label="Included access" value={String(Number(result.included_trial_days || 0)) + ' days'} />
          </div>
        )}

        {reference && <p className="mt-4 text-[10px] font-mono break-all text-slate-400">Ref: {reference}</p>}

        <div className="mt-6 grid gap-3">
          {(state === 'pending' || state === 'failed') && (
            <button
              type="button"
              onClick={() => {
                attempts.current = 0;
                setState('verifying');
                setMessage('Checking your payment again…');
                void verify();
              }}
              className="min-h-[48px] rounded-xl bg-primary-600 text-white font-black flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" /> Check Payment Again
            </button>
          )}

          {state === 'success' && (
            <Link
              to={'/sign-up?starter_reference=' + encodeURIComponent(reference)}
              className="min-h-[48px] rounded-xl bg-primary-600 text-white font-black flex items-center justify-center gap-2"
            >
              <UserPlus className="w-4 h-4" /> Create your DRIGHT account
            </Link>
          )}

          <Link to="/dright/starter" className="text-sm text-slate-500 font-semibold">Back to Starter product</Link>
        </div>
      </section>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3 text-sm"><span className="text-slate-500">{label}</span><span className="font-bold text-slate-900 text-right">{value}</span></div>;
}
