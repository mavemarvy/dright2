import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Loader2, AlertCircle, Lock, CheckCircle2,
  Wallet, Sparkles, Shield, ChevronRight,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getCurrencySymbol, formatCurrency } from '../lib/currency';
import { supabase } from '../lib/supabase';
import { getWalletSummary, type WalletSummary } from '../lib/walletEngine';
import { fetchPaymentProviders, type PaymentProvider } from '../lib/paymentProviders';
import PaymentProviderCard from '../components/PaymentProviderCard';
import PINVerificationModal from '../components/PINVerificationModal';
import { getSecurityStatus } from '../lib/paymentSecurity';
import { initializePayment } from '../lib/paystackService';

type Step = 'review' | 'payment' | 'pin' | 'processing' | 'success';

interface PlanData {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  plan_type: string;
  amount: number;
  currency: string;
  interval: string;
  trial_days: number;
  features: string[];
  is_active: boolean;
  sort_order: number;
  paystack_plan_code: string | null;
}

export default function SubscriptionCheckoutPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const planId = searchParams.get('plan_id') || '';

  const [plan, setPlan] = useState<PlanData | null>(null);
  const cSym = getCurrencySymbol(plan?.currency || 'NGN');
  const [providers, setProviders] = useState<PaymentProvider[]>([]);
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>('review');
  const [selectedProvider, setSelectedProvider] = useState('paystack');
  const [payWithWallet, setPayWithWallet] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!planId) {
      setError('No plan selected.');
      setLoading(false);
      return;
    }

    const [planRes, providersRes, sec] = await Promise.all([
      supabase.from('subscription_plans').select('*').eq('id', planId).maybeSingle(),
      fetchPaymentProviders(),
      user ? getSecurityStatus(user.id) : Promise.resolve(null),
    ]);

    if (planRes.error || !planRes.data) {
      setError('Plan not found.');
      setLoading(false);
      return;
    }

    setPlan(planRes.data as PlanData);
    setProviders(providersRes);
    setHasPin(sec?.has_pin ?? false);

    if (user) {
      const sum = await getWalletSummary(user.id);
      setSummary(sum);
    }

    setLoading(false);
  }, [planId, user]);

  useEffect(() => { loadData(); }, [loadData]);

  const walletBalance = summary ? Number(summary.balance) : 0;
  const canPayWithWallet = walletBalance >= (plan?.amount || 0);

  const handleProceedToPayment = () => {
    setError(null);
    setStep('payment');
  };

  const handleProceedToPin = () => {
    if (!hasPin) {
      navigate('/security');
      return;
    }
    setError(null);
    setShowPin(true);
  };

  const handlePinSuccess = async () => {
    setShowPin(false);
    setStep('processing');
    setError(null);

    if (!user || !plan) return;

    if (payWithWallet) {
      // Debit wallet and activate subscription
      const { error: debitError } = await supabase.rpc('process_wallet_transaction', {
        p_user_id: user.id,
        p_wallet_id: summary?.wallet_id || '',
        p_type: 'debit',
        p_amount: plan.amount,
        p_description: `Subscription: ${plan.name}`,
        p_reference_type: 'subscription',
        p_balance_field: 'balance',
      });

      if (debitError) {
        setError(debitError.message || 'Wallet debit failed');
        setStep('payment');
        return;
      }

      // Activate subscription
      const periodEnd = new Date();
      if (plan.interval === 'monthly') periodEnd.setMonth(periodEnd.getMonth() + 1);
      else if (plan.interval === 'yearly') periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      else if (plan.interval === 'weekly') periodEnd.setDate(periodEnd.getDate() + 7);
      else periodEnd.setMonth(periodEnd.getMonth() + 1);

      const { error: subError } = await supabase.from('user_subscriptions').insert({
        user_id: user.id,
        plan_id: plan.id,
        status: 'active',
        current_period_start: new Date().toISOString(),
        current_period_end: periodEnd.toISOString(),
        last_payment_ref: `wallet_${Date.now()}`,
      });

      if (subError) {
        setError(subError.message || 'Failed to activate subscription');
        setStep('payment');
        return;
      }

      const { notifySubscriptionActivated } = await import('../lib/financialNotifications');
      await notifySubscriptionActivated(user.id, plan.name, plan.id);
      setStep('success');
    } else {
      // Paystack payment — never activate before verification
      const purposeMap: Record<string, string> = {
        affiliate: 'affiliate_subscription',
        vendor: 'vendor_subscription',
        premium: 'subscription',
        ai: 'subscription',
        advertising: 'subscription',
      };

      const result = await initializePayment({
        amount: plan.amount,
        purpose: purposeMap[plan.plan_type] || 'subscription',
        metadata: {
          plan_id: plan.id,
          plan_slug: plan.slug,
          plan_name: plan.name,
          user_id: user.id,
          provider: selectedProvider,
          custom_redirect: '/payment/callback',
        },
      });

      if ('error' in result) {
        setError(result.error);
        setStep('payment');
        return;
      }

      // Redirect to Paystack — subscription will be activated on callback verification
      window.location.href = result.authorization_url;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (error && !plan) {
    return (
      <div className="p-8 max-w-md mx-auto text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <p className="text-gray-900 font-semibold mb-2">{error}</p>
        <Link to="/subscriptions" className="mt-4 inline-flex items-center gap-2 text-primary-600">
          <ArrowLeft className="w-4 h-4" />Back to Plans
        </Link>
      </div>
    );
  }

  if (!plan) return null;

  if (step === 'success') {
    return (
      <div className="p-4 md:p-8 max-w-md mx-auto">
        <div className="bg-white rounded-3xl border border-gray-100 p-8 text-center">
          <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mb-4 mx-auto">
            <CheckCircle2 className="w-10 h-10 text-emerald-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Subscription Active</h1>
          <p className="text-sm text-gray-500 mb-4">
            Your <span className="font-semibold text-gray-900">{plan.name}</span> subscription is now active. Enjoy your benefits!
          </p>
          <div className="flex gap-3">
            <Link to="/subscriptions" className="flex-1 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold">
              View Subscriptions
            </Link>
            <Link to="/dashboard" className="flex-1 py-3 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl font-semibold">
              Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link to="/subscriptions" className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Subscribe</h1>
          <p className="text-sm text-gray-500">Review your plan and choose a payment method</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Plan Summary */}
          <div className="bg-gradient-to-br from-primary-600 to-primary-700 rounded-2xl p-6 text-white">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5" />
                  <h2 className="text-lg font-bold">{plan.name}</h2>
                </div>
                <p className="text-sm opacity-80 mt-1">{plan.description}</p>
              </div>
              <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-white/20 uppercase tracking-wide">
                {plan.plan_type}
              </span>
            </div>
            <div className="mt-4">
              <span className="text-3xl font-bold">{formatCurrency(plan.amount, plan.currency || 'NGN')}</span>
              <span className="text-sm opacity-80">/{plan.interval}</span>
            </div>
            {plan.trial_days > 0 && (
              <p className="text-xs opacity-80 mt-2">{plan.trial_days}-day free trial included</p>
            )}
            {plan.features && plan.features.length > 0 && (
              <div className="mt-4 space-y-1.5">
                {plan.features.map((feature, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm opacity-90">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    {feature}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Payment Method */}
          {step === 'payment' && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
              <h2 className="text-sm font-bold text-gray-900">Payment Method</h2>

              {/* Wallet Option */}
              <button
                onClick={() => { setPayWithWallet(true); handleProceedToPin(); }}
                disabled={!canPayWithWallet}
                className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
                  canPayWithWallet
                    ? 'border-gray-200 hover:border-primary-300 bg-white'
                    : 'border-gray-100 bg-gray-50 cursor-not-allowed opacity-60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                    <Wallet className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900 text-sm">Pay from Wallet</p>
                    <p className="text-xs text-gray-500">
                      Balance: {cSym}{walletBalance.toLocaleString()}
                      {!canPayWithWallet && ' (insufficient)'}
                    </p>
                  </div>
                  {canPayWithWallet && <ChevronRight className="w-5 h-5 text-gray-400" />}
                </div>
              </button>

              <div className="flex items-center gap-2 text-xs text-gray-400">
                <div className="flex-1 h-px bg-gray-100" />OR<div className="flex-1 h-px bg-gray-100" />
              </div>

              {/* Pay via Provider */}
              <div className="space-y-3">
                {providers.map((provider) => (
                  <PaymentProviderCard
                    key={provider.id}
                    provider={provider}
                    selected={selectedProvider === provider.slug}
                    onSelect={(slug) => {
                      setSelectedProvider(slug);
                      setPayWithWallet(false);
                    }}
                  />
                ))}
              </div>

              {selectedProvider && !payWithWallet && (
                <button
                  onClick={handleProceedToPin}
                  className="w-full py-4 bg-primary-600 hover:bg-primary-700 text-white rounded-2xl font-semibold flex items-center justify-center gap-2"
                >
                  <Lock className="w-5 h-5" />Continue to PIN Verification
                </button>
              )}
            </div>
          )}

          {/* Review Step */}
          {step === 'review' && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
              <h2 className="text-sm font-bold text-gray-900">Review Your Subscription</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Plan</span>
                  <span className="font-medium text-gray-900">{plan.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Billing</span>
                  <span className="font-medium text-gray-900">{plan.interval}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Amount</span>
                  <span className="font-bold text-primary-600">₦{plan.amount.toLocaleString()}</span>
                </div>
              </div>

              <div className="flex items-start gap-2 p-3 rounded-xl bg-primary-50/50">
                <Shield className="w-4 h-4 text-primary-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-gray-600">
                  Your subscription will only be activated after payment is verified. You can cancel anytime from your subscriptions page.
                </p>
              </div>

              <button
                onClick={handleProceedToPayment}
                className="w-full py-4 bg-primary-600 hover:bg-primary-700 text-white rounded-2xl font-semibold flex items-center justify-center gap-2"
              >
                Choose Payment Method <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-4 space-y-4">
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex justify-between items-center mb-3">
                <span className="font-bold text-gray-900">Total</span>
                <span className="text-xl font-bold text-primary-600">₦{plan.amount.toLocaleString()}</span>
              </div>
              <p className="text-xs text-gray-400">Billed {plan.interval}. Cancel anytime.</p>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4 p-3 rounded-lg bg-red-50 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {step === 'processing' && (
        <div className="fixed inset-0 z-[1400] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-8 text-center">
            <Loader2 className="w-10 h-10 animate-spin text-primary-600 mx-auto mb-4" />
            <p className="font-semibold text-gray-900">Processing payment...</p>
          </div>
        </div>
      )}

      <PINVerificationModal
        open={showPin}
        userId={user?.id || ''}
        context="subscription_purchase"
        title="Verify Subscription Payment"
        onSuccess={handlePinSuccess}
        onCancel={() => { setShowPin(false); setStep('payment'); }}
      />
    </div>
  );
}
