import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, BarChart3, Check, ChevronDown, CircleHelp, Clock3, CreditCard,
  Eye, Filter, Gauge, Loader2, Megaphone, MessageCircle, MousePointerClick,
  Package, Pause, Play, Search, Settings2, Sparkles, Target, Trash2, Users,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  type AdPlacement, type CampaignCreateResult, type PromotableAsset, type PromotionAssetType,
  type PromotionGoal, type PromotionTier, type PromotionTierCode, type UniversalCampaign,
  createUniversalPromotionCampaign, fetchPromotableAssets, fetchPromotionConfiguration,
  fetchUniversalCampaigns, goalsForAssets, initializePromotionPayment, updateCampaignLifecycle,
} from '../lib/universalPromotion';
import { AdPreviewStudio } from '../components/promotion/PromotionSurfaces';

const TIER_ACCENTS: Record<PromotionTierCode, string> = {
  normal: 'border-slate-300 bg-white dark:border-gray-700 dark:bg-gray-900',
  plus: 'border-primary-300 bg-primary-50/70 dark:border-primary-800 dark:bg-primary-950/30',
  platinum: 'border-violet-300 bg-violet-50/70 dark:border-violet-800 dark:bg-violet-950/30',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending payment', active: 'Active', paused: 'Paused', expired: 'Expired',
  cancelled: 'Cancelled', rejected: 'Rejected', completed: 'Completed', refunded: 'Refunded',
};

const money = (value: number, currency = 'USD') => {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(value || 0)); }
  catch { return `${currency} ${Number(value || 0).toFixed(2)}`; }
};

