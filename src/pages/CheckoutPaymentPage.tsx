import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Shield, Loader2, AlertCircle, CheckCircle2, Lock,
  ShoppingCart, Tag, Wallet, Truck, User, Info, ChevronDown,
  ChevronUp, Ticket, Zap, Award, BadgeCheck, Star, RotateCcw,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { fetchPaymentProviders, type PaymentProvider } from '../lib/paymentProviders';
import { saveGatewayPreference, fetchPaymentPreferences, saveAbandonedPayment } from '../lib/paymentPreferences';
import { detectCountry, sortProvidersByCountry, getCountryInfo } from '../lib/countryDetection';
import PaymentProviderCard from '../components/PaymentProviderCard';
import { initializePayment } from '../lib/paystackService';
import { createInvoice } from '../lib/invoiceLib';
import { formatCurrency } from '../lib/currency';

interface CheckoutData {
  orderId: string;
  productId: string;
  productName: string;
  productImage: string | null;
  sellerId: string;
  sellerName: string;
  quantity: number;
  basePrice: number;
  tierPrice: number;
  customizationPrice: number;
  adminTaskAmount: number;
  salesTeamTaskAmount: number;
  affiliateCommissionAmount: number;
  finalPrice: number;
  isFreeOrder: boolean;
  refCode: string | null;
  productType: string;
  estimatedDelivery: string;
  sellerTrustScore: number | null;
  sellerVerified: boolean;
}

