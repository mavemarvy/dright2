import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useRoles, useAdminAgreements, useAdminVerifications, acceptAgreement, submitVerification, activateAdmin, setAdminPending, suspendAdmin } from '../../lib/rbacHooks';
import { ADMIN_AGREEMENT_TEXT, VERIFICATION_STATUS_LABELS } from '../../lib/rbacTypes';
import type { Role } from '../../lib/rbacTypes';
import { PageHeader, LoadingBar, StatusChip } from '../../components/admin/RbacComponents';
import { Shield, FileText, CheckCircle, Clock, AlertTriangle, Download, UserCheck, UserX, KeyRound, IdCard, MapPin, Camera, X } from 'lucide-react';

interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  is_admin: boolean;
  admin_status: string | null;
  admin_role: string | null;
  rbac_role_id: string | null;
  agreement_accepted: boolean;
  verification_status: string | null;
  admin_pending_since: string | null;
}

export default function AdminApprovalWorkflowPage() {
  const { profile } = useAuth();
  const { roles } = useRoles();
  const [tab, setTab] = useState<'pending' | 'active' | 'suspended' | 'agreement' | 'verification'>('pending');
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedAdmin, setSelectedAdmin] = useState<AdminUser | null>(null);
  const [confirmOpen, setConfirmOpen] = useState<AdminUser | null>(null);
  const [confirmRole, setConfirmRole] = useState<string>('');

  const { agreements } = useAdminAgreements(selectedAdmin?.id ?? null);
  const { verifications } = useAdminVerifications(selectedAdmin?.id ?? null);

  const fetchAdmins = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('users')
      .select('id, email, full_name, is_admin, admin_status, admin_role, rbac_role_id, agreement_accepted, verification_status, admin_pending_since')
      .eq('is_admin', true)
      .order('created_at', { ascending: false });
    if (error) setError(error.message);
    else setAdmins(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void fetchAdmins(); }, [fetchAdmins]);

  const pendingAdmins = admins.filter((a) => a.admin_status === 'pending');
  const activeAdmins = admins.filter((a) => a.admin_status === 'active');
  const suspendedAdmins = admins.filter((a) => a.admin_status === 'suspended');

  const handleActivate = async (admin: AdminUser, roleId: string) => {
    setError(null);
    try {
      await activateAdmin(admin.id, roleId);
      setSuccess(`${admin.email} activated successfully`);
      setConfirmOpen(null);
      void fetchAdmins();
    } catch (e) { setError(e instanceof Error ? e.message : 'Activation failed'); }
  };

  const handleSuspend = async (admin: AdminUser) => {
    try { await suspendAdmin(admin.id); setSuccess('Admin suspended'); void fetchAdmins(); } catch (e) { setError(e instanceof Error ? e.message : 'Suspend failed'); }
  };

  const handleSetPending = async (userId: string) => {
    try { await setAdminPending(userId); setSuccess('User set as pending admin'); void fetchAdmins(); } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
  };
  void handleSetPending;

  const downloadAgreement = () => {
    const blob = new Blob([ADMIN_AGREEMENT_TEXT], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'DRIGHT_Admin_Agreement.txt'; a.click();
    URL.revokeObjectURL(url);
  };

  const tabs = [
    { key: 'pending', label: 'Pending Activation', count: pendingAdmins.length },
    { key: 'active', label: 'Active Admins', count: activeAdmins.length },
    { key: 'suspended', label: 'Suspended', count: suspendedAdmins.length },
    { key: 'agreement', label: 'My Agreement', count: 0 },
    { key: 'verification', label: 'My Verification', count: 0 },
  ] as const;

  return (
    <div className="p-4 md:p-8">
      <PageHeader title="Administrator Management" subtitle="Review, activate, and manage admin accounts with approval workflow" />

      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700 flex items-center justify-between"><span>{error}</span><button onClick={() => setError(null)}><X className="w-4 h-4" /></button></div>}
      {success && <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4 text-sm text-green-700 flex items-center justify-between"><span>{success}</span><button onClick={() => setSuccess(null)}><X className="w-4 h-4" /></button></div>}
      {loading && <LoadingBar />}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100"><div className="flex items-center gap-2 mb-1"><Shield className="w-5 h-5 text-blue-500" /><span className="text-2xl font-bold text-gray-900">{admins.length}</span></div><p className="text-sm text-gray-500">Total Admins</p></div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100"><div className="flex items-center gap-2 mb-1"><Clock className="w-5 h-5 text-amber-500" /><span className="text-2xl font-bold text-gray-900">{pendingAdmins.length}</span></div><p className="text-sm text-gray-500">Pending Activation</p></div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100"><div className="flex items-center gap-2 mb-1"><CheckCircle className="w-5 h-5 text-green-500" /><span className="text-2xl font-bold text-gray-900">{activeAdmins.length}</span></div><p className="text-sm text-gray-500">Active Admins</p></div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100"><div className="flex items-center gap-2 mb-1"><UserX className="w-5 h-5 text-red-500" /><span className="text-2xl font-bold text-gray-900">{suspendedAdmins.length}</span></div><p className="text-sm text-gray-500">Suspended</p></div>
      </div>

      <div className="flex gap-1 mb-4 border-b border-gray-100 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex items-center gap-2 ${tab === t.key ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
            {t.count > 0 && <span className="px-1.5 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">{t.count}</span>}
          </button>
        ))}
      </div>

      {tab === 'pending' && (
        <AdminList admins={pendingAdmins} onActivate={(a) => { setSelectedAdmin(a); setConfirmOpen(a); setConfirmRole(''); }} onSuspend={handleSuspend} />
      )}
      {tab === 'active' && (
        <AdminList admins={activeAdmins} onSuspend={handleSuspend} showRole />
      )}
      {tab === 'suspended' && (
        <AdminList admins={suspendedAdmins} onActivate={(a) => { setSelectedAdmin(a); setConfirmOpen(a); setConfirmRole(''); }} onSuspend={() => {}} />
      )}
      {tab === 'agreement' && profile && (
        <AgreementTab adminId={profile.id} agreements={agreements} onDownload={downloadAgreement} />
      )}
      {tab === 'verification' && profile && (
        <VerificationTab adminId={profile.id} verifications={verifications} onSubmitted={() => {}} />
      )}

      {confirmOpen && (
        <ConfirmActivationDialog admin={confirmOpen} roles={roles} confirmRole={confirmRole} setConfirmRole={setConfirmRole} onConfirm={() => handleActivate(confirmOpen, confirmRole)} onClose={() => setConfirmOpen(null)} />
      )}
    </div>
  );
}

