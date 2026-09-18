import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useLoginHistory, getBrowserName } from '../lib/authSecurity';
import {
  Shield, ShieldCheck, Monitor, LogOut, Mail,
  CheckCircle, XCircle, RefreshCw, KeyRound, Activity, Wallet,
  Eye, EyeOff, AlertCircle,
} from 'lucide-react';
import {
  getSecurityStatus, setPin, changePin, type PaymentSecurityStatus,
} from '../lib/paymentSecurity';
import RecoveryCodes from '../components/RecoveryCodes';

export default function UserSecurityCenterPage() {
  const { user, profile, signOutAllDevices, isEmailVerified, updatePassword } = useAuth();
  const { history, loading: historyLoading, refetch } = useLoginHistory(user?.id);

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [lastPasswordChange, setLastPasswordChange] = useState<string | null>(null);

  const [pinStatus, setPinStatus] = useState<PaymentSecurityStatus | null>(null);
  const [pinLoading, setPinLoading] = useState(false);
  const [showSetPin, setShowSetPin] = useState(false);
  const [showChangePin, setShowChangePin] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSuccess, setPinSuccess] = useState<string | null>(null);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [showRecoveryCodes, setShowRecoveryCodes] = useState(false);

  const loadPinStatus = useCallback(async () => {
    if (!user?.id) return;
    const status = await getSecurityStatus(user.id);
    setPinStatus(status);
  }, [user?.id]);

  useEffect(() => { loadPinStatus(); }, [loadPinStatus]);

  const clearPinForm = () => {
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setShowPin(false);
  };

  const handleSetPin = async (event: React.FormEvent) => {
    event.preventDefault();
    setPinError(null);
    setPinSuccess(null);
    if (newPin !== confirmPin) {
      setPinError('PINs do not match.');
      return;
    }
    if (!user?.id) return;

    setPinLoading(true);
    const result = await setPin(user.id, newPin);
    setPinLoading(false);
    if (result.success) {
      setPinSuccess('Payment PIN set successfully.');
      setShowSetPin(false);
      clearPinForm();
      await loadPinStatus();
    } else {
      setPinError(result.error || 'Failed to set PIN.');
    }
  };

  const handleChangePin = async (event: React.FormEvent) => {
    event.preventDefault();
    setPinError(null);
    setPinSuccess(null);
    if (newPin !== confirmPin) {
      setPinError('New PINs do not match.');
      return;
    }
    if (!user?.id) return;

    setPinLoading(true);
    const result = await changePin(user.id, currentPin, newPin);
    setPinLoading(false);
    if (result.success) {
      setPinSuccess(pinStatus?.auth_rules?.force_reset_required ? 'Required PIN reset completed.' : 'Payment PIN changed successfully.');
      setShowChangePin(false);
      clearPinForm();
      await loadPinStatus();
    } else {
      setPinError(result.error || 'Failed to change PIN.');
      await loadPinStatus();
    }
  };

  const fetchPasswordChangeDate = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data } = await supabase
        .from('auth_activity')
        .select('created_at')
        .eq('user_id', user.id)
        .eq('event_type', 'password_change')
        .eq('success', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.created_at) setLastPasswordChange(data.created_at);
    } catch {
      // Non-critical display metadata.
    }
  }, [user?.id]);

  useEffect(() => { fetchPasswordChangeDate(); }, [fetchPasswordChangeDate]);

  const securityScore = useMemo(() => {
    let score = 0;
    if (isEmailVerified) score += 25;
    if (profile?.is_verified) score += 15;
    if (profile?.location_verified) score += 10;
    if (profile?.phone) score += 15;
    if (pinStatus?.has_pin && !pinStatus.is_locked) score += 10;

    const recentFailed = history.filter((item) => item.event_type === 'failed_login' && !item.success).length;
    if (recentFailed === 0) score += 15;
    else if (recentFailed <= 2) score += 5;

    if (lastPasswordChange) {
      const days = (Date.now() - new Date(lastPasswordChange).getTime()) / 86_400_000;
      if (days < 30) score += 10;
      else if (days < 90) score += 5;
    } else {
      score += 5;
    }

    return Math.min(100, score);
  }, [history, isEmailVerified, lastPasswordChange, pinStatus?.has_pin, pinStatus?.is_locked, profile?.is_verified, profile?.location_verified, profile?.phone]);

  const scoreColor = securityScore >= 80 ? 'text-emerald-500' : securityScore >= 50 ? 'text-amber-500' : 'text-red-500';
  const scoreBg = securityScore >= 80 ? 'bg-emerald-500' : securityScore >= 50 ? 'bg-amber-500' : 'bg-red-500';

  const handleChangePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordError(null);
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }

    setPasswordLoading(true);
    try {
      const { error } = await updatePassword(newPassword);
      if (error) {
        setPasswordError(error.message || 'Failed to change password.');
      } else {
        setPasswordSuccess(true);
        setNewPassword('');
        setConfirmPassword('');
        setShowChangePassword(false);
        window.setTimeout(() => setPasswordSuccess(false), 5000);
        refetch();
        fetchPasswordChangeDate();
      }
    } catch {
      setPasswordError('Something went wrong.');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleLogoutAll = async () => {
    setLogoutLoading(true);
    setLogoutError(null);
    try {
      const { error } = await signOutAllDevices();
      if (error) setLogoutError(error.message || 'Failed to sign out.');
    } catch {
      setLogoutError('Something went wrong.');
    } finally {
      setLogoutLoading(false);
    }
  };

  const devices = useMemo(() => {
    const deviceMap = new Map<string, { browser: string; lastSeen: string; count: number }>();
    history.forEach((item) => {
      const userAgent = item.user_agent || 'Unknown';
      const browser = getBrowserName() || 'Unknown';
      const existing = deviceMap.get(userAgent);
      if (existing) {
        existing.count += 1;
        if (new Date(item.created_at) > new Date(existing.lastSeen)) existing.lastSeen = item.created_at;
      } else {
        deviceMap.set(userAgent, { browser, lastSeen: item.created_at, count: 1 });
      }
    });
    return Array.from(deviceMap.values());
  }, [history]);

  const forceResetRequired = pinStatus?.auth_rules?.force_reset_required === true;

  if (!user) return null;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold flex items-center gap-2 mb-6">
        <Shield className="w-7 h-7 text-primary" /> Security Center
      </h1>

      {forceResetRequired && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-6 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-amber-800">Payment PIN reset required</p>
            <p className="text-sm text-amber-700 mt-1">Protected wallet transactions are blocked until you verify your current PIN and choose a new one.</p>
            <button onClick={() => { setShowChangePin(true); setPinError(null); setPinSuccess(null); }} className="mt-3 px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700">
              Change PIN now
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold text-white ${scoreBg}`}>{securityScore}</div>
          <div>
            <h2 className="text-lg font-semibold">Security Score</h2>
            <p className={`text-sm ${scoreColor}`}>{securityScore >= 80 ? 'Your account is well protected' : securityScore >= 50 ? 'Consider improving your security' : 'Your account needs attention'}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <StatusCard icon={Mail} label="Email Verification" value={isEmailVerified ? 'Verified' : 'Not verified'} good={isEmailVerified} />
        <StatusCard icon={ShieldCheck} label="Account Status" value={profile?.account_status || 'Unknown'} good={profile?.account_status === 'ACTIVE'} />
        <StatusCard icon={KeyRound} label="Password Changed" value={lastPasswordChange ? new Date(lastPasswordChange).toLocaleDateString() : 'Never changed'} good={Boolean(lastPasswordChange)} actionLabel="Change" onAction={() => setShowChangePassword((value) => !value)} />
        <StatusCard icon={Wallet} label="Payment PIN" value={!pinStatus?.has_pin ? 'Not set' : forceResetRequired ? 'Reset required' : pinStatus.is_locked ? 'Locked' : 'Active'} good={Boolean(pinStatus?.has_pin && !pinStatus.is_locked && !forceResetRequired)} />
      </div>

      {passwordSuccess && <Message tone="success">Password changed successfully.</Message>}
      {passwordError && <Message tone="error">{passwordError}</Message>}

      {showChangePassword && (
        <Section title="Change Password">
          <form onSubmit={handleChangePassword} className="space-y-3">
            <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="New password" autoComplete="new-password" className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirm new password" autoComplete="new-password" className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            <button type="submit" disabled={passwordLoading} className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 disabled:opacity-50">{passwordLoading ? 'Changing...' : 'Change password'}</button>
          </form>
        </Section>
      )}

      <Section title="Payment PIN" icon={Wallet}>
        {pinError && <Message tone="error">{pinError}</Message>}
        {pinSuccess && <Message tone="success">{pinSuccess}</Message>}

        {!pinStatus?.has_pin ? (
          <div>
            <p className="text-sm text-gray-500 mb-3">Set a 4–8 digit PIN to protect withdrawals and other sensitive wallet actions.</p>
            {!showSetPin ? (
              <button onClick={() => { setShowSetPin(true); setPinError(null); }} className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-semibold">Set payment PIN</button>
            ) : (
              <PinForm mode="set" currentPin={currentPin} newPin={newPin} confirmPin={confirmPin} showPin={showPin} loading={pinLoading} onCurrentPin={setCurrentPin} onNewPin={setNewPin} onConfirmPin={setConfirmPin} onToggleShow={() => setShowPin((value) => !value)} onSubmit={handleSetPin} onCancel={() => { setShowSetPin(false); clearPinForm(); }} />
            )}
          </div>
        ) : (
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className={`px-2 py-1 rounded-full text-xs font-semibold ${forceResetRequired ? 'bg-amber-100 text-amber-700' : pinStatus.is_locked ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{forceResetRequired ? 'Reset required' : pinStatus.is_locked ? 'Locked' : 'Active'}</span>
              <span className="text-xs text-gray-400">Failed attempts: {pinStatus.failed_attempts || 0}</span>
              {pinStatus.last_pin_change && <span className="text-xs text-gray-400">Last changed {new Date(pinStatus.last_pin_change).toLocaleDateString()}</span>}
            </div>

            {!showChangePin ? (
              <button onClick={() => { setShowChangePin(true); setPinError(null); setPinSuccess(null); }} className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800">{forceResetRequired ? 'Reset PIN' : 'Change PIN'}</button>
            ) : (
              <PinForm mode="change" currentPin={currentPin} newPin={newPin} confirmPin={confirmPin} showPin={showPin} loading={pinLoading} onCurrentPin={setCurrentPin} onNewPin={setNewPin} onConfirmPin={setConfirmPin} onToggleShow={() => setShowPin((value) => !value)} onSubmit={handleChangePin} onCancel={() => { setShowChangePin(false); clearPinForm(); }} />
            )}

            <div className="mt-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-800 text-xs text-gray-500">
              Forgot your PIN? Self-service recovery is temporarily unavailable while secure server-delivered recovery is being finalized. <Link to="/help" className="text-primary-600 font-semibold hover:underline">Contact support</Link> instead of sharing recovery codes or PINs with anyone.
            </div>
          </div>
        )}
      </Section>

      <Section title="Recovery Codes" icon={KeyRound}>
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-gray-500">Use account recovery codes only through DRIGHT’s official recovery flow.</p>
          <button onClick={() => setShowRecoveryCodes((value) => !value)} className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium hover:bg-gray-50">{showRecoveryCodes ? 'Hide' : 'Manage'}</button>
        </div>
      </Section>

      <RecoveryCodes open={showRecoveryCodes} userId={user.id} onClose={() => setShowRecoveryCodes(false)} />

      <Section title="Recent Devices" icon={Monitor}>
        {historyLoading ? (
          <div className="py-6 flex justify-center"><RefreshCw className="w-5 h-5 animate-spin text-gray-400" /></div>
        ) : devices.length === 0 ? (
          <p className="text-sm text-gray-400">No device history recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {devices.slice(0, 8).map((device, index) => (
              <div key={`${device.browser}-${device.lastSeen}-${index}`} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                <Monitor className="w-4 h-4 text-gray-400" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{device.browser}</p>
                  <p className="text-xs text-gray-400">Last seen {new Date(device.lastSeen).toLocaleString()} • {device.count} recorded event{device.count === 1 ? '' : 's'}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Security Activity" icon={Activity}>
        {history.length === 0 ? (
          <p className="text-sm text-gray-400">No recent security activity.</p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {history.slice(0, 20).map((item) => (
              <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                {item.success ? <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5" /> : <XCircle className="w-4 h-4 text-red-500 mt-0.5" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium capitalize">{item.event_type.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-gray-400">{new Date(item.created_at).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Sessions" icon={LogOut}>
        {logoutError && <Message tone="error">{logoutError}</Message>}
        <p className="text-sm text-gray-500 mb-3">Sign out every active DRIGHT session if you suspect unauthorized access.</p>
        <button onClick={handleLogoutAll} disabled={logoutLoading} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 inline-flex items-center gap-2">
          <LogOut className="w-4 h-4" /> {logoutLoading ? 'Signing out...' : 'Sign out all devices'}
        </button>
      </Section>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon?: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-5 mb-6 bg-white dark:bg-gray-900">
      <h2 className="font-semibold mb-4 flex items-center gap-2">{Icon && <Icon className="w-5 h-5 text-gray-500" />}{title}</h2>
      {children}
    </div>
  );
}

function StatusCard({ icon: Icon, label, value, good, actionLabel, onAction }: { icon: React.ElementType; label: string; value: string; good: boolean; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${good ? 'bg-emerald-500/10' : 'bg-amber-500/10'}`}>
        <Icon className={`w-5 h-5 ${good ? 'text-emerald-500' : 'text-amber-500'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className={`text-xs ${good ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500'}`}>{value}</p>
      </div>
      {actionLabel && onAction && <button onClick={onAction} className="text-xs font-medium text-primary-600 hover:text-primary-700">{actionLabel}</button>}
    </div>
  );
}

function Message({ tone, children }: { tone: 'success' | 'error'; children: React.ReactNode }) {
  return (
    <div className={`rounded-lg p-3 mb-4 flex items-center gap-2 text-sm ${tone === 'success' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-red-500/10 text-red-700 dark:text-red-400'}`}>
      {tone === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
      {children}
    </div>
  );
}

function PinForm({
  mode, currentPin, newPin, confirmPin, showPin, loading,
  onCurrentPin, onNewPin, onConfirmPin, onToggleShow, onSubmit, onCancel,
}: {
  mode: 'set' | 'change';
  currentPin: string; newPin: string; confirmPin: string; showPin: boolean; loading: boolean;
  onCurrentPin: (value: string) => void; onNewPin: (value: string) => void; onConfirmPin: (value: string) => void;
  onToggleShow: () => void; onSubmit: (event: React.FormEvent) => void; onCancel: () => void;
}) {
  const inputType = showPin ? 'text' : 'password';
  const sanitize = (value: string) => value.replace(/\D/g, '').slice(0, 8);

  return (
    <form onSubmit={onSubmit} className="space-y-3 max-w-md">
      {mode === 'change' && (
        <input type={inputType} inputMode="numeric" autoComplete="current-password" value={currentPin} onChange={(event) => onCurrentPin(sanitize(event.target.value))} placeholder="Current PIN" required className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
      )}
      <input type={inputType} inputMode="numeric" autoComplete="new-password" value={newPin} onChange={(event) => onNewPin(sanitize(event.target.value))} placeholder="New PIN (4–8 digits)" required className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
      <input type={inputType} inputMode="numeric" autoComplete="new-password" value={confirmPin} onChange={(event) => onConfirmPin(sanitize(event.target.value))} placeholder="Confirm new PIN" required className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={onToggleShow} className="px-3 py-2 rounded-lg border border-gray-200 text-sm inline-flex items-center gap-1">
          {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />} {showPin ? 'Hide' : 'Show'}
        </button>
        <button type="submit" disabled={loading} className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 disabled:opacity-50">{loading ? 'Saving...' : mode === 'set' ? 'Set PIN' : 'Change PIN'}</button>
        <button type="button" onClick={onCancel} className="px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100">Cancel</button>
      </div>
    </form>
  );
}
