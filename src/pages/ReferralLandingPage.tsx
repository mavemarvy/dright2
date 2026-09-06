import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, CheckCircle, Store } from 'lucide-react';
import { resolveAndRecordTracking } from '../lib/affiliate';

export default function ReferralLandingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'saving' | 'done'>('saving');

  useEffect(() => {
    let cancelled = false;
    const refCode = searchParams.get('ref')?.trim();
    const productParam = searchParams.get('product')?.trim();

    if (!refCode) {
      navigate('/market', { replace: true });
      return;
    }

    (async () => {
      const attribution = await resolveAndRecordTracking(refCode, productParam || undefined);
      if (cancelled) return;
      setStatus('done');
      window.setTimeout(() => {
        if (cancelled) return;
        if (productParam && attribution) navigate(`/product/${encodeURIComponent(productParam)}`, { replace: true });
        else navigate('/market', { replace: true });
      }, 350);
    })();

    return () => { cancelled = true; };
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-blue-50">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-4">
        {status === 'saving' ? (
          <>
            <div className="w-16 h-16 mx-auto bg-primary-100 rounded-full flex items-center justify-center"><Loader2 className="w-8 h-8 text-primary-600 animate-spin" /></div>
            <p className="text-lg font-medium text-gray-700">Saving your referral...</p>
          </>
        ) : (
          <>
            <div className="w-16 h-16 mx-auto bg-success-muted rounded-full flex items-center justify-center"><CheckCircle className="w-8 h-8 text-success" /></div>
            <p className="text-lg font-medium text-gray-700">Referral saved! Redirecting...</p>
            <p className="text-sm text-gray-500 flex items-center justify-center gap-1"><Store className="w-4 h-4" />Taking you to the marketplace</p>
          </>
        )}
      </motion.div>
    </div>
  );
}
