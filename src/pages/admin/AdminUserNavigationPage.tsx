import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, ExternalLink, Loader2, PanelLeft, ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useNavigationVisibility } from '../../contexts/NavigationVisibilityContext';

interface NavigationRow {
  feature_key: string;
  label: string;
  route: string;
  nav_group: string;
  visible: boolean;
  sort_order: number;
  updated_at: string;
}

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
        .select('feature_key,label,route,nav_group,visible,sort_order,updated_at')
        .order('sort_order', { ascending: true }),
      supabase.rpc('has_dright_permission', { p_module: 'site_settings', p_action: 'manage' }),
    ]);

    if (rowsResult.error) {
      setError('Failed to load user navigation controls.');
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

  const visibleCount = rows.filter(row => row.visible).length;

  const toggle = async (row: NavigationRow) => {
    if (!canManage || savingKeys.has(row.feature_key)) return;

    const nextVisible = !row.visible;
    setSavingKeys(prev => new Set(prev).add(row.feature_key));
    setError(null);

    try {
      const { error: rpcError } = await supabase.rpc('set_user_navigation_visibility', {
        p_feature_key: row.feature_key,
        p_visible: nextVisible,
      });

      if (rpcError) throw rpcError;

      setRows(prev => prev.map(item =>
        item.feature_key === row.feature_key
          ? { ...item, visible: nextVisible, updated_at: new Date().toISOString() }
          : item,
      ));
      await refreshGlobalVisibility();
    } catch (toggleError) {
      console.error('Navigation visibility update failed:', toggleError);
      setError(`Failed to update "${row.label}". Please try again.`);
    } finally {
      setSavingKeys(prev => {
        const next = new Set(prev);
        next.delete(row.feature_key);
        return next;
      });
    }
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
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <PanelLeft className="w-6 h-6 text-amber-500" />
            User Navigation
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-2xl">
            Hide or restore individual user sidebar buttons and their DRIGHT pages. Changes save immediately.
            Admin Panel itself is never controlled from this screen.
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 shrink-0">
          <p className="text-xs text-gray-500 dark:text-gray-400">Visible to users</p>
          <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{visibleCount} / {rows.length}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 p-4 flex gap-3">
        <ShieldCheck className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Admin-safe visibility controls</p>
          <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-1">
            Hidden pages are removed from the user sidebar and blocked for ordinary users who try the URL directly.
            Authorized admins can still open a hidden page using Preview.
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
                const saving = savingKeys.has(row.feature_key);
                return (
                  <div key={row.feature_key} className="p-4 md:px-5 flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      row.visible
                        ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                    }`}>
                      {row.visible ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900 dark:text-gray-100">{row.label}</p>
                        <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${
                          row.visible
                            ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                        }`}>
                          {row.visible ? 'Visible' : 'Hidden'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{row.route}</p>
                    </div>

                    <a
                      href={row.route}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      Preview <ExternalLink className="w-3.5 h-3.5" />
                    </a>

                    <button
                      type="button"
                      role="switch"
                      aria-label={`${row.visible ? 'Hide' : 'Show'} ${row.label}`}
                      aria-checked={row.visible}
                      disabled={!canManage || saving}
                      onClick={() => void toggle(row)}
                      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        row.visible ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    >
                      {saving ? (
                        <Loader2 className="w-4 h-4 text-white animate-spin mx-auto" />
                      ) : (
                        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                          row.visible ? 'translate-x-6' : 'translate-x-1'
                        }`} />
                      )}
                    </button>
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
