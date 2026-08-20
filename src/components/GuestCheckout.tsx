import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShoppingBag, Mail, User, MapPin, CheckCircle2, Lock, Tag, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { trackListingEvent } from '../lib/marketplaceAnalytics';
import { trackPurchase } from '../lib/analyticsService';
import TurnstileWidget from './TurnstileWidget';
import { verifyTurnstileToken } from '../lib/security/turnstile';
import type { GuestOrder } from '../lib/types';

interface GuestCheckoutProps {
  productId: string;
  productName: string;
  productPrice: number;
  sellerId: string;
  trigger: React.ReactNode;
}

export default function GuestCheckout({ productId, productName, productPrice, trigger }: GuestCheckoutProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'form' | 'success'>('form');
  const [formData, setFormData] = useState({ email: '', name: '', address: '' });
  const [submitting, setSubmitting] = useState(false);
  const [order, setOrder] = useState<GuestOrder | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [discount, setDiscount] = useState(0);
  const [couponMsg, setCouponMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [validating, setValidating] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState<string | null>(null);

  const finalPrice = Math.max(0, productPrice - discount);

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
    if (!turnstileToken) {
      setTurnstileError('Please complete the CAPTCHA challenge');
      return;
    }
    setSubmitting(true);

    const turnstileResult = await verifyTurnstileToken(turnstileToken, 'guest_checkout');
    if (!turnstileResult.success) {
      setTurnstileError(turnstileResult.error || 'CAPTCHA verification failed');
      setSubmitting(false);
      return;
    }

    const { data } = await supabase
      .from('guest_orders')
      .insert({
        product_id: productId,
        buyer_email: formData.email,
        buyer_name: formData.name,
        shipping_address: formData.address,
        total_amount: finalPrice,
        user_id: user?.id || null,
      })
      .select()
      .single();
    if (data) {
      // Record the sale for analytics
      try {
        await supabase.from('sales_records').insert({
          product_id: productId,
          product_name: productName,
          sale_amount: finalPrice,
          commission_amount: 0,
          status: 'completed',
          sale_date: new Date().toISOString().slice(0, 10),
          referrer_id: user?.id || null,
          referrer_role: 'buyer',
        });

        // Increment product total_sales and view tracking
        trackPurchase(productId, '', Number(finalPrice));

        // Track purchase event for analytics
        await trackListingEvent({
          listing_id: productId,
          listing_type: 'product',
          user_id: user?.id || null,
          event_type: 'purchase',
          metadata: { amount: finalPrice, order_id: data.id, original_price: productPrice, discount },
        });
      } catch (err) {
        console.error('Error recording sale:', err);
      }

      // Redeem coupon if one was applied
      if (discount > 0 && couponCode && user) {
        try {
          await supabase.rpc('redeem_coupon', {
            p_code: couponCode,
            p_user_id: user.id,
            p_amount: productPrice,
            p_listing_id: productId,
          });
        } catch (err) {
          console.error('Coupon redemption error:', err);
        }
      }

      setOrder(data);
      setStep('success');
    }
    setSubmitting(false);
  };

  const reset = () => {
    setOpen(false);
    setStep('form');
    setFormData({ email: '', name: '', address: '' });
    setOrder(null);
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
                  {step === 'form' ? 'Guest Checkout' : 'Order Confirmed'}
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
                            <span className="text-sm text-gray-400 line-through">${productPrice.toFixed(2)}</span>
                            <span className="text-lg font-bold text-primary-600">${finalPrice.toFixed(2)}</span>
                          </>
                        ) : (
                          <span className="text-lg font-bold text-primary-600">${productPrice.toFixed(2)}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {user && (
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
                          <div className="flex justify-between"><span>Original:</span><span>${productPrice.toFixed(2)}</span></div>
                          <div className="flex justify-between"><span>Discount:</span><span>-${discount.toFixed(2)}</span></div>
                          <div className="flex justify-between font-bold"><span>Final:</span><span>${finalPrice.toFixed(2)}</span></div>
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1.5 block">Full Name</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="John Doe"
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-200"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1.5 block">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="you@example.com"
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-200"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1.5 block">Shipping Address</label>
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

                  <div className="bg-gray-50 rounded-xl p-3 flex items-center gap-2">
                    <Lock className="w-4 h-4 text-gray-400 shrink-0" />
                    <p className="text-xs text-gray-500">
                      No account needed. We'll email you a confirmation and track your order.
                    </p>
                  </div>

                  <TurnstileWidget
                    action="guest_checkout"
                    onVerified={setTurnstileToken}
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
                    {submitting ? 'Processing...' : `Buy Now — ${finalPrice.toFixed(2)}`}
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
                  <h4 className="text-lg font-bold text-gray-900 mb-2">Purchase Successful!</h4>
                  <p className="text-sm text-gray-500 mb-1">
                    Order for <span className="font-medium text-gray-700">{productName}</span> is confirmed.
                  </p>
                  <p className="text-xs text-gray-400 mb-6">
                    A confirmation was sent to {order?.buyer_email}
                  </p>

                  <div className="bg-primary-50 rounded-xl p-4 mb-6 text-left">
                    <p className="text-sm font-medium text-primary-900 mb-1">
                      Create an account to track your order, contact the seller, leave reviews, and more.
                    </p>
                  </div>

                  <div className="flex flex-col gap-3">
                    <Link
                      to="/sign-up"
                      onClick={reset}
                      className="bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl py-3 transition-colors"
                    >
                      Sign Up
                    </Link>
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
