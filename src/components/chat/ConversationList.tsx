import { useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageCircle, Search, Pin, CheckCheck, ShoppingBag,
  Package, MessageSquare, Briefcase, Store, Headphones,
  Users, Archive, Star, AlertTriangle, MoreVertical,
  CheckSquare, Square, Trash2, BellOff,
} from 'lucide-react';
import type { ChatConversation, ChatContextType } from '../../lib/types';
import { CONTEXT_TYPE_META } from '../../lib/types';
import { chatRelativeTime } from '../../lib/chatHooks';
import type { ChatLabel } from '../../lib/chatTypes';

type FilterTab =
  | 'all' | 'unread' | 'products' | 'services' | 'jobs'
  | 'stores' | 'support' | 'archived' | 'favorites' | 'pinned'
  | 'awaiting_reply' | 'high_priority' | 'blocked';

const CONTEXT_ICONS: Record<ChatContextType, React.ElementType> = {
  product_inquiry: ShoppingBag,
  service_inquiry: Package,
  job_application: Briefcase,
  store_inquiry: Store,
  order_support: Package,
  admin_support: Headphones,
  affiliate_support: Users,
  general: MessageSquare,
};

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'products', label: 'Products' },
  { id: 'services', label: 'Services' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'stores', label: 'Stores' },
  { id: 'support', label: 'Support' },
  { id: 'archived', label: 'Archived' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'pinned', label: 'Pinned' },
];

interface ConversationListProps {
  conversations: ChatConversation[];
  loading: boolean;
  selectedId: string | null;
  userId: string;
  isAdmin?: boolean;
  labels?: ChatLabel[];
  onArchive?: (convId: string) => void;
  onUnarchive?: (convId: string) => void;
  onToggleFavorite?: (convId: string) => void;
  onPin?: (convId: string) => void;
  onUnpin?: (convId: string) => void;
  onBulkArchive?: (ids: string[]) => void;
  onBulkRestore?: (ids: string[]) => void;
  onBulkDelete?: (ids: string[]) => void;
  onBulkMarkRead?: (ids: string[]) => void;
  onBulkMarkUnread?: (ids: string[]) => void;
  onBulkFavorite?: (ids: string[]) => void;
  onBulkPin?: (ids: string[]) => void;
  onSelect: (conv: ChatConversation) => void;
}

