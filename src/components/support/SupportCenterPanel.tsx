import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Headphones,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  Ticket,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useSupportDepartments } from '../../lib/contentHooks';
import {
  createSupportTicket,
  replyToTicket,
  useMySupportTickets,
  useTicketReplies,
  type SupportPriority,
  type SupportTicket,
  type SupportTicketStatus,
} from '../../lib/supportHooks';

const STATUS_LABELS: Record<SupportTicketStatus, string> = {
  open: 'Open',
  pending_support: 'Waiting for Support',
  pending_customer: 'Waiting for You',
  escalated: 'Escalated',
  resolved: 'Resolved',
  closed: 'Closed',
};

const STATUS_CLASS: Record<SupportTicketStatus, string> = {
  open: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800',
  pending_support: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800',
  pending_customer: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-800',
  escalated: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800',
  resolved: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800',
  closed: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
};

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function TicketThread({ ticket, onClose }: { ticket: SupportTicket; onClose: () => void }) {
  const { user } = useAuth();
  const { replies, loading, error } = useTicketReplies(ticket.id);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const canReply = ticket.status !== 'closed';

  const sendReply = async () => {
    if (!user || !message.trim() || sending || !canReply) return;
    setSending(true);
    setSendError(null);
    try {
      await replyToTicket({
        ticket_id: ticket.id,
        author_id: user.id,
        author_role: 'user',
        message,
        channel: 'web',
      });
      setMessage('');
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Could not send your reply.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="w-full sm:max-w-2xl bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={event => event.stopPropagation()}
      >
        <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center shrink-0">
            <Ticket className="w-5 h-5 text-blue-600" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-gray-900 dark:text-white truncate">{ticket.subject}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_CLASS[ticket.status]}`}>
                {STATUS_LABELS[ticket.status]}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {ticket.ticket_number || ticket.id.slice(0, 8)} · {formatDate(ticket.created_at)}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Close ticket">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <div className="flex justify-end">
            <div className="max-w-[88%] rounded-2xl rounded-tr-md bg-blue-600 text-white px-4 py-3">
              <p className="text-xs text-blue-100 mb-1">You · Ticket opened</p>
              <p className="text-sm whitespace-pre-wrap break-words">{ticket.message}</p>
            </div>
          </div>

          {loading && (
            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
          )}
          {error && <p className="text-sm text-red-600 text-center">{error}</p>}

          {replies.filter(reply => !reply.is_internal).map(reply => {
            const mine = reply.author_role === 'user';
            const authorName = reply.author?.full_name || reply.author?.username || (mine ? 'You' : 'DRIGHT Support');
            return (
              <div key={reply.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[88%] rounded-2xl px-4 py-3 ${mine
                  ? 'rounded-tr-md bg-blue-600 text-white'
                  : 'rounded-tl-md bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100'}`}>
                  <p className={`text-xs mb-1 ${mine ? 'text-blue-100' : 'text-gray-400'}`}>
                    {authorName} · {formatDate(reply.created_at)}
                  </p>
                  <p className="text-sm whitespace-pre-wrap break-words">{reply.message}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-gray-100 dark:border-gray-800 p-4">
          {sendError && <p className="text-sm text-red-600 mb-2">{sendError}</p>}
          {canReply ? (
            <div className="flex gap-2 items-end">
              <textarea
                value={message}
                onChange={event => setMessage(event.target.value)}
                rows={2}
                maxLength={5000}
                placeholder="Reply to support..."
                className="flex-1 resize-none px-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-900"
              />
              <button
                onClick={sendReply}
                disabled={sending || !message.trim()}
                className="p-3.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                aria-label="Send reply"
              >
                {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </div>
          ) : (
            <p className="text-sm text-center text-gray-500">This ticket is closed. Create a new ticket if you still need help.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SupportCenterPanel() {
  const { user } = useAuth();
  const { departments } = useSupportDepartments();
  const { tickets, loading, error, refetch } = useMySupportTickets(user?.id);
  const [showComposer, setShowComposer] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<SupportPriority>('medium');
  const [departmentId, setDepartmentId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdTicketNumber, setCreatedTicketNumber] = useState<string | null>(null);

  const activeDepartments = useMemo(() => departments.filter(department => department.is_available), [departments]);

  useEffect(() => {
    if (!departmentId && activeDepartments.length > 0) setDepartmentId(activeDepartments[0].id);
  }, [departmentId, activeDepartments]);

  const submitTicket = async () => {
    if (!user || !subject.trim() || !message.trim() || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    setCreatedTicketNumber(null);
    try {
      const ticket = await createSupportTicket({
        user_id: user.id,
        subject,
        message,
        priority,
        department_id: departmentId || null,
        category: activeDepartments.find(department => department.id === departmentId)?.name?.toLowerCase().replace(/\s+/g, '_') || 'general',
        channel: 'web',
      });
      setSubject('');
      setMessage('');
      setPriority('medium');
      setShowComposer(false);
      setCreatedTicketNumber(ticket.ticket_number || ticket.id.slice(0, 8));
      await refetch();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not create your ticket.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <section className="rounded-3xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 sm:p-8">
        <div className="max-w-2xl mx-auto text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center mx-auto mb-4">
            <Headphones className="w-7 h-7 text-blue-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Contact DRIGHT Support</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 mb-5">Sign in to open a private support ticket, receive replies, and keep your support history in one place.</p>
          <Link to="/sign-in" className="inline-flex items-center justify-center px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm">
            Sign in to contact support
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
      <div className="p-5 sm:p-7 border-b border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Headphones className="w-5 h-5 text-blue-600" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">My Support</h2>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Open a ticket and continue the conversation with DRIGHT Support.</p>
        </div>
        <button
          onClick={() => { setShowComposer(value => !value); setSubmitError(null); }}
          className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
        >
          <Plus className="w-4 h-4" /> New Ticket
        </button>
      </div>

      {createdTicketNumber && (
        <div className="mx-5 sm:mx-7 mt-5 rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20 p-3 flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="w-4 h-4 shrink-0" /> Ticket {createdTicketNumber} was created successfully. Support has been notified.
        </div>
      )}

      {showComposer && (
        <div className="p-5 sm:p-7 border-b border-gray-100 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-900/30">
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Department</label>
              <select
                value={departmentId}
                onChange={event => setDepartmentId(event.target.value)}
                className="w-full px-3 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-200"
              >
                {activeDepartments.length === 0 && <option value="">General Support</option>}
                {activeDepartments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Priority</label>
              <select
                value={priority}
                onChange={event => setPriority(event.target.value as SupportPriority)}
                className="w-full px-3 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Subject</label>
              <input
                value={subject}
                onChange={event => setSubject(event.target.value)}
                maxLength={180}
                placeholder="Briefly describe what you need help with"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Details</label>
              <textarea
                value={message}
                onChange={event => setMessage(event.target.value)}
                maxLength={5000}
                rows={5}
                placeholder="Include the details support will need to investigate the issue."
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-200 resize-y"
              />
            </div>
          </div>
          {submitError && (
            <div className="mt-3 flex items-center gap-2 text-sm text-red-600"><AlertCircle className="w-4 h-4" /> {submitError}</div>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setShowComposer(false)} className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
            <button
              onClick={submitTicket}
              disabled={submitting || !subject.trim() || !message.trim()}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50 flex items-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Submit Ticket
            </button>
          </div>
        </div>
      )}

      <div className="p-5 sm:p-7">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Ticket History</h3>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-gray-400 animate-spin" /></div>
        ) : tickets.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 p-8 text-center">
            <MessageSquare className="w-9 h-9 text-gray-300 mx-auto mb-2" />
            <p className="font-medium text-gray-700 dark:text-gray-200">No support tickets yet</p>
            <p className="text-sm text-gray-400 mt-1">Your support conversations will appear here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tickets.map(ticket => (
              <button
                key={ticket.id}
                onClick={() => setSelectedTicket(ticket)}
                className="w-full text-left p-4 rounded-2xl border border-gray-100 dark:border-gray-700 hover:border-blue-200 dark:hover:border-blue-800 hover:bg-blue-50/30 dark:hover:bg-blue-950/10 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
                    <Ticket className="w-4 h-4 text-gray-500 dark:text-gray-300" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-gray-900 dark:text-white truncate">{ticket.subject}</p>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full border ${STATUS_CLASS[ticket.status]}`}>
                        {STATUS_LABELS[ticket.status]}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-xs text-gray-400 mt-1">
                      <span>{ticket.ticket_number || ticket.id.slice(0, 8)}</span>
                      <span>·</span>
                      <span className="capitalize">{ticket.priority}</span>
                      {ticket.department?.name && <><span>·</span><span>{ticket.department.name}</span></>}
                      <span>·</span>
                      <span className="inline-flex items-center gap-1"><Clock3 className="w-3 h-3" /> {formatDate(ticket.last_activity_at)}</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 mt-2" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedTicket && <TicketThread ticket={selectedTicket} onClose={() => setSelectedTicket(null)} />}
    </section>
  );
}
