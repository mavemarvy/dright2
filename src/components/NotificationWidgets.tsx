import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Bell, ChevronRight, ShoppingCart, MessageCircle, Users, Star, Wallet, AlertCircle, TrendingUp, Shield } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { notificationRelativeTime } from '../lib/notificationHooks';
import { cleanupExpiredNotifications } from '../lib/notificationEvents';
import type { NotificationItem, NotificationType } from '../lib/types';

const TYPE_ICON: Partial<Record<NotificationType, typeof Bell>> = {
  new_order: ShoppingCart,
  order_status: ShoppingCart,
  chat_message: MessageCircle,
  new_message: MessageCircle,
  conversation_started: MessageCircle,
  new_follower: Users,
  new_review: Star,
  wallet_withdrawal: Wallet,
  wallet_deposit: Wallet,
  affiliate_commission: TrendingUp,
  referral_commission: TrendingUp,
  security_alert: Shield,
  system_alert: AlertCircle,
  low_stock: AlertCircle,
};

// ─── Recent Notifications Widget ──────────────────────────────────────────────
// Used on Buyer Dashboard, Seller Dashboard, etc.

interface RecentNotificationsWidgetProps {
  maxItems?: number;
  title?: string;
}

export function RecentNotificationsWidget({ maxItems = 5, title = 'Recent Notifications' }: RecentNotificationsWidgetProps) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_deleted', false)
        .eq('is_archived', false)
        .order('created_at', { ascending: false })
        .limit(maxItems);
      if (error) throw error;
      setNotifications((data || []) as NotificationItem[]);
      setUnreadCount((data || []).filter(n => !n.is_read).length);
    } catch (err) {
      console.error('RecentNotificationsWidget fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [user, maxItems]);

  useEffect(() => {
    fetch();
    if (!user) return;
    // Clean up expired notifications on load
    cleanupExpiredNotifications(user.id);
    const channel = supabase.channel(`widget-notif-${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => fetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetch]);

  const markAsRead = useCallback(async (id: string) => {
    await supabase.from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-3 animate-pulse" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 bg-gray-100 dark:bg-gray-700 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Bell className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-error text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        </div>
        <Link to="/notifications" className="text-xs text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-0.5">
          View all <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {notifications.length === 0 ? (
        <div className="py-6 text-center">
          <Bell className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
          <p className="text-xs text-gray-400 dark:text-gray-500">No notifications yet</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {notifications.map(n => {
            const Icon = TYPE_ICON[(n.notification_type ?? n.type) as NotificationType] || Bell;
            return (
              <motion.div
                key={n.id}
                layout
                className={`flex items-start gap-2.5 p-2.5 rounded-xl transition-colors cursor-pointer ${
                  n.is_read
                    ? 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    : 'bg-primary-50/40 dark:bg-primary-900/10 hover:bg-primary-50/60 dark:hover:bg-primary-900/20'
                }`}
                onClick={() => !n.is_read && markAsRead(n.id)}
              >
                <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs ${n.is_read ? 'font-medium' : 'font-bold'} text-gray-900 dark:text-gray-100 truncate`}>
                    {n.title}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                    {n.message || n.body}
                  </p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                    {notificationRelativeTime(n.created_at)}
                  </p>
                </div>
                {!n.is_read && <div className="w-2 h-2 rounded-full bg-primary-500 shrink-0 mt-2" />}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Unread Count Badge Widget ────────────────────────────────────────────────
// Can be embedded in any dashboard header

export function UnreadCountBadge() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    const fetchCount = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false)
        .eq('is_deleted', false)
        .eq('is_archived', false);
      setCount(count || 0);
    };
    fetchCount();
    const channel = supabase.channel(`badge-notif-${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, fetchCount)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  if (count === 0) return null;
  return (
    <Link to="/notifications" className="relative inline-flex">
      <Bell className="w-5 h-5 text-gray-600 dark:text-gray-400" />
      <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-error text-white text-[10px] font-bold rounded-full flex items-center justify-center">
        {count > 9 ? '9+' : count}
      </span>
    </Link>
  );
}

// ─── Seller Dashboard: New Orders Widget ──────────────────────────────────────

export function SellerOrdersWidget() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<NotificationItem[]>([]);

  useEffect(() => {
    if (!user) return;
    const fetchOrders = async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_deleted', false)
        .eq('is_archived', false)
        .in('notification_type', ['new_order', 'order_status', 'low_stock'])
        .order('created_at', { ascending: false })
        .limit(4);
      setOrders((data || []) as NotificationItem[]);
    };
    fetchOrders();
  }, [user]);

  if (orders.length === 0) return null;

  return (
    <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      <div className="flex items-center gap-2 mb-3">
        <ShoppingCart className="w-5 h-5 text-primary-600 dark:text-primary-400" />
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">New Orders & Alerts</h3>
      </div>
      <div className="space-y-1.5">
        {orders.map(n => (
          <Link key={n.id} to="/notifications" className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
            <div className={`w-2 h-2 rounded-full shrink-0 ${n.is_read ? 'bg-gray-300 dark:bg-gray-600' : 'bg-primary-500'}`} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">{n.title}</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">{notificationRelativeTime(n.created_at)}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ─── Affiliate Dashboard: Commission Alerts Widget ────────────────────────────

export function AffiliateAlertsWidget() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<NotificationItem[]>([]);

  useEffect(() => {
    if (!user) return;
    const fetchAlerts = async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_deleted', false)
        .eq('is_archived', false)
        .in('notification_type', ['affiliate_commission', 'referral_commission', 'referral_signup'])
        .order('created_at', { ascending: false })
        .limit(4);
      setAlerts((data || []) as NotificationItem[]);
    };
    fetchAlerts();
  }, [user]);

  if (alerts.length === 0) return null;

  return (
    <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Commission & Referral Alerts</h3>
      </div>
      <div className="space-y-1.5">
        {alerts.map(n => (
          <Link key={n.id} to="/notifications" className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
            <div className={`w-2 h-2 rounded-full shrink-0 ${n.is_read ? 'bg-gray-300 dark:bg-gray-600' : 'bg-green-500'}`} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">{n.title}</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">{notificationRelativeTime(n.created_at)}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ─── Admin Dashboard: Reports & System Widget ──────────────────────────────────

export function AdminAlertsWidget() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<NotificationItem[]>([]);

  useEffect(() => {
    if (!user) return;
    const fetchAlerts = async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_deleted', false)
        .eq('is_archived', false)
        .in('notification_type', ['report_created', 'security_alert', 'system_alert', 'admin_notice'])
        .order('created_at', { ascending: false })
        .limit(5);
      setAlerts((data || []) as NotificationItem[]);
    };
    fetchAlerts();
  }, [user]);

  if (alerts.length === 0) return null;

  return (
    <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Shield className="w-5 h-5 text-red-600 dark:text-red-400" />
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Reports & System Alerts</h3>
      </div>
      <div className="space-y-1.5">
        {alerts.map(n => (
          <Link key={n.id} to="/notifications" className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
            <div className={`w-2 h-2 rounded-full shrink-0 ${n.is_read ? 'bg-gray-300 dark:bg-gray-600' : 'bg-red-500'}`} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">{n.title}</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">{notificationRelativeTime(n.created_at)}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
