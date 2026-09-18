import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, ArrowLeft, Loader2, ShieldCheck, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import TurnstileWidget from '../components/TurnstileWidget';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'request' | 'verify'>('request');
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const normalizedEmail = email.trim().toLowerCase();

  const requestCode = async (event?: React.FormEvent) => {
    event?.preventDefault();
    setError(null);
    setMessage(null);
    if (!normalizedEmail) return setError('Enter your email address.');
    if (!turnstileToken) return setError('Complete the Cloudflare security check.');

    setLoading(true);
    const { data, error: invokeError } = await supabase.functions.invoke('auth-email-code', {
      body: {
        email: normalizedEmail,
        purpose: 'password_reset',
        turnstileToken,
      },
    });
    setLoading(false);

    if (invokeError || data?.success === false) {
      setError(data?.error || invokeError?.message || 'Could not send the reset code.');
      setTurnstileToken(null);
      setTurnstileKey((key) => key + 1);
      return;
    }

    setStage('verify');
    setCode('');
    setMessage('If this email belongs to a DRIGHT account, a 6-digit reset code has been sent.');
    setTurnstileToken(null);
    setTurnstileKey((key) => key + 1);
  };

  const verifyCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code from your email.');

    setLoading(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token: code,
      type: 'recovery',
    });
    setLoading(false);

    if (verifyError) {
      setError(verifyError.message || 'That code is invalid or expired.');
      return;
    }

    navigate('/reset-password?type=recovery&code=verified', { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-primary-600 via-primary-500 to-primary-400">
      <div className="flex-1 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-8 sm:p-10">
            <div className="text-center mb-7">
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                {stage === 'request' ? <Mail className="w-7 h-7 text-primary-600" /> : <ShieldCheck className="w-7 h-7 text-primary-600" />}
              </div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                {stage === 'request' ? 'Reset password' : 'Enter reset code'}
              </h1>
              <p className="text-gray-500 dark:text-gray-400 mt-2">
                {stage === 'request'
                  ? 'We’ll send a secure 6-digit code issued by Supabase Auth.'
                  : <>Enter the code sent to <span className="font-semibold text-gray-700 dark:text-gray-300">{normalizedEmail}</span>.</>}
              </p>
            </div>

            {message && <div className="mb-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 p-3 text-sm text-emerald-700 dark:text-emerald-300">{message}</div>}
            {error && <div className="mb-4 rounded-xl bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-300">{error}</div>}

            {stage === 'request' ? (
              <form onSubmit={requestCode} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Email address</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      autoComplete="email"
                      className="w-full pl-12 pr-4 py-4 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none"
                    />
                  </div>
                </div>

                <TurnstileWidget
                  key={turnstileKey}
                  action="password_reset_code"
                  onVerified={setTurnstileToken}
                  onError={setTurnstileError}
                />
                {turnstileError && <p className="text-xs text-red-500">{turnstileError}</p>}

                <button
                  type="submit"
                  disabled={loading || !turnstileToken}
                  className="w-full py-4 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50 min-h-[48px]"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Mail className="w-5 h-5" />}
                  Send reset code
                </button>
              </form>
            ) : (
              <form onSubmit={verifyCode} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">6-digit code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="w-full px-4 py-4 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-center text-2xl font-bold tracking-[0.35em] focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || code.length !== 6}
                  className="w-full py-4 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50 min-h-[48px]"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
                  Verify code
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setStage('request');
                    setMessage(null);
                    setError(null);
                    setTurnstileToken(null);
                    setTurnstileKey((key) => key + 1);
                  }}
                  className="w-full py-3 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-semibold flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Request another code
                </button>
              </form>
            )}

            <div className="mt-8 text-center">
              <Link to="/sign-in" className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
                <ArrowLeft className="w-4 h-4" />
                Back to sign in
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
