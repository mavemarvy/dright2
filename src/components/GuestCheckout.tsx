import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShoppingBag, Mail, User, MapPin, CheckCircle2, Lock, Tag, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useCurrency } from '../contexts/CurrencyContext';
import TurnstileWidget from './TurnstileWidget';
import { getAttribution, getAffiliateCookie, getSessionId, getVisitorId } from '../lib/affiliate';

interface GuestCheckoutProps {
  productId: string;
  productName: string;
  productPrice: number;
  sellerId: string;
  productType?: string;
  selectedTierId?: string;
  customizationOptionIds?: string[];
  buyerRequirements?: string;
  trigger: React.ReactNode;
  assistedMode?: boolean;
  guestAccessDays?: number;
  sourceCurrency?: string;
}

export default function GuestCheckout({
  productId,
  productName,
  productPrice,
  productType = 'DIGITAL',
  selectedTierId,
  customizationOptionIds = [],
  buyerRequirements,
  trigger,
  assistedMode = false,
  guestAccessDays = 10,
  sourceCurrency = 'USD',
}: GuestCheckoutProps) {
  const { user } = useAuth();
  const { format } = useCurrency();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'form' | 'success'>('form');
  const [formData, setFormData] = useState({ email: '', name: '', address: '' });
  const [submitting, setSubmitting] = useState(false);
  const [orderEmail, setOrderEmail] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [discount, setDiscount] = useState(0);
  const [couponMsg, setCouponMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [validating, setValidating] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);

  const finalPrice = Math.max(0, productPrice - discount);
  const requiresShipping = String(productType || '').toUpperCase() === 'PHYSICAL' && !assistedMode;

  const handleValidateCoupon = async () => {
    if (!couponCode || !user) return;
    setValidating(true);
    setCouponMsg(null);
    try {
      const { data, error } = await supabase.rpc('validate_coupon', {
        p_code: couponCode.toUpperCase(),
        p_user_id: user.id,
        p_amount: productPrice,
        p_listing_id: productId,
      });
      if (error) throw error;
      const row = (data || [])[0];
      if (row?.valid) {
        setDiscount(Number(row.discount_amount) || 0);
        setCouponMsg({ type: 'success', text: row.message || 'Coupon applied!' });
      } else {
        setDiscount(0);
        setCouponMsg({ type: 'error', text: row?.message || 'Invalid coupon' });
      }
    } catch {
      setDiscount(0);
      setCouponMsg({ type: 'error', text: 'Validation failed' });
    }
    setValidating(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTurnstileError(null);

    if (!turnstileToken) {
      setTurnstileError('Please complete the CAPTCHA challenge');
      return;
    }
    if (requiresShipping && !formData.address.trim()) {
      setTurnstileError('Shipping address is required for physical products');
      return;
    }

    setSubmitting(true);
    try {
      // The guest checkout Edge Function is the single authoritative path:
      // it verifies the one-time Turnstile token, creates the canonical guest
      // order, calculates the trusted amount, and initializes Paystack.
      const { data, error } = await supabase.functions.invoke('guest-checkout', {
        body: {
          product_id: productId,
          buyer_email: formData.email.trim(),
          buyer_name: formData.name.trim(),
          shipping_address: requiresShipping ? formData.address.trim() : null,
          quantity: 1,
          selected_tier_id: selectedTierId || null,
          customization_option_ids: customizationOptionIds,
          buyer_requirements: buyerRequirements?.trim() || null,
          turnstile_token: turnstileToken,
          tracking_code: getAttribution()?.trackingCode || getAffiliateCookie() || null,
          referral_link_id: getAttribution()?.linkId || null,
          visitor_id: getVisitorId() || null,
          session_id: getSessionId() || null,
          assisted_mode: assistedMode,
        },
      });

      const result = (data || {}) as {
        success?: boolean;
        free?: boolean;
        error?: string;
        authorization_url?: string;
        guest_order_id?: string;
      };

      if (error || result.error || !result.success) {
        let message = result.error || 'Unable to start guest checkout';

        const context = (error as { context?: Response } | null)?.context;
        if (context && typeof context.clone === 'function') {
          const payload = await context.clone().json().catch(() => null) as { error?: string; message?: string } | null;
          message = payload?.error || payload?.message || message;
        } else if (error?.message && !/non-2xx status code/i.test(error.message)) {
          message = error.message;
        }

        throw new Error(message);
      }

      if (result.free) {
        setOrderEmail(formData.email.trim());
        setStep('success');
        return;
      }

      if (!result.authorization_url) {
        throw new Error('Payment gateway did not return a checkout URL');
      }

      window.location.assign(result.authorization_url);
    } catch (err) {
      setTurnstileError(err instanceof Error ? err.message : 'Guest checkout failed');
      // Turnstile tokens are single-use. Render a fresh challenge after any
      // server attempt so a retry never replays the previous token.
      setTurnstileToken(null);
      setTurnstileKey((value) => value + 1);
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setOpen(false);
    setStep('form');
    setFormData({ email: '', name: '', address: '' });
    setOrderEmail(null);
  };

  return (
    <>
      <div onClick={() => setOpen(true)}>{trigger}</div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={reset}
            className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          >
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-primary-600" />
                  {step === 'form' ? (assistedMode ? 'Sell Directly to Buyer' : 'Guest Checkout') : (assistedMode ? 'Buyer Access Created' : 'Order Created')}
                </h3>
                <button onClick={reset} className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {step === 'form' ? (
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                  <div className="bg-primary-50 rounded-xl p-3 flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center shrink-0">
                      <ShoppingBag className="w-5 h-5 text-primary-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 text-sm truncate">{productName}</p>
                      <div className="flex items-center gap-2">
                        {discount > 0 ? (
                          <>
                            <span className="text-sm text-gray-400 line-through">{format(productPrice, sourceCurrency)}</span>
                            <span className="text-lg font-bold text-primary-600">{format(finalPrice, sourceCurrency)}</span>
                          </>
                        ) : (
                          <span className="text-lg font-bold text-primary-600">{format(productPrice, sourceCurrency)}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {user && !assistedMode && (
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1.5 block">Coupon Code</label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <input
                            type="text"
                            value={couponCode}
                            onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                            placeholder="WELCOME10"
                            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-200"
                          />
                        </div>
                        <button type="button" onClick={handleValidateCoupon} disabled={validating || !couponCode} className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 disabled:opacity-50 transition-colors whitespace-nowrap">
                          {validating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Apply'}
                        </button>
                      </div>
                      {couponMsg && (
                        <p className={`mt-1.5 text-xs ${couponMsg.type === 'success' ? 'text-green-500' : 'text-red-500'}`}>{couponMsg.text}</p>
                      )}
                      {discount > 0 && (
                        <div className="mt-2 bg-green-50 rounded-lg p-2 text-xs text-green-600">
                          <div className="flex justify-between"><span>Original:</span><span>{format(productPrice, sourceCurrency)}</span></div>
                          <div className="flex justify-between"><span>Discount:</span><span>-{format(discount, sourceCurrency)}</span></div>
                          <div className="flex justify-between font-bold"><span>Final:</span><span>{format(finalPrice, sourceCurrency)}</span></div>
                        </div>
                      )}
                    </div>
                  )}

                  {assistedMode && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                      <p className="text-sm font-bold text-emerald-900">Pay for a buyer using only their name and email</p>
                      <p className="mt-1 text-xs leading-5 text-emerald-800">
                        DRIGHT emails the buyer a private access link after verified payment. Guest mode lasts {guestAccessDays} days.
                        No password is created. If they later sign in or create a buyer account with the same email, the purchase moves into Orders and their saved course progress continues.
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1.5 block">{assistedMode ? 'Buyer Full Name' : 'Full Name'}</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder={assistedMode ? 'Buyer full name' : 'John Doe'}
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-200"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1.5 block">{assistedMode ? 'Buyer Gmail / Email' : 'Email'}</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder={assistedMode ? 'buyer@gmail.com' : 'you@example.com'}
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-200"
                      />
                    </div>
                  </div>

                  {requiresShipping ? (
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                        Shipping Address <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                        <textarea
                          required
                          value={formData.address}
                          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                          placeholder="123 Main St, City, Country"
                          rows={2}
                          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-200 resize-none"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl bg-blue-50 border border-blue-100 p-3">
                      <p className="text-xs text-blue-700 font-medium">
                        {assistedMode
                          ? 'No password is required. The buyer receives delivery/access instructions by email after payment.'
                          : `No shipping address is required for this ${String(productType || 'digital').toLowerCase()} purchase.`}
                      </p>
                    </div>
                  )}

                  <div className="bg-gray-50 rounded-xl p-3 flex items-center gap-2">
                    <Lock className="w-4 h-4 text-gray-400 shrink-0" />
                    <p className="text-xs text-gray-500">
                      {assistedMode
                        ? `The buyer gets ${guestAccessDays} days of guest access after verified payment. They should create or sign in to a DRIGHT buyer account with the same email before guest mode expires.`
                        : "No account needed. We'll create your order first; payment completion is confirmed separately by the secure payment flow."}
                    </p>
                  </div>

                  <TurnstileWidget
                    key={turnstileKey}
                    action="guest_checkout"
                    onVerified={(token) => {
                      setTurnstileToken(token);
                      setTurnstileError(null);
                    }}
                    onError={setTurnstileError}
                  />
                  {turnstileError && (
                    <p className="text-xs text-red-500">{turnstileError}</p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl py-3.5 disabled:opacity-50 transition-colors"
                  >
                    {submitting ? 'Creating order...' : assistedMode ? `Pay for Buyer — ${format(finalPrice, sourceCurrency)}` : `Continue — ${format(finalPrice, sourceCurrency)}`}
                  </button>
                </form>
              ) : (
                <div className="p-6 text-center">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', damping: 15 }}
                    className="w-16 h-16 bg-success-muted rounded-full flex items-center justify-center mx-auto mb-4"
                  >
                    <CheckCircle2 className="w-8 h-8 text-success" />
                  </motion.div>
                  <h4 className="text-lg font-bold text-gray-900 mb-2">{assistedMode ? 'Buyer access is ready' : 'Order Created'}</h4>
                  <p className="text-sm text-gray-500 mb-1">
                    {assistedMode ? 'The buyer order for ' : 'Your order for '}<span className="font-medium text-gray-700">{productName}</span> has been created.
                  </p>
                  <p className="text-xs text-gray-400 mb-6">
                    Order contact: {orderEmail}. {assistedMode ? `After verified payment, DRIGHT emails the buyer their private ${guestAccessDays}-day guest-access link.` : 'A sale is recorded only after verified payment completion.'}
                  </p>

                  <div className="bg-primary-50 rounded-xl p-4 mb-6 text-left">
                    <p className="text-sm font-medium text-primary-900 mb-1">
                      {assistedMode
                        ? 'No password was created for the buyer. They can use guest mode immediately, then sign in or create a buyer account with the same email to keep the purchase in Orders.'
                        : 'Create an account to track your order, contact the seller, leave reviews, and more.'}
                    </p>
                  </div>

                  <div className="flex flex-col gap-3">
                    {!assistedMode && <Link
                      to="/sign-up"
                      onClick={reset}
                      className="bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl py-3 transition-colors"
                    >
                      Sign Up
                    </Link>}
                    <button
                      onClick={reset}
                      className="text-gray-500 text-sm font-medium hover:text-gray-700 transition-colors"
                    >
                      Continue browsing
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
