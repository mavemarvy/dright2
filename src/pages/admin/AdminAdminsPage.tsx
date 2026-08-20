import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Shield,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  ShieldCheck,
  ShieldX,
  UserPlus,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { emitEvent } from '../../lib/notificationEvents';
import { useAuth } from '../../contexts/AuthContext';

interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  is_admin: boolean;
  admin_status: string;
  created_at: string;
}

export default function AdminAdminsPage() {
  const { user } = useAuth();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'active' | 'suspended' | 'rejected' | 'all'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    fetchAdmins();
  }, [user, statusFilter]);

  const fetchAdmins = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('users')
        .select('*')
        .eq('is_admin', true);

      if (statusFilter !== 'all') {
        query = query.eq('admin_status', statusFilter);
      }

      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;

      if (!error && data) {
        setAdmins(data as AdminUser[]);
      }
    } catch (error) {
      console.error('Error fetching admins:', error);
    } finally {
      setLoading(false);
    }
  };

  const approveAdmin = async (adminId: string) => {
    setProcessingId(adminId);
    try {
      const { error } = await supabase.rpc('activate_admin', {
        p_target_id: adminId,
        p_rbac_role_id: null,
      });
      if (error) throw error;

      // Notify the new admin
      await emitEvent({
        module: 'admin',
        eventType: 'support_ticket_update',
        recipientIds: adminId,
        actorId: user?.id,
        metadata: {
          ticketTitle: 'Admin Access Approved',
          actionUrl: '/admin',
        },
      });

      // Create referral link for new admin if they don't have one
      const { data: existingLink } = await supabase
        .from('referral_links')
        .select('id')
        .eq('user_id', adminId)
        .maybeSingle();

      if (!existingLink) {
        await supabase.from('referral_links').insert({ user_id: adminId });
      }

      fetchAdmins();
    } catch (error) {
      console.error('Error approving admin:', error);
    } finally {
      setProcessingId(null);
    }
  };

  const suspendAdmin = async (adminId: string) => {
    setProcessingId(adminId);
    try {
      const { error } = await supabase.rpc('suspend_admin', { p_target_id: adminId });
      if (error) throw error;

      // Notify the admin
      await emitEvent({
        module: 'admin',
        eventType: 'support_ticket_update',
        recipientIds: adminId,
        actorId: user?.id,
        metadata: {
          ticketTitle: 'Admin Access Suspended',
          actionUrl: '/admin',
        },
      });

      fetchAdmins();
    } catch (error) {
      console.error('Error suspending admin:', error);
    } finally {
      setProcessingId(null);
    }
  };

  const reactivateAdmin = async (adminId: string) => {
    setProcessingId(adminId);
    try {
      const { error } = await supabase.rpc('activate_admin', {
        p_target_id: adminId,
        p_rbac_role_id: null,
      });
      if (error) throw error;

      // Notify the admin
      await emitEvent({
        module: 'admin',
        eventType: 'support_ticket_update',
        recipientIds: adminId,
        actorId: user?.id,
        metadata: {
          ticketTitle: 'Admin Access Restored',
          actionUrl: '/admin',
        },
      });

      fetchAdmins();
    } catch (error) {
      console.error('Error reactivating admin:', error);
    } finally {
      setProcessingId(null);
    }
  };

  const rejectAdmin = async (adminId: string) => {
    setProcessingId(adminId);
    try {
      const { error } = await supabase.rpc('reject_admin', { p_target_id: adminId });
      if (error) throw error;

      await emitEvent({
        module: 'admin',
        eventType: 'support_ticket_update',
        recipientIds: adminId,
        actorId: user?.id,
        metadata: {
          ticketTitle: 'Admin Application Rejected',
          actionUrl: '/profile',
        },
      });

      fetchAdmins();
    } catch (error) {
      console.error('Error rejecting admin:', error);
    } finally {
      setProcessingId(null);
    }
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  const filteredAdmins = admins.filter(a => {
    const q = searchQuery.toLowerCase();
    return a.email.toLowerCase().includes(q) || (a.full_name?.toLowerCase().includes(q) ?? false);
  });

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Management</h1>
          <p className="text-gray-500 mt-1">
            Approve new admin registrations and manage admin access
          </p>
        </div>
        <Link
          to="/admin/invite"
          className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors min-h-[44px]"
        >
          <UserPlus className="w-5 h-5" />
          Invite Admin
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search admins..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all bg-white text-gray-900"
          />
        </div>
        <div className="flex gap-2">
          {(['pending', 'active', 'suspended', 'rejected', 'all'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-3 rounded-xl font-medium transition-all min-h-[48px] ${
                statusFilter === status
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-primary-300'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* First Admin Notice */}
      {admins.filter(a => a.admin_status === 'active').length === 0 && (
        <div className="bg-warning-muted border border-warning/30 rounded-2xl p-5 mb-6">
          <div className="flex items-center gap-3 mb-2">
            <ShieldCheck className="w-6 h-6 text-warning" />
            <span className="font-semibold text-gray-900">You are the first admin!</span>
          </div>
          <p className="text-sm text-gray-600">
            As the first admin, your account was automatically approved. You can now approve other admin registrations.
          </p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-gray-300 border-t-warning rounded-full animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!loading && filteredAdmins.length === 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <Shield className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-900 font-semibold text-lg">No admins found</p>
          <p className="text-sm text-gray-500 mt-1">
            {statusFilter === 'pending'
              ? 'New admin requests will appear here'
              : 'Try a different filter'}
          </p>
        </div>
      )}

      {/* Admin List */}
      {!loading && filteredAdmins.length > 0 && (
        <div className="space-y-4">
          {filteredAdmins.map((admin, index) => (
            <motion.div
              key={admin.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
            >
              <div className="flex flex-col sm:flex-row gap-4 p-5">
                {/* Avatar */}
                <div className="shrink-0">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${
                    admin.admin_status === 'active'
                      ? 'bg-gradient-to-br from-warning to-orange-600'
                      : admin.admin_status === 'suspended'
                      ? 'bg-gray-300'
                      : 'bg-warning-muted'
                  }`}>
                    <Shield className={`w-7 h-7 ${
                      admin.admin_status === 'active'
                        ? 'text-white'
                        : admin.admin_status === 'suspended'
                        ? 'text-gray-500'
                        : 'text-warning'
                    }`} />
                  </div>
                </div>

                {/* Admin Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div>
                      <p className="font-semibold text-gray-900 text-lg">
                        {admin.full_name || 'Unknown'}
                      </p>
                      <p className="text-sm text-gray-500">{admin.email}</p>
                      {admin.phone && (
                        <p className="text-xs text-gray-400 mt-0.5">{admin.phone}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${
                        admin.admin_status === 'active'
                          ? 'bg-success-muted text-success'
                          : admin.admin_status === 'suspended'
                          ? 'bg-error-muted text-error'
                          : 'bg-warning-muted text-warning'
                      }`}>
                        {admin.admin_status === 'active' && <ShieldCheck className="w-3 h-3" />}
                        {admin.admin_status === 'suspended' && <ShieldX className="w-3 h-3" />}
                        {admin.admin_status === 'pending' && <Clock className="w-3 h-3" />}
                        {admin.admin_status.toUpperCase()}
                      </span>
                      <p className="text-xs text-gray-500 mt-1">
                        Joined {formatDate(admin.created_at)}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  {admin.id !== user?.id && (
                    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
                      {admin.admin_status === 'pending' && (
                        <>
                          <button
                            onClick={() => approveAdmin(admin.id)}
                            disabled={processingId === admin.id}
                            className="flex items-center gap-2 px-4 py-2 bg-success text-white rounded-xl font-medium hover:bg-green-700 transition-colors disabled:opacity-50 min-h-[44px]"
                          >
                            {processingId === admin.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <CheckCircle className="w-4 h-4" />
                                Approve
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => rejectAdmin(admin.id)}
                            disabled={processingId === admin.id}
                            className="flex items-center gap-2 px-4 py-2 bg-error-muted text-error rounded-xl font-medium hover:bg-error hover:text-white transition-colors disabled:opacity-50 min-h-[44px]"
                          >
                            {processingId === admin.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <XCircle className="w-4 h-4" />
                                Reject
                              </>
                            )}
                          </button>
                        </>
                      )}

                      {admin.admin_status === 'active' && (
                        <button
                          onClick={() => suspendAdmin(admin.id)}
                          disabled={processingId === admin.id}
                          className="flex items-center gap-2 px-4 py-2 bg-error-muted text-error rounded-xl font-medium hover:bg-error hover:text-white transition-colors disabled:opacity-50 min-h-[44px]"
                        >
                          {processingId === admin.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <ShieldX className="w-4 h-4" />
                              Suspend Access
                            </>
                          )}
                        </button>
                      )}

                      {admin.admin_status === 'suspended' && (
                        <button
                          onClick={() => reactivateAdmin(admin.id)}
                          disabled={processingId === admin.id}
                          className="flex items-center gap-2 px-4 py-2 bg-success text-white rounded-xl font-medium hover:bg-green-700 transition-colors disabled:opacity-50 min-h-[44px]"
                        >
                          {processingId === admin.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <ShieldCheck className="w-4 h-4" />
                              Reactivate
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  )}

                  {admin.id === user?.id && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <span className="text-xs text-gray-400 italic">
                        This is you - {admin.admin_status === 'pending' ? 'pending super admin' : 'super admin'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
