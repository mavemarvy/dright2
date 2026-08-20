import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeft, MoreVertical, Search, Star, X, Pin } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { ChatConversation } from '../../lib/types';
import { CONTEXT_TYPE_META } from '../../lib/types';
import type { ChatMessage } from '../../lib/chatMessageType';
import { useMessages, useTypingIndicator, chatGroupDate, chatRelativeTime, unpinMessage } from '../../lib/chatHooks';
import { getTrustIndicators } from '../../lib/chatPart3Hooks';
import ReportModal from './ReportModal';
import MessageBubble from './MessageBubble';
import MessageComposer from './MessageComposer';
import ImageLightbox from './ImageLightbox';

interface MessageThreadProps {
  conversation: ChatConversation;
  userId: string;
  onBack?: () => void;
  onInfoToggle?: () => void;
}

export default function MessageThread({ conversation, userId, onBack, onInfoToggle }: MessageThreadProps) {
  const { messages, loading, refetch, loadMore, hasMore, loadingMore } = useMessages(conversation.id, userId);
  const { typingUserIds } = useTypingIndicator(conversation.id, userId);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [forwardMsg, setForwardMsg] = useState<ChatMessage | null>(null);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIdx, setLightboxIdx] = useState(0);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [searchIdx, setSearchIdx] = useState(0);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [pinnedMsgs, setPinnedMsgs] = useState<{ message_id: string; message?: ChatMessage }[]>([]);
  const [otherTrustBadge, setOtherTrustBadge] = useState<string | null>(null);
  const [reportMsg, setReportMsg] = useState<ChatMessage | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const isResolved = conversation.status !== 'open';
  const contextMeta = CONTEXT_TYPE_META[conversation.context_type];
  const otherUserId = conversation.customer_id === userId ? conversation.seller_id : conversation.customer_id;

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  useEffect(() => {
    if (messages.length === 0) return;
    const c = scrollContainerRef.current;
    if (!c) return;
    const isNear = c.scrollHeight - c.scrollTop - c.clientHeight < 200;
    if (isNear) scrollToBottom();
    else setShowScrollDown(true);
  }, [messages, scrollToBottom]);

  // Mark messages read
  useEffect(() => {
    if (!conversation.id || !userId) return;
    const unread = messages.filter(m => m.sender_id !== userId && m.status !== 'read');
    if (unread.length === 0) return;
    const ids = unread.map(m => m.id);
    supabase.from('chat_messages').update({ status: 'read' }).in('id', ids).then(() => {});
    const isCustomer = conversation.customer_id === userId;
    supabase.from('chat_conversations').update({ [isCustomer ? 'customer_unread_count' : 'seller_unread_count']: 0 }).eq('id', conversation.id).then(() => {});
  }, [messages, conversation.id, conversation.customer_id, userId]);

  // Load pinned messages
  useEffect(() => {
    if (!conversation.id) return;
    supabase.from('chat_pinned_messages').select('message_id, pinned_at').eq('conversation_id', conversation.id)
      .order('pinned_at', { ascending: false }).then(({ data }) => {
        if (data) {
          setPinnedMsgs(data.map(p => ({
            message_id: p.message_id,
            message: messages.find(m => m.id === p.message_id),
          })));
        }
      });
  }, [conversation.id, messages]);

  // Load trust indicator for the other user
  useEffect(() => {
    if (!otherUserId) return;
    getTrustIndicators(otherUserId).then(inds => {
      if (inds.length > 0) setOtherTrustBadge(inds[0].replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
    });
  }, [otherUserId]);

  // Search
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const q = searchQuery.toLowerCase();
    const ids = messages.filter(m => !m.is_deleted && m.body.toLowerCase().includes(q)).map(m => m.id);
    setSearchResults(ids);
    setSearchIdx(0);
  }, [searchQuery, messages]);

  const scrollToMsg = (id: string) => {
    const el = document.getElementById(`msg-${id}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleForwardSend = async (targetConvId: string) => {
    if (!forwardMsg) return;
    await supabase.from('chat_messages').insert({
      conversation_id: targetConvId,
      sender_id: userId,
      body: forwardMsg.body,
      status: 'sent',
      message_type: forwardMsg.message_type,
      metadata: forwardMsg.metadata,
    });
    await supabase.from('chat_conversations').update({ last_message: forwardMsg.body.slice(0, 100) || '[forwarded]', last_message_at: new Date().toISOString() }).eq('id', targetConvId);
    setForwardMsg(null);
  };
  void handleForwardSend; // wired via ForwardModal if needed in Part 3

  const groupedMessages = messages.reduce<{ date: string; msgs: ChatMessage[] }[]>((acc, msg) => {
    const label = chatGroupDate(msg.created_at);
    const last = acc[acc.length - 1];
    if (!last || last.date !== label) acc.push({ date: label, msgs: [msg] });
    else last.msgs.push(msg);
    return acc;
  }, []);

  return (
    <div className="flex flex-col h-full bg-gray-50 relative">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100 shadow-sm">
        {onBack && (
          <button onClick={onBack} className="p-1.5 -ml-1 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors" aria-label="Back">
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}

        <div className="relative shrink-0">
          {conversation.other_user_avatar ? (
            <img src={conversation.other_user_avatar} alt={conversation.other_user_name} className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
              <span className="text-sm font-bold text-primary-700">{(conversation.other_user_name || '?')[0].toUpperCase()}</span>
            </div>
          )}
          {conversation.other_user_is_online && (
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">{conversation.other_user_name}</p>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${contextMeta.bg} ${contextMeta.color} font-medium`}>
              {contextMeta.label}
            </span>
            {conversation.other_user_is_online ? (
              <span className="text-xs text-green-600">Online</span>
            ) : conversation.other_user_last_seen ? (
              <span className="text-xs text-gray-400">Seen {chatRelativeTime(conversation.other_user_last_seen)}</span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button onClick={() => setShowSearch(v => !v)} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors" aria-label="Search">
            <Search className="w-4 h-4" />
          </button>
          {onInfoToggle && (
            <button onClick={onInfoToggle} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors" aria-label="Info">
              <MoreVertical className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Context title */}
      {(conversation.context_data?.title || conversation.product_name) && (
        <div className="px-4 py-1.5 bg-white border-b border-gray-50 text-xs text-gray-500 truncate">
          {conversation.context_data?.title || conversation.product_name}
        </div>
      )}

      {/* Pinned messages bar */}
      {pinnedMsgs.length > 0 && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
          <Pin className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <button
            onClick={() => pinnedMsgs[0]?.message_id && scrollToMsg(pinnedMsgs[0].message_id)}
            className="flex-1 text-left text-xs text-amber-700 truncate hover:underline"
          >
            {pinnedMsgs[0]?.message?.body || 'Pinned message'}
          </button>
          <span className="text-xs text-amber-500">{pinnedMsgs.length > 1 ? `+${pinnedMsgs.length - 1}` : ''}</span>
          <button
            onClick={async () => {
              if (pinnedMsgs[0]?.message_id) {
                await unpinMessage(pinnedMsgs[0].message_id, conversation.id);
                setPinnedMsgs(prev => prev.slice(1));
              }
            }}
            className="text-amber-400 hover:text-amber-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Search bar */}
      {showSearch && (
        <div className="px-4 py-2 bg-white border-b border-gray-100 flex items-center gap-2">
          <input
            autoFocus
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search messages..."
            className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-1.5 focus:outline-none focus:border-primary-400"
          />
          {searchResults.length > 0 && (
            <>
              <span className="text-xs text-gray-500">{searchIdx + 1}/{searchResults.length}</span>
              <button onClick={() => { const i = Math.max(0, searchIdx - 1); setSearchIdx(i); scrollToMsg(searchResults[i]); }} className="p-1 text-gray-400 hover:text-gray-700">↑</button>
              <button onClick={() => { const i = Math.min(searchResults.length - 1, searchIdx + 1); setSearchIdx(i); scrollToMsg(searchResults[i]); }} className="p-1 text-gray-400 hover:text-gray-700">↓</button>
            </>
          )}
          <button onClick={() => { setShowSearch(false); setSearchQuery(''); }} className="p-1 text-gray-400 hover:text-gray-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Messages area */}
      <div
        ref={scrollContainerRef}
        onScroll={() => {
          const c = scrollContainerRef.current;
          if (!c) return;
          setShowScrollDown(c.scrollHeight - c.scrollTop - c.clientHeight > 100);
          if (c.scrollTop < 50 && hasMore && !loadingMore) loadMore();
        }}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-1"
      >
        {loadingMore && (
          <div className="flex items-center justify-center py-2">
            <div className="w-4 h-4 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 bg-primary-50 rounded-full flex items-center justify-center mb-3">
              <Star className="w-7 h-7 text-primary-300" />
            </div>
            <p className="text-gray-500 font-medium">Start the conversation</p>
            <p className="text-gray-400 text-sm mt-1">Send a message to begin</p>
          </div>
        ) : (
          groupedMessages.map(group => (
            <div key={group.date}>
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400 font-medium px-2">{group.date}</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              {group.msgs.map((msg, idx) => {
                const isOwn = msg.sender_id === userId;
                const prevMsg = idx > 0 ? group.msgs[idx - 1] : null;
                const showAvatar = !isOwn && (!prevMsg || prevMsg.sender_id !== msg.sender_id);
                const isSearchMatch = searchResults.includes(msg.id);
                const isActiveMatch = searchResults[searchIdx] === msg.id;

                return (
                  <div
                    key={msg.id}
                    id={`msg-${msg.id}`}
                    className={`${prevMsg && prevMsg.sender_id === msg.sender_id ? 'mt-0.5' : 'mt-3'} ${isActiveMatch ? 'ring-1 ring-primary-400 rounded-xl' : ''} ${isSearchMatch && !isActiveMatch ? 'bg-yellow-50/50 rounded-xl' : ''}`}
                  >
                    <MessageBubble
                      message={msg}
                      isOwn={isOwn}
                      showAvatar={showAvatar}
                      avatarUrl={conversation.other_user_avatar}
                      userName={conversation.other_user_name}
                      userId={userId}
                      conversationId={conversation.id}
                      onReply={setReplyTo}
                      onForward={setForwardMsg}
                      onImageClick={(url, all) => { setLightboxImages(all); setLightboxIdx(all.indexOf(url)); }}
                      onRefetch={refetch}
                      trustBadge={otherTrustBadge}
                      onReport={setReportMsg}
                    />
                  </div>
                );
              })}
            </div>
          ))
        )}

        {/* Typing indicator */}
        {typingUserIds.length > 0 && (
          <div className="flex items-center gap-2 mt-2">
            <div className="w-8 mr-2 shrink-0" />
            <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-md px-4 py-2.5 shadow-sm">
              <div className="flex gap-1 items-center">
                {[0, 150, 300].map(d => (
                  <span key={d} className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to bottom */}
      {showScrollDown && (
        <button
          onClick={() => { scrollToBottom(); setShowScrollDown(false); }}
          className="absolute bottom-24 right-6 w-9 h-9 bg-white border border-gray-200 rounded-full shadow-md flex items-center justify-center text-gray-600 hover:bg-gray-50 z-10"
        >
          ↓
        </button>
      )}

      {/* Composer */}
      <MessageComposer
        conversation={conversation}
        userId={userId}
        replyTo={replyTo}
        onClearReply={() => setReplyTo(null)}
        onMessageSent={() => { refetch(); scrollToBottom(); }}
        disabled={isResolved}
        recentMessages={messages}
      />

      {/* Report modal */}
      <ReportModal
        isOpen={!!reportMsg}
        onClose={() => setReportMsg(null)}
        reporterId={userId}
        reportedUserId={reportMsg?.sender_id || otherUserId || ''}
        conversationId={conversation.id}
        messageId={reportMsg?.id}
      />

      {/* Forward modal (simple — full UI in Part 3) */}
      {forwardMsg && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setForwardMsg(null)}>
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">Forward Message</h3>
              <button onClick={() => setForwardMsg(null)}><X className="w-4 h-4 text-gray-400" /></button>
            </div>
            <p className="text-sm text-gray-500 border border-gray-100 rounded-xl p-3 bg-gray-50 truncate">
              {forwardMsg.message_type !== 'text' ? `[${forwardMsg.message_type}]` : forwardMsg.body}
            </p>
            <p className="text-xs text-gray-400 mt-3 text-center">Forward conversation sharing available in the next update.</p>
          </div>
        </div>
      )}

      {/* Image lightbox */}
      {lightboxImages.length > 0 && (
        <ImageLightbox
          images={lightboxImages}
          initialIndex={lightboxIdx}
          onClose={() => setLightboxImages([])}
        />
      )}
    </div>
  );
}
