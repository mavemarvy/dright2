import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  ShieldCheck,
  UserPlus,
  WandSparkles,
} from 'lucide-react';
import TurnstileWidget from './TurnstileWidget';
import { startDrightStarterCheckout, type DrightStarterProduct } from '../lib/drightStarter';
import { createAssistedStarterAccount, getAssistedStarterPurchase, type AssistedStarterPurchase } from '../lib/clientOnboarding';
import { formatCurrencyValue } from '../lib/currency';

function generateTemporaryPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?';
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  const tail = Array.from(bytes, (b) => chars[b % chars.length]).join('');
  return `Dr!7${tail}`;
}

export default function RegisteredStarterAssistedSignup({ product }: { product: DrightStarterProduct }) {
  const [params] = useSearchParams();
  const finishReference = params.get('assisted_signup') === 'finish'
    ? (params.get('reference') || '').trim()
    : '';

  const [expanded, setExpanded] = useState(Boolean(finishReference));
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [purchase, setPurchase] = useState<AssistedStarterPurchase | null>(null);
  const [loadingPurchase, setLoadingPurchase] = useState(Boolean(finishReference));
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [successEmail, setSuccessEmail] = useState<string | null>(null);
  const [emailWarning, setEmailWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!finishReference) return;
    setExpanded(true);
    setLoadingPurchase(true);
    setError(null);
    void getAssistedStarterPurchase(finishReference)
      .then((value) => {
        setPurchase(value);
        setFullName(value.full_name);
        setEmail(value.email);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load the verified Starter payment.'))
      .finally(() => setLoadingPurchase(false));
  }, [finishReference]);

  const startPayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!fullName.trim() || !email.trim()) {
      setError('Enter the new user’s full name and email address.');
      return;
    }
    if (!turnstileToken) {
      setError('Complete the security check before payment.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await startDrightStarterCheckout({
        buyerName: fullName,
        buyerEmail: email,
        turnstileToken,
        checkoutMode: 'assisted_signup',
      });
      if (!result.authorization_url) throw new Error('Payment gateway did not return a checkout URL.');
      window.location.assign(result.authorization_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to open Starter payment.');
      setTurnstileToken(null);
      setTurnstileKey((value) => value + 1);
    } finally {
      setBusy(false);
    }
  };

  const createAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!purchase || busy) return;
    if (temporaryPassword.length < 8) {
      setError('Create a temporary password with at least 8 characters.');
      return;
    }

    setBusy(true);
    setError(null);
    setEmailWarning(null);
    try {
      const result = await createAssistedStarterAccount(purchase.reference, temporaryPassword);
      setSuccessEmail(result.email || purchase.email);
      if (result.email_sent === false) {
        setEmailWarning(result.email_error || 'The account was created, but the login email could not be delivered. You can submit again with a new temporary password to retry while the user has not changed it.');
      }
      setTemporaryPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create the new DRIGHT account.');
    } finally {
      setBusy(false);
    }
  };

  if (!product.assisted_signup_enabled) {
    return (
      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
          <div>
            <p className="font-black text-slate-900">Register another user</p>
            <p className="mt-1 text-sm leading-5 text-slate-500">Assisted Starter signup is currently turned off by DRIGHT.</p>
          </div>
        </div>
      </div>
    );
  }

  if (successEmail) {
    return (
      <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-left">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
          <div className="min-w-0">
            <p className="font-black text-emerald-950">New DRIGHT account created</p>
            <p className="mt-1 break-words text-sm leading-6 text-emerald-800">
              The account information and temporary password were sent to <strong>{successEmail}</strong>. Prompt the user to open their email and sign in to DRIGHT.
            </p>
            <p className="mt-2 text-xs leading-5 text-emerald-700">
              On first login, DRIGHT will require a new private password and email verification. KYC, profile details and questionnaires continue from Settings.
            </p>
            {emailWarning && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">{emailWarning}</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4 text-left">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-3 text-left"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white">
          <UserPlus className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-black text-slate-900">Register another user</p>
          <p className="mt-0.5 text-xs leading-5 text-slate-600">
            Pay Starter for a new user and help create their DRIGHT account.
          </p>
        </div>
        {expanded ? <ChevronUp className="h-5 w-5 text-indigo-600" /> : <ChevronDown className="h-5 w-5 text-indigo-600" />}
      </button>

      {expanded && (
        <div className="mt-4 border-t border-indigo-200 pt-4">
          {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

          {loadingPurchase ? (
            <div className="flex min-h-28 items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading verified payment…
            </div>
          ) : purchase ? (
            <form onSubmit={createAccount} className="space-y-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs font-black uppercase tracking-wide text-emerald-700">Payment verified</p>
                <p className="mt-1 font-bold text-slate-900">{purchase.full_name}</p>
                <p className="break-all text-sm text-slate-600">{purchase.email}</p>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <label className="text-sm font-semibold text-slate-700">Temporary password</label>
                  <button
                    type="button"
                    onClick={() => setTemporaryPassword(generateTemporaryPassword())}
                    className="inline-flex items-center gap-1 text-xs font-black text-indigo-600"
                  >
                    <WandSparkles className="h-3.5 w-3.5" /> Generate
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={temporaryPassword}
                    onChange={(event) => setTemporaryPassword(event.target.value)}
                    autoComplete="new-password"
                    placeholder="Create or generate a default password"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pr-11 outline-none focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="mt-1 text-xs text-slate-500">The temporary password is emailed to the new user and is not stored in Dright’s application database.</p>
              </div>

              <button
                type="submit"
                disabled={busy || temporaryPassword.length < 8}
                className="flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-black text-white disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                {busy ? 'Creating & sending…' : 'Create account & send login details'}
              </button>
            </form>
          ) : (
            <form onSubmit={startPayment} className="space-y-4">
              <div className="rounded-xl bg-white/70 p-3 text-xs leading-5 text-slate-600">
                <strong>Step 1:</strong> enter the new user’s details and pay {formatCurrencyValue(product.price, product.currency)}. After Dright verifies payment, you return here to create or generate their temporary password.
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">New user’s full name</label>
                <input
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  autoComplete="off"
                  placeholder="Full name"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">New user’s email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="off"
                  placeholder="user@example.com"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-indigo-500"
                />
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
              <button
                type="submit"
                disabled={busy}
                className="flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-black text-white disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                {busy ? 'Opening payment…' : 'Pay Starter for this user'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
