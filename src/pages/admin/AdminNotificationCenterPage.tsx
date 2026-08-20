import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Bell, Send, AlertTriangle, Clock, CheckCircle,
  Activity, FileText, BarChart3, RefreshCw,
  type LucideIcon,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

type Tab = 'queue' | 'delivery' | 'templates' | 'audit' | 'analytics';

interface QueueItem {
  id: string;
  event_type: string;
  module: string;
  priority: string;
  processed: boolean;
  created_at: string;
  recipient_ids: string[];
}

interface DeliveryItem {
  id: string;
  notification_id: string;
  status: string;
  channel: string;
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
}

interface AuditItem {
  id: string;
  action: string;
  actor_id: string | null;
  notification_id: string | null;
  created_at: string;
  details: Record<string, unknown> | null;
}

interface TemplateItem {
  id: string;
  template_key: string;
  locale: string;
  title_template: string;
  message_template: string;
  category: string;
  is_active: boolean;
}

function TabButton({ active, onClick, icon: Icon, label }: {
  active: boolean; onClick: () => void; icon: LucideIcon; label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all min-h-[40px] ${
        active
          ? 'bg-primary-600 text-white'
          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
      }`}
    >
      <Icon className="w-4 h-4" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

export default function AdminNotificationCenterPage() {
  const [tab, setTab] = useState<Tab>('queue');
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [deliveryItems, setDeliveryItems] = useState<DeliveryItem[]>([]);
  const [auditItems, setAuditItems] = useState<AuditItem[]>([]);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastAudience, setBroadcastAudience] = useState('everyone');
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('notification_event_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      setQueueItems((data || []) as QueueItem[]);
    } catch (err) {
      console.error('fetchQueue error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDelivery = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('notification_delivery_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      setDeliveryItems((data || []) as DeliveryItem[]);
    } catch (err) {
      console.error('fetchDelivery error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAudit = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('notification_audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      setAuditItems((data || []) as AuditItem[]);
    } catch (err) {
      console.error('fetchAudit error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('notification_templates_db')
        .select('*')
        .order('template_key', { ascending: true })
        .limit(50);
      if (error) throw error;
      setTemplates((data || []) as TemplateItem[]);
    } catch (err) {
      console.error('fetchTemplates error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'queue') fetchQueue();
    else if (tab === 'delivery') fetchDelivery();
    else if (tab === 'audit') fetchAudit();
    else if (tab === 'templates') fetchTemplates();
  }, [tab, fetchQueue, fetchDelivery, fetchAudit, fetchTemplates]);

  const broadcast = useCallback(async () => {
    if (!broadcastTitle.trim() || !broadcastMessage.trim()) return;
    setBroadcasting(true);
    setBroadcastResult(null);
    try {
      // Get target users
      let userQuery = supabase.from('users').select('id');
      if (broadcastAudience === 'sellers') {
        userQuery = userQuery.eq('is_seller', true);
      } else if (broadcastAudience === 'buyers') {
        userQuery = userQuery.eq('is_buyer', true);
      } else if (broadcastAudience === 'affiliates') {
        userQuery = userQuery.eq('is_affiliate', true);
      }
      const { data: users, error: userError } = await userQuery.limit(500);
      if (userError) throw userError;

      const userIds = (users || []).map((u: { id: string }) => u.id);
      if (userIds.length === 0) {
        setBroadcastResult('No users found for this audience.');
        setBroadcasting(false);
        return;
      }

      // Insert notifications in batches of 100
      const batchSize = 100;
      let inserted = 0;
      for (let i = 0; i < userIds.length; i += batchSize) {
        const batch = userIds.slice(i, i + batchSize);
        const notifications = batch.map((uid: string) => ({
          user_id: uid,
          title: broadcastTitle,
          message: broadcastMessage,
          notification_type: 'announcement',
          category: 'admin',
          priority: 'high',
          is_read: false,
        }));
        const { error: insertError } = await supabase.from('notifications').insert(notifications);
        if (insertError) throw insertError;
        inserted += batch.length;
      }

      setBroadcastResult(`Announcement sent to ${inserted} users.`);
      setBroadcastTitle('');
      setBroadcastMessage('');
    } catch (err) {
      console.error('broadcast error:', err);
      setBroadcastResult('Failed to send announcement. Please try again.');
    } finally {
      setBroadcasting(false);
    }
  }, [broadcastTitle, broadcastMessage, broadcastAudience]);

  const retryQueueItem = useCallback(async (id: string) => {
    try {
      await supabase.from('notification_event_log')
        .update({ processed: false })
        .eq('id', id);
      fetchQueue();
    } catch (err) {
      console.error('retryQueueItem error:', err);
    }
  }, [fetchQueue]);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center">
          <Bell className="w-5 h-5 text-primary-600 dark:text-primary-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Notification Center</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Monitor, manage, and broadcast notifications</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        <TabButton active={tab === 'queue'} onClick={() => setTab('queue')} icon={Clock} label="Event Queue" />
        <TabButton active={tab === 'delivery'} onClick={() => setTab('delivery')} icon={Send} label="Delivery Logs" />
        <TabButton active={tab === 'templates'} onClick={() => setTab('templates')} icon={FileText} label="Templates" />
        <TabButton active={tab === 'audit'} onClick={() => setTab('audit')} icon={Activity} label="Audit Log" />
        <TabButton active={tab === 'analytics'} onClick={() => setTab('analytics')} icon={BarChart3} label="Analytics" />
      </div>

      {/* Broadcast Announcement */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 mb-6"
      >
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-5 h-5 text-warning" />
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Broadcast Announcement</h2>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Announcement title"
              value={broadcastTitle}
              onChange={(e) => setBroadcastTitle(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
            />
            <select
              value={broadcastAudience}
              onChange={(e) => setBroadcastAudience(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
            >
              <option value="everyone">Everyone</option>
              <option value="buyers">Buyers</option>
              <option value="sellers">Sellers</option>
              <option value="affiliates">Affiliates</option>
            </select>
          </div>
          <textarea
            placeholder="Announcement message..."
            value={broadcastMessage}
            onChange={(e) => setBroadcastMessage(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={broadcast}
              disabled={broadcasting || !broadcastTitle.trim() || !broadcastMessage.trim()}
              className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[40px]"
            >
              {broadcasting ? 'Sending...' : 'Send Announcement'}
            </button>
            {broadcastResult && (
              <span className="text-sm text-gray-600 dark:text-gray-400">{broadcastResult}</span>
            )}
          </div>
        </div>
      </motion.div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Queue Tab */}
          {tab === 'queue' && (
            <div className="space-y-2">
              {queueItems.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No events in the queue.</p>
              ) : (
                queueItems.map(item => (
                  <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                    <div className={`w-2 h-2 rounded-full ${item.processed ? 'bg-success' : 'bg-warning'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{item.event_type}</p>
                      <p className="text-xs text-gray-400">{item.module} · {new Date(item.created_at).toLocaleString()}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${item.priority === 'critical' ? 'bg-error/10 text-error' : item.priority === 'high' ? 'bg-warning/10 text-warning' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'}`}>
                      {item.priority}
                    </span>
                    {!item.processed && (
                      <button onClick={() => retryQueueItem(item.id)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Retry">
                        <RefreshCw className="w-4 h-4 text-gray-400" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Delivery Tab */}
          {tab === 'delivery' && (
            <div className="space-y-2">
              {deliveryItems.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No delivery logs yet.</p>
              ) : (
                deliveryItems.map(item => (
                  <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Notification {item.notification_id.substring(0, 8)}...</p>
                      <p className="text-xs text-gray-400">{item.channel} · {new Date(item.created_at).toLocaleString()}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      item.status === 'read' ? 'bg-success/10 text-success' :
                      item.status === 'delivered' ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300' :
                      item.status === 'archived' ? 'bg-gray-100 dark:bg-gray-700 text-gray-500' :
                      'bg-warning/10 text-warning'
                    }`}>
                      {item.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Templates Tab */}
          {tab === 'templates' && (
            <div className="space-y-2">
              {templates.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No templates configured. Templates from code are used by default.</p>
              ) : (
                templates.map(tpl => (
                  <div key={tpl.id} className="p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{tpl.template_key}</p>
                      <span className="text-xs text-gray-400">{tpl.locale}</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{tpl.title_template}</p>
                    <p className="text-xs text-gray-400 mt-1">{tpl.message_template}</p>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Audit Tab */}
          {tab === 'audit' && (
            <div className="space-y-2">
              {auditItems.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No audit entries yet.</p>
              ) : (
                auditItems.map(item => (
                  <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                    <Activity className="w-4 h-4 text-gray-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.action}</p>
                      <p className="text-xs text-gray-400">{new Date(item.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Analytics Tab */}
          {tab === 'analytics' && (
            <AdminAnalyticsTab />
          )}
        </>
      )}
    </div>
  );
}

function AdminAnalyticsTab() {
  const [stats, setStats] = useState<{
    totalEvents: number;
    processedEvents: number;
    unprocessedEvents: number;
    totalNotifications: number;
    totalDeliveryLogs: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [events, notifs, deliveries] = await Promise.all([
          supabase.from('notification_event_log').select('*', { count: 'exact', head: true }),
          supabase.from('notifications').select('*', { count: 'exact', head: true }),
          supabase.from('notification_delivery_logs').select('*', { count: 'exact', head: true }),
        ]);

        const { count: processedCount } = await supabase
          .from('notification_event_log')
          .select('*', { count: 'exact', head: true })
          .eq('processed', true);

        setStats({
          totalEvents: events.count || 0,
          processedEvents: processedCount || 0,
          unprocessedEvents: (events.count || 0) - (processedCount || 0),
          totalNotifications: notifs.count || 0,
          totalDeliveryLogs: deliveries.count || 0,
        });
      } catch (err) {
        console.error('AdminAnalyticsTab error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="flex justify-center py-8"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;
  if (!stats) return <p className="text-center text-gray-500 py-8">Unable to load analytics.</p>;

  const cards = [
    { label: 'Total Events', value: stats.totalEvents, icon: Activity, color: 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400' },
    { label: 'Processed', value: stats.processedEvents, icon: CheckCircle, color: 'bg-success/10 text-success' },
    { label: 'Unprocessed', value: stats.unprocessedEvents, icon: Clock, color: 'bg-warning/10 text-warning' },
    { label: 'Total Notifications', value: stats.totalNotifications, icon: Bell, color: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' },
    { label: 'Delivery Logs', value: stats.totalDeliveryLogs, icon: Send, color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map(card => (
        <div key={card.label} className="p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
          <div className={`w-8 h-8 rounded-lg ${card.color} flex items-center justify-center mb-2`}>
            <card.icon className="w-4 h-4" />
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{card.value}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{card.label}</p>
        </div>
      ))}
    </div>
  );
}
