import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, CheckCircle, Image as ImageIcon, Loader2, Lock, MessageCircle, Plus, Send, Shield, Users, Video, X,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

type Community = {
  id: string;
  public_id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  visibility: 'public' | 'private' | 'hidden';
  category: string | null;
  country: string | null;
  location: string | null;
  member_count: number;
  post_count: number;
  is_verified: boolean;
  is_featured: boolean;
  status: string;
  monetization_enabled: boolean;
  premium_enabled: boolean;
  created_at: string;
  viewer_role: 'owner' | 'admin' | 'moderator' | 'member' | null;
  viewer_state: 'active' | 'pending' | 'invited' | 'declined' | 'banned' | 'left' | null;
  can_manage: boolean;
};
type CommunityPost = {
  id: string;
  author_id: string;
  body: string;
  media_path: string | null;
  media_type: 'image' | 'video' | null;
  created_at: string;
  is_pinned: boolean;
  author_name: string;
  author_username: string | null;
  author_avatar: string | null;
  media_url: string | null;
};
type Member = { user_id: string; role: string; state: string; joined_at: string | null; full_name: string | null; username: string | null; avatar_url: string | null };

const MAX_MEDIA_SIZE = 100 * 1024 * 1024;
function ext(file: File) {
  const found = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (found && found.length <= 8) return found;
  return file.type.startsWith('video/') ? 'mp4' : 'jpg';
}

