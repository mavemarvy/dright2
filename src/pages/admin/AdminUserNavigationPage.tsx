import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, ExternalLink, Loader2, PanelLeft, ShieldCheck, Users, Shield } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useNavigationVisibility } from '../../contexts/NavigationVisibilityContext';

interface NavigationRow {
  feature_key: string;
  label: string;
  route: string;
  nav_group: string;
  visible: boolean;
  visible_to_admins: boolean;
  feature_scope: 'navigation' | 'component' | 'feature';
  sort_order: number;
  updated_at: string;
}

type Audience = 'users' | 'admins';

export default function AdminUserNavigationPage() {
  const [rows, setRows] = useState<NavigationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const { refresh: refreshGlobalVisibility } = useNavigationVisibility();

  const load = async () => {
    setLoading(true);
    const [rowsResult, permissionResult] = await Promise.all([
      supabase
        .from('user_navigation_visibility')
        .select('feature_key,label,route,nav_group,visible,visible_to_admins,feature_scope,sort_order,updated_at')
        .order('sort_order', { ascending: true }),
      supabase.rpc('has_dright_permission', { p_module: 'site_settings', p_action: 'manage' }),
    ]);

    if (rowsResult.error) {
      setError('Failed to load visibility controls.');
      setRows([]);
    } else {
      setRows((rowsResult.data || []) as NavigationRow[]);
      setError(null);
    }

    setCanManage(permissionResult.data === true);
    setLoading(false);
  };

  useEffect(() => {
    void load();

    const channel = supabase
      .channel('admin-user-navigation-controls')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_navigation_visibility' },
        () => {
          void load();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const groups = useMemo(() => {
    const ordered = new Map<string, NavigationRow[]>();
    for (const row of rows) {
      const existing = ordered.get(row.nav_group) || [];
      existing.push(row);
      ordered.set(row.nav_group, existing);
    }
    return [...ordered.entries()];
  }, [rows]);

  const usersVisibleCount = rows.filter(row => row.visible).length;
  const adminsVisibleCount = rows.filter(row => row.visible_to_admins).length;

  const toggle = async (row: NavigationRow, audience: Audience) => {
    const savingKey = `${row.feature_key}:${audience}`;
    if (!canManage || savingKeys.has(savingKey)) return;

    const current = audience === 'admins' ? row.visible_to_admins : row.visible;
    const nextVisible = !current;
    setSavingKeys(prev => new Set(prev).add(savingKey));
    setError(null);

    try {
      const rpcName = audience === 'admins'
        ? 'set_user_navigation_admin_visibility'
        : 'set_user_navigation_visibility';

      const { error: rpcError } = await supabase.rpc(rpcName, {
        p_feature_key: row.feature_key,
        p_visible: nextVisible,
      });

      if (rpcError) throw rpcError;

      setRows(prev => prev.map(item => {
        if (item.feature_key !== row.feature_key) return item;
        return audience === 'admins'
          ? { ...item, visible_to_admins: nextVisible, updated_at: new Date().toISOString() }
          : { ...item, visible: nextVisible, updated_at: new Date().toISOString() };
      }));
      await refreshGlobalVisibility();
    } catch (toggleError) {
      console.error('Visibility update failed:', toggleError);
      setError(`Failed to update "${row.label}" for ${audience}. Please try again.`);
    } finally {
      setSavingKeys(prev => {
        const next = new Set(prev);
        next.delete(savingKey);
        return next;
      });
    }
  };

  const Switch = ({ row, audience }: { row: NavigationRow; audience: Audience }) => {
    const checked = audience === 'admins' ? row.visible_to_admins : row.visible;
    const saving = savingKeys.has(`${row.feature_key}:${audience}`);
    const label = audience === 'admins' ? 'Admins' : 'Users';
    const Icon = audience === 'admins' ? Shield : Users;

    return (
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-gray-400 shrink-0" />
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 w-12">{label}</span>
        <button
          type="button"
          role="switch"
          aria-label={`${checked ? 'Hide' : 'Show'} ${row.label} for ${label}`}
          aria-checked={checked}
          disabled={!canManage || saving}
          onClick={() => void toggle(row, audience)}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            checked ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
          }`}
        >
          {saving ? (
            <Loader2 className="w-4 h-4 text-white animate-spin mx-auto" />
          ) : (
            <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
              checked ? 'translate-x-6' : 'translate-x-1'
            }`} />
          )}
        </button>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="p-6 md:p-8 flex min-h-[55vh] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <PanelLeft className="w-6 h-6 text-amber-500" />
            User Navigation & Features
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-2xl">
            Control user-facing pages and features separately for normal users and admin accounts.
            Changes save immediately and propagate through Supabase Realtime.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 shrink-0">
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">Users</p>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{usersVisibleCount} / {rows.length}</p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">Admins</p>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{adminsVisibleCount} / {rows.length}</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 p-4 flex gap-3">
        <ShieldCheck className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Two-audience maintenance controls</p>
          <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-1">
            The Users switch controls ordinary accounts. The Admins switch controls admin accounts while they use the normal DRIGHT interface.
            The Admin Panel and this control page remain available so you cannot lock yourself out.
          </p>
        </div>
      </div>

      {!canManage && (
        <div className="rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 p-4 text-sm text-red-700 dark:text-red-300">
          Your admin role can view these settings but does not have permission to change them.
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 p-4 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="space-y-5">
        {groups.map(([group, items]) => (
          <section
            key={group}
            className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden"
          >
            <div className="px-4 md:px-5 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/30">
              <h2 className="text-sm font-bold uppercase tracking-wide text-gray-600 dark:text-gray-300">{group}</h2>
            </div>

            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {items.map(row => {
                const visibleToAnyone = row.visible || row.visible_to_admins;
                const canPreview = row.feature_scope === 'navigation' && row.route.startsWith('/');
                return (
                  <div key={row.feature_key} className="p-4 md:px-5">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        visibleToAnyone
                          ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                      }`}>
                        {visibleToAnyone ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-gray-900 dark:text-gray-100">{row.label}</p>
                          <span className="text-[10px] uppercase tracking-wide font-bold rounded-full px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300">
                            {row.feature_scope}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                          {canPreview ? row.route : row.feature_scope === 'component' ? 'Sidebar interface control' : 'User-facing feature group'}
                        </p>
                      </div>

                      {canPreview && (
                        <a
                          href={row.route}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hidden md:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          Preview <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>

                    <div className="mt-3 pl-0 sm:pl-[52px] flex flex-wrap gap-x-6 gap-y-3">
                      <Switch row={row} audience="users" />
                      <Switch row={row} audience="admins" />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
