// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT Public Profile Page — Universal social profile with tabs
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useFollowStats, useProfileView, useFriendsCount } from '../lib/socialHooks';
import { FollowButton } from '../components/Social';
import { ProfilePreviewCard as _ProfilePreviewCard, VerificationBadges, AchievementDisplay, BlockReportButton, ProfileShareButton, PrivacyControls, SocialAnalyticsDisplay } from '../components/SocialFeatures';
import { TrustScoreBadge } from '../components/trust/TrustScoreBadge';
void _ProfilePreviewCard;
import { MarketplaceScoreCard, AIBusinessAdvisor } from '../components/analytics/AdvancedAnalytics';
import { AnalyticsLoading, AnalyticsNoData } from '../components/analytics/AnalyticsState';
import {
  MapPin, Calendar, Users, Package, CheckCircle, Eye,
  Activity, MessageSquare, Heart,
} from 'lucide-react';

interface ProfileData {
  id: string;
  name: string;
  username: string;
  email: string;
  phone: string;
  avatar_url: string | null;
  cover_image: string | null;
  bio: string | null;
  website: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  show_email: boolean;
  show_phone: boolean;
  languages: string[];
  created_at: string;
  last_active: string;
  is_online: boolean;
  verified: boolean;
  is_verified: boolean;
  is_admin: boolean;
  role: string;
}

