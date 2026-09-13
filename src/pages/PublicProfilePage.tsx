import { useCallback, useEffect, useState } from 'react';
import { Navigate, Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle, ExternalLink, Globe, Loader2, MapPin, MessageCircle, Package, Share2, UserCheck, UserPlus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useFollow } from '../lib/socialHooks';
import { supabase } from '../lib/supabase';
import { BlockReportButton } from '../components/SocialFeatures';

type SafePublicProfile = {
  id: string; username: string | null; full_name: string | null; avatar_url: string | null; cover_image: string | null;
  bio: string | null; website: string | null; country: string | null; state: string | null; city: string | null;
  languages: string[]; created_at: string | null; is_verified: boolean; profile_allowed: boolean;
  privacy_activity: 'public' | 'followers_only' | 'private'; privacy_portfolio: 'public' | 'followers_only' | 'private';
  privacy_followers: 'public' | 'followers_only' | 'private'; privacy_following: 'public' | 'followers_only' | 'private'; is_following: boolean;
};
type Product = { id: string; name: string; description: string | null; price: number; image_url: string | null; product_type: string | null };
type ActivityItem = { id: string; title: string | null; description: string | null; event_type: string; created_at: string };

function initials(profile: SafePublicProfile) { const source = profile.full_name || profile.username || 'D'; return source.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase(); }
function locationText(profile: SafePublicProfile) { return [profile.city, profile.state, profile.country].filter(Boolean).join(', '); }

