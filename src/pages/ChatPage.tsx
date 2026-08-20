import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { MessageCircle, ShoppingBag } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useConversations, usePresence } from '../lib/chatHooks';
import {
  useArchivedConversations, useFavorites, usePinnedConversations,
  bulkMarkRead, bulkMarkUnread,
} from '../lib/chatPart3Hooks';
import { supabase } from '../lib/supabase';
import type { ChatConversation } from '../lib/types';
import ConversationList from '../components/chat/ConversationList';
import MessageThread from '../components/chat/MessageThread';
import ContextPanel from '../components/chat/ContextPanel';

export default function ChatPage() {
  const { user, isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const convParam = searchParams.get('conv');

  const { conversations, loading, refetch } = useConversations(user?.id || null, isAdmin);
  const { archive, unarchive, bulkArchive, bulkUnarchive } = useArchivedConversations(user?.id || null);
  const { toggleFavorite, bulkFavorite } = useFavorites(user?.id || null);
  const { pin, unpin, pinLimit } = usePinnedConversations(user?.id || null);
  const [selectedConv, setSelectedConv] = useState<ChatConversation | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [mobileView, setMobileView] = useState<'list' | 'thread'>('list');
  const [pinnedCount, setPinnedCount] = useState(0);

  usePresence(user?.id || null);

  useEffect(() => {
    if (!user) return;
    supabase.from('chat_pinned_conversations').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
      .then(({ count }) => setPinnedCount(count || 0));
  }, [user]);

  const refreshPinnedCount = useCallback(() => {
    if (!user) return;
    supabase.from('chat_pinned_conversations').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
      .then(({ count }) => setPinnedCount(count || 0));
  }, [user]);

  useEffect(() => {
    if (!convParam || conversations.length === 0) return;
    const found = conversations.find(c => c.id === convParam);
    if (found) {
      setSelectedConv(found);
      setMobileView('thread');
    }
  }, [convParam, conversations]);

  const handleSelectConv = (conv: ChatConversation) => {
    setSelectedConv(conv);
    setMobileView('thread');
    setSearchParams({ conv: conv.id });
  };

  const handleBack = () => {
    setMobileView('list');
    setSelectedConv(null);
    setSearchParams({});
  };

  const handleResolved = () => {
    refetch();
    setSelectedConv(prev => prev ? { ...prev, status: 'resolved' } : prev);
  };

  const handleArchive = async (convId: string) => {
    await archive(convId);
    refetch();
  };
  const handleUnarchive = async (convId: string) => {
    await unarchive(convId);
    refetch();
  };
  const handleToggleFavorite = async (convId: string) => {
    await toggleFavorite(convId);
    refetch();
  };
  const handlePin = async (convId: string) => {
    if (pinnedCount >= pinLimit) return;
    await pin(convId);
    refreshPinnedCount();
    refetch();
  };
  const handleUnpin = async (convId: string) => {
    await unpin(convId);
    refreshPinnedCount();
    refetch();
  };

  const handleBulkArchive = async (ids: string[]) => { await bulkArchive(ids); refetch(); };
  const handleBulkRestore = async (ids: string[]) => { await bulkUnarchive(ids); refetch(); };
  const handleBulkDelete = async (ids: string[]) => {
    for (const id of ids) {
      await supabase.from('chat_archived_conversations').delete().eq('conversation_id', id).eq('user_id', user?.id);
    }
    refetch();
  };
  const handleBulkMarkRead = async (ids: string[]) => { if (user) { await bulkMarkRead(ids, user.id); refetch(); } };
  const handleBulkMarkUnread = async (ids: string[]) => { if (user) { await bulkMarkUnread(ids, user.id); refetch(); } };
  const handleBulkFavorite = async (ids: string[]) => { await bulkFavorite(ids); refetch(); };
  const handleBulkPin = async (ids: string[]) => {
    const remaining = pinLimit - pinnedCount;
    const toPin = ids.slice(0, Math.max(0, remaining));
    for (const id of toPin) { await pin(id); }
    refreshPinnedCount();
    refetch();
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <div className="w-20 h-20 bg-primary-50 rounded-full flex items-center justify-center mb-4">
          <MessageCircle className="w-10 h-10 text-primary-400" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Sign in to access Messages</h2>
        <p className="text-gray-500 mb-6">Chat with sellers, employers, and stores on DRIGHT.</p>
        <Link to="/sign-in" className="px-6 py-3 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-colors">
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-white">
      <div className={`${mobileView === 'thread' ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-80 lg:w-96 shrink-0 border-r border-gray-100`}>
        <ConversationList
          conversations={conversations}
          loading={loading}
          selectedId={selectedConv?.id || null}
          userId={user.id}
          isAdmin={isAdmin}
          onArchive={handleArchive}
          onUnarchive={handleUnarchive}
          onToggleFavorite={handleToggleFavorite}
          onPin={handlePin}
          onUnpin={handleUnpin}
          onBulkArchive={handleBulkArchive}
          onBulkRestore={handleBulkRestore}
          onBulkDelete={handleBulkDelete}
          onBulkMarkRead={handleBulkMarkRead}
          onBulkMarkUnread={handleBulkMarkUnread}
          onBulkFavorite={handleBulkFavorite}
          onBulkPin={handleBulkPin}
          onSelect={handleSelectConv}
        />
        {!loading && conversations.length === 0 && (
          <div className="p-4 border-t border-gray-50">
            <Link to="/market" className="flex items-center justify-center gap-2 w-full py-3 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 transition-colors">
              <ShoppingBag className="w-4 h-4" /> Browse Marketplace
            </Link>
          </div>
        )}
      </div>

      <div className={`${mobileView === 'list' ? 'hidden md:flex' : 'flex'} flex-col flex-1 min-w-0 relative`}>
        {selectedConv ? (
          <MessageThread
            key={selectedConv.id}
            conversation={selectedConv}
            userId={user.id}
            onBack={handleBack}
            onInfoToggle={() => setShowInfo(v => !v)}
          />
        ) : (
          <div className="hidden md:flex flex-col items-center justify-center h-full text-center px-8">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <MessageCircle className="w-10 h-10 text-gray-300" />
            </div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">Select a conversation</h3>
            <p className="text-gray-400 text-sm max-w-xs">
              Choose a conversation from the left, or start a new one by messaging a seller, store, or employer.
            </p>
          </div>
        )}
      </div>

      {selectedConv && showInfo && (
        <div className="hidden lg:flex flex-col w-72 xl:w-80 shrink-0">
          <ContextPanel
            conversation={selectedConv}
            userId={user.id}
            onClose={() => setShowInfo(false)}
            onResolved={handleResolved}
          />
        </div>
      )}
    </div>
  );
}