export default function PromotePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState<'create' | 'dashboard' | 'mine'>('create');
  const [loading, setLoading] = useState(true);
  const [tiers, setTiers] = useState<PromotionTier[]>([]);
  const [placements, setPlacements] = useState<AdPlacement[]>([]);
  const [tierPlacements, setTierPlacements] = useState<Array<{ tier_code: string; placement_code: string; is_included: boolean }>>([]);
  const [assets, setAssets] = useState<PromotableAsset[]>([]);
  const [campaigns, setCampaigns] = useState<UniversalCampaign[]>([]);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [assetSearch, setAssetSearch] = useState('');
  const [assetFilter, setAssetFilter] = useState<'all' | PromotionAssetType>('all');
  const [tier, setTier] = useState<PromotionTierCode>('normal');
  const [selectedPlacements, setSelectedPlacements] = useState<string[]>([]);
  const [goal, setGoal] = useState<PromotionGoal>('more_views');
  const [audience, setAudience] = useState<'everyone' | 'country' | 'state' | 'city' | 'category' | 'interests' | 'followers'>('everyone');
  const [country, setCountry] = useState('');
  const [region, setRegion] = useState('');
  const [city, setCity] = useState('');
  const [audienceCategory, setAudienceCategory] = useState('');
  const [interests, setInterests] = useState('');
  const [budget, setBudget] = useState('10');
  const [duration, setDuration] = useState('3');
  const [pacing, setPacing] = useState<'even' | 'accelerated'>('even');
  const [allowComments, setAllowComments] = useState(true);
  const [allocationMode, setAllocationMode] = useState<'equal' | 'manual'>('equal');
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [headline, setHeadline] = useState('');
  const [description, setDescription] = useState('');
  const [ctaLabel, setCtaLabel] = useState('Learn More');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canonicalQuote, setCanonicalQuote] = useState<CampaignCreateResult | null>(null);
  const [createdCampaignId, setCreatedCampaignId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      try {
        const [config, ownAssets, ownCampaigns] = await Promise.all([
          fetchPromotionConfiguration(), fetchPromotableAssets(user.id), fetchUniversalCampaigns(user.id),
        ]);
        if (!alive) return;
        setTiers(config.tiers);
        setPlacements(config.placements);
        setTierPlacements(config.tierPlacements as Array<{ tier_code: string; placement_code: string; is_included: boolean }>);
        setAssets(ownAssets);
        setCampaigns(ownCampaigns);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load DRIGHT Promote.');
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [user?.id]);

  const selectedAssets = useMemo(() => assets.filter(a => selectedAssetIds.includes(`${a.asset_type}:${a.asset_id}`)), [assets, selectedAssetIds]);
  const goalOptions = useMemo(() => goalsForAssets(selectedAssets), [selectedAssets]);
  useEffect(() => {
    if (goalOptions.length && !goalOptions.some(g => g.value === goal)) setGoal(goalOptions[0].value);
  }, [goalOptions, goal]);

  const currentTier = tiers.find(t => t.code === tier);
  const allowedPlacementCodes = useMemo(() => new Set(tierPlacements.filter(tp => tp.tier_code === tier && tp.is_included).map(tp => tp.placement_code)), [tierPlacements, tier]);
  const eligiblePlacements = useMemo(() => {
    const types = selectedAssets.map(a => a.asset_type);
    return placements.filter(p => p.enabled && allowedPlacementCodes.has(p.code) && (types.length === 0 || types.every(t => p.supported_asset_types.includes(t))));
  }, [placements, allowedPlacementCodes, selectedAssets]);

  useEffect(() => {
    setSelectedPlacements(prev => prev.filter(code => eligiblePlacements.some(p => p.code === code)));
  }, [eligiblePlacements]);

  const visibleAssets = useMemo(() => assets.filter(a => {
    if (assetFilter !== 'all' && a.asset_type !== assetFilter) return false;
    const q = assetSearch.trim().toLowerCase();
    return !q || a.title.toLowerCase().includes(q) || a.subtitle.toLowerCase().includes(q) || a.public_id.toLowerCase().includes(q);
  }), [assets, assetFilter, assetSearch]);

  const selectedPlacementObjects = eligiblePlacements.filter(p => selectedPlacements.includes(p.code));
  const primaryAsset = selectedAssets[0] || null;
  const currency = canonicalQuote?.currency || 'USD';
  const clientEstimatedPlacementFees = selectedPlacementObjects.reduce((sum, p) => sum + Number(p.surcharge || 0), 0);

  const toggleAsset = (asset: PromotableAsset) => {
    const key = `${asset.asset_type}:${asset.asset_id}`;
    setSelectedAssetIds(prev => prev.includes(key) ? prev.filter(id => id !== key) : [...prev, key]);
    setCanonicalQuote(null); setCreatedCampaignId(null);
  };

  const selectAllVisible = () => {
    const keys = visibleAssets.map(a => `${a.asset_type}:${a.asset_id}`);
    setSelectedAssetIds(prev => Array.from(new Set([...prev, ...keys])));
    setCanonicalQuote(null); setCreatedCampaignId(null);
  };

  const manualTotal = selectedAssets.reduce((sum, a) => sum + Number(allocations[`${a.asset_type}:${a.asset_id}`] || 0), 0);

  const validateCreate = () => {
    if (!selectedAssets.length) return 'Select at least one asset to promote.';
    if (!selectedPlacements.length) return 'Select at least one eligible placement.';
    if (!(Number(budget) > 0)) return 'Enter a valid media budget.';
    if (!(Number(duration) >= 1 && Number(duration) <= 90)) return 'Duration must be between 1 and 90 days.';
    if (allocationMode === 'manual' && Math.abs(manualTotal - Number(budget)) > 0.01) return 'Manual asset allocations must equal the media budget.';
    if (audience === 'country' && !country.trim()) return 'Enter a country for country targeting.';
    if (audience === 'state' && !region.trim()) return 'Enter a state or region.';
    if (audience === 'city' && !city.trim()) return 'Enter a city.';
    if (audience === 'category' && !audienceCategory.trim()) return 'Enter an audience category.';
    return null;
  };

  const buildPayload = () => ({
    tier,
    goal,
    owner_profile_type: selectedAssets.some(a => a.asset_type === 'job') ? 'employer' : selectedAssets.some(a => a.asset_type === 'sales_team') ? 'sales_team' : 'seller',
    audience_type: audience,
    audience_country: audience === 'country' ? country.trim() : undefined,
    audience_state: audience === 'state' ? region.trim() : undefined,
    audience_city: audience === 'city' ? city.trim() : undefined,
    audience_category: audience === 'category' ? audienceCategory.trim() : undefined,
    audience_interests: audience === 'interests' ? interests.split(',').map(s => s.trim()).filter(Boolean) : [],
    audience_followers_only: audience === 'followers',
    budget: Number(budget),
    duration_days: Number(duration),
    pacing_mode: pacing,
    allow_comments: allowComments,
    placements: selectedPlacements,
    assets: selectedAssets.map(a => ({
      asset_type: a.asset_type,
      asset_id: a.asset_id,
      ...(allocationMode === 'manual' ? { allocation_amount: Number(allocations[`${a.asset_type}:${a.asset_id}`] || 0) } : {}),
    })),
  });

  const prepareSecureCheckout = async () => {
    if (!user) return;
    setError(null);
    const invalid = validateCreate();
    if (invalid) { setError(invalid); return; }
    setCreating(true);
    try {
      const result = await createUniversalPromotionCampaign(buildPayload());
      setCanonicalQuote(result);
      setCreatedCampaignId(result.campaign_id);
      const fresh = await fetchUniversalCampaigns(user.id);
      setCampaigns(fresh);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create the campaign.');
    } finally { setCreating(false); }
  };

  const pay = async () => {
    if (!canonicalQuote || !createdCampaignId) return;
    setCreating(true); setError(null);
    try {
      const payment = await initializePromotionPayment(createdCampaignId, canonicalQuote.total_payable);
      window.location.assign(payment.authorization_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to initialize secure payment.');
      setCreating(false);
    }
  };

  const refreshCampaigns = async () => { if (user) setCampaigns(await fetchUniversalCampaigns(user.id)); };
  const lifecycle = async (id: string, status: 'paused' | 'active' | 'cancelled') => {
    setError(null);
    try { await updateCampaignLifecycle(id, status); await refreshCampaigns(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Campaign update failed.'); }
  };

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary-600" /></div>;

  return (
    <div className="min-h-screen bg-surface-muted pb-28">
      <div className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur dark:border-gray-800 dark:bg-gray-950/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <button onClick={() => navigate(-1)} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Back"><ArrowLeft className="h-5 w-5" /></button>
          <div className="text-center"><h1 className="text-lg font-black text-gray-950 dark:text-white">Promote</h1><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-primary-600">DRIGHT Marketing</p></div>
          <button onClick={() => navigate('/help')} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Help"><CircleHelp className="h-5 w-5" /></button>
        </div>
        <div className="mx-auto flex max-w-xl px-4 sm:px-6">
          {(['create', 'dashboard', 'mine'] as const).map(key => <button key={key} onClick={() => setTab(key)} className={`flex-1 border-b-2 px-2 py-3 text-sm font-bold capitalize ${tab === key ? 'border-primary-600 text-primary-700 dark:text-primary-300' : 'border-transparent text-gray-400'}`}>{key}</button>)}
        </div>
      </div>

      {error && <div className="mx-auto mt-4 max-w-5xl px-4 sm:px-6"><div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</div></div>}

      {tab === 'create' && (
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-6">
            <Section step="1" title="Choose what to promote" subtitle="Select one asset, several assets, or everything eligible under this account.">
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={assetSearch} onChange={e => setAssetSearch(e.target.value)} placeholder="Search your products, jobs, store, profile..." className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-900" /></div>
                <div className="flex gap-2"><select value={assetFilter} onChange={e => setAssetFilter(e.target.value as 'all' | PromotionAssetType)} className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900"><option value="all">All types</option>{Array.from(new Set(assets.map(a => a.asset_type))).map(t => <option value={t} key={t}>{t.replace(/_/g, ' ')}</option>)}</select><button onClick={selectAllVisible} className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs font-bold text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">Select all</button></div>
              </div>
              {!assets.length ? <EmptyAssets /> : <div className="mt-4 grid gap-3 sm:grid-cols-2">{visibleAssets.map(asset => {
                const key = `${asset.asset_type}:${asset.asset_id}`; const selected = selectedAssetIds.includes(key);
                return <button key={key} onClick={() => toggleAsset(asset)} className={`relative flex min-h-28 gap-3 rounded-2xl border p-3 text-left transition ${selected ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-100 dark:bg-primary-950/20' : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900'}`}>
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800">{asset.image_url ? <img src={asset.image_url} alt="" className="h-full w-full object-cover" /> : <Package className="h-8 w-8 text-gray-300" />}</div>
                  <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-500 dark:bg-gray-800">{asset.asset_type.replace(/_/g, ' ')}</span><span className="text-[10px] font-semibold text-emerald-600">{asset.status}</span></div><p className="mt-2 line-clamp-2 text-sm font-bold text-gray-900 dark:text-white">{asset.title}</p><p className="mt-1 truncate text-xs text-gray-500">{asset.subtitle}</p><p className="mt-1 truncate font-mono text-[9px] text-gray-400">{asset.public_id}</p></div>
                  <div className={`absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full border ${selected ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-300 bg-white dark:bg-gray-900'}`}>{selected && <Check className="h-3 w-3" />}</div>
                </button>;
              })}</div>}
            </Section>

            <Section step="2" title="Choose your goal" subtitle="DRIGHT only shows goals that make sense for the selected assets.">
              <div className="grid gap-3 sm:grid-cols-2">{goalOptions.map(g => <button key={g.value} onClick={() => { setGoal(g.value); setCanonicalQuote(null); }} className={`rounded-2xl border p-4 text-left ${goal === g.value ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20' : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900'}`}><Target className="h-5 w-5 text-primary-600" /><p className="mt-2 text-sm font-bold text-gray-900 dark:text-white">{g.label}</p><p className="mt-1 text-xs leading-5 text-gray-500">{g.description}</p></button>)}</div>
            </Section>

            <Section step="3" title="Choose an ad tier" subtitle="Higher tiers unlock more eligible DRIGHT inventory. Delivery is estimated, never guaranteed.">
              <div className="grid gap-3 md:grid-cols-3">{tiers.map(t => <button key={t.code} onClick={() => { setTier(t.code); setSelectedPlacements([]); setCanonicalQuote(null); }} className={`rounded-2xl border-2 p-4 text-left ${tier === t.code ? `${TIER_ACCENTS[t.code]} ring-2 ring-primary-100 dark:ring-primary-900` : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900'}`}><div className="flex items-center justify-between"><span className="text-base font-black text-gray-900 dark:text-white">{t.name}</span>{tier === t.code && <Check className="h-5 w-5 text-primary-600" />}</div><p className="mt-2 text-xs leading-5 text-gray-500">{t.description}</p><div className="mt-3 flex gap-2"><span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-semibold text-gray-500 dark:bg-gray-800">Reach ×{Number(t.reach_multiplier).toFixed(2)}</span><span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-semibold text-gray-500 dark:bg-gray-800">Pricing ×{Number(t.pricing_multiplier).toFixed(2)}</span></div></button>)}</div>
            </Section>

            <Section step="4" title="Where should your ad appear?" subtitle="Only placements allowed by the tier and compatible with every selected asset are shown.">
              <div className="grid gap-2 sm:grid-cols-2">{eligiblePlacements.map(p => { const checked = selectedPlacements.includes(p.code); return <label key={p.code} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 ${checked ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20' : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900'}`}><input type="checkbox" checked={checked} onChange={() => { setSelectedPlacements(prev => checked ? prev.filter(c => c !== p.code) : [...prev, p.code]); setCanonicalQuote(null); }} className="mt-1 h-4 w-4 accent-primary-600" /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-bold text-gray-900 dark:text-white">{p.name}</span>{p.premium && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[9px] font-bold uppercase text-violet-700 dark:bg-violet-950 dark:text-violet-300">Premium</span>}</div><p className="mt-1 text-xs leading-5 text-gray-500">{p.description}</p><p className="mt-1 text-[10px] text-gray-400">Max frequency: {p.frequency_cap} / {p.frequency_window_hours}h · organic interval target: {p.density_organic_interval}</p></div></label>; })}</div>
              {!eligiblePlacements.length && <p className="rounded-2xl border border-dashed border-gray-300 p-5 text-center text-sm text-gray-400">Select compatible assets or another tier to see available placements.</p>}
              <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-gray-500"><span className="rounded-full bg-gray-100 px-3 py-1 dark:bg-gray-800">Community Ads: unavailable until Community is production-ready</span><span className="rounded-full bg-gray-100 px-3 py-1 dark:bg-gray-800">Email Ads: unavailable until compliant marketing consent infrastructure is active</span></div>
            </Section>

            <Section step="5" title="Audience" subtitle="Target broad or contextual audiences without exposing private individual browsing histories to advertisers.">
              <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-gray-500">Audience<select value={audience} onChange={e => setAudience(e.target.value as typeof audience)} className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white"><option value="everyone">Everyone</option><option value="country">Country</option><option value="state">State / Region</option><option value="city">City</option><option value="category">Category</option><option value="interests">Interests</option><option value="followers">Followers</option></select></label>{audience === 'country' && <Input label="Country" value={country} setValue={setCountry} placeholder="e.g. Nigeria" />}{audience === 'state' && <Input label="State / Region" value={region} setValue={setRegion} placeholder="e.g. Ogun" />}{audience === 'city' && <Input label="City" value={city} setValue={setCity} placeholder="e.g. Lagos" />}{audience === 'category' && <Input label="Category" value={audienceCategory} setValue={setAudienceCategory} placeholder="e.g. Electronics" />}{audience === 'interests' && <Input label="Interests" value={interests} setValue={setInterests} placeholder="gaming, design, careers" />}</div>
            </Section>

            <Section step="6" title="Creative" subtitle="DRIGHT templates work without Canva. Optional external creative can be added later after moderation.">
              <div className="grid gap-3 sm:grid-cols-2"><Input label="Headline" value={headline} setValue={setHeadline} placeholder={primaryAsset?.title || 'Your promotion headline'} /><Input label="CTA" value={ctaLabel} setValue={setCtaLabel} placeholder="Learn More" /><label className="sm:col-span-2 text-xs font-semibold text-gray-500">Description<textarea value={description} onChange={e => setDescription(e.target.value)} placeholder={primaryAsset?.subtitle || 'Short, clear promotion description'} rows={3} className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white" /></label></div>
              <label className="mt-4 flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900"><div><p className="text-sm font-bold text-gray-900 dark:text-white">Comments</p><p className="text-xs text-gray-500">Allow real users to comment on supported sponsored-feed placements.</p></div><input type="checkbox" checked={allowComments} onChange={e => setAllowComments(e.target.checked)} className="h-5 w-5 accent-primary-600" /></label>
            </Section>

            <Section step="7" title="Budget & pacing" subtitle="Media budget is separate from placement fees, platform fees and taxes.">
              <div className="grid gap-3 sm:grid-cols-3"><Input label="Media budget" value={budget} setValue={v => { setBudget(v); setCanonicalQuote(null); }} type="number" prefix="$" /><Input label="Duration (days)" value={duration} setValue={v => { setDuration(v); setCanonicalQuote(null); }} type="number" /><label className="text-xs font-semibold text-gray-500">Pacing<select value={pacing} onChange={e => setPacing(e.target.value as 'even' | 'accelerated')} className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white"><option value="even">Even</option><option value="accelerated">Accelerated</option></select></label></div>
              {selectedAssets.length > 1 && <div className="mt-4"><div className="mb-3 flex items-center justify-between"><div><p className="text-sm font-bold text-gray-900 dark:text-white">Bulk budget allocation</p><p className="text-xs text-gray-500">Every asset remains independently measurable.</p></div><select value={allocationMode} onChange={e => setAllocationMode(e.target.value as 'equal' | 'manual')} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"><option value="equal">Equal</option><option value="manual">Manual</option></select></div>{allocationMode === 'manual' && <div className="space-y-2">{selectedAssets.map(a => { const key = `${a.asset_type}:${a.asset_id}`; return <div key={key} className="flex items-center gap-3 rounded-xl bg-gray-50 p-2 dark:bg-gray-900"><span className="min-w-0 flex-1 truncate text-xs font-semibold text-gray-700 dark:text-gray-200">{a.title}</span><input type="number" value={allocations[key] || ''} onChange={e => { setAllocations(prev => ({ ...prev, [key]: e.target.value })); setCanonicalQuote(null); }} className="w-28 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-950" /></div>; })}<p className={`text-xs font-semibold ${Math.abs(manualTotal - Number(budget)) <= .01 ? 'text-emerald-600' : 'text-amber-600'}`}>Allocated {money(manualTotal)} of {money(Number(budget))}</p></div>}</div>}
            </Section>

            <AdPreviewStudio asset={primaryAsset} placements={selectedPlacementObjects} tier={tier} headline={headline} description={description} ctaLabel={ctaLabel} />
          </div>

          <aside className="h-fit space-y-4 lg:sticky lg:top-28">
            <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <div className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary-600" /><h2 className="font-black text-gray-900 dark:text-white">Payment summary</h2></div>
              {!canonicalQuote ? <><p className="mt-2 text-xs leading-5 text-gray-500">The figures below are estimates only. DRIGHT will calculate and freeze the authoritative amount on the server before payment.</p><Line label="Estimated media budget" value={money(Number(budget || 0))} /><Line label="Visible placement add-ons" value={money(clientEstimatedPlacementFees)} /><div className="mt-4 rounded-2xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">Platform fee, taxes, placement overrides and final pricing are not authoritative until you select <b>Review secure total</b>.</div><button onClick={prepareSecureCheckout} disabled={creating} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary-600 px-4 py-3.5 text-sm font-black text-white shadow-lg shadow-primary-600/20 disabled:opacity-50">{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4" />}Review secure total</button></> : <><p className="mt-2 text-xs text-emerald-600">Server-authoritative quote · campaign {canonicalQuote.campaign_id.slice(0, 8)}</p><Line label="Promotion budget" value={money(canonicalQuote.media_budget, currency)} /><Line label="Placement fees" value={money(canonicalQuote.placement_fee_total, currency)} /><Line label="DRIGHT platform fee" value={money(canonicalQuote.platform_fee, currency)} /><Line label="Taxes" value={money(canonicalQuote.tax_amount, currency)} /><div className="my-3 border-t border-gray-100 dark:border-gray-800" /><Line label="TOTAL" value={money(canonicalQuote.total_payable, currency)} strong /><button onClick={pay} disabled={creating} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gray-950 px-4 py-3.5 text-sm font-black text-white shadow-lg disabled:opacity-50 dark:bg-white dark:text-gray-950">{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}PAY SECURELY</button><p className="mt-3 text-[10px] leading-4 text-gray-400">Campaign activation occurs only after provider verification/webhook. The browser cannot mark this campaign paid.</p></>}
            </div>
            <div className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900"><h3 className="text-sm font-black text-gray-900 dark:text-white">Campaign snapshot</h3><div className="mt-3 grid grid-cols-2 gap-2"><Mini label="Assets" value={String(selectedAssets.length)} icon={Package} /><Mini label="Placements" value={String(selectedPlacements.length)} icon={Megaphone} /><Mini label="Tier" value={currentTier?.name || tier} icon={Sparkles} /><Mini label="Goal" value={goal.replace(/_/g, ' ')} icon={Target} /></div></div>
          </aside>
        </div>
      )}

      {tab === 'dashboard' && <CampaignDashboard campaigns={campaigns} />}
      {tab === 'mine' && <Mine campaigns={campaigns} lifecycle={lifecycle} />}
    </div>
  );
}

function Section({ step, title, subtitle, children }: { step: string; title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:p-5"><div className="mb-4 flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-xs font-black text-white">{step}</span><div><h2 className="font-black text-gray-950 dark:text-white">{title}</h2><p className="mt-0.5 text-xs leading-5 text-gray-500">{subtitle}</p></div></div>{children}</section>;
}

function Input({ label, value, setValue, placeholder, type = 'text', prefix }: { label: string; value: string; setValue: (v: string) => void; placeholder?: string; type?: string; prefix?: string }) {
  return <label className="text-xs font-semibold text-gray-500">{label}<div className="relative mt-1">{prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">{prefix}</span>}<input type={type} value={value} onChange={e => setValue(e.target.value)} placeholder={placeholder} className={`w-full rounded-xl border border-gray-200 bg-white py-2.5 pr-3 text-sm text-gray-900 outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white ${prefix ? 'pl-7' : 'pl-3'}`} /></div></label>;
}
function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) { return <div className={`mt-3 flex items-center justify-between gap-4 ${strong ? 'text-base font-black text-gray-950 dark:text-white' : 'text-sm'}`}><span className={strong ? '' : 'text-gray-500'}>{label}</span><span className="font-bold text-gray-900 dark:text-white">{value}</span></div>; }
function Mini({ label, value, icon: Icon }: { label: string; value: string; icon: React.ComponentType<{ className?: string }> }) { return <div className="rounded-2xl bg-gray-50 p-3 dark:bg-gray-950"><Icon className="h-4 w-4 text-primary-600" /><p className="mt-2 truncate text-xs font-black capitalize text-gray-900 dark:text-white">{value}</p><p className="text-[10px] text-gray-400">{label}</p></div>; }
function EmptyAssets() { return <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-center dark:border-gray-700"><Package className="mx-auto h-9 w-9 text-gray-300" /><p className="mt-3 text-sm font-bold text-gray-700 dark:text-gray-200">No eligible promotional assets yet</p><p className="mt-1 text-xs text-gray-400">Publish an approved product, service, course, job, creator campaign, professional store/profile, or qualify for Sales Team self-promotion.</p></div>; }

function CampaignDashboard({ campaigns }: { campaigns: UniversalCampaign[] }) {
  const totalSpend = campaigns.reduce((s, c) => s + Number(c.actual_spend || 0), 0);
  const impressions = campaigns.reduce((s, c) => s + Number(c.actual_impressions || 0), 0);
  const clicks = campaigns.reduce((s, c) => s + Number(c.actual_clicks || 0), 0);
  const conversions = campaigns.reduce((s, c) => s + Number(c.actual_conversions || 0), 0);
  const active = campaigns.filter(c => c.status === 'active').length;
  const ctr = impressions > 0 ? clicks / impressions * 100 : 0;
  return <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6"><div className="grid grid-cols-2 gap-3 md:grid-cols-5"><Kpi label="Campaigns" value={String(campaigns.length)} icon={BarChart3} /><Kpi label="Active" value={String(active)} icon={Gauge} /><Kpi label="Spend" value={money(totalSpend)} icon={CreditCard} /><Kpi label="Impressions" value={impressions.toLocaleString()} icon={Eye} /><Kpi label="CTR" value={`${ctr.toFixed(2)}%`} icon={MousePointerClick} /></div><div className="mt-6 rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900"><div className="flex items-center justify-between"><div><h2 className="font-black text-gray-900 dark:text-white">Performance by campaign</h2><p className="text-xs text-gray-500">Actual Supabase-backed delivery only.</p></div><Filter className="h-5 w-5 text-gray-400" /></div>{!campaigns.length ? <p className="py-10 text-center text-sm text-gray-400">No campaigns yet.</p> : <div className="mt-4 space-y-3">{campaigns.map(c => <div key={c.id} className="rounded-2xl bg-gray-50 p-4 dark:bg-gray-950"><div className="flex flex-wrap items-center justify-between gap-2"><div><span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold uppercase text-gray-500 dark:bg-gray-900">{c.tier_code}</span><p className="mt-2 text-sm font-black text-gray-900 dark:text-white">{c.goal.replace(/_/g, ' ')}</p><p className="font-mono text-[10px] text-gray-400">{c.id}</p></div><div className="text-right"><p className="text-sm font-black text-gray-900 dark:text-white">{money(c.actual_spend, c.billing_currency)}</p><p className="text-[10px] text-gray-400">actual spend</p></div></div><div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6"><Metric label="Impressions" value={c.actual_impressions} /><Metric label="Clicks" value={c.actual_clicks} /><Metric label="Conversions" value={c.actual_conversions} /><Metric label="Reach" value={c.actual_reach} /><Metric label="Assets" value={c.campaign_assets?.length || 0} /><Metric label="Placements" value={c.campaign_placements?.length || 0} /></div>{(c.campaign_assets?.length || 0) > 1 && <div className="mt-3 overflow-x-auto"><table className="min-w-full text-left text-xs"><thead className="text-gray-400"><tr><th className="py-2">Asset</th><th>Budget</th><th>Spend</th><th>Impr.</th><th>Clicks</th><th>Conv.</th></tr></thead><tbody>{c.campaign_assets?.map(a => <tr key={a.id} className="border-t border-gray-200 dark:border-gray-800"><td className="max-w-52 truncate py-2 font-semibold text-gray-700 dark:text-gray-200">{a.title_snapshot || a.asset_id}</td><td>{money(a.allocation_amount, c.billing_currency)}</td><td>{money(a.actual_spend, c.billing_currency)}</td><td>{a.actual_impressions}</td><td>{a.actual_clicks}</td><td>{a.actual_conversions}</td></tr>)}</tbody></table></div>}</div>)}</div>}</div></div>;
}

function Mine({ campaigns, lifecycle }: { campaigns: UniversalCampaign[]; lifecycle: (id: string, status: 'paused' | 'active' | 'cancelled') => Promise<void> }) {
  const [query, setQuery] = useState(''); const [status, setStatus] = useState('all');
  const rows = campaigns.filter(c => (status === 'all' || c.status === status) && (!query || c.id.toLowerCase().includes(query.toLowerCase()) || c.goal.toLowerCase().includes(query.toLowerCase())));
  return <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6"><div className="mb-4 flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search campaign ID or goal" className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm dark:border-gray-700 dark:bg-gray-900" /></div><select value={status} onChange={e => setStatus(e.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900"><option value="all">All statuses</option><option value="pending">Pending payment</option><option value="active">Active</option><option value="paused">Paused</option><option value="expired">Expired</option><option value="cancelled">Cancelled</option></select></div><div className="space-y-3">{rows.map(c => <div key={c.id} className="rounded-3xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-black uppercase text-gray-500 dark:bg-gray-800">{STATUS_LABEL[c.status] || c.status}</span><span className="rounded-full bg-primary-50 px-2 py-1 text-[10px] font-black uppercase text-primary-600 dark:bg-primary-950">{c.tier_code}</span></div><p className="mt-2 font-black capitalize text-gray-900 dark:text-white">{c.goal.replace(/_/g, ' ')}</p><p className="font-mono text-[10px] text-gray-400">{c.id}</p><p className="mt-1 text-xs text-gray-500">{c.campaign_assets?.length || 1} asset(s) · {c.campaign_placements?.length || c.placements?.length || 0} placement(s) · ends {new Date(c.end_date).toLocaleDateString()}</p></div><div className="flex gap-2">{c.status === 'active' && <button onClick={() => lifecycle(c.id, 'paused')} className="rounded-xl bg-gray-100 p-2.5 text-gray-600 dark:bg-gray-800"><Pause className="h-4 w-4" /></button>}{c.status === 'paused' && <button onClick={() => lifecycle(c.id, 'active')} className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600 dark:bg-emerald-950"><Play className="h-4 w-4" /></button>}{['active', 'paused', 'pending'].includes(c.status) && <button onClick={() => lifecycle(c.id, 'cancelled')} className="rounded-xl bg-red-50 p-2.5 text-red-600 dark:bg-red-950"><Trash2 className="h-4 w-4" /></button>}</div></div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><Metric label="Media budget" value={money(c.media_budget, c.billing_currency)} /><Metric label="Actual spend" value={money(c.actual_spend, c.billing_currency)} /><Metric label="Impressions" value={c.actual_impressions} /><Metric label="Conversions" value={c.actual_conversions} /></div></div>)}{!rows.length && <div className="rounded-3xl border border-dashed border-gray-300 p-10 text-center text-sm text-gray-400 dark:border-gray-700">No campaigns match this filter.</div>}</div></div>;
}
function Kpi({ label, value, icon: Icon }: { label: string; value: string; icon: React.ComponentType<{ className?: string }> }) { return <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"><Icon className="h-5 w-5 text-primary-600" /><p className="mt-3 text-xl font-black text-gray-950 dark:text-white">{value}</p><p className="text-xs text-gray-400">{label}</p></div>; }
function Metric({ label, value }: { label: string; value: string | number }) { return <div className="rounded-xl bg-white/70 p-2 dark:bg-gray-900"><p className="text-xs font-black text-gray-900 dark:text-white">{value}</p><p className="text-[10px] text-gray-400">{label}</p></div>; }
