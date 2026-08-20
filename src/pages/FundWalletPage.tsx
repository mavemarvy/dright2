import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Loader2, AlertCircle, Lock, Wallet, Zap, Clock,
  TrendingUp, Building2,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { getCurrencySymbol } from '../lib/currency';
import { fetchPaymentProviders, type PaymentProvider } from '../lib/paymentProviders';
import { saveFundingAmount, fetchPaymentPreferences } from '../lib/paymentPreferences';
import PaymentProviderCard from '../components/PaymentProviderCard';
import { initializePayment } from '../lib/paystackService';

const QUICK_AMOUNTS = [500, 1000, 5000, 10000, 20000, 50000];

export default function FundWalletPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedCurrency } = useCurrency();
  const currencySymbol = getCurrencySymbol(selectedCurrency);
  const [providers, setProviders] = useState<PaymentProvider[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState('paystack');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentAmounts, setRecentAmounts] = useState<number[]>([]);
  const [lastFundingAmount, setLastFundingAmount] = useState<number | null>(null);

  const loadProviders = useCallback(async () => {
    setLoadingProviders(true);
    const data = await fetchPaymentProviders();
    setProviders(data);
    const enabled = data.find((p) => p.status === 'enabled');
    if (enabled) setSelectedProvider(enabled.slug);
    setLoadingProviders(false);

    if (user) {
      const prefs = await fetchPaymentPreferences(user.id);
      if (prefs?.recent_amounts?.length) {
        setRecentAmounts(prefs.recent_amounts);
      }
      if (prefs?.last_funding_amount) {
        setLastFundingAmount(prefs.last_funding_amount);
      }
    }
  }, [user]);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  const handleFund = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt < 100) {
      setError(`Minimum funding amount is ${currencySymbol}100`);
      return;
    }
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      const result = await initializePayment({
        amount: amt,
        purpose: 'wallet_funding',
        metadata: {
          user_id: user.id,
          provider: selectedProvider,
          custom_redirect: '/payment/callback',
        },
      });

      if ('error' in result) {
        setError(result.error);
        setLoading(false);
        return;
      }

      // Save funding amount preference
      await saveFundingAmount(user.id, amt);

      window.location.href = result.authorization_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize payment.');
      setLoading(false);
    }
  };

  // Determine the most used amount from recent amounts
  const recommendedAmount = recentAmounts[0] || 5000;

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link to="/wallet" className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Fund Wallet</h1>
          <p className="text-sm text-gray-500">Add money to your wallet balance</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Amount + Quick/Recent/Recommended */}
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-primary-600" />
              Amount to Add
            </h2>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-gray-400">{currencySymbol}</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount"
                className="w-full pl-10 pr-4 py-4 rounded-xl border border-gray-200 bg-white text-2xl font-bold focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <p className="text-xs font-medium text-gray-400 mt-4 mb-2 uppercase tracking-wide">Quick Amounts</p>
            <div className="grid grid-cols-3 gap-2">
              {QUICK_AMOUNTS.map((a) => (
                <button
                  key={a}
                  onClick={() => setAmount(a.toString())}
                  className={`py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                    amount === a.toString()
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-primary-50 hover:text-primary-600'
                  }`}
                >
                  {currencySymbol}{a.toLocaleString()}
                </button>
              ))}
            </div>
          </div>

          {/* Recent / Most Used / Recommended */}
          {recentAmounts.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="text-xs font-medium text-gray-400 mb-3 uppercase tracking-wide flex items-center gap-1">
                <Clock className="w-3 h-3" /> Recent Amounts
              </h3>
              <div className="space-y-2">
                {recentAmounts.slice(0, 3).map((a, i) => (
                  <button
                    key={a}
                    onClick={() => setAmount(a.toString())}
                    className="w-full flex items-center justify-between p-3 rounded-xl bg-gray-50 hover:bg-primary-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center">
                        <Wallet className="w-4 h-4 text-gray-400" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{currencySymbol}{a.toLocaleString()}</p>
                        {i === 0 && <p className="text-[10px] text-gray-400">Most used</p>}
                        {lastFundingAmount === a && i !== 0 && <p className="text-[10px] text-gray-400">Last used</p>}
                      </div>
                    </div>
                    {i === 0 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary-100 text-primary-700">
                        Recommended
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Recommended amount highlight (when no recent amounts) */}
          {recentAmounts.length === 0 && (
            <div className="bg-gradient-to-br from-primary-600 to-primary-700 rounded-2xl p-5 text-white">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4" />
                <span className="text-sm font-semibold">Recommended</span>
              </div>
              <p className="text-2xl font-bold">{currencySymbol}{recommendedAmount.toLocaleString()}</p>
              <p className="text-xs opacity-80 mt-1">Most popular funding amount for new users</p>
              <button
                onClick={() => setAmount(recommendedAmount.toString())}
                className="mt-3 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-semibold transition-colors"
              >
                Use this amount
              </button>
            </div>
          )}

          <div className="bg-primary-50/50 rounded-2xl border border-primary-100 p-4 flex items-start gap-2">
            <Zap className="w-4 h-4 text-primary-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-gray-600">
              Wallet funds can be used to buy products, subscribe to plans, and pay for services across the marketplace.
            </p>
          </div>
        </div>

        {/* Payment Method + Bank Transfer + Pay Button */}
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="text-sm font-bold text-gray-900 mb-1">Payment Method</h2>
            <p className="text-xs text-gray-500 mb-4">Choose a provider</p>

            {loadingProviders ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
              </div>
            ) : (
              <div className="space-y-3">
                {providers.map((provider) => (
                  <PaymentProviderCard
                    key={provider.id}
                    provider={provider}
                    selected={selectedProvider === provider.slug}
                    onSelect={setSelectedProvider}
                    subMethods={(provider as unknown as { sub_methods?: string[] }).sub_methods}
                    rating={(provider as unknown as { rating?: number }).rating}
                    processingTime={(provider as unknown as { processing_time?: string }).processing_time}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Bank Transfer Funding — Future Architecture */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-gray-400" />
                Bank Transfer Funding
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-500 uppercase tracking-wide">
                Coming Soon
              </span>
            </div>
            <p className="text-xs text-gray-500">
              Get a dedicated virtual bank account number. Transfer to it and your wallet is credited automatically — no card needed.
            </p>
            <div className="flex items-center gap-2 mt-3 text-xs text-gray-400">
              <Lock className="w-3 h-3" />
              <span>Powered by Paystack Dedicated Accounts</span>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <button
            onClick={handleFund}
            disabled={loading || !amount}
            className="w-full py-4 bg-primary-600 hover:bg-primary-700 text-white rounded-2xl font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 min-h-[56px] shadow-lg shadow-primary-600/20"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <><Lock className="w-5 h-5" />Fund {currencySymbol}{amount ? parseFloat(amount).toLocaleString() : '0'}</>
            )}
          </button>

          <button
            onClick={() => navigate('/wallet')}
            className="w-full py-3 text-sm font-medium text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
