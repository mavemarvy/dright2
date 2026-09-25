import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Check, Loader2, Mail, Megaphone, RefreshCw, Save, Settings2, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type Placement = {
  code: string;
  name: string;
  description: string | null;
  enabled: boolean;
  surcharge_percent: number;
  minimum_tier_rank: number;
  sort_order: number;
};

type Tier = {
  code: 'normal' | 'plus' | 'platinum';
  name: string;
  is_enabled: boolean;
  pricing_multiplier: number;
  reach_multiplier: number;
  tier_rank: number;
};

type Settings = {
  email_ads_enabled: boolean;
  community_ads_enabled: boolean;
  external_platforms_enabled: boolean;
};

type Config = {
  placements: Placement[];
  tiers: Tier[];
  settings: Settings;
  promotion_email_subscribers: number;
  telegram_private_subscribers: number;
  external_analytics: {
    telegram_deliveries: number;
    email_deliveries: number;
    telegram_clicks: number;
    email_clicks: number;
  };
};

const num = (value: unknown) => Number(value || 0);

export default function AdminPromotionDistributionPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('get_admin_promotion_distribution_config');
    if (rpcError) setError(rpcError.message);
    else setConfig(data as Config);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const savePlacement = async (placement: Placement) => {
    setWorking(`placement:${placement.code}`);
    setError(null); setMessage(null);
    const { error: rpcError } = await supabase.rpc('admin_update_promotion_placement', {
      p_code: placement.code,
      p_enabled: placement.enabled,
      p_surcharge_percent: num(placement.surcharge_percent),
      p_minimum_tier_rank: placement.minimum_tier_rank,
    });
    if (rpcError) setError(rpcError.message);
    else { setMessage(`${placement.name} saved.`); await load(); }
    setWorking(null);
  };

  const saveTier = async (tier: Tier) => {
    setWorking(`tier:${tier.code}`);
    setError(null); setMessage(null);
    const { error: rpcError } = await supabase.rpc('admin_update_promotion_tier', {
      p_code: tier.code,
      p_is_enabled: tier.is_enabled,
      p_pricing_multiplier: num(tier.pricing_multiplier),
      p_reach_multiplier: num(tier.reach_multiplier),
    });
    if (rpcError) setError(rpcError.message);
    else { setMessage(`${tier.name} saved.`); await load(); }
    setWorking(null);
  };

  const saveMaster = async () => {
    if (!config) return;
    setWorking('master');
    setError(null); setMessage(null);
    const { error: rpcError } = await supabase.rpc('admin_update_promotion_distribution_settings', {
      p_email_ads_enabled: config.settings.email_ads_enabled,
      p_community_ads_enabled: config.settings.community_ads_enabled,
      p_external_platforms_enabled: config.settings.external_platforms_enabled,
    });
    if (rpcError) setError(rpcError.message);
    else { setMessage('Distribution channels saved.'); await load(); }
    setWorking(null);
  };

  const patchPlacement = (code: string, patch: Partial<Placement>) =>
    setConfig(current => current ? ({
      ...current,
      placements: current.placements.map(item => item.code === code ? { ...item, ...patch } : item),
    }) : current);

  const patchTier = (code: Tier['code'], patch: Partial<Tier>) =>
    setConfig(current => current ? ({
      ...current,
      tiers: current.tiers.map(item => item.code === code ? { ...item, ...patch } : item),
    }) : current);

  const patchSettings = (patch: Partial<Settings>) =>
    setConfig(current => current ? ({ ...current, settings: { ...current.settings, ...patch } }) : current);

  if (loading && !config) return <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-primary-600" /></div>;

  return <main className="mx-auto max-w-7xl p-4 md:p-8">
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-black text-gray-950 dark:text-white">Ad Distribution</h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-500">Configure placement add-on percentages, Email/Community/external publishing, and Normal/Premium/Platinum delivery strength.</p>
      </div>
      <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold dark:border-gray-700">
        <RefreshCw className="h-4 w-4" /> Refresh
      </button>
    </div>

    {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
    {message && <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">{message}</div>}

    {config && <>
      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric icon={Megaphone} label="Telegram deliveries" value={num(config.external_analytics?.telegram_deliveries)} />
        <Metric icon={BarChart3} label="Telegram tracked clicks" value={num(config.external_analytics?.telegram_clicks)} />
        <Metric icon={Mail} label="Email deliveries" value={num(config.external_analytics?.email_deliveries)} />
        <Metric icon={Users} label="Email / Telegram subscribers" value={`${num(config.promotion_email_subscribers)} / ${num(config.telegram_private_subscribers)}`} />
      </section>

      <section className="mb-6 rounded-3xl border border-gray-100 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-4 flex items-center gap-2"><Settings2 className="h-5 w-5 text-primary-600" /><h2 className="font-black text-gray-950 dark:text-white">Distribution channels</h2></div>
        <div className="grid gap-3 md:grid-cols-3">
          <MasterToggle label="Email Ads" description="Uses Resend and sends only to users who explicitly opted into promotional email." checked={config.settings.email_ads_enabled} onChange={value => patchSettings({ email_ads_enabled: value })} />
          <MasterToggle label="Community Ads" description="Sponsored placement on DRIGHT Communities." checked={config.settings.community_ads_enabled} onChange={value => patchSettings({ community_ads_enabled: value })} />
          <MasterToggle label="External Platforms" description="Telegram group/channel/private subscriber publishing." checked={config.settings.external_platforms_enabled} onChange={value => patchSettings({ external_platforms_enabled: value })} />
        </div>
        <button onClick={() => void saveMaster()} disabled={working === 'master'} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">
          {working === 'master' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save channel toggles
        </button>
      </section>

      <section className="mb-6 rounded-3xl border border-gray-100 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="font-black text-gray-950 dark:text-white">Tier delivery multipliers</h2>
        <p className="mt-1 text-xs leading-5 text-gray-500">Default delivery priority is Normal 1×, Premium 5× and Platinum 25×. Higher tiers are selected more aggressively and can spend the same budget faster through greater delivery opportunity.</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {config.tiers.map(tier => <div key={tier.code} className="rounded-2xl border border-gray-200 p-4 dark:border-gray-700">
            <div className="flex items-center justify-between gap-3">
              <div><p className="font-black text-gray-950 dark:text-white">{tier.name}</p><p className="text-xs uppercase text-gray-400">{tier.code === 'plus' ? 'premium' : tier.code}</p></div>
              <input type="checkbox" checked={tier.is_enabled} onChange={event => patchTier(tier.code, { is_enabled: event.target.checked })} className="h-5 w-5 accent-primary-600" />
            </div>
            <label className="mt-4 block text-xs font-bold text-gray-500">Delivery / reach multiplier
              <input type="number" min="0.01" step="0.25" value={tier.reach_multiplier} onChange={event => patchTier(tier.code, { reach_multiplier: Number(event.target.value) })} className="mt-1 w-full rounded-xl border border-gray-200 bg-transparent px-3 py-2.5 text-sm dark:border-gray-700" />
            </label>
            <label className="mt-3 block text-xs font-bold text-gray-500">CPM pricing multiplier
              <input type="number" min="0.01" step="0.05" value={tier.pricing_multiplier} onChange={event => patchTier(tier.code, { pricing_multiplier: Number(event.target.value) })} className="mt-1 w-full rounded-xl border border-gray-200 bg-transparent px-3 py-2.5 text-sm dark:border-gray-700" />
            </label>
            <button onClick={() => void saveTier(tier)} disabled={working === `tier:${tier.code}`} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-3 py-2.5 text-xs font-black text-white disabled:opacity-50 dark:bg-white dark:text-gray-950">
              {working === `tier:${tier.code}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save tier
            </button>
          </div>)}
        </div>
      </section>

      <section className="rounded-3xl border border-gray-100 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="font-black text-gray-950 dark:text-white">Placement pricing</h2>
        <p className="mt-1 text-xs leading-5 text-gray-500">Each selected placement adds its percentage to the media budget. Example: $5 media budget + ten 1% placements = $0.50 placement fees before any configured platform fee/tax.</p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {config.placements.map(placement => <div key={placement.code} className="rounded-2xl border border-gray-200 p-4 dark:border-gray-700">
            <div className="flex items-start justify-between gap-3">
              <div><p className="font-black text-gray-950 dark:text-white">{placement.name}</p><p className="mt-1 text-xs leading-5 text-gray-500">{placement.description}</p><p className="mt-1 font-mono text-[10px] text-gray-400">{placement.code}</p></div>
              <input type="checkbox" checked={placement.enabled} onChange={event => patchPlacement(placement.code, { enabled: event.target.checked })} className="h-5 w-5 shrink-0 accent-primary-600" />
            </div>
            <div className="mt-3 grid grid-cols-[1fr_110px] gap-3">
              <label className="text-xs font-bold text-gray-500">Add-on percentage
                <div className="relative mt-1"><input type="number" min="0" max="100" step="0.25" value={placement.surcharge_percent} onChange={event => patchPlacement(placement.code, { surcharge_percent: Number(event.target.value) })} className="w-full rounded-xl border border-gray-200 bg-transparent px-3 py-2.5 pr-8 text-sm dark:border-gray-700" /><span className="absolute right-3 top-2.5 text-sm text-gray-400">%</span></div>
              </label>
              <label className="text-xs font-bold text-gray-500">Min tier
                <input type="number" min="1" max="3" value={placement.minimum_tier_rank} onChange={event => patchPlacement(placement.code, { minimum_tier_rank: Number(event.target.value) })} className="mt-1 w-full rounded-xl border border-gray-200 bg-transparent px-3 py-2.5 text-sm dark:border-gray-700" />
              </label>
            </div>
            <button onClick={() => void savePlacement(placement)} disabled={working === `placement:${placement.code}`} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs font-black dark:border-gray-700">
              {working === `placement:${placement.code}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save placement
            </button>
          </div>)}
        </div>
      </section>
    </>}
  </main>;
}

function MasterToggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex cursor-pointer items-start justify-between gap-3 rounded-2xl border border-gray-200 p-4 dark:border-gray-700">
    <div><p className="font-black text-gray-950 dark:text-white">{label}</p><p className="mt-1 text-xs leading-5 text-gray-500">{description}</p></div>
    <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-primary-600" />
  </label>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof Megaphone; label: string; value: string | number }) {
  return <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
    <Icon className="h-4 w-4 text-primary-600" />
    <p className="mt-2 text-xs text-gray-400">{label}</p>
    <p className="mt-1 text-2xl font-black text-gray-950 dark:text-white">{value}</p>
  </div>;
}
