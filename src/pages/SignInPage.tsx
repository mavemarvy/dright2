import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, Phone, ArrowRight, Loader2, ShieldAlert, Send } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { getPendingRedirect, clearPendingRedirect } from '../lib/affiliate';
import TurnstileWidget from '../components/TurnstileWidget';
import { verifyTurnstileToken } from '../lib/security/turnstile';

export default function SignInPage() {
  const [isPhoneMode, setIsPhoneMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBanAppeal, setShowBanAppeal] = useState(false);
  const [bannedEmail, setBannedEmail] = useState('');
  const [appealText, setAppealText] = useState('');
  const [submittingAppeal, setSubmittingAppeal] = useState(false);
  const [appealSubmitted, setAppealSubmitted] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState<string | null>(null);
  const { signIn, signInWithPhone } = useAuth();
  const navigate = useNavigate();

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!turnstileToken) {
      setError('Please complete the CAPTCHA challenge');
      return;
    }
    setLoading(true);
    setError(null);

    const turnstileResult = await verifyTurnstileToken(turnstileToken, 'signin');
    if (!turnstileResult.success) {
      setError(turnstileResult.error || 'CAPTCHA verification failed');
      setLoading(false);
      return;
    }

    const { error } = await signIn(email, password);
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      // Check if account is banned
      const { data: profile } = await supabase
        .from('users')
        .select('account_status')
        .eq('email', email)
        .maybeSingle();
      if (profile?.account_status === 'BANNED') {
        setBannedEmail(email);
        setShowBanAppeal(true);
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }
      navigate(getPendingRedirect() || '/');
      clearPendingRedirect();
    }
  };

  const handlePhoneSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error, mockOtp } = await signInWithPhone(phone);
    if (error) {
      setError(error.message);
      setLoading(false);
    } else if (mockOtp) {
      // Show OTP in UI since SMS is mocked
      navigate('/verify-otp', { state: { phone, mockOtp } });
    }
  };

  const submitAppeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appealText.trim()) return;
    setSubmittingAppeal(true);
    try {
      const { data: userData } = await supabase
        .from('users')
        .select('id')
        .eq('email', bannedEmail)
        .maybeSingle();
      if (userData) {
        await supabase.from('ban_appeals').insert({
          user_id: userData.id,
          appeal_text: appealText.trim(),
        });
      }
      setAppealSubmitted(true);
    } catch (err) {
      console.error('Appeal error:', err);
    } finally {
      setSubmittingAppeal(false);
    }
  };

  if (appealSubmitted) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-primary-600 via-primary-500 to-primary-400">
        <div className="flex-1 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-8 sm:p-10 text-center max-w-md w-full"
          >
            <div className="w-16 h-16 bg-success-muted rounded-full flex items-center justify-center mx-auto mb-6">
              <Send className="w-8 h-8 text-success" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Appeal Submitted</h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6">Your appeal has been submitted. The QA team will review it and get back to you.</p>
            <button
              onClick={() => {
                setShowBanAppeal(false);
                setAppealSubmitted(false);
                setBannedEmail('');
                setAppealText('');
              }}
              className="text-primary-600 hover:text-primary-700 font-semibold"
            >
              Back to sign in
            </button>
          </motion.div>
        </div>
      </div>
    );
  }

  if (showBanAppeal) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-error-muted to-red-50">
        <div className="flex-1 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md"
          >
            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-8 sm:p-10">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-error-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  <ShieldAlert className="w-8 h-8 text-error" />
                </div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Account Banned</h1>
                <p className="text-gray-500 dark:text-gray-400 mt-2">Your account has been banned. You can submit an appeal below.</p>
              </div>

              <form onSubmit={submitAppeal} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Appeal Message</label>
                  <textarea
                    value={appealText}
                    onChange={(e) => setAppealText(e.target.value)}
                    placeholder="Explain why you believe your account should be reinstated..."
                    rows={4}
                    required
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none text-gray-900 dark:text-gray-100 resize-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submittingAppeal || !appealText.trim()}
                  className="w-full py-4 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 min-h-[48px]"
                >
                  {submittingAppeal ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      Submit Appeal
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowBanAppeal(false);
                    setBannedEmail('');
                    setAppealText('');
                  }}
                  className="w-full text-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-300"
                >
                  Back to sign in
                </button>
              </form>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-primary-600 via-primary-500 to-primary-400">
      <div className="flex-1 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-8 sm:p-10">
            <div className="text-center mb-8">
              <Link to="/welcome" className="inline-block">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Dright</h1>
              </Link>
              <p className="text-gray-500 dark:text-gray-400 mt-2">Sign in to your account</p>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-error-muted text-error rounded-xl p-4 mb-6"
              >
                {error}
              </motion.div>
            )}

            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setIsPhoneMode(false)}
                className={`flex-1 py-3 rounded-xl font-medium transition-all ${
                  !isPhoneMode
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}
              >
                <Mail className="w-4 h-4 inline mr-2" />
                Email
              </button>
              <button
                onClick={() => setIsPhoneMode(true)}
                className={`flex-1 py-3 rounded-xl font-medium transition-all ${
                  isPhoneMode
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}
              >
                <Phone className="w-4 h-4 inline mr-2" />
                Phone
              </button>
            </div>

            {!isPhoneMode ? (
              <form onSubmit={handleEmailSignIn} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      className="w-full pl-12 pr-4 py-4 rounded-xl border border-gray-200 dark:border-gray-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all text-gray-900 dark:text-gray-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      required
                      className="w-full pl-12 pr-4 py-4 rounded-xl border border-gray-200 dark:border-gray-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all text-gray-900 dark:text-gray-100"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Link
                    to="/forgot-password"
                    className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                  >
                    Forgot password?
                  </Link>
                </div>

                <TurnstileWidget
                  action="signin"
                  onVerified={setTurnstileToken}
                  onError={setTurnstileError}
                  className="pt-2"
                />
                {turnstileError && (
                  <p className="text-xs text-red-500">{turnstileError}</p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 min-h-[48px]"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      Sign In
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={handlePhoneSignIn} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Phone number
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+1 (555) 123-4567"
                      required
                      className="w-full pl-12 pr-4 py-4 rounded-xl border border-gray-200 dark:border-gray-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    We'll send you a verification code (mocked for testing)
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 min-h-[48px]"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      Send Code
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </form>
            )}

            <div className="mt-8 text-center">
              <p className="text-gray-500 dark:text-gray-400">
                Don't have an account?{' '}
                <Link
                  to="/sign-up"
                  className="text-primary-600 hover:text-primary-700 font-semibold"
                >
                  Sign up
                </Link>
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
