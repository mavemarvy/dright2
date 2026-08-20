import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, CheckCircle, Store } from 'lucide-react';
import { setAffiliateCookie, resolveReferrer, recordClick } from '../lib/affiliate';
import { supabase } from '../lib/supabase';

const REFERRAL_STORAGE_KEY = 'dright_referral_code';

export default function ReferralLandingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'saving' | 'done'>('saving');

  useEffect(() => {
    const refCode = searchParams.get('ref');
    const productParam = searchParams.get('product');

    if (!refCode) {
      navigate('/market');
      return;
    }

    // Store in both cookie and localStorage for persistence
    setAffiliateCookie(refCode);
    localStorage.setItem(REFERRAL_STORAGE_KEY, refCode);

    (async () => {
      const referrer = await resolveReferrer(refCode);
      if (referrer) {
        await recordClick(referrer.id, productParam || undefined);
      }

      // Check if user is already logged in
      const { data: { session } } = await supabase.auth.getSession();
      void session;

      const timer = setTimeout(() => {
        setStatus('done');
        setTimeout(() => {
          if (productParam) {
            // Product-specific referral — go to product page directly
            navigate(`/product/${productParam}`);
          } else {
            // General referral — go to market directly, bypassing sign-up/sign-in
            navigate('/market');
          }
        }, 600);
      }, 400);

      return () => clearTimeout(timer);
    })();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-blue-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center space-y-4"
      >
        {status === 'saving' ? (
          <>
            <div className="w-16 h-16 mx-auto bg-primary-100 rounded-full flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
            </div>
            <p className="text-lg font-medium text-gray-700">Saving your referral...</p>
          </>
        ) : (
          <>
            <div className="w-16 h-16 mx-auto bg-success-muted rounded-full flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-success" />
            </div>
            <p className="text-lg font-medium text-gray-700">Referral saved! Redirecting...</p>
            <p className="text-sm text-gray-500 flex items-center justify-center gap-1">
              <Store className="w-4 h-4" />
              Taking you to the marketplace
            </p>
          </>
        )}
      </motion.div>
    </div>
  );
}
