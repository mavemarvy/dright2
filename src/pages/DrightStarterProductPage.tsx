import { useEffect, useMemo, useState, type ElementType } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowRight, BadgeCheck, Check, Copy, Gift, Loader2, LockKeyhole,
  Rocket, ShieldCheck, Sparkles, Star, Trophy, UserPlus, Users, WalletCards,
} from 'lucide-react';
import { DrightMark } from '../components/DrightBrand';
import TurnstileWidget from '../components/TurnstileWidget';
import { useAuth } from '../contexts/AuthContext';
import { canUsePlatformFeature } from '../lib/platformAccess';
import {
  buildDrightStarterAffiliateLink,
  fetchDrightStarterProduct,
  getPendingDrightStarterPurchase,
  markDrightStarterSignupFunnel,
  setPendingDrightStarterPurchase,
  startDrightStarterCheckout,
  type DrightStarterPublicSettings,
} from '../lib/drightStarter';
import { formatCurrencyValue } from '../lib/currency';
import { resolveAndRecordTracking } from '../lib/affiliate';
import SeoHead from '../components/SeoHead';
import ListingMarketingMaterialsPanel from '../components/listing/ListingMarketingMaterialsPanel';

export default function DrightStarterProductPage() {
  const { user, profile } = useAuth();
  const [params] = useSearchParams();
  const [settings, setSettings] = useState<DrightStarterPublicSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [buyerName, setBuyerName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [canAffiliate, setCanAffiliate] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    markDrightStarterSignupFunnel();
    void fetchDrightStarterProduct().then((value) => {
      setSettings(value);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const ref = params.get('ref')?.trim();
    if (ref) void resolveAndRecordTracking(ref).catch(() => undefined);
  }, [params]);

  useEffect(() => {
    if (user) void canUsePlatformFeature('affiliate_marketing').then(setCanAffiliate);
  }, [user]);

  const product = settings?.product;
  const store = settings?.store;
  const affiliateValue = useMemo(
    () => product ? product.price * product.affiliate_commission_percent / 100 : 0,
    [product],
  );
  const pendingStarterPurchase = useMemo(() => getPendingDrightStarterPurchase(), []);

  const copyAffiliateLink = async () => {
    if (!profile?.referral_code) return;
    const link = buildDrightStarterAffiliateLink(profile.referral_code);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.location.assign(link);
    }
  };

  const startCheckout = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!product || user || submitting) return;
    if (!turnstileToken) {
      setError('Complete the security check before continuing.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await startDrightStarterCheckout({
        buyerName,
        buyerEmail,
        turnstileToken,
      });
      if (!result.reference || !result.authorization_url) {
        throw new Error('Payment gateway did not return a checkout URL.');
      }
      setPendingDrightStarterPurchase(result.reference, buyerEmail);
      window.location.assign(result.authorization_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start checkout.');
      setTurnstileToken(null);
      setTurnstileKey((value) => value + 1);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-[70vh] flex items-center justify-center bg-slate-950">
        <Loader2 className="w-8 h-8 text-white animate-spin" />
      </main>
    );
  }

  if (!settings?.available || !product || !store) {
    return (
      <main className="min-h-[70vh] bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <DrightMark size={70} className="mx-auto" />
          <h1 className="text-2xl font-black text-gray-900 dark:text-white mt-5">DRIGHT Starter is unavailable</h1>
          <p className="text-sm text-gray-500 mt-2">The official Starter product is currently hidden or disabled by DRIGHT.</p>
          <Link to="/market" className="inline-flex mt-5 px-5 py-3 rounded-xl bg-primary-600 text-white font-bold">Browse Marketplace</Link>
        </div>
      </main>
    );
  }

  return (
    <>
      <SeoHead
        title={product.title}
        description={product.description.slice(0, 160)}
        canonical="/dright/starter"
        ogType="product"
        keywords={['DRIGHT', 'Sign Up', 'affiliate', 'starter access', 'platform access']}
        breadcrumbs={[
          { name: 'DRIGHT Store', url: '/dright' },
          { name: product.title, url: '/dright/starter' },
        ]}
        product={{
          name: product.title,
          description: product.description,
          price: product.price,
          currency: product.currency,
          availability: 'in_stock',
          brandName: 'DRIGHT',
        }}
      />

      <main className="min-h-screen bg-slate-950 text-white">
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_top_right,_#2563eb_0,_transparent_35%),radial-gradient(circle_at_bottom_left,_#10b981_0,_transparent_30%)]" />
          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-14">
            <div className="grid lg:grid-cols-[1.15fr_.85fr] gap-8 lg:gap-12 items-start">
              <div>
                <div className="flex flex-wrap gap-2 mb-5">
                  <span className="rounded-full bg-white/10 border border-white/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wide">
                    {product.category}
                  </span>
                  {product.official_badge_enabled && (
                    <span className="rounded-full bg-emerald-500/15 text-emerald-200 border border-emerald-400/20 px-3 py-1.5 text-xs font-bold flex items-center gap-1.5">
                      <BadgeCheck className="w-3.5 h-3.5" /> Official DRIGHT Product
                    </span>
                  )}
                </div>

                {product.image_url && product.image_url !== '/dright-logo.webp' && (
                  <div className="mb-6 overflow-hidden rounded-3xl border border-white/10 bg-white/5 max-w-2xl">
                    <img
                      src={product.image_url}
                      alt={product.title}
                      className="w-full max-h-[420px] object-cover"
                    />
                  </div>
                )}

                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.04]">
                  {product.title}
                </h1>
                <p className="text-lg sm:text-xl text-slate-300 mt-4 max-w-2xl">{product.subtitle}</p>
                <p className="text-sm sm:text-base text-slate-400 mt-5 max-w-2xl leading-7">{product.description}</p>

                <div className="mt-7 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Metric icon={WalletCards} label="Price" value={formatCurrencyValue(product.price, product.currency)} />
                  <Metric icon={Users} label="Affiliate" value={String(product.affiliate_commission_percent) + '%'} />
                  <Metric icon={Gift} label="Included access" value={String(product.included_trial_days) + ' days'} />
                  <Metric icon={Star} label="DRIGHT rating" value={product.official_rating_enabled ? product.official_rating.toFixed(1) : 'Official'} />
                </div>

                <div className="mt-7 rounded-2xl border border-white/10 bg-white/5 p-5">
                  <h2 className="font-black flex items-center gap-2"><Sparkles className="w-5 h-5 text-amber-300" /> What you get</h2>
                  <div className="grid sm:grid-cols-2 gap-3 mt-4">
                    {product.benefits.map((benefit) => (
                      <div key={benefit} className="flex gap-2.5 text-sm text-slate-300">
                        <span className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                          <Check className="w-3.5 h-3.5 text-emerald-300" />
                        </span>
                        <span>{benefit}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {product.marketplace_product_id && (
                  <div className="mt-5 text-slate-900">
                    <ListingMarketingMaterialsPanel
                      kind="product"
                      listingId={product.marketplace_product_id}
                      title="Starter affiliate marketing kit"
                    />
                  </div>
                )}

                <div className="mt-5 rounded-2xl border border-blue-400/20 bg-blue-500/10 p-5">
                  <h3 className="font-bold text-blue-100">Affiliate test product</h3>
                  <p className="text-sm text-blue-200/80 mt-1">
                    Share this official product with a new user. A verified purchase pays {product.affiliate_commission_percent}% commission — currently {formatCurrencyValue(affiliateValue, product.currency)} at this price.
                  </p>
                  {user && canAffiliate && profile?.referral_code ? (
                    <button
                      type="button"
                      onClick={copyAffiliateLink}
                      className="mt-4 min-h-[46px] px-4 rounded-xl bg-white text-slate-950 font-black inline-flex items-center gap-2"
                    >
                      {copied ? <BadgeCheck className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                      {copied ? 'Affiliate link copied' : 'Copy affiliate link'}
                    </button>
                  ) : user ? (
                    <Link to="/subscriptions" className="mt-4 inline-flex min-h-[46px] items-center px-4 rounded-xl bg-white text-slate-950 font-black">
                      Open affiliate access
                    </Link>
                  ) : null}
                  <Link
                    to="/challenges?section=affiliate&challenge=starter_affiliate"
                    className="mt-3 min-h-[44px] px-4 rounded-xl border border-blue-300/30 bg-blue-400/10 text-blue-100 font-black inline-flex items-center gap-2"
                  >
                    <Trophy className="w-4 h-4" /> View Starter Affiliate Leaderboard
                  </Link>
                </div>
              </div>

              <aside className="lg:sticky lg:top-6 rounded-3xl bg-white text-slate-900 shadow-2xl overflow-hidden">
                <div className="p-5 sm:p-6 bg-gradient-to-br from-slate-50 to-white border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <DrightMark size={54} />
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500 font-bold">{store.name}</p>
                      <p className="font-black">New-user Starter checkout</p>
                    </div>
                  </div>
                </div>

                <div className="p-5 sm:p-6">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-xs text-slate-500">One-time Starter purchase</p>
                      <p className="text-3xl font-black">{formatCurrencyValue(product.price, product.currency)}</p>
                    </div>
                    {product.official_rating_enabled && (
                      <div className="text-right">
                        <div className="flex justify-end gap-0.5 text-amber-400">
                          {Array.from({ length: 5 }).map((_, i) => <Star key={i} className="w-3.5 h-3.5 fill-current" />)}
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1">DRIGHT Official Rating · not customer reviews</p>
                      </div>
                    )}
                  </div>

                  {user ? (
                    <div className="mt-6 rounded-2xl bg-slate-100 p-5 text-center">
                      <LockKeyhole className="w-8 h-8 mx-auto text-slate-500" />
                      <p className="font-black mt-3">New guests only</p>
                      <p className="text-sm text-slate-500 mt-1">
                        You are already signed in, so this Starter product cannot be purchased by this account.
                      </p>
                      <Link to="/" className="mt-4 inline-flex min-h-[44px] items-center px-4 rounded-xl bg-slate-950 text-white font-bold">
                        Go to Dashboard
                      </Link>
                    </div>
                  ) : (
                    <form onSubmit={startCheckout} className="mt-6 space-y-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Full name</label>
                        <input
                          required
                          value={buyerName}
                          onChange={(e) => setBuyerName(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none"
                          placeholder="Your full name"
                          autoComplete="name"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Email address</label>
                        <input
                          required
                          type="email"
                          value={buyerEmail}
                          onChange={(e) => setBuyerEmail(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none"
                          placeholder="you@example.com"
                          autoComplete="email"
                        />
                        <p className="text-xs text-slate-400 mt-1.5">Use this same email when creating your DRIGHT account after payment.</p>
                      </div>

                      <TurnstileWidget
                        key={turnstileKey}
                        action="dright_starter_checkout"
                        onVerified={(token) => {
                          setTurnstileToken(token);
                          setError(null);
                        }}
                        onError={setError}
                      />
                      {error && <div className="rounded-xl bg-red-50 text-red-700 text-sm p-3">{error}</div>}

                      <button
                        type="submit"
                        disabled={submitting}
                        className="w-full min-h-[52px] rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-black flex items-center justify-center gap-2 disabled:opacity-60"
                      >
                        {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Rocket className="w-5 h-5" />}
                        {submitting ? 'Opening secure payment…' : 'Buy for ' + formatCurrencyValue(product.price, product.currency)}
                      </button>

                      <div className="flex items-start gap-2 text-xs text-slate-500">
                        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span>Payment is verified server-side. Included access begins only after verified payment and account claim.</span>
                      </div>
                    </form>
                  )}

                  <div className="mt-6 pt-5 border-t border-slate-100 text-center">
                    <p className="text-xs text-slate-500">
                      Starter signup unlocks only after DRIGHT verifies the payment.
                    </p>
                    <div className="mt-2 flex flex-wrap justify-center gap-3 text-sm font-bold">
                      {pendingStarterPurchase?.reference ? (
                        <Link
                          to={`/dright/starter/payment?reference=${encodeURIComponent(pendingStarterPurchase.reference)}`}
                          className="text-primary-600 inline-flex items-center gap-1"
                        >
                          <UserPlus className="w-4 h-4" /> Verify payment & unlock signup
                        </Link>
                      ) : (
                        <span className="text-slate-500 inline-flex items-center gap-1">
                          <LockKeyhole className="w-4 h-4" /> Pay first to unlock signup
                        </span>
                      )}
                      <Link to="/sign-in" className="text-slate-700 inline-flex items-center gap-1">
                        Existing user sign in <ArrowRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}

function Metric({ icon: Icon, label, value }: { icon: ElementType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <Icon className="w-4 h-4 text-slate-300" />
      <p className="text-[11px] text-slate-400 mt-2">{label}</p>
      <p className="text-sm font-black mt-0.5">{value}</p>
    </div>
  );
}
