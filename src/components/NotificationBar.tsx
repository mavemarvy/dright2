import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell, Check, CheckCheck, Loader2,
  CheckCircle, XCircle, ShoppingCart, Package, MessageCircle,
  Megaphone, AlertCircle, ChevronLeft, Filter,
  Users, Star, Wallet, Briefcase, Calendar, TrendingUp, UserPlus,
  Shield, Gift, Store, Sparkles, FileText, Flag,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { NotificationItem, NotificationType } from '../lib/types';

const TYPE_LABELS: Record<NotificationType, string> = {
  edit_approved: 'Edit Approved',
  edit_rejected: 'Edit Rejected',
  new_order: 'New Order',
  order_status: 'Order Status',
  chat_message: 'Chat Message',
  announcement: 'Announcement',
  system_alert: 'System Alert',
  referral_signup: 'Referral Signup',
  new_message: 'New Message',
  attachment_received: 'Attachment',
  conversation_started: 'New Conversation',
  report_created: 'Report Filed',
  service_booking: 'Service Booking',
  job_application: 'Job Application',
  wallet_withdrawal: 'Withdrawal',
  wallet_deposit: 'Deposit',
  affiliate_commission: 'Commission',
  referral_commission: 'Referral Commission',
  new_follower: 'New Follower',
  new_review: 'New Review',
  security_alert: 'Security Alert',
  promotion: 'Promotion',
  admin_notice: 'Admin Notice',
  ai_summary: 'AI Summary',
  store_update: 'Store Update',
  low_stock: 'Low Stock',
};

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function NotificationBar() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<NotificationType | 'all'>('all');
  const [historyPage, setHistoryPage] = useState(0);
  const [historyData, setHistoryData] = useState<NotificationItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const PAGE_SIZE = 10;

  useEffect(() => {
    if (!user) return;
    fetchNotifications();

    // Use a stable channel name based on user ID — create it fresh each time
    const channelName = `notif-${user.id}`;

    // Remove any existing channel with this name before subscribing
    const existing = supabase.getChannels().find(c => c.topic === `realtime:${channelName}`);
    if (existing) supabase.removeChannel(existing);

    const ch = supabase.channel(channelName, { config: { broadcast: { self: false } } });
    ch.on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'notifications',
      filter: `user_id=eq.${user.id}`,
    }, (payload) => {
      const newNotif = payload.new as NotificationItem;
      setNotifications(prev => [newNotif, ...prev].slice(0, 20));
      setUnreadCount(prev => prev + 1);
    });
    ch.on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'notifications',
      filter: `user_id=eq.${user.id}`,
    }, (payload) => {
      const updated = payload.new as NotificationItem;
      setNotifications(prev => prev.map(n => n.id === updated.id ? updated : n));
      setUnreadCount(prev => Math.max(0, prev - (updated.is_read ? 1 : 0)));
    });
    ch.subscribe();
    channelRef.current = ch;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [user]);

  const fetchNotifications = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      const items = (data || []) as NotificationItem[];
      setNotifications(items);
      setUnreadCount(items.filter(n => !n.is_read).length);
    } catch (err) {
      console.error('Error fetching notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).eq('id', id);
  };

  const markAllRead = async () => {
    if (!user) return;
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length === 0) return;
    await supabase.from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).in('id', unreadIds);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  const fetchHistory = async (page: number, filter: NotificationType | 'all') => {
    if (!user) return;
    setHistoryLoading(true);
    try {
      let query = supabase.from('notifications').select('*').eq('user_id', user.id);
      if (filter !== 'all') query = query.eq('notification_type', filter);
      query = query.order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      const { data } = await query;
      setHistoryData((data || []) as NotificationItem[]);
    } catch (err) {
      console.error('History fetch error:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const openHistory = () => {
    setShowHistory(true);
    setHistoryPage(0);
    setHistoryFilter('all');
    fetchHistory(0, 'all');
  };

  const changeHistoryFilter = (filter: NotificationType | 'all') => {
    setHistoryFilter(filter);
    setHistoryPage(0);
    fetchHistory(0, filter);
  };

  const changeHistoryPage = (delta: number) => {
    const newPage = Math.max(0, historyPage + delta);
    setHistoryPage(newPage);
    fetchHistory(newPage, historyFilter);
  };

  const getIcon = (type: NotificationType) => {
    const iconMap: Record<NotificationType, typeof Bell> = {
      edit_approved: CheckCircle,
      edit_rejected: XCircle,
      new_order: ShoppingCart,
      order_status: Package,
      chat_message: MessageCircle,
      announcement: Megaphone,
      system_alert: AlertCircle,
      referral_signup: Users,
      new_message: MessageCircle,
      attachment_received: FileText,
      conversation_started: MessageCircle,
      report_created: Flag,
      service_booking: Calendar,
      job_application: Briefcase,
      wallet_withdrawal: Wallet,
      wallet_deposit: Wallet,
      affiliate_commission: TrendingUp,
      referral_commission: Users,
      new_follower: UserPlus,
      new_review: Star,
      security_alert: Shield,
      promotion: Gift,
      admin_notice: Megaphone,
      ai_summary: Sparkles,
      store_update: Store,
      low_stock: AlertCircle,
    };
    return iconMap[type] || Bell;
  };

  const getIconColor = (type: NotificationType): string => {
    const colorMap: Record<NotificationType, string> = {
      edit_approved: 'bg-success-muted text-success',
      edit_rejected: 'bg-error-muted text-error',
      new_order: 'bg-primary-50 text-primary-700',
      order_status: 'bg-blue-50 text-blue-600',
      chat_message: 'bg-purple-50 text-purple-600',
      announcement: 'bg-warning-muted text-warning',
      system_alert: 'bg-error-muted text-error',
      referral_signup: 'bg-primary-50 text-primary-700',
      new_message: 'bg-purple-50 text-purple-600',
      attachment_received: 'bg-gray-100 text-gray-600',
      conversation_started: 'bg-purple-50 text-purple-600',
      report_created: 'bg-red-50 text-red-600',
      service_booking: 'bg-teal-50 text-teal-600',
      job_application: 'bg-indigo-50 text-indigo-600',
      wallet_withdrawal: 'bg-yellow-50 text-yellow-600',
      wallet_deposit: 'bg-yellow-50 text-yellow-600',
      affiliate_commission: 'bg-cyan-50 text-cyan-600',
      referral_commission: 'bg-pink-50 text-pink-600',
      new_follower: 'bg-violet-50 text-violet-600',
      new_review: 'bg-amber-50 text-amber-600',
      security_alert: 'bg-red-50 text-red-600',
      promotion: 'bg-fuchsia-50 text-fuchsia-600',
      admin_notice: 'bg-orange-50 text-orange-600',
      ai_summary: 'bg-emerald-50 text-emerald-600',
      store_update: 'bg-slate-100 text-slate-600',
      low_stock: 'bg-error-muted text-error',
    };
    return colorMap[type] || 'bg-gray-100 text-gray-600';
  };

  const renderNotification = (n: NotificationItem) => {
    const Icon = getIcon((n.notification_type ?? n.type) as typeof n.type);
    return (
      <div key={n.id} className={`flex items-start gap-3 p-3 rounded-xl transition-colors ${n.is_read ? '' : 'bg-primary-50/50'}`}>
        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${getIconColor((n.notification_type ?? n.type) as typeof n.type)}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900">{n.title}</p>
          <p className="text-sm text-gray-500 truncate">{n.message}</p>
          <p className="text-xs text-gray-400 mt-0.5">{relativeTime(n.created_at)}</p>
        </div>
        {!n.is_read && (
          <button onClick={() => markAsRead(n.id)}
            className="p-1.5 text-gray-400 hover:text-primary-600 transition-colors shrink-0"
            title="Mark as read">
            <Check className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  };

  if (!user) return null;

  return (
    <>
      {/* Bell Button */}
      <button onClick={() => setOpen(!open)}
        className="relative p-2 rounded-xl text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
        aria-label="Notifications">
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-error text-white text-xs font-bold rounded-full flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setShowHistory(false); }} />
            <motion.div
              ref={panelRef}
              initial={{ opacity: 0, y: -10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.97 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 max-h-[70vh] flex flex-col"
            >
              {/* Header */}
              {showHistory ? (
                <div className="flex items-center gap-3 p-4 border-b border-gray-100">
                  <button onClick={() => setShowHistory(false)} className="p-1 text-gray-400 hover:text-gray-700">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <h3 className="font-semibold text-gray-900 flex-1">Notification History</h3>
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 border-b border-gray-100">
                  <h3 className="font-semibold text-gray-900">Notifications</h3>
                  <div className="flex items-center gap-2">
                    <Link to="/notifications" onClick={() => setOpen(false)} className="p-1.5 text-gray-400 hover:text-primary-600" title="Open full page">
                      <Bell className="w-4 h-4" />
                    </Link>
                    <button onClick={openHistory} className="p-1.5 text-gray-400 hover:text-gray-700" title="History">
                      <Filter className="w-4 h-4" />
                    </button>
                    {unreadCount > 0 && (
                      <button onClick={markAllRead} className="p-1.5 text-gray-400 hover:text-primary-600" title="Mark all read">
                        <CheckCheck className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Content */}
              {showHistory ? (
                <div className="flex-1 overflow-y-auto">
                  {/* Filter buttons */}
                  <div className="flex gap-2 p-3 border-b border-gray-100 overflow-x-auto">
                    {(['all', ...Object.keys(TYPE_LABELS) as NotificationType[]] as const).map(type => (
                      <button key={type} onClick={() => changeHistoryFilter(type)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                          historyFilter === type ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}>
                        {type === 'all' ? 'All' : TYPE_LABELS[type as NotificationType]}
                      </button>
                    ))}
                  </div>
                  {historyLoading ? (
                    <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 text-primary-600 animate-spin" /></div>
                  ) : historyData.length === 0 ? (
                    <p className="text-center text-gray-400 py-8 text-sm">No notifications found</p>
                  ) : (
                    <>
                      <div className="p-3 space-y-2">{historyData.map(renderNotification)}</div>
                      <div className="flex items-center justify-between p-3 border-t border-gray-100">
                        <button onClick={() => changeHistoryPage(-1)} disabled={historyPage === 0}
                          className="px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg disabled:opacity-50 hover:bg-gray-50">
                          Previous
                        </button>
                        <span className="text-sm text-gray-400">Page {historyPage + 1}</span>
                        <button onClick={() => changeHistoryPage(1)} disabled={historyData.length < PAGE_SIZE}
                          className="px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg disabled:opacity-50 hover:bg-gray-50">
                          Next
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : loading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 text-primary-600 animate-spin" /></div>
              ) : notifications.length === 0 ? (
                <div className="py-12 text-center">
                  <Bell className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">No notifications yet</p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-3 space-y-1">
                  {notifications.map(renderNotification)}
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
