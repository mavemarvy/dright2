import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings as SettingsIcon,
  User,
  Lock,
  Shield,
  Bell,
  Globe,
  Eye,
  EyeOff,
  Check,
  ChevronRight,
  Loader2,
  KeyRound,
  Mail,
  Phone,
  MapPin,
  Camera,
  DollarSign,
  AlertCircle,
  CheckCircle,
  Users,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { supabase } from '../lib/supabase';
import { SUPPORTED_CURRENCIES } from '../lib/currency';
import {
  getSecurityStatus,
  setPin,
  changePin,
  verifyPin,
  type PaymentSecurityStatus,
} from '../lib/paymentSecurity';
import RecoveryCodes from '../components/RecoveryCodes';
import UserVerificationSection from '../components/UserVerificationSection';
import PayoutMethodManager from '../components/PayoutMethodManager';

type Tab = 'profile' | 'account' | 'payment' | 'payouts' | 'privacy' | 'notifications' | 'verification';

const TABS: { key: Tab; label: string; icon: typeof User }[] = [
  { key: 'profile', label: 'Profile', icon: User },
  { key: 'account', label: 'Account', icon: Lock },
  { key: 'payment', label: 'Payment PIN', icon: KeyRound },
  { key: 'payouts', label: 'Payout Methods', icon: DollarSign },
  { key: 'verification', label: 'Verification', icon: Shield },
  { key: 'privacy', label: 'Privacy', icon: Shield },
  { key: 'notifications', label: 'Notifications', icon: Bell },
];

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('profile');

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <SettingsIcon className="w-7 h-7 text-primary-600" />
          Settings
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Manage your account, privacy, and security</p>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-medium whitespace-nowrap transition-colors ${
              tab === t.key
                ? 'border-b-2 border-primary-500 text-primary-600'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {tab === 'profile' && <ProfileTab />}
          {tab === 'account' && <AccountTab />}
          {tab === 'payment' && <PaymentPinTab />}
          {tab === 'payouts' && <PayoutMethodsTab />}
          {tab === 'verification' && <UserVerificationSection />}
          {tab === 'privacy' && <PrivacyTab />}
          {tab === 'notifications' && <NotificationsTab />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ─── Profile Tab ───────────────────────────────────────────────────────────────

function ProfileTab() {
  const { user, profile, refreshProfile } = useAuth();
  const { setCurrency } = useCurrency();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [formData, setFormData] = useState({
    full_name: '',
    phone: '',
    account_number: '',
    location: '',
    preferred_currency: 'USD',
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile) {
      setFormData({
        full_name: profile.full_name || '',
        phone: profile.phone || '',
        account_number: profile.account_number || '',
        location: profile.location || '',
        preferred_currency: profile.preferred_currency || 'USD',
      });
    }
  }, [profile]);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({
          full_name: formData.full_name,
          phone: formData.phone || null,
          account_number: formData.account_number || null,
          location: formData.location || null,
          preferred_currency: formData.preferred_currency,
        })
        .eq('id', user?.id);
      if (error) throw error;
      setCurrency(formData.preferred_currency);
      await refreshProfile();
      setEditing(false);
      showToast('success', 'Profile updated successfully');
    } catch {
      showToast('error', 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showToast('error', 'Image must be under 5MB'); return; }
    if (!file.type.startsWith('image/')) { showToast('error', 'Please select an image file'); return; }
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleAvatarSave = async () => {
    if (!avatarFile || !user) return;
    setAvatarUploading(true);
    try {
      const ext = avatarFile.name.split('.').pop();
      const path = `${user.id}/avatar_${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from('avatars').upload(path, avatarFile, { upsert: true });
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const { error: updateErr } = await supabase.from('users').update({ avatar_url: urlData.publicUrl }).eq('id', user.id);
      if (updateErr) throw updateErr;
      await refreshProfile();
      showToast('success', 'Profile picture updated');
      setAvatarFile(null);
      setAvatarPreview(null);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    } catch {
      showToast('error', 'Failed to upload image');
    } finally {
      setAvatarUploading(false);
    }
  };

  const getInitials = () => {
    if (profile?.full_name) return profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    return profile?.email?.[0]?.toUpperCase() || 'P';
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div className={`rounded-xl p-3 flex items-center gap-2 text-sm ${toast.type === 'success' ? 'bg-success-muted text-success' : 'bg-error-muted text-error'}`}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.message}
        </div>
      )}

      {/* Avatar + Name card */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="bg-gradient-to-br from-primary-600 via-primary-500 to-primary-400 p-6">
          <div className="flex items-center gap-4">
            <div className="relative group">
              <div className="w-16 h-16 rounded-full flex items-center justify-center overflow-hidden bg-white/20 ring-2 ring-white/30">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Preview" className="w-full h-full object-cover" />
                ) : profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile?.full_name || 'User'} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl font-bold text-white">{getInitials()}</span>
                )}
              </div>
              <button
                onClick={() => avatarInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 w-7 h-7 bg-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
              >
                <Camera className="w-4 h-4 text-primary-600" />
              </button>
              <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarSelect} className="hidden" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">{profile?.full_name || 'Promoter'}</h2>
              <p className="text-primary-100">{profile?.email}</p>
            </div>
          </div>
          {avatarPreview && (
            <div className="mt-4 flex items-center gap-3 bg-white/10 rounded-xl p-3">
              <p className="text-sm text-white flex-1">Save this new profile picture?</p>
              <button onClick={handleAvatarSave} disabled={avatarUploading} className="px-4 py-2 bg-white text-primary-600 rounded-lg font-semibold text-sm hover:bg-primary-50 flex items-center gap-2 disabled:opacity-50">
                {avatarUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save
              </button>
              <button onClick={() => { setAvatarFile(null); setAvatarPreview(null); if (avatarInputRef.current) avatarInputRef.current.value = ''; }} disabled={avatarUploading} className="px-4 py-2 bg-white/20 text-white rounded-lg font-semibold text-sm hover:bg-white/30">
                Cancel
              </button>
            </div>
          )}
        </div>

        <div className="p-6">
          {editing ? (
            <div className="space-y-4">
              <Field label="Full Name" icon={User}>
                <input type="text" value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} className="input-base" />
              </Field>
              <Field label="Phone Number" icon={Phone}>
                <input type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="input-base" />
              </Field>
              <Field label="Payout Account Number" icon={DollarSign}>
                <input type="text" value={formData.account_number} onChange={(e) => setFormData({ ...formData, account_number: e.target.value })} className="input-base" />
              </Field>
              <Field label="Location" icon={MapPin}>
                <input type="text" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} placeholder="City, State, Country" className="input-base" />
              </Field>
              <Field label="Preferred Currency" icon={DollarSign}>
                <select value={formData.preferred_currency} onChange={(e) => setFormData({ ...formData, preferred_currency: e.target.value })} className="input-base bg-white dark:bg-gray-800">
                  {SUPPORTED_CURRENCIES.map(curr => <option key={curr.code} value={curr.code}>{curr.label}</option>)}
                </select>
              </Field>
              <div className="flex gap-3 pt-2">
                <button onClick={handleSave} disabled={saving} className="flex-1 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
                  {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Check className="w-5 h-5" /> Save Changes</>}
                </button>
                <button onClick={() => { setEditing(false); setFormData({ full_name: profile?.full_name || '', phone: profile?.phone || '', account_number: profile?.account_number || '', location: profile?.location || '', preferred_currency: profile?.preferred_currency || 'USD' }); }} className="px-6 py-3 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900/50 rounded-xl font-medium">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <InfoRow icon={Mail} label="Email" value={profile?.email || 'Not set'} />
              <InfoRow icon={Phone} label="Phone" value={profile?.phone || 'Not set'} />
              <InfoRow icon={DollarSign} label="Payout Account" value={profile?.account_number || 'Not set'} />
              <InfoRow icon={MapPin} label="Location" value={profile?.location || 'Not set'} />
              <InfoRow icon={DollarSign} label="Currency" value={profile?.preferred_currency || 'USD'} />
              <button onClick={() => setEditing(true)} className="w-full py-3 text-primary-600 hover:bg-primary-50 rounded-xl font-medium flex items-center justify-center gap-2 mt-2">
                <SettingsIcon className="w-4 h-4" /> Edit Profile
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Account Tab ───────────────────────────────────────────────────────────────

function AccountTab() {
  const { user, profile, signOut, updatePassword, refreshProfile, isEmailVerified, isAccountLocked, isAccountBanned } = useAuth();
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [locationToast, setLocationToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    if (newPassword.length < 8) { setPasswordError('Password must be at least 8 characters'); return; }
    if (newPassword !== confirmPassword) { setPasswordError('Passwords do not match'); return; }
    setChangingPassword(true);
    try {
      const { error } = await updatePassword(newPassword);
      if (error) throw error;
      setPasswordSuccess(true);
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => { setShowPasswordForm(false); setPasswordSuccess(false); }, 2000);
    } catch {
      setPasswordError('Failed to update password');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleVerifyLocation = async () => {
    if (!user || !profile?.location?.trim()) {
      setLocationToast({ type: 'error', message: 'Please enter your location in the Profile tab first' });
      return;
    }
    try {
      const { error } = await supabase.from('users').update({ location_verified: true }).eq('id', user.id);
      if (error) throw error;
      await refreshProfile();
      setLocationToast({ type: 'success', message: 'Location verified successfully!' });
      setTimeout(() => setLocationToast(null), 3000);
    } catch {
      setLocationToast({ type: 'error', message: 'Failed to verify location' });
    }
  };

  return (
    <div className="space-y-6">
      {(isAccountLocked || isAccountBanned) && (
        <div className={`rounded-2xl p-4 flex items-center gap-3 ${isAccountBanned ? 'bg-error-muted border border-error/20' : 'bg-warning-muted border border-warning/20'}`}>
          <AlertCircle className={`w-5 h-5 ${isAccountBanned ? 'text-error' : 'text-warning'}`} />
          <p className={`text-sm font-medium ${isAccountBanned ? 'text-error' : 'text-warning'}`}>
            {isAccountBanned ? 'Your account is BANNED. Most actions are disabled.' : 'Your account is LOCKED. Withdrawals are disabled.'}
          </p>
        </div>
      )}

      {/* Account Status */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Account Status</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2"><Mail className="w-4 h-4" /> Email Verification</span>
            <span className={`text-sm font-medium ${isEmailVerified ? 'text-success' : 'text-warning'}`}>
              {isEmailVerified ? 'Verified' : 'Not verified'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2"><Shield className="w-4 h-4" /> Account Status</span>
            <span className={`text-sm font-medium ${profile?.account_status === 'ACTIVE' ? 'text-success' : 'text-error'}`}>
              {profile?.account_status || 'Unknown'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2"><MapPin className="w-4 h-4" /> Location Verified</span>
            {profile?.location_verified ? (
              <span className="text-sm font-medium text-success">Verified</span>
            ) : (
              <button onClick={handleVerifyLocation} className="text-xs font-medium text-primary-600 hover:text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg px-3 py-1.5">
                Verify Now
              </button>
            )}
          </div>
        </div>
        {locationToast && (
          <div className={`mt-3 flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm ${locationToast.type === 'success' ? 'bg-success-muted text-success' : 'bg-error-muted text-error'}`}>
            {locationToast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {locationToast.message}
          </div>
        )}
      </div>

      {/* Change Password */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <button onClick={() => setShowPasswordForm(!showPasswordForm)} className="w-full flex items-center justify-between p-5 hover:bg-gray-50 dark:hover:bg-gray-900/50">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-xl"><Lock className="w-5 h-5 text-gray-600 dark:text-gray-300" /></div>
            <div className="text-left">
              <p className="font-medium text-gray-900 dark:text-gray-100">Change Password</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Update your account password</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-400 dark:text-gray-500" />
        </button>
        {showPasswordForm && (
          <form onSubmit={handlePasswordChange} className="p-5 border-t border-gray-100 dark:border-gray-700 space-y-4">
            {passwordError && <div className="bg-error-muted text-error rounded-xl p-3 text-sm">{passwordError}</div>}
            {passwordSuccess && <div className="bg-success-muted text-success rounded-xl p-3 text-sm">Password updated successfully!</div>}
            <Field label="New Password" icon={Lock}>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Enter new password" className="input-base" />
            </Field>
            <Field label="Confirm Password" icon={Lock}>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" className="input-base" />
            </Field>
            <button type="submit" disabled={changingPassword || !newPassword || !confirmPassword} className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
              {changingPassword ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Update Password'}
            </button>
          </form>
        )}
      </div>

      {/* Sign Out */}
      <button onClick={signOut} className="w-full bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 hover:bg-error-muted hover:border-error/20 flex items-center justify-center gap-3 text-error font-semibold">
        <LogOut className="w-5 h-5" /> Sign Out
      </button>
    </div>
  );
}

// ─── Payment PIN Tab ────────────────────────────────────────────────────────────

function PaymentPinTab() {
  const { user } = useAuth();
  const [pinStatus, setPinStatus] = useState<PaymentSecurityStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSetPin, setShowSetPin] = useState(false);
  const [showChangePin, setShowChangePin] = useState(false);
  const [showResetPin, setShowResetPin] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showRecoveryCodes, setShowRecoveryCodes] = useState(false);

  const loadStatus = useCallback(async () => {
    if (!user?.id) return;
    const status = await getSecurityStatus(user.id);
    setPinStatus(status);
  }, [user?.id]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const handleSetPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setSuccess(null);
    if (newPin !== confirmPin) { setError('PINs do not match'); return; }
    if (!user?.id) return;
    setLoading(true);
    const result = await setPin(user.id, newPin);
    setLoading(false);
    if (result.success) {
      setSuccess('Payment PIN set successfully');
      setShowSetPin(false); setNewPin(''); setConfirmPin('');
      loadStatus();
    } else setError(result.error || 'Failed to set PIN');
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setSuccess(null);
    if (newPin !== confirmPin) { setError('New PINs do not match'); return; }
    if (!user?.id) return;
    setLoading(true);
    const result = await changePin(user.id, currentPin, newPin);
    setLoading(false);
    if (result.success) {
      setSuccess('Payment PIN changed successfully');
      setShowChangePin(false); setCurrentPin(''); setNewPin(''); setConfirmPin('');
      loadStatus();
    } else setError(result.error || 'Failed to change PIN');
  };

  const handleResetPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setSuccess(null);
    if (newPin !== confirmPin) { setError('New PINs do not match'); return; }
    if (!user?.id) return;
    setLoading(true);
    const verifyResult = await verifyPin(user.id, currentPin, 'pin_reset');
    if (!verifyResult.success) { setError(verifyResult.error || 'Invalid current PIN'); setLoading(false); return; }
    const result = await setPin(user.id, newPin);
    setLoading(false);
    if (result.success) {
      setSuccess('Payment PIN reset successfully');
      setShowResetPin(false); setCurrentPin(''); setNewPin(''); setConfirmPin('');
      loadStatus();
    } else setError(result.error || 'Failed to reset PIN');
  };

  return (
    <div className="space-y-6">
      {error && <Toast type="error" message={error} />}
      {success && <Toast type="success" message={success} />}

      {/* PIN Status */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <div className="flex items-center gap-4 mb-4">
          <div className={`p-3 rounded-xl ${pinStatus?.has_pin ? 'bg-success-muted' : 'bg-warning-muted'}`}>
            <KeyRound className={`w-6 h-6 ${pinStatus?.has_pin ? 'text-success' : 'text-warning'}`} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Payment PIN</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {pinStatus?.has_pin ? 'PIN is active' : 'No PIN set — your wallet is unprotected'}
            </p>
          </div>
        </div>
        {pinStatus?.locked_until && (
          <div className="bg-error-muted text-error rounded-xl p-3 text-sm mb-4 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> PIN is locked until {new Date(pinStatus.locked_until).toLocaleString()}
          </div>
        )}
        <div className="flex gap-3 flex-wrap">
          {!pinStatus?.has_pin && (
            <button onClick={() => { setShowSetPin(true); setShowChangePin(false); setShowResetPin(false); }} className="px-4 py-2.5 bg-primary-600 text-white rounded-xl font-medium text-sm hover:bg-primary-700">
              Set PIN
            </button>
          )}
          {pinStatus?.has_pin && (
            <button onClick={() => { setShowChangePin(true); setShowSetPin(false); setShowResetPin(false); }} className="px-4 py-2.5 bg-primary-600 text-white rounded-xl font-medium text-sm hover:bg-primary-700">
              Change PIN
            </button>
          )}
          {pinStatus?.has_pin && (
            <button onClick={() => { setShowResetPin(true); setShowSetPin(false); setShowChangePin(false); }} className="px-4 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-medium text-sm hover:bg-gray-50 dark:hover:bg-gray-900/50">
              Reset PIN
            </button>
          )}
          <button onClick={() => setShowRecoveryCodes(!showRecoveryCodes)} className="px-4 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-medium text-sm hover:bg-gray-50 dark:hover:bg-gray-900/50">
            Recovery Codes
          </button>
        </div>
      </div>

      {/* Set PIN form */}
      {showSetPin && (
        <form onSubmit={handleSetPin} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Set Payment PIN</h3>
          <PinInput label="New PIN (4-6 digits)" value={newPin} onChange={setNewPin} show={showPin} onToggle={() => setShowPin(!showPin)} />
          <PinInput label="Confirm PIN" value={confirmPin} onChange={setConfirmPin} show={showPin} onToggle={() => setShowPin(!showPin)} />
          <button type="submit" disabled={loading} className="w-full py-3 bg-primary-600 text-white rounded-xl font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Set PIN'}
          </button>
        </form>
      )}

      {/* Change PIN form */}
      {showChangePin && (
        <form onSubmit={handleChangePin} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Change Payment PIN</h3>
          <PinInput label="Current PIN" value={currentPin} onChange={setCurrentPin} show={showPin} onToggle={() => setShowPin(!showPin)} />
          <PinInput label="New PIN" value={newPin} onChange={setNewPin} show={showPin} onToggle={() => setShowPin(!showPin)} />
          <PinInput label="Confirm New PIN" value={confirmPin} onChange={setConfirmPin} show={showPin} onToggle={() => setShowPin(!showPin)} />
          <button type="submit" disabled={loading} className="w-full py-3 bg-primary-600 text-white rounded-xl font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Change PIN'}
          </button>
        </form>
      )}

      {/* Reset PIN form */}
      {showResetPin && (
        <form onSubmit={handleResetPin} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Reset Payment PIN</h3>
          <PinInput label="Current PIN" value={currentPin} onChange={setCurrentPin} show={showPin} onToggle={() => setShowPin(!showPin)} />
          <PinInput label="New PIN" value={newPin} onChange={setNewPin} show={showPin} onToggle={() => setShowPin(!showPin)} />
          <PinInput label="Confirm New PIN" value={confirmPin} onChange={setConfirmPin} show={showPin} onToggle={() => setShowPin(!showPin)} />
          <button type="submit" disabled={loading} className="w-full py-3 bg-primary-600 text-white rounded-xl font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Reset PIN'}
          </button>
        </form>
      )}

      {/* Recovery Codes */}
      {showRecoveryCodes && <RecoveryCodes open={showRecoveryCodes} userId={user?.id || ''} onClose={() => setShowRecoveryCodes(false)} />}
    </div>
  );
}

// ─── Privacy Tab ───────────────────────────────────────────────────────────────

function PrivacyTab() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from('users')
        .select('privacy_profile, privacy_email, privacy_phone, privacy_followers, privacy_following, privacy_portfolio, privacy_analytics, privacy_activity, show_email, show_phone')
        .eq('id', user.id)
        .maybeSingle();
      if (data) setSettings(data as Record<string, string>);
    };
    load();
  }, [user]);

  const fields = [
    { key: 'privacy_profile', label: 'Profile Visibility', desc: 'Who can see your profile' },
    { key: 'privacy_email', label: 'Email Address', desc: 'Who can see your email' },
    { key: 'privacy_phone', label: 'Phone Number', desc: 'Who can see your phone number' },
    { key: 'privacy_followers', label: 'Followers List', desc: 'Who can see your followers' },
    { key: 'privacy_following', label: 'Following List', desc: 'Who can see who you follow' },
    { key: 'privacy_portfolio', label: 'Portfolio', desc: 'Who can see your portfolio' },
    { key: 'privacy_analytics', label: 'Analytics', desc: 'Who can see your analytics' },
    { key: 'privacy_activity', label: 'Activity Feed', desc: 'Who can see your activity' },
  ];

  const options = [
    { value: 'public', label: 'Public', icon: Globe },
    { value: 'followers_only', label: 'Followers', icon: Users },
    { value: 'private', label: 'Private', icon: Lock },
  ];

  const updatePrivacy = async (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaving(true);
    try {
      const updateData: Record<string, unknown> = { [key]: value };
      if (key === 'privacy_email') updateData.show_email = value === 'public';
      if (key === 'privacy_phone') updateData.show_phone = value === 'public';
      await supabase.from('users').update(updateData).eq('id', user?.id);
      setToast({ type: 'success', message: 'Privacy setting updated' });
      setTimeout(() => setToast(null), 2000);
    } catch {
      setToast({ type: 'error', message: 'Failed to update privacy setting' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div className={`rounded-xl p-3 flex items-center gap-2 text-sm ${toast.type === 'success' ? 'bg-success-muted text-success' : 'bg-error-muted text-error'}`}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.message}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-primary-600" />
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Privacy Controls</h3>
          {saving && <span className="text-xs text-gray-400 dark:text-gray-500">Saving...</span>}
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Control who can see your information. Set items to Public, Followers only, or Private.</p>
        <div className="space-y-4">
          {fields.map((f) => (
            <div key={f.key} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{f.label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{f.desc}</p>
              </div>
              <div className="flex gap-1">
                {options.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => updatePrivacy(f.key, o.value)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
                      settings[f.key] === o.value ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    <o.icon className="w-3 h-3" /> {o.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Notifications Tab ─────────────────────────────────────────────────────────

function NotificationsTab() {
  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="w-5 h-5 text-primary-600" />
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Notification Preferences</h3>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Choose which notifications you receive and how they are delivered.</p>
        <a href="/notification-preferences" className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-xl font-medium text-sm hover:bg-primary-700">
          <Bell className="w-4 h-4" /> Open Notification Settings
          <ChevronRight className="w-4 h-4" />
        </a>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-primary-600" />
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Security Center</h3>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">View your security score, login history, and manage account security.</p>
        <a href="/security" className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-medium text-sm hover:bg-gray-50 dark:hover:bg-gray-900/50">
          <Shield className="w-4 h-4" /> Open Security Center
          <ChevronRight className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}

// ─── Shared UI Components ──────────────────────────────────────────────────────

function Field({ label, icon: Icon, children }: { label: string; icon: typeof User; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        <Icon className="w-4 h-4 inline mr-2" />
        {label}
      </label>
      {children}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string }) {
  return (
    <div className="flex items-center gap-4 py-3 border-b border-gray-100 dark:border-gray-700 last:border-0">
      <Icon className="w-5 h-5 text-gray-400 dark:text-gray-500" />
      <div className="flex-1">
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
        <p className="font-medium text-gray-900 dark:text-gray-100">{value}</p>
      </div>
    </div>
  );
}

function PinInput({ label, value, onChange, show, onToggle }: { label: string; value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="Enter PIN"
          className="w-full px-4 py-3 pr-12 rounded-xl border border-gray-200 dark:border-gray-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none text-gray-900 dark:text-gray-100 text-lg tracking-widest"
        />
        <button type="button" onClick={onToggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
          {show ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
}

function PayoutMethodsTab() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
      <PayoutMethodManager />
    </div>
  );
}

function Toast({ type, message }: { type: 'success' | 'error'; message: string }) {
  return (
    <div className={`rounded-xl p-3 flex items-center gap-2 text-sm ${type === 'success' ? 'bg-success-muted text-success' : 'bg-error-muted text-error'}`}>
      {type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
      {message}
    </div>
  );
}
