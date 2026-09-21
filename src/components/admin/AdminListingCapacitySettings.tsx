import { useEffect, useState } from 'react';
import { Boxes, Loader2, Plus, Save, SlidersHorizontal } from 'lucide-react';
import TaxonomyCategoryPicker from '../listing/TaxonomyCategoryPicker';
import type { MarketplaceListingTypeCode } from '../../lib/listingEngine';
import {
  getAdminListingCapacityConfig,
  updateAdminListingAllowanceSettings,
  upsertAdminListingAllowanceRule,
  upsertAdminListingCapacityPack,
  type AdminListingCapacityConfig,
  type ListingAllowanceRule,
  type ListingCapacityPack,
} from '../../lib/listingAllowance';

const LISTING_TYPES: MarketplaceListingTypeCode[] = [
  'PHYSICAL', 'DIGITAL', 'SERVICE', 'COURSE', 'JOB', 'TASK',
];

const ROLE_SUGGESTIONS = [
  'vendor',
  'seller',
  'service_provider',
  'freelancer',
  'course_creator',
  'employer',
  'task_creator',
  'task_completer',
  'affiliate',
];

function Toggle({ value, onChange }: { value: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={value}
      onClick={onChange}
      className={`relative h-7 w-12 rounded-full transition-colors ${value ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`}
    >
      <span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white transition-transform ${value ? 'translate-x-5' : ''}`} />
    </button>
  );
}

function newPack(): ListingCapacityPack {
  return {
    id: '',
    name: 'Extra listings',
    description: '',
    listing_count: 5,
    amount: 0,
    currency: 'NGN',
    validity_days: 30,
    listing_type_code: null,
    category_id: null,
    is_active: false,
    sort_order: 100,
    metadata: {},
  };
}

function newRule(): ListingAllowanceRule {
  return {
    id: '',
    name: 'Allowance override',
    scope_type: 'listing_type',
    listing_type_code: 'PHYSICAL',
    category_id: null,
    role_key: null,
    user_id: null,
    free_allowance: 5,
    priority: 100,
    is_active: true,
    metadata: {},
  };
}

export default function AdminListingCapacitySettings() {
  const [config, setConfig] = useState<AdminListingCapacityConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingPack, setSavingPack] = useState<string | null>(null);
  const [savingRule, setSavingRule] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const reload = async () => {
    const next = await getAdminListingCapacityConfig();
    setConfig(next);
    setLoading(false);
  };

  useEffect(() => { void reload(); }, []);

  const updatePack = (index: number, patch: Partial<ListingCapacityPack>) => {
    setConfig(current => current ? {
      ...current,
      packs: current.packs.map((pack, i) => i === index ? { ...pack, ...patch } : pack),
    } : current);
  };

  const updateRule = (index: number, patch: Partial<ListingAllowanceRule>) => {
    setConfig(current => current ? {
      ...current,
      rules: current.rules.map((rule, i) => i === index ? { ...rule, ...patch } : rule),
    } : current);
  };

  if (loading) {
    return <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary-600" /></div>;
  }
  if (!config) return null;

  return (
    <section className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Boxes className="w-5 h-5 text-primary-600" />
            <h2 className="font-black text-gray-900 dark:text-white">Listing Capacity</h2>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Free monthly allowance first. Extra capacity is purchased separately. Promotions do not increase listing capacity.
          </p>
        </div>
        <button
          type="button"
          disabled={savingSettings}
          onClick={async () => {
            setSavingSettings(true);
            setMessage(null);
            try {
              const settings = await updateAdminListingAllowanceSettings(config.settings);
              setConfig({ ...config, settings });
              setMessage('Listing allowance settings saved.');
            } catch (error) {
              setMessage(error instanceof Error ? error.message : 'Unable to save listing allowance settings.');
            } finally {
              setSavingSettings(false);
            }
          }}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Listing Settings
        </button>
      </div>

      {message && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
          {message}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Monthly listing allowance</p>
            <p className="text-xs text-gray-500 mt-0.5">Server-side master switch.</p>
          </div>
          <Toggle
            value={config.settings.enabled}
            onChange={() => setConfig({
              ...config,
              settings: { ...config.settings, enabled: !config.settings.enabled },
            })}
          />
        </div>
        <label className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <span className="block text-xs font-semibold text-gray-500 mb-1">Default free listings / month</span>
          <input
            type="number"
            min={0}
            max={1000000}
            value={config.settings.default_free_allowance}
            onChange={e => setConfig({
              ...config,
              settings: { ...config.settings, default_free_allowance: Number(e.target.value) },
            })}
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
          />
          <p className="text-[11px] text-gray-400 mt-1">Resets at the beginning of each calendar month.</p>
        </label>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-black text-gray-900 dark:text-white">Paid capacity packs</h3>
            <p className="text-xs text-gray-500">Set quantity, duration and price. No package is public until you switch it on.</p>
          </div>
          <button
            type="button"
            onClick={() => setConfig({ ...config, packs: [...config.packs, newPack()] })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 dark:text-gray-200 dark:border-gray-700"
          >
            <Plus className="w-3.5 h-3.5" /> Add Pack
          </button>
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          {config.packs.map((pack, index) => (
            <div key={pack.id || `new-pack-${index}`} className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <input
                  value={pack.name}
                  onChange={e => updatePack(index, { name: e.target.value })}
                  className="flex-1 bg-transparent font-bold text-gray-900 dark:text-white outline-none border-b border-transparent focus:border-gray-200"
                />
                <Toggle value={pack.is_active} onChange={() => updatePack(index, { is_active: !pack.is_active })} />
              </div>
              <textarea
                rows={2}
                value={pack.description || ''}
                placeholder="What this capacity pack includes"
                onChange={e => updatePack(index, { description: e.target.value })}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
              />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <label>
                  <span className="block text-[11px] text-gray-500 mb-1">Listings</span>
                  <input type="number" min={1} value={pack.listing_count}
                    onChange={e => updatePack(index, { listing_count: Number(e.target.value) })}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 text-sm" />
                </label>
                <label>
                  <span className="block text-[11px] text-gray-500 mb-1">Price</span>
                  <input type="number" min={0} step="0.01" value={pack.amount}
                    onChange={e => updatePack(index, { amount: Number(e.target.value) })}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 text-sm" />
                </label>
                <label>
                  <span className="block text-[11px] text-gray-500 mb-1">Currency</span>
                  <input value={pack.currency} maxLength={3}
                    onChange={e => updatePack(index, { currency: e.target.value.toUpperCase() })}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 text-sm uppercase" />
                </label>
                <label>
                  <span className="block text-[11px] text-gray-500 mb-1">Valid days</span>
                  <input type="number" min={1} max={366} value={pack.validity_days}
                    onChange={e => updatePack(index, { validity_days: Number(e.target.value) })}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 text-sm" />
                </label>
              </div>
              <label>
                <span className="block text-[11px] text-gray-500 mb-1">Listing type</span>
                <select
                  value={pack.listing_type_code || ''}
                  onChange={e => updatePack(index, {
                    listing_type_code: e.target.value || null,
                    category_id: null,
                  })}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                >
                  <option value="">All listing types</option>
                  {LISTING_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
              {pack.listing_type_code && (
                <TaxonomyCategoryPicker
                  listingTypeCode={pack.listing_type_code as MarketplaceListingTypeCode}
                  selectedCategoryId={pack.category_id}
                  compact
                  label="Optional category restriction"
                  onChange={(categoryId) => updatePack(index, { category_id: categoryId })}
                />
              )}
              <button
                type="button"
                disabled={savingPack === (pack.id || `new-${index}`)}
                onClick={async () => {
                  const key=pack.id || `new-${index}`;
                  setSavingPack(key);
                  setMessage(null);
                  try {
                    await upsertAdminListingCapacityPack(pack);
                    await reload();
                    setMessage(`${pack.name} saved.`);
                  } catch (error) {
                    setMessage(error instanceof Error ? error.message : 'Unable to save capacity pack.');
                  } finally {
                    setSavingPack(null);
                  }
                }}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 dark:bg-white dark:text-slate-950 text-white px-3 py-2.5 text-sm font-bold disabled:opacity-50"
              >
                {savingPack === (pack.id || `new-${index}`) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Pack
              </button>
            </div>
          ))}
          {config.packs.length === 0 && (
            <div className="lg:col-span-2 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-5 text-sm text-gray-500">
              No paid listing-capacity packs yet. Create one only when you are ready to set its quantity and price.
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-gray-500" />
              <h3 className="font-black text-gray-900 dark:text-white">Allowance overrides</h3>
            </div>
            <p className="text-xs text-gray-500 mt-1">Override the default by listing type, taxonomy category, role or a specific user.</p>
          </div>
          <button
            type="button"
            onClick={() => setConfig({ ...config, rules: [...config.rules, newRule()] })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 dark:text-gray-200 dark:border-gray-700"
          >
            <Plus className="w-3.5 h-3.5" /> Add Rule
          </button>
        </div>

        <div className="space-y-3">
          {config.rules.map((rule, index) => (
            <div key={rule.id || `new-rule-${index}`} className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <input value={rule.name} onChange={e => updateRule(index, { name: e.target.value })}
                  className="flex-1 bg-transparent font-bold text-gray-900 dark:text-white outline-none border-b border-transparent focus:border-gray-200" />
                <Toggle value={rule.is_active} onChange={() => updateRule(index, { is_active: !rule.is_active })} />
              </div>
              <div className="grid sm:grid-cols-3 gap-2">
                <label>
                  <span className="block text-[11px] text-gray-500 mb-1">Scope</span>
                  <select value={rule.scope_type} onChange={e => {
                    const scope=e.target.value as ListingAllowanceRule['scope_type'];
                    updateRule(index, {
                      scope_type: scope,
                      listing_type_code: scope === 'global'
                        ? null
                        : scope === 'listing_type' || scope === 'category'
                          ? (rule.listing_type_code || 'PHYSICAL')
                          : rule.listing_type_code,
                      category_id: scope === 'category' ? rule.category_id : null,
                      role_key: scope === 'role' ? rule.role_key : null,
                      user_id: scope === 'user' ? rule.user_id : null,
                    });
                  }}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 text-sm">
                    <option value="global">Global</option>
                    <option value="listing_type">Listing type</option>
                    <option value="category">Category</option>
                    <option value="role">Role</option>
                    <option value="user">Specific user</option>
                  </select>
                </label>
                <label>
                  <span className="block text-[11px] text-gray-500 mb-1">Free listings / month</span>
                  <input type="number" min={0} value={rule.free_allowance}
                    onChange={e => updateRule(index, { free_allowance: Number(e.target.value) })}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 text-sm" />
                </label>
                <label>
                  <span className="block text-[11px] text-gray-500 mb-1">Priority</span>
                  <input type="number" value={rule.priority}
                    onChange={e => updateRule(index, { priority: Number(e.target.value) })}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 text-sm" />
                </label>
              </div>

              {(rule.scope_type === 'listing_type' || rule.scope_type === 'category' || rule.scope_type === 'role' || rule.scope_type === 'user') && (
                <label>
                  <span className="block text-[11px] text-gray-500 mb-1">Listing type {rule.scope_type === 'listing_type' || rule.scope_type === 'category' ? '' : '(optional)'}</span>
                  <select value={rule.listing_type_code || ''} onChange={e => updateRule(index, {
                    listing_type_code: e.target.value || null,
                    category_id: rule.scope_type === 'category' ? null : rule.category_id,
                  })}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm">
                    {rule.scope_type !== 'listing_type' && rule.scope_type !== 'category' && <option value="">All listing types</option>}
                    {LISTING_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                  </select>
                </label>
              )}

              {rule.scope_type === 'category' && rule.listing_type_code && (
                <TaxonomyCategoryPicker
                  listingTypeCode={rule.listing_type_code as MarketplaceListingTypeCode}
                  selectedCategoryId={rule.category_id}
                  compact
                  label="Taxonomy category / subtree"
                  onChange={(categoryId) => updateRule(index, { category_id: categoryId })}
                />
              )}

              {rule.scope_type === 'role' && (
                <label>
                  <span className="block text-[11px] text-gray-500 mb-1">Role key</span>
                  <input list="listing-role-options" value={rule.role_key || ''}
                    onChange={e => updateRule(index, { role_key: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
                  <datalist id="listing-role-options">
                    {ROLE_SUGGESTIONS.map(role => <option key={role} value={role} />)}
                  </datalist>
                </label>
              )}

              {rule.scope_type === 'user' && (
                <label>
                  <span className="block text-[11px] text-gray-500 mb-1">User ID</span>
                  <input value={rule.user_id || ''} placeholder="UUID"
                    onChange={e => updateRule(index, { user_id: e.target.value || null })}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
                </label>
              )}

              <button
                type="button"
                disabled={savingRule === (rule.id || `new-${index}`)}
                onClick={async () => {
                  const key=rule.id || `new-${index}`;
                  setSavingRule(key);
                  setMessage(null);
                  try {
                    await upsertAdminListingAllowanceRule(rule);
                    await reload();
                    setMessage(`${rule.name} saved.`);
                  } catch (error) {
                    setMessage(error instanceof Error ? error.message : 'Unable to save allowance rule.');
                  } finally {
                    setSavingRule(null);
                  }
                }}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 dark:bg-white dark:text-slate-950 text-white px-3 py-2.5 text-sm font-bold disabled:opacity-50"
              >
                {savingRule === (rule.id || `new-${index}`) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Rule
              </button>
            </div>
          ))}
          {config.rules.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-5 text-sm text-gray-500">
              No overrides yet. The default monthly allowance applies to all qualifying listings.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
