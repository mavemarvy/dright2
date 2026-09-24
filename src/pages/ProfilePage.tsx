import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  User,
  Mail,
  Phone,
  CreditCard,
  LogOut,
  Edit2,
  Check,
  ChevronRight,
  Wallet,
  ArrowUpRight,
  Shield,
  Loader2,
  History,
  ShieldAlert,
  Camera,
  X,
  MapPin,
  Users,
  Settings as SettingsGear,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { supabase } from '../lib/supabase';
import SalesTeamSection from '../components/SalesTeamSection';
import ProfileProgressOverview from '../components/profile/ProfileProgressOverview';
import { useFollowStats, useFriendsCount } from '../lib/socialHooks';
import {
  getWalletSummary,
  getOrCreateWallet,
  type WalletSummary as TWalletSummary,
} from '../lib/walletEngine';
import { fetchBankAccounts, type BankAccount } from '../lib/bankAccounts';

interface WithdrawalRequest {
  id: string;
  amount: number;
  payment_method: string | null;
  status: string;
  created_at: string;
  admin_notes: string | null;
  reference?: string | null;
  bank_account_id?: string | null;
}

export default function ProfilePage() {
  const { user, profile, signOut, refreshProfile, isAdmin, isAccountLocked, isAccountBanned } = useAuth();
  const navigate = useNavigate();
  const { format: formatWithCurrency } = useCurrency();
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [walletSummary, setWalletSummary] = useState<TWalletSummary | null>(null);
  const [payoutAccount, setPayoutAccount] = useState<BankAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({
    full_name: '',
    phone: '',
    location: '',
    preferred_currency: 'USD',
  });
  const [saving, setSaving] = useState(false);

  // Social stats
  const { followers, following } = useFollowStats(user?.id);
  const { friends } = useFriendsCount(user?.id);

  // Marketer registration state
  const [showMarketerForm, setShowMarketerForm] = useState(false);
  const [socialLinks, setSocialLinks] = useState<string[]>(['']);
  const [marketerSubmitting, setMarketerSubmitting] = useState(false);
  const [marketerError, setMarketerError] = useState<string | null>(null);
  const [marketerSuccess, setMarketerSuccess] = useState(false);

  // Avatar upload state
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarToast, setAvatarToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Advertiser application state
  const [advertiserSubmitting, setAdvertiserSubmitting] = useState(false);
  const [advertiserError, setAdvertiserError] = useState<string | null>(null);
  const [advertiserSuccess, setAdvertiserSuccess] = useState(false);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  useEffect(() => {
    if (profile) {
      setFormData({
        full_name: profile.full_name || '',
        phone: profile.phone || '',
        location: profile.location || '',
        preferred_currency: profile.preferred_currency || 'USD',
      });
    }
  }, [profile]);

  const fetchData = async () => {
    if (!user?.id) return;
    try {
      await getOrCreateWallet(user.id);

      const [{ data: withdrawalData }, summary, bankAccounts] = await Promise.all([
        supabase
          .from('withdrawal_requests')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(10),
        getWalletSummary(user.id),
        fetchBankAccounts(user.id),
      ]);

      if (withdrawalData) {
        setWithdrawals(withdrawalData as WithdrawalRequest[]);
      }
      setWalletSummary(summary);

      const verifiedAccounts = bankAccounts.filter(
        (account) => account.is_verified && account.verification_status === 'verified'
      );
      setPayoutAccount(
        verifiedAccounts.find((account) => account.is_default) ||
        verifiedAccounts[0] ||
        null
      );
    } catch (error) {
      console.error('Error fetching profile wallet data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({
          full_name: formData.full_name,
          phone: formData.phone || null,
          location: formData.location || null,
        })
        .eq('id', user?.id);

      if (error) throw error;
      await refreshProfile();
      setEditing(false);
    } catch (error) {
      console.error('Error updating profile:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setAvatarToast({ type: 'error', message: 'Image must be under 5MB' });
      return;
    }
    if (!file.type.startsWith('image/')) {
      setAvatarToast({ type: 'error', message: 'Please select an image file' });
      return;
    }
    setAvatarFile(file);
    setAvatarToast(null);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleAvatarSave = async () => {
    if (!avatarFile || !user) return;
    setAvatarUploading(true);
    setAvatarToast(null);
    try {
      const ext = avatarFile.name.split('.').pop();
      const path = `${user.id}/avatar_${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(path, avatarFile, { upsert: true });
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = urlData.publicUrl;
      const { error: updateErr } = await supabase
        .from('users')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);
      if (updateErr) throw updateErr;
      await refreshProfile();
      setAvatarToast({ type: 'success', message: 'Profile picture updated!' });
      setAvatarFile(null);
      setAvatarPreview(null);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    } catch (err) {
      console.error('Avatar upload error:', err);
      setAvatarToast({ type: 'error', message: 'Failed to upload image. Please try again.' });
    } finally {
      setAvatarUploading(false);
      setTimeout(() => setAvatarToast(null), 4000);
    }
  };

  const handleAvatarCancel = () => {
    setAvatarFile(null);
    setAvatarPreview(null);
    setAvatarToast(null);
    if (avatarInputRef.current) avatarInputRef.current.value = '';
  };

  const getInitials = () => {
    if (profile?.full_name) {
      return profile.full_name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    return profile?.email?.[0]?.toUpperCase() || 'P';
  };

  const walletCurrency = walletSummary?.currency || 'NGN';
  const availableBalance = Number(walletSummary?.balance || 0);
  const formatWalletAmount = (amount: number) => formatWithCurrency(amount, walletCurrency);
  const formatWithdrawalAmount = (withdrawal: WithdrawalRequest) => {
    const isSecureWalletWithdrawal = Boolean(
      withdrawal.bank_account_id ||
      withdrawal.reference?.startsWith('WDL-')
    );
    return formatWithCurrency(
      withdrawal.amount,
      isSecureWalletWithdrawal ? 'NGN' : 'USD'
    );
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  const getStatusStyles = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-success-muted text-success';
      case 'approved':
        return 'bg-primary-100 text-primary-600';
      case 'rejected':
        return 'bg-error-muted text-error';
      default:
        return 'bg-warning-muted text-warning';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Profile</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Manage your account settings</p>
      </div>

      {/* Account Status Banner */}
      {(isAccountLocked || isAccountBanned) && (
        <div className={`rounded-2xl p-4 mb-6 flex items-center gap-3 ${isAccountBanned ? 'bg-error-muted border border-error/20' : 'bg-warning-muted border border-warning/20'}`}>
          <ShieldAlert className={`w-5 h-5 ${isAccountBanned ? 'text-error' : 'text-warning'}`} />
          <p className={`text-sm font-medium ${isAccountBanned ? 'text-error' : 'text-warning'}`}>
            {isAccountBanned
              ? 'Your account is BANNED. Most actions are disabled. You can submit an appeal from the sign-in page.'
              : 'Your account is LOCKED. Withdrawals and new contracts are temporarily disabled.'}
          </p>
        </div>
      )}

      {/* Balance Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-success to-green-600 rounded-2xl p-6 text-white mb-6 shadow-lg"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-green-100 text-sm">Available Balance</p>
            <p className="text-4xl font-bold">{formatWalletAmount(availableBalance)}</p>
            <p className="text-[11px] text-green-100/80 mt-1">Live wallet ledger balance</p>
          </div>
          <div className="p-3 bg-white dark:bg-gray-800/20 rounded-xl">
            <Wallet className="w-8 h-8" />
          </div>
        </div>
        <button
          onClick={() => navigate('/wallet/withdraw')}
          disabled={availableBalance <= 0 || isAccountLocked || isAccountBanned || walletSummary?.is_frozen === true}
          className="w-full py-3 bg-white dark:bg-gray-800 text-success rounded-xl font-semibold hover:bg-green-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]"
        >
          <ArrowUpRight className="w-5 h-5" />
          Withdraw with Verified Account
        </button>
      </motion.div>

      {/* Withdrawal History */}
      {withdrawals.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6 overflow-hidden"
        >
          <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
            <History className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Withdrawal History</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {withdrawals.map((w) => (
              <div key={w.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{formatWithdrawalAmount(w)}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(w.created_at)}</p>
                </div>
                <div className="text-right flex items-center gap-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusStyles(w.status)}`}>
                    {w.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Social Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="grid grid-cols-3 gap-3 mb-6"
        data-tour="profile-social"
      >
        <Link to={`/followers/${user?.id}`} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 text-center hover:shadow-md transition-shadow">
          <Users className="w-5 h-5 text-indigo-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{followers.toLocaleString()}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Followers</p>
        </Link>
        <Link to={`/following/${user?.id}`} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 text-center hover:shadow-md transition-shadow">
          <Users className="w-5 h-5 text-purple-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{following.toLocaleString()}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Following</p>
        </Link>
        <Link to={`/friends/${user?.id}`} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 text-center hover:shadow-md transition-shadow">
          <Users className="w-5 h-5 text-pink-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{friends.toLocaleString()}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Friends</p>
        </Link>
      </motion.div>

      {/* Settings Link */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-6"
      >
        <Link
          data-tour="profile-settings"
          to="/settings"
          className="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 hover:shadow-md transition-shadow"
        >
          <div className="p-3 bg-primary-50 rounded-xl">
            <SettingsGear className="w-6 h-6 text-primary-600" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-gray-900 dark:text-gray-100">Settings</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Profile, account, payment PIN, privacy & notifications</p>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-400 dark:text-gray-500" />
        </Link>
      </motion.div>

      {/* Admin Link - only for admins */}
      {isAdmin && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6"
        >
          <Link
            to="/admin"
            className="flex items-center gap-3 bg-warning-muted border-2 border-warning rounded-2xl p-4 hover:bg-warning-muted/80 transition-colors"
          >
            <div className="p-3 bg-warning rounded-xl">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900 dark:text-gray-100">Admin Dashboard</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Manage products, verifications, and payouts</p>
            </div>
            <ChevronRight className="w-5 h-5 text-warning" />
          </Link>
        </motion.div>
      )}

      {/* Profile Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden mb-6"
        data-tour="profile-card"
      >
        {/* Profile Header */}
        <div className="bg-gradient-to-br from-primary-600 via-primary-500 to-primary-400 p-6">
          <div className="flex items-center gap-4">
            <div className="relative group">
              <div className="w-16 h-16 rounded-full flex items-center justify-center overflow-hidden bg-white dark:bg-gray-800/20 ring-2 ring-white/30">
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
                className="absolute -bottom-1 -right-1 w-7 h-7 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
                title="Change profile picture"
              >
                <Camera className="w-4 h-4 text-primary-600" />
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarSelect}
                className="hidden"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white">
                  {profile?.full_name || 'Promoter'}
                </h2>
                {isAdmin && (
                  <span className="px-2 py-0.5 text-xs font-bold bg-warning rounded text-gray-900 dark:text-gray-100">
                    ADMIN
                  </span>
                )}
              </div>
              <p className="text-primary-100">{profile?.email}</p>
            </div>
          </div>

          {/* Avatar preview actions */}
          {avatarPreview && (
            <div className="mt-4 flex items-center gap-3 bg-white dark:bg-gray-800/10 rounded-xl p-3">
              <p className="text-sm text-white flex-1">Save this new profile picture?</p>
              <button
                onClick={handleAvatarSave}
                disabled={avatarUploading}
                className="px-4 py-2 bg-white dark:bg-gray-800 text-primary-600 rounded-lg font-semibold text-sm hover:bg-primary-50 transition-colors flex items-center gap-2 min-h-[40px] disabled:opacity-50"
              >
                {avatarUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save
              </button>
              <button
                onClick={handleAvatarCancel}
                disabled={avatarUploading}
                className="px-4 py-2 bg-white dark:bg-gray-800/20 text-white rounded-lg font-semibold text-sm hover:bg-white dark:bg-gray-800/30 transition-colors flex items-center gap-2 min-h-[40px] disabled:opacity-50"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            </div>
          )}

          {/* Avatar toast */}
          {avatarToast && (
            <div className={`mt-3 px-4 py-2 rounded-lg text-sm font-medium ${
              avatarToast.type === 'success' ? 'bg-success/20 text-white' : 'bg-error/20 text-white'
            }`}>
              {avatarToast.message}
            </div>
          )}
        </div>

        {/* Profile Details */}
        <div className="p-6">
          {editing ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <User className="w-4 h-4 inline mr-2" />
                  Full Name
                </label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all text-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <Phone className="w-4 h-4 inline mr-2" />
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all text-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <MapPin className="w-4 h-4 inline mr-2" />
                  Location
                </label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="City, State, Country"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all text-gray-900 dark:text-gray-100"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 min-h-[48px]"
                >
                  {saving ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Check className="w-5 h-5" />
                      Save Changes
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    setEditing(false);
                    setFormData({
                      full_name: profile?.full_name || '',
                      phone: profile?.phone || '',
                      location: profile?.location || '',
                      preferred_currency: profile?.preferred_currency || 'USD',
                    });
                  }}
                  className="px-6 py-3 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:bg-gray-900/50 rounded-xl font-medium transition-colors min-h-[48px]"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <Mail className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Email</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{profile?.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <Phone className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Phone</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {profile?.phone || 'Not set'}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <CreditCard className="w-5 h-5 text-gray-400 dark:text-gray-500 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-gray-500 dark:text-gray-400">Verified Payout Account</p>
                    {payoutAccount && (
                      <span className="text-[10px] font-semibold text-success bg-success-muted px-2 py-0.5 rounded-full">Verified</span>
                    )}
                  </div>
                  {payoutAccount ? (
                    <>
                      <p className="font-semibold text-gray-900 dark:text-gray-100 mt-1 truncate">{payoutAccount.bank_name}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-300 truncate">{payoutAccount.account_name}</p>
                      <p className="text-xs font-mono text-gray-500 dark:text-gray-400 mt-0.5">
                        ••••••{payoutAccount.account_number.slice(-4)}
                      </p>
                    </>
                  ) : (
                    <p className="font-medium text-gray-900 dark:text-gray-100 mt-1">Not set</p>
                  )}
                  <Link
                    to="/wallet/withdraw"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:text-primary-700 mt-2"
                  >
                    {payoutAccount ? 'Manage payout accounts' : 'Add verified payout account'}
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>

              <div className="flex items-center gap-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <MapPin className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                <div className="flex-1 flex items-center justify-between gap-3">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Location</span>
                  <span className={`font-medium text-right ${profile?.location_verified ? 'text-success' : 'text-gray-900 dark:text-gray-100'}`}>
                    {profile?.location || 'Not set'}
                    {profile?.location_verified && (
                      <span className="ml-1.5 text-xs text-success bg-success-muted px-2 py-0.5 rounded-full">Verified</span>
                    )}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setEditing(true)}
                className="w-full py-3 text-primary-600 hover:bg-primary-50 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 mt-4"
              >
                <Edit2 className="w-4 h-4" />
                Edit Profile
              </button>
            </div>
          )}
        </div>
      </motion.div>

      <ProfileProgressOverview />

      {/* Sales Team: Marketer & Advertiser Section */}
      <SalesTeamSection
        profile={profile}
        socialLinks={socialLinks}
        setSocialLinks={setSocialLinks}
        showMarketerForm={showMarketerForm}
        setShowMarketerForm={setShowMarketerForm}
        marketerSubmitting={marketerSubmitting}
        marketerError={marketerError}
        marketerSuccess={marketerSuccess}
        setMarketerError={setMarketerError}
        setMarketerSuccess={setMarketerSuccess}
        setMarketerSubmitting={setMarketerSubmitting}
        advertiserSubmitting={advertiserSubmitting}
        advertiserError={advertiserError}
        advertiserSuccess={advertiserSuccess}
        setAdvertiserError={setAdvertiserError}
        setAdvertiserSuccess={setAdvertiserSuccess}
        setAdvertiserSubmitting={setAdvertiserSubmitting}
        refreshProfile={refreshProfile}
      />

      {/* Withdrawal Request Modal */}
      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        onClick={signOut}
        className="w-full bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 hover:bg-error-muted hover:border-error/20 transition-colors flex items-center justify-center gap-3 text-error font-semibold"
      >
        <LogOut className="w-5 h-5" />
        Sign Out
      </motion.button>


    </div>
  );
}