function AdminList({ admins, onActivate, onSuspend, showRole }: {
  admins: AdminUser[];
  onActivate?: (a: AdminUser) => void;
  onSuspend: (a: AdminUser) => void;
  showRole?: boolean;
}) {
  if (admins.length === 0) return <div className="text-center py-12 text-gray-400">No administrators in this category</div>;
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Name</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Email</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
              {showRole && <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Role</th>}
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Agreement</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Verification</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {admins.map((a) => (
              <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{a.full_name ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{a.email}</td>
                <td className="px-4 py-3"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${a.admin_status === 'active' ? 'bg-green-50 text-green-700 border-green-200' : a.admin_status === 'suspended' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>{a.admin_status ?? '—'}</span></td>
                {showRole && <td className="px-4 py-3 text-sm text-gray-500">{a.admin_role ?? '—'}</td>}
                <td className="px-4 py-3">{a.agreement_accepted ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Clock className="w-4 h-4 text-amber-500" />}</td>
                <td className="px-4 py-3"><StatusChip status={a.verification_status ?? 'not_submitted'} labels={VERIFICATION_STATUS_LABELS} /></td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {onActivate && a.admin_status !== 'active' && <button onClick={() => onActivate(a)} className="px-2.5 py-1 text-xs font-medium text-green-600 border border-green-200 rounded-lg hover:bg-green-50 flex items-center gap-1"><UserCheck className="w-3 h-3" /> Activate</button>}
                    {a.admin_status === 'active' && <button onClick={() => onSuspend(a)} className="px-2.5 py-1 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 flex items-center gap-1"><UserX className="w-3 h-3" /> Suspend</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ConfirmActivationDialog({ admin, roles, confirmRole, setConfirmRole, onConfirm, onClose }: {
  admin: AdminUser;
  roles: Role[];
  confirmRole: string;
  setConfirmRole: (v: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-amber-500" /></div>
          <h2 className="text-xl font-bold text-gray-900">Confirm Activation</h2>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
          <p className="text-sm text-amber-800 font-medium mb-1">Warning</p>
          <p className="text-sm text-amber-700">You are about to grant administrative permissions to <strong>{admin.email}</strong>. These permissions provide access to sensitive platform data. Do you want to continue?</p>
        </div>
        <div className="mb-4">
          <label className="text-sm font-medium text-gray-700">Assign Role</label>
          <select value={confirmRole} onChange={(e) => setConfirmRole(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
            <option value="">Select a role...</option>
            {roles.filter((r) => !r.is_archived).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl">Cancel</button>
          <button onClick={onConfirm} disabled={!confirmRole} className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl disabled:opacity-50">Confirm & Activate</button>
        </div>
      </div>
    </div>
  );
}

function AgreementTab({ adminId, agreements, onDownload }: {
  adminId: string;
  agreements: { id: string; accepted_at: string; agreement_version: string; pdf_downloaded: boolean }[];
  onDownload: () => void;
}) {
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleAccept = async () => {
    setSaving(true);
    setError(null);
    try {
      await acceptAgreement(adminId, true);
      setAccepted(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to accept agreement'); }
    setSaving(false);
  };

  return (
    <div className="max-w-2xl">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-4">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-5 h-5 text-primary-500" />
          <h3 className="font-bold text-gray-900">Administrator Agreement</h3>
        </div>
        <div className="bg-gray-50 rounded-xl p-4 max-h-64 overflow-y-auto mb-4">
          <pre className="text-sm text-gray-600 whitespace-pre-wrap font-sans">{ADMIN_AGREEMENT_TEXT}</pre>
        </div>
        <button onClick={onDownload} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-600 border border-primary-200 rounded-xl hover:bg-primary-50 mb-4"><Download className="w-4 h-4" /> Download PDF Copy</button>
        {agreements.length > 0 ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2 mb-4"><CheckCircle className="w-5 h-5 text-green-500" /><span className="text-sm text-green-700">Agreement accepted on {new Date(agreements[0].accepted_at).toLocaleDateString()}</span></div>
        ) : (
          <div>
            <label className="flex items-center gap-2 mb-3 cursor-pointer">
              <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="w-4 h-4 rounded" />
              <span className="text-sm text-gray-700">I have read and agree to the Administrator Agreement</span>
            </label>
            {error && <div className="bg-red-50 border border-red-200 rounded-xl p-2 mb-3 text-sm text-red-700">{error}</div>}
            <button onClick={handleAccept} disabled={!accepted || saving} className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl disabled:opacity-50">{saving ? 'Accepting...' : 'Accept Agreement'}</button>
          </div>
        )}
      </div>
    </div>
  );
}

function VerificationTab({ adminId, verifications, onSubmitted }: {
  adminId: string;
  verifications: { id: string; doc_type: string; doc_url: string; status: string; reviewer_notes: string | null; created_at: string }[];
  onSubmitted: () => void;
}) {
  const [docType, setDocType] = useState<'government_id' | 'proof_of_address' | 'selfie' | 'other'>('government_id');
  const [docUrl, setDocUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      await submitVerification(adminId, docType, docUrl);
      setDocUrl('');
      onSubmitted();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to submit'); }
    setSaving(false);
  };

  const docIcons: Record<string, React.ReactNode> = {
    government_id: <IdCard className="w-4 h-4" />,
    proof_of_address: <MapPin className="w-4 h-4" />,
    selfie: <Camera className="w-4 h-4" />,
    other: <FileText className="w-4 h-4" />,
  };

  return (
    <div className="max-w-2xl">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-4">
        <div className="flex items-center gap-2 mb-4">
          <KeyRound className="w-5 h-5 text-primary-500" />
          <h3 className="font-bold text-gray-900">Submit Verification Documents</h3>
        </div>
        <div className="space-y-3 mb-4">
          <div><label className="text-sm font-medium text-gray-700">Document Type</label><select value={docType} onChange={(e) => setDocType(e.target.value as typeof docType)} className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"><option value="government_id">Government ID</option><option value="proof_of_address">Proof of Address</option><option value="selfie">Selfie (optional)</option><option value="other">Other</option></select></div>
          <div><label className="text-sm font-medium text-gray-700">Document URL</label><input value={docUrl} onChange={(e) => setDocUrl(e.target.value)} placeholder="Paste the uploaded document URL" className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" /></div>
          <button onClick={handleSubmit} disabled={!docUrl.trim() || saving} className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl disabled:opacity-50">{saving ? 'Submitting...' : 'Submit Document'}</button>
          {error && <div className="bg-red-50 border border-red-200 rounded-xl p-2 text-sm text-red-700">{error}</div>}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h3 className="font-bold text-gray-900 mb-4">Submitted Documents ({verifications.length})</h3>
        {verifications.length === 0 ? <p className="text-sm text-gray-400 text-center py-4">No documents submitted yet</p> : (
          <div className="space-y-2">
            {verifications.map((v) => (
              <div key={v.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center text-primary-500">{docIcons[v.doc_type] ?? <FileText className="w-4 h-4" />}</div>
                  <div><p className="text-sm font-medium text-gray-900 capitalize">{v.doc_type.replace(/_/g, ' ')}</p><p className="text-xs text-gray-400">{new Date(v.created_at).toLocaleDateString()}</p></div>
                </div>
                <StatusChip status={v.status} labels={VERIFICATION_STATUS_LABELS} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
