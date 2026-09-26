import { useEffect, useMemo, useState } from 'react';
import { Compass, Eye, EyeOff, ExternalLink, Loader2, PanelLeft, ShieldCheck, Users, Shield } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useNavigationVisibility } from '../../contexts/NavigationVisibilityContext';
import SupportEmailVisibilityControls from '../../components/admin/SupportEmailVisibilityControls';
import SignupOnboardingControls from '../../components/admin/SignupOnboardingControls';

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

interface GuidedTourSettings {
  audience_mode: 'new_users_only' | 'all_users_test';
  test_generation: number;
  new_user_rollout_at: string;
  updated_at: string;
}

export default function AdminUserNavigationPage() {
  const [rows, setRows] = useState<NavigationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  const [tourSettings, setTourSettings] = useState<GuidedTourSettings | null>(null);
  const [tourSaving, setTourSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { refresh: refreshGlobalVisibility } = useNavigationVisibility();

  const load = async () => {
    setLoading(true);
    const [rowsResult, permissionResult, tourSettingsResult] = await Promise.all([
      supabase
        .from('user_navigation_visibility')
        .select('feature_key,label,route,nav_group,visible,visible_to_admins,feature_scope,sort_order,updated_at')
        .order('sort_order', { ascending: true }),
      supabase.rpc('has_dright_permission', { p_module: 'site_settings', p_action: 'manage' }),
      supabase
        .from('guided_tour_settings')
        .select('audience_mode,test_generation,new_user_rollout_at,updated_at')
        .eq('singleton', true)
        .maybeSingle(),
    ]);

    if (rowsResult.error) {
      setError('Failed to load visibility controls.');
      setRows([]);
    } else {
      setRows((rowsResult.data || []) as NavigationRow[]);
      setError(null);
    }

    setCanManage(permissionResult.data === true);

    if (!tourSettingsResult.error && tourSettingsResult.data) {
      setTourSettings({
        audience_mode: tourSettingsResult.data.audience_mode === 'all_users_test' ? 'all_users_test' : 'new_users_only',
        test_generation: Math.max(0, Number(tourSettingsResult.data.test_generation || 0)),
        new_user_rollout_at: tourSettingsResult.data.new_user_rollout_at,
        updated_at: tourSettingsResult.data.updated_at,
      });
    } else {
      setTourSettings(null);
    }

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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'guided_tour_settings' },
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

  const toggleTourTestMode = async () => {
    if (!canManage || tourSaving || !tourSettings) return;

    const nextEnabled = tourSettings.audience_mode !== 'all_users_test';
    setTourSaving(true);
    setError(null);

    try {
      const { error: rpcError } = await supabase.rpc('set_guided_tour_test_mode', {
        p_enabled: nextEnabled,
      });
      if (rpcError) throw rpcError;
      await load();
    } catch (toggleError) {
      console.error('Guided tour rollout update failed:', toggleError);
      setError('Failed to update the guided tour rollout mode. Please try again.');
    } finally {
      setTourSaving(false);
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

      <section className="rounded-2xl border border-indigo-200 dark:border-indigo-900/40 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
        <div className="p-4 md:p-5 flex flex-col md:flex-row md:items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300 flex items-center justify-center shrink-0">
            <Compass className="w-5 h-5" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-bold text-gray-900 dark:text-gray-100">Guided Tour Rollout</h2>
              <span className={`text-[10px] uppercase tracking-wide font-bold rounded-full px-2 py-1 ${
                tourSettings?.audience_mode === 'all_users_test'
                  ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'
                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
              }`}>
                {tourSettings?.audience_mode === 'all_users_test' ? 'All users test mode' : 'New users only'}
              </span>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              Turn this on temporarily to make the DRIGHT Basics tour appear for old, recent and new signed-in users when they reach the Dashboard.
              Each time test mode is switched on from off, a new test round starts so users who already completed an earlier round can verify it again.
            </p>

            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Turning it off returns DRIGHT to the normal rollout: only accounts created after the guided-tour launch receive automatic onboarding.
              Admin pages are never covered by the user tour.
              {tourSettings?.audience_mode === 'all_users_test' && (
                <span className="font-semibold text-indigo-600 dark:text-indigo-300"> Current test round: #{tourSettings.test_generation}.</span>
              )}
            </p>
          </div>

          <div className="md:text-right shrink-0">
            <button
              type="button"
              role="switch"
              aria-checked={tourSettings?.audience_mode === 'all_users_test'}
              aria-label="Show DRIGHT Basics guided tour to all users for testing"
              disabled={!canManage || tourSaving || !tourSettings}
              onClick={() => void toggleTourTestMode()}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                tourSettings?.audience_mode === 'all_users_test'
                  ? 'bg-indigo-600'
                  : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              {tourSaving ? (
                <Loader2 className="w-4 h-4 text-white animate-spin mx-auto" />
              ) : (
                <span className={`inline-block h-6 w-6 rounded-full bg-white shadow transition-transform ${
                  tourSettings?.audience_mode === 'all_users_test' ? 'translate-x-7' : 'translate-x-1'
                }`} />
              )}
            </button>
            <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mt-1">
              {tourSettings?.audience_mode === 'all_users_test' ? 'ON — testing everyone' : 'OFF — new users only'}
            </p>
          </div>
        </div>
      </section>

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

      <SignupOnboardingControls />

      <SupportEmailVisibilityControls canManage={canManage} />

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
