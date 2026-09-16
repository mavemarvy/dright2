import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Headphones,
  Loader2,
  Search,
  Send,
  ShieldAlert,
  UserCheck,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  replyToTicket,
  updateSupportTicket,
  useAdminSupportTickets,
  useTicketReplies,
  type SupportTicket,
  type SupportTicketStatus,
} from '../../lib/supportHooks';

const STATUS_LABELS: Record<SupportTicketStatus, string> = {
  open: 'Open',
  pending_support: 'Waiting for Support',
  pending_customer: 'Waiting for Customer',
  escalated: 'Escalated',
  resolved: 'Resolved',
  closed: 'Closed',
};

const STATUS_CLASS: Record<SupportTicketStatus, string> = {
  open: 'bg-blue-50 text-blue-700 border-blue-200',
  pending_support: 'bg-amber-50 text-amber-700 border-amber-200',
  pending_customer: 'bg-violet-50 text-violet-700 border-violet-200',
  escalated: 'bg-red-50 text-red-700 border-red-200',
  resolved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  closed: 'bg-gray-100 text-gray-600 border-gray-200',
};

type QueueFilter = 'needs_support' | SupportTicketStatus | 'all';

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function TicketDetail({
  ticket,
  onClose,
  onChanged,
}: {
  ticket: SupportTicket;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const { user } = useAuth();
  const { replies, loading, error, refetch } = useTicketReplies(ticket.id);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const sendReply = async () => {
    if (!user || !replyText.trim() || sendingReply) return;
    setSendingReply(true);
    setActionError(null);
    try {
      await replyToTicket({
        ticket_id: ticket.id,
        author_id: user.id,
        author_role: 'admin',
        message: replyText,
        channel: 'web',
      });
      setReplyText('');
      await Promise.all([refetch(), onChanged()]);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not send the reply.');
    } finally {
      setSendingReply(false);
    }
  };

  const setStatus = async (status: SupportTicketStatus) => {
    setActionLoading(true);
    setActionError(null);
    try {
      const updates: Parameters<typeof updateSupportTicket>[1] = { status };
      if (status === 'escalated') updates.escalation_level = Math.max(1, ticket.escalation_level || 0);
      await updateSupportTicket(ticket.id, updates);
      await onChanged();
      if (status === 'closed') onClose();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not update the ticket.');
    } finally {
      setActionLoading(false);
    }
  };

  const assignToMe = async () => {
    if (!user) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await updateSupportTicket(ticket.id, { assigned_admin_id: user.id });
      await onChanged();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not assign the ticket.');
    } finally {
      setActionLoading(false);
    }
  };

  const userName = ticket.user?.full_name || ticket.user?.username || ticket.user?.email || 'Customer';
  const canReply = ticket.status !== 'closed';

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 lg:sticky lg:top-4 lg:max-h-[82vh] flex flex-col overflow-hidden">
      <div className="p-5 border-b border-gray-100">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-gray-900 truncate">{ticket.subject}</h3>
              <span className={`px-2 py-0.5 rounded-full border text-xs font-medium ${STATUS_CLASS[ticket.status]}`}>
                {STATUS_LABELS[ticket.status]}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {ticket.ticket_number || ticket.id.slice(0, 8)} · {ticket.department?.name || 'General Support'} · {ticket.channel}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100" aria-label="Close details">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl bg-gray-50 p-3">
            <p className="text-gray-400">Customer</p>
            <p className="font-medium text-gray-800 truncate mt-0.5">{userName}</p>
            {ticket.user?.email && <p className="text-gray-400 truncate">{ticket.user.email}</p>}
          </div>
          <div className="rounded-xl bg-gray-50 p-3">
            <p className="text-gray-400">Assignment</p>
            <p className="font-medium text-gray-800 truncate mt-0.5">
              {ticket.assigned_admin?.full_name || ticket.assigned_admin?.username || ticket.assigned_admin?.email || 'Unassigned'}
            </p>
            <p className="text-gray-400 capitalize">{ticket.priority} priority</p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={assignToMe}
            disabled={actionLoading || !user || ticket.assigned_admin_id === user?.id}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium disabled:opacity-50"
          >
            <UserCheck className="w-3.5 h-3.5" /> Assign to me
          </button>
          {ticket.status !== 'escalated' && ticket.status !== 'closed' && (
            <button
              onClick={() => setStatus('escalated')}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-xs font-medium disabled:opacity-50"
            >
              <ShieldAlert className="w-3.5 h-3.5" /> Escalate
            </button>
          )}
          {ticket.status !== 'resolved' && ticket.status !== 'closed' && (
            <button
              onClick={() => setStatus('resolved')}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-medium disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Resolve
            </button>
          )}
          {ticket.status === 'resolved' && (
            <button
              onClick={() => setStatus('closed')}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium disabled:opacity-50"
            >
              Close ticket
            </button>
          )}
          {ticket.status === 'closed' && (
            <button
              onClick={() => setStatus('open')}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-medium disabled:opacity-50"
            >
              Reopen
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        <div className="flex justify-start">
          <div className="max-w-[90%] rounded-2xl rounded-tl-md bg-gray-50 border border-gray-100 px-4 py-3">
            <p className="text-xs text-gray-400 mb-1">{userName} · {formatDate(ticket.created_at)}</p>
            <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{ticket.message}</p>
          </div>
        </div>

        {loading && <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>}
        {error && <p className="text-xs text-red-600 text-center">{error}</p>}

        {replies.map(reply => {
          const adminReply = reply.author_role === 'admin';
          const authorName = reply.author?.full_name || reply.author?.username || reply.author?.email || (adminReply ? 'Support Agent' : userName);
          if (reply.is_internal) {
            return (
              <div key={reply.id} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-[11px] font-medium text-amber-700">Internal note · {authorName}</p>
                <p className="text-sm text-amber-900 mt-1 whitespace-pre-wrap">{reply.message}</p>
              </div>
            );
          }
          return (
            <div key={reply.id} className={`flex ${adminReply ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[90%] rounded-2xl px-4 py-3 ${adminReply ? 'rounded-tr-md bg-primary-600 text-white' : 'rounded-tl-md bg-gray-50 border border-gray-100 text-gray-800'}`}>
                <p className={`text-xs mb-1 ${adminReply ? 'text-white/70' : 'text-gray-400'}`}>{authorName} · {formatDate(reply.created_at)}</p>
                <p className="text-sm whitespace-pre-wrap break-words">{reply.message}</p>
              </div>
            </div>
          );
        })}
      </div>

      {actionError && (
        <div className="mx-5 mb-2 flex items-center gap-2 rounded-xl bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" /> {actionError}
        </div>
      )}

      {canReply && (
        <div className="p-4 border-t border-gray-100">
          <textarea
            value={replyText}
            onChange={event => setReplyText(event.target.value)}
            placeholder="Reply to customer..."
            rows={3}
            maxLength={5000}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none text-gray-900 resize-none"
          />
          <div className="flex justify-end mt-2">
            <button
              onClick={sendReply}
              disabled={sendingReply || !replyText.trim() || !user}
              className="px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium flex items-center justify-center gap-2 disabled:opacity-50 min-h-[42px]"
            >
              {sendingReply ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send Reply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminTicketsPage() {
  const { tickets, loading, error, refetch } = useAdminSupportTickets('all');
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('needs_support');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  const selectedTicket = tickets.find(ticket => ticket.id === selectedTicketId) || null;

  const filteredTickets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tickets.filter(ticket => {
      const queueMatch = queueFilter === 'all'
        || (queueFilter === 'needs_support' && ['open', 'pending_support', 'escalated'].includes(ticket.status))
        || ticket.status === queueFilter;
      if (!queueMatch) return false;
      if (!q) return true;
      const customerName = `${ticket.user?.full_name || ''} ${ticket.user?.username || ''} ${ticket.user?.email || ''}`.toLowerCase();
      return ticket.subject.toLowerCase().includes(q)
        || (ticket.ticket_number || '').toLowerCase().includes(q)
        || customerName.includes(q);
    });
  }, [tickets, queueFilter, searchQuery]);

  const counts = useMemo(() => ({
    needs_support: tickets.filter(ticket => ['open', 'pending_support', 'escalated'].includes(ticket.status)).length,
    waiting_customer: tickets.filter(ticket => ticket.status === 'pending_customer').length,
    resolved: tickets.filter(ticket => ticket.status === 'resolved').length,
    closed: tickets.filter(ticket => ticket.status === 'closed').length,
  }), [tickets]);

  const filters: { value: QueueFilter; label: string; count?: number }[] = [
    { value: 'needs_support', label: 'Needs Support', count: counts.needs_support },
    { value: 'pending_customer', label: 'Waiting Customer', count: counts.waiting_customer },
    { value: 'resolved', label: 'Resolved', count: counts.resolved },
    { value: 'closed', label: 'Closed', count: counts.closed },
    { value: 'all', label: 'All' },
  ];

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Headphones className="w-6 h-6 text-warning" /> Support Tickets
          </h1>
          <p className="text-gray-500 mt-1">Live support queue for web, AI, Telegram, WhatsApp, email, and future support channels.</p>
        </div>
        <div className="text-xs text-gray-400 flex items-center gap-1.5">
          <Clock3 className="w-3.5 h-3.5" /> Realtime queue
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="rounded-2xl border border-gray-100 bg-white p-4"><p className="text-xs text-gray-400">Needs Support</p><p className="text-2xl font-bold text-gray-900 mt-1">{counts.needs_support}</p></div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4"><p className="text-xs text-gray-400">Waiting Customer</p><p className="text-2xl font-bold text-gray-900 mt-1">{counts.waiting_customer}</p></div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4"><p className="text-xs text-gray-400">Resolved</p><p className="text-2xl font-bold text-gray-900 mt-1">{counts.resolved}</p></div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4"><p className="text-xs text-gray-400">Closed</p><p className="text-2xl font-bold text-gray-900 mt-1">{counts.closed}</p></div>
      </div>

      <div className="flex flex-col lg:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by ticket, subject, customer, or email..."
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none bg-white text-gray-900"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {filters.map(filter => (
            <button
              key={filter.value}
              onClick={() => setQueueFilter(filter.value)}
              className={`whitespace-nowrap px-3 py-3 rounded-xl text-sm font-medium transition-all min-h-[48px] ${queueFilter === filter.value
                ? 'bg-primary-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-primary-300'}`}
            >
              {filter.label}{typeof filter.count === 'number' ? ` (${filter.count})` : ''}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3 flex items-center gap-2 text-sm text-red-700">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-warning animate-spin" /></div>
      ) : filteredTickets.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <Headphones className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-900 font-semibold text-lg">No tickets in this queue</p>
          <p className="text-sm text-gray-500 mt-1">New support requests and replies will appear here automatically.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <div className="space-y-3">
            {filteredTickets.map((ticket, idx) => (
              <motion.button
                type="button"
                key={ticket.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(idx * 0.025, 0.25) }}
                onClick={() => setSelectedTicketId(ticket.id)}
                className={`w-full text-left bg-white rounded-2xl shadow-sm border p-4 transition-all ${selectedTicketId === ticket.id
                  ? 'border-primary-500 ring-2 ring-primary-100'
                  : 'border-gray-100 hover:shadow-md hover:border-gray-200'}`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <p className="text-xs text-gray-400 mb-1">{ticket.ticket_number || ticket.id.slice(0, 8)}</p>
                    <h3 className="font-semibold text-gray-900 truncate">{ticket.subject}</h3>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full border text-xs font-medium shrink-0 ${STATUS_CLASS[ticket.status]}`}>
                    {STATUS_LABELS[ticket.status]}
                  </span>
                </div>
                <p className="text-sm text-gray-500 line-clamp-2 mb-3">{ticket.message}</p>
                <div className="flex items-center justify-between gap-3 text-xs text-gray-400">
                  <span className="truncate">{ticket.user?.full_name || ticket.user?.username || ticket.user?.email || 'Customer'}</span>
                  <span className="shrink-0 capitalize">{ticket.priority} · {formatDate(ticket.last_activity_at)}</span>
                </div>
              </motion.button>
            ))}
          </div>

          {selectedTicket ? (
            <TicketDetail
              ticket={selectedTicket}
              onClose={() => setSelectedTicketId(null)}
              onChanged={async () => { await refetch(); }}
            />
          ) : (
            <div className="hidden lg:flex rounded-2xl border border-dashed border-gray-200 min-h-72 items-center justify-center text-center p-8">
              <div><Headphones className="w-10 h-10 text-gray-300 mx-auto mb-2" /><p className="text-sm text-gray-400">Select a ticket to view the conversation.</p></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
