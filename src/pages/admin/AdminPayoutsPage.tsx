import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DollarSign, Search, CheckCircle, Clock, Loader2,
  Percent, Save, AlertTriangle, X, Power, ShieldCheck, RefreshCw,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { emitEvent } from '../../lib/notificationEvents';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency } from '../../lib/currency';

interface PayoutRecord {
  id: string;
  user_id: string;
  amount: number;
  payout_type: string;
  status: string;
  admin_approval_percentage: number;
  notes: string | null;
  sales_record_id: string | null;
  verification_id: string | null;
  product_id: string | null;
  processed_at: string | null;
  created_at: string;
  user_email?: string;
  user_name?: string;
}

type PayoutRpcResult = {
  success?: boolean;
  already_processed?: boolean;
  status?: string;
  approved_amount?: number;
  balance_after?: number;
};

interface WithdrawalAutomationSettings {
  key: string;
  auto_payouts_enabled: boolean;
  auto_payout_limit_ngn: number;
  require_verified_bank: boolean;
  max_retries: number;
  updated_at: string;
}

type AutomationResponse = {
  success?: boolean;
  settings?: WithdrawalAutomationSettings;
  error?: string;
};

export default function AdminPayoutsPage() {
  const { user, adminRole } = useAuth();
  const isSuperAdmin = adminRole === 'super_admin';
  const [payouts, setPayouts] = useState<PayoutRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'paid' | 'all'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [selectedPayout, setSelectedPayout] = useState<PayoutRecord | null>(null);
  const [approvalPercentage, setApprovalPercentage] = useState('100');
  const [approvalNotes, setApprovalNotes] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [automation, setAutomation] = useState<WithdrawalAutomationSettings | null>(null);
  const [automationDraft, setAutomationDraft] = useState<WithdrawalAutomationSettings | null>(null);
  const [automationLoading, setAutomationLoading] = useState(false);
  const [automationSaving, setAutomationSaving] = useState(false);
  const [automationError, setAutomationError] = useState<string | null>(null);
  const [automationSuccess, setAutomationSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchPayouts();
  }, [statusFilter]);

  useEffect(() => {
    if (isSuperAdmin) void loadAutomationSettings();
  }, [isSuperAdmin]);

  const loadAutomationSettings = async () => {
    if (!isSuperAdmin) return;
    setAutomationLoading(true);
    setAutomationError(null);
    try {
      const { data, error } = await supabase.functions.invoke('admin-withdrawal-automation-settings', {
        body: { action: 'get' },
      });
      if (error) throw error;
      const result = (data || {}) as AutomationResponse;
      if (!result.success || !result.settings) throw new Error(result.error || 'Unable to load withdrawal automation settings');
      const normalized: WithdrawalAutomationSettings = {
        ...result.settings,
        auto_payout_limit_ngn: Number(result.settings.auto_payout_limit_ngn),
        max_retries: Number(result.settings.max_retries),
      };
      setAutomation(normalized);
      setAutomationDraft(normalized);
    } catch (error) {
      setAutomationError(error instanceof Error ? error.message : 'Unable to load withdrawal automation settings');
    } finally {
      setAutomationLoading(false);
    }
  };

  const saveAutomationSettings = async () => {
    if (!isSuperAdmin || !automationDraft) return;

    const limit = Number(automationDraft.auto_payout_limit_ngn);
    const retries = Number(automationDraft.max_retries);
    if (!Number.isFinite(limit) || limit < 0 || limit > 100000000) {
      setAutomationError('Automatic payout limit must be between ₦0 and ₦100,000,000.');
      return;
    }
    if (!Number.isInteger(retries) || retries < 0 || retries > 10) {
      setAutomationError('Maximum retries must be a whole number from 0 to 10.');
      return;
    }

    const enabling = automation?.auto_payouts_enabled !== true && automationDraft.auto_payouts_enabled === true;
    if (enabling) {
      const confirmed = window.confirm(
        'Enable automatic withdrawals? Eligible queued withdrawals up to the configured limit can be submitted to Paystack without admin review. Verified bank accounts remain required.'
      );
      if (!confirmed) return;
    }

    setAutomationSaving(true);
    setAutomationError(null);
    setAutomationSuccess(null);
    try {
      const { data, error } = await supabase.functions.invoke('admin-withdrawal-automation-settings', {
        body: {
          auto_payouts_enabled: automationDraft.auto_payouts_enabled,
          auto_payout_limit_ngn: limit,
          require_verified_bank: automationDraft.require_verified_bank,
          max_retries: retries,
          ...(enabling ? { confirm_enable: 'ENABLE_AUTOMATIC_PAYOUTS' } : {}),
        },
      });
      if (error) throw error;
      const result = (data || {}) as AutomationResponse;
      if (!result.success || !result.settings) throw new Error(result.error || 'Unable to save withdrawal automation settings');
      const normalized: WithdrawalAutomationSettings = {
        ...result.settings,
        auto_payout_limit_ngn: Number(result.settings.auto_payout_limit_ngn),
        max_retries: Number(result.settings.max_retries),
      };
      setAutomation(normalized);
      setAutomationDraft(normalized);
      setAutomationSuccess(
        normalized.auto_payouts_enabled
          ? 'Automatic payouts are ON. Eligible withdrawals can now be submitted to Paystack automatically.'
          : 'Automatic payouts are OFF. New withdrawals will remain queued for review.'
      );
    } catch (error) {
      setAutomationError(error instanceof Error ? error.message : 'Unable to save withdrawal automation settings');
    } finally {
      setAutomationSaving(false);
    }
  };

  const fetchPayouts = async () => {
    setLoading(true);
    setActionError(null);
    try {
      let query = supabase.from('payout_records').select('*');
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;

      if (data && data.length > 0) {
        const userIds = [...new Set((data as PayoutRecord[]).map((payout) => payout.user_id))];
        const { data: users, error: usersError } = await supabase
          .from('users')
          .select('id, email, full_name')
          .in('id', userIds);
        if (usersError) throw usersError;

        const userMap = new Map((users || []).map((item) => [item.id, { email: item.email, name: item.full_name }]));
        setPayouts((data as PayoutRecord[]).map((payout) => ({
          ...payout,
          user_email: userMap.get(payout.user_id)?.email || 'Unknown',
          user_name: userMap.get(payout.user_id)?.name || 'Unknown',
        })));
      } else {
        setPayouts([]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load payouts';
      console.error('Error fetching payouts:', error);
      setActionError(message);
    } finally {
      setLoading(false);
    }
  };

  const openApprovalModal = (payout: PayoutRecord) => {
    setSelectedPayout(payout);
    setApprovalPercentage('100');
    setApprovalNotes('');
    setActionError(null);
    setShowApprovalModal(true);
  };

  const approvePayout = async () => {
    if (!selectedPayout || !user?.id) return;

    const percentage = Number(approvalPercentage);
    if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
      setActionError('Approval percentage must be greater than 0 and no more than 100.');
      return;
    }

    setProcessingId(selectedPayout.id);
    setActionError(null);
    try {
      const { data, error } = await supabase.rpc('admin_approve_payout_record', {
        p_payout_id: selectedPayout.id,
        p_approval_percentage: percentage,
        p_notes: approvalNotes.trim() || null,
      });
      if (error) throw error;

      const result = (data || {}) as PayoutRpcResult;
      const approvedAmount = result.approved_amount ?? (selectedPayout.amount * percentage) / 100;

      if (!result.already_processed) {
        await emitEvent({
          module: 'wallet',
          eventType: 'payment_received',
          recipientIds: selectedPayout.user_id,
          actorId: user.id,
          metadata: {
            amount: approvedAmount,
            currency: 'USD',
            reference: selectedPayout.id,
          },
        });
      }

      setShowApprovalModal(false);
      setSelectedPayout(null);
      await fetchPayouts();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to approve payout';
      console.error('Error approving payout:', error);
      setActionError(message);
    } finally {
      setProcessingId(null);
    }
  };

  const markAsPaid = async (payout: PayoutRecord) => {
    if (!user?.id) return;
    setProcessingId(payout.id);
    setActionError(null);
    try {
      const { data, error } = await supabase.rpc('admin_mark_payout_paid', {
        p_payout_id: payout.id,
      });
      if (error) throw error;

      const result = (data || {}) as PayoutRpcResult;
      if (!result.already_processed) {
        const approvedAmount = payout.amount * (Number(payout.admin_approval_percentage || 100) / 100);
        await emitEvent({
          module: 'wallet',
          eventType: 'withdrawal_completed',
          recipientIds: payout.user_id,
          actorId: user.id,
          metadata: {
            amount: approvedAmount,
            currency: 'USD',
            reference: payout.id,
          },
        });
      }

      await fetchPayouts();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to mark payout as paid';
      console.error('Error marking payout as paid:', error);
      setActionError(message);
    } finally {
      setProcessingId(null);
    }
  };

  const filteredPayouts = payouts.filter((payout) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return payout.user_email?.toLowerCase().includes(query)
      || payout.user_name?.toLowerCase().includes(query)
      || payout.payout_type.toLowerCase().includes(query);
  });

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Payout Records</h1>
        <p className="text-gray-500 mt-1">Review payout records through atomic wallet operations</p>
      </div>

      {isSuperAdmin && (
        <section id="withdrawal-automation" className="mb-6 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="p-5 md:p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                automationDraft?.auto_payouts_enabled ? 'bg-emerald-100' : 'bg-gray-100'
              }`}>
                <Power className={`w-5 h-5 ${automationDraft?.auto_payouts_enabled ? 'text-emerald-700' : 'text-gray-500'}`} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-bold text-gray-900">Withdrawal Automation</h2>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700">Super Admin only</span>
                  {automation && (
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                      automation.auto_payouts_enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {automation.auto_payouts_enabled ? 'LIVE' : 'OFF'}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  Control whether eligible queued withdrawals are submitted to Paystack automatically.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void loadAutomationSettings()}
              disabled={automationLoading || automationSaving}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${automationLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {automationLoading && !automationDraft ? (
            <div className="p-8 flex items-center justify-center">
              <Loader2 className="w-7 h-7 animate-spin text-primary-600" />
            </div>
          ) : automationDraft ? (
            <div className="p-5 md:p-6 space-y-5">
              {automationError && (
                <div className="p-3 rounded-xl border border-red-100 bg-red-50 text-red-700 text-sm flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{automationError}</span>
                </div>
              )}
              {automationSuccess && (
                <div className="p-3 rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-700 text-sm flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{automationSuccess}</span>
                </div>
              )}

              <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 p-4">
                <div>
                  <p className="font-semibold text-gray-900">Automatic payouts</p>
                  <p className="text-xs text-gray-500 mt-1">
                    When ON, eligible withdrawals up to the limit can be sent to Paystack without waiting for admin review.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={automationDraft.auto_payouts_enabled}
                  onClick={() => setAutomationDraft((current) => current ? {
                    ...current,
                    auto_payouts_enabled: !current.auto_payouts_enabled,
                    require_verified_bank: !current.auto_payouts_enabled ? true : current.require_verified_bank,
                  } : current)}
                  className={`relative w-14 h-8 rounded-full transition-colors shrink-0 ${
                    automationDraft.auto_payouts_enabled ? 'bg-emerald-500' : 'bg-gray-300'
                  }`}
                >
                  <span className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-all ${
                    automationDraft.auto_payouts_enabled ? 'left-7' : 'left-1'
                  }`} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-sm font-medium text-gray-700">Automatic payout limit</span>
                  <div className="mt-1 relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-semibold">₦</span>
                    <input
                      type="number"
                      min="0"
                      max="100000000"
                      step="100"
                      value={automationDraft.auto_payout_limit_ngn}
                      onChange={(event) => setAutomationDraft((current) => current ? {
                        ...current,
                        auto_payout_limit_ngn: Number(event.target.value),
                      } : current)}
                      className="w-full pl-8 pr-3 py-3 rounded-xl border border-gray-200 outline-none focus:border-primary-500 bg-white text-gray-900"
                    />
                  </div>
                  <span className="text-[11px] text-gray-400 mt-1 block">Withdrawals above this amount remain in the review queue.</span>
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-gray-700">Maximum queue retries</span>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    step="1"
                    value={automationDraft.max_retries}
                    onChange={(event) => setAutomationDraft((current) => current ? {
                      ...current,
                      max_retries: Number(event.target.value),
                    } : current)}
                    className="mt-1 w-full px-3 py-3 rounded-xl border border-gray-200 outline-none focus:border-primary-500 bg-white text-gray-900"
                  />
                  <span className="text-[11px] text-gray-400 mt-1 block">Retry cap stored on new withdrawal-queue entries.</span>
                </label>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-primary-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-gray-900">Require verified bank account</p>
                    <p className="text-xs text-gray-500 mt-1">Only Paystack-resolved accounts with a saved transfer-recipient code can receive automated withdrawals.</p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={automationDraft.require_verified_bank}
                  disabled={automationDraft.auto_payouts_enabled}
                  onClick={() => setAutomationDraft((current) => current ? {
                    ...current,
                    require_verified_bank: !current.require_verified_bank,
                  } : current)}
                  className={`relative w-14 h-8 rounded-full transition-colors shrink-0 disabled:opacity-60 ${
                    automationDraft.require_verified_bank ? 'bg-primary-600' : 'bg-gray-300'
                  }`}
                >
                  <span className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-all ${
                    automationDraft.require_verified_bank ? 'left-7' : 'left-1'
                  }`} />
                </button>
              </div>

              {automationDraft.auto_payouts_enabled && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-amber-900">Live money movement</p>
                    <p className="text-xs text-amber-800 mt-1">
                      Saving with automatic payouts ON allows eligible withdrawals to be submitted to Paystack automatically. Keep your Paystack transfer balance, OTP configuration, fraud controls, and webhook monitoring ready.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
                <p className="text-xs text-gray-400">
                  Last updated: {automation.updated_at ? new Date(automation.updated_at).toLocaleString() : 'Unknown'}
                </p>
                <button
                  type="button"
                  onClick={() => void saveAutomationSettings()}
                  disabled={automationSaving || automationLoading}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 disabled:opacity-50"
                >
                  {automationSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save automation settings
                </button>
              </div>
            </div>
          ) : (
            <div className="p-5 text-sm text-red-600">
              {automationError || 'Withdrawal automation settings could not be loaded.'}
            </div>
          )}
        </section>
      )}

      {actionError && (
        <div className="mb-4 p-3 rounded-xl border border-red-100 bg-red-50 text-red-700 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by user or type..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all bg-white text-gray-900"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['pending', 'approved', 'paid', 'all'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-3 rounded-xl font-medium transition-all min-h-[48px] ${statusFilter === status ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-primary-300'}`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
      ) : filteredPayouts.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <DollarSign className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-900 font-semibold text-lg">No payout records</p>
          <p className="text-sm text-gray-500 mt-1">{statusFilter === 'pending' ? 'Pending payout records will appear here.' : 'Try a different filter.'}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600">User</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600">Type</th>
                  <th className="text-right px-6 py-4 text-sm font-semibold text-gray-600">Amount</th>
                  <th className="text-center px-6 py-4 text-sm font-semibold text-gray-600">Approval %</th>
                  <th className="text-center px-6 py-4 text-sm font-semibold text-gray-600">Status</th>
                  <th className="text-center px-6 py-4 text-sm font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredPayouts.map((payout, index) => (
                  <motion.tr key={payout.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: index * 0.02 }} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-900">{payout.user_name || 'Unknown'}</p>
                      <p className="text-xs text-gray-500">{payout.user_email}</p>
                    </td>
                    <td className="px-6 py-4 text-gray-600 capitalize">{payout.payout_type.replace(/_/g, ' ')}</td>
                    <td className="px-6 py-4 text-right font-semibold text-gray-900">{formatCurrency(Number(payout.amount))}</td>
                    <td className="px-6 py-4 text-center">
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">{Number(payout.admin_approval_percentage || 0)}%</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${payout.status === 'paid' ? 'bg-success-muted text-success' : payout.status === 'approved' ? 'bg-primary-100 text-primary-600' : 'bg-warning-muted text-warning'}`}>
                        {payout.status === 'pending' ? <Clock className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
                        {payout.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {payout.status === 'pending' && (
                        <button onClick={() => openApprovalModal(payout)} disabled={processingId === payout.id || !user?.id} className="px-3 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
                          Review
                        </button>
                      )}
                      {payout.status === 'approved' && (
                        <button onClick={() => markAsPaid(payout)} disabled={processingId === payout.id || !user?.id} className="px-3 py-2 bg-success text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 inline-flex items-center gap-1">
                          {processingId === payout.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                          Mark paid
                        </button>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AnimatePresence>
        {showApprovalModal && selectedPayout && (
          <motion.div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowApprovalModal(false)}>
            <motion.div className="w-full max-w-md bg-white rounded-2xl p-6" initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }} onClick={(event) => event.stopPropagation()}>
              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Approve payout</h2>
                  <p className="text-sm text-gray-500">Original amount: {formatCurrency(Number(selectedPayout.amount))}</p>
                </div>
                <button onClick={() => setShowApprovalModal(false)} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
              </div>

              <label className="block text-sm font-medium text-gray-700 mb-2">Approval percentage</label>
              <div className="relative mb-4">
                <Percent className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="number" min="0.01" max="100" step="0.01" value={approvalPercentage} onChange={(event) => setApprovalPercentage(event.target.value)} className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 outline-none focus:border-primary-500" />
              </div>

              <label className="block text-sm font-medium text-gray-700 mb-2">Review notes</label>
              <textarea value={approvalNotes} onChange={(event) => setApprovalNotes(event.target.value)} rows={3} placeholder="Optional internal note" className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:border-primary-500 resize-none mb-5" />

              <div className="rounded-xl bg-gray-50 p-3 mb-5 flex items-center justify-between">
                <span className="text-sm text-gray-500">Amount to credit</span>
                <span className="font-bold text-gray-900">{formatCurrency(Number(selectedPayout.amount) * (Number(approvalPercentage || 0) / 100))}</span>
              </div>

              <button onClick={approvePayout} disabled={processingId === selectedPayout.id || !user?.id} className="w-full py-3 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 disabled:opacity-50 inline-flex items-center justify-center gap-2">
                {processingId === selectedPayout.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Approve and credit wallet
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
