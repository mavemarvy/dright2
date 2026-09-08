import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, BarChart3, Check, CircleHelp, CreditCard, Eye, Gauge,
  Loader2, Megaphone, MousePointerClick, Package, Pause, Play, Search,
  Settings2, Sparkles, Target, Trash2,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrencyValue } from '../lib/currency';
import {
  type AdPlacement,
  type CampaignCreateResult,
  type PromotableAsset,
  type PromotionAssetType,
  type PromotionGoal,
  type PromotionTier,
  type PromotionTierCode,
  type UniversalCampaign,
  type UniversalCampaignPayload,
  createUniversalPromotionCampaign,
  fetchPromotableAssets,
  fetchPromotionConfiguration,
  fetchUniversalCampaigns,
  goalsForAssets,
  initializePromotionPayment,
  updateCampaignLifecycle,
} from '../lib/universalPromotion';
import { AdPreviewStudio } from '../components/promotion/PromotionSurfaces';

const TIER_STYLE: Record<PromotionTierCode, string> = {
  normal: 'border-slate-300 dark:border-gray-700',
  plus: 'border-primary-400 dark:border-primary-700',
  platinum: 'border-violet-400 dark:border-violet-700',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending payment', active: 'Active', paused: 'Paused', expired: 'Expired',
  cancelled: 'Cancelled', rejected: 'Rejected', completed: 'Completed', refunded: 'Refunded',
};

const assetKey = (asset: PromotableAsset) => `${asset.asset_type}:${asset.asset_id}`;
const amount = (value: number, currency: string) => formatCurrencyValue(Number(value || 0), currency);

