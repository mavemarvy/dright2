import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useLoginHistory, getBrowserName } from '../lib/authSecurity';
import {
  Shield, ShieldCheck, Clock, Monitor, LogOut, Mail, Lock,
  CheckCircle, XCircle, RefreshCw, KeyRound, Activity, Wallet,
  Lock as LockIcon, Eye, EyeOff, AlertCircle,
} from 'lucide-react';
import {
  getSecurityStatus, setPin, changePin, verifyPin,
  requestPinReset, type PaymentSecurityStatus,
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
  const [showResetPin, setShowResetPin] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSuccess, setPinSuccess] = useState<string | null>(null);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [showRecoveryCodes, setShowRecoveryCodes] = useState(false);

  const loadPinStatus = useCallback(async () => {
    if (!user?.id) return;
    const status = await getSecurityStatus(user.id);
    setPinStatus(status);
  }, [user?.id]);

  useEffect(() => { loadPinStatus(); }, [loadPinStatus]);

  const handleSetPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null); setPinSuccess(null);
    if (newPin !== confirmPin) { setPinError('PINs do not match.'); return; }
    if (!user?.id) return;
    setPinLoading(true);
    const result = await setPin(user.id, newPin);
    setPinLoading(false);
    if (result.success) {
      setPinSuccess('Payment PIN set successfully.');
      setShowSetPin(false); setNewPin(''); setConfirmPin('');
      loadPinStatus();
    } else setPinError(result.error || 'Failed to set PIN.');
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null); setPinSuccess(null);
    if (newPin !== confirmPin) { setPinError('New PINs do not match.'); return; }
    if (!user?.id) return;
    setPinLoading(true);
    const result = await changePin(user.id, currentPin, newPin);
    setPinLoading(false);
    if (result.success) {
      setPinSuccess('Payment PIN changed successfully.');
      setShowChangePin(false); setCurrentPin(''); setNewPin(''); setConfirmPin('');
      loadPinStatus();
    } else setPinError(result.error || 'Failed to change PIN.');
  };

  const handleRequestReset = async () => {
    setPinError(null); setPinSuccess(null);
    if (!user?.id) return;
    setPinLoading(true);
    const result = await requestPinReset(user.id);
    setPinLoading(false);
    if (result.success && result.token) {
      setResetToken(result.token);
      setPinSuccess('Recovery token generated. Check your email.');
    } else setPinError(result.error || 'Failed to generate recovery token.');
  };

  const handleResetPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null); setPinSuccess(null);
    if (newPin !== confirmPin) { setPinError('New PINs do not match.'); return; }
    if (!user?.id) return;
    setPinLoading(true);
    const verifyResult = await verifyPin(user.id, currentPin, 'pin_reset');
    if (!verifyResult.success) { setPinError(verifyResult.error || 'Invalid current PIN.'); setPinLoading(false); return; }
    const result = await setPin(user.id, newPin);
    setPinLoading(false);
    if (result.success) {
      setPinSuccess('Payment PIN reset successfully.');
      setShowResetPin(false); setCurrentPin(''); setNewPin(''); setConfirmPin(''); setResetToken('');
      loadPinStatus();
    } else setPinError(result.error || 'Failed to reset PIN.');
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
    } catch { /* non-critical */ }
  }, [user?.id]);

  useEffect(() => { fetchPasswordChangeDate(); }, [fetchPasswordChangeDate]);

  // Security score calculation
  const securityScore = (() => {
    let score = 0;
    if (isEmailVerified) score += 25;
    if (profile?.is_verified) score += 15;
    if (profile?.location_verified) score += 10;
    // Check for 2FA (phone verified)
    if (profile?.phone) score += 15;
    // Recent failed logins (lower score)
    const recentFailed = history.filter(h => h.event_type === 'failed_login' && !h.success).length;
    if (recentFailed === 0) score += 15;
    else if (recentFailed <= 2) score += 5;
    // Password changed recently
    if (lastPasswordChange) {
      const days = (Date.now() - new Date(lastPasswordChange).getTime()) / (1000 * 60 * 60 * 24);
      if (days < 30) score += 10;
      else if (days < 90) score += 5;
    } else {
      score += 5; // assume okay if never changed (new account)
    }
    // Account not locked
    if (profile?.account_status === 'ACTIVE') score += 10;
    return Math.min(100, score);
  })();

  const scoreColor = securityScore >= 80 ? 'text-emerald-500' : securityScore >= 50 ? 'text-amber-500' : 'text-red-500';
  const scoreBg = securityScore >= 80 ? 'bg-emerald-500' : securityScore >= 50 ? 'bg-amber-500' : 'bg-red-500';

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    if (newPassword.length < 8) { setPasswordError('Password must be at least 8 characters.'); return; }
    if (newPassword !== confirmPassword) { setPasswordError('Passwords do not match.'); return; }
    setPasswordLoading(true);
    try {
      const { error: err } = await updatePassword(newPassword);
      if (err) { setPasswordError(err.message || 'Failed to change password.'); }
      else {
        setPasswordSuccess(true);
        setNewPassword('');
        setConfirmPassword('');
        setShowChangePassword(false);
        setTimeout(() => setPasswordSuccess(false), 5000);
        refetch();
        fetchPasswordChangeDate();
      }
    } catch { setPasswordError('Something went wrong.'); }
    finally { setPasswordLoading(false); }
  };

  const handleLogoutAll = async () => {
    setLogoutLoading(true);
    setLogoutError(null);
    try {
      const { error: err } = await signOutAllDevices();
      if (err) setLogoutError(err.message || 'Failed to sign out.');
    } catch { setLogoutError('Something went wrong.'); }
    finally { setLogoutLoading(false); }
  };

  // Group history by device
  const devices = (() => {
    const deviceMap = new Map<string, { browser: string; lastSeen: string; count: number }>();
    history.forEach(h => {
      const ua = h.user_agent || 'Unknown';
      const browser = getBrowserName() || 'Unknown';
      const key = ua;
      const existing = deviceMap.get(key);
      if (existing) {
        existing.count++;
        if (new Date(h.created_at) > new Date(existing.lastSeen)) existing.lastSeen = h.created_at;
      } else {
        deviceMap.set(key, { browser, lastSeen: h.created_at, count: 1 });
      }
    });
    return Array.from(deviceMap.values());
  })();

  const eventIcons: Record<string, typeof Shield> = {
    login: CheckCircle, logout: LogOut, signup: Activity, failed_login: XCircle,
    password_reset_request: KeyRound, password_change: KeyRound,
    email_verification: Mail, session_refresh: RefreshCw,
    account_lock: Lock, account_unlock: ShieldCheck, admin_forced_logout: LogOut,
  };

  if (!user) return null;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold flex items-center gap-2 mb-6">
        <Shield className="w-7 h-7 text-primary" />
        Security Center
      </h1>

      {/* Security Score */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold text-white ${scoreBg}`}>
            {securityScore}
          </div>
          <div>
            <h2 className="text-lg font-semibold">Security Score</h2>
            <p className={`text-sm ${scoreColor}`}>
              {securityScore >= 80 ? 'Your account is well protected' : securityScore >= 50 ? 'Consider improving your security' : 'Your account needs attention'}
            </p>
          </div>
        </div>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Email verification */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isEmailVerified ? 'bg-emerald-500/10' : 'bg-amber-500/10'}`}>
            {isEmailVerified ? <Mail className="w-5 h-5 text-emerald-500" /> : <Mail className="w-5 h-5 text-amber-500" />}
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">Email Verification</p>
            <p className={`text-xs ${isEmailVerified ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
              {isEmailVerified ? 'Verified' : 'Not verified'}
            </p>
          </div>
        </div>

        {/* Account status */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${profile?.account_status === 'ACTIVE' ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
            <ShieldCheck className={`w-5 h-5 ${profile?.account_status === 'ACTIVE' ? 'text-emerald-500' : 'text-red-500'}`} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">Account Status</p>
            <p className="text-xs text-gray-500">{profile?.account_status || 'Unknown'}</p>
          </div>
        </div>

        {/* Password last changed */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-blue-500/10">
            <KeyRound className="w-5 h-5 text-blue-500" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">Password Changed</p>
            <p className="text-xs text-gray-500">
              {lastPasswordChange ? new Date(lastPasswordChange).toLocaleDateString() : 'Never changed'}
            </p>
          </div>
          <button onClick={() => setShowChangePassword(!showChangePassword)}
            className="text-xs font-medium text-primary-600 hover:text-primary-700">
            Change
          </button>
        </div>

        {/* Last login */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-purple-500/10">
            <Clock className="w-5 h-5 text-purple-500" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">Last Login</p>
            <p className="text-xs text-gray-500">
              {history.find(h => h.event_type === 'login' && h.success)?.created_at
                ? new Date(history.find(h => h.event_type === 'login' && h.success)!.created_at).toLocaleString()
                : 'No login recorded'}
            </p>
          </div>
        </div>
      </div>

      {/* Change password form */}
      {showChangePassword && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-5 mb-6">
          <h3 className="font-semibold mb-4">Change Password</h3>
          {passwordSuccess && (
            <div className="rounded-lg p-3 mb-4 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
              <CheckCircle className="w-5 h-5" /> Password changed successfully.
            </div>
          )}
          {passwordError && (
            <div className="rounded-lg p-3 mb-4 bg-red-500/10 text-red-700 dark:text-red-400 flex items-center gap-2">
              <XCircle className="w-5 h-5" /> {passwordError}
            </div>
          )}
          <form onSubmit={handleChangePassword} className="space-y-3">
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
              placeholder="New password" autoComplete="new-password"
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password" autoComplete="new-password"
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            <div className="flex gap-2">
              <button type="submit" disabled={passwordLoading}
                className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
                {passwordLoading ? 'Updating...' : 'Update password'}
              </button>
              <button type="button" onClick={() => { setShowChangePassword(false); setPasswordError(null); }}
                className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Active devices */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-5 mb-6">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><Monitor className="w-5 h-5 text-primary" /> Active Devices</h3>
        {devices.length === 0 ? (
          <p className="text-sm text-gray-400">No device history available yet.</p>
        ) : (
          <div className="space-y-2">
            {devices.map((d, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                <Monitor className="w-4 h-4 text-gray-400" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{d.browser}</p>
                  <p className="text-xs text-gray-400">Last seen: {new Date(d.lastSeen).toLocaleString()}</p>
                </div>
                <span className="text-xs text-gray-400">{d.count} session(s)</span>
              </div>
            ))}
          </div>
        )}
        <button onClick={handleLogoutAll} disabled={logoutLoading}
          className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors">
          <LogOut className="w-4 h-4" />
          {logoutLoading ? 'Signing out...' : 'Sign out all devices'}
        </button>
        {logoutError && <p className="text-xs text-red-500 mt-2">{logoutError}</p>}
      </div>

      {/* Payment Security */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2"><Wallet className="w-5 h-5 text-primary" /> Payment Security</h3>
          {pinStatus?.has_pin && <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-700">PIN Active</span>}
        </div>

        {pinSuccess && (
          <div className="rounded-lg p-3 mb-4 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
            <CheckCircle className="w-5 h-5" /> {pinSuccess}
          </div>
        )}
        {pinError && (
          <div className="rounded-lg p-3 mb-4 bg-red-500/10 text-red-700 dark:text-red-400 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" /> {pinError}
          </div>
        )}

        {pinStatus?.is_locked && (
          <div className="rounded-lg p-3 mb-4 bg-red-500/10 text-red-700 dark:text-red-400 flex items-center gap-2">
            <LockIcon className="w-5 h-5" /> PIN is locked{pinStatus.locked_until ? ` until ${new Date(pinStatus.locked_until).toLocaleString()}` : ''}
          </div>
        )}

        {pinStatus?.has_pin ? (
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                <p className="text-xs text-gray-400">PIN Length</p>
                <p className="text-sm font-medium">{pinStatus.pin_length} digits</p>
              </div>
              <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                <p className="text-xs text-gray-400">Last Changed</p>
                <p className="text-sm font-medium">{pinStatus.last_pin_change ? new Date(pinStatus.last_pin_change).toLocaleDateString() : 'Unknown'}</p>
              </div>
              <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                <p className="text-xs text-gray-400">Failed Attempts</p>
                <p className="text-sm font-medium">{pinStatus.failed_attempts || 0}</p>
              </div>
              <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                <p className="text-xs text-gray-400">Wallet Protection</p>
                <p className="text-sm font-medium text-emerald-600">Protected</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => { setShowChangePin(!showChangePin); setShowSetPin(false); setShowResetPin(false); setPinError(null); setPinSuccess(null); }}
                className="px-3 py-1.5 rounded-lg bg-primary-600 text-white text-xs font-medium hover:bg-primary-700">Change PIN</button>
              <button onClick={() => { setShowResetPin(!showResetPin); setShowChangePin(false); setShowSetPin(false); setPinError(null); setPinSuccess(null); }}
                className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50">Forgot PIN</button>
              <button onClick={() => setShowRecoveryCodes(true)}
                className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50">Recovery Codes</button>
            </div>
          </>
        ) : (
          <>
            <div className="p-4 rounded-lg bg-amber-500/10 mb-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              <p className="text-sm text-amber-700 dark:text-amber-400">No payment PIN set. Secure your wallet by creating a PIN.</p>
            </div>
            <button onClick={() => { setShowSetPin(!showSetPin); setShowChangePin(false); setShowResetPin(false); setPinError(null); setPinSuccess(null); }}
              className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700">Set Payment PIN</button>
          </>
        )}

        {/* Set PIN form */}
        {showSetPin && (
          <form onSubmit={handleSetPin} className="mt-4 space-y-3">
            <div className="relative">
              <input type={showPin ? 'text' : 'password'} value={newPin} onChange={e => setNewPin(e.target.value)}
                placeholder="New PIN (4-8 digits)" inputMode="numeric" maxLength={8}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              <button type="button" onClick={() => setShowPin(!showPin)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <input type={showPin ? 'text' : 'password'} value={confirmPin} onChange={e => setConfirmPin(e.target.value)}
              placeholder="Confirm PIN" inputMode="numeric" maxLength={8}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            <div className="flex gap-2">
              <button type="submit" disabled={pinLoading} className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50">{pinLoading ? 'Setting...' : 'Set PIN'}</button>
              <button type="button" onClick={() => { setShowSetPin(false); setNewPin(''); setConfirmPin(''); setPinError(null); }} className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm text-gray-600">Cancel</button>
            </div>
          </form>
        )}

        {/* Change PIN form */}
        {showChangePin && (
          <form onSubmit={handleChangePin} className="mt-4 space-y-3">
            <input type={showPin ? 'text' : 'password'} value={currentPin} onChange={e => setCurrentPin(e.target.value)}
              placeholder="Current PIN" inputMode="numeric" maxLength={8}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            <input type={showPin ? 'text' : 'password'} value={newPin} onChange={e => setNewPin(e.target.value)}
              placeholder="New PIN" inputMode="numeric" maxLength={8}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            <input type={showPin ? 'text' : 'password'} value={confirmPin} onChange={e => setConfirmPin(e.target.value)}
              placeholder="Confirm new PIN" inputMode="numeric" maxLength={8}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            <div className="flex gap-2">
              <button type="submit" disabled={pinLoading} className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50">{pinLoading ? 'Changing...' : 'Change PIN'}</button>
              <button type="button" onClick={() => { setShowChangePin(false); setCurrentPin(''); setNewPin(''); setConfirmPin(''); setPinError(null); }} className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm text-gray-600">Cancel</button>
            </div>
          </form>
        )}

        {/* Reset PIN form */}
        {showResetPin && (
          <div className="mt-4 space-y-3">
            {!resetToken ? (
              <button onClick={handleRequestReset} disabled={pinLoading}
                className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-50">
                {pinLoading ? 'Generating...' : 'Generate Recovery Token'}
              </button>
            ) : (
              <form onSubmit={handleResetPin} className="space-y-3">
                <p className="text-xs text-gray-500">Recovery token generated. Use it to reset your PIN.</p>
                <input type="text" value={resetToken} readOnly className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-xs font-mono" />
                <input type={showPin ? 'text' : 'password'} value={newPin} onChange={e => setNewPin(e.target.value)}
                  placeholder="New PIN" inputMode="numeric" maxLength={8}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                <input type={showPin ? 'text' : 'password'} value={confirmPin} onChange={e => setConfirmPin(e.target.value)}
                  placeholder="Confirm new PIN" inputMode="numeric" maxLength={8}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                <div className="flex gap-2">
                  <button type="submit" disabled={pinLoading} className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50">{pinLoading ? 'Resetting...' : 'Reset PIN'}</button>
                  <button type="button" onClick={() => { setShowResetPin(false); setResetToken(''); setNewPin(''); setConfirmPin(''); setPinError(null); }} className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm text-gray-600">Cancel</button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Recovery codes modal */}
      <RecoveryCodes open={showRecoveryCodes} userId={user.id} onClose={() => setShowRecoveryCodes(false)} />

      {/* Login history */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2"><Activity className="w-5 h-5 text-primary" /> Login History</h3>
          <button onClick={refetch} className="text-xs text-gray-500 hover:text-primary-600">Refresh</button>
        </div>
        {historyLoading ? (
          <div className="flex items-center justify-center py-6">
            <div className="w-8 h-8 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          </div>
        ) : history.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No login history yet.</p>
        ) : (
          <div className="space-y-2">
            {history.map(h => {
              const Icon = eventIcons[h.event_type] || Activity;
              const iconColor = h.success ? 'text-emerald-500' : 'text-red-500';
              return (
                <div key={h.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/30">
                  <Icon className={`w-4 h-4 shrink-0 ${iconColor}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium capitalize">{h.event_type.replace(/_/g, ' ')}</p>
                    {h.reason && <p className="text-xs text-gray-400 truncate">{h.reason}</p>}
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{new Date(h.created_at).toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