export default function PublicProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const { user: currentUser } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [products, setProducts] = useState<Record<string, unknown>[]>([]);
  const [activities, setActivities] = useState<Record<string, unknown>[]>([]);
  const [profileStats, setProfileStats] = useState<Record<string, unknown> | null>(null);

  const isOwner = currentUser?.id === userId;
  useProfileView(userId);
  const { followers, following } = useFollowStats(userId);
  const { friends } = useFriendsCount(userId);

  useEffect(() => {
    if (!userId) return;
    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('id', userId)
          .maybeSingle();
        if (error) throw error;
        setProfile(data as ProfileData);

        const { data: prods } = await supabase
          .from('products')
          .select('id, name, price, image_url, approval_status, category, created_at')
          .eq('uploaded_by', userId)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(12);
        setProducts(prods || []);

        const { data: acts } = await supabase
          .from('activity_feed')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(20);
        setActivities(acts || []);

        if (isOwner) {
          const { data: stats } = await supabase.rpc('get_profile_analytics', { p_profile_id: userId, p_days: 30 });
          setProfileStats(stats as Record<string, unknown>);
        }
      } catch { setProfile(null); }
      finally { setLoading(false); }
    };
    load();
  }, [userId, isOwner]);

  if (loading) return <div className="flex items-center justify-center min-h-screen"><AnalyticsLoading message="Loading profile..." /></div>;
  if (!profile) return <div className="flex items-center justify-center min-h-screen"><AnalyticsNoData message="Profile not found" /></div>;

  const isVerified = profile.verified || profile.is_verified;
  const ownerTabs = ['overview', 'about', 'products', 'achievements', 'activity', 'analytics'];
  const publicTabs = ['overview', 'about', 'products', 'achievements', 'activity'];
  const tabs = isOwner ? ownerTabs : publicTabs;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Cover Image */}
      <div className="h-48 md:h-64 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 relative">
        {profile.cover_image && (
          <img src={profile.cover_image} alt="Cover" className="w-full h-full object-cover" />
        )}
      </div>

      {/* Profile Header */}
      <div className="max-w-5xl mx-auto px-4 -mt-16 relative">
        <div className="flex flex-col md:flex-row items-start md:items-end gap-4">
          {/* Avatar */}
          <div className="w-32 h-32 rounded-2xl bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center ring-4 ring-white dark:ring-gray-950 overflow-hidden shrink-0">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-white text-4xl font-bold">{profile.name?.charAt(0).toUpperCase()}</span>
            )}
          </div>

          {/* Name + Stats */}
          <div className="flex-1 pb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{profile.name}</h1>
              {isVerified && <CheckCircle className="w-5 h-5 text-blue-500" />}
              <VerificationBadges userId={profile.id} />
              <TrustScoreBadge userId={profile.id} size="sm" />
              {profile.is_admin && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Admin</span>}
              {profile.is_online && <span className="flex items-center gap-1 text-xs text-green-500"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> Online</span>}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">@{profile.username}</p>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-600 dark:text-gray-400">
              <Link to={`/followers/${userId}`} className="flex items-center gap-1 hover:text-indigo-500 transition-colors"><Users className="w-4 h-4" /> {followers} followers</Link>
              <Link to={`/following/${userId}`} className="flex items-center gap-1 hover:text-indigo-500 transition-colors"><Users className="w-4 h-4" /> {following} following</Link>
              <Link to={`/friends/${userId}`} className="flex items-center gap-1 hover:text-indigo-500 transition-colors"><Users className="w-4 h-4" /> {friends} friends</Link>
              {profile.city && <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {profile.city}, {profile.country}</span>}
            </div>
          </div>

          {/* Follow + Message + Share + Block */}
          {!isOwner && (
            <div className="flex items-center gap-2">
              <FollowButton targetUserId={profile.id} />
              <Link
                to={`/chat?user=${profile.id}`}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <MessageSquare className="w-4 h-4" /> Message
              </Link>
              <ProfileShareButton userId={profile.id} username={profile.username} />
              <BlockReportButton targetUserId={profile.id} />
            </div>
          )}
          {isOwner && <ProfileShareButton userId={profile.id} username={profile.username} />}
        </div>

        {/* Bio */}
        {profile.bio && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-4 max-w-2xl">{profile.bio}</p>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mt-6 border-b border-gray-200 dark:border-gray-800 overflow-x-auto">
          {tabs.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-2.5 rounded-t-lg text-sm font-medium capitalize whitespace-nowrap transition-colors ${
              tab === t ? 'border-b-2 border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}>{t}</button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        {tab === 'overview' && <OverviewTab profile={profile} products={products} followers={followers} following={following} friends={friends} profileViews={profileStats?.total_views as number | undefined} />}
        {tab === 'about' && <AboutTab profile={profile} isOwner={isOwner} />}
        {tab === 'products' && <ProductsTab products={products} />}
        {tab === 'achievements' && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Achievements</h3>
            <AchievementDisplay userId={profile.id} />
            <div className="mt-6">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Verifications</h4>
              <VerificationBadges userId={profile.id} size="md" />
            </div>
          </div>
        )}
        {tab === 'activity' && <ActivityTab activities={activities} />}
        {tab === 'analytics' && isOwner && <AnalyticsTab userId={profile.id} stats={profileStats} />}
      </div>
    </div>
  );
}

function OverviewTab({ profile, products, followers, following, friends, profileViews }: { profile: ProfileData; products: Record<string, unknown>[]; followers: number; following: number; friends: number; profileViews?: number }) {
  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Followers', value: followers, icon: Users, color: 'text-indigo-500' },
          { label: 'Following', value: following, icon: Users, color: 'text-purple-500' },
          { label: 'Friends', value: friends, icon: Heart, color: 'text-pink-500' },
          { label: 'Products', value: products.length, icon: Package, color: 'text-blue-500' },
          { label: 'Profile Views', value: profileViews ?? 0, icon: Eye, color: 'text-green-500' },
          { label: 'Member Since', value: new Date(profile.created_at).toLocaleDateString('en', { month: 'short', year: 'numeric' }), icon: Calendar, color: 'text-orange-500' },
        ].map((s, i) => (
          <div key={i} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
            <s.icon className={`w-5 h-5 ${s.color} mb-2`} />
            <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{typeof s.value === 'number' ? s.value.toLocaleString() : s.value}</p>
          </div>
        ))}
      </div>

      {/* Recent Products */}
      {products.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Recent Products</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {products.slice(0, 4).map((p, i) => (
              <a key={i} href={`/product/${p.id}`} className="group">
                <div className="aspect-square rounded-xl bg-gray-100 dark:bg-gray-800 overflow-hidden">
                  {p.image_url ? <img src={p.image_url as string} alt={p.name as string} className="w-full h-full object-cover group-hover:scale-105 transition-transform" /> : <Package className="w-8 h-8 text-gray-400 m-auto mt-1/2" />}
                </div>
                <p className="text-sm font-medium text-gray-900 dark:text-white mt-1 truncate">{p.name as string}</p>
                <p className="text-sm text-indigo-500">${Number(p.price || 0).toFixed(2)}</p>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* About snippet */}
      {profile.bio && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">About</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">{profile.bio}</p>
        </div>
      )}
    </div>
  );
}