export default function PublicProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { followingIds, toggleFollow } = useFollow();
  const [profile, setProfile] = useState<SafePublicProfile | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId || !user) return;
    setLoading(true); setError(null);
    const { data, error: profileError } = await supabase.rpc('get_public_profile_safe', { p_user_id: userId });
    if (profileError || !data) { setProfile(null); setError(profileError?.message || 'This profile is unavailable.'); setLoading(false); return; }
    const safeProfile = data as SafePublicProfile; setProfile(safeProfile);
    const follows = safeProfile.is_following || followingIds.has(userId);
    const canSeePortfolio = safeProfile.profile_allowed && (safeProfile.privacy_portfolio === 'public' || (safeProfile.privacy_portfolio === 'followers_only' && follows));
    const canSeeActivity = safeProfile.profile_allowed && (safeProfile.privacy_activity === 'public' || (safeProfile.privacy_activity === 'followers_only' && follows));
    const [productResult, activityResult] = await Promise.all([
      canSeePortfolio ? supabase.from('products').select('id,name,description,price,image_url,product_type').eq('uploaded_by', userId).eq('approval_status', 'approved').eq('is_active', true).limit(24) : Promise.resolve({ data: [] as Product[], error: null }),
      canSeeActivity ? supabase.from('activity_feed').select('id,title,description,event_type,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(20) : Promise.resolve({ data: [] as ActivityItem[], error: null }),
    ]);
    setProducts((productResult.data || []) as Product[]); setActivity((activityResult.data || []) as ActivityItem[]); setLoading(false);
  }, [followingIds, user, userId]);

  useEffect(() => { void load(); }, [load]);
  if (userId && user?.id === userId) return <Navigate to="/profile" replace />;
  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary-600" /></div>;
  if (!profile) return <div className="mx-auto max-w-2xl p-6 text-center"><h1 className="text-xl font-bold text-gray-900 dark:text-white">Profile unavailable</h1><p className="mt-2 text-sm text-gray-500">{error || 'This profile cannot be viewed.'}</p></div>;

  const following = followingIds.has(profile.id) || profile.is_following;
  const displayName = profile.full_name || (profile.username ? `@${profile.username}` : 'DRIGHT User');
  const place = locationText(profile);
  const share = async () => { const url = `${window.location.origin}/profile/${profile.id}`; if (navigator.share) { try { await navigator.share({ title: displayName, url }); return; } catch { /* fallback */ } } await navigator.clipboard?.writeText(url); };

  return (
    <main className="min-h-screen bg-surface-muted pb-12"><div className="mx-auto max-w-4xl">
      <section className="overflow-hidden bg-white shadow-sm dark:bg-gray-900 md:mt-6 md:rounded-3xl md:border md:border-gray-100 md:dark:border-gray-800">
        <div className="relative h-36 bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-800 sm:h-48">{profile.cover_image && <img src={profile.cover_image} alt="" className="h-full w-full object-cover" />}</div>
        <div className="px-4 pb-6 sm:px-7">
          <div className="-mt-12 flex items-end justify-between gap-4"><div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-gradient-to-br from-indigo-500 to-violet-600 text-2xl font-black text-white shadow-lg dark:border-gray-900 sm:h-28 sm:w-28">{profile.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : initials(profile)}</div><div className="mb-1 flex items-center gap-2"><button type="button" onClick={() => void share()} className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800" aria-label="Share profile"><Share2 className="h-4 w-4" /></button><BlockReportButton targetUserId={profile.id} /></div></div>
          <div className="mt-4"><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-black text-gray-950 dark:text-white">{displayName}</h1>{profile.is_verified && <CheckCircle className="h-5 w-5 text-blue-500" aria-label="Verified" />}</div>{profile.full_name && profile.username && <p className="mt-0.5 text-sm font-medium text-gray-500">@{profile.username}</p>}
            {!profile.profile_allowed ? <p className="mt-4 rounded-2xl bg-gray-50 p-4 text-sm text-gray-500 dark:bg-gray-800/70 dark:text-gray-400">This account keeps profile details private.</p> : <>{profile.bio && <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-gray-700 dark:text-gray-300">{profile.bio}</p>}<div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-500 dark:text-gray-400">{place && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{place}</span>}{profile.website && <a href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary-600"><Globe className="h-3.5 w-3.5" />Website<ExternalLink className="h-3 w-3" /></a>}</div></>}
            <div className="mt-5 flex flex-wrap gap-2"><button type="button" onClick={() => void toggleFollow(profile.id)} className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl px-5 text-sm font-bold ${following ? 'border border-gray-200 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200' : 'bg-primary-600 text-white hover:bg-primary-700'}`}>{following ? <UserCheck className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}{following ? 'Following' : 'Follow'}</button><button type="button" onClick={() => navigate(`/chat?user=${profile.id}`)} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-gray-200 px-5 text-sm font-bold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"><MessageCircle className="h-4 w-4" />Message</button></div>
          </div>
        </div>
      </section>
      {/* Deliberately no public Admin badge, owner Overview, revenue, wallet or Analytics panel. */}
      {profile.profile_allowed && products.length > 0 && <section className="mt-4 bg-white p-4 dark:bg-gray-900 md:rounded-3xl md:border md:border-gray-100 md:p-6 md:dark:border-gray-800"><div className="mb-4 flex items-center gap-2"><Package className="h-5 w-5 text-primary-600" /><h2 className="font-bold text-gray-950 dark:text-white">Public listings</h2></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{products.map((product) => <Link key={product.id} to={`/product/${product.id}`} className="overflow-hidden rounded-2xl border border-gray-100 bg-gray-50 hover:shadow-md dark:border-gray-800 dark:bg-gray-800/60"><div className="aspect-square bg-gray-100 dark:bg-gray-800">{product.image_url ? <img src={product.image_url} alt="" loading="lazy" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><Package className="h-8 w-8 text-gray-300" /></div>}</div><div className="p-3"><p className="line-clamp-2 text-sm font-bold text-gray-900 dark:text-white">{product.name}</p></div></Link>)}</div></section>}
      {profile.profile_allowed && activity.length > 0 && <section className="mt-4 bg-white p-4 dark:bg-gray-900 md:rounded-3xl md:border md:border-gray-100 md:p-6 md:dark:border-gray-800"><h2 className="font-bold text-gray-950 dark:text-white">Public activity</h2><div className="mt-3 divide-y divide-gray-100 dark:divide-gray-800">{activity.map((item) => <div key={item.id} className="py-3"><p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{item.title || item.event_type.replaceAll('_', ' ')}</p>{item.description && <p className="mt-1 line-clamp-2 text-xs text-gray-500">{item.description}</p>}<p className="mt-1 text-[11px] text-gray-400">{new Date(item.created_at).toLocaleDateString()}</p></div>)}</div></section>}
    </div></main>
  );
}
