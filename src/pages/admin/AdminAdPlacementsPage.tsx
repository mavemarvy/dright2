import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3, Check, Gauge, Loader2, Mail, Megaphone, Percent, RefreshCw,
  Save, Settings2, Users,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

type Placement = {
  code: string;
  name: string;
  description: string | null;
  enabled: boolean;
  surcharge_percent: number;
  frequency_cap: number;
  frequency_window_hours: number;
  supported_asset_types: string[];
  sort_order: number;
};

type Tier = {
  code: 'normal' | 'plus' | 'platinum';
  name: string;
  description: string | null;
  reach_multiplier: number;
  spend_pace_multiplier: number;
  pricing_multiplier: number;
  is_enabled: boolean;
};

type TierLink = {
  tier_code: string;
  placement_code: string;
  is_included: boolean;
  surcharge_override_percent: number | null;
};

type ExternalAnalytics = {
  deliveries: number;
  delivered: number;
  estimated_reach: number;
  tracked_clicks: number;
  failed: number;
  channels: Array<{
    channel: string;
    deliveries: number;
    delivered: number;
    estimated_reach: number;
    tracked_clicks: number;
  }>;
};

const TIER_LABEL: Record<string, string> = {
  normal: 'Normal',
  plus: 'Premium',
  platinum: 'Platinum',
};

const emptyAnalytics: ExternalAnalytics = {
  deliveries: 0,
  delivered: 0,
  estimated_reach: 0,
  tracked_clicks: 0,
  failed: 0,
  channels: [],
};