function AboutTab({ profile, isOwner }: { profile: ProfileData; isOwner: boolean }) {
  const fields = [
    { label: 'Username', value: `@${profile.username}`, show: true },
    { label: 'Bio', value: profile.bio, show: !!profile.bio },
    { label: 'Website', value: profile.website, show: !!profile.website },
    { label: 'Email', value: profile.email, show: (isOwner || profile.show_email) && !!profile.email },
    { label: 'Phone', value: profile.phone, show: (isOwner || profile.show_phone) && !!profile.phone },
    { label: 'Country', value: profile.country, show: !!profile.country },
    { label: 'State', value: profile.state, show: !!profile.state },
    { label: 'City', value: profile.city, show: !!profile.city },
    { label: 'Languages', value: (profile.languages || []).join(', '), show: (profile.languages || []).length > 0 },
    { label: 'Joined', value: new Date(profile.created_at).toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' }), show: true },
    { label: 'Last Active', value: profile.last_active ? new Date(profile.last_active).toLocaleDateString() : 'Recently', show: true },
  ].filter((f) => f.show);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">About</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {fields.map((f, i) => (
          <div key={i} className="flex justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
            <span className="text-xs text-gray-500 dark:text-gray-400">{f.label}</span>
            <span className="text-sm font-medium text-gray-900 dark:text-white">{f.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProductsTab({ products }: { products: Record<string, unknown>[] }) {
  if (!products.length) return <AnalyticsNoData message="No products listed yet" />;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {products.map((p, i) => (
        <a key={i} href={`/product/${p.id}`} className="group">
          <div className="aspect-square rounded-xl bg-gray-100 dark:bg-gray-800 overflow-hidden">
            {p.image_url ? <img src={p.image_url as string} alt={p.name as string} className="w-full h-full object-cover group-hover:scale-105 transition-transform" /> : <Package className="w-8 h-8 text-gray-400 m-auto" />}
          </div>
          <p className="text-sm font-medium text-gray-900 dark:text-white mt-1 truncate">{p.name as string}</p>
          <p className="text-sm text-indigo-500">${Number(p.price || 0).toFixed(2)}</p>
        </a>
      ))}
    </div>
  );
}

function ActivityTab({ activities }: { activities: Record<string, unknown>[] }) {
  if (!activities.length) return <AnalyticsNoData message="No recent activity" />;
  return (
    <div className="space-y-2">
      {activities.map((a, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
          <Activity className="w-4 h-4 text-indigo-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-700 dark:text-gray-300">{a.title as string || a.event_type as string}</p>
            <p className="text-xs text-gray-400">{new Date(a.created_at as string).toLocaleDateString()}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function AnalyticsTab({ userId, stats: _stats }: { userId: string; stats: Record<string, unknown> | null }) {
  void _stats;

  return (
    <div className="space-y-6">
      <SocialAnalyticsDisplay userId={userId} />
      <PrivacyControls userId={userId} />
      <MarketplaceScoreCard entityType="product" entityId={userId} />
      <AIBusinessAdvisor sellerId={userId} />
    </div>
  );
}

