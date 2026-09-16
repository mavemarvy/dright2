import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  Headphones,
  Image as ImageIcon,
  Loader2,
  Music,
  Paperclip,
  Search,
  Send,
  ShieldAlert,
  Trash2,
  UserCheck,
  Video,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  deleteUnsentSupportAttachment,
  replyToTicket,
  supportAttachmentSignedUrl,
  SUPPORT_ATTACHMENT_MAX_BYTES,
  SUPPORT_ATTACHMENT_MAX_PER_REPLY,
  updateSupportTicket,
  uploadSupportAttachment,
  useAdminSupportTickets,
  useSupportAttachments,
  useTicketReplies,
  type SupportAttachment,
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

const ATTACHMENT_ACCEPT = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
  'video/mp4', 'video/webm', 'video/quicktime',
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp4',
  'application/pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.rtf', '.zip', '.txt', '.csv',
].join(',');

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function AttachmentIcon({ attachment }: { attachment: SupportAttachment }) {
  if (attachment.media_type === 'image') return <ImageIcon className="w-4 h-4" />;
  if (attachment.media_type === 'video') return <Video className="w-4 h-4" />;
  if (attachment.media_type === 'audio') return <Music className="w-4 h-4" />;
  return <FileText className="w-4 h-4" />;
}

function TicketAttachment({
  attachment,
  compact = false,
  onRemove,
  removing = false,
}: {
  attachment: SupportAttachment;
  compact?: boolean;
  onRemove?: () => void;
  removing?: boolean;
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setSignedUrl(null);
    setUrlError(null);
    void supportAttachmentSignedUrl(attachment, 10 * 60)
      .then(url => { if (active) setSignedUrl(url); })
      .catch(() => { if (active) setUrlError('Could not open file'); });
    return () => { active = false; };
  }, [attachment.id, attachment.storage_bucket, attachment.storage_path]);

  const statusLabel = attachment.direction === 'outbound'
    ? attachment.status === 'sent' ? 'Sent' : attachment.status === 'failed' ? 'Delivery failed' : 'Ready to send'
    : 'Customer upload';

  return (
    <div className={`rounded-xl border border-gray-200 bg-white overflow-hidden ${compact ? 'mt-2' : ''}`}>
      {attachment.media_type === 'image' && signedUrl && (
        <a href={signedUrl} target="_blank" rel="noreferrer" className="block bg-gray-50">
          <img src={signedUrl} alt={attachment.file_name} className="max-h-64 w-full object-contain" />
        </a>
      )}
      {attachment.media_type === 'video' && signedUrl && (
        <video src={signedUrl} controls preload="metadata" className="max-h-64 w-full bg-black" />
      )}
      {attachment.media_type === 'audio' && signedUrl && (
        <div className="p-3 bg-gray-50"><audio src={signedUrl} controls className="w-full" /></div>
      )}

      <div className="flex items-center gap-2 p-3 min-w-0">
        <span className="shrink-0 w-8 h-8 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center">
          <AttachmentIcon attachment={attachment} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-gray-800 truncate">{attachment.file_name}</p>
          <p className="text-[11px] text-gray-400 truncate">
            {formatFileSize(Number(attachment.file_size))} · {statusLabel}
          </p>
          {attachment.status === 'failed' && attachment.error_code && (
            <p className="text-[11px] text-red-600 truncate">{attachment.error_code}</p>
          )}
          {urlError && <p className="text-[11px] text-red-600">{urlError}</p>}
        </div>
        {signedUrl && (
          <a
            href={signedUrl}
            target="_blank"
            rel="noreferrer"
            className="p-2 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50"
            aria-label={`Open ${attachment.file_name}`}
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            disabled={removing}
            className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
            aria-label={`Remove ${attachment.file_name}`}
          >
            {removing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );
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
  const {
    attachments,
    loading: attachmentsLoading,
    error: attachmentsError,
    refetch: refetchAttachments,
  } = useSupportAttachments(ticket.id);
  const [replyText, setReplyText] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<SupportAttachment[]>([]);
  const [sendingReply, setSendingReply] = useState(false);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [removingAttachmentId, setRemovingAttachmentId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPendingAttachments([]);
    setReplyText('');
    setActionError(null);
  }, [ticket.id]);

  const initialAttachments = useMemo(
    () => attachments.filter(item => !item.reply_id && item.direction === 'inbound'),
    [attachments],
  );

  const attachmentsByReply = useMemo(() => {
    const grouped = new Map<string, SupportAttachment[]>();
    attachments.forEach(item => {
      if (!item.reply_id) return;
      const current = grouped.get(item.reply_id) || [];
      current.push(item);
      grouped.set(item.reply_id, current);
    });
    return grouped;
  }, [attachments]);

  const handleAttachmentSelection = async (files: FileList | null) => {
    if (!user || !files?.length || uploadingAttachments) return;
    const selected = Array.from(files);
    if (pendingAttachments.length + selected.length > SUPPORT_ATTACHMENT_MAX_PER_REPLY) {
      setActionError(`You can attach up to ${SUPPORT_ATTACHMENT_MAX_PER_REPLY} files to one reply.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploadingAttachments(true);
    setActionError(null);
    try {
      for (const file of selected) {
        if (file.size > SUPPORT_ATTACHMENT_MAX_BYTES) {
          throw new Error(`${file.name} is larger than 20 MB.`);
        }
        const attachment = await uploadSupportAttachment({ ticket, uploaderId: user.id, file });
        setPendingAttachments(current => [...current, attachment]);
      }
      await refetchAttachments();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not upload one of the attachments.');
    } finally {
      setUploadingAttachments(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removePendingAttachment = async (attachment: SupportAttachment) => {
    setRemovingAttachmentId(attachment.id);
    setActionError(null);
    try {
      await deleteUnsentSupportAttachment(attachment);
      setPendingAttachments(current => current.filter(item => item.id !== attachment.id));
      await refetchAttachments();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not remove the attachment.');
    } finally {
      setRemovingAttachmentId(null);
    }
  };

  const sendReply = async () => {
    if (!user || (!replyText.trim() && pendingAttachments.length === 0) || sendingReply || uploadingAttachments) return;
    setSendingReply(true);
    setActionError(null);
    try {
      await replyToTicket({
        ticket_id: ticket.id,
        author_id: user.id,
        author_role: 'admin',
        message: replyText,
        channel: 'web',
        attachment_ids: pendingAttachments.map(item => item.id),
      });
      setReplyText('');
      setPendingAttachments([]);
      await Promise.all([refetch(), refetchAttachments(), onChanged()]);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not send the reply.');
      await refetchAttachments();
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
          <div className="max-w-[90%] rounded-2xl rounded-tl-md bg-gray-50 border border-gray-100 px-4 py-3 min-w-0">
            <p className="text-xs text-gray-400 mb-1">{userName} · {formatDate(ticket.created_at)}</p>
            <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{ticket.message}</p>
            {initialAttachments.map(attachment => <TicketAttachment key={attachment.id} attachment={attachment} compact />)}
          </div>
        </div>

        {(loading || attachmentsLoading) && <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>}
        {(error || attachmentsError) && <p className="text-xs text-red-600 text-center">{error || attachmentsError}</p>}

        {replies.map(reply => {
          const adminReply = reply.author_role === 'admin';
          const authorName = reply.author?.full_name || reply.author?.username || reply.author?.email || (adminReply ? 'Support Agent' : userName);
          const replyAttachments = attachmentsByReply.get(reply.id) || [];
          if (reply.is_internal) {
            return (
              <div key={reply.id} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-[11px] font-medium text-amber-700">Internal note · {authorName}</p>
                <p className="text-sm text-amber-900 mt-1 whitespace-pre-wrap">{reply.message}</p>
                {replyAttachments.map(attachment => <TicketAttachment key={attachment.id} attachment={attachment} compact />)}
              </div>
            );
          }
          return (
            <div key={reply.id} className={`flex ${adminReply ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[90%] rounded-2xl px-4 py-3 min-w-0 ${adminReply ? 'rounded-tr-md bg-primary-600 text-white' : 'rounded-tl-md bg-gray-50 border border-gray-100 text-gray-800'}`}>
                <p className={`text-xs mb-1 ${adminReply ? 'text-white/70' : 'text-gray-400'}`}>{authorName} · {formatDate(reply.created_at)}</p>
                <p className="text-sm whitespace-pre-wrap break-words">{reply.message}</p>
                {replyAttachments.length > 0 && (
                  <div className="space-y-2 mt-2">
                    {replyAttachments.map(attachment => <TicketAttachment key={attachment.id} attachment={attachment} />)}
                  </div>
                )}
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
          {pendingAttachments.length > 0 && (
            <div className="space-y-2 mb-3">
              {pendingAttachments.map(attachment => (
                <TicketAttachment
                  key={attachment.id}
                  attachment={attachment}
                  onRemove={() => void removePendingAttachment(attachment)}
                  removing={removingAttachmentId === attachment.id}
                />
              ))}
            </div>
          )}
          <textarea
            value={replyText}
            onChange={event => setReplyText(event.target.value)}
            placeholder="Reply to customer..."
            rows={3}
            maxLength={5000}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none text-gray-900 resize-none"
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ATTACHMENT_ACCEPT}
            className="hidden"
            onChange={event => void handleAttachmentSelection(event.target.files)}
          />
          <div className="flex items-center justify-between gap-2 mt-2">
            <div className="min-w-0">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAttachments || sendingReply || pendingAttachments.length >= SUPPORT_ATTACHMENT_MAX_PER_REPLY}
                className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-medium disabled:opacity-50"
              >
                {uploadingAttachments ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                Attach file
              </button>
              <p className="text-[10px] text-gray-400 mt-1">Up to 10 files · 20 MB each{ticket.channel === 'telegram' ? ' · sent back to Telegram' : ' · stored in ticket'}</p>
            </div>
            <button
              onClick={sendReply}
              disabled={sendingReply || uploadingAttachments || (!replyText.trim() && pendingAttachments.length === 0) || !user}
              className="px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium flex items-center justify-center gap-2 disabled:opacity-50 min-h-[42px] shrink-0"
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