export default function AdminAdPlacementsPage() {
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [links, setLinks] = useState<TierLink[]>([]);
  const [analytics, setAnalytics] = useState<ExternalAnalytics>(emptyAnalytics);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [placementRes, tierRes, linkRes, analyticsRes] = await Promise.all([
      supabase.from('ad_placements')
        .select('code,name,description,enabled,surcharge_percent,frequency_cap,frequency_window_hours,supported_asset_types,sort_order')
        .order('sort_order'),
      supabase.from('promotion_tiers')
        .select('code,name,description,reach_multiplier,spend_pace_multiplier,pricing_multiplier,is_enabled')
        .order('tier_rank'),
      supabase.from('promotion_tier_placements')
        .select('tier_code,placement_code,is_included,surcharge_override_percent'),
      supabase.rpc('get_admin_promotion_external_analytics'),
    ]);

    const firstError = placementRes.error || tierRes.error || linkRes.error || analyticsRes.error;
    if (firstError) setError(firstError.message);

    setPlacements(((placementRes.data || []) as Placement[]).map(row => ({
      ...row,
      surcharge_percent: Number(row.surcharge_percent || 0),
    })));
    setTiers(((tierRes.data || []) as Tier[]).map(row => ({
      ...row,
      reach_multiplier: Number(row.reach_multiplier || 1),
      spend_pace_multiplier: Number(row.spend_pace_multiplier || 1),
      pricing_multiplier: Number(row.pricing_multiplier || 1),
    })));
    setLinks((linkRes.data || []) as TierLink[]);
    setAnalytics((analyticsRes.data || emptyAnalytics) as ExternalAnalytics);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const linkMap = useMemo(
    () => new Map(links.map(link => [`${link.tier_code}:${link.placement_code}`, link])),
    [links],
  );

  const patchPlacement = (code: string, patch: Partial<Placement>) => {
    setPlacements(current => current.map(row => row.code === code ? { ...row, ...patch } : row));
  };

  const patchTier = (code: string, patch: Partial<Tier>) => {
    setTiers(current => current.map(row => row.code === code ? { ...row, ...patch } : row));
  };

  const savePlacement = async (placement: Placement) => {
    setSaving(`placement:${placement.code}`);
    setError(null);
    setNotice(null);
    try {
      const percent = Math.max(0, Math.min(100, Number(placement.surcharge_percent || 0)));
      const { error: updateError } = await supabase.from('ad_placements').update({
        enabled: placement.enabled,
        surcharge_percent: percent,
        updated_at: new Date().toISOString(),
      }).eq('code', placement.code);
      if (updateError) throw updateError;

      if (placement.code === 'email') {
        const { error: settingsError } = await supabase.from('promotion_distribution_settings').update({
          email_ad_placement_status: placement.enabled ? 'available' : 'disabled',
          updated_at: new Date().toISOString(),
        }).eq('singleton', true);
        if (settingsError) throw settingsError;
      }

      setNotice(`${placement.name} saved.`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save placement.');
    } finally {
      setSaving(null);
    }
  };

  const saveTier = async (tier: Tier) => {
    setSaving(`tier:${tier.code}`);
    setError(null);
    setNotice(null);
    try {
      const { error: updateError } = await supabase.from('promotion_tiers').update({
        name: tier.name,
        reach_multiplier: Math.max(0.01, Math.min(100, Number(tier.reach_multiplier || 1))),
        spend_pace_multiplier: Math.max(0.01, Math.min(100, Number(tier.spend_pace_multiplier || 1))),
        pricing_multiplier: Math.max(0.01, Math.min(100, Number(tier.pricing_multiplier || 1))),
        is_enabled: tier.is_enabled,
        updated_at: new Date().toISOString(),
      }).eq('code', tier.code);
      if (updateError) throw updateError;
      setNotice(`${TIER_LABEL[tier.code]} tier saved.`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save tier.');
    } finally {
      setSaving(null);
    }
  };

  const setTierPlacement = async (tierCode: string, placementCode: string, checked: boolean) => {
    const key = `link:${tierCode}:${placementCode}`;
    setSaving(key);
    setError(null);
    try {
      const { error: upsertError } = await supabase.from('promotion_tier_placements').upsert({
        tier_code: tierCode,
        placement_code: placementCode,
        is_included: checked,
        surcharge_override_percent: null,
      }, { onConflict: 'tier_code,placement_code' });
      if (upsertError) throw upsertError;
      setLinks(current => {
        const rest = current.filter(row => !(row.tier_code === tierCode && row.placement_code === placementCode));
        return [...rest, { tier_code: tierCode, placement_code: placementCode, is_included: checked, surcharge_override_percent: null }];
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update tier placement.');
    } finally {
      setSaving(null);
    }
  };

  return <div className="mx-auto max-w-7xl p-4 md:p-8">
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-600 to-violet-600 text-white">
          <Percent className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-black text-gray-950 dark:text-white">Ad Placements & Tiers</h1>
          <p className="text-sm text-gray-500">Control placement availability, percentage fees, delivery multipliers and external promotion analytics.</p>
        </div>
      </div>
      <button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold dark:border-gray-700 dark:bg-gray-900">
        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh
      </button>
    </div>

    {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
    {notice && <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">{notice}</div>}

    <section className="mb-6 rounded-3xl border border-gray-100 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-4 flex items-center gap-2"><BarChart3 className="h-5 w-5 text-primary-600" /><h2 className="font-black text-gray-950 dark:text-white">External delivery analytics</h2></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metric label="Delivery records" value={analytics.deliveries} />
        <Metric label="Delivered" value={analytics.delivered} />
        <Metric label="Estimated reachable" value={analytics.estimated_reach} />
        <Metric label="Tracked clicks" value={analytics.tracked_clicks} />
        <Metric label="Failed" value={analytics.failed} />
      </div>
      {analytics.channels.length > 0 && <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {analytics.channels.map(row => <div key={row.channel} className="rounded-2xl bg-gray-50 p-3 dark:bg-gray-950">
          <p className="text-xs font-black uppercase text-gray-500">{row.channel.replaceAll('_', ' ')}</p>
          <p className="mt-2 text-sm font-bold text-gray-900 dark:text-white">{row.delivered.toLocaleString()} delivered · {row.tracked_clicks.toLocaleString()} clicks</p>
          <p className="text-xs text-gray-400">{row.estimated_reach.toLocaleString()} estimated reachable</p>
        </div>)}
      </div>}
    </section>

    <section className="mb-6 rounded-3xl border border-gray-100 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-4 flex items-center gap-2"><Gauge className="h-5 w-5 text-primary-600" /><div><h2 className="font-black text-gray-950 dark:text-white">Promotion tiers</h2><p className="text-xs text-gray-500">Default: Normal 1×, Premium 5×, Platinum 25×. Delivery and pace remain configurable.</p></div></div>
      <div className="grid gap-4 lg:grid-cols-3">
        {tiers.map(tier => <div key={tier.code} className="rounded-2xl border border-gray-100 p-4 dark:border-gray-800">
          <div className="flex items-center justify-between gap-3">
            <input value={tier.name} onChange={event => patchTier(tier.code, { name: event.target.value })} className="min-w-0 flex-1 bg-transparent font-black text-gray-950 outline-none dark:text-white" />
            <input type="checkbox" checked={tier.is_enabled} onChange={event => patchTier(tier.code, { is_enabled: event.target.checked })} className="h-4 w-4 accent-primary-600" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <NumberField label="Delivery / reach ×" value={tier.reach_multiplier} onChange={value => patchTier(tier.code, { reach_multiplier: value })} />
            <NumberField label="Spend pace ×" value={tier.spend_pace_multiplier} onChange={value => patchTier(tier.code, { spend_pace_multiplier: value })} />
          </div>
          <p className="mt-3 text-[11px] leading-5 text-gray-400">A higher pace uses the same media budget faster. Delivery multiplier raises ranking and estimated inventory without bypassing targeting, quality or frequency caps.</p>
          <button onClick={() => void saveTier(tier)} disabled={saving === `tier:${tier.code}`} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gray-950 px-3 py-2 text-xs font-black text-white disabled:opacity-50 dark:bg-white dark:text-gray-950">
            {saving === `tier:${tier.code}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save tier
          </button>
        </div>)}
      </div>
    </section>

    <section className="rounded-3xl border border-gray-100 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-4 flex items-center gap-2"><Settings2 className="h-5 w-5 text-primary-600" /><div><h2 className="font-black text-gray-950 dark:text-white">Placements</h2><p className="text-xs text-gray-500">Each selected placement adds its percentage of the campaign media budget. Default is 1% per placement.</p></div></div>
      {loading ? <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-primary-600" /></div> : <div className="space-y-3">
        {placements.map(placement => {
          const Icon = placement.code === 'email' ? Mail : placement.code === 'community_discovery' ? Users : placement.code === 'external_platforms' ? Megaphone : Settings2;
          return <article key={placement.code} className="rounded-2xl border border-gray-100 p-4 dark:border-gray-800">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-950/30"><Icon className="h-4 w-4" /></div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-gray-950 dark:text-white">{placement.name}</h3><code className="text-[10px] text-gray-400">{placement.code}</code></div>
                  <p className="mt-1 max-w-3xl text-xs leading-5 text-gray-500">{placement.description}</p>
                  <p className="mt-1 text-[10px] text-gray-400">Assets: {(placement.supported_asset_types || []).join(', ') || '—'} · cap {placement.frequency_cap}/{placement.frequency_window_hours}h</p>
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs font-bold text-gray-600 dark:text-gray-300">
                Enabled
                <input type="checkbox" checked={placement.enabled} onChange={event => patchPlacement(placement.code, { enabled: event.target.checked })} className="h-4 w-4 accent-primary-600" />
              </label>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[160px_1fr_auto] md:items-end">
              <NumberField label="Placement fee %" value={placement.surcharge_percent} onChange={value => patchPlacement(placement.code, { surcharge_percent: value })} />
              <div>
                <p className="mb-2 text-[10px] font-black uppercase tracking-wide text-gray-400">Available in tiers</p>
                <div className="flex flex-wrap gap-2">
                  {tiers.map(tier => {
                    const key = `${tier.code}:${placement.code}`;
                    const checked = linkMap.get(key)?.is_included === true;
                    return <label key={tier.code} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold dark:border-gray-700">
                      <input type="checkbox" checked={checked} disabled={saving === `link:${tier.code}:${placement.code}`} onChange={event => void setTierPlacement(tier.code, placement.code, event.target.checked)} className="accent-primary-600" />
                      {TIER_LABEL[tier.code] || tier.name}
                    </label>;
                  })}
                </div>
              </div>
              <button onClick={() => void savePlacement(placement)} disabled={saving === `placement:${placement.code}`} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">
                {saving === `placement:${placement.code}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Save
              </button>
            </div>
          </article>;
        })}
      </div>}
    </section>
  </div>;
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="block text-xs font-bold text-gray-500">{label}<input type="number" min="0" max="100" step="0.01" value={Number.isFinite(value) ? value : 0} onChange={event => onChange(Number(event.target.value))} className="mt-1 w-full rounded-xl border border-gray-200 bg-transparent px-3 py-2.5 text-sm font-bold text-gray-900 dark:border-gray-700 dark:text-white" /></label>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl bg-gray-50 p-4 dark:bg-gray-950"><p className="text-xl font-black text-gray-950 dark:text-white">{Number(value || 0).toLocaleString()}</p><p className="text-xs text-gray-400">{label}</p></div>;
}