export default function CheckoutPaymentPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
    const formatCurrencyFn = (n: number) => formatCurrency(n);
  const [searchParams] = useSearchParams();

  const orderId = searchParams.get('order_id') || '';
  const productId = searchParams.get('product_id') || '';

  const [providers, setProviders] = useState<PaymentProvider[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState<string>('paystack');
  const [checkoutData, setCheckoutData] = useState<CheckoutData | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [countryCode, setCountryCode] = useState('NG');
  const [showBilling, setShowBilling] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [couponApplied, setCouponApplied] = useState(false);
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [billingDetails, setBillingDetails] = useState({ name: '', email: '', phone: '', address: '' });
  const [lastGateway, setLastGateway] = useState<string | null>(null);
  const [duplicateCheck, setDuplicateCheck] = useState(false);
  const savedAbandonedRef = useRef(false);

  const loadProviders = useCallback(async () => {
    setProvidersLoading(true);
    const data = await fetchPaymentProviders();
    const country = await detectCountry();
    setCountryCode(country);
    const sorted = sortProvidersByCountry(data, country);
    setProviders(sorted);

    // Load user's last gateway preference
    if (user) {
      const prefs = await fetchPaymentPreferences(user.id);
      if (prefs?.last_gateway) {
        setLastGateway(prefs.last_gateway);
        const lastEnabled = sorted.find(p => p.slug === prefs.last_gateway && p.status === 'enabled');
        if (lastEnabled) setSelectedProvider(prefs.last_gateway);
      }
    }

    const enabled = sorted.find((p) => p.status === 'enabled');
    if (enabled && !lastGateway) setSelectedProvider(enabled.slug);
    setProvidersLoading(false);
  }, [user]);

  const loadCheckoutData = useCallback(async () => {
    if (!orderId || !productId) {
      setError('Missing order or product information.');
      setLoading(false);
      return;
    }

    // Check for duplicate payment first
    const { data: existingTx } = await supabase
      .from('paystack_transactions')
      .select('status, reference')
      .eq('reference_id', orderId)
      .eq('status', 'success')
      .maybeSingle();

    if (existingTx) {
      setDuplicateCheck(true);
      setLoading(false);
      return;
    }

    try {
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .select('*, products!inner(*)')
        .eq('id', orderId)
        .maybeSingle();

      if (orderErr || !order) {
        setError('Order not found. Please try checkout again.');
        setLoading(false);
        return;
      }

      const product = order.products;
      const { data: seller } = await supabase
        .from('users')
        .select('full_name, email')
        .eq('id', order.seller_id)
        .maybeSingle();

      const isFree = order.is_free_order || Number(order.final_price) === 0;

      let deliveryEstimate = 'Instant download';
      if (order.order_type === 'PHYSICAL') deliveryEstimate = '3-7 business days';
      else if (order.order_type === 'SERVICE') deliveryEstimate = 'Per service tier';

      setCheckoutData({
        orderId: order.id,
        productId: product.id,
        productName: product.name,
        productImage: product.image_url || null,
        sellerId: order.seller_id,
        sellerName: seller?.full_name || seller?.email || 'Seller',
        quantity: 1,
        basePrice: Number(order.base_price) || Number(product.price),
        tierPrice: Number(order.tier_price) || 0,
        customizationPrice: Number(order.customization_price) || 0,
        adminTaskAmount: Number(order.admin_task_amount) || 0,
        salesTeamTaskAmount: Number(order.sales_team_task_amount) || 0,
        affiliateCommissionAmount: Number(order.affiliate_commission_amount) || 0,
        finalPrice: Number(order.final_price) || 0,
        isFreeOrder: isFree,
        refCode: order.referrer_id ? 'applied' : null,
        productType: order.order_type || 'PHYSICAL',
        estimatedDelivery: deliveryEstimate,
        sellerTrustScore: null,
        sellerVerified: false,
      });

      // Fetch seller trust score and verification
      try {
        const { data: sellerProfile } = await supabase
          .from('users')
          .select('average_rating, is_verified')
          .eq('id', order.seller_id)
          .maybeSingle();

        if (sellerProfile) {
          setCheckoutData((prev) => prev ? {
            ...prev,
            sellerTrustScore: sellerProfile.average_rating ? Number(sellerProfile.average_rating) : null,
            sellerVerified: sellerProfile.is_verified === true,
          } : prev);
        }
      } catch {
        // trust data is non-critical
      }

      if (!isFree && user) {
        const { data: profile } = await supabase
          .from('users')
          .select('balance, available_balance')
          .eq('id', user.id)
          .maybeSingle();
        setWalletBalance(Number(profile?.balance) || 0);

        // Save as abandoned payment in case user closes browser
        if (!savedAbandonedRef.current) {
          savedAbandonedRef.current = true;
          await saveAbandonedPayment(user.id, {
            reference: orderId,
            purpose: 'product_purchase',
            amount: Number(order.final_price) || 0,
            product_name: product.name,
            order_id: orderId,
            provider: selectedProvider,
          });
        }
      }

      setLoading(false);
    } catch {
      setError('Failed to load checkout details.');
      setLoading(false);
    }
  }, [orderId, productId, user, selectedProvider]);

  useEffect(() => {
    loadProviders();
    loadCheckoutData();
  }, [loadProviders, loadCheckoutData]);

  // Calculate totals with coupon discount
  const productPrice = checkoutData?.basePrice || 0;
  const tierPrice = checkoutData?.tierPrice || 0;
  const customizationPrice = checkoutData?.customizationPrice || 0;
  const referralDiscount = checkoutData?.affiliateCommissionAmount || 0;
  const escrowFee = 0; // Free escrow
  const platformFee = checkoutData?.adminTaskAmount || 0;
  const couponAmount = couponApplied ? couponDiscount : 0;
  const grandTotal = Math.max(0, (checkoutData?.finalPrice || 0) - couponAmount);

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponError(null);

    try {
      const { data, error } = await supabase
        .from('coupons')
        .select('*')
        .eq('code', couponCode.trim().toUpperCase())
        .eq('is_active', true)
        .maybeSingle();

      if (error || !data) {
        setCouponError('Invalid or expired coupon code');
        return;
      }

      let discount = 0;
      if (data.discount_type === 'percentage') {
        discount = (grandTotal * Number(data.discount_value)) / 100;
      } else {
        discount = Number(data.discount_value);
      }
      setCouponDiscount(discount);
      setCouponApplied(true);
    } catch {
      setCouponError('Failed to apply coupon');
    }
  };

  const handleFreeOrderComplete = async () => {
    if (!checkoutData || !user) return;
    navigate(`/payment/callback?reference=free_${checkoutData.orderId}&status=success`);
  };

  const handlePay = async () => {
    if (!checkoutData || !user) return;
    if (checkoutData.isFreeOrder) {
      handleFreeOrderComplete();
      return;
    }

    const provider = providers.find((p) => p.slug === selectedProvider);
    if (!provider || provider.status !== 'enabled') {
      setError('This payment method is not available yet. Please choose an enabled provider.');
      return;
    }

    setPaying(true);
    setError(null);

    try {
      // Create invoice before payment
      const invoiceResult = await createInvoice(user.id, {
        amount: productPrice + tierPrice + customizationPrice,
        currency: 'NGN',
        invoice_type: 'product',
        order_id: checkoutData.orderId,
        line_items: [
          { description: checkoutData.productName, amount: productPrice, quantity: 1 },
          ...(tierPrice > 0 ? [{ description: 'Service Tier', amount: tierPrice }] : []),
          ...(customizationPrice > 0 ? [{ description: 'Customization', amount: customizationPrice }] : []),
        ],
        billing_details: billingDetails,
        discount_amount: referralDiscount + couponAmount,
      });

      const result = await initializePayment({
        amount: grandTotal,
        purpose: 'product_purchase',
        reference_id: checkoutData.orderId,
        metadata: {
          order_id: checkoutData.orderId,
          product_id: checkoutData.productId,
          product_name: checkoutData.productName,
          seller_id: checkoutData.sellerId,
          buyer_id: user.id,
          provider: selectedProvider,
          custom_redirect: '/payment/callback',
          invoice_id: invoiceResult.invoice?.id || null,
          coupon_code: couponApplied ? couponCode : null,
          coupon_discount: couponAmount,
        },
      });

      if ('error' in result) {
        setError(result.error);
        setPaying(false);
        return;
      }

      // Save gateway preference
      await saveGatewayPreference(user.id, selectedProvider, grandTotal);

      window.location.href = result.authorization_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment initialization failed.');
      setPaying(false);
    }
  };

  if (loading || providersLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  // Duplicate payment detected
  if (duplicateCheck) {
    return (
      <div className="p-8 max-w-md mx-auto text-center">
        <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center mb-4 mx-auto">
          <Info className="w-10 h-10 text-blue-600" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">This Order Has Already Been Paid</h1>
        <p className="text-sm text-gray-500 mb-6">
          We detected that this order has already been successfully paid for. You have not been charged again.
        </p>
        <div className="flex gap-3">
          <Link to="/wallet" className="flex-1 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold">
            Go to Wallet
          </Link>
          <Link to="/market" className="flex-1 py-3 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl font-semibold">
            Browse Market
          </Link>
        </div>
      </div>
    );
  }

  if (error && !checkoutData) {
    return (
      <div className="p-8 max-w-md mx-auto text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <p className="text-gray-900 font-semibold mb-2">{error}</p>
        <Link to="/market" className="mt-4 inline-flex items-center gap-2 text-primary-600 hover:text-primary-700">
          <ArrowLeft className="w-4 h-4" />Back to Market
        </Link>
      </div>
    );
  }

  if (!checkoutData) return null;

  const countryInfo = getCountryInfo(countryCode);

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto pb-32 md:pb-8">
      <div className="flex items-center gap-4 mb-6">
        <Link to={`/product/${checkoutData.productId}`} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Checkout</h1>
          <p className="text-sm text-gray-500">
            Review your order and complete your purchase
            {countryInfo && (
              <span className="ml-2 inline-flex items-center gap-1 text-xs">
                <span className="text-base">{countryInfo.flag}</span>
                {countryInfo.name}
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: All sections */}
        <div className="lg:col-span-2 space-y-5">
          {/* 1. Payment Summary */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-primary-600" />
              Payment Summary
            </h2>
            <div className="flex gap-4">
              <div className="w-20 h-20 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                {checkoutData.productImage ? (
                  <img src={checkoutData.productImage} alt={checkoutData.productName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ShoppingCart className="w-6 h-6 text-gray-300" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate">{checkoutData.productName}</p>
                <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                  <User className="w-3 h-3" /> {checkoutData.sellerName}
                  {checkoutData.sellerVerified && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-blue-600">
                      <BadgeCheck className="w-3 h-3" /> Verified
                    </span>
                  )}
                  {checkoutData.sellerTrustScore !== null && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-600">
                      <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                      {checkoutData.sellerTrustScore.toFixed(1)}
                    </span>
                  )}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                    {checkoutData.productType}
                  </span>
                  <span className="text-[10px] font-medium text-gray-400 flex items-center gap-0.5">
                    <Truck className="w-3 h-3" /> {checkoutData.estimatedDelivery}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 2. Payment Breakdown */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="text-sm font-bold text-gray-900 mb-4">Payment Breakdown</h2>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Product Price</span>
                <span className="text-gray-900 font-medium">{formatCurrencyFn(productPrice)}</span>
              </div>
              {tierPrice > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Service Tier</span>
                  <span className="text-gray-900 font-medium">{formatCurrencyFn(tierPrice)}</span>
                </div>
              )}
              {customizationPrice > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Customization</span>
                  <span className="text-gray-900 font-medium">{formatCurrencyFn(customizationPrice)}</span>
                </div>
              )}
              {checkoutData.refCode && referralDiscount > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span className="flex items-center gap-1"><Tag className="w-3 h-3" /> Referral Reward</span>
                  <span className="font-medium">-{formatCurrencyFn(referralDiscount)}</span>
                </div>
              )}
              {couponApplied && couponDiscount > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span className="flex items-center gap-1"><Ticket className="w-3 h-3" /> Coupon ({couponCode})</span>
                  <span className="font-medium">-{formatCurrencyFn(couponAmount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">Escrow Fee</span>
                <span className="text-gray-900 font-medium">{escrowFee === 0 ? 'Free' : formatCurrencyFn(escrowFee)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Platform Fee</span>
                <span className="text-gray-900 font-medium">{platformFee === 0 ? 'Included' : formatCurrencyFn(platformFee)}</span>
              </div>
              <div className="flex justify-between pt-3 mt-2 border-t border-gray-100">
                <span className="font-bold text-gray-900">Total</span>
                <span className="text-xl font-bold text-primary-600">
                  {checkoutData.isFreeOrder ? 'FREE' : formatCurrencyFn(grandTotal)}
                </span>
              </div>
            </div>
          </div>

          {/* 3. Billing Details (collapsible) */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <button
              onClick={() => setShowBilling(!showBilling)}
              className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition-colors"
            >
              <span className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <User className="w-4 h-4 text-primary-600" />
                Billing Details
                {billingDetails.name && <span className="text-xs text-emerald-600 font-normal ml-2">(filled)</span>}
              </span>
              {showBilling ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>
            {showBilling && (
              <div className="p-5 pt-0 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Full Name"
                    value={billingDetails.name}
                    onChange={(e) => setBillingDetails({ ...billingDetails, name: e.target.value })}
                    className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={billingDetails.email}
                    onChange={(e) => setBillingDetails({ ...billingDetails, email: e.target.value })}
                    className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <input
                  type="tel"
                  placeholder="Phone Number"
                  value={billingDetails.phone}
                  onChange={(e) => setBillingDetails({ ...billingDetails, phone: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <input
                  type="text"
                  placeholder="Address (optional)"
                  value={billingDetails.address}
                  onChange={(e) => setBillingDetails({ ...billingDetails, address: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            )}
          </div>

          {/* 4. Coupon */}
          {!checkoutData.isFreeOrder && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                <Ticket className="w-4 h-4 text-primary-600" />
                Coupon Code
              </h2>
              {couponApplied ? (
                <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span className="text-sm font-medium text-emerald-700">Coupon "{couponCode}" applied</span>
                  </div>
                  <span className="text-sm font-bold text-emerald-600">-{formatCurrencyFn(couponAmount)}</span>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter coupon code"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <button
                    onClick={handleApplyCoupon}
                    disabled={!couponCode.trim()}
                    className="px-5 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
                  >
                    Apply
                  </button>
                </div>
              )}
              {couponError && <p className="text-xs text-red-500 mt-2">{couponError}</p>}
            </div>
          )}

          {/* 5. Payment Method */}
          {!checkoutData.isFreeOrder && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-gray-900">Payment Method</h2>
                {lastGateway && (
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Zap className="w-3 h-3" /> Last used: {lastGateway}
                  </span>
                )}
              </div>
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
            </div>
          )}

          {/* 6. Buyer Protection + Escrow */}
          {!checkoutData.isFreeOrder && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-primary-50/50 rounded-2xl border border-primary-100 p-4">
                <div className="flex items-start gap-2">
                  <Shield className="w-5 h-5 text-primary-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Buyer Protection</p>
                    <p className="text-xs text-gray-500 mt-0.5">Full refund if your order doesn't arrive or isn't as described.</p>
                  </div>
                </div>
              </div>
              <div className="bg-blue-50/50 rounded-2xl border border-blue-100 p-4">
                <div className="flex items-start gap-2">
                  <Lock className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Escrow Protection</p>
                    <p className="text-xs text-gray-500 mt-0.5">Payment held safely and only released to seller after you confirm delivery.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Refund Policy */}
          {!checkoutData.isFreeOrder && (
            <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-start gap-2">
              <RotateCcw className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-gray-700">Refund Policy</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Digital products are non-refundable after download. Physical goods can be returned within 7 days if not as described. Disputes are resolved through our escrow system.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right: Sticky Order Total (desktop) */}
        <div className="hidden lg:block lg:col-span-1">
          <div className="lg:sticky lg:top-4 space-y-4">
            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
              <div className="flex justify-between items-center">
                <span className="font-bold text-gray-900">Order Total</span>
                <span className="text-2xl font-bold text-primary-600">
                  {checkoutData.isFreeOrder ? 'FREE' : formatCurrencyFn(grandTotal)}
                </span>
              </div>

              {!checkoutData.isFreeOrder && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-gray-500" />
                    <span className="text-sm text-gray-600">Wallet Balance</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-900">{formatCurrencyFn(walletBalance)}</span>
                </div>
              )}

              {error && (
                <div className="p-3 rounded-lg bg-red-50 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <button
                onClick={handlePay}
                disabled={paying || (!checkoutData.isFreeOrder && !selectedProvider)}
                className="w-full py-4 bg-primary-600 hover:bg-primary-700 text-white rounded-2xl font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 min-h-[56px] shadow-lg shadow-primary-600/20"
              >
                {paying ? (
                  <><Loader2 className="w-5 h-5 animate-spin" />Redirecting...</>
                ) : checkoutData.isFreeOrder ? (
                  <><CheckCircle2 className="w-5 h-5" />Complete Free Order</>
                ) : (
                  <><Lock className="w-5 h-5" />Pay {formatCurrencyFn(grandTotal)}</>
                )}
              </button>

              <div className="flex items-start gap-2">
                <Info className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-gray-400">
                  By proceeding, you agree to our Terms of Service. Payments are processed securely.
                </p>
              </div>

              <div className="flex items-center justify-center gap-4 pt-2 text-xs text-gray-400">
                <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> Secure</span>
                <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> Encrypted</span>
                <span className="flex items-center gap-1"><Award className="w-3 h-3" /> Trusted</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile: Sticky bottom bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 p-3 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500">Order Total</p>
            <p className="text-lg font-bold text-primary-600">
              {checkoutData.isFreeOrder ? 'FREE' : formatCurrencyFn(grandTotal)}
            </p>
          </div>
          <button
            onClick={handlePay}
            disabled={paying || (!checkoutData.isFreeOrder && !selectedProvider)}
            className="flex-1 py-3.5 bg-primary-600 hover:bg-primary-700 text-white rounded-2xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50 min-h-[52px]"
          >
            {paying ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : checkoutData.isFreeOrder ? (
              <><CheckCircle2 className="w-5 h-5" />Complete</>
            ) : (
              <><Lock className="w-5 h-5" />Pay →</>
            )}
          </button>
        </div>
        {error && (
          <p className="text-xs text-red-500 mt-2 text-center">{error}</p>
        )}
      </div>
    </div>
  );
}
