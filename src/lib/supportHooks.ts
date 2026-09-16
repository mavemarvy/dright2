import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

export type SupportTicketStatus =
  | 'open'
  | 'pending_support'
  | 'pending_customer'
  | 'escalated'
  | 'resolved'
  | 'closed';

export type SupportPriority = 'low' | 'medium' | 'high' | 'urgent';
export type SupportChannel = 'web' | 'in_app' | 'ai' | 'email' | 'sms' | 'whatsapp' | 'telegram' | 'phone';
export type SupportAttachmentMediaType = 'image' | 'video' | 'audio' | 'document';
export type SupportAttachmentStatus = 'stored' | 'sent' | 'failed' | 'rejected';

export const SUPPORT_ATTACHMENT_BUCKET = 'support-attachments';
export const SUPPORT_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;
export const SUPPORT_ATTACHMENT_MAX_PER_REPLY = 10;

const SUPPORT_ATTACHMENT_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
  'video/mp4', 'video/webm', 'video/quicktime',
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp4',
  'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/rtf', 'application/zip', 'application/x-zip-compressed', 'text/plain', 'text/csv',
]);

const SUPPORT_ATTACHMENT_MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4',
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  rtf: 'application/rtf', zip: 'application/zip', txt: 'text/plain', csv: 'text/csv',
};

export interface SupportTicket {
  id: string;
  user_id: string;
  ticket_number: string | null;
  subject: string;
  message: string;
  status: SupportTicketStatus;
  priority: SupportPriority;
  category: string;
  channel: SupportChannel;
  department_id: string | null;
  assigned_admin_id: string | null;
  admin_reply: string | null;
  replied_by: string | null;
  replied_at: string | null;
  first_response_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  escalation_level: number;
  ai_handled: boolean;
  ai_summary: string | null;
  external_thread_id: string | null;
  external_message_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
  user?: {
    id: string;
    email: string;
    full_name?: string | null;
    username?: string | null;
  } | null;
  department?: {
    id: string;
    name: string;
  } | null;
  assigned_admin?: {
    id: string;
    email: string;
    full_name?: string | null;
    username?: string | null;
  } | null;
}

export interface TicketReply {
  id: string;
  ticket_id: string;
  author_id: string;
  author_role: 'user' | 'admin';
  message: string;
  channel: SupportChannel;
  is_internal: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  author?: {
    id: string;
    email: string;
    full_name?: string | null;
    username?: string | null;
  } | null;
}