export default function ConversationList({
  conversations,
  loading,
  selectedId,
  userId,
  isAdmin = false,
  onArchive,
  onUnarchive,
  onToggleFavorite,
  onPin,
  onUnpin,
  onBulkArchive,
  onBulkRestore,
  onBulkDelete,
  onBulkMarkRead,
  onBulkMarkUnread,
  onBulkFavorite,
  onBulkPin,
  onSelect,
}: ConversationListProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterTab>('all');
  const [bulkMode, setBulkMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [swipeOffset, setSwipeOffset] = useState<number>(0);
  const touchStartRef = useRef<number | null>(null);
  const touchConvRef = useRef<string | null>(null);
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    let result = conversations;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(c =>
        c.other_user_name?.toLowerCase().includes(q) ||
        c.product_name?.toLowerCase().includes(q) ||
        c.last_message?.toLowerCase().includes(q) ||
        (c.context_data?.title?.toLowerCase().includes(q) ?? false)
      );
    }

    switch (filter) {
      case 'unread':
        result = result.filter(c => {
          const unread = c.customer_id === userId ? c.customer_unread_count : c.seller_unread_count;
          return unread > 0 && !c.is_archived;
        });
        break;
      case 'products':
        result = result.filter(c => c.context_type === 'product_inquiry' && !c.is_archived);
        break;
      case 'services':
        result = result.filter(c => c.context_type === 'service_inquiry' && !c.is_archived);
        break;
      case 'jobs':
        result = result.filter(c => c.context_type === 'job_application' && !c.is_archived);
        break;
      case 'stores':
        result = result.filter(c => c.context_type === 'store_inquiry' && !c.is_archived);
        break;
      case 'support':
        result = result.filter(c => ['order_support', 'admin_support', 'affiliate_support'].includes(c.context_type) && !c.is_archived);
        break;
      case 'archived':
        result = result.filter(c => c.is_archived);
        break;
      case 'favorites':
        result = result.filter(c => c.is_favorite && !c.is_archived);
        break;
      case 'pinned':
        result = result.filter(c => c.is_pinned_by_user && !c.is_archived);
        break;
      case 'awaiting_reply':
        result = result.filter(c =>
          c.last_message && !c.is_archived && c.other_user_id !== userId
        );
        break;
      case 'high_priority':
        result = result.filter(c => c.is_flagged && !c.is_archived);
        break;
      case 'blocked':
        result = isAdmin ? result.filter(c => c.is_flagged) : [];
        break;
    }

    if (filter !== 'archived') {
      result = result.filter(c => !c.is_archived);
    }

    const pinned = result.filter(c => c.is_pinned_by_user);
    const unpinned = result.filter(c => !c.is_pinned_by_user);
    return [...pinned, ...unpinned];
  }, [conversations, search, filter, userId, isAdmin]);

  const totalUnread = conversations.reduce((sum, c) => {
    if (c.is_archived) return sum;
    return sum + (c.customer_id === userId ? c.customer_unread_count : c.seller_unread_count);
  }, 0);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(filtered.map(c => c.id)));
  const clearSelection = () => { setSelected(new Set()); setBulkMode(false); };

  const handleBulkAction = (action: () => void) => {
    action();
    clearSelection();
  };

  const handleConvMenu = (conv: ChatConversation, action: string) => {
    setOpenMenuId(null);
    switch (action) {
      case 'archive': onArchive?.(conv.id); break;
      case 'unarchive': onUnarchive?.(conv.id); break;
      case 'favorite': onToggleFavorite?.(conv.id); break;
      case 'pin': onPin?.(conv.id); break;
      case 'unpin': onUnpin?.(conv.id); break;
    }
  };

  // Swipe-to-archive on mobile
  const handleTouchStart = (e: React.TouchEvent, convId: string) => {
    touchStartRef.current = e.touches[0].clientX;
    touchConvRef.current = convId;
    setSwipeOffset(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartRef.current === null) return;
    const delta = e.touches[0].clientX - touchStartRef.current;
    if (delta < 0 && delta > -120) setSwipeOffset(delta);
  };

  const handleTouchEnd = (convId: string) => {
    if (swipeOffset < -80) {
      onArchive?.(convId);
    }
    setSwipeOffset(0);
    touchStartRef.current = null;
    touchConvRef.current = null;
  };

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-100">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-gray-900">Messages</h2>
            {totalUnread > 0 && (
              <span className="min-w-[20px] h-5 px-1.5 bg-primary-600 text-white text-xs font-bold rounded-full flex items-center justify-center">
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            )}
          </div>
          <button
            onClick={() => { setBulkMode(!bulkMode); clearSelection(); }}
            className={`p-1.5 rounded-lg transition-colors ${bulkMode ? 'bg-primary-100 text-primary-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
            title="Bulk select"
          >
            <CheckSquare className="w-4 h-4" />
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search conversations..."
            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-100"
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 px-3 py-2 overflow-x-auto scrollbar-hide border-b border-gray-50">
        {FILTER_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === tab.id
                ? 'bg-primary-600 text-white'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
        {isAdmin && (
          <button
            onClick={() => setFilter('blocked')}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === 'blocked' ? 'bg-red-600 text-white' : 'text-red-500 hover:bg-red-50'
            }`}
          >
            Flagged
          </button>
        )}
      </div>

      {/* Bulk action bar */}
      {bulkMode && selected.size > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-primary-50 border-b border-primary-100 overflow-x-auto scrollbar-hide">
          <span className="text-xs font-medium text-primary-700 shrink-0">{selected.size} selected</span>
          <div className="flex gap-1 ml-auto">
            {filter === 'archived' ? (
              <button onClick={() => handleBulkAction(() => onBulkRestore?.([...selected]))}
                className="p-1.5 text-green-600 hover:bg-green-100 rounded-lg" title="Restore">
                <Archive className="w-4 h-4 rotate-180" />
              </button>
            ) : (
              <button onClick={() => handleBulkAction(() => onBulkArchive?.([...selected]))}
                className="p-1.5 text-gray-600 hover:bg-gray-200 rounded-lg" title="Archive">
                <Archive className="w-4 h-4" />
              </button>
            )}
            <button onClick={() => handleBulkAction(() => onBulkMarkRead?.([...selected]))}
              className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg" title="Mark Read">
              <CheckCheck className="w-4 h-4" />
            </button>
            <button onClick={() => handleBulkAction(() => onBulkMarkUnread?.([...selected]))}
              className="p-1.5 text-gray-600 hover:bg-gray-200 rounded-lg" title="Mark Unread">
              <BellOff className="w-4 h-4" />
            </button>
            <button onClick={() => handleBulkAction(() => onBulkFavorite?.([...selected]))}
              className="p-1.5 text-amber-500 hover:bg-amber-100 rounded-lg" title="Favorite">
              <Star className="w-4 h-4" />
            </button>
            <button onClick={() => handleBulkAction(() => onBulkPin?.([...selected]))}
              className="p-1.5 text-primary-600 hover:bg-primary-100 rounded-lg" title="Pin">
              <Pin className="w-4 h-4" />
            </button>
            {filter === 'archived' && (
              <button onClick={() => handleBulkAction(() => onBulkDelete?.([...selected]))}
                className="p-1.5 text-red-500 hover:bg-red-100 rounded-lg" title="Delete">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {bulkMode && selected.size === 0 && (
        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
          <span className="text-xs text-gray-500">Tap conversations to select</span>
          <button onClick={selectAll} className="text-xs text-primary-600 font-medium">Select all</button>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-3 p-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-12 h-12 bg-gray-100 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-gray-100 rounded w-2/3" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <MessageCircle className="w-12 h-12 text-gray-200 mb-3" />
            <p className="text-gray-500 font-medium">
              {search ? 'No results found' : filter === 'archived' ? 'No archived conversations' : filter === 'favorites' ? 'No favorites yet' : 'No conversations yet'}
            </p>
            {!search && filter === 'all' && (
              <p className="text-gray-400 text-sm mt-1">
                Start by contacting a seller from the Marketplace.
              </p>
            )}
          </div>
        ) : (
          <div>
            {filtered.map(conv => {
              const isCustomer = conv.customer_id === userId;
              const unread = isCustomer ? conv.customer_unread_count : conv.seller_unread_count;
              const isSelected = conv.id === selectedId;
              const isBulkSelected = selected.has(conv.id);
              const ContextIcon = CONTEXT_ICONS[conv.context_type] || MessageSquare;
              const contextMeta = CONTEXT_TYPE_META[conv.context_type];
              const title = conv.context_data?.title || conv.product_name || conv.other_user_name || 'Conversation';
              const lastMsg = conv.last_message || 'No messages yet';
              const isSwipeTarget = touchConvRef.current === conv.id;

              return (
                <div
                  key={conv.id}
                  className="relative overflow-hidden"
                >
                  {/* Swipe archive background */}
                  {isSwipeTarget && (
                    <div className="absolute inset-0 bg-red-50 flex items-center justify-end pr-6 z-0">
                      <Archive className="w-5 h-5 text-red-500" />
                    </div>
                  )}

                  <button
                    onClick={() => bulkMode ? toggleSelect(conv.id) : onSelect(conv)}
                    onTouchStart={e => handleTouchStart(e, conv.id)}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={() => handleTouchEnd(conv.id)}
                    style={isSwipeTarget ? { transform: `translateX(${swipeOffset}px)` } : undefined}
                    className={`relative z-10 w-full flex items-start gap-3 px-4 py-3.5 text-left transition-transform border-b border-gray-50 last:border-0 ${
                      isSelected
                        ? 'bg-primary-50 border-l-2 border-l-primary-600'
                        : isBulkSelected
                        ? 'bg-primary-25'
                        : unread > 0 && !conv.is_archived
                        ? 'bg-blue-50/30 hover:bg-blue-50/50'
                        : 'hover:bg-gray-50'
                    } ${conv.is_archived ? 'opacity-60' : ''}`}
                  >
                    {/* Bulk checkbox */}
                    {bulkMode && (
                      <div className="shrink-0 mt-1">
                        {isBulkSelected
                          ? <CheckSquare className="w-5 h-5 text-primary-600" />
                          : <Square className="w-5 h-5 text-gray-300" />
                        }
                      </div>
                    )}

                    <div className="relative shrink-0" onClick={(e) => { e.stopPropagation(); if (conv.other_user_id) navigate(`/profile/${conv.other_user_id}`); }}>
                      {conv.other_user_avatar ? (
                        <img
                          src={conv.other_user_avatar}
                          alt={conv.other_user_name}
                          className="w-12 h-12 rounded-full object-cover cursor-pointer hover:ring-2 hover:ring-primary-400 transition-all"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-primary-400 transition-all">
                          <span className="text-lg font-bold text-gray-400">
                            {(conv.other_user_name || '?')[0].toUpperCase()}
                          </span>
                        </div>
                      )}
                      {conv.other_user_is_online && (
                        <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {conv.is_pinned_by_user && <Pin className="w-3 h-3 text-primary-500 shrink-0" />}
                          {conv.is_favorite && <Star className="w-3 h-3 text-amber-400 fill-current shrink-0" />}
                          {conv.is_flagged && <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />}
                          <span
                            className={`text-sm truncate cursor-pointer hover:text-primary-600 ${unread > 0 && !conv.is_archived ? 'font-bold text-gray-900' : 'font-medium text-gray-800'}`}
                            onClick={(e) => { e.stopPropagation(); if (conv.other_user_id) navigate(`/profile/${conv.other_user_id}`); }}
                          >
                            {conv.other_user_name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {conv.is_archived && <Archive className="w-3 h-3 text-gray-400" />}
                          <span className="text-xs text-gray-400">
                            {conv.last_message_at ? chatRelativeTime(conv.last_message_at) : ''}
                          </span>
                          {!bulkMode && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === conv.id ? null : conv.id); }}
                              className="p-0.5 text-gray-300 hover:text-gray-600 rounded"
                            >
                              <MoreVertical className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <p className="text-xs text-gray-500 truncate mb-1.5">
                        {title !== conv.other_user_name ? title : ''}
                      </p>

                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-xs truncate ${unread > 0 && !conv.is_archived ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
                          {lastMsg}
                        </p>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${contextMeta.bg} ${contextMeta.color} flex items-center gap-1`}>
                            <ContextIcon className="w-2.5 h-2.5" />
                          </span>
                          {unread > 0 && !conv.is_archived && (
                            <span className="min-w-[18px] h-[18px] px-1 bg-primary-600 text-white text-xs font-bold rounded-full flex items-center justify-center">
                              {unread > 9 ? '9+' : unread}
                            </span>
                          )}
                          {unread === 0 && conv.last_message && !conv.is_archived && (
                            <CheckCheck className="w-3.5 h-3.5 text-primary-500" />
                          )}
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* Per-conversation dropdown menu */}
                  {openMenuId === conv.id && (
                    <div className="absolute right-4 top-12 z-20 bg-white rounded-xl shadow-lg border border-gray-100 py-1 min-w-[160px]">
                      {conv.is_archived ? (
                        <button onClick={() => handleConvMenu(conv, 'unarchive')}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">
                          <Archive className="w-3.5 h-3.5 rotate-180" /> Restore
                        </button>
                      ) : (
                        <button onClick={() => handleConvMenu(conv, 'archive')}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">
                          <Archive className="w-3.5 h-3.5" /> Archive
                        </button>
                      )}
                      <button onClick={() => handleConvMenu(conv, 'favorite')}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">
                        <Star className="w-3.5 h-3.5" /> {conv.is_favorite ? 'Remove Favorite' : 'Add to Favorites'}
                      </button>
                      {conv.is_pinned_by_user ? (
                        <button onClick={() => handleConvMenu(conv, 'unpin')}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">
                          <Pin className="w-3.5 h-3.5" /> Unpin
                        </button>
                      ) : (
                        <button onClick={() => handleConvMenu(conv, 'pin')}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">
                          <Pin className="w-3.5 h-3.5" /> Pin
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {filtered.length >= 100 && (
        <div className="p-3 text-center border-t border-gray-50">
          <button className="flex items-center gap-1.5 text-xs text-gray-400 mx-auto hover:text-gray-600">
            <MoreVertical className="w-3 h-3" /> Load older conversations
          </button>
        </div>
      )}

      {/* Click-away for menu */}
      {openMenuId && (
        <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
      )}
    </div>
  );
}
