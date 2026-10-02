import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Eye,
  EyeOff,
  ExternalLink,
  Loader2,
  Mail,
  RefreshCcw,
  ShieldCheck,
  UserPlus,
  WandSparkles,
} from 'lucide-react';
import { createDrightStarterClientAccount } from '../../lib/clientOnboarding';

function generateTemporaryPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?';
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  const tail = Array.from(bytes, (b) => chars[b % chars.length]).join('');
  return `Dr!7${tail}`;
}

export default function AdminDrightClientOnboarding() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    emailSent: boolean;
    accountCreated: boolean;
    credentialsReset: boolean;
    purchaseReference?: string;
    trialDays?: number;
    trialEndsAt?: string | null;
    emailError?: string | null;
  } | null>(null);

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);
  const canSubmit = fullName.trim().length >= 2
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    && temporaryPassword.length >= 8
    && !busy;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const data = await createDrightStarterClientAccount({
        fullName,
        email: normalizedEmail,
        temporaryPassword,
      });
      setResult({
        emailSent: data.email_sent === true,
        accountCreated: data.account_created === true,
        credentialsReset: data.credentials_reset === true,
        purchaseReference: data.purchase_reference,
        trialDays: data.trial_days,
        trialEndsAt: data.trial_ends_at,
        emailError: data.email_error,
      });
      if (data.email_sent === true) {
        setTemporaryPassword('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create the client account.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-indigo-100 dark:border-indigo-900/50 bg-white dark:bg-gray-900 shadow-sm">
      <div className="bg-gradient-to-r from-slate-950 via-indigo-950 to-blue-800 px-5 py-5 sm:px-6 text-white">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
            <UserPlus className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-200">Admin-assisted onboarding</p>
            <h2 className="mt-1 text-xl font-black">Create account for client</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-blue-100/90">
              Pay DRIGHT Starter using the client's exact email, then create the account here. DRIGHT emails the temporary password and forces a new password plus KYC on first login.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-3">
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 p-4">
            <div className="flex items-center gap-2 text-sm font-black text-gray-900 dark:text-white">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs text-white">1</span>
              Pay Starter for the client
            </div>
            <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
              During checkout, use the same full name and email you will enter in Step 2. The server will refuse account creation until that email has a successful, processed, unclaimed Starter payment.
            </p>
            <Link
              to="/dright/starter"
              target="_blank"
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3.5 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
            >
              <CreditCard className="h-4 w-4" /> Open Starter product <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/20 p-4">
            <div className="flex gap-2.5">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <div>
                <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">Security rules</p>
                <p className="mt-1 text-xs leading-5 text-emerald-800 dark:text-emerald-300">
                  The temporary password is sent once and is never stored in Dright's public database or email logs. The client must replace it before normal account access.
                </p>
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={submit} className="rounded-2xl border border-gray-200 dark:border-gray-700 p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-black text-gray-900 dark:text-white">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-xs text-white">2</span>
            Enter client details
          </div>

          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {result && (
            <div className={`mb-4 rounded-xl border p-3 text-sm ${result.emailSent
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
              : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200'}`}>
              <div className="flex items-start gap-2">
                {result.emailSent ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
                <div>
                  <p className="font-bold">
                    {result.emailSent
                      ? result.credentialsReset ? 'Credentials reset and emailed.' : 'Client account created and emailed.'
                      : 'Account exists, but the setup email was not delivered.'}
                  </p>
                  {result.purchaseReference && <p className="mt-1 text-xs">Starter reference: {result.purchaseReference}</p>}
                  {typeof result.trialDays === 'number' && <p className="mt-1 text-xs">Included access: {result.trialDays} day(s)</p>}
                  {result.emailError && (
                    <p className="mt-1 text-xs">
                      Email error: {result.emailError}. Enter a new temporary password and submit again to reset and resend.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-700 dark:text-gray-200">Client full name</label>
              <input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                autoComplete="off"
                placeholder="e.g. Ada Chukwu"
                className="input-base w-full"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-700 dark:text-gray-200">Client email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="off"
                  placeholder="client@example.com"
                  className="input-base w-full pl-9"
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">Must exactly match the email used for the successful Starter payment.</p>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">Temporary password</label>
                <button
                  type="button"
                  onClick={() => setTemporaryPassword(generateTemporaryPassword())}
                  className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-300"
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
                  placeholder="Create a strong temporary password"
                  className="input-base w-full pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-500">Minimum 8 characters. Use at least three of uppercase, lowercase, number, and symbol.</p>
            </div>
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-3 text-sm font-black text-white shadow-sm hover:from-indigo-700 hover:to-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : result?.credentialsReset ? <RefreshCcw className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
            {busy ? 'Creating account…' : 'Create account for client'}
          </button>
        </form>
      </div>
    </section>
  );
}
