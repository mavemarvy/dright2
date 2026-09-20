import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, CheckCircle, XCircle, RefreshCw, ArrowLeft, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import TurnstileWidget from '../components/TurnstileWidget';
import { claimPendingDrightStarterPurchase } from '../lib/drightStarter';

export default function VerifyEmailPage() {
  const { user, isEmailVerified, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') || user?.email || '');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!email && user?.email) setEmail(user.email);
  }, [email, user?.email]);

  useEffect(() => {
    if (!loading && isEmailVerified) {
      void claimPendingDrightStarterPurchase().finally(() => navigate('/dashboard', { replace: true }));
    }
  }, [isEmailVerified, loading, navigate]);

  const normalizedEmail = email.trim().toLowerCase();

  const requestCode = async () => {
    setError(null);
    setMessage(null);
    if (!normalizedEmail) return setError('Enter the email address you used for signup.');
    if (!turnstileToken) return setError('Complete the Cloudflare security check.');

    setSending(true);
    const { data, error: invokeError } = await supabase.functions.invoke('auth-email-code', {
      body: {
        email: normalizedEmail,
        purpose: 'account_verification',
        turnstileToken,
      },
    });
    setSending(false);

    if (invokeError || data?.success === false) {
      setError(data?.error || invokeError?.message || 'Could not send verification code.');
      setTurnstileToken(null);
      setTurnstileKey((key) => key + 1);
      return;
    }

    setCodeSent(true);
    setMessage('A 6-digit account verification code has been sent by email.');
    setTurnstileToken(null);
    setTurnstileKey((key) => key + 1);
  };

  const verifyCode = async () => {
    setError(null);
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit verification code.');

    setVerifying(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token: code,
      type: 'email',
    });
    setVerifying(false);

    if (verifyError) {
      setError(verifyError.message || 'That verification code is invalid or expired.');
      return;
    }

    const starterClaim = await claimPendingDrightStarterPurchase();
    if (starterClaim.error) console.warn('Starter purchase claim pending:', starterClaim.error);
    setMessage('Email verified successfully. Opening your DRIGHT dashboard…');
    window.setTimeout(() => navigate('/dashboard', { replace: true }), 600);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-muted">
        <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-muted px-4 py-8">
      <div className="max-w-md w-full">
        <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 p-8">
          <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
            <Mail className="w-8 h-8 text-primary-600 dark:text-primary-400" />
          </div>

          <h1 className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-2">Verify Your Email</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-6">
            Your original Supabase signup verification email still works. You can also request a secure 6-digit code below.
          </p>

          {message && (
            <div className="rounded-xl p-3 mb-4 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 flex items-start gap-2">
              <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span className="text-sm">{message}</span>
            </div>
          )}
          {error && (
            <div className="rounded-xl p-3 mb-4 bg-red-500/10 text-red-700 dark:text-red-400 flex items-start gap-2">
              <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Signup email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setCodeSent(false);
                  setCode('');
                }}
                disabled={Boolean(user?.email)}
                autoComplete="email"
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-70 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            {!codeSent && (
              <>
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldCheck className="w-4 h-4 text-primary-600" />
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Cloudflare security verification</span>
                  </div>
                  <TurnstileWidget
                    key={turnstileKey}
                    action="account_verification_code"
                    onVerified={setTurnstileToken}
                    onError={setTurnstileError}
                  />
                  {turnstileError && <p className="text-xs text-red-500 mt-1">{turnstileError}</p>}
                </div>

                <button
                  type="button"
                  onClick={() => void requestCode()}
                  disabled={sending || !normalizedEmail || !turnstileToken}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 disabled:opacity-50"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  Send verification code
                </button>
              </>
            )}

            {codeSent && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">6-digit verification code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-center text-2xl font-bold tracking-[0.35em] focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => void verifyCode()}
                  disabled={verifying || code.length !== 6}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 disabled:opacity-50"
                >
                  {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  Verify account
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCodeSent(false);
                    setCode('');
                    setMessage(null);
                    setError(null);
                    setTurnstileToken(null);
                    setTurnstileKey((key) => key + 1);
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  <RefreshCw className="w-4 h-4" />
                  Request another code
                </button>
              </>
            )}
          </div>

          <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-700 text-center">
            <p className="text-xs text-gray-400 mb-3">Already used the verification link from the Supabase signup email?</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
              <RefreshCw className="w-4 h-4" />
              I’ve verified — refresh
            </button>
          </div>

          <div className="mt-4 text-center">
            <Link to="/sign-in" className="text-sm text-gray-500 hover:text-primary-600 inline-flex items-center gap-1">
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
