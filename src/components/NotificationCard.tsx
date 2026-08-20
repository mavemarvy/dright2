import { motion } from 'framer-motion';
import {
  Bell, Check, CheckCheck, Archive, Trash2, ChevronRight,
  ShoppingCart, Package, MessageCircle, Megaphone, AlertCircle,
  Users, Star, Shield, Gift, Wallet, Briefcase, Calendar,
  TrendingUp, UserPlus, Store, Sparkles, FileText, Flag,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { NotificationItem, NotificationType, NotificationPriority } from '../lib/types';
import { notificationRelativeTime } from '../lib/notificationHooks';

const TYPE_ICON: Record<NotificationType, LucideIcon> = {
  edit_approved: Check,
  edit_rejected: AlertCircle,
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

const PRIORITY_STYLES: Record<NotificationPriority, { badge: string; dot: string; label: string }> = {
  critical: { badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', dot: 'bg-red-500', label: 'Critical' },
  high: { badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', dot: 'bg-orange-500', label: 'High' },
  normal: { badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', dot: 'bg-blue-500', label: 'Normal' },
  low: { badge: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400', dot: 'bg-gray-400', label: 'Low' },
};

const CATEGORY_BADGE_COLORS: Record<string, string> = {
  messages: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  marketplace: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  services: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  jobs: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  orders: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  wallet: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  affiliate: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  referrals: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  store: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
  followers: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  reviews: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  security: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  promotions: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-400',
  admin: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  system: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  ai: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
};

interface QuickAction {
  label: string;
  to?: string;
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
}

interface NotificationCardProps {
  notification: NotificationItem;
  onMarkRead: (id: string) => void;
  onMarkUnread: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onSelect?: (id: string) => void;
  isSelected?: boolean;
  showBulkActions?: boolean;
  isArchivedView?: boolean;
  onUnarchive?: (id: string) => void;
}

function getQuickActions(n: NotificationItem): QuickAction[] {
  const meta = n.metadata || {};
  const actions: QuickAction[] = [];

  switch (n.notification_type ?? n.type) {
    case 'new_order':
    case 'order_status':
      actions.push({ label: 'View Order', to: meta.action_url || '/my-orders', variant: 'primary' });
      actions.push({ label: 'Chat Buyer', to: '/chat', variant: 'secondary' });
      break;
    case 'chat_message':
    case 'new_message':
    case 'attachment_received':
    case 'conversation_started':
      actions.push({ label: 'Open Chat', to: '/chat', variant: 'primary' });
      actions.push({ label: 'Reply', to: '/chat', variant: 'secondary' });
      break;
    case 'service_booking':
      actions.push({ label: 'View Booking', to: meta.action_url || '/my-orders', variant: 'primary' });
      actions.push({ label: 'Chat Client', to: '/chat', variant: 'secondary' });
      break;
    case 'job_application':
      actions.push({ label: 'Review Application', to: meta.action_url || '/jobs', variant: 'primary' });
      actions.push({ label: 'Chat Applicant', to: '/chat', variant: 'secondary' });
      break;
    case 'wallet_withdrawal':
    case 'wallet_deposit':
      actions.push({ label: 'View Transaction', to: '/sales', variant: 'primary' });
      break;
    case 'affiliate_commission':
      actions.push({ label: 'View Sale', to: '/sales', variant: 'primary' });
      break;
    case 'referral_commission':
    case 'referral_signup':
      actions.push({ label: 'View Earnings', to: '/refer', variant: 'primary' });
      actions.push({ label: 'Share Link', to: '/refer', variant: 'secondary' });
      break;
    case 'new_review':
      actions.push({ label: 'Reply', to: meta.action_url || '/store', variant: 'primary' });
      break;
    case 'new_follower':
      actions.push({ label: 'Visit Profile', to: meta.action_url || '/profile', variant: 'primary' });
      actions.push({ label: 'Message', to: '/chat', variant: 'secondary' });
      break;
    case 'admin_notice':
    case 'announcement':
      actions.push({ label: 'Read Notice', to: meta.action_url || '/', variant: 'primary' });
      break;
    case 'store_update':
      actions.push({ label: 'Visit Store', to: '/store', variant: 'primary' });
      break;
    case 'low_stock':
      actions.push({ label: 'View Product', to: '/store', variant: 'primary' });
      break;
    default:
      if (meta.action_url) {
        actions.push({ label: 'View', to: meta.action_url, variant: 'primary' });
      }
  }

  return actions;
}

export default function NotificationCard({
  notification: n,
  onMarkRead,
  onMarkUnread,
  onArchive,
  onDelete,
  onSelect,
  isSelected = false,
  showBulkActions = false,
  isArchivedView = false,
  onUnarchive,
}: NotificationCardProps) {
  const Icon = TYPE_ICON[(n.notification_type ?? n.type) as NotificationType] || Bell;
  const priorityStyle = PRIORITY_STYLES[n.priority || 'normal'];
  const categoryBadge = CATEGORY_BADGE_COLORS[n.category || 'system'] || CATEGORY_BADGE_COLORS.system;
  const meta = n.metadata || {};
  const actions = getQuickActions(n);
  const isUnread = !n.is_read;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2 }}
      className={`relative group rounded-2xl border transition-all ${
        isUnread
          ? 'bg-primary-50/40 dark:bg-primary-900/10 border-primary-200/60 dark:border-primary-800/40'
          : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700'
      } ${isSelected ? 'ring-2 ring-primary-500' : ''} hover:shadow-md`}
    >
      {/* Unread indicator bar */}
      {isUnread && (
        <div className={`absolute left-0 top-4 bottom-4 w-1 rounded-r-full ${priorityStyle.dot}`} />
      )}

      <div className="flex items-start gap-3 p-4 pl-5">
        {/* Checkbox for bulk select */}
        {showBulkActions && (
          <button
            onClick={() => onSelect?.(n.id)}
            className="mt-1 shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
              isSelected
                ? 'bg-primary-600 border-primary-600 text-white'
                : 'border-gray-300 dark:border-gray-600 hover:border-primary-500'
            }"
            aria-label="Select notification"
          >
            {isSelected && <Check className="w-3 h-3" />}
          </button>
        )}

        {/* Icon / Avatar */}
        <div className="shrink-0">
          {meta.actor_avatar || meta.follower_avatar ? (
            <img
              src={meta.actor_avatar || meta.follower_avatar || ''}
              alt={meta.actor_name || meta.follower_name || ''}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : meta.product_image || meta.service_image ? (
            <img
              src={meta.product_image || meta.service_image || ''}
              alt={meta.product_title || meta.service_title || ''}
              className="w-10 h-10 rounded-xl object-cover"
            />
          ) : meta.store_logo || meta.job_logo ? (
            <img
              src={meta.store_logo || meta.job_logo || ''}
              alt={meta.store_name || meta.job_title || ''}
              className="w-10 h-10 rounded-xl object-cover"
            />
          ) : (
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${categoryBadge}`}>
              <Icon className="w-5 h-5" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className={`text-sm ${isUnread ? 'font-bold' : 'font-medium'} text-gray-900 dark:text-gray-100`}>
                  {n.title}
                </p>
                {/* Priority badge */}
                {(n.priority === 'critical' || n.priority === 'high') && (
                  <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-md uppercase tracking-wide ${priorityStyle.badge}`}>
                    {priorityStyle.label}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                {n.message || n.body}
              </p>
            </div>
            <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
              {notificationRelativeTime(n.created_at)}
            </span>
          </div>

          {/* Rich metadata preview */}
          {meta.product_price != null && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="font-semibold text-gray-700 dark:text-gray-300">
                {meta.product_currency || ''}{meta.product_price}
              </span>
              {meta.product_title && (
                <span className="text-gray-400 dark:text-gray-500 truncate">{meta.product_title}</span>
              )}
            </div>
          )}
          {meta.rating != null && (
            <div className="mt-2 flex items-center gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={`w-3.5 h-3.5 ${i < (meta.rating || 0) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300 dark:text-gray-600'}`}
                />
              ))}
              {meta.review_preview && (
                <span className="text-xs text-gray-500 dark:text-gray-400 ml-1 truncate">"{meta.review_preview}"</span>
              )}
            </div>
          )}
          {meta.amount != null && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="font-semibold text-gray-700 dark:text-gray-300">
                {meta.currency || ''}{meta.amount}
              </span>
              {meta.reference && (
                <span className="text-gray-400 dark:text-gray-500">Ref: {meta.reference}</span>
              )}
            </div>
          )}
          {meta.commission_amount != null && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="font-semibold text-green-600 dark:text-green-400">
                Commission: {meta.currency || ''}{meta.commission_amount}
              </span>
              {meta.referral_name && (
                <span className="text-gray-400 dark:text-gray-500">from {meta.referral_name}</span>
              )}
            </div>
          )}
          {meta.applicant_name && (
            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Applicant: <span className="font-medium text-gray-700 dark:text-gray-300">{meta.applicant_name}</span>
            </div>
          )}
          {meta.booking_date && (
            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Booking: <span className="font-medium text-gray-700 dark:text-gray-300">
                {new Date(meta.booking_date).toLocaleDateString()}
              </span>
            </div>
          )}

          {/* Quick action buttons */}
          {actions.length > 0 && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {actions.map((action, idx) => {
                const baseClass = 'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors';
                const variantClass = action.variant === 'primary'
                  ? 'bg-primary-600 text-white hover:bg-primary-700'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600';
                if (action.to) {
                  return (
                    <Link key={idx} to={action.to} className={`${baseClass} ${variantClass}`}>
                      {action.label}
                    </Link>
                  );
                }
                return (
                  <button key={idx} onClick={action.onClick} className={`${baseClass} ${variantClass}`}>
                    {action.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-1 shrink-0">
          {!isArchivedView && (
            <>
              {isUnread ? (
                <button
                  onClick={() => onMarkRead(n.id)}
                  className="p-1.5 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                  title="Mark as read"
                  aria-label="Mark as read"
                >
                  <Check className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={() => onMarkUnread(n.id)}
                  className="p-1.5 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                  title="Mark as unread"
                  aria-label="Mark as unread"
                >
                  <CheckCheck className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => onArchive(n.id)}
                className="p-1.5 text-gray-400 hover:text-orange-600 dark:hover:text-orange-400 transition-colors opacity-0 group-hover:opacity-100"
                title="Archive"
                aria-label="Archive notification"
              >
                <Archive className="w-4 h-4" />
              </button>
            </>
          )}
          {isArchivedView && onUnarchive && (
            <button
              onClick={() => onUnarchive(n.id)}
              className="p-1.5 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              title="Restore"
              aria-label="Restore notification"
            >
              <Archive className="w-4 h-4 rotate-180" />
            </button>
          )}
          <button
            onClick={() => onDelete(n.id)}
            className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
            title="Delete"
            aria-label="Delete notification"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Grouped notification card ────────────────────────────────────────────────

interface GroupedNotificationCardProps {
  groupKey: string;
  groupLabel: string;
  groupIcon?: LucideIcon;
  notifications: NotificationItem[];
  onExpand: (key: string) => void;
  isExpanded: boolean;
  onMarkAllRead: (ids: string[]) => void;
  onArchive: (id: string) => void;
  onMarkRead: (id: string) => void;
  onMarkUnread: (id: string) => void;
  onDelete: (id: string) => void;
}

export function GroupedNotificationCard({
  groupLabel,
  groupIcon: GroupIcon,
  notifications: group,
  onExpand,
  isExpanded,
  onMarkAllRead,
  onArchive,
  onMarkRead,
  onMarkUnread,
  onDelete,
}: GroupedNotificationCardProps) {
  const unreadCount = group.filter(n => !n.is_read).length;
  const latest = group[0];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 hover:shadow-md transition-all"
    >
      <button
        onClick={() => onExpand(groupLabel)}
        className="flex items-center gap-3 w-full p-4 text-left"
      >
        {GroupIcon && (
          <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center shrink-0">
            <GroupIcon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {group.length} new {groupLabel.toLowerCase()}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {unreadCount > 0 ? `${unreadCount} unread` : 'All read'} - Latest: {notificationRelativeTime(latest.created_at)}
          </p>
        </div>
        <ChevronRight className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 space-y-2">
          <button
            onClick={() => onMarkAllRead(group.map(n => n.id))}
            className="text-xs text-primary-600 dark:text-primary-400 hover:underline px-2"
          >
            Mark all as read
          </button>
          {group.map(n => (
            <NotificationCard
              key={n.id}
              notification={n}
              onMarkRead={onMarkRead}
              onMarkUnread={onMarkUnread}
              onArchive={onArchive}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}
