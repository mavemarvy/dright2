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

function ticketSelect() {
  return `*,
    user:users!support_tickets_user_id_fkey(id,email,full_name,username),
    department:support_departments!support_tickets_department_id_fkey(id,name),
    assigned_admin:users!support_tickets_assigned_admin_id_fkey(id,email,full_name,username)`;
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
  metadata?: Record<string, unknown>;
}): Promise<TicketReply> {
  if (input.author_role === 'admin') {
    const { data, error } = await supabase.functions.invoke('support-ticket-reply', {
      body: {
        ticket_id: input.ticket_id,
        message: input.message.trim(),
        is_internal: !!input.is_internal,
      },
    });
    if (error) throw error;
    if (!data?.success || !data?.reply) throw new Error(data?.error || 'Could not send support reply.');
    return data.reply as TicketReply;
  }

  const { data, error } = await supabase
    .from('ticket_replies')
    .insert({
      ticket_id: input.ticket_id,
      author_id: input.author_id,
      author_role: 'user',
      message: input.message.trim(),
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
