import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageCircle, X, Send, Loader2,
  MessageSquare, CheckCheck, ChevronLeft, Search,
  CheckCircle, Plus, ExternalLink,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useUIPreferences } from '../lib/uiPreferences';
import type { ChatConversation, ChatMessage } from '../lib/types';
import { CONTEXT_TYPE_META } from '../lib/types';

const CHANNEL_OPTIONS: { key: ChatConversation['channel_type']; label: string; emoji: string }[] = [
  { key: 'product_question', label: 'Product', emoji: '🛍️' },
  { key: 'order_issue', label: 'Order', emoji: '📦' },
  { key: 'general', label: 'General', emoji: '💬' },
];

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function ChatSystem() {
  const { user, isAdmin } = useAuth();
  const { prefs: uiPrefs } = useUIPreferences();
  const [launcherOpen, setLauncherOpen] = useState(false);
  const ctxMeta = (conv: ChatConversation) =>
    CONTEXT_TYPE_META[conv.context_type] || CONTEXT_TYPE_META.general;

  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatChannel, setNewChatChannel] = useState<ChatConversation['channel_type']>('general');
  const [newChatProductId, setNewChatProductId] = useState('');
  const [newChatOrderId, setNewChatOrderId] = useState('');
  const [userProducts, setUserProducts] = useState<{ id: string; name: string }[]>([]);
  const [userOrders, setUserOrders] = useState<{ id: string; product_name: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [newChatSellerId, setNewChatSellerId] = useState('');
  const [newChatSellerSearch, setNewChatSellerSearch] = useState('');
  const [sellerSearchResults, setSellerSearchResults] = useState<{ id: string; full_name: string; email: string }[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const convChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const msgChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchConversations = async () => {
    if (!user) return;
    let q = supabase
      .from('chat_conversations')
      .select('*, products(name)')
      .order('last_message_at', { ascending: false, nullsFirst: false });

    if (!isAdmin) {
      q = q.or(`customer_id.eq.${user.id},seller_id.eq.${user.id}`);
    }

    const { data } = await q;
    if (!data) { setLoading(false); return; }

    const userIds = [...new Set(data.flatMap((c: Record<string, unknown>) => [c.customer_id, c.seller_id]).filter(Boolean))] as string[];
    const { data: usersData } = await supabase.from('users').select('id, full_name, email, avatar_url').in('id', userIds);
    const userMap = new Map((usersData || []).map(u => [u.id, u]));

    const enriched: ChatConversation[] = data.map((c: Record<string, unknown>) => {
      const products = c.products as { name: string } | null;
      return {
        ...(c as unknown as ChatConversation),
        customer_name: userMap.get(c.customer_id as string)?.full_name || userMap.get(c.customer_id as string)?.email || 'Unknown',
        customer_avatar: userMap.get(c.customer_id as string)?.avatar_url || null,
        seller_name: c.seller_id ? (userMap.get(c.seller_id as string)?.full_name || userMap.get(c.seller_id as string)?.email || 'Unknown') : null,
        product_name: products?.name || null,
        context_type: (c.context_type as ChatConversation['context_type']) || 'general',
        context_data: (c.context_data as ChatConversation['context_data']) || null,
      } as ChatConversation;
    });

    setConversations(enriched);
    setTotalUnread(enriched.reduce((sum, c) => sum + (c.customer_id === user.id ? c.customer_unread_count : c.seller_unread_count), 0));
    setLoading(false);
  };

  const fetchMessages = async (conversationId: string) => {
    const { data } = await supabase.from('chat_messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true });
    if (!data) return;
    const senderIds = [...new Set(data.map((m: ChatMessage) => m.sender_id))];
    const { data: usersData } = await supabase.from('users').select('id, full_name, email, avatar_url').in('id', senderIds);
    const userMap = new Map((usersData || []).map(u => [u.id, u]));
    setMessages(data.map((m: ChatMessage) => ({
      ...m,
      sender_name: userMap.get(m.sender_id)?.full_name || userMap.get(m.sender_id)?.email || 'User',
      sender_avatar: userMap.get(m.sender_id)?.avatar_url || null,
    })));
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  useEffect(() => {
    if (!user || !launcherOpen) return;
    fetchConversations();
    fetchUserProductsOrders();

    const name = `chat-widget-${user.id}`;
    const existing = supabase.getChannels().find(c => c.topic === `realtime:${name}`);
    if (existing) supabase.removeChannel(existing);

    const ch = supabase.channel(name)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_conversations' }, fetchConversations)
      .subscribe();
    convChannelRef.current = ch;

    return () => {
      if (convChannelRef.current) { supabase.removeChannel(convChannelRef.current); convChannelRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, launcherOpen]);

  useEffect(() => {
    if (!selectedConv) return;
    fetchMessages(selectedConv.id);
    markRead(selectedConv);

    const msgName = `chat-widget-msgs-${selectedConv.id}`;
    const existing = supabase.getChannels().find(c => c.topic === `realtime:${msgName}`);
    if (existing) supabase.removeChannel(existing);

    const ch = supabase.channel(msgName)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chat_messages',
        filter: `conversation_id=eq.${selectedConv.id}`,
      }, async (payload) => {
        const msg = payload.new as ChatMessage;
        if (msg.sender_id === user?.id) return;
        const { data: u } = await supabase.from('users').select('id, full_name, email, avatar_url').eq('id', msg.sender_id).maybeSingle();
        const enriched: ChatMessage = { ...msg, sender_name: u?.full_name || u?.email || 'User', sender_avatar: u?.avatar_url || null };
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, enriched]);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      })
      .subscribe();
    msgChannelRef.current = ch;

    return () => {
      if (msgChannelRef.current) { supabase.removeChannel(msgChannelRef.current); msgChannelRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConv?.id]);

  const markRead = async (conv: ChatConversation) => {
    if (!user) return;
    const isCustomer = conv.customer_id === user.id;
    const unread = isCustomer ? conv.customer_unread_count : conv.seller_unread_count;
    if (unread === 0) return;
    await supabase.from('chat_conversations').update({ [isCustomer ? 'customer_unread_count' : 'seller_unread_count']: 0 }).eq('id', conv.id);
  };

  const fetchUserProductsOrders = async () => {
    if (!user) return;
    const [{ data: prods }, { data: orders }] = await Promise.all([
      supabase.from('products').select('id, name').eq('uploaded_by', user.id).limit(20),
      supabase.from('sales_records').select('id, product_name').eq('marketer_id', user.id).limit(20),
    ]);
    if (prods) setUserProducts(prods);
    if (orders) setUserOrders(orders as { id: string; product_name: string }[]);
  };

  const handleSend = async () => {
    if (!newMessage.trim() || !selectedConv || !user || sending) return;
    const body = newMessage.trim();
    setNewMessage('');
    setSending(true);
    const optimisticMsg: ChatMessage = {
      id: `temp-${Date.now()}`, conversation_id: selectedConv.id, sender_id: user.id,
      body, status: 'sent', created_at: new Date().toISOString(),
      message_type: 'text' as const, reply_to_id: null, is_deleted: false,
      deleted_for_everyone: false, is_edited: false, metadata: null,
      sender_name: 'You', sender_avatar: null,
    };
    setMessages(prev => [...prev, optimisticMsg]);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    try {
      const { data } = await supabase.from('chat_messages').insert({ conversation_id: selectedConv.id, sender_id: user.id, body, status: 'sent' }).select().single();
      if (data) setMessages(prev => prev.map(m => m.id === optimisticMsg.id ? { ...m, ...data } : m));
      const isCustomer = selectedConv.customer_id === user.id;
      const otherCount = isCustomer ? 'seller_unread_count' : 'customer_unread_count';
      const currentOther = isCustomer ? selectedConv.seller_unread_count : selectedConv.customer_unread_count;
      await supabase.from('chat_conversations').update({ last_message: body.slice(0, 100), last_message_at: new Date().toISOString(), [otherCount]: (currentOther || 0) + 1 }).eq('id', selectedConv.id);
    } catch (err) {
      console.error('Send error:', err);
      setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id));
    } finally { setSending(false); }
  };

  const handleResolve = async (conv: ChatConversation) => {
    await supabase.from('chat_conversations').update({ status: 'resolved' }).eq('id', conv.id);
    setSelectedConv(prev => prev?.id === conv.id ? { ...prev, status: 'resolved' } : prev);
    fetchConversations();
  };

  const searchSellers = async (q: string) => {
    setNewChatSellerSearch(q);
    if (q.length < 2) { setSellerSearchResults([]); return; }
    const { data } = await supabase.from('users').select('id, full_name, email').ilike('full_name', `%${q}%`).neq('id', user?.id || '').limit(5);
    setSellerSearchResults(data || []);
  };

  const handleCreateConv = async () => {
    if (!user || !newChatSellerId) return;
    const { data, error } = await supabase.from('chat_conversations').insert({
      customer_id: user.id,
      seller_id: newChatSellerId,
      channel_type: newChatChannel,
      context_type: 'general',
      product_id: newChatChannel === 'product_question' ? newChatProductId || null : null,
      order_id: newChatChannel === 'order_issue' ? newChatOrderId || null : null,
      status: 'open',
    }).select().single();
    if (!error && data) {
      setShowNewChat(false);
      setNewChatSellerId('');
      setNewChatSellerSearch('');
      setSellerSearchResults([]);
      fetchConversations();
      const enriched: ChatConversation = { ...(data as ChatConversation), context_type: 'general', context_data: null };
      setSelectedConv(enriched);
    }
  };

  const filteredConversations = conversations.filter(c => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.customer_name?.toLowerCase().includes(q) ||
      c.seller_name?.toLowerCase().includes(q) ||
      c.product_name?.toLowerCase().includes(q) ||
      c.last_message?.toLowerCase().includes(q) ||
      (c.context_data?.title?.toLowerCase().includes(q) ?? false)
    );
  });

  if (!user) return null;

  const showFloating = uiPrefs.showFloatingChat;
  const unreadBadge = totalUnread > 0 && !launcherOpen;

  if (!showFloating) return null;

  return (
    <div className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-50 flex flex-col items-end gap-2">
      {/* Launcher FAB */}
      <AnimatePresence>
        {!launcherOpen && (
          <motion.button
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            onClick={() => setLauncherOpen(true)}
            className="relative w-14 h-14 bg-primary-600 hover:bg-primary-700 text-white rounded-full shadow-lg flex items-center justify-center transition-colors"
          >
            <MessageCircle className="w-6 h-6" />
            {unreadBadge && (
              <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 bg-error text-white text-xs font-bold rounded-full flex items-center justify-center">
                {totalUnread > 9 ? '9+' : totalUnread}
              </span>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat Window */}
      <AnimatePresence>
        {launcherOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="w-[360px] sm:w-96 h-[520px] bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden"
          >
            {selectedConv ? (
              /* Message View */
              <>
                <div className="flex items-center gap-3 p-3 border-b border-gray-100">
                  <button onClick={() => { setSelectedConv(null); setMessages([]); }} className="p-1 text-gray-400 hover:text-gray-700">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{ctxMeta(selectedConv).label.substring(0, 4)}</span>
                      <p className="font-medium text-gray-900 text-sm truncate">
                        {selectedConv.context_data?.title || selectedConv.product_name || ctxMeta(selectedConv).label}
                      </p>
                    </div>
                    <p className="text-xs text-gray-400">{selectedConv.customer_name}</p>
                  </div>
                  {selectedConv.status === 'open' && (
                    <button onClick={() => handleResolve(selectedConv)} className="p-1 text-gray-400 hover:text-success" title="Mark resolved">
                      <CheckCircle className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={() => setLauncherOpen(false)} className="p-1 text-gray-400 hover:text-gray-700">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {messages.length === 0 && (
                    <p className="text-center text-xs text-gray-400 mt-8">No messages yet. Say hello!</p>
                  )}
                  {messages.map(msg => {
                    const isOwn = msg.sender_id === user.id;
                    return (
                      <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${isOwn ? 'bg-primary-600 text-white rounded-br-md' : 'bg-gray-100 text-gray-900 rounded-bl-md'}`}>
                          {msg.body}
                          <div className={`flex items-center gap-1 mt-0.5 ${isOwn ? 'justify-end' : ''}`}>
                            <span className={`text-[10px] ${isOwn ? 'text-primary-200' : 'text-gray-400'}`}>
                              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {isOwn && (
                              msg.status === 'read'
                                ? <CheckCheck className="w-3 h-3 text-primary-200" />
                                : <CheckCheck className="w-3 h-3 text-primary-400" />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Composer */}
                {selectedConv.status !== 'open' ? (
                  <div className="p-3 text-center text-xs text-gray-400 border-t border-gray-50">Conversation resolved</div>
                ) : (
                  <div className="p-3 border-t border-gray-100 flex gap-2">
                    <input
                      value={newMessage}
                      onChange={e => setNewMessage(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                      placeholder="Type a message..."
                      className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary-400"
                    />
                    <button onClick={handleSend} disabled={!newMessage.trim() || sending}
                      className="w-9 h-9 bg-primary-600 text-white rounded-full flex items-center justify-center disabled:opacity-40 hover:bg-primary-700">
                      {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                  </div>
                )}
              </>
            ) : showNewChat ? (
              /* New Chat Form */
              <>
                <div className="flex items-center gap-3 p-3 border-b border-gray-100">
                  <button onClick={() => setShowNewChat(false)} className="p-1 text-gray-400 hover:text-gray-700">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <h3 className="font-semibold text-gray-900">New Conversation</h3>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Channel Type</label>
                    <div className="grid grid-cols-3 gap-2">
                      {CHANNEL_OPTIONS.map(({ key, label, emoji }) => (
                        <button key={key} onClick={() => setNewChatChannel(key)}
                          className={`p-3 rounded-xl border-2 flex flex-col items-center gap-1.5 transition-all ${
                            newChatChannel === key ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-primary-300'
                          }`}>
                          <span className="text-xl">{emoji}</span>
                          <span className="text-xs font-medium">{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Find User</label>
                    <input
                      value={newChatSellerSearch}
                      onChange={e => searchSellers(e.target.value)}
                      placeholder="Search by name..."
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary-400"
                    />
                    {sellerSearchResults.length > 0 && (
                      <div className="mt-2 border border-gray-200 rounded-xl overflow-hidden">
                        {sellerSearchResults.map(s => (
                          <button key={s.id} onClick={() => { setNewChatSellerId(s.id); setNewChatSellerSearch(s.full_name || s.email); setSellerSearchResults([]); }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 text-left text-sm">
                            <span className="font-medium">{s.full_name || s.email}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {newChatChannel === 'product_question' && userProducts.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Product</label>
                      <select value={newChatProductId} onChange={e => setNewChatProductId(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none">
                        <option value="">Select a product</option>
                        {userProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                  )}

                  {newChatChannel === 'order_issue' && userOrders.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Order</label>
                      <select value={newChatOrderId} onChange={e => setNewChatOrderId(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none">
                        <option value="">Select an order</option>
                        {userOrders.map(o => <option key={o.id} value={o.id}>{o.product_name}</option>)}
                      </select>
                    </div>
                  )}

                  <button onClick={handleCreateConv} disabled={!newChatSellerId}
                    className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                    <MessageSquare className="w-4 h-4" /> Start Chat
                  </button>
                </div>
              </>
            ) : (
              /* Conversation List */
              <>
                <div className="flex items-center justify-between p-3 border-b border-gray-100">
                  <h3 className="font-semibold text-gray-900">Messages</h3>
                  <div className="flex items-center gap-1">
                    <Link
                      to="/chat"
                      onClick={() => setLauncherOpen(false)}
                      className="p-1.5 text-gray-400 hover:text-primary-600 transition-colors"
                      title="Open full chat"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Link>
                    <button onClick={() => setShowNewChat(true)}
                      className="p-1.5 text-gray-400 hover:text-primary-600 transition-colors" title="New chat">
                      <Plus className="w-5 h-5" />
                    </button>
                    <button onClick={() => setLauncherOpen(false)} className="p-1.5 text-gray-400 hover:text-gray-700 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Search */}
                <div className="px-3 py-2 border-b border-gray-50">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search..."
                      className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-100 rounded-lg text-sm focus:outline-none focus:border-primary-300"
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-5 h-5 text-primary-500 animate-spin" />
                    </div>
                  ) : filteredConversations.length === 0 ? (
                    <div className="text-center py-10 px-4">
                      <MessageSquare className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                      <p className="text-sm text-gray-400">No conversations yet</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {filteredConversations.map(conv => {
                        const isCustomer = conv.customer_id === user.id;
                        const unread = isCustomer ? conv.customer_unread_count : conv.seller_unread_count;
                        const contextM = ctxMeta(conv);
                        return (
                          <button key={conv.id} onClick={() => setSelectedConv(conv)}
                            className={`w-full flex items-start gap-3 p-3 hover:bg-gray-50 transition-colors text-left ${unread > 0 ? 'bg-primary-50/30' : ''}`}>
                            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                              <MessageSquare className="w-5 h-5 text-gray-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <p className="font-medium text-gray-900 text-sm truncate">
                                  {conv.context_data?.title || conv.product_name || contextM.label}
                                </p>
                                <span className="text-xs text-gray-400 shrink-0">
                                  {conv.last_message_at ? relativeTime(conv.last_message_at) : ''}
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 truncate">
                                {conv.last_message || 'No messages yet'}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs text-gray-400">{contextM.label}</span>
                                {conv.status === 'resolved' && (
                                  <span className="px-1.5 py-0.5 bg-success-muted text-success text-xs rounded-full">Resolved</span>
                                )}
                                {unread > 0 && (
                                  <span className="ml-auto min-w-[18px] h-[18px] px-1 bg-error text-white text-xs font-bold rounded-full flex items-center justify-center">
                                    {unread > 9 ? '9+' : unread}
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
