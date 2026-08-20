import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  Loader2, CheckCircle2, XCircle, AlertTriangle, RefreshCw,
  ArrowLeft, Home, Clock, Headphones, Mail, ShoppingBag, Receipt as ReceiptIcon, ListChecks,
} from 'lucide-react';
import { verifyPayment } from '../lib/paystackService';
import { supabase } from '../lib/supabase';
import PaymentStatusTimeline, { usePaymentTimeline } from '../components/PaymentStatusTimeline';
import { fetchPaymentProviders } from '../lib/paymentProviders';
import Receipt, { type ReceiptData } from '../components/Receipt';
import { getWalletBalances, getWalletSummary, getTransactions } from '../lib/walletEngine';
import { useCurrency } from '../contexts/CurrencyContext';

type CallbackStatus = 'loading' | 'processing' | 'success' | 'failed' | 'cancelled' | 'expired' | 'duplicate' | 'unknown';

const COUNTDOWN_SECONDS = 5;

export default function PaymentCallbackPage() {
  const navigate = useNavigate();
  const { format } = useCurrency();
  const [searchParams] = useSearchParams();
  const reference = searchParams.get('reference') || '';
  const statusParam = searchParams.get('status') || '';

  const [status, setStatus] = useState<CallbackStatus>('loading');
  const [message, setMessage] = useState('');
  const [txDetails, setTxDetails] = useState<{
    amount?: number;
    reference: string;
    purpose?: string;
    productName?: string;
    orderId?: string;
    channel?: string;
    sellerName?: string;
    sellerId?: string;
    buyerName?: string;
    date?: string;
    currency?: string;
  } | null>(null);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [availableGateways, setAvailableGateways] = useState<string[]>([]);
  const [showReceipt, setShowReceipt] = useState(false);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeline = usePaymentTimeline(false);
  const processedRef = useRef(false);

  const buildReceipt = useCallback(async (ref: string, amount?: number) => {
    try {
      const { data: tx } = await supabase
        .from('paystack_transactions')
        .select('*')
        .eq('reference', ref)
        .maybeSingle();

      if (!tx) return;

      const metadata = (tx.metadata as Record<string, unknown>) || {};
      const amountInNaira = amount ?? Number(tx.amount) / 100;
      const txCurrency = tx.currency || 'NGN';

      let buyerName = 'You';
      let sellerName = 'Seller';
      let sellerId: string | undefined;

      const { data: userData } = await supabase
        .from('users')
        .select('full_name, username')
        .eq('id', tx.user_id)
        .maybeSingle();
      if (userData) {
        buyerName = userData.full_name || userData.username || 'You';
      }

      if (tx.reference_id && (tx.purpose === 'product_purchase' || tx.purpose === 'escrow')) {
        const { data: orderData } = await supabase
          .from('sales_records')
          .select('seller_id, product_name')
          .eq('id', tx.reference_id)
          .maybeSingle();

        if (orderData) {
          sellerId = orderData.seller_id;
          const { data: sellerUserData } = await supabase
            .from('users')
            .select('full_name, username')
            .eq('id', orderData.seller_id)
            .maybeSingle();
          if (sellerUserData) {
            sellerName = sellerUserData.full_name || sellerUserData.username || 'Seller';
          }
        }
      }

      const receipt: ReceiptData = {
        receiptNumber: `RCP-${ref.slice(-8).toUpperCase()}`,
        reference: ref,
        product: (metadata.product_name as string) || (tx.purpose === 'wallet_funding' ? 'Wallet Funding' : 'Purchase'),
        buyer: buyerName,
        seller: sellerName,
        sellerId,
        amount: amountInNaira,
        status: 'success',
        gateway: 'paystack',
        date: tx.paid_at || tx.created_at || new Date().toISOString(),
        currency: txCurrency,
        orderId: tx.reference_id || undefined,
      };

      setReceiptData(receipt);
      setTxDetails((prev) => prev ? {
        ...prev,
        amount: amountInNaira,
        purpose: tx.purpose,
        channel: tx.channel || undefined,
        sellerName,
        sellerId,
        buyerName,
        date: tx.paid_at || tx.created_at,
        productName: metadata.product_name as string | undefined,
        orderId: tx.reference_id || undefined,
        currency: txCurrency,
      } : prev);
    } catch {
      // receipt data is non-critical
    }
  }, []);

  const handleSuccess = useCallback(async (ref: string, amount?: number, msg?: string) => {
    if (processedRef.current) return;
    processedRef.current = true;
    if (pollRef.current) clearInterval(pollRef.current);
    timeline.jumpTo(6);
    setStatus('success');
    setMessage(msg || 'Payment confirmed successfully.');
    setTxDetails({ reference: ref, amount, purpose: 'payment' });

    // Build receipt with full details
    await buildReceipt(ref, amount);

    // Refresh all wallet-related queries before showing success receipt
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Force-fetch fresh wallet balances, summary, and transactions
        await Promise.all([
          getWalletBalances(user.id),
          getWalletSummary(user.id),
          getTransactions(user.id, 20, 0),
        ]);
        // Broadcast wallet update so all listening pages refresh
        window.dispatchEvent(new CustomEvent('wallet-updated', { detail: { reference: ref, amount } }));
      }
    } catch {
      // wallet refresh is non-critical for the success page
    }

    // Start countdown for auto-redirect
    setCountdown(COUNTDOWN_SECONDS);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          // Auto-redirect: wallet for funding, order page for purchases, subscriptions for sub
          const purpose = txDetails?.purpose || receiptData?.product;
          if (purpose === 'wallet_funding' || purpose === 'Wallet Funding' || purpose === 'advertiser_funding') {
            navigate('/wallet');
          } else if (purpose === 'subscription' || purpose === 'affiliate_subscription' || purpose === 'vendor_subscription') {
            navigate('/subscriptions');
          } else if (txDetails?.orderId || receiptData?.orderId) {
            navigate('/my-orders');
          } else {
            navigate('/wallet');
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [buildReceipt, timeline, navigate, txDetails?.purpose, txDetails?.orderId, receiptData?.product, receiptData?.orderId]);

  useEffect(() => {
    if (!reference) {
      setStatus('unknown');
      setMessage('No payment reference found in the URL.');
      return;
    }

    // Free order callback
    if (reference.startsWith('free_')) {
      const orderId = reference.replace('free_', '');
      processedRef.current = true;
      setStatus('success');
      setMessage('Your free order has been completed successfully.');
      setTxDetails({ reference, orderId, purpose: 'product_purchase' });
      timeline.jumpTo(6);
      // Start countdown for auto-redirect to orders
      setCountdown(COUNTDOWN_SECONDS);
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            if (countdownRef.current) clearInterval(countdownRef.current);
            navigate('/my-orders');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return;
    }

    if (statusParam) {
      setStatus('processing');
      timeline.start();
    }

    let attempts = 0;
    const maxAttempts = 30;

    const poll = async () => {
      if (processedRef.current) return;
      attempts++;
      timeline.advance();
      const result = await verifyPayment(reference);

      if (result.success || result.status === 'success') {
        await handleSuccess(reference, result.amount, result.message);
        return;
      }

      const failStatus = result.status?.toLowerCase() || '';
      if (failStatus === 'failed' || failStatus === 'abandoned' || failStatus === 'reversed') {
        if (pollRef.current) clearInterval(pollRef.current);
        timeline.fail();
        if (failStatus === 'abandoned') {
          setStatus('cancelled');
          setMessage('Payment was cancelled or abandoned.');
        } else {
          setStatus('failed');
          setMessage(result.message || 'Payment failed. Please try again.');
        }
        return;
      }

      // Check for duplicate payment in DB
      if (attempts > 5) {
        const { data: existingTx } = await supabase
          .from('paystack_transactions')
          .select('status, purpose, amount, processed_at')
          .eq('reference', reference)
          .maybeSingle();

        if (existingTx?.status === 'success' && existingTx?.processed_at) {
          await handleSuccess(reference, Number(existingTx.amount) / 100, 'Payment already processed.');
          setStatus('duplicate');
          return;
        }
      }

      if (attempts >= maxAttempts) {
        if (pollRef.current) clearInterval(pollRef.current);
        setStatus('expired');
        setMessage('Payment verification timed out. If you were charged, contact support with this reference.');
        setTxDetails({ reference });
      }
    };

    // Load available gateways for failure recovery
    fetchPaymentProviders().then((providers) => {
      setAvailableGateways(providers.filter(p => p.status === 'enabled').map(p => p.name));
    }).catch(() => {});

    poll();
    pollRef.current = setInterval(poll, 4000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference, statusParam]);

  const handleRetry = () => navigate(-1);
  const handleChooseAnother = () => navigate('/wallet');

  const cancelAutoRedirect = () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setCountdown(0);
  };

  const redirectTo = (path: string) => {
    cancelAutoRedirect();
    navigate(path);
  };

  const isFunding = txDetails?.purpose === 'wallet_funding' || receiptData?.product === 'Wallet Funding';
  const isPurchase = txDetails?.purpose === 'product_purchase' || txDetails?.purpose === 'escrow' || !!txDetails?.orderId || !!receiptData?.orderId;
  const targetPage = isFunding ? '/wallet' : isPurchase ? '/my-orders' : '/wallet';
  const targetLabel = isFunding ? 'Wallet' : isPurchase ? 'Orders' : 'Wallet';
  const progressPercent = countdown > 0 ? ((COUNTDOWN_SECONDS - countdown) / COUNTDOWN_SECONDS) * 100 : 100;
  const displayCurrency = txDetails?.currency || 'NGN';

  const renderStatus = () => {
    switch (status) {
      case 'loading':
      case 'processing':
        return (
          <>
            <div className="w-20 h-20 rounded-full bg-primary-100 flex items-center justify-center mb-4">
              <Loader2 className="w-10 h-10 animate-spin text-primary-600" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">
              {status === 'processing' ? 'Processing Payment' : 'Verifying Payment'}
            </h1>
            <p className="text-sm text-gray-500 max-w-sm mb-6">
              {status === 'processing'
                ? 'Your payment is being processed. This usually takes a few seconds.'
                : 'We are confirming your payment with the payment gateway. Please do not close this page.'}
            </p>
            <div className="w-full max-w-xs">
              <PaymentStatusTimeline currentStep={timeline.currentStep} failed={timeline.failed} />
            </div>
            {txDetails?.reference && (
              <div className="mt-4 px-4 py-2 rounded-lg bg-gray-50 text-xs text-gray-400 font-mono">
                Ref: {txDetails.reference}
              </div>
            )}
          </>
        );

      case 'success':
      case 'duplicate':
        return (
          <>
            <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-10 h-10 text-emerald-600" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">
              {status === 'duplicate' ? 'Payment Already Processed' : 'Payment Successful'}
            </h1>
            <p className="text-sm text-gray-500 max-w-sm mb-4">{message}</p>

            {txDetails?.amount != null && (
              <div className="mt-2 px-6 py-3 rounded-xl bg-primary-50">
                <span className="text-2xl font-bold text-primary-600">
                  {format(txDetails.amount, displayCurrency)}
                </span>
              </div>
            )}
            {txDetails?.channel && (
              <div className="mt-2 text-xs text-gray-500">
                Payment method: <span className="font-medium capitalize">{txDetails.channel}</span>
              </div>
            )}
            {txDetails?.reference && (
              <div className="mt-3 px-4 py-2 rounded-lg bg-gray-50 text-xs text-gray-400 font-mono">
                Ref: {txDetails.reference}
              </div>
            )}

            {/* Countdown timer with progress bar */}
            {countdown > 0 && (
              <div className="mt-6 w-full max-w-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500">
                    Redirecting to {targetLabel} in {countdown}s...
                  </span>
                  <button onClick={cancelAutoRedirect} className="text-xs text-gray-400 hover:text-gray-600 underline">
                    Stay here
                  </button>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-1000 ease-linear"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-col gap-3 mt-6 w-full">
              <div className="flex gap-3">
                <button
                  onClick={() => redirectTo(targetPage)}
                  className="flex-1 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  <Home className="w-4 h-4" />
                  {isFunding ? 'Go to Wallet' : 'View Order'}
                </button>
                <button
                  onClick={() => { cancelAutoRedirect(); setShowReceipt(true); }}
                  className={`flex-1 py-3 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 ${
                    showReceipt
                      ? 'bg-primary-100 text-primary-700 border border-primary-200'
                      : 'bg-white border border-gray-200 hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <ReceiptIcon className="w-4 h-4" />
                  {showReceipt ? 'Hide Receipt' : 'View Receipt'}
                </button>
              </div>
              <div className="flex gap-3">
                <Link
                  to="/wallet"
                  onClick={cancelAutoRedirect}
                  className="flex-1 py-3 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  <ListChecks className="w-4 h-4" />
                  View Transactions
                </Link>
                <Link
                  to="/market"
                  onClick={cancelAutoRedirect}
                  className="flex-1 py-3 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  <ShoppingBag className="w-4 h-4" />
                  Continue Shopping
                </Link>
              </div>
            </div>
          </>
        );

      case 'failed':
        return (
          <>
            <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mb-4">
              <XCircle className="w-10 h-10 text-red-600" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Payment Failed</h1>
            <p className="text-sm text-gray-500 max-w-sm mb-4">{message}</p>
            {txDetails?.reference && (
              <div className="mt-2 px-4 py-2 rounded-lg bg-gray-50 text-xs text-gray-400 font-mono mb-4">
                Ref: {txDetails.reference}
              </div>
            )}
            <div className="space-y-2 w-full mt-4">
              <button onClick={handleRetry} className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4" />Retry Payment
              </button>
              {availableGateways.length > 1 && (
                <button onClick={handleChooseAnother} className="w-full py-3 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2">
                  Choose Another Gateway
                </button>
              )}
              <Link to="/market" className="w-full py-3 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2">
                <ArrowLeft className="w-4 h-4" />Try Again Later
              </Link>
              <a href="mailto:support@dright.com" className="w-full py-3 bg-white border border-gray-200 hover:bg-gray-50 text-gray-500 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2">
                <Headphones className="w-4 h-4" />Contact Support
              </a>
            </div>
          </>
        );

      case 'cancelled':
        return (
          <>
            <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center mb-4">
              <AlertTriangle className="w-10 h-10 text-amber-600" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Payment Cancelled</h1>
            <p className="text-sm text-gray-500 max-w-sm mb-4">{message}</p>
            {txDetails?.reference && (
              <div className="mt-2 px-4 py-2 rounded-lg bg-gray-50 text-xs text-gray-400 font-mono mb-4">
                Ref: {txDetails.reference}
              </div>
            )}
            <div className="flex gap-3 mt-4 w-full">
              <button onClick={handleRetry} className="flex-1 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4" />Try Again
              </button>
              <Link to="/wallet" className="flex-1 py-3 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2">
                <Home className="w-4 h-4" />Wallet
              </Link>
            </div>
          </>
        );

      case 'expired':
        return (
          <>
            <div className="w-20 h-20 rounded-full bg-orange-100 flex items-center justify-center mb-4">
              <Clock className="w-10 h-10 text-orange-600" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Verification Timed Out</h1>
            <p className="text-sm text-gray-500 max-w-sm mb-4">{message}</p>
            {txDetails?.reference && (
              <div className="mt-2 px-4 py-2 rounded-lg bg-gray-50 text-xs text-gray-400 font-mono mb-4">
                Ref: {txDetails.reference}
              </div>
            )}
            <div className="flex gap-3 mt-4 w-full">
              <button onClick={handleRetry} className="flex-1 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4" />Retry
              </button>
              <a href="mailto:support@dright.com" className="flex-1 py-3 bg-white border border-gray-200 hover:bg-gray-50 text-gray-500 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2">
                <Mail className="w-4 h-4" />Support
              </a>
            </div>
          </>
        );

      default:
        return (
          <>
            <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <AlertTriangle className="w-10 h-10 text-gray-400" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Something Went Wrong</h1>
            <p className="text-sm text-gray-500 max-w-sm mb-4">{message || 'We could not process your payment callback.'}</p>
            <div className="flex gap-3 mt-4 w-full">
              <Link to="/wallet" className="flex-1 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2">
                <Home className="w-4 h-4" />Go to Wallet
              </Link>
              <Link to="/market" className="flex-1 py-3 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2">
                <ArrowLeft className="w-4 h-4" />Market
              </Link>
            </div>
          </>
        );
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-3xl border border-gray-100 p-8 md:p-10 text-center shadow-sm">
          {renderStatus()}
        </div>
        {receiptData && (showReceipt || ((status === 'success' || status === 'duplicate') && !countdown)) && (
          <div className="mt-6">
            <Receipt data={receiptData} />
          </div>
        )}
      </div>
    </div>
  );
}
