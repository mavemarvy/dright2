import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
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
  DollarSign,
  ArrowUpRight,
  Shield,
  AlertCircle,
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
import { useFollowStats, useFriendsCount } from '../lib/socialHooks';

interface WithdrawalRequest {
  id: string;
  amount: number;
  payment_method: string | null;
  status: string;
  created_at: string;
  admin_notes: string | null;
}

export default function ProfilePage() {
  const { user, profile, signOut, refreshProfile, isAdmin, isAccountLocked, isAccountBanned } = useAuth();
  const { format: formatWithCurrency } = useCurrency();
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({
    full_name: '',
    phone: '',
    account_number: '',
    location: '',
    preferred_currency: 'USD',
  });
  const [saving, setSaving] = useState(false);

  // Withdrawal state
  const [showWithdrawalForm, setShowWithdrawalForm] = useState(false);
  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer');
  const [accountDetails, setAccountDetails] = useState('');
  const [withdrawalError, setWithdrawalError] = useState<string | null>(null);
  const [withdrawalSuccess, setWithdrawalSuccess] = useState(false);
  const [submittingWithdrawal, setSubmittingWithdrawal] = useState(false);

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
        account_number: profile.account_number || '',
        location: profile.location || '',
        preferred_currency: profile.preferred_currency || 'USD',
      });
    }
  }, [profile]);

  const fetchData = async () => {
    try {
      // Fetch withdrawal requests
      const { data: withdrawalData } = await supabase
        .from('withdrawal_requests')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (withdrawalData) {
        setWithdrawals(withdrawalData as WithdrawalRequest[]);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
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
          account_number: formData.account_number || null,
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

  const handleWithdrawalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setWithdrawalError(null);

    if (isAccountLocked || isAccountBanned) {
      setWithdrawalError('Your account is restricted. Withdrawals are disabled.');
      return;
    }

    const amount = parseFloat(withdrawalAmount);
    if (isNaN(amount) || amount <= 0) {
      setWithdrawalError('Enter a valid amount');
      return;
    }

    if (amount > (profile?.balance || 0)) {
      setWithdrawalError('Amount exceeds your available balance');
      return;
    }

    if (!accountDetails.trim()) {
      setWithdrawalError('Enter your payment account details');
      return;
    }

    setSubmittingWithdrawal(true);
    try {
      const { error } = await supabase.from('withdrawal_requests').insert({
        user_id: user?.id,
        amount,
        payment_method: paymentMethod,
        account_details: accountDetails.trim(),
      });

      if (error) throw error;

      // Notify admins about new withdrawal request
      // Get all active admins
      const { data: admins } = await supabase
        .from('users')
        .select('id')
        .eq('is_admin', true)
        .eq('admin_status', 'active');

      if (admins && admins.length > 0) {
        const adminIds = admins.map(a => a.id);
        const { emitEventBatch } = await import('../lib/notificationEvents');
        await emitEventBatch({
          module: 'wallet',
          eventType: 'withdrawal_requested',
          recipientIds: adminIds,
          actorId: user?.id,
          metadata: {
            amount: amount,
            currency: '$',
            reference: `withdrawal-${Date.now()}`,
          },
        });
      }

      setWithdrawalSuccess(true);
      setWithdrawalAmount('');
      setAccountDetails('');
      setTimeout(() => {
        setShowWithdrawalForm(false);
        setWithdrawalSuccess(false);
        fetchData();
      }, 2000);
    } catch (error) {
      console.error('Error submitting withdrawal:', error);
      setWithdrawalError('Failed to submit request. Please try again.');
    } finally {
      setSubmittingWithdrawal(false);
    }
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

  const formatCurrency = (amount: number) => formatWithCurrency(amount, 'USD');

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
            <p className="text-4xl font-bold">{formatCurrency(profile?.balance || 0)}</p>
          </div>
          <div className="p-3 bg-white dark:bg-gray-800/20 rounded-xl">
            <Wallet className="w-8 h-8" />
          </div>
        </div>
        <button
          onClick={() => setShowWithdrawalForm(true)}
          disabled={(profile?.balance || 0) <= 0 || isAccountLocked || isAccountBanned}
          className="w-full py-3 bg-white dark:bg-gray-800 text-success rounded-xl font-semibold hover:bg-green-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]"
        >
          <ArrowUpRight className="w-5 h-5" />
          Request Withdrawal
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
                  <p className="font-medium text-gray-900 dark:text-gray-100">{formatCurrency(w.amount)}</p>
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
                  <CreditCard className="w-4 h-4 inline mr-2" />
                  Account/Payout Number
                </label>
                <input
                  type="text"
                  value={formData.account_number}
                  onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
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
                      account_number: profile?.account_number || '',
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

              <div className="flex items-center gap-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <CreditCard className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Payout Account</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {profile?.account_number || 'Not set'}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                      <MapPin className="w-4 h-4" /> Location
                    </span>
                    <span className={`font-medium ${profile?.location_verified ? 'text-success' : 'text-gray-900 dark:text-gray-100'}`}>
                      {profile?.location || 'Not set'}
                      {profile?.location_verified && (
                        <span className="ml-1.5 text-xs text-success bg-success-muted px-2 py-0.5 rounded-full">Verified</span>
                      )}
                    </span>
                  </div>
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

      {/* Withdrawal Request Modal */}
      <AnimatePresence>
        {showWithdrawalForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowWithdrawalForm(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-success-muted rounded-xl">
                  <Wallet className="w-6 h-6 text-success" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-gray-100">Request Withdrawal</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Available: {formatCurrency(profile?.balance || 0)}</p>
                </div>
              </div>

              {withdrawalError && (
                <div className="bg-error-muted text-error rounded-xl p-3 mb-4 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  {withdrawalError}
                </div>
              )}

              {withdrawalSuccess && (
                <div className="bg-success-muted text-success rounded-xl p-4 mb-4">
                  Withdrawal request submitted! An admin will review it shortly.
                </div>
              )}

              <form onSubmit={handleWithdrawalSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Amount (USD)
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      max={profile?.balance || 0}
                      value={withdrawalAmount}
                      onChange={(e) => setWithdrawalAmount(e.target.value)}
                      placeholder="0.00"
                      required
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all text-gray-900 dark:text-gray-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Payment Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all text-gray-900 dark:text-gray-100"
                  >
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="paypal">PayPal</option>
                    <option value="mobile_money">Mobile Money</option>
                    <option value="crypto">Cryptocurrency</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Account Details
                  </label>
                  <textarea
                    value={accountDetails}
                    onChange={(e) => setAccountDetails(e.target.value)}
                    placeholder="Enter your account number, PayPal email, wallet address, etc."
                    rows={2}
                    required
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all text-gray-900 dark:text-gray-100 resize-none"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowWithdrawalForm(false)}
                    className="flex-1 py-3 border border-gray-200 dark:border-gray-700 rounded-xl font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:bg-gray-900/50 transition-colors min-h-[48px]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingWithdrawal}
                    className="flex-1 py-3 bg-success text-white rounded-xl font-semibold hover:bg-green-700 transition-colors disabled:opacity-50 min-h-[48px] flex items-center justify-center"
                  >
                    {submittingWithdrawal ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      'Submit Request'
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
