import { useEffect, useState } from 'react';
import { Clock3, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

type FlyerSettings = {
  loop_enabled: boolean;
  interval_seconds: number;
  max_official_items: number;
  max_sponsored_items: number;
};

const defaults: FlyerSettings = {
  loop_enabled: true,
  interval_seconds: 5,
  max_official_items: 8,
  max_sponsored_items: 4,
};

export default function FlyerRotationSettings() {
  const [settings, setSettings] = useState<FlyerSettings>(defaults);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from('marketplace_flyer_settings')
      .select('loop_enabled,interval_seconds,max_official_items,max_sponsored_items')
      .eq('singleton', true)
      .maybeSingle();
    if (data) {
      setSettings({
        loop_enabled: data.loop_enabled !== false,
        interval_seconds: Number(data.interval_seconds || 5),
        max_official_items: Number(data.max_official_items || 8),
        max_sponsored_items: Number(data.max_sponsored_items || 4),
      });
    }
  };

  useEffect(() => { void load(); }, []);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const { error } = await supabase.rpc('admin_update_marketplace_flyer_settings', {
        p_loop_enabled: settings.loop_enabled,
        p_interval_seconds: settings.interval_seconds,
        p_max_official_items: settings.max_official_items,
        p_max_sponsored_items: settings.max_sponsored_items,
      });
      if (error) throw error;
      setMessage(settings.loop_enabled
        ? 'Flyer loop updated. Active DRIGHT and sponsored flyers will rotate automatically.'
        : 'Loop is off. Only the Welcome to DRIGHT Marketplace flyer will remain in the top strip.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save flyer rotation settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mb-6 rounded-2xl border border-violet-200 bg-violet-50/60 p-4 dark:border-violet-900/60 dark:bg-violet-950/15">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white">
            <RefreshCw className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-black text-gray-950 dark:text-white">Top marketplace flyer loop</h2>
            <p className="mt-1 max-w-2xl text-sm text-gray-600 dark:text-gray-300">
              When enabled, the Welcome flyer plays first and the strip rotates every few seconds through DRIGHT earning flyers and eligible sponsored flyers. Turn the loop off to keep only the Welcome flyer.
            </p>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              To hide the flyer strip completely for users or admins, use
              <Link to="/admin/user-navigation" className="ml-1 inline-flex items-center gap-1 font-bold text-violet-700 dark:text-violet-300">
                Navigation Center <ExternalLink className="h-3 w-3" />
              </Link>.
            </p>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={settings.loop_enabled}
          onClick={() => setSettings(current => ({ ...current, loop_enabled: !current.loop_enabled }))}
          className={'relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors ' + (settings.loop_enabled ? 'bg-violet-600' : 'bg-gray-300 dark:bg-gray-600')}
        >
          <span className={'inline-block h-6 w-6 rounded-full bg-white shadow transition-transform ' + (settings.loop_enabled ? 'translate-x-7' : 'translate-x-1')} />
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-bold text-gray-600 dark:text-gray-300">
          <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" /> Seconds per flyer</span>
          <input
            type="number"
            min={3}
            max={30}
            value={settings.interval_seconds}
            onChange={event => setSettings(current => ({ ...current, interval_seconds: Math.min(30, Math.max(3, Number(event.target.value) || 5)) }))}
            className="mt-1 w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm text-gray-900 dark:border-violet-900 dark:bg-gray-950 dark:text-white"
          />
        </label>
        <label className="text-xs font-bold text-gray-600 dark:text-gray-300">
          DRIGHT flyers in loop
          <input
            type="number"
            min={1}
            max={25}
            value={settings.max_official_items}
            onChange={event => setSettings(current => ({ ...current, max_official_items: Math.min(25, Math.max(1, Number(event.target.value) || 8)) }))}
            className="mt-1 w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm text-gray-900 dark:border-violet-900 dark:bg-gray-950 dark:text-white"
          />
        </label>
        <label className="text-xs font-bold text-gray-600 dark:text-gray-300">
          Sponsored flyers in loop
          <input
            type="number"
            min={0}
            max={10}
            value={settings.max_sponsored_items}
            onChange={event => setSettings(current => ({ ...current, max_sponsored_items: Math.min(10, Math.max(0, Number(event.target.value) || 0)) }))}
            className="mt-1 w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm text-gray-900 dark:border-violet-900 dark:bg-gray-950 dark:text-white"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Paid advertiser flyers keep the Sponsored label. Turning the loop off does not delete or disable any banner.
        </p>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Save flyer settings
        </button>
      </div>

      {message && <p className="mt-3 rounded-xl bg-white/80 px-3 py-2 text-xs text-gray-700 dark:bg-gray-950/70 dark:text-gray-200">{message}</p>}
    </section>
  );
}