export default function CommunityDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [community, setCommunity] = useState<Community | null>(null);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [showMembers, setShowMembers] = useState(false);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPosts = useCallback(async (communityId: string) => {
    const { data, error: postError } = await supabase
      .from('social_posts')
      .select('id,author_id,body,media_path,media_type,created_at,is_pinned')
      .eq('community_id', communityId)
      .eq('is_active', true)
      .eq('moderation_status', 'approved')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50);
    if (postError) throw postError;
    const raw = (data || []) as Array<Omit<CommunityPost, 'author_name' | 'author_username' | 'author_avatar' | 'media_url'>>;
    const authorIds = [...new Set(raw.map((post) => post.author_id))];
    const { data: users } = authorIds.length
      ? await supabase.from('users').select('id,full_name,username,avatar_url').in('id', authorIds)
      : { data: [] as Array<{ id: string; full_name: string | null; username: string | null; avatar_url: string | null }> };
    const profiles = new Map((users || []).map((profile) => [profile.id, profile]));
    const signed = await Promise.all(raw.map(async (post) => {
      let mediaUrl: string | null = null;
      if (post.media_path) {
        if (/^https?:\/\//i.test(post.media_path)) mediaUrl = post.media_path;
        else {
          const { data: signedData } = await supabase.storage.from('social-media').createSignedUrl(post.media_path, 3600);
          mediaUrl = signedData?.signedUrl || null;
        }
      }
      const profile = profiles.get(post.author_id);
      return {
        ...post,
        author_name: profile?.full_name || profile?.username || 'DRIGHT User',
        author_username: profile?.username || null,
        author_avatar: profile?.avatar_url || null,
        media_url: mediaUrl,
      } as CommunityPost;
    }));
    setPosts(signed);
  }, []);

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true); setError(null);
    const { data, error: communityError } = await supabase.rpc('get_community_by_slug', { p_slug: slug });
    if (communityError) { setError(communityError.message); setCommunity(null); setLoading(false); return; }
    if (!data) { setCommunity(null); setLoading(false); return; }
    const next = data as Community;
    setCommunity(next);
    try { await loadPosts(next.id); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load community posts.'); }
    setLoading(false);
  }, [loadPosts, slug]);
  useEffect(() => { void load(); }, [load]);

  const join = async () => {
    if (!community) return;
    const { data, error: e } = await supabase.rpc('join_or_request_community', { p_community_id: community.id });
    if (e) return setError(e.message);
    const result = (data || {}) as { state?: Community['viewer_state'] };
    setCommunity((current) => current ? { ...current, viewer_state: result.state || current.viewer_state, member_count: result.state === 'active' && current.viewer_state !== 'active' ? current.member_count + 1 : current.member_count } : current);
  };
  const leave = async () => {
    if (!community) return;
    const { error: e } = await supabase.rpc('leave_community', { p_community_id: community.id });
    if (e) return setError(e.message);
    setCommunity((current) => current ? { ...current, viewer_state: 'left', viewer_role: null, member_count: Math.max(0, current.member_count - 1) } : current);
  };
  const openMembers = async () => {
    if (!community) return;
    const { data, error: e } = await supabase.rpc('get_community_members', { p_community_id: community.id, p_state: 'active' });
    if (e) return setError(e.message);
    setMembers((Array.isArray(data) ? data : []) as Member[]); setShowMembers(true);
  };
  const openChat = async () => {
    if (!community) return;
    const { data, error: e } = await supabase.rpc('get_or_create_community_chat', { p_community_id: community.id });
    if (e) return setError(e.message);
    if (data) navigate(`/chat?conv=${data}`);
  };
  const publish = async () => {
    if (!community || !user || community.viewer_state !== 'active' || posting || (!body.trim() && !file)) return;
    setPosting(true); setError(null);
    let path: string | null = null;
    try {
      let mediaType: 'image' | 'video' | null = null;
      if (file) {
        mediaType = file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'image' : null;
        if (!mediaType) throw new Error('Choose an image or video.');
        if (file.size > MAX_MEDIA_SIZE) throw new Error('Upload must be 100 MB or smaller.');
        path = `${user.id}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext(file)}`;
        const { error: uploadError } = await supabase.storage.from('social-media').upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;
      }
      const { error: postError } = await supabase.rpc('create_community_post', {
        p_community_id: community.id,
        p_body: body.trim(),
        p_media_path: path,
        p_media_type: mediaType,
        p_category: community.category,
        p_topic_tags: [],
        p_linked_entity_type: null,
        p_linked_entity_id: null,
        p_linked_entity_url: null,
      });
      if (postError) throw postError;
      setBody(''); setFile(null);
      await loadPosts(community.id);
      setCommunity((current) => current ? { ...current, post_count: current.post_count + 1 } : current);
    } catch (caught) {
      if (path) await supabase.storage.from('social-media').remove([path]);
      setError(caught instanceof Error ? caught.message : 'Unable to publish to this community.');
    } finally { setPosting(false); }
  };

  const memberLabel = useMemo(() => community?.member_count.toLocaleString() || '0', [community?.member_count]);
  if (loading) return <div className="flex min-h-[70vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary-600" /></div>;
  if (!community) return <main className="min-h-[70vh] bg-surface-muted px-5 py-16 text-center"><Lock className="mx-auto h-12 w-12 text-gray-300" /><h1 className="mt-4 text-xl font-black text-gray-900 dark:text-white">Community unavailable</h1><p className="mt-2 text-sm text-gray-500">{error || 'This community is hidden, unavailable, or you do not have access.'}</p><button onClick={() => navigate('/communities')} className="mt-5 rounded-xl bg-primary-600 px-4 py-2 text-sm font-bold text-white">Browse Communities</button></main>;

  return <main className="min-h-screen bg-surface-muted pb-24"><div className="mx-auto max-w-5xl px-3 py-4 sm:px-6 sm:py-6">
    <button onClick={() => navigate('/communities')} className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-gray-500"><ArrowLeft className="h-4 w-4" />Communities</button>
    <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="relative h-44 bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-800 sm:h-60">{community.banner_url && <img src={community.banner_url} alt="" className="h-full w-full object-cover" />}<div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" /></div>
      <div className="px-4 pb-6 sm:px-7"><div className="-mt-12 flex items-end justify-between gap-3">{community.avatar_url ? <img src={community.avatar_url} alt="" className="h-24 w-24 rounded-3xl border-4 border-white object-cover shadow-lg dark:border-gray-900" /> : <div className="flex h-24 w-24 items-center justify-center rounded-3xl border-4 border-white bg-primary-600 text-3xl font-black text-white shadow-lg dark:border-gray-900">{community.name.slice(0, 1).toUpperCase()}</div>}<span className="mb-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-bold uppercase text-gray-500 dark:bg-gray-800">{community.visibility}</span></div>
        <div className="mt-4 flex flex-wrap items-center gap-2"><h1 className="text-2xl font-black text-gray-950 dark:text-white">{community.name}</h1>{community.is_verified && <CheckCircle className="h-5 w-5 text-blue-500" />}{community.viewer_role && <span className="rounded-full bg-primary-50 px-2.5 py-1 text-[10px] font-black uppercase text-primary-700 dark:bg-primary-900/20 dark:text-primary-300">{community.viewer_role}</span>}</div>
        <p className="mt-1 text-xs text-gray-400">#{community.public_id}{community.category ? ` · ${community.category}` : ''}</p>{community.description && <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-gray-600 dark:text-gray-300">{community.description}</p>}
        <div className="mt-5 flex flex-wrap items-center gap-2"><button onClick={() => void openMembers()} className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-gray-200 px-4 text-sm font-bold text-gray-700 dark:border-gray-700 dark:text-gray-200"><Users className="h-4 w-4" />{memberLabel} members</button>{community.viewer_state === 'active' && <button onClick={() => void openChat()} className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-gray-200 px-4 text-sm font-bold text-gray-700 dark:border-gray-700 dark:text-gray-200"><MessageCircle className="h-4 w-4" />Community chat</button>}{community.can_manage && <span className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-amber-50 px-4 text-sm font-bold text-amber-700 dark:bg-amber-900/20 dark:text-amber-200"><Shield className="h-4 w-4" />Community manager</span>}
          {community.viewer_state === 'active' && community.viewer_role !== 'owner' ? <button onClick={() => void leave()} className="min-h-[42px] rounded-xl bg-gray-100 px-4 text-sm font-bold text-gray-600 dark:bg-gray-800 dark:text-gray-300">Leave</button> : community.viewer_state === 'pending' ? <span className="inline-flex min-h-[42px] items-center rounded-xl bg-amber-50 px-4 text-sm font-bold text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">Request pending</span> : community.viewer_state !== 'active' && <button onClick={() => void join()} className="min-h-[42px] rounded-xl bg-primary-600 px-5 text-sm font-black text-white">{community.visibility === 'private' ? 'Request to join' : 'Join community'}</button>}
        </div>
      </div>
    </section>

    {error && <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">{error}</div>}

    {community.viewer_state === 'active' && <section className="mt-4 rounded-3xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-5"><textarea data-social-tokens="true" data-community-id={community.id} value={body} onChange={(event) => setBody(event.target.value)} rows={3} maxLength={5000} placeholder={`Post in ${community.name}… use @mentions or #topics`} className="w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white" /><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold text-gray-600 dark:border-gray-700 dark:text-gray-300"><ImageIcon className="h-4 w-4" /><Video className="h-4 w-4" />{file ? file.name : 'Add media'}<input type="file" accept="image/*,video/*" className="hidden" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label><button onClick={() => void publish()} disabled={posting || (!body.trim() && !file)} className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-primary-600 px-5 text-sm font-black text-white disabled:opacity-50">{posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Post</button></div></section>}

    <section className="mt-5"><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-black text-gray-950 dark:text-white">Community posts</h2><span className="text-xs text-gray-400">{community.post_count.toLocaleString()} total</span></div>{posts.length === 0 ? <div className="rounded-3xl border border-dashed border-gray-200 bg-white py-14 text-center dark:border-gray-800 dark:bg-gray-900"><Users className="mx-auto h-10 w-10 text-gray-300" /><p className="mt-3 text-sm font-bold text-gray-600 dark:text-gray-300">No visible posts yet.</p></div> : <div className="space-y-4">{posts.map((post) => <article key={post.id} className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">{post.media_url && <div className="flex max-h-[600px] items-center justify-center bg-black">{post.media_type === 'video' ? <video src={post.media_url} controls playsInline preload="metadata" className="max-h-[600px] w-full object-contain" /> : <img src={post.media_url} alt="" loading="lazy" className="max-h-[600px] w-full object-contain" />}</div>}<div className="p-4 sm:p-5"><div className="flex items-center gap-3">{post.author_avatar ? <img src={post.author_avatar} alt="" className="h-10 w-10 rounded-xl object-cover" /> : <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-600 font-black text-white">{post.author_name.slice(0, 1).toUpperCase()}</div>}<div className="min-w-0"><p className="truncate text-sm font-black text-gray-900 dark:text-white">{post.author_username ? `@${post.author_username}` : post.author_name}</p><p className="text-xs text-gray-400">{new Date(post.created_at).toLocaleString()}{post.is_pinned ? ' · Pinned' : ''}</p></div></div>{post.body && <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-gray-700 dark:text-gray-300">{post.body}</p>}<button onClick={() => navigate(`/social?post=${post.id}`)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-xs font-black text-white dark:bg-white dark:text-slate-950">Open in Social <ArrowLeft className="h-3.5 w-3.5 rotate-180" /></button></div></article>)}</div>}</section>
  </div>

  {showMembers && <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onClick={() => setShowMembers(false)}><div className="max-h-[80dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl dark:bg-gray-900 sm:rounded-3xl" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between"><div><h2 className="font-black text-gray-900 dark:text-white">Members</h2><p className="text-xs text-gray-400">{members.length} visible members</p></div><button onClick={() => setShowMembers(false)} className="rounded-xl p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"><X className="h-5 w-5" /></button></div><div className="mt-4 space-y-2">{members.map((member) => <button key={member.user_id} onClick={() => navigate(`/profile/${member.user_id}`)} className="flex w-full items-center gap-3 rounded-2xl border border-gray-100 p-3 text-left dark:border-gray-800">{member.avatar_url ? <img src={member.avatar_url} alt="" className="h-10 w-10 rounded-xl object-cover" /> : <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-600 font-black text-white">{(member.full_name || member.username || 'D').slice(0, 1).toUpperCase()}</div>}<div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-gray-900 dark:text-white">{member.username ? `@${member.username}` : member.full_name || 'DRIGHT User'}</p><p className="text-xs capitalize text-gray-400">{member.role}</p></div></button>)}</div></div></div>}
  </main>;
}
