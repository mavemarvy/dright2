import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useFollowStats, useProfileView, useFriendsCount } from '../../lib/socialHooks';
import { AchievementDisplay, VerificationBadges, SocialAnalyticsDisplay, PrivacyControls } from '../SocialFeatures';
import { MarketplaceScoreCard, AIBusinessAdvisor } from '../analytics/AdvancedAnalytics';
import { AnalyticsNoData } from '../analytics/AnalyticsState';
import { Activity } from 'lucide-react';
import ProductReviews from '../ProductReviews';

import {
  type ProfileData, type ProfileProduct, type ProfileJob,
  type ProfileStats, type ProfileRole,
  detectRole, getRoleConfig, getProfileBadges,
} from './profileTypes';
import { ProfileHeader } from './ProfileHeader';
import { ProfileAbout } from './ProfileAbout';
import { ProfileTabs } from './ProfileTabs';
import { ProfileStats as ProfileStatsSection } from './ProfileStats';
import { SellerStorefront } from './SellerStorefront';
import { ServicePortfolio } from './ServicePortfolio';
import { EmployerProfile } from './EmployerProfile';
import { AffiliateProfile } from './AffiliateProfile';
import { CampaignCreatorProfile } from './CampaignCreatorProfile';
import { ProfileSkeleton } from './ProfileSkeleton';

interface CampaignInfo {
  id: string;
  title: string;
  status: string;
  budget: number;
  spent: number;
  created_at: string;
}

