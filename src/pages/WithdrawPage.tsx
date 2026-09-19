import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Loader2, AlertCircle, Lock,
  CheckCircle2, Clock, Building2, Shield, Info, ChevronRight,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { getCurrencySymbol, tryConvertCurrency } from '../lib/currency';
import { supabase } from '../lib/supabase';
import { getWalletSummary, type WalletSummary } from '../lib/walletEngine';
import { fetchWithdrawalMethods, getEnabledMethods, getComingSoonMethods, type WithdrawalMethod } from '../lib/withdrawalMethods';
import { useBankAccounts, type BankAccount } from '../lib/bankAccounts';
import PINVerificationModal from '../components/PINVerificationModal';
import { getSecurityStatus } from '../lib/paymentSecurity';
import BankAccountManager from '../components/BankAccountManager';

type Step = 'method' | 'account' | 'amount' | 'pin' | 'submitting' | 'success';

export default function WithdrawPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedCurrency, rates, format } = useCurrency();
  const cSym = getCurrencySymbol(selectedCurrency);
  const walletCurrency = 'NGN';
  const convertAmount = useCallback((value: number, from: string, to: string) => {
    return tryConvertCurrency(value, from, to, rates);
  }, [rates]);

  const minimumDisplayAmount = useMemo(() => {
    const converted = convertAmount(100, 'NGN', selectedCurrency);
    if (!converted || converted <= 0) return selectedCurrency === 'NGN' ? 100 : 0;
    if (converted < 1) return Math.ceil(converted * 100) / 100;
    if (converted < 100) return Math.round(converted * 100) / 100;
    return Math.round(converted);
  }, [convertAmount, selectedCurrency]);
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [methods, setMethods] = useState<WithdrawalMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>('method');
  const [, setSelectedMethod] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<BankAccount | null>(null);
  const [amount, setAmount] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ reference: string; amount: number; status: string; message?: string } | null>(null);
  const [hasPin, setHasPin] = useState(false);
  const { accounts, reload: reloadBankAccounts } = useBankAccounts(user?.id);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [sum, m, sec] = await Promise.all([
      getWalletSummary(user.id),
      fetchWithdrawalMethods(),
      getSecurityStatus(user.id),
    ]);
    setSummary(sum);
    setMethods(m);
    setHasPin(sec?.has_pin ?? false);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const balance = summary ? Number(summary.balance) : 0;
  const displayBalance = convertAmount(balance, walletCurrency, selectedCurrency) ?? balance;
  const enabledMethods = getEnabledMethods(methods);
  const comingSoonMethods = getComingSoonMethods(methods);
  const enteredDisplayAmount = parseFloat(amount);
  const enteredCanonicalAmount = Number.isFinite(enteredDisplayAmount)
    ? convertAmount(enteredDisplayAmount, selectedCurrency, walletCurrency)
    : null;
  const canProceedToPin = Boolean(
    amount &&
    enteredCanonicalAmount &&
    enteredCanonicalAmount >= 100 &&
    enteredCanonicalAmount <= balance
  );

  const handleSelectMethod = (slug: string) => {
    setSelectedMethod(slug);
    setStep('account');
    setError(null);
  };

  const handleSelectAccount = () => {
    if (!selectedAccount) {
      setError('Please select a bank account');
      return;
    }
    if (!selectedAccount.is_verified || selectedAccount.verification_status !== 'verified' || !selectedAccount.recipient_code) {
      setError('Verify this bank account with Paystack before withdrawing.');
      return;
    }
    setStep('amount');
    setError(null);
  };

  const handleProceedToPin = () => {
    const amt = parseFloat(amount);
    if (!amt || amt < minimumDisplayAmount) {
      setError(`Minimum withdrawal amount is about ${cSym}${minimumDisplayAmount.toLocaleString()}`);
      return;
    }
    const canonicalAmount = convertAmount(amt, selectedCurrency, walletCurrency);
    if (!canonicalAmount || canonicalAmount < 100) {
      setError('Withdrawal must equal at least ₦100 at the current exchange rate');
      return;
    }
    if (canonicalAmount > balance) {
      setError('Insufficient balance');
      return;
    }
    if (!hasPin) {
      navigate('/security');
      return;
    }
    setError(null);
    setShowPin(true);
  };

  const handlePinSuccess = async (authorizationToken?: string) => {
    setShowPin(false);
    setError(null);

    if (!user || !selectedAccount) return;
    if (!authorizationToken) {
      setError('A fresh PIN authorization is required. Please verify your PIN again.');
      setStep('amount');
      return;
    }

    setStep('submitting');

    const displayAmount = parseFloat(amount);
    const canonicalAmount = convertAmount(displayAmount, selectedCurrency, walletCurrency);
    if (!canonicalAmount || canonicalAmount < 100) {
      setError('Withdrawal amount is below the NGN minimum after conversion');
      setStep('amount');
      return;
    }

    const { data, error: rpcError } = await supabase.rpc('create_withdrawal_request', {
      p_user_id: user.id,
      p_amount: Math.round(canonicalAmount * 100) / 100,
      p_bank_account_id: selectedAccount.id,
      p_authorization_token: authorizationToken,
    });

    if (rpcError || !data) {
      const errMsg = (data as { error?: string })?.error || rpcError?.message || 'Withdrawal failed';
      setError(errMsg);
      setStep('amount');
      return;
    }

    const resultData = data as { success: boolean; reference?: string; error?: string; withdrawal_id?: string };
    if (!resultData.success) {
      setError(resultData.error || 'Withdrawal failed');
      setStep('amount');
      return;
    }

    let payoutStatus = 'queued';
    let payoutMessage = 'Your withdrawal has been queued for processing.';

    if (resultData.withdrawal_id) {
      const { data: payoutData, error: payoutError } = await supabase.functions.invoke('paystack-withdrawal', {
        body: { withdrawal_id: resultData.withdrawal_id },
      });

      if (!payoutError && payoutData) {
        payoutStatus = String(payoutData.status || 'queued');
        payoutMessage = String(
          payoutData.message ||
          (payoutStatus === 'paid'
            ? 'Paystack confirmed the transfer.'
            : payoutStatus === 'processing'
              ? 'Your bank transfer has been submitted to Paystack.'
              : payoutStatus === 'manual_review'
                ? 'Your withdrawal is queued for admin review.'
                : 'Your withdrawal has been queued for processing.')
        );
      } else {
        const { data: currentWithdrawal } = await supabase
          .from('withdrawal_requests')
          .select('status,failure_reason')
          .eq('id', resultData.withdrawal_id)
          .maybeSingle();

        if (currentWithdrawal?.status) {
          payoutStatus = String(currentWithdrawal.status);
          payoutMessage = currentWithdrawal.failure_reason
            ? String(currentWithdrawal.failure_reason)
            : payoutMessage;
        }
      }
    }

    // Send notifications
    try {
      const { notifyWithdrawalRequested } = await import('../lib/financialNotifications');
      await notifyWithdrawalRequested(user.id, Math.round(canonicalAmount * 100) / 100, resultData.reference || '');
    } catch {
      // notifications are non-critical
    }

    setResult({
      reference: resultData.reference || '',
      amount: Math.round(canonicalAmount * 100) / 100,
      status: payoutStatus,
      message: payoutMessage,
    });
    setStep('success');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (step === 'success' && result) {
    return (
      <div className="p-4 md:p-8 max-w-md mx-auto">
        <div className="bg-white rounded-3xl border border-gray-100 p-8 text-center">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 mx-auto ${
            result.status === 'failed' ? 'bg-red-100' : result.status === 'paid' ? 'bg-emerald-100' : 'bg-amber-100'
          }`}>
            {result.status === 'failed'
              ? <AlertCircle className="w-10 h-10 text-red-600" />
              : result.status === 'paid'
                ? <CheckCircle2 className="w-10 h-10 text-emerald-600" />
                : <Clock className="w-10 h-10 text-amber-600" />}
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            {result.status === 'paid'
              ? 'Withdrawal Completed'
              : result.status === 'failed'
                ? 'Withdrawal Not Completed'
                : result.status === 'processing' || result.status === 'otp_required'
                  ? 'Withdrawal Processing'
                  : 'Withdrawal Submitted'}
          </h1>
          <p className="text-sm text-gray-500 mb-4">
            <span className="font-semibold text-gray-900">{format(result.amount, walletCurrency)}</span> — {result.message}
          </p>
          <div className="px-4 py-3 rounded-xl bg-gray-50 mb-4">
            <p className="text-xs text-gray-400">Reference</p>
            <p className="font-mono text-sm text-gray-900">{result.reference}</p>
          </div>
          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 mb-6 text-left">
            <Clock className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">
              {result.status === 'failed'
                ? 'The transfer did not complete. If Paystack failed or reversed it, DRIGHT2 returns the reserved amount to your wallet automatically.'
                : result.status === 'paid'
                  ? 'Paystack has confirmed this transfer as successful.'
                  : 'You will be notified when Paystack or an administrator confirms the final payout status.'}
            </p>
          </div>
          <div className="flex gap-3">
            <Link to="/wallet" className="flex-1 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold">
              Go to Wallet
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link to="/wallet" className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Withdraw Funds</h1>
          <p className="text-sm text-gray-500">Transfer money from your wallet to your bank account</p>
        </div>
      </div>

      {/* Balance Card */}
      <div className="bg-gradient-to-br from-primary-600 to-primary-700 rounded-2xl p-5 text-white mb-6">
        <p className="text-sm opacity-80">Available Balance</p>
        <p className="text-3xl font-bold mt-1">{format(balance, walletCurrency)}</p>
      </div>

      {/* Step Progress */}
      <div className="flex items-center gap-2 mb-6">
        {['Method', 'Account', 'Amount', 'PIN'].map((label, i) => {
          const stepOrder = ['method', 'account', 'amount', 'pin'];
          const currentIdx = stepOrder.indexOf(step === 'submitting' ? 'pin' : step);
          const isActive = i === currentIdx;
          const isDone = i < currentIdx;
          return (
            <div key={label} className="flex items-center gap-2 flex-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                isDone ? 'bg-primary-600 text-white' : isActive ? 'bg-primary-100 text-primary-600 ring-2 ring-primary-600' : 'bg-gray-100 text-gray-400'
              }`}>
                {isDone ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
              </div>
              <span className={`text-xs ${isActive ? 'font-semibold text-gray-900' : 'text-gray-400'}`}>{label}</span>
              {i < 3 && <div className={`flex-1 h-0.5 ${isDone ? 'bg-primary-600' : 'bg-gray-200'}`} />}
            </div>
          );
        })}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 flex items-center gap-2 mb-4">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Step: Method Selection */}
      {step === 'method' && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-gray-900 mb-2">Choose Withdrawal Method</h2>
          {enabledMethods.map((method) => (
            <WithdrawalMethodCard
              key={method.id}
              method={method}
              onSelect={handleSelectMethod}
            />
          ))}

          {comingSoonMethods.length > 0 && (
            <>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mt-6 mb-2">More Methods Coming Soon</p>
              {comingSoonMethods.map((method) => (
                <WithdrawalMethodCard key={method.id} method={method} />
              ))}
            </>
          )}

          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 mt-4">
            <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">
              Crypto withdrawals are disabled until activated by Super Admin. Crypto is withdrawal-only and will never be available as a payment method.
            </p>
          </div>
        </div>
      )}

      {/* Step: Account Selection */}
      {step === 'account' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900">Select Bank Account</h2>
            <button onClick={() => setStep('method')} className="text-sm text-gray-500 hover:text-gray-700">
              Back
            </button>
          </div>

          {accounts.length > 0 && (
            <div className="space-y-2">
              {accounts.map((account) => (
                <button
                  key={account.id}
                  onClick={() => setSelectedAccount(account)}
                  className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
                    selectedAccount?.id === account.id
                      ? 'border-primary-600 bg-primary-50'
                      : 'border-gray-100 hover:border-gray-200 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-gray-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm">{account.bank_name}</p>
                      <p className="text-xs text-gray-500 font-mono">{account.account_number}</p>
                      <p className="text-xs text-gray-400">{account.account_name}</p>
                    </div>
                    {selectedAccount?.id === account.id && <CheckCircle2 className="w-5 h-5 text-primary-600" />}
                  </div>
                </button>
              ))}
            </div>
          )}

          <BankAccountManager compact onAccountsChanged={reloadBankAccounts} />

          <button
            onClick={handleSelectAccount}
            disabled={!selectedAccount}
            className="w-full py-4 bg-primary-600 hover:bg-primary-700 text-white rounded-2xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            Continue <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Step: Amount */}
      {step === 'amount' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900">Enter Withdrawal Amount</h2>
            <button onClick={() => setStep('account')} className="text-sm text-gray-500 hover:text-gray-700">
              Back
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-gray-400">{cSym}</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount"
                autoFocus
                className="w-full pl-12 pr-4 py-4 rounded-xl border border-gray-200 bg-white text-2xl font-bold focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div className="flex items-center justify-between mt-3 text-sm">
              <span className="text-gray-500">Available: {format(balance, walletCurrency)}</span>
              <button
                onClick={() => setAmount(displayBalance.toFixed(selectedCurrency === 'NGN' ? 0 : 2))}
                className="text-primary-600 font-medium hover:text-primary-700"
              >
                Max
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2 mt-3">
              {[500, 1000, 5000, 10000].map((ngnAmount) => {
                const displayAmount = convertAmount(ngnAmount, 'NGN', selectedCurrency) ?? ngnAmount;
                const roundedDisplay = selectedCurrency === 'NGN'
                  ? Math.round(displayAmount)
                  : Math.max(0.01, Math.round(displayAmount * 100) / 100);
                return (
                  <button
                    key={ngnAmount}
                    onClick={() => setAmount(roundedDisplay.toString())}
                    className="py-2 rounded-lg bg-gray-100 text-sm font-medium text-gray-600 hover:bg-primary-50 hover:text-primary-600"
                  >
                    {format(ngnAmount, 'NGN')}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-gray-400 mt-3">
              Minimum withdrawal: about {cSym}{minimumDisplayAmount.toLocaleString()} · your entered amount is converted to the wallet's NGN ledger value before the withdrawal is created.
            </p>
          </div>

          {/* Summary */}
          {selectedAccount && (
            <div className="bg-gray-50 rounded-2xl p-4">
              <p className="text-xs font-medium text-gray-400 mb-2">WITHDRAWING TO</p>
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-900">{selectedAccount.bank_name}</span>
                <span className="text-sm text-gray-500 font-mono">••{selectedAccount.account_number.slice(-4)}</span>
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 p-3 rounded-xl bg-primary-50/50">
            <Shield className="w-4 h-4 text-primary-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-gray-600">
              You will be asked to verify your payment PIN before this withdrawal is submitted. This protects against unauthorized withdrawals.
            </p>
          </div>

          <button
            onClick={handleProceedToPin}
            disabled={!canProceedToPin}
            className="w-full py-4 bg-primary-600 hover:bg-primary-700 text-white rounded-2xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Lock className="w-5 h-5" />Continue to PIN Verification
          </button>
        </div>
      )}

      {/* Submitting */}
      {step === 'submitting' && (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-10 h-10 animate-spin text-primary-600 mb-4" />
          <p className="font-semibold text-gray-900">Processing withdrawal...</p>
          <p className="text-sm text-gray-500 mt-1">Please do not close this page</p>
        </div>
      )}

      {/* PIN Modal */}
      <PINVerificationModal
        open={showPin}
        userId={user?.id || ''}
        context="withdrawal"
        title="Verify Withdrawal"
        onSuccess={handlePinSuccess}
        onCancel={() => { setShowPin(false); setStep('amount'); }}
      />
    </div>
  );
}

function WithdrawalMethodCard({ method, onSelect }: { method: WithdrawalMethod; onSelect?: (slug: string) => void }) {
  const isEnabled = method.status === 'enabled';
  const isComingSoon = method.status === 'coming_soon';
  const logos: Record<string, string> = {
    nigerian_bank: '🏦', wise: '🟩', paypal: '🔵', us_bank: '🏛️',
    international_bank: '🌍', crypto: '₿',
  };

  return (
    <button
      type="button"
      disabled={!isEnabled}
      onClick={() => isEnabled && onSelect?.(method.slug)}
      className={`relative w-full text-left p-4 rounded-2xl border-2 transition-all ${
        isEnabled ? 'border-gray-200 hover:border-primary-300 bg-white cursor-pointer' : 'border-gray-100 bg-gray-50 cursor-not-allowed opacity-60'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-12 h-12 rounded-xl text-2xl bg-gray-100">
          {logos[method.slug] || '💸'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 text-sm">{method.name}</span>
            {method.badge && isEnabled && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary-100 text-primary-700">
                {method.badge}
              </span>
            )}
            {isComingSoon && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-500 uppercase tracking-wide">
                <Lock className="w-2.5 h-2.5" />Coming Soon
              </span>
            )}
            {method.is_crypto && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                Withdrawal Only
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{method.description}</p>
        </div>
        {isEnabled && <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />}
      </div>
    </button>
  );
}
