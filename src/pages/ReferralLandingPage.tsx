import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, CheckCircle, Store } from 'lucide-react';
import { resolveAndRecordTracking, setPendingRedirect } from '../lib/affiliate';

export default function ReferralLandingPage() {
  const navigate = useNavigate();
  const { code } = useParams<{ code?: string }>();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'saving' | 'done'>('saving');

  useEffect(() => {
    let cancelled = false;
    const refCode = searchParams.get('ref')?.trim() || code?.trim();
    const productParam = searchParams.get('product')?.trim();
    const destination = productParam ? `/product/${encodeURIComponent(productParam)}` : '/market';

    if (!refCode) {
      navigate('/market', { replace: true });
      return;
    }

    // Keep the original destination across sign-up/sign-in. If a visitor reaches a
    // product through an affiliate link, authentication should return them to that product.
    setPendingRedirect(destination);

    void (async () => {
      const attribution = await resolveAndRecordTracking(refCode, productParam || undefined);
      if (cancelled) return;
      setStatus('done');
      window.setTimeout(() => {
        if (cancelled) return;
        // Product-specific links always preserve the product destination. An invalid
        // attribution simply means no commission is attached; it does not break browsing.
        navigate(productParam ? destination : attribution ? '/market' : '/market', { replace: true });
      }, 350);
    })();

    return () => { cancelled = true; };
  }, [searchParams, code, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-blue-50 dark:from-slate-950 dark:to-slate-900">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-4 px-4">
        {status === 'saving' ? (
          <>
            <div className="w-16 h-16 mx-auto bg-primary-100 dark:bg-primary-950/50 rounded-full flex items-center justify-center"><Loader2 className="w-8 h-8 text-primary-600 dark:text-primary-300 animate-spin" /></div>
            <p className="text-lg font-medium text-gray-700 dark:text-gray-200">Saving your referral…</p>
          </>
        ) : (
          <>
            <div className="w-16 h-16 mx-auto bg-success-muted dark:bg-green-950/40 rounded-full flex items-center justify-center"><CheckCircle className="w-8 h-8 text-success" /></div>
            <p className="text-lg font-medium text-gray-700 dark:text-gray-200">Referral saved. Redirecting…</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center justify-center gap-1"><Store className="w-4 h-4" />Taking you to {searchParams.get('product') ? 'the linked product' : 'the marketplace'}</p>
          </>
        )}
      </motion.div>
    </div>
  );
}
