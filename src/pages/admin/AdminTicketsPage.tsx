import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Headphones,
  Search,
  Loader2,
  Send,
  X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface SupportTicket {
  id: string;
  user_id: string;
  subject: string;
  message: string;
  status: string;
  priority: string;
  created_at: string;
  user_email?: string;
  user_name?: string;
  replies: TicketReply[];
}

interface TicketReply {
  id: string;
  ticket_id: string;
  admin_id: string | null;
  user_id: string | null;
  message: string;
  created_at: string;
}

export default function AdminTicketsPage() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'open' | 'pending' | 'closed' | 'all'>('open');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  useEffect(() => {
    fetchTickets();
  }, [statusFilter]);

  const fetchTickets = async () => {
    setLoading(true);
    let query = supabase.from('support_tickets').select('*');
    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    query = query.order('created_at', { ascending: false });
    const { data } = await query;

    if (data && data.length > 0) {
      const userIds = [...new Set(data.map((t) => t.user_id))];
      const { data: users } = await supabase
        .from('users')
        .select('id, email, full_name')
        .in('id', userIds);
      const userMap = new Map(users?.map((u) => [u.id, { email: u.email, name: u.full_name }]) || []);

      const ticketsWithUsers = await Promise.all(
        (data as SupportTicket[]).map(async (t) => {
          const { data: replies } = await supabase
            .from('ticket_replies')
            .select('*')
            .eq('ticket_id', t.id)
            .order('created_at', { ascending: true });
          return {
            ...t,
            user_email: userMap.get(t.user_id)?.email || 'Unknown',
            user_name: userMap.get(t.user_id)?.name || 'Unknown',
            replies: (replies || []) as TicketReply[],
          };
        })
      );
      setTickets(ticketsWithUsers);
    } else {
      setTickets([]);
    }
    setLoading(false);
  };

  const sendReply = async () => {
    if (!selectedTicket || !replyText.trim()) return;
    setSendingReply(true);
    try {
      const { error } = await supabase.from('ticket_replies').insert({
        ticket_id: selectedTicket.id,
        admin_id: user?.id,
        message: replyText.trim(),
      });

      if (error) throw error;

      await supabase
        .from('support_tickets')
        .update({ status: 'pending' })
        .eq('id', selectedTicket.id);

      setReplyText('');
      fetchTickets();
      const updated = await supabase
        .from('ticket_replies')
        .select('*')
        .eq('ticket_id', selectedTicket.id)
        .order('created_at', { ascending: true });
      setSelectedTicket({ ...selectedTicket, replies: (updated.data || []) as TicketReply[] });
    } catch (err) {
      console.error('Reply error:', err);
    } finally {
      setSendingReply(false);
    }
  };

  const closeTicket = async (ticketId: string) => {
    await supabase.from('support_tickets').update({ status: 'closed' }).eq('id', ticketId);
    fetchTickets();
    setSelectedTicket(null);
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const filteredTickets = tickets.filter((t) => {
    const q = searchQuery.toLowerCase();
    return t.subject.toLowerCase().includes(q) || t.user_email?.toLowerCase().includes(q);
  });

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Headphones className="w-6 h-6 text-warning" />
          Support Tickets
        </h1>
        <p className="text-gray-500 mt-1">Unified inbox for user feedback and support requests</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search tickets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none bg-white text-gray-900"
          />
        </div>
        <div className="flex gap-2">
          {(['open', 'pending', 'closed', 'all'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-4 py-3 rounded-xl font-medium transition-all min-h-[48px] ${
                statusFilter === s
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-primary-300'
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-gray-300 border-t-warning rounded-full animate-spin" />
        </div>
      ) : filteredTickets.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <Headphones className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-900 font-semibold text-lg">No tickets found</p>
          <p className="text-sm text-gray-500 mt-1">Support tickets from users will appear here</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Ticket List */}
          <div className="space-y-3">
            {filteredTickets.map((t, idx) => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                onClick={() => setSelectedTicket(t)}
                className={`bg-white rounded-2xl shadow-sm border p-4 cursor-pointer transition-all ${
                  selectedTicket?.id === t.id
                    ? 'border-primary-500 ring-2 ring-primary-100'
                    : 'border-gray-100 hover:shadow-md'
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h3 className="font-semibold text-gray-900 truncate">{t.subject}</h3>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${
                      t.status === 'open'
                        ? 'bg-error-muted text-error'
                        : t.status === 'pending'
                        ? 'bg-warning-muted text-warning'
                        : 'bg-success-muted text-success'
                    }`}
                  >
                    {t.status}
                  </span>
                </div>
                <p className="text-sm text-gray-500 line-clamp-2 mb-2">{t.message}</p>
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span>{t.user_name || t.user_email}</span>
                  <span>{formatDate(t.created_at)}</span>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Ticket Detail */}
          {selectedTicket && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 lg:sticky lg:top-4 lg:max-h-[80vh] lg:overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-900">{selectedTicket.subject}</h3>
                <button onClick={() => setSelectedTicket(null)} className="p-1 text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 mb-4">
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-500 mb-1">{selectedTicket.user_name} ({selectedTicket.user_email})</p>
                  <p className="text-sm text-gray-900">{selectedTicket.message}</p>
                </div>

                {selectedTicket.replies.map((r) => (
                  <div
                    key={r.id}
                    className={`rounded-xl p-3 ${r.admin_id ? 'bg-primary-50' : 'bg-gray-50'}`}
                  >
                    <p className="text-xs text-gray-500 mb-1">
                      {r.admin_id ? 'Support Agent' : selectedTicket.user_name}
                    </p>
                    <p className="text-sm text-gray-900">{r.message}</p>
                  </div>
                ))}
              </div>

              {selectedTicket.status !== 'closed' && (
                <>
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Type your reply..."
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none text-gray-900 resize-none mb-3"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={sendReply}
                      disabled={sendingReply || !replyText.trim()}
                      className="flex-1 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium flex items-center justify-center gap-2 disabled:opacity-50 min-h-[44px]"
                    >
                      {sendingReply ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          Send Reply
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => closeTicket(selectedTicket.id)}
                      className="px-4 py-3 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200 transition-colors min-h-[44px]"
                    >
                      Close
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