export default function UnifiedPublicProfile() {
  const { userId } = useParams<{ userId: string }>();
  const { user: currentUser } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [products, setProducts] = useState<ProfileProduct[]>([]);
  const [jobs, setJobs] = useState<ProfileJob[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignInfo[]>([]);
  const [activities, setActivities] = useState<Record<string, unknown>[]>([]);
  const [profileStats, setProfileStats] = useState<ProfileStats | null>(null);
  const [promotedCategories, setPromotedCategories] = useState<string[]>([]);

  const isOwner = currentUser?.id === userId;
  useProfileView(userId);
  const { followers, following } = useFollowStats(userId);
  const { friends } = useFriendsCount(userId);

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (error || !data) { setProfile(null); return; }
      const profileData = data as ProfileData;
      setProfile(profileData);

      const [prodRes, jobRes, campRes, actRes] = await Promise.all([
        supabase
          .from('products')
          .select('id, name, description, price, image_url, category, is_free, product_type, approval_status, is_hidden, total_reviews, average_rating, created_at, old_price, discount_percent')
          .eq('uploaded_by', userId)
          .eq('approval_status', 'approved')
          .eq('is_hidden', false)
          .order('created_at', { ascending: false }),
        supabase
          .from('jobs')
          .select('id, title, category, job_type, work_setup, region, created_at, salary_min, salary_max, salary_currency, total_applications')
          .eq('employer_id', userId)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('campaigns')
          .select('id, title, status, budget, spent, created_at')
          .eq('creator_id', userId)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('activity_feed')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      if (prodRes.data) setProducts(prodRes.data as ProfileProduct[]);
      if (jobRes.data) setJobs(jobRes.data as ProfileJob[]);
      if (campRes.data) setCampaigns(campRes.data as CampaignInfo[]);
      if (actRes.data) setActivities(actRes.data);

      // Extract promoted categories from products
      const categories = [...new Set((prodRes.data || []).map((p) => p.category).filter(Boolean))] as string[];
      setPromotedCategories(categories);

      // Build stats
      const yearsOnDright = profileData.created_at
        ? Math.max(0, (Date.now() - new Date(profileData.created_at).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
        : 0;

      setProfileStats({
        total_listings: prodRes.data?.length || 0,
        total_sales: profileData.total_sales_count || 0,
        total_reviews: profileData.total_reviews || 0,
        average_rating: profileData.average_rating || 0,
        response_time_hours: profileData.avg_response_time_hours || 0,
        years_on_dright: yearsOnDright,
        completed_orders: profileData.total_sales_count || 0,
        followers: followers,
        profile_views: 0,
      });

      if (isOwner) {
        const { data: stats } = await supabase.rpc('get_profile_analytics', { p_profile_id: userId, p_days: 30 });
        if (stats && typeof stats === 'object' && !Array.isArray(stats)) {
          const s = stats as Record<string, unknown>;
          setProfileStats((prev) => prev ? { ...prev, profile_views: (s.total_views as number) || 0 } : prev);
        }
      }
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [userId, isOwner, followers]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <ProfileSkeleton />;
  if (!profile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <AnalyticsNoData message="Profile not found" />
      </div>
    );
  }

  const hasServices = products.some((p) => p.product_type === 'SERVICE' || p.product_type === 'COURSE');
  const role: ProfileRole = detectRole(profile, products.length > 0, hasServices, jobs.length > 0, campaigns.length > 0);
  const roleConfig = getRoleConfig(role);
  const badges = getProfileBadges(profile);

  // Set default tab on first render
  if (tab === 'overview' && roleConfig.defaultTab !== 'overview' && !roleConfig.sections.find((s) => s.key === 'overview' && s.visible)) {
    // Keep overview if it's visible
  }

  const sellerProducts = products.filter((p) => p.product_type !== 'SERVICE' && p.product_type !== 'COURSE');
  const serviceProducts = products.filter((p) => p.product_type === 'SERVICE' || p.product_type === 'COURSE');

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <ProfileHeader
        profile={profile}
        badges={badges}
        isOwner={isOwner}
        followers={followers}
        following={following}
        friends={friends}
        roleLabel={roleConfig.label}
      />

      {/* Tabs */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <ProfileTabs
          sections={roleConfig.sections}
          activeTab={tab}
          onTabChange={setTab}
        />
      </div>

      {/* Tab Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {tab === 'overview' && (
          <div className="space-y-6">
            {profileStats && (
              <ProfileStatsSection stats={profileStats} showStats={roleConfig.showStats} />
            )}

            {/* Recent Products Preview */}
            {products.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">Recent Listings</h3>
                  {roleConfig.showStorefront && (
                    <button onClick={() => setTab('storefront')} className="text-xs text-indigo-500 hover:underline">
                      View all
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {products.slice(0, 4).map((p) => (
                    <Link key={p.id} to={`/product/${p.id}`} className="group">
                      <div className="aspect-square rounded-xl bg-gray-100 dark:bg-gray-800 overflow-hidden">
                        {p.image_url ? (
                          <img src={p.image_url} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        ) : null}
                      </div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white mt-1 truncate">{p.name}</p>
                      <p className="text-sm text-indigo-500">{p.is_free ? 'Free' : `$${Number(p.price || 0).toFixed(2)}`}</p>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* About snippet */}
            <ProfileAbout profile={profile} isOwner={isOwner} />

            {/* Recent Activity */}
            {activities.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Recent Activity</h3>
                <div className="space-y-2">
                  {activities.slice(0, 5).map((a, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                      <Activity className="w-4 h-4 text-indigo-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700 dark:text-gray-300 truncate">
                          {(a.title as string) || (a.event_type as string)}
                        </p>
                        <p className="text-xs text-gray-400">
                          {new Date(a.created_at as string).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'about' && <ProfileAbout profile={profile} isOwner={isOwner} />}

        {tab === 'storefront' && roleConfig.showStorefront && (
          <SellerStorefront
            products={sellerProducts}
            storeTitle={profile.store_title}
            storeDescription={profile.store_description}
            storeBannerUrl={profile.store_banner_url}
            averageRating={profile.average_rating || 0}
            totalReviews={profile.total_reviews || 0}
            totalSales={profile.total_sales_count || 0}
            responseTimeHours={profile.avg_response_time_hours || 0}
            sellerName={profile.full_name}
          />
        )}

        {tab === 'products' && (
          <SellerStorefront
            products={products}
            storeTitle={profile.store_title}
            storeDescription={profile.store_description}
            storeBannerUrl={profile.store_banner_url}
            averageRating={profile.average_rating || 0}
            totalReviews={profile.total_reviews || 0}
            totalSales={profile.total_sales_count || 0}
            responseTimeHours={profile.avg_response_time_hours || 0}
            sellerName={profile.full_name}
          />
        )}

        {tab === 'portfolio' && roleConfig.showPortfolio && (
          <ServicePortfolio
            services={serviceProducts}
            portfolioItems={[]}
            sellerName={profile.full_name}
          />
        )}

        {tab === 'services' && roleConfig.showPortfolio && (
          <ServicePortfolio
            services={serviceProducts}
            portfolioItems={[]}
            sellerName={profile.full_name}
          />
        )}

        {tab === 'jobs' && roleConfig.showJobs && (
          <EmployerProfile
            jobs={jobs}
            companyName={profile.store_title || profile.full_name}
            storeDescription={profile.store_description}
            storeLocation={profile.store_location}
            avatarUrl={profile.avatar_url}
          />
        )}

        {tab === 'affiliate' && roleConfig.showAffiliate && (
          <AffiliateProfile profile={profile} promotedCategories={promotedCategories} />
        )}

        {tab === 'campaigns' && roleConfig.showCampaigns && (
          <CampaignCreatorProfile campaigns={campaigns} profileName={profile.full_name} />
        )}

        {tab === 'reviews' && roleConfig.showReviews && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Reviews & Ratings</h3>
            <ProductReviewsSection userId={profile.id} totalReviews={profile.total_reviews || 0} />
          </div>
        )}

        {tab === 'badges' && roleConfig.showBadges && (
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Achievements</h3>
            <AchievementDisplay userId={profile.id} />
            <div className="mt-6">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Verifications</h4>
              <VerificationBadges userId={profile.id} size="md" />
            </div>
            {badges.length > 0 && (
              <div className="mt-6">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Profile Badges</h4>
                <div className="flex flex-wrap gap-2">
                  {badges.map((badge) => (
                    <span key={badge.id} className="px-3 py-1.5 rounded-full text-sm font-medium bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                      {badge.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'activity' && (
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Activity Feed</h3>
            {activities.length === 0 ? (
              <AnalyticsNoData message="No recent activity" />
            ) : (
              activities.map((a, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                  <Activity className="w-4 h-4 text-indigo-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 dark:text-gray-300">{(a.title as string) || (a.event_type as string)}</p>
                    <p className="text-xs text-gray-400">{new Date(a.created_at as string).toLocaleDateString()}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'analytics' && isOwner && (
          <div className="space-y-6">
            <SocialAnalyticsDisplay userId={profile.id} />
            <PrivacyControls userId={profile.id} />
            <MarketplaceScoreCard entityType="product" entityId={profile.id} />
            <AIBusinessAdvisor sellerId={profile.id} />
          </div>
        )}
      </div>
    </div>
  );
}

function ProductReviewsSection({ userId, totalReviews }: { userId: string; totalReviews: number }) {
  if (totalReviews === 0) {
    return <AnalyticsNoData message="No reviews yet" />;
  }
  return <ProductReviews productId={userId} productName="Profile" />;
}
