import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { evaluatePasswordStrength } from '../lib/authSecurity';
import {
  changeDrightClientTemporaryPassword,
  getMyDrightClientOnboarding,
  type DrightClientOnboardingState,
} from '../lib/clientOnboarding';
import UserVerificationSection from '../components/UserVerificationSection';

export default function ClientAccountSetupPage() {
  const [state, setState] = useState<DrightClientOnboardingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await getMyDrightClientOnboarding();
      setState(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load account setup.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const strength = evaluatePasswordStrength(password);
  const canChangePassword = password.length >= 8
    && password === confirmPassword
    && strength.score >= 2
    && !changingPassword;

  const submitPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!canChangePassword) {
      setError('Choose a stronger password with at least 8 characters.');
      return;
    }
    setChangingPassword(true);
    try {
      await changeDrightClientTemporaryPassword(password);
      setPassword('');
      setConfirmPassword('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to change your password.');
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (!state?.required) {
    return (
      <div className="mx-auto max-w-xl p-4 sm:p-8">
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-7 text-center dark:border-emerald-900 dark:bg-emerald-950/20">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
          <h1 className="mt-3 text-xl font-black text-gray-900 dark:text-white">Account setup is complete</h1>
          <button onClick={() => window.location.assign('/')} className="mt-5 rounded-xl bg-primary-600 px-5 py-3 text-sm font-bold text-white">
            Continue to dashboard
          </button>
        </div>
      </div>
    );
  }

  const passwordDone = state.must_change_password === false;
  const kycDone = state.must_complete_kyc === false;
  const allDone = passwordDone && kycDone;

  return (
    <div className="mx-auto w-full max-w-5xl p-4 sm:p-6 lg:p-8">
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-800 p-6 text-white shadow-xl sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-200">First sign-in security</p>
        <h1 className="mt-2 text-2xl font-black sm:text-3xl">Finish setting up your DRIGHT account</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100">
          Your account was created for you after a DRIGHT Starter purchase. Replace the temporary password first, then complete your identity verification.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <SetupStep number="1" label="Create private password" complete={passwordDone} />
          <SetupStep number="2" label="Submit KYC verification" complete={kycDone} />
        </div>
      </div>

      {error && (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {!passwordDone ? (
        <form onSubmit={submitPassword} className="mt-6 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:p-7">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-gray-900 dark:text-white">Replace your temporary password</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">This step cannot be skipped. Your new password is not emailed to the person who created the account.</p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-700 dark:text-gray-200">New password</label>
              <div className="relative">
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  className="input-base w-full pr-11"
                  placeholder="Create a strong password"
                />
                <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-700 dark:text-gray-200">Confirm password</label>
              <input
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                className="input-base w-full"
                placeholder="Repeat the new password"
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-500">Minimum 8 characters. Stronger passwords are required before Continue becomes active.</p>

          <button
            type="submit"
            disabled={!canChangePassword}
            className="mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {changingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {changingPassword ? 'Securing account…' : 'Save private password & continue'}
          </button>
        </form>
      ) : !kycDone ? (
        <div className="mt-6 space-y-4">
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
            <strong>Password secured.</strong> Complete the KYC form below. Once you start the KYC submission and upload identity evidence, DRIGHT will let you enter the platform while review is pending. Restricted actions still follow the normal KYC approval rules.
          </div>
          <UserVerificationSection onChanged={() => void refresh()} />
        </div>
      ) : (
        <div className="mt-6 rounded-3xl border border-emerald-200 bg-emerald-50 p-7 text-center dark:border-emerald-900 dark:bg-emerald-950/20">
          <CheckCircle2 className="mx-auto h-11 w-11 text-emerald-600" />
          <h2 className="mt-3 text-xl font-black text-gray-900 dark:text-white">Setup submitted successfully</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-600 dark:text-gray-300">
            Your password has been replaced and your KYC evidence has been submitted. KYC review can continue in the background; normal verification rules still apply to protected actions.
          </p>
          <button
            onClick={() => window.location.assign('/')}
            className="mt-5 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white hover:bg-emerald-700"
          >
            Continue to DRIGHT
          </button>
        </div>
      )}

      {allDone && <span className="sr-only">Client onboarding complete</span>}
    </div>
  );
}

function SetupStep({ number, label, complete }: { number: string; label: string; complete: boolean }) {
  return (
    <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${complete ? 'border-emerald-300/40 bg-emerald-400/10' : 'border-white/15 bg-white/5'}`}>
      <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-black ${complete ? 'bg-emerald-400 text-emerald-950' : 'bg-white/15 text-white'}`}>
        {complete ? <CheckCircle2 className="h-4 w-4" /> : number}
      </div>
      <span className="text-sm font-bold">{label}</span>
    </div>
  );
}
