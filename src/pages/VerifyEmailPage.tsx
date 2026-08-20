import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Mail, CheckCircle, XCircle, RefreshCw, ArrowLeft, Clock } from 'lucide-react';

export default function VerifyEmailPage() {
  const { user, session, resendVerificationEmail, isEmailVerified, loading } = useAuth();
  const navigate = useNavigate();
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Redirect already-verified users
  useEffect(() => {
    if (!loading && isEmailVerified) {
      navigate('/dashboard', { replace: true });
    }
  }, [isEmailVerified, loading, navigate]);

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown(prev => Math.max(0, prev - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // Check for verification success from email redirect
  useEffect(() => {
    if (isEmailVerified) {
      navigate('/dashboard', { replace: true });
    }
  }, [isEmailVerified, navigate]);

  const handleResend = useCallback(async () => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setError(null);
    try {
      const { error: err } = await resendVerificationEmail();
      if (err) {
        setError(err.message || 'Failed to resend verification email');
      } else {
        setMessage('Verification email sent! Check your inbox.');
        setCooldown(60);
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setResending(false);
    }
  }, [cooldown, resending, resendVerificationEmail]);

  // If no user/session, show expired/invalid state
  if (!loading && !user && !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-muted px-4">
        <div className="max-w-md w-full rounded-2xl bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <XCircle className="w-7 h-7 text-red-600 dark:text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Session Expired</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Your session has expired. Please sign in again to request a new verification email.
          </p>
          <Link to="/sign-in" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Sign In
          </Link>
        </div>
      </div>
    );
  }

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
          {/* Icon */}
          <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
            <Mail className="w-8 h-8 text-primary-600 dark:text-primary-400" />
          </div>

          <h1 className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-2">
            Verify Your Email
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-6">
            We sent a verification link to{' '}
            <span className="font-medium text-gray-700 dark:text-gray-300">{user?.email}</span>.
            Click the link in the email to confirm your account.
          </p>

          {/* Success message */}
          {message && (
            <div className="rounded-xl p-3 mb-4 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 flex items-start gap-2">
              <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span className="text-sm">{message}</span>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="rounded-xl p-3 mb-4 bg-red-500/10 text-red-700 dark:text-red-400 flex items-start gap-2">
              <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Resend button */}
          <button
            onClick={handleResend}
            disabled={cooldown > 0 || resending}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {resending ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : cooldown > 0 ? (
              <Clock className="w-4 h-4" />
            ) : (
              <Mail className="w-4 h-4" />
            )}
            {cooldown > 0
              ? `Resend in ${cooldown}s`
              : resending
                ? 'Sending...'
                : 'Resend verification email'}
          </button>

          {/* Help text */}
          <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-400 text-center mb-3">
              Already clicked the link in your email?
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              I've verified — refresh
            </button>
          </div>

          {/* Back link */}
          <div className="mt-4 text-center">
            <Link to="/sign-in" className="text-sm text-gray-500 hover:text-primary-600 inline-flex items-center gap-1">
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to sign in
            </Link>
          </div>
        </div>

        {/* Tips */}
        <div className="mt-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 p-4">
          <p className="text-xs text-blue-700 dark:text-blue-400 font-medium mb-1">Tips</p>
          <ul className="text-xs text-blue-600 dark:text-blue-500 space-y-1">
            <li>Check your spam/junk folder if you don't see the email</li>
            <li>The verification link expires after 24 hours</li>
            <li>Make sure the email address is correct</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
