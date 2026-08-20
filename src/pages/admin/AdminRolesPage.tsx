import { useState, useMemo, useEffect } from 'react';
import { useRoles, usePermissions, useRolePermissions, setRolePermissions, createRole, updateRole, cloneRole, archiveRole, restoreRole, deleteRole } from '../../lib/rbacHooks';
import type { Role } from '../../lib/rbacTypes';
import { PageHeader, LoadingBar, EmptyState } from '../../components/admin/RbacComponents';
import { Shield, Plus, Copy, Archive, RotateCcw, Trash2, Pencil, MoreVertical, Search, Check, X } from 'lucide-react';

export default function AdminRolesPage() {
  const { roles, loading, refetch } = useRoles();
  const { permissions } = usePermissions();
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editRole, setEditRole] = useState<Role | null>(null);
  const [permDialogRole, setPermDialogRole] = useState<Role | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', slug: '', description: '', color: '#6366f1', icon: 'Shield' });

  const filtered = useMemo(() => {
    return roles.filter((r) => {
      if (!showArchived && r.is_archived) return false;
      if (search && !r.name.toLowerCase().includes(search.toLowerCase()) && !r.slug.includes(search.toLowerCase())) return false;
      return true;
    });
  }, [roles, search, showArchived]);

  const openCreate = () => {
    setForm({ name: '', slug: '', description: '', color: '#6366f1', icon: 'Shield' });
    setEditRole(null);
    setCreateOpen(true);
  };

  const openEdit = (role: Role) => {
    setForm({ name: role.name, slug: role.slug, description: role.description ?? '', color: role.color, icon: role.icon });
    setEditRole(role);
    setCreateOpen(true);
    setMenuOpenId(null);
  };

  const handleSave = async () => {
    setError(null);
    try {
      if (editRole) {
        await updateRole(editRole.id, { name: form.name, description: form.description, color: form.color, icon: form.icon });
        setSuccess('Role updated successfully');
      } else {
        await createRole({ name: form.name, slug: form.slug || form.name.toLowerCase().replace(/\s+/g, '_'), description: form.description, color: form.color, icon: form.icon });
        setSuccess('Role created successfully');
      }
      setCreateOpen(false);
      void refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save role');
    }
  };

  const handleClone = async (role: Role) => {
    setError(null);
    try {
      await cloneRole(role.id, `${role.name} (Copy)`, `${role.slug}_copy_${Date.now()}`);
      setSuccess('Role cloned successfully');
      void refetch();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to clone role'); }
    setMenuOpenId(null);
  };

  const handleArchive = async (role: Role) => {
    try { await archiveRole(role.id); setSuccess('Role archived'); void refetch(); } catch (e) { setError(e instanceof Error ? e.message : 'Archive failed'); }
    setMenuOpenId(null);
  };

  const handleRestore = async (role: Role) => {
    try { await restoreRole(role.id); setSuccess('Role restored'); void refetch(); } catch (e) { setError(e instanceof Error ? e.message : 'Restore failed'); }
    setMenuOpenId(null);
  };

  const handleDelete = async (role: Role) => {
    if (role.is_system) { setError('System roles cannot be deleted'); setMenuOpenId(null); return; }
    try { await deleteRole(role.id); setSuccess('Role deleted'); void refetch(); } catch (e) { setError(e instanceof Error ? e.message : 'Delete failed'); }
    setMenuOpenId(null);
  };

  return (
    <div className="p-4 md:p-8">
      <PageHeader
        title="Roles & Access Control"
        subtitle="Manage admin roles, create custom roles, and configure permissions"
        action={
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 transition-colors">
            <Plus className="w-4 h-4" /> New Role
          </button>
        }
      />

      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700 flex items-center justify-between"><span>{error}</span><button onClick={() => setError(null)}><X className="w-4 h-4" /></button></div>}
      {success && <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4 text-sm text-green-700 flex items-center justify-between"><span>{success}</span><button onClick={() => setSuccess(null)}><X className="w-4 h-4" /></button></div>}
      {loading && <LoadingBar />}

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search roles..." className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <button onClick={() => setShowArchived(!showArchived)} className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors ${showArchived ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-200'}`}>
          {showArchived ? 'Showing Archived' : 'Show Archived'}
        </button>
      </div>

      {!loading && filtered.length === 0 ? (
        <EmptyState message="No roles found" icon={<Shield className="w-12 h-12" />} />
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((role) => (
                  <tr key={role.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: role.color }} />
                        <span className="font-semibold text-sm text-gray-900">{role.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{role.description ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${role.is_system ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                        {role.is_system ? 'System' : 'Custom'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${role.is_archived ? 'bg-gray-50 text-gray-500 border-gray-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
                        {role.is_archived ? 'Archived' : 'Active'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setPermDialogRole(role)} title="Edit permissions" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><Shield className="w-4 h-4" /></button>
                        <div className="relative">
                          <button onClick={() => setMenuOpenId(menuOpenId === role.id ? null : role.id)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><MoreVertical className="w-4 h-4" /></button>
                          {menuOpenId === role.id && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setMenuOpenId(null)} />
                              <div className="absolute right-0 mt-1 w-48 bg-white rounded-xl shadow-lg border border-gray-100 z-20 py-1">
                                <button onClick={() => openEdit(role)} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"><Pencil className="w-4 h-4" /> Edit Role</button>
                                <button onClick={() => handleClone(role)} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"><Copy className="w-4 h-4" /> Clone Role</button>
                                {role.is_archived ? (
                                  <button onClick={() => handleRestore(role)} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"><RotateCcw className="w-4 h-4" /> Restore</button>
                                ) : (
                                  <button onClick={() => handleArchive(role)} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"><Archive className="w-4 h-4" /> Archive</button>
                                )}
                                {!role.is_system && (
                                  <button onClick={() => handleDelete(role)} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" /> Delete</button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setCreateOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-gray-900 mb-4">{editRole ? 'Edit Role' : 'Create New Role'}</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Role Name</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              {!editRole && (
                <div>
                  <label className="text-sm font-medium text-gray-700">Slug</label>
                  <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/\s+/g, '_') })} placeholder="Auto-generated from name" className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-gray-700">Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-sm font-medium text-gray-700">Color</label>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="w-6 h-6 rounded border border-gray-200" style={{ backgroundColor: form.color }} />
                    <input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                </div>
                <div className="flex-1">
                  <label className="text-sm font-medium text-gray-700">Icon</label>
                  <input value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setCreateOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl">Cancel</button>
              <button onClick={handleSave} disabled={!form.name.trim()} className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl disabled:opacity-50">{editRole ? 'Save Changes' : 'Create Role'}</button>
            </div>
          </div>
        </div>
      )}

      {permDialogRole && (
        <PermissionMatrixDialog role={permDialogRole} permissions={permissions} onClose={() => setPermDialogRole(null)} />
      )}
    </div>
  );
}

function PermissionMatrixDialog({ role, permissions, onClose }: {
  role: Role;
  permissions: { id: string; module: string; action: string; label: string; description: string | null }[];
  onClose: () => void;
}) {
  const { permissionIds, loading, refetch } = useRolePermissions(role.id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [local, setLocal] = useState<Set<string>>(new Set());

  useEffect(() => { setLocal(new Set(permissionIds)); }, [permissionIds]);

  const grouped = useMemo(() => {
    const map: Record<string, typeof permissions> = {};
    for (const p of permissions) {
      if (!map[p.module]) map[p.module] = [];
      map[p.module].push(p);
    }
    return map;
  }, [permissions]);

  const toggle = (id: string) => {
    setLocal((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await setRolePermissions(role.id, Array.from(local));
      void refetch();
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to save permissions'); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900">Permissions: {role.name}</h2>
          <p className="text-sm text-gray-500 mt-1">{local.size} of {permissions.length} permissions granted</p>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? <LoadingBar /> : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(grouped).map(([mod, perms]) => (
                <div key={mod} className="border border-gray-200 rounded-xl p-3">
                  <h3 className="font-semibold text-sm capitalize mb-2 text-gray-700">{mod.replace(/_/g, ' ')}</h3>
                  <div className="space-y-1">
                    {perms.map((p) => {
                      const isOn = local.has(p.id);
                      return (
                        <button key={p.id} onClick={() => toggle(p.id)} className="flex items-center justify-between w-full px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors text-left">
                          <div>
                            <p className="text-sm font-medium text-gray-800">{p.label}</p>
                            {p.description && <p className="text-xs text-gray-400">{p.description}</p>}
                          </div>
                          <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${isOn ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                            {isOn ? <Check className="w-3 h-3" /> : <span className="text-xs">—</span>}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          {error && <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>}
        </div>
        <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl disabled:opacity-50">{saving ? 'Saving...' : 'Save Permissions'}</button>
        </div>
      </div>
    </div>
  );
}
