import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Users,
  Search,
  Shield,
  Mail,
  Phone,
  Wallet,
  Calendar,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency } from '../../lib/currency';

interface User {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  is_admin: boolean;
  admin_status: string;
  balance: number;
  created_at: string;
}

export default function AdminUsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'promoters' | 'admins'>('all');

  useEffect(() => {
    fetchUsers();
  }, [user, roleFilter]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('users')
        .select('*');

      if (roleFilter === 'admins') {
        query = query.eq('is_admin', true);
      } else if (roleFilter === 'promoters') {
        query = query.eq('is_admin', false);
      }

      query = query.order('created_at', { ascending: false });

      const { data } = await query;

      if (data) {
        setUsers(data as User[]);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  const filteredUsers = users.filter(u => {
    const q = searchQuery.toLowerCase();
    return (
      u.email.toLowerCase().includes(q) ||
      (u.full_name?.toLowerCase().includes(q) ?? false) ||
      (u.phone?.toLowerCase().includes(q) ?? false)
    );
  });

  const totalBalance = users.reduce((sum, u) => sum + (u.balance || 0), 0);
  const adminCount = users.filter(u => u.is_admin && u.admin_status === 'active').length;
  const promoterCount = users.filter(u => !u.is_admin).length;

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">All Users</h1>
        <p className="text-gray-500 mt-1">View all registered accounts</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100"
        >
          <div className="flex items-center gap-3 mb-2">
            <Users className="w-6 h-6 text-primary-600" />
            <span className="text-sm text-gray-500">Total Users</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{users.length}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100"
        >
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-6 h-6 text-warning" />
            <span className="text-sm text-gray-500">Admins</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{adminCount}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100"
        >
          <div className="flex items-center gap-3 mb-2">
            <Users className="w-6 h-6 text-success" />
            <span className="text-sm text-gray-500">Promoters</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{promoterCount}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100"
        >
          <div className="flex items-center gap-3 mb-2">
            <Wallet className="w-6 h-6 text-success" />
            <span className="text-sm text-gray-500">Total Balance</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{formatCurrency(totalBalance)}</p>
        </motion.div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, email, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all bg-white text-gray-900"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'promoters', 'admins'] as const).map((role) => (
            <button
              key={role}
              onClick={() => setRoleFilter(role)}
              className={`px-4 py-3 rounded-xl font-medium transition-all min-h-[48px] ${
                roleFilter === role
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-primary-300'
              }`}
            >
              {role.charAt(0).toUpperCase() + role.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-gray-300 border-t-warning rounded-full animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!loading && filteredUsers.length === 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-900 font-semibold text-lg">No users found</p>
          <p className="text-sm text-gray-500 mt-1">Try a different search or filter</p>
        </div>
      )}

      {/* User List */}
      {!loading && filteredUsers.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600">User</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600">Contact</th>
                  <th className="text-center px-6 py-4 text-sm font-semibold text-gray-600">Role</th>
                  <th className="text-right px-6 py-4 text-sm font-semibold text-gray-600">Balance</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredUsers.map((u, index) => (
                  <motion.tr
                    key={u.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.02 }}
                    className="hover:bg-gray-50"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          u.is_admin && u.admin_status === 'active'
                            ? 'bg-warning/20'
                            : 'bg-primary-100'
                        }`}>
                          <span className={`font-semibold text-sm ${
                            u.is_admin && u.admin_status === 'active'
                              ? 'text-warning'
                              : 'text-primary-700'
                          }`}>
                            {(u.full_name || u.email)?.[0]?.toUpperCase() || 'U'}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{u.full_name || 'No name'}</p>
                          <p className="text-xs text-gray-500 truncate max-w-[200px]">{u.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Mail className="w-4 h-4 text-gray-400" />
                          <span className="truncate max-w-[200px]">{u.email}</span>
                        </div>
                        {u.phone && (
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            <Phone className="w-4 h-4 text-gray-400" />
                            <span>{u.phone}</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {u.is_admin ? (
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                          u.admin_status === 'active'
                            ? 'bg-warning-muted text-warning'
                            : u.admin_status === 'pending'
                            ? 'bg-warning-muted text-yellow-600'
                            : 'bg-gray-100 text-gray-500'
                        }`}>
                          <Shield className="w-3 h-3" />
                          {u.admin_status === 'active' ? 'Admin' : u.admin_status}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary-100 text-primary-600">
                          <Users className="w-3 h-3" />
                          Promoter
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={`font-semibold ${
                        u.balance > 0 ? 'text-success' : 'text-gray-400'
                      }`}>
                        {formatCurrency(u.balance || 0)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        {formatDate(u.created_at)}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
