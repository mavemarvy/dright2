import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BadgeCheck, Star, Users, Package, Briefcase, Clock,
  MessageSquare, Store, Flag, Globe, Calendar,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useStoreFollow } from '../../lib/marketplaceHooks';

interface SellerProfileData {
  id: string;
  full_name: string;
  avatar_url: string | null;
  store_title: string | null;
  store_description: string | null;
  average_rating: number;
  total_reviews: number;
  is_verified: boolean;
  followers_count: number;
  response_rate: number;
  avg_response_time_hours: number;
  languages: string[];
  joined_at: string;
  last_active_at: string;
}

interface SellerProfilePanelProps {
  sellerId: string;
  onChat: () => void;
}

export default function SellerProfilePanel({ sellerId, onChat }: SellerProfilePanelProps) {
  const { user } = useAuth();
  const [seller, setSeller] = useState<SellerProfileData | null>(null);
  const [productCount, setProductCount] = useState(0);
  const [serviceCount, setServiceCount] = useState(0);
  const [jobCount, setJobCount] = useState(0);
  const [showReportModal, setShowReportModal] = useState(false);
  const { followingIds, toggleFollow, followerCounts, fetchFollowerCount } = useStoreFollow(user?.id);

  useEffect(() => {
    fetchFollowerCount(sellerId);
  }, [sellerId, fetchFollowerCount]);

  const fetchSeller = useCallback(async () => {
    const { data } = await supabase
      .from('users')
      .select('id, full_name, avatar_url, store_title, store_description, average_rating, total_reviews, is_verified, followers_count, response_rate, avg_response_time_hours, languages, joined_at, last_active_at, account_status')
      .eq('id', sellerId)
      .maybeSingle();

    if (data) {
      setSeller({
        ...data,
        is_verified: data.is_verified || data.account_status === 'ACTIVE',
      } as SellerProfileData);
    }

    const [prodRes, jobRes] = await Promise.all([
      supabase.from('products').select('id', { count: 'exact', head: true })
        .eq('uploaded_by', sellerId).eq('is_active', true).eq('approval_status', 'approved'),
      supabase.from('jobs').select('id', { count: 'exact', head: true })
        .eq('employer_id', sellerId).eq('status', 'active'),
    ]);

    setProductCount(prodRes.count || 0);
    setJobCount(jobRes.count || 0);

    if (data) {
      const { count: svcCount } = await supabase.from('products')
        .select('id', { count: 'exact', head: true })
        .eq('uploaded_by', sellerId).eq('product_type', 'SERVICE').eq('is_active', true);
      setServiceCount(svcCount || 0);
    }
  }, [sellerId]);

  useEffect(() => {
    fetchSeller();
  }, [fetchSeller]);

  if (!seller) return null;

  const isFollowing = followingIds.has(sellerId);
  const followerCount = followerCounts[sellerId] ?? seller.followers_count ?? 0;
  const joinedDate = new Date(seller.joined_at || seller.id.slice(0, 8)).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  const lastActive = seller.last_active_at ? new Date(seller.last_active_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Unknown';

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-start gap-4">
        {seller.avatar_url ? (
          <img src={seller.avatar_url} alt={seller.full_name} className="w-16 h-16 rounded-2xl object-cover" />
        ) : (
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-400 to-indigo-500 flex items-center justify-center">
            <span className="text-xl font-bold text-white">{seller.full_name?.[0]?.toUpperCase() || 'S'}</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="font-bold text-gray-900 truncate">{seller.store_title || seller.full_name}</h3>
            {seller.is_verified && <BadgeCheck className="w-5 h-5 text-blue-500 shrink-0" />}
          </div>
          <p className="text-sm text-gray-500 truncate">{seller.full_name}</p>
          {seller.average_rating > 0 && (
            <div className="flex items-center gap-1.5 mt-1">
              <Star className="w-3.5 h-3.5 fill-warning text-warning" />
              <span className="text-sm font-medium text-gray-700">{seller.average_rating.toFixed(1)}</span>
              <span className="text-xs text-gray-400">({seller.total_reviews} reviews)</span>
            </div>
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-2 mt-4">
        <div className="text-center bg-gray-50 rounded-xl py-2">
          <Package className="w-4 h-4 text-primary-600 mx-auto mb-1" />
          <p className="text-sm font-bold text-gray-900">{productCount}</p>
          <p className="text-[10px] text-gray-400">Products</p>
        </div>
        <div className="text-center bg-gray-50 rounded-xl py-2">
          <Briefcase className="w-4 h-4 text-primary-600 mx-auto mb-1" />
          <p className="text-sm font-bold text-gray-900">{serviceCount}</p>
          <p className="text-[10px] text-gray-400">Services</p>
        </div>
        <div className="text-center bg-gray-50 rounded-xl py-2">
          <Users className="w-4 h-4 text-primary-600 mx-auto mb-1" />
          <p className="text-sm font-bold text-gray-900">{followerCount}</p>
          <p className="text-[10px] text-gray-400">Followers</p>
        </div>
        <div className="text-center bg-gray-50 rounded-xl py-2">
          <Briefcase className="w-4 h-4 text-primary-600 mx-auto mb-1" />
          <p className="text-sm font-bold text-gray-900">{jobCount}</p>
          <p className="text-[10px] text-gray-400">Jobs</p>
        </div>
      </div>

      {/* Meta info */}
      <div className="space-y-2 mt-4 text-sm">
        {seller.response_rate > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-gray-500 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Response rate</span>
            <span className="font-medium text-gray-900">{seller.response_rate}%</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-gray-500 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Avg. response</span>
          <span className="font-medium text-gray-900">{seller.avg_response_time_hours}h</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-500 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Joined</span>
          <span className="font-medium text-gray-900">{joinedDate}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-500 flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> Last active</span>
          <span className="font-medium text-gray-900">{lastActive}</span>
        </div>
        {seller.languages && seller.languages.length > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-gray-500 flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> Languages</span>
            <span className="font-medium text-gray-900">{seller.languages.join(', ')}</span>
          </div>
        )}
      </div>

      {/* About */}
      {seller.store_description && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase mb-1.5">About Seller</p>
          <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">{seller.store_description}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 mt-4">
        {user && user.id !== sellerId && (
          <button
            onClick={() => toggleFollow(sellerId)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              isFollowing ? 'bg-gray-100 text-gray-700' : 'bg-primary-600 text-white hover:bg-primary-700'
            }`}
          >
            {isFollowing ? 'Following' : 'Follow'}
          </button>
        )}
        <button
          onClick={onChat}
          className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-1.5"
        >
          <MessageSquare className="w-4 h-4" /> Chat
        </button>
        <Link
          to={`/shop/${sellerId}`}
          className="p-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors"
          title="Visit Store"
        >
          <Store className="w-4 h-4" />
        </Link>
        <button
          onClick={() => setShowReportModal(true)}
          className="p-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors"
          title="Report"
        >
          <Flag className="w-4 h-4" />
        </button>
      </div>

      {/* Report modal */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowReportModal(false)}>
          <motion.div
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="font-bold text-gray-900">Report Seller</h3>
            <p className="text-sm text-gray-500">Report this seller for suspicious activity, fraud, or policy violations. Our team will review your report.</p>
            <div className="flex gap-2">
              <button onClick={() => setShowReportModal(false)} className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200">Cancel</button>
              <button
                onClick={() => { setShowReportModal(false); }}
                className="flex-1 py-2.5 bg-error text-white rounded-xl font-medium hover:bg-red-600"
              >
                Submit Report
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
