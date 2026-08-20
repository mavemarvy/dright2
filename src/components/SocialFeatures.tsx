// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT Social Components — Profile Preview, Verification Badges, Achievements,
// Block/Report, Social Notifications, QR Share, Privacy Controls
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useFollow } from '../lib/socialHooks';
import { useAuth } from '../contexts/AuthContext';
import {
  UserPlus, CheckCircle, MessageCircle, Eye, Users, Star,
  Ban, Flag, X, QrCode, Copy, Share2, Shield, Award, Zap, TrendingUp,
  Mail, Phone, Building2, BadgeCheck, Crown, Sparkles, Lock, Globe,
  Bell, Settings,
} from 'lucide-react';

// ─── Profile Preview Card (hover/long-press) ──────────────────────────────────

export function ProfilePreviewCard({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPreview = useCallback(async () => {
    const { data } = await supabase
      .from('users')
      .select('id, full_name, username, avatar_url, is_verified, verification_level, bio, location, profession')
      .eq('id', userId)
      .maybeSingle();
    if (data) {
      const { count: followers } = await supabase.from('user_follows').select('*', { count: 'exact', head: true }).eq('following_id', userId);
      const { count: following } = await supabase.from('user_follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId);
      setData({ ...data, followers: followers || 0, following: following || 0 });
    }
  }, [userId]);

  const handleEnter = () => {
    timerRef.current = setTimeout(() => { setShow(true); fetchPreview(); }, 500);
  };
  const handleLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setTimeout(() => setShow(false), 200);
  };
  const handleLongPress = () => {
    setShow(true);
    fetchPreview();
  };

  return (
    <div className="relative inline-block" onMouseEnter={handleEnter} onMouseLeave={handleLeave} onContextMenu={(e) => { e.preventDefault(); handleLongPress(); }}>
      {children}
      {show && data && (
        <div className="absolute z-50 top-full left-0 mt-2 w-72 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-800 p-4">
          <div className="flex items-start gap-3">
            <Link to={`/profile/${userId}`} onClick={() => setShow(false)}>
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center overflow-hidden shrink-0">
                {data.avatar_url ? <img src={data.avatar_url as string} alt="" className="w-full h-full object-cover" /> : <span className="text-white font-medium">{String(data.full_name || 'U').charAt(0)}</span>}
              </div>
            </Link>
            <div className="flex-1 min-w-0">
              <Link to={`/profile/${userId}`} onClick={() => setShow(false)} className="flex items-center gap-1">
                <span className="font-medium text-gray-900 dark:text-white truncate">{String(data.full_name)}</span>
                {Boolean(data.is_verified) && <CheckCircle className="w-4 h-4 text-blue-500 shrink-0" />}
              </Link>
              <p className="text-xs text-gray-400">@{String(data.username)}</p>
              {data.profession ? <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{String(data.profession)}</p> : null}
            </div>
          </div>
          {data.bio ? <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 line-clamp-2">{String(data.bio)}</p> : null}
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
            <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {Number(data.followers).toLocaleString()}</span>
            <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {Number(data.following).toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <Link to={`/profile/${userId}`} onClick={() => setShow(false)} className="flex-1 text-center text-xs font-medium text-indigo-600 dark:text-indigo-400 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/20">View Profile</Link>
            <Link to={`/chat?user=${userId}`} className="text-xs font-medium text-gray-600 dark:text-gray-400 py-1.5 px-3 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center gap-1"><MessageCircle className="w-3 h-3" /> Message</Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Verification Badges ──────────────────────────────────────────────────────

const VERIFICATION_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; label: string }> = {
  email_verified: { icon: Mail, color: 'text-blue-500', label: 'Email Verified' },
  phone_verified: { icon: Phone, color: 'text-green-500', label: 'Phone Verified' },
  identity_verified: { icon: BadgeCheck, color: 'text-purple-500', label: 'Identity Verified' },
  business_verified: { icon: Building2, color: 'text-indigo-500', label: 'Business Verified' },
  creator_verified: { icon: Sparkles, color: 'text-pink-500', label: 'Creator Verified' },
  trusted_seller: { icon: Shield, color: 'text-emerald-500', label: 'Trusted Seller' },
  top_affiliate: { icon: TrendingUp, color: 'text-amber-500', label: 'Top Affiliate' },
  premium: { icon: Crown, color: 'text-yellow-500', label: 'Premium' },
};

export function VerificationBadges({ userId, size = 'sm' }: { userId: string; size?: 'xs' | 'sm' | 'md' }) {
  const [verifications, setVerifications] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('user_verifications').select('*').eq('user_id', userId).eq('status', 'approved');
      setVerifications(data || []);
    };
    load();
  }, [userId]);

  const iconSize = { xs: 'w-3 h-3', sm: 'w-4 h-4', md: 'w-5 h-5' };

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {verifications.map((v, i) => {
        const config = VERIFICATION_CONFIG[String(v.verification_type)];
        if (!config) return null;
        const Icon = config.icon;
        return (
          <span key={i} title={config.label} className={`inline-flex items-center gap-0.5 ${config.color}`}>
            <Icon className={iconSize[size]} />
          </span>
        );
      })}
    </div>
  );
}

export function VerificationBadge({ level, size = 'sm' }: { level: string; size?: 'xs' | 'sm' | 'md' }) {
  const config = VERIFICATION_CONFIG[level];
  if (!config) return null;
  const Icon = config.icon;
  const iconSize = { xs: 'w-3 h-3', sm: 'w-4 h-4', md: 'w-5 h-5' };
  return <span title={config.label}><Icon className={`${iconSize[size]} ${config.color}`} /></span>;
}

// ─── Achievement System ───────────────────────────────────────────────────────

const ACHIEVEMENT_ICONS: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
  first_sale: { icon: Zap, color: 'from-amber-400 to-orange-500' },
  first_referral: { icon: Users, color: 'from-purple-400 to-pink-500' },
  first_100_followers: { icon: Star, color: 'from-blue-400 to-cyan-500' },
  first_100k_revenue: { icon: Crown, color: 'from-yellow-400 to-amber-500' },
  top_creator: { icon: Sparkles, color: 'from-pink-400 to-rose-500' },
  top_seller: { icon: Award, color: 'from-indigo-400 to-purple-500' },
  rising_seller: { icon: TrendingUp, color: 'from-green-400 to-emerald-500' },
  marketplace_legend: { icon: Crown, color: 'from-yellow-400 to-orange-500' },
};

export function AchievementDisplay({ userId, compact = false }: { userId: string; compact?: boolean }) {
  const [achievements, setAchievements] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase.from('user_achievements').select('*').eq('user_id', userId).order('earned_at', { ascending: false }).limit(compact ? 6 : 20);
      setAchievements(data || []);
      setLoading(false);
    };
    load();
  }, [userId, compact]);

  if (loading) return null;
  if (!achievements.length) return null;

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        {achievements.map((a, i) => {
          const config = ACHIEVEMENT_ICONS[String(a.achievement_type)];
          if (!config) return null;
          const Icon = config.icon;
          return <span key={i} title={String(a.achievement_name)} className={`w-7 h-7 rounded-lg bg-gradient-to-br ${config.color} flex items-center justify-center`}><Icon className="w-4 h-4 text-white" /></span>;
        })}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {achievements.map((a, i) => {
        const config = ACHIEVEMENT_ICONS[String(a.achievement_type)] || { icon: Award, color: 'from-gray-400 to-gray-500' };
        const Icon = config.icon;
        return (
          <div key={i} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 text-center">
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${config.color} flex items-center justify-center mx-auto mb-2`}>
              <Icon className="w-6 h-6 text-white" />
            </div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">{String(a.achievement_name)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{new Date(a.earned_at as string).toLocaleDateString()}</p>
          </div>
        );
      })}
    </div>
  );
}

// ─── Block & Report ───────────────────────────────────────────────────────────

export function BlockReportButton({ targetUserId }: { targetUserId: string }) {
  const { user } = useAuth();
  const [showMenu, setShowMenu] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    if (!user || user.id === targetUserId) return;
    supabase.from('user_blocks').select('id').eq('blocker_id', user.id).eq('blocked_id', targetUserId).maybeSingle()
      .then(({ data }) => setIsBlocked(!!data));
  }, [user, targetUserId]);

  if (!user || user.id === targetUserId) return null;

  const toggleBlock = async () => {
    if (isBlocked) {
      await supabase.from('user_blocks').delete().eq('blocker_id', user!.id).eq('blocked_id', targetUserId);
      setIsBlocked(false);
    } else {
      await supabase.from('user_blocks').insert({ blocker_id: user!.id, blocked_id: targetUserId });
      await supabase.from('user_follows').delete().eq('follower_id', user!.id).eq('following_id', targetUserId);
      setIsBlocked(true);
    }
    setShowMenu(false);
  };

  return (
    <div className="relative">
      <button onClick={() => setShowMenu(!showMenu)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
        <Settings className="w-4 h-4" />
      </button>
      {showMenu && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-800 py-1 z-50">
          <button onClick={toggleBlock} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
            <Ban className="w-4 h-4" /> {isBlocked ? 'Unblock' : 'Block'}
          </button>
          <button onClick={() => { setShowReport(true); setShowMenu(false); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
            <Flag className="w-4 h-4" /> Report
          </button>
        </div>
      )}
      {showReport && <ReportModal targetUserId={targetUserId} onClose={() => setShowReport(false)} />}
    </div>
  );
}

function ReportModal({ targetUserId, onClose }: { targetUserId: string; onClose: () => void }) {
  const { user } = useAuth();
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reasons = ['Spam', 'Harassment', 'Fake Account', 'Scam/Fraud', 'Inappropriate Content', 'Other'];

  const submit = async () => {
    if (!user || !reason) return;
    setSubmitting(true);
    await supabase.from('user_reports').insert({ reporter_id: user.id, reported_id: targetUserId, reason, description });
    setSubmitting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Report User</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-sm text-gray-600 dark:text-gray-400 mb-1 block">Reason</label>
            <select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white">
              <option value="">Select a reason...</option>
              {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm text-gray-600 dark:text-gray-400 mb-1 block">Description (optional)</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white" />
          </div>
          <button onClick={submit} disabled={!reason || submitting} className="w-full py-2.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50">
            {submitting ? 'Submitting...' : 'Submit Report'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Social Notifications ─────────────────────────────────────────────────────

export function SocialNotificationsBell() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Record<string, unknown>[]>([]);
  const [unread, setUnread] = useState(0);
  const [show, setShow] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase.from('social_notifications').select('*, actor:users!actor_id(full_name, username, avatar_url)').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20);
      setNotifications(data || []);
      setUnread((data || []).filter((n) => !n.read).length);
    };
    load();
    const channelName = `social_notifs:${user.id}`;
    supabase.removeChannel(supabase.channel(channelName));
    const channel = supabase.channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'social_notifications', filter: `user_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from('social_notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
    setUnread(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const typeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
    followed: UserPlus, liked: Star, shared: Share2, purchased: Award,
    new_product: Sparkles, milestone: Crown, message: MessageCircle,
  };

  return (
    <div className="relative">
      <button onClick={() => { setShow(!show); if (!show && unread > 0) markAllRead(); }} className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
        <Bell className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        {unread > 0 && <span className="absolute top-0 right-0 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {show && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-800 py-2 z-50">
          {notifications.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">No notifications yet</p>
          ) : notifications.map((n) => {
            const Icon = typeIcons[String(n.notification_type)] || Bell;
            const actor = n.actor as Record<string, unknown> | null;
            return (
              <div key={n.id as string} className={`flex items-center gap-3 px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer ${!n.read ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : ''}`} onClick={() => actor && navigate(`/profile/${actor.id}`)}>
                <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-indigo-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 dark:text-gray-300 truncate">
                    {actor ? <span className="font-medium">{String(actor.full_name)}</span> : 'Someone'}{' '}
                    {String(n.notification_type).replace(/_/g, ' ')}
                  </p>
                  <p className="text-xs text-gray-400">{new Date(n.created_at as string).toLocaleDateString()}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Profile QR Code & Share ──────────────────────────────────────────────────

export function ProfileShareButton({ userId }: { userId: string; username?: string }) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const profileUrl = `${window.location.origin}/profile/${userId}`;

  const copyLink = () => {
    navigator.clipboard.writeText(profileUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Simple QR code using API-free SVG generation
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(profileUrl)}`;

  return (
    <div className="relative">
      <button onClick={() => setShow(!show)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700">
        <Share2 className="w-4 h-4" /> Share
      </button>
      {show && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-800 p-4 z-50">
          <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3 flex items-center gap-2"><QrCode className="w-4 h-4 text-indigo-500" /> Share Profile</h4>
          <div className="flex justify-center mb-3">
            <img src={qrUrl} alt="QR Code" className="w-40 h-40 rounded-lg" />
          </div>
          <button onClick={copyLink} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">
            <Copy className="w-4 h-4" /> {copied ? 'Copied!' : 'Copy Profile Link'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Privacy Controls ─────────────────────────────────────────────────────────

export function PrivacyControls({ userId }: { userId: string }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const isOwner = user?.id === userId;

  useEffect(() => {
    if (!isOwner) return;
    const load = async () => {
      const { data } = await supabase.from('users').select('privacy_profile, privacy_email, privacy_phone, privacy_followers, privacy_following, privacy_portfolio, privacy_analytics, privacy_activity').eq('id', userId).maybeSingle();
      if (data) setSettings(data as Record<string, string>);
    };
    load();
  }, [userId, isOwner]);

  if (!isOwner) return null;

  const fields = [
    { key: 'privacy_profile', label: 'Profile' },
    { key: 'privacy_email', label: 'Email' },
    { key: 'privacy_phone', label: 'Phone' },
    { key: 'privacy_followers', label: 'Followers List' },
    { key: 'privacy_following', label: 'Following List' },
    { key: 'privacy_portfolio', label: 'Portfolio' },
    { key: 'privacy_analytics', label: 'Analytics' },
    { key: 'privacy_activity', label: 'Activity Feed' },
  ];

  const updatePrivacy = async (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaving(true);
    await supabase.from('users').update({ [key]: value }).eq('id', userId);
    setSaving(false);
  };

  const options = [
    { value: 'public', label: 'Public', icon: Globe },
    { value: 'followers_only', label: 'Followers', icon: Users },
    { value: 'private', label: 'Private', icon: Lock },
  ];

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
        <Lock className="w-4 h-4 text-indigo-500" /> Privacy Controls
        {saving && <span className="text-xs text-gray-400">Saving...</span>}
      </h3>
      <div className="space-y-3">
        {fields.map((f) => (
          <div key={f.key} className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">{f.label}</span>
            <div className="flex gap-1">
              {options.map((o) => (
                <button key={o.value} onClick={() => updatePrivacy(f.key, o.value)} className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1 ${settings[f.key] === o.value ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}>
                  <o.icon className="w-3 h-3" /> {o.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Social Analytics Display ─────────────────────────────────────────────────

export function SocialAnalyticsDisplay({ userId }: { userId: string }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase.rpc('get_social_analytics', { p_user_id: userId, p_days: 30 });
      setData(data as Record<string, unknown>);
      setLoading(false);
    };
    load();
  }, [userId]);

  if (loading) return <p className="text-center text-gray-400 py-4">Loading social analytics...</p>;
  if (!data) return null;

  const num = (k: string) => Number(data[k]) || 0;
  const obj = (k: string) => data[k] as Record<string, unknown> | null;
  const arr = (k: string) => (data[k] as Record<string, unknown>[]) || [];

  const mostViewed = obj('most_viewed_product');
  const mostShared = obj('most_shared_product');
  const mostSaved = obj('most_saved_product');

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-indigo-500" /> Social Analytics
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Profile Reach', value: num('profile_reach').toLocaleString(), icon: Eye, color: 'text-indigo-500' },
          { label: 'Returning Visitors', value: num('returning_visitors').toLocaleString(), icon: Users, color: 'text-blue-500' },
          { label: 'Follower Conversion', value: `${num('follower_conversion').toFixed(1)}%`, icon: TrendingUp, color: 'text-green-500' },
        ].map((s, i) => (
          <div key={i} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
            <s.icon className={`w-4 h-4 ${s.color} mb-1`} />
            <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white">{s.value}</p>
          </div>
        ))}
      </div>

      {mostViewed && mostViewed.name ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { label: 'Most Viewed', data: mostViewed, stat: 'views', icon: Eye },
            { label: 'Most Shared', data: mostShared, stat: 'shares', icon: Share2 },
            { label: 'Most Saved', data: mostSaved, stat: 'saves', icon: Star },
          ].map((item, i) => item.data && item.data.name ? (
            <div key={i} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-3">
              <item.icon className="w-4 h-4 text-indigo-500 mb-1" />
              <p className="text-xs text-gray-500 dark:text-gray-400">{item.label}</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{String(item.data.name)}</p>
              <p className="text-xs text-indigo-500">{Number(item.data[item.stat]).toLocaleString()} {item.stat}</p>
            </div>
          ) : null)}
        </div>
      ) : null}

      {arr('visitor_countries').length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Visitor Map</h4>
          <div className="space-y-2">
            {arr('visitor_countries').slice(0, 5).map((c, i) => {
              const count = Number(c.count) || 0;
              const maxCount = Math.max(...arr('visitor_countries').map((cc) => Number(cc.count) || 0), 1);
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-24 truncate">{String(c.country)}</span>
                  <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-5 overflow-hidden">
                    <div className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full rounded-full" style={{ width: `${(count / maxCount) * 100}%` }} />
                  </div>
                  <span className="text-xs text-gray-500 w-12 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Suggested Users ──────────────────────────────────────────────────────────

export function SuggestedUsers() {
  const [users, setUsers] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase.rpc('get_suggested_users', { p_limit: 5 });
      setUsers(data || []);
      setLoading(false);
    };
    load();
  }, []);

  if (loading || !users.length) return null;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Suggested People</h3>
      <div className="space-y-2">
        {users.map((u) => {
          const uid = String(u.id);
          return (
            <div key={uid} className="flex items-center justify-between">
              <ProfilePreviewCard userId={uid}>
                <Link to={`/profile/${uid}`} className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center overflow-hidden shrink-0">
                    {u.avatar_url ? <img src={u.avatar_url as string} alt="" className="w-full h-full object-cover" /> : <span className="text-white text-xs font-medium">{String(u.name || 'U').charAt(0)}</span>}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{String(u.name)}</p>
                    <p className="text-xs text-gray-400">{Number(u.followers).toLocaleString()} followers</p>
                  </div>
                </Link>
              </ProfilePreviewCard>
              <FollowButtonMini targetUserId={uid} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FollowButtonMini({ targetUserId }: { targetUserId: string }) {
  const { followingIds, toggleFollow } = useFollow();
  const isFollowing = followingIds.has(targetUserId);
  return (
    <button onClick={() => toggleFollow(targetUserId)} className={`px-3 py-1 rounded-lg text-xs font-medium ${isFollowing ? 'bg-gray-100 dark:bg-gray-800 text-gray-500' : 'bg-indigo-600 text-white'}`}>
      {isFollowing ? 'Following' : 'Follow'}
    </button>
  );
}
