import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle, CheckCircle2, Clock3, Download, Loader2, LockKeyhole,
  MapPin, Package, ShieldCheck, ShoppingBag,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

type GuestAccess = {
  entitlement_id: string;
  guest_order_id: string;
  product_id: string;
  product_name: string;
  product_type: string;
  image_url: string | null;
  course_slug: string | null;
  course_access_path: string | null;
  delivery_type: string | null;
  download_file_url: string | null;
  access_link: string | null;
  recipient_email: string;
  recipient_name: string;
  shipping_required: boolean;
  shipping_address: string | null;
  starts_at: string;
  expires_at: string;
  days_remaining: number;
  active: boolean;
  claimed: boolean;
};

export default function GuestAccessPage() {
  const { token = '' } = useParams<{ token: string }>();
  const { user } = useAuth();
  const [access, setAccess] = useState<GuestAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState('');
  const [shipping, setShipping] = useState('');
  const [savingShipping, setSavingShipping] = useState(false);
  const [shippingSaved, setShippingSaved] = useState(false);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    const { data, error: rpcError } = await supabase.rpc('get_guest_access', { p_token: token });
    const row = Array.isArray(data) ? data[0] : data;
    if (rpcError || !row) {
      setError(rpcError?.message || 'This guest-access link could not be found.');
      setAccess(null);
    } else {
      setAccess(row as GuestAccess);
      setShipping(String(row.shipping_address || ''));
    }
    setLoading(false);
  };

  useEffect(() => { void load(); }, [token]);

  useEffect(() => {
    if (!user?.email || !access || access.claimed || !access.active || claiming) return;
    if (user.email.trim().toLowerCase() !== access.recipient_email.trim().toLowerCase()) return;
    void (async () => {
      setClaiming(true);
      try {
        const { error: claimError } = await supabase.rpc('claim_my_guest_purchases');
        if (claimError) throw claimError;
        await load();
      } catch (claimError) {
        console.warn('Guest purchase claim failed', claimError);
      } finally {
        setClaiming(false);
      }
    })();
  }, [user?.email, access?.entitlement_id, access?.active, access?.claimed]);

  const expiryText = useMemo(() => {
    if (!access?.expires_at) return '';
    return new Date(access.expires_at).toLocaleString();
  }, [access?.expires_at]);

  const saveShipping = async () => {
    if (!token || shipping.trim().length < 8) return;
    setSavingShipping(true);
    setError('');
    const { error: saveError } = await supabase.rpc('set_guest_shipping_address', {
      p_token: token,
      p_shipping_address: shipping.trim(),
    });
    if (saveError) setError(saveError.message);
    else {
      setShippingSaved(true);
      await load();
    }
    setSavingShipping(false);
  };

  if (loading) {
    return <div className="min-h-[70vh] flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-primary-600" /></div>;
  }

  if (error && !access) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
        <h1 className="mt-4 text-2xl font-black text-slate-950">Guest access unavailable</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{error}</p>
        <Link to="/market" className="mt-6 inline-flex rounded-xl bg-slate-950 px-5 py-3 font-black text-white">Browse DRIGHT</Link>
      </div>
    );
  }

  if (!access) return null;

  const emailMatches = Boolean(user?.email && user.email.trim().toLowerCase() === access.recipient_email.trim().toLowerCase());
  const courseHref = access.course_slug ? `/guest/learn/${access.course_slug}?guest=${encodeURIComponent(token)}` : null;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-4">
        <section className="rounded-3xl bg-slate-950 text-white p-6 shadow-xl">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-400/15 flex items-center justify-center shrink-0">
              {access.active ? <CheckCircle2 className="w-6 h-6 text-emerald-300" /> : <LockKeyhole className="w-6 h-6 text-slate-300" />}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-black tracking-[0.16em] uppercase text-emerald-300">DRIGHT guest purchase</p>
              <h1 className="mt-2 text-2xl md:text-3xl font-black">{access.product_name}</h1>
              <p className="mt-2 text-sm text-slate-300">Purchased for {access.recipient_name} • {access.recipient_email}</p>
            </div>
          </div>

          {access.active ? (
            <div className="mt-5 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4">
              <div className="flex items-center gap-2"><Clock3 className="w-5 h-5 text-amber-300" /><p className="font-black">Guest mode: {access.days_remaining} day{access.days_remaining === 1 ? '' : 's'} left</p></div>
              <p className="mt-2 text-xs leading-5 text-amber-100">
                Guest mode expires {expiryText}. Before then, create or sign in to a DRIGHT buyer account using <strong>{access.recipient_email}</strong>.
                DRIGHT will move this purchase into Orders and preserve supported course progress.
              </p>
            </div>
          ) : access.claimed ? (
            <div className="mt-5 rounded-2xl bg-emerald-400/10 border border-emerald-300/20 p-4">
              <p className="font-black text-emerald-200">This purchase has been moved into a DRIGHT buyer account.</p>
              <p className="mt-1 text-xs text-slate-300">Open Orders after signing in to continue with the full account-based purchase.</p>
            </div>
          ) : (
            <div className="mt-5 rounded-2xl bg-rose-400/10 border border-rose-300/20 p-4">
              <p className="font-black text-rose-200">Guest mode has expired.</p>
              <p className="mt-1 text-xs text-slate-300">Sign in with the purchase email. If the order has already been claimed, it will be available in Orders.</p>
            </div>
          )}
        </section>

        {access.image_url && (
          <div className="rounded-3xl overflow-hidden border border-slate-200 bg-white">
            <img src={access.image_url} alt={access.product_name} className="w-full max-h-[420px] object-contain bg-slate-50" />
          </div>
        )}

        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

        {access.active && access.shipping_required && (
          <section className="rounded-2xl border border-blue-200 bg-white p-5">
            <div className="flex items-center gap-2"><MapPin className="w-5 h-5 text-blue-600" /><h2 className="font-black">Add delivery address</h2></div>
            <p className="mt-2 text-sm text-slate-600">The payer only needed your name and email. Add the physical delivery address here so the seller can fulfil the order.</p>
            <textarea value={shipping} onChange={(e) => setShipping(e.target.value)} rows={3} className="mt-3 w-full rounded-xl border border-slate-200 p-3 text-sm" placeholder="Full street address, city/state, country, phone note if needed" />
            <button onClick={saveShipping} disabled={savingShipping || shipping.trim().length < 8} className="mt-3 w-full rounded-xl bg-blue-600 py-3 font-black text-white disabled:opacity-50">
              {savingShipping ? 'Saving…' : shippingSaved ? 'Address saved' : 'Save delivery address'}
            </button>
          </section>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-emerald-600" /><h2 className="font-black text-slate-950">Access your purchase</h2></div>
          <div className="mt-4 space-y-2">
            {access.active && courseHref && (
              <Link to={courseHref} className="w-full min-h-[50px] rounded-xl bg-primary-600 text-white font-black flex items-center justify-center gap-2">
                <ShoppingBag className="w-4 h-4" /> Join / continue course
              </Link>
            )}
            {access.active && access.access_link && (
              <a href={access.access_link} target="_blank" rel="noreferrer" className="w-full min-h-[50px] rounded-xl bg-primary-600 text-white font-black flex items-center justify-center gap-2">
                <Package className="w-4 h-4" /> Open product access
              </a>
            )}
            {access.active && access.download_file_url && (
              <a href={access.download_file_url} target="_blank" rel="noreferrer" className="w-full min-h-[50px] rounded-xl border border-primary-200 text-primary-700 font-black flex items-center justify-center gap-2">
                <Download className="w-4 h-4" /> Download purchased file
              </a>
            )}
            {!courseHref && !access.access_link && !access.download_file_url && access.product_type !== 'PHYSICAL' && (
              <Link to={`/product/${access.product_id}`} className="w-full min-h-[50px] rounded-xl border border-slate-200 font-black flex items-center justify-center gap-2">
                <Package className="w-4 h-4" /> Open product page
              </Link>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <h2 className="font-black text-emerald-950">End guest mode and keep the purchase permanently</h2>
          <p className="mt-2 text-sm leading-6 text-emerald-900">
            Use the exact purchase email <strong>{access.recipient_email}</strong>. After login/signup, the order is automatically attached to the buyer account and appears in Orders.
          </p>
          {user ? (
            emailMatches ? (
              <Link to="/my-orders" className="mt-4 w-full min-h-[48px] rounded-xl bg-emerald-700 text-white font-black flex items-center justify-center">
                {claiming ? 'Moving purchase to Orders…' : 'Open my Orders'}
              </Link>
            ) : (
              <p className="mt-4 rounded-xl bg-white p-3 text-xs font-bold text-amber-700">
                You are signed in as {user.email}. Sign out and use {access.recipient_email} to claim this purchase.
              </p>
            )
          ) : (
            <div className="mt-4 grid sm:grid-cols-2 gap-2">
              <Link to={`/sign-in?email=${encodeURIComponent(access.recipient_email)}&redirect=${encodeURIComponent('/guest-access/' + token)}`} className="min-h-[48px] rounded-xl bg-emerald-700 text-white font-black flex items-center justify-center">Sign in as buyer</Link>
              <Link to={`/sign-up?email=${encodeURIComponent(access.recipient_email)}&redirect=${encodeURIComponent('/guest-access/' + token)}`} className="min-h-[48px] rounded-xl border border-emerald-300 bg-white text-emerald-800 font-black flex items-center justify-center">Create buyer account</Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
