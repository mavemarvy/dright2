import { useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2, Mail } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type SupportDepartmentEmail = {
  id: string;
  name: string;
  email: string | null;
  email_visible: boolean;
  is_available: boolean;
  sort_order: number;
};

export default function SupportEmailVisibilityControls({ canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<SupportDepartmentEmail[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const { data, error: loadError } = await supabase
      .from('support_departments')
      .select('id,name,email,email_visible,is_available,sort_order')
      .eq('is_deleted', false)
      .order('sort_order', { ascending: true });

    if (loadError) {
      setError('Could not load customer-care email visibility.');
      return;
    }
    setRows((data || []) as SupportDepartmentEmail[]);
    setError(null);
  };

  useEffect(() => {
    void load();
    const channel = supabase
      .channel('admin-support-email-visibility')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_departments' }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  const toggle = async (row: SupportDepartmentEmail) => {
    if (!canManage || busy) return;
    setBusy(row.id);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('admin_set_support_department_email_visibility', {
        p_department_id: row.id,
        p_visible: !row.email_visible,
      });
      if (rpcError) throw rpcError;
      setRows(current => current.map(item => item.id === row.id ? { ...item, email_visible: !row.email_visible } : item));
    } catch (e) {
      console.error('Support email visibility update failed', e);
      setError('Could not update that support email. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-2xl border border-blue-200 dark:border-blue-900/50 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
      <div className="px-4 md:px-5 py-4 border-b border-blue-100 dark:border-blue-900/40 bg-blue-50/70 dark:bg-blue-950/20">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 flex items-center justify-center shrink-0">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-gray-900 dark:text-gray-100">Customer-care email visibility</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              Hide an inactive email address without disabling the whole support department. Hidden addresses disappear from the user Help Center immediately.
            </p>
          </div>
        </div>
      </div>

      {error && <p className="m-4 text-sm text-red-600 dark:text-red-300">{error}</p>}

      <div className="divide-y divide-gray-100 dark:divide-gray-700">
        {rows.map(row => (
          <div key={row.id} className="p-4 md:px-5 flex items-center gap-3">
            <div className={'w-9 h-9 rounded-xl flex items-center justify-center ' + (row.email_visible ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300')}>
              {row.email_visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">{row.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{row.email || 'No email configured'}</p>
              {!row.is_available && <p className="text-[11px] text-amber-600 dark:text-amber-300 mt-1">This whole support department is currently unavailable.</p>}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={row.email_visible}
              aria-label={(row.email_visible ? 'Hide ' : 'Show ') + row.name + ' email'}
              disabled={!canManage || busy === row.id || !row.email}
              onClick={() => void toggle(row)}
              className={'relative inline-flex h-8 w-14 items-center rounded-full transition-colors disabled:opacity-50 ' + (row.email_visible ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600')}
            >
              {busy === row.id ? (
                <Loader2 className="w-4 h-4 text-white animate-spin mx-auto" />
              ) : (
                <span className={'inline-block h-6 w-6 rounded-full bg-white shadow transition-transform ' + (row.email_visible ? 'translate-x-7' : 'translate-x-1')} />
              )}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