export default function PromotePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState<'create' | 'dashboard' | 'mine'>('create');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tiers, setTiers] = useState<PromotionTier[]>([]);
  const [placements, setPlacements] = useState<AdPlacement[]>([]);
  const [tierPlacements, setTierPlacements] = useState<Array<{ tier_code: string; placement_code: string; is_included: boolean }>>([]);
  const [assets, setAssets] = useState<PromotableAsset[]>([]);
  const [campaigns, setCampaigns] = useState<UniversalCampaign[]>([]);
  const [pricingCurrency, setPricingCurrency] = useState('USD');

  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [assetType, setAssetType] = useState<'all' | PromotionAssetType>('all');
  const [tier, setTier] = useState<PromotionTierCode>('normal');
  const [goal, setGoal] = useState<PromotionGoal>('more_views');
  const [selectedPlacements, setSelectedPlacements] = useState<string[]>([]);
  const [audience, setAudience] = useState<UniversalCampaignPayload['audience_type']>('everyone');
  const [audienceValue, setAudienceValue] = useState('');
  const [budget, setBudget] = useState('10');
  const [duration, setDuration] = useState('3');
  const [pacing, setPacing] = useState<'even' | 'accelerated'>('even');
  const [allocationMode, setAllocationMode] = useState<'equal' | 'manual'>('equal');
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [headline, setHeadline] = useState('');
  const [description, setDescription] = useState('');
  const [cta, setCta] = useState('Learn More');
  const [allowComments, setAllowComments] = useState(true);
  const [quote, setQuote] = useState<CampaignCreateResult | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void (async () => {
      try {
        const [config, promotableAssets, ownCampaigns] = await Promise.all([
          fetchPromotionConfiguration(),
          fetchPromotableAssets(user.id),
          fetchUniversalCampaigns(user.id),
        ]);
        if (!active) return;
        setTiers(config.tiers);
        setPlacements(config.placements);
        setTierPlacements(config.tierPlacements as Array<{ tier_code: string; placement_code: string; is_included: boolean }>);
        setPricingCurrency(String(config.pricing?.currency || 'USD').toUpperCase());
        setAssets(promotableAssets);
        setCampaigns(ownCampaigns);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Unable to load DRIGHT Promote.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [user?.id]);

  const selectedAssets = useMemo(() => assets.filter(item => selected.includes(assetKey(item))), [assets, selected]);
  const goals = useMemo(() => goalsForAssets(selectedAssets), [selectedAssets]);
  useEffect(() => {
    if (goals.length > 0 && !goals.some(item => item.value === goal)) setGoal(goals[0].value);
  }, [goal, goals]);

  const visibleAssets = useMemo(() => assets.filter(item => {
    if (assetType !== 'all' && item.asset_type !== assetType) return false;
    const needle = query.trim().toLowerCase();
    return !needle || item.title.toLowerCase().includes(needle) || item.subtitle.toLowerCase().includes(needle) || item.public_id.toLowerCase().includes(needle);
  }), [assetType, assets, query]);

  const allowedCodes = useMemo(() => new Set(
    tierPlacements.filter(item => item.tier_code === tier && item.is_included).map(item => item.placement_code),
  ), [tier, tierPlacements]);

  const eligiblePlacements = useMemo(() => {
    const selectedTypes = selectedAssets.map(item => item.asset_type);
    return placements.filter(item =>
      item.enabled &&
      allowedCodes.has(item.code) &&
      (selectedTypes.length === 0 || selectedTypes.every(type => item.supported_asset_types.includes(type)))
    );
  }, [allowedCodes, placements, selectedAssets]);

  useEffect(() => {
    setSelectedPlacements(current => current.filter(code => eligiblePlacements.some(item => item.code === code)));
  }, [eligiblePlacements]);

  const previewPlacements = eligiblePlacements.filter(item => selectedPlacements.includes(item.code));
  const manualTotal = selectedAssets.reduce((sum, item) => sum + Number(allocations[assetKey(item)] || 0), 0);
  const currentTier = tiers.find(item => item.code === tier);
  const resetQuote = () => setQuote(null);

  const toggleAsset = (item: PromotableAsset) => {
    const key = assetKey(item);
    setSelected(current => current.includes(key) ? current.filter(value => value !== key) : [...current, key]);
    resetQuote();
  };

  const validate = () => {
    if (selectedAssets.length === 0) return 'Select at least one eligible asset.';
    if (selectedPlacements.length === 0) return 'Select at least one eligible placement.';
    if (!Number.isFinite(Number(budget)) || Number(budget) <= 0) return 'Enter a valid media budget.';
    if (!Number.isInteger(Number(duration)) || Number(duration) < 1 || Number(duration) > 90) return 'Duration must be between 1 and 90 days.';
    if (allocationMode === 'manual' && Math.abs(manualTotal - Number(budget)) > 0.01) return 'Manual allocations must equal the media budget.';
    if (audience !== 'everyone' && audience !== 'followers' && !audienceValue.trim()) return 'Complete the selected audience target.';
    return null;
  };

  const payload = (): UniversalCampaignPayload => ({
    tier,
    goal,
    owner_profile_type: selectedAssets.some(item => item.asset_type === 'job')
      ? 'employer'
      : selectedAssets.some(item => item.asset_type === 'sales_team') ? 'sales_team' : 'seller',
    audience_type: audience,
    audience_country: audience === 'country' ? audienceValue.trim() : undefined,
    audience_state: audience === 'state' ? audienceValue.trim() : undefined,
    audience_city: audience === 'city' ? audienceValue.trim() : undefined,
    audience_category: audience === 'category' ? audienceValue.trim() : undefined,
    audience_interests: audience === 'interests' ? audienceValue.split(',').map(value => value.trim()).filter(Boolean) : [],
    audience_followers_only: audience === 'followers',
    budget: Number(budget),
    duration_days: Number(duration),
    pacing_mode: pacing,
    allow_comments: allowComments,
    placements: selectedPlacements,
    assets: selectedAssets.map(item => ({
      asset_type: item.asset_type,
      asset_id: item.asset_id,
      ...(allocationMode === 'manual' ? { allocation_amount: Number(allocations[assetKey(item)] || 0) } : {}),
    })),
  });

  const reviewSecureTotal = async () => {
    if (!user) return;
    const validationError = validate();
    if (validationError) { setError(validationError); return; }
    setWorking(true); setError(null);
    try {
      const result = await createUniversalPromotionCampaign(payload());
      setQuote(result);
      setCampaigns(await fetchUniversalCampaigns(user.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create the campaign.');
    } finally { setWorking(false); }
  };

  const pay = async () => {
    if (!quote) return;
    setWorking(true); setError(null);
    try {
      const payment = await initializePromotionPayment(quote.campaign_id, quote.total_payable);
      window.location.assign(payment.authorization_url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to initialize payment.');
      setWorking(false);
    }
  };

  const changeLifecycle = async (campaignId: string, status: 'paused' | 'active' | 'cancelled') => {
    if (!user) return;
    setError(null);
    try {
      await updateCampaignLifecycle(campaignId, status);
      setCampaigns(await fetchUniversalCampaigns(user.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update campaign.');
    }
  };

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary-600" /></div>;

  return (
    <div className="min-h-screen bg-surface-muted pb-24">
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur dark:border-gray-800 dark:bg-gray-950/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <button onClick={() => navigate(-1)} className="rounded-full p-2.5 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Back"><ArrowLeft className="h-5 w-5" /></button>
          <div className="text-center"><h1 className="font-black text-gray-950 dark:text-white">Promote</h1><p className="text-[10px] font-bold uppercase tracking-[.2em] text-primary-600">DRIGHT Marketing</p></div>
          <button onClick={() => navigate('/help')} className="rounded-full p-2.5 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Help"><CircleHelp className="h-5 w-5" /></button>
        </div>
        <nav className="mx-auto flex max-w-xl px-4 sm:px-6">
          {(['create', 'dashboard', 'mine'] as const).map(value => <button key={value} onClick={() => setTab(value)} className={`flex-1 border-b-2 py-3 text-sm font-bold capitalize ${tab === value ? 'border-primary-600 text-primary-700 dark:text-primary-300' : 'border-transparent text-gray-400'}`}>{value}</button>)}
        </nav>
      </header>

      {error && <div className="mx-auto mt-4 max-w-6xl px-4 sm:px-6"><div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</div></div>}

      {tab === 'create' && (
        <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_390px]">
          <div className="space-y-5">
            <Panel number="1" title="Select what to promote" subtitle="Choose one asset, several assets, or every eligible result.">
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search your DRIGHT assets" className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm dark:border-gray-700 dark:bg-gray-950" /></div>
                <select value={assetType} onChange={event => setAssetType(event.target.value as 'all' | PromotionAssetType)} className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950"><option value="all">All types</option>{Array.from(new Set(assets.map(item => item.asset_type))).map(value => <option key={value} value={value}>{value.replace(/_/g, ' ')}</option>)}</select>
                <button onClick={() => { setSelected(current => Array.from(new Set([...current, ...visibleAssets.map(assetKey)]))); resetQuote(); }} className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs font-bold dark:border-gray-700 dark:bg-gray-950">Select all</button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {visibleAssets.map(item => {
                  const checked = selected.includes(assetKey(item));
                  return <button key={assetKey(item)} onClick={() => toggleAsset(item)} className={`relative flex gap-3 rounded-2xl border p-3 text-left ${checked ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20' : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-950'}`}>
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800">{item.image_url ? <img src={item.image_url} alt="" className="h-full w-full object-cover" /> : <Package className="h-7 w-7 text-gray-300" />}</div>
                    <div className="min-w-0"><span className="text-[10px] font-bold uppercase text-primary-600">{item.asset_type.replace(/_/g, ' ')}</span><p className="mt-1 line-clamp-2 text-sm font-bold text-gray-900 dark:text-white">{item.title}</p><p className="truncate text-xs text-gray-500">{item.subtitle}</p></div>
                    <span className={`absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full border ${checked ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-300'}`}>{checked && <Check className="h-3 w-3" />}</span>
                  </button>;
                })}
              </div>
              {assets.length === 0 && <p className="rounded-2xl border border-dashed border-gray-300 p-7 text-center text-sm text-gray-400 dark:border-gray-700">No eligible assets yet. Publish an approved listing, job, campaign, professional store/profile, or qualify for Sales Team self-promotion.</p>}
            </Panel>

            <Panel number="2" title="Choose your goal" subtitle="Only goals appropriate to the selected assets are shown.">
              <div className="grid gap-2 sm:grid-cols-2">{goals.map(item => <button key={item.value} onClick={() => { setGoal(item.value); resetQuote(); }} className={`rounded-2xl border p-3 text-left ${goal === item.value ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20' : 'border-gray-200 dark:border-gray-700'}`}><Target className="h-4 w-4 text-primary-600" /><p className="mt-2 text-sm font-bold text-gray-900 dark:text-white">{item.label}</p><p className="mt-1 text-xs text-gray-500">{item.description}</p></button>)}</div>
            </Panel>

            <Panel number="3" title="Choose Normal, Plus or Platinum" subtitle="More inventory increases potential reach, but never bypasses relevance, caps or quality rules.">
              <div className="grid gap-3 md:grid-cols-3">{tiers.map(item => <button key={item.code} onClick={() => { setTier(item.code); setSelectedPlacements([]); resetQuote(); }} className={`rounded-2xl border-2 p-4 text-left ${tier === item.code ? `${TIER_STYLE[item.code]} bg-primary-50/60 dark:bg-gray-950` : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-950'}`}><div className="flex items-center justify-between"><b className="text-gray-900 dark:text-white">{item.name}</b>{tier === item.code && <Check className="h-4 w-4 text-primary-600" />}</div><p className="mt-2 text-xs leading-5 text-gray-500">{item.description}</p><p className="mt-3 text-[10px] font-semibold text-gray-400">Reach multiplier ×{Number(item.reach_multiplier).toFixed(2)}</p></button>)}</div>
            </Panel>

            <Panel number="4" title="Choose placements" subtitle="DRIGHT only exposes placements compatible with the selected tier and every selected asset.">
              <div className="grid gap-2 sm:grid-cols-2">{eligiblePlacements.map(item => {
                const checked = selectedPlacements.includes(item.code);
                return <label key={item.code} className={`flex cursor-pointer gap-3 rounded-2xl border p-3 ${checked ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20' : 'border-gray-200 dark:border-gray-700'}`}><input type="checkbox" checked={checked} onChange={() => { setSelectedPlacements(current => checked ? current.filter(code => code !== item.code) : [...current, item.code]); resetQuote(); }} className="mt-1 accent-primary-600" /><div><p className="text-sm font-bold text-gray-900 dark:text-white">{item.name}{item.premium ? ' · Premium' : ''}</p><p className="mt-1 text-xs text-gray-500">{item.description}</p><p className="mt-1 text-[10px] text-gray-400">Frequency cap {item.frequency_cap} / {item.frequency_window_hours}h · density interval {item.density_organic_interval}</p></div></label>;
              })}</div>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-gray-500"><span className="rounded-full bg-gray-100 px-3 py-1 dark:bg-gray-800">Community Ads unavailable until Community ownership exists</span><span className="rounded-full bg-gray-100 px-3 py-1 dark:bg-gray-800">Email Ads unavailable until compliant marketing consent exists</span></div>
            </Panel>

            <Panel number="5" title="Audience & creative" subtitle="Target safely, then preview how your own asset will look in every selected placement.">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-gray-500">Audience<select value={audience} onChange={event => { setAudience(event.target.value as UniversalCampaignPayload['audience_type']); setAudienceValue(''); resetQuote(); }} className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950"><option value="everyone">Everyone</option><option value="country">Country</option><option value="state">State / Region</option><option value="city">City</option><option value="category">Category</option><option value="interests">Interests</option><option value="followers">Followers</option></select></label>
                {audience !== 'everyone' && audience !== 'followers' && <Field label={audience === 'interests' ? 'Interests (comma separated)' : 'Target value'} value={audienceValue} onChange={setAudienceValue} />}
                <Field label="Headline" value={headline} onChange={setHeadline} placeholder={selectedAssets[0]?.title || 'Campaign headline'} />
                <Field label="CTA" value={cta} onChange={setCta} />
                <label className="sm:col-span-2 text-xs font-semibold text-gray-500">Description<textarea value={description} onChange={event => setDescription(event.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950" placeholder={selectedAssets[0]?.subtitle || 'Short campaign description'} /></label>
              </div>
              <label className="mt-3 flex items-center justify-between rounded-xl border border-gray-200 p-3 dark:border-gray-700"><div><p className="text-sm font-bold text-gray-900 dark:text-white">Comments on supported feed ads</p><p className="text-xs text-gray-500">Only real DRIGHT comments are counted.</p></div><input type="checkbox" checked={allowComments} onChange={event => setAllowComments(event.target.checked)} className="h-5 w-5 accent-primary-600" /></label>
            </Panel>

            <Panel number="6" title="Budget & pacing" subtitle="The media budget is separate from placement fees, platform fees and taxes.">
              <div className="grid gap-3 sm:grid-cols-3"><Field label={`Media budget (${pricingCurrency})`} value={budget} onChange={value => { setBudget(value); resetQuote(); }} type="number" /><Field label="Duration (days)" value={duration} onChange={value => { setDuration(value); resetQuote(); }} type="number" /><label className="text-xs font-semibold text-gray-500">Pacing<select value={pacing} onChange={event => { setPacing(event.target.value as 'even' | 'accelerated'); resetQuote(); }} className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950"><option value="even">Even</option><option value="accelerated">Accelerated</option></select></label></div>
              {selectedAssets.length > 1 && <div className="mt-4"><div className="flex items-center justify-between"><div><p className="text-sm font-bold text-gray-900 dark:text-white">Bulk allocation</p><p className="text-xs text-gray-500">Each asset keeps independent performance attribution.</p></div><select value={allocationMode} onChange={event => { setAllocationMode(event.target.value as 'equal' | 'manual'); resetQuote(); }} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"><option value="equal">Equal</option><option value="manual">Manual</option></select></div>{allocationMode === 'manual' && <div className="mt-3 space-y-2">{selectedAssets.map(item => <label key={assetKey(item)} className="flex items-center gap-3 rounded-xl bg-gray-50 p-2 dark:bg-gray-950"><span className="min-w-0 flex-1 truncate text-xs font-semibold">{item.title}</span><input type="number" value={allocations[assetKey(item)] || ''} onChange={event => { setAllocations(current => ({ ...current, [assetKey(item)]: event.target.value })); resetQuote(); }} className="w-28 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900" /></label>)}<p className={`text-xs font-bold ${Math.abs(manualTotal - Number(budget)) <= 0.01 ? 'text-emerald-600' : 'text-amber-600'}`}>Allocated {amount(manualTotal, pricingCurrency)} of {amount(Number(budget), pricingCurrency)}</p></div>}</div>}
            </Panel>

            <AdPreviewStudio asset={selectedAssets[0] || null} placements={previewPlacements} tier={tier} headline={headline} description={description} ctaLabel={cta} />
          </div>

          <aside className="h-fit lg:sticky lg:top-28">
            <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <div className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary-600" /><h2 className="font-black text-gray-900 dark:text-white">Payment summary</h2></div>
              {!quote ? <>
                <p className="mt-2 text-xs leading-5 text-gray-500">Only the media budget below is a local preview. DRIGHT calculates the authoritative tier, placement, platform and tax amounts on the server.</p>
                <SummaryRow label="Media budget" value={amount(Number(budget), pricingCurrency)} />
                <SummaryRow label="Tier" value={currentTier?.name || tier} />
                <SummaryRow label="Assets" value={String(selectedAssets.length)} />
                <SummaryRow label="Placements" value={String(selectedPlacements.length)} />
                <button onClick={reviewSecureTotal} disabled={working} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50">{working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4" />}Review secure total</button>
              </> : <>
                <p className="mt-2 text-xs font-semibold text-emerald-600">Server-authoritative quote · {quote.campaign_id.slice(0, 8)}</p>
                <SummaryRow label="Promotion budget" value={amount(quote.media_budget, quote.currency)} />
                <SummaryRow label="Placement fees" value={amount(quote.placement_fee_total, quote.currency)} />
                <SummaryRow label="DRIGHT platform fee" value={amount(quote.platform_fee, quote.currency)} />
                <SummaryRow label="Taxes" value={amount(quote.tax_amount, quote.currency)} />
                <div className="my-3 border-t border-gray-100 dark:border-gray-800" />
                <SummaryRow label="TOTAL" value={amount(quote.total_payable, quote.currency)} strong />
                <button onClick={pay} disabled={working} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gray-950 px-4 py-3 text-sm font-black text-white disabled:opacity-50 dark:bg-white dark:text-gray-950">{working ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}PAY SECURELY</button>
                <p className="mt-3 text-[10px] leading-4 text-gray-400">The browser cannot mark a campaign paid. Activation happens only after verified provider processing.</p>
              </>}
            </div>
          </aside>
        </main>
      )}

      {tab === 'dashboard' && <Dashboard campaigns={campaigns} />}
      {tab === 'mine' && <Mine campaigns={campaigns} onLifecycle={changeLifecycle} />}
    </div>
  );
}

function Panel({ number, title, subtitle, children }: { number: string; title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:p-5"><div className="mb-4 flex gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-xs font-black text-white">{number}</span><div><h2 className="font-black text-gray-950 dark:text-white">{title}</h2><p className="text-xs leading-5 text-gray-500">{subtitle}</p></div></div>{children}</section>;
}

function Field({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return <label className="text-xs font-semibold text-gray-500">{label}<input type={type} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950" /></label>;
}

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className={`mt-3 flex items-center justify-between gap-4 ${strong ? 'text-base font-black' : 'text-sm'}`}><span className={strong ? 'text-gray-950 dark:text-white' : 'text-gray-500'}>{label}</span><span className="text-right font-bold text-gray-900 dark:text-white">{value}</span></div>;
}

function Dashboard({ campaigns }: { campaigns: UniversalCampaign[] }) {
  const spend = campaigns.reduce((sum, item) => sum + Number(item.actual_spend || 0), 0);
  const impressions = campaigns.reduce((sum, item) => sum + Number(item.actual_impressions || 0), 0);
  const clicks = campaigns.reduce((sum, item) => sum + Number(item.actual_clicks || 0), 0);
  const conversions = campaigns.reduce((sum, item) => sum + Number(item.actual_conversions || 0), 0);
  const active = campaigns.filter(item => item.status === 'active').length;
  const currency = campaigns[0]?.billing_currency || 'USD';
  return <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6"><div className="grid grid-cols-2 gap-3 md:grid-cols-6"><Kpi label="Campaigns" value={String(campaigns.length)} icon={BarChart3} /><Kpi label="Active" value={String(active)} icon={Gauge} /><Kpi label="Spend" value={amount(spend, currency)} icon={CreditCard} /><Kpi label="Impressions" value={impressions.toLocaleString()} icon={Eye} /><Kpi label="Clicks" value={clicks.toLocaleString()} icon={MousePointerClick} /><Kpi label="Conversions" value={conversions.toLocaleString()} icon={Target} /></div><div className="mt-6 space-y-3">{campaigns.map(item => <CampaignCard key={item.id} campaign={item} />)}{campaigns.length === 0 && <Empty text="No promotion campaigns yet." />}</div></main>;
}

function Mine({ campaigns, onLifecycle }: { campaigns: UniversalCampaign[]; onLifecycle: (id: string, status: 'paused' | 'active' | 'cancelled') => Promise<void> }) {
  const [filter, setFilter] = useState('all');
  const rows = campaigns.filter(item => filter === 'all' || item.status === filter);
  return <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6"><div className="mb-4 flex justify-end"><select value={filter} onChange={event => setFilter(event.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900"><option value="all">All campaigns</option><option value="pending">Pending payment</option><option value="active">Active</option><option value="paused">Paused</option><option value="expired">Expired</option><option value="cancelled">Cancelled</option></select></div><div className="space-y-3">{rows.map(item => <div key={item.id} className="rounded-3xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><div className="flex gap-2"><span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-black uppercase text-gray-500 dark:bg-gray-800">{STATUS_LABEL[item.status] || item.status}</span><span className="rounded-full bg-primary-50 px-2 py-1 text-[10px] font-black uppercase text-primary-600 dark:bg-primary-950">{item.tier_code}</span></div><p className="mt-2 font-black capitalize text-gray-900 dark:text-white">{item.goal.replace(/_/g, ' ')}</p><p className="font-mono text-[10px] text-gray-400">{item.id}</p></div><div className="flex gap-2">{item.status === 'active' && <Action title="Pause" onClick={() => void onLifecycle(item.id, 'paused')}><Pause className="h-4 w-4" /></Action>}{item.status === 'paused' && <Action title="Resume" onClick={() => void onLifecycle(item.id, 'active')}><Play className="h-4 w-4" /></Action>}{['pending', 'active', 'paused'].includes(item.status) && <Action title="Cancel" danger onClick={() => void onLifecycle(item.id, 'cancelled')}><Trash2 className="h-4 w-4" /></Action>}</div></div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><Metric label="Media budget" value={amount(item.media_budget, item.billing_currency)} /><Metric label="Actual spend" value={amount(item.actual_spend, item.billing_currency)} /><Metric label="Impressions" value={item.actual_impressions.toLocaleString()} /><Metric label="Conversions" value={item.actual_conversions.toLocaleString()} /></div></div>)}{rows.length === 0 && <Empty text="No campaigns match this filter." />}</div></main>;
}

function CampaignCard({ campaign }: { campaign: UniversalCampaign }) {
  return <article className="rounded-3xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"><div className="flex flex-wrap items-start justify-between gap-3"><div><span className="rounded-full bg-primary-50 px-2 py-1 text-[10px] font-black uppercase text-primary-600 dark:bg-primary-950">{campaign.tier_code}</span><p className="mt-2 font-black capitalize text-gray-900 dark:text-white">{campaign.goal.replace(/_/g, ' ')}</p><p className="font-mono text-[10px] text-gray-400">{campaign.id}</p></div><div className="text-right"><p className="font-black text-gray-900 dark:text-white">{amount(campaign.actual_spend, campaign.billing_currency)}</p><p className="text-[10px] text-gray-400">actual spend</p></div></div><div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6"><Metric label="Impressions" value={campaign.actual_impressions.toLocaleString()} /><Metric label="Clicks" value={campaign.actual_clicks.toLocaleString()} /><Metric label="Conversions" value={campaign.actual_conversions.toLocaleString()} /><Metric label="Reach" value={campaign.actual_reach.toLocaleString()} /><Metric label="Assets" value={String(campaign.campaign_assets?.length || 0)} /><Metric label="Placements" value={String(campaign.campaign_placements?.length || 0)} /></div>{(campaign.campaign_assets?.length || 0) > 1 && <div className="mt-3 overflow-x-auto"><table className="min-w-full text-left text-xs"><thead className="text-gray-400"><tr><th className="py-2">Asset</th><th>Budget</th><th>Spend</th><th>Impressions</th><th>Clicks</th><th>Conversions</th></tr></thead><tbody>{campaign.campaign_assets?.map(asset => <tr key={asset.id} className="border-t border-gray-200 dark:border-gray-800"><td className="max-w-52 truncate py-2 font-semibold">{asset.title_snapshot || asset.asset_id}</td><td>{amount(asset.allocation_amount, campaign.billing_currency)}</td><td>{amount(asset.actual_spend, campaign.billing_currency)}</td><td>{asset.actual_impressions}</td><td>{asset.actual_clicks}</td><td>{asset.actual_conversions}</td></tr>)}</tbody></table></div>}</article>;
}

function Kpi({ label, value, icon: Icon }: { label: string; value: string; icon: React.ComponentType<{ className?: string }> }) {
  return <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"><Icon className="h-5 w-5 text-primary-600" /><p className="mt-3 text-xl font-black text-gray-950 dark:text-white">{value}</p><p className="text-xs text-gray-400">{label}</p></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-gray-50 p-2 dark:bg-gray-950"><p className="text-xs font-black text-gray-900 dark:text-white">{value}</p><p className="text-[10px] text-gray-400">{label}</p></div>;
}

function Action({ title, onClick, danger = false, children }: { title: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return <button onClick={onClick} title={title} className={`rounded-xl p-2.5 ${danger ? 'bg-red-50 text-red-600 dark:bg-red-950/40' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}>{children}</button>;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-3xl border border-dashed border-gray-300 p-10 text-center dark:border-gray-700"><Megaphone className="mx-auto h-8 w-8 text-gray-300" /><p className="mt-3 text-sm text-gray-400">{text}</p></div>;
}