export interface SupportAttachment {
  id: string;
  ticket_id: string;
  reply_id: string | null;
  user_id: string;
  uploaded_by: string | null;
  uploaded_by_role: 'user' | 'admin' | 'system';
  channel: SupportChannel;
  direction: 'inbound' | 'outbound';
  media_type: SupportAttachmentMediaType;
  file_name: string;
  mime_type: string;
  file_size: number;
  storage_bucket: string;
  storage_path: string;
  telegram_file_id: string | null;
  telegram_file_unique_id: string | null;
  external_message_id: string | null;
  caption: string | null;
  status: SupportAttachmentStatus;
  error_code: string | null;
  delivered_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

function ticketSelect() {
  return `*,
    user:users!support_tickets_user_id_fkey(id,email,full_name,username),
    department:support_departments!support_tickets_department_id_fkey(id,name),
    assigned_admin:users!support_tickets_assigned_admin_id_fkey(id,email,full_name,username)`;
}

function safeAttachmentFileName(value: string) {
  const normalized = value
    .replace(/[/\\]/g, '-')
    .replace(/[^A-Za-z0-9._,'!&$@=;+?() -]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 180);
  return normalized || `attachment-${Date.now()}`;
}

function attachmentMimeType(file: File) {
  const supplied = (file.type || '').toLowerCase();
  if (SUPPORT_ATTACHMENT_MIME_TYPES.has(supplied)) return supplied;
  const extension = file.name.toLowerCase().split('.').pop() || '';
  const inferred = SUPPORT_ATTACHMENT_MIME_BY_EXTENSION[extension];
  return inferred && SUPPORT_ATTACHMENT_MIME_TYPES.has(inferred) ? inferred : null;
}

function attachmentMediaType(mimeType: string): SupportAttachmentMediaType {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
}

export function useMySupportTickets(userId?: string | null) {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTickets = useCallback(async () => {
    if (!userId) {
      setTickets([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error: queryError } = await supabase
      .from('support_tickets')
      .select(ticketSelect())
      .eq('user_id', userId)
      .order('last_activity_at', { ascending: false });

    if (queryError) {
      setError(queryError.message);
      setTickets([]);
    } else {
      setError(null);
      setTickets((data || []) as unknown as SupportTicket[]);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void fetchTickets();
    if (!userId) return;

    const channel = supabase
      .channel(`support-tickets-user-${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'support_tickets',
        filter: `user_id=eq.${userId}`,
      }, () => void fetchTickets())
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [userId, fetchTickets]);

  return { tickets, loading, error, refetch: fetchTickets };
}

export function useAdminSupportTickets(status?: SupportTicketStatus | 'all') {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('support_tickets')
      .select(ticketSelect())
      .order('last_activity_at', { ascending: false });

    if (status && status !== 'all') query = query.eq('status', status);

    const { data, error: queryError } = await query;
    if (queryError) {
      setError(queryError.message);
      setTickets([]);
    } else {
      setError(null);
      setTickets((data || []) as unknown as SupportTicket[]);
    }
    setLoading(false);
  }, [status]);

  useEffect(() => {
    void fetchTickets();
    const channel = supabase
      .channel('support-tickets-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, () => void fetchTickets())
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [fetchTickets]);

  return { tickets, loading, error, refetch: fetchTickets };
}

export function useTicketReplies(ticketId?: string | null) {
  const [replies, setReplies] = useState<TicketReply[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReplies = useCallback(async () => {
    if (!ticketId) {
      setReplies([]);
      return;
    }

    setLoading(true);
    const { data, error: queryError } = await supabase
      .from('ticket_replies')
      .select('*, author:users!ticket_replies_author_id_fkey(id,email,full_name,username)')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (queryError) {
      setError(queryError.message);
      setReplies([]);
    } else {
      setError(null);
      setReplies((data || []) as unknown as TicketReply[]);
    }
    setLoading(false);
  }, [ticketId]);

  useEffect(() => {
    void fetchReplies();
    if (!ticketId) return;

    const channel = supabase
      .channel(`support-replies-${ticketId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'ticket_replies',
        filter: `ticket_id=eq.${ticketId}`,
      }, () => void fetchReplies())
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [ticketId, fetchReplies]);

  return { replies, loading, error, refetch: fetchReplies };
}

export function useSupportAttachments(ticketId?: string | null) {
  const [attachments, setAttachments] = useState<SupportAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAttachments = useCallback(async () => {
    if (!ticketId) {
      setAttachments([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error: queryError } = await supabase
      .from('support_attachments')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (queryError) {
      setError(queryError.message);
      setAttachments([]);
    } else {
      setError(null);
      setAttachments((data || []) as unknown as SupportAttachment[]);
    }
    setLoading(false);
  }, [ticketId]);

  useEffect(() => {
    void fetchAttachments();
    if (!ticketId) return;

    const channel = supabase
      .channel(`support-attachments-${ticketId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'support_attachments',
        filter: `ticket_id=eq.${ticketId}`,
      }, () => void fetchAttachments())
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [ticketId, fetchAttachments]);

  return { attachments, loading, error, refetch: fetchAttachments };
}

export async function supportAttachmentSignedUrl(attachment: Pick<SupportAttachment, 'storage_bucket' | 'storage_path'>, expiresIn = 600) {
  const { data, error } = await supabase.storage
    .from(attachment.storage_bucket)
    .createSignedUrl(attachment.storage_path, expiresIn);
  if (error || !data?.signedUrl) throw error || new Error('Could not open support attachment.');
  return data.signedUrl;
}

export async function uploadSupportAttachment(input: {
  ticket: Pick<SupportTicket, 'id' | 'user_id' | 'channel'>;
  uploaderId: string;
  file: File;
}): Promise<SupportAttachment> {
  if (!input.file || input.file.size <= 0) throw new Error('Choose a file to attach.');
  if (input.file.size > SUPPORT_ATTACHMENT_MAX_BYTES) throw new Error('Support attachments must be 20 MB or smaller.');

  const mimeType = attachmentMimeType(input.file);
  if (!mimeType) throw new Error('This file type is not supported for DRIGHT support.');

  const fileName = safeAttachmentFileName(input.file.name);
  const storagePath = `${input.ticket.user_id}/${input.ticket.id}/${crypto.randomUUID()}-${fileName}`;
  const mediaType = attachmentMediaType(mimeType);

  const { error: uploadError } = await supabase.storage
    .from(SUPPORT_ATTACHMENT_BUCKET)
    .upload(storagePath, input.file, {
      contentType: mimeType,
      cacheControl: '3600',
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const { data, error: insertError } = await supabase
    .from('support_attachments')
    .insert({
      ticket_id: input.ticket.id,
      reply_id: null,
      user_id: input.ticket.user_id,
      uploaded_by: input.uploaderId,
      uploaded_by_role: 'admin',
      channel: input.ticket.channel,
      direction: 'outbound',
      media_type: mediaType,
      file_name: fileName,
      mime_type: mimeType,
      file_size: input.file.size,
      storage_bucket: SUPPORT_ATTACHMENT_BUCKET,
      storage_path: storagePath,
      status: 'stored',
      metadata: { source: 'admin_ticket_reply' },
    })
    .select('*')
    .single();

  if (insertError || !data) {
    await supabase.storage.from(SUPPORT_ATTACHMENT_BUCKET).remove([storagePath]);
    throw insertError || new Error('Could not register support attachment.');
  }

  return data as unknown as SupportAttachment;
}

export async function deleteUnsentSupportAttachment(attachment: SupportAttachment): Promise<void> {
  if (attachment.reply_id) throw new Error('Sent ticket attachments cannot be removed from the conversation.');
  if (attachment.direction !== 'outbound') throw new Error('Customer attachments cannot be deleted from this reply composer.');

  const { error: storageError } = await supabase.storage
    .from(attachment.storage_bucket)
    .remove([attachment.storage_path]);
  if (storageError) throw storageError;

  const { error } = await supabase
    .from('support_attachments')
    .delete()
    .eq('id', attachment.id)
    .is('reply_id', null);
  if (error) throw error;
}

export async function createSupportTicket(input: {
  user_id: string;
  subject: string;
  message: string;
  priority?: SupportPriority;
  department_id?: string | null;
  category?: string;
  channel?: SupportChannel;
  metadata?: Record<string, unknown>;
}): Promise<SupportTicket> {
  const { data, error } = await supabase
    .from('support_tickets')
    .insert({
      user_id: input.user_id,
      subject: input.subject.trim(),
      message: input.message.trim(),
      priority: input.priority || 'medium',
      department_id: input.department_id || null,
      category: input.category || 'general',
      channel: input.channel || 'web',
      metadata: input.metadata || {},
    })
    .select(ticketSelect())
    .single();

  if (error) throw error;
  return data as unknown as SupportTicket;
}

export async function replyToTicket(input: {
  ticket_id: string;
  author_id: string;
  author_role: 'user' | 'admin';
  message: string;
  channel?: SupportChannel;
  is_internal?: boolean;
  attachment_ids?: string[];
  metadata?: Record<string, unknown>;
}): Promise<TicketReply> {
  const message = input.message.trim();
  const attachmentIds = Array.from(new Set(input.attachment_ids || [])).slice(0, SUPPORT_ATTACHMENT_MAX_PER_REPLY);

  if (input.author_role === 'admin') {
    if (!message && attachmentIds.length === 0) throw new Error('Write a reply or attach at least one file.');
    const { data, error } = await supabase.functions.invoke('support-ticket-reply', {
      body: {
        ticket_id: input.ticket_id,
        message,
        is_internal: !!input.is_internal,
        attachment_ids: attachmentIds,
      },
    });
    if (error) throw error;
    if (!data?.success || !data?.reply) throw new Error(data?.error || 'Could not send support reply.');
    return data.reply as TicketReply;
  }

  if (!message) throw new Error('Write a reply before sending.');
  const { data, error } = await supabase
    .from('ticket_replies')
    .insert({
      ticket_id: input.ticket_id,
      author_id: input.author_id,
      author_role: 'user',
      message,
      channel: input.channel || 'web',
      is_internal: false,
      metadata: input.metadata || {},
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as unknown as TicketReply;
}

export async function updateSupportTicket(
  ticketId: string,
  updates: Partial<Pick<SupportTicket,
    'status' | 'priority' | 'department_id' | 'assigned_admin_id' | 'category' | 'escalation_level' | 'ai_summary'
  >>,
): Promise<void> {
  const { error } = await supabase
    .from('support_tickets')
    .update(updates)
    .eq('id', ticketId);
  if (error) throw error;
}
