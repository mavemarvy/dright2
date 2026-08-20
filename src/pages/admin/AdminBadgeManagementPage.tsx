import { useState, useMemo } from 'react';
import { useBadges, useBadgeAssignments, createBadge, updateBadge, deleteBadge, assignBadge, revokeBadge } from '../../lib/rbacHooks';
import type { Badge } from '../../lib/rbacTypes';
import { PageHeader, LoadingBar, EmptyState } from '../../components/admin/RbacComponents';
import { Trophy, Plus, Pencil, Trash2, Search, Star, X } from 'lucide-react';

const TARGET_TYPES = ['seller','buyer','affiliate','vendor','employer','campaign_creator','verified_business','top_seller','top_affiliate','featured_store','any'];

export default function AdminBadgeManagementPage() {
  const { badges, loading, refetch } = useBadges();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editBadge, setEditBadge] = useState<Badge | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedBadge, setSelectedBadge] = useState<Badge | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', slug: '', description: '', image_url: '', display_priority: 0, target_type: 'any', is_active: true });

  const { assignments, refetch: refetchAssignments } = useBadgeAssignments(selectedBadge?.id);

  const filtered = useMemo(() => badges.filter((b) => !search || b.name.toLowerCase().includes(search.toLowerCase())), [badges, search]);

  const openCreate = () => {
    setForm({ name: '', slug: '', description: '', image_url: '', display_priority: 0, target_type: 'any', is_active: true });
    setEditBadge(null);
    setCreateOpen(true);
  };

  const openEdit = (b: Badge) => {
    setForm({ name: b.name, slug: b.slug, description: b.description ?? '', image_url: b.image_url ?? '', display_priority: b.display_priority, target_type: b.target_type, is_active: b.is_active });
    setEditBadge(b);
    setCreateOpen(true);
  };

  const handleSave = async () => {
    setError(null);
    try {
      if (editBadge) {
        await updateBadge(editBadge.id, { name: form.name, description: form.description, image_url: form.image_url, display_priority: form.display_priority, target_type: form.target_type, is_active: form.is_active });
        setSuccess('Badge updated');
      } else {
        await createBadge({ name: form.name, slug: form.slug || form.name.toLowerCase().replace(/\s+/g, '_'), description: form.description, image_url: form.image_url, display_priority: form.display_priority, target_type: form.target_type, is_active: form.is_active });
        setSuccess('Badge created');
      }
      setCreateOpen(false);
      void refetch();
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); }
  };

  const handleDelete = async (b: Badge) => {
    try { await deleteBadge(b.id); setSuccess('Badge deleted'); void refetch(); } catch (e) { setError(e instanceof Error ? e.message : 'Delete failed'); }
  };

  const openAssign = (b: Badge) => { setSelectedBadge(b); setAssignOpen(true); void refetchAssignments(); };

  return (
    <div className="p-4 md:p-8">
      <PageHeader
        title="Badge Management"
        subtitle="Create and assign badges to sellers, buyers, affiliates, vendors, and more"
        action={<button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 transition-colors"><Plus className="w-4 h-4" /> New Badge</button>}
      />

      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700 flex items-center justify-between"><span>{error}</span><button onClick={() => setError(null)}><X className="w-4 h-4" /></button></div>}
      {success && <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4 text-sm text-green-700 flex items-center justify-between"><span>{success}</span><button onClick={() => setSuccess(null)}><X className="w-4 h-4" /></button></div>}
      {loading && <LoadingBar />}

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search badges..." className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
      </div>

      {!loading && filtered.length === 0 ? (
        <EmptyState message="No badges found" icon={<Trophy className="w-12 h-12" />} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((b) => (
            <div key={b.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                    {b.image_url ? <img src={b.image_url} alt={b.name} className="w-7 h-7 rounded-lg" /> : <Star className="w-5 h-5 text-primary-500" />}
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-gray-900">{b.name}</p>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-gray-50 text-gray-600 border-gray-200 mt-0.5">{b.target_type.replace(/_/g, ' ')}</span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(b)} title="Edit" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(b)} title="Delete" className="p-1.5 rounded-lg hover:bg-gray-100 text-red-500"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              <p className="text-xs text-gray-400 mb-3 min-h-[2rem]">{b.description ?? 'No description'}</p>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-gray-50 text-gray-600 border-gray-200">Priority: {b.display_priority}</span>
                <button onClick={() => openAssign(b)} className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-primary-600 hover:bg-primary-50 rounded-lg"><Plus className="w-3 h-3" /> Assign</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setCreateOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-gray-900 mb-4">{editBadge ? 'Edit Badge' : 'Create New Badge'}</h2>
            <div className="space-y-3">
              <div><label className="text-sm font-medium text-gray-700">Badge Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" /></div>
              {!editBadge && <div><label className="text-sm font-medium text-gray-700">Slug</label><input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/\s+/g, '_') })} placeholder="Auto-generated" className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" /></div>}
              <div><label className="text-sm font-medium text-gray-700">Description</label><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" /></div>
              <div><label className="text-sm font-medium text-gray-700">Image URL (PNG, SVG, or WEBP)</label><input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" /></div>
              <div className="flex gap-3">
                <div className="flex-1"><label className="text-sm font-medium text-gray-700">Priority</label><input type="number" value={form.display_priority} onChange={(e) => setForm({ ...form, display_priority: parseInt(e.target.value) || 0 })} className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" /></div>
                <div className="flex-1"><label className="text-sm font-medium text-gray-700">Target</label><select value={form.target_type} onChange={(e) => setForm({ ...form, target_type: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">{TARGET_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}</select></div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setCreateOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl">Cancel</button>
              <button onClick={handleSave} disabled={!form.name.trim()} className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl disabled:opacity-50">{editBadge ? 'Save' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}

      {assignOpen && selectedBadge && (
        <AssignBadgeDialog badge={selectedBadge} assignments={assignments} onClose={() => setAssignOpen(false)} onAssigned={() => refetchAssignments()} />
      )}
    </div>
  );
}

function AssignBadgeDialog({ badge, assignments, onClose, onAssigned }: {
  badge: Badge;
  assignments: { id: string; user_id: string; reason: string | null; created_at: string }[];
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [userId, setUserId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleAssign = async () => {
    setError(null);
    try {
      await assignBadge(badge.id, userId, reason);
      setUserId(''); setReason('');
      onAssigned();
    } catch (e) { setError(e instanceof Error ? e.message : 'Assignment failed'); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold text-gray-900 mb-4">Assign Badge: {badge.name}</h2>
        <div className="space-y-3">
          <div><label className="text-sm font-medium text-gray-700">User ID</label><input value={userId} onChange={(e) => setUserId(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" /></div>
          <div><label className="text-sm font-medium text-gray-700">Reason (optional)</label><input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" /></div>
          <button onClick={handleAssign} disabled={!userId.trim()} className="w-full px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl disabled:opacity-50">Assign Badge</button>
          {error && <div className="bg-red-50 border border-red-200 rounded-xl p-2 text-sm text-red-700">{error}</div>}
        </div>
        <div className="mt-4">
          <p className="text-sm font-semibold text-gray-700 mb-2">Current Assignments ({assignments.length})</p>
          <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-xl">
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr><th className="text-left px-3 py-2 text-xs font-medium text-gray-500">User</th><th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Reason</th><th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Action</th></tr></thead>
              <tbody className="divide-y divide-gray-50">
                {assignments.map((a) => (
                  <tr key={a.id}>
                    <td className="px-3 py-2 font-mono text-xs">{a.user_id.slice(0, 8)}...</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{a.reason ?? '—'}</td>
                    <td className="px-3 py-2 text-right"><button onClick={() => revokeBadge(a.id).then(onAssigned)} className="text-xs text-red-600 hover:underline">Revoke</button></td>
                  </tr>
                ))}
                {assignments.length === 0 && <tr><td colSpan={3} className="text-center text-gray-400 py-4 text-sm">No assignments yet</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl">Close</button>
        </div>
      </div>
    </div>
  );
}
