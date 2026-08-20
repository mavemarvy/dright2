import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, X, ArrowRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fetchAbandonedPayments, dismissAbandonedPayment, type AbandonedPayment } from '../lib/paymentPreferences';
import { getCurrencySymbol } from '../lib/currency';

export default function AbandonedPaymentBanner() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [abandoned, setAbandoned] = useState<AbandonedPayment[]>([]);
  const [dismissed] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    fetchAbandonedPayments(user.id).then((data) => {
      if (active) setAbandoned(data);
    });
    return () => { active = false; };
  }, [user]);

  const handleDismiss = async (id: string) => {
    setAbandoned((prev) => prev.filter((p) => p.id !== id));
    await dismissAbandonedPayment(id);
  };

  const handleContinue = (payment: AbandonedPayment) => {
    if (payment.purpose === 'product_purchase' && payment.order_id) {
      navigate(`/checkout/payment?order_id=${payment.order_id}&product_id=${(payment as unknown as { product_id?: string }).product_id || ''}`);
    } else if (payment.purpose === 'wallet_funding') {
      navigate('/wallet/fund');
    }
  };

  if (abandoned.length === 0 || dismissed) return null;

  const payment = abandoned[0];

  return (
    <div className="mx-4 mt-3 md:mx-8 md:mt-4">
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-5 h-5 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900">You have an unfinished payment</p>
          <p className="text-xs text-amber-700 mt-0.5 truncate">
            {payment.product_name || 'Payment'} — {getCurrencySymbol('NGN')}{Number(payment.amount).toLocaleString()}
            {payment.reference && <span className="ml-1 font-mono">({payment.reference.slice(0, 12)}...)</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => handleContinue(payment)}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-semibold flex items-center gap-1.5 transition-colors"
          >
            Continue <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleDismiss(payment.id)}
            className="p-2 rounded-lg hover:bg-amber-100 text-amber-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
