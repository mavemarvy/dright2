import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Lock, Ban } from 'lucide-react';
import { getMyDrightClientOnboarding, type DrightClientOnboardingState } from '../lib/clientOnboarding';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading, isAccountLocked, isAccountBanned } = useAuth();
  const location = useLocation();
  const managedFirstLogin = ['admin_client_onboarding', 'assisted_signup'].includes(
    String(user?.app_metadata?.created_via || ''),
  );
  const [clientOnboarding, setClientOnboarding] = useState<DrightClientOnboardingState | null>(null);
  const [clientOnboardingLoading, setClientOnboardingLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!user || !managedFirstLogin) {
      setClientOnboarding({ required: false });
      setClientOnboardingLoading(false);
      return () => { cancelled = true; };
    }

    setClientOnboardingLoading(true);
    void getMyDrightClientOnboarding()
      .then((state) => {
        if (!cancelled) setClientOnboarding(state);
      })
      .catch(() => {
        if (!cancelled) {
          // Fail closed for an account explicitly marked as a managed first-login account.
          setClientOnboarding({
            required: true,
            must_change_password: true,
            must_verify_email: user?.app_metadata?.created_via === 'assisted_signup',
            must_complete_kyc: user?.app_metadata?.created_via === 'admin_client_onboarding',
          });
        }
      })
      .finally(() => {
        if (!cancelled) setClientOnboardingLoading(false);
      });

    return () => { cancelled = true; };
  }, [user?.id, managedFirstLogin, location.pathname]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-muted">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/welcome" state={{ from: location }} replace />;
  }

  if (isAccountBanned) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-muted px-4">
        <div className="max-w-md w-full rounded-2xl bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <Ban className="w-7 h-7 text-red-600 dark:text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Account Banned</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Your account has been banned. If you believe this is an error, please contact support.
          </p>
          <button
            onClick={() => window.location.href = '/welcome'}
            className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (isAccountLocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-muted px-4">
        <div className="max-w-md w-full rounded-2xl bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <Lock className="w-7 h-7 text-amber-600 dark:text-amber-400" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Account Locked</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Your account has been temporarily locked. Please contact support to restore access.
          </p>
          <button
            onClick={() => window.location.href = '/welcome'}
            className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (clientOnboardingLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-muted">
        <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }

  const clientSetupRequired = managedFirstLogin
    && clientOnboarding?.required === true
    && (
      clientOnboarding.must_change_password === true
      || clientOnboarding.must_verify_email === true
      || clientOnboarding.must_complete_kyc === true
    );

  if (clientSetupRequired && location.pathname !== '/client-account-setup') {
    return <Navigate to="/client-account-setup" replace />;
  }

  return <>{children}</>;
}
