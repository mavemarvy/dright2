import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mail,
  Send,
  Loader2,
  CheckCircle,
  AlertCircle,
  Shield,
  Clock,
  XCircle,
  Copy,
  Check,
  ChevronLeft,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Invitation {
  id: string;
  email: string;
  invite_token: string;
  status: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
}

export default function AdminInvitePage() {
  const { profile } = useAuth();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetchInvitations();
  }, []);

  const fetchInvitations = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('admin_invitations')
        .select('id, email, invite_token, status, created_at, expires_at, accepted_at')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      if (data) setInvitations(data as Invitation[]);
    } catch (err) {
      console.error('Error fetching invitations:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email.trim() || !email.includes('@')) {
      setError('Enter a valid email address');
      return;
    }

    setSending(true);
    try {
      const token = generateInviteToken();

      const { error: insertError } = await supabase.from('admin_invitations').insert({
        email: email.trim(),
        invite_token: token,
        invited_by: profile?.id,
        status: 'pending',
      });

      if (insertError) throw insertError;

      const inviteLink = `${window.location.origin}/invite/${token}`;
      setSuccess(`Invitation created! Share this link: ${inviteLink}`);
      setEmail('');
      await fetchInvitations();
    } catch (err) {
      console.error('Invite error:', err);
      const msg = err instanceof Error ? err.message : 'Failed to send invitation';
      setError(msg);
    } finally {
      setSending(false);
    }
  };

  const generateInviteToken = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  };

  const copyInviteLink = async (token: string, id: string) => {
    const link = `${window.location.origin}/invite/${token}`;
    await navigator.clipboard.writeText(link);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const revokeInvitation = async (id: string) => {
    try {
      await supabase
        .from('admin_invitations')
        .update({ status: 'rejected' })
        .eq('id', id);
      await fetchInvitations();
    } catch (err) {
      console.error('Revoke error:', err);
    }
  };

  const getStatusIcon = (status: string) => {
    if (status === 'accepted') return <CheckCircle className="w-4 h-4 text-success" />;
    if (status === 'rejected') return <XCircle className="w-4 h-4 text-error" />;
    return <Clock className="w-4 h-4 text-warning" />;
  };

  const getStatusColor = (status: string) => {
    if (status === 'accepted') return 'bg-success-muted text-success';
    if (status === 'rejected') return 'bg-error-muted text-error';
    return 'bg-warning-muted text-warning';
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <Link to="/admin/admins" className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-900 mb-4 text-sm">
        <ChevronLeft className="w-4 h-4" />Back to Admins
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-warning-muted rounded-xl flex items-center justify-center">
          <Shield className="w-5 h-5 text-warning" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invite Admin</h1>
          <p className="text-gray-500 text-sm">Send an invitation to create a new admin account</p>
        </div>
      </div>

      {/* Invite Form */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <form onSubmit={handleSendInvite} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="newadmin@example.com"
                required
                className="w-full pl-12 pr-4 py-4 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all text-gray-900"
              />
            </div>
          </div>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-error-muted text-error rounded-xl p-4 flex items-center gap-2"
              >
                <AlertCircle className="w-5 h-5" />
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {success && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-success-muted text-success rounded-xl p-4 flex items-start gap-2"
              >
                <CheckCircle className="w-5 h-5 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Invitation created successfully!</p>
                  <p className="text-sm mt-1 break-all">{success}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="submit"
            disabled={sending}
            className="w-full py-4 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 min-h-[48px]"
          >
            {sending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Send className="w-5 h-5" />
                Generate Invitation Link
              </>
            )}
          </button>
        </form>
      </div>

      {/* Invitation History */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Recent Invitations</h2>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-primary-600 animate-spin" />
          </div>
        ) : invitations.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No invitations sent yet</p>
        ) : (
          <div className="space-y-3">
            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center gap-3 p-4 rounded-xl border border-gray-100 hover:border-gray-200 transition-colors"
              >
                <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center shrink-0">
                  <Mail className="w-5 h-5 text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{inv.email}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(inv.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${getStatusColor(inv.status)}`}>
                  {getStatusIcon(inv.status)}
                  {inv.status}
                </span>
                {inv.status === 'pending' && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => copyInviteLink(inv.invite_token, inv.id)}
                      className="p-2 text-gray-400 hover:text-primary-600 transition-colors"
                      title="Copy invite link"
                    >
                      {copiedId === inv.id ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => revokeInvitation(inv.id)}
                      className="p-2 text-gray-400 hover:text-error transition-colors"
                      title="Revoke invitation"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
