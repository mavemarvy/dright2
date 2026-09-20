import { useEffect, useState } from 'react';
import { BadgeCheck, ExternalLink, Loader2, Save, Star, Store, WalletCards } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  getAdminDrightStarterSettings,
  updateAdminDrightStarterSettings,
  type DrightStarterAdminSettings,
} from '../../lib/drightStarter';
import { formatCurrencyValue } from '../../lib/currency';

function Toggle({
  value,
  onChange,
  disabled = false,
}: {
  value: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      aria-pressed={value}
      className={'relative w-12 h-7 rounded-full transition-colors disabled:opacity-50 ' + (value ? 'bg-primary-600' : 'bg-gray-300')}
    >
      <span className={'absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ' + (value ? 'translate-x-5' : '')} />
    </button>
  );
}

export default function AdminDrightStarterProductSettings() {
  const [settings, setSettings] = useState<DrightStarterAdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void getAdminDrightStarterSettings().then((value) => {
      setSettings(value);
      setLoading(false);
    });
  }, []);

  const save = async () => {
    if (!settings || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const next = await updateAdminDrightStarterSettings(settings);
      setSettings(next);
      setMessage('Official DRIGHT Store and Starter product settings saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save Starter product settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex items-center justify-center min-h-32">
        <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
      </div>
    );
  }

  if (!settings) return null;

  const { store, product } = settings;

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Store className="w-5 h-5 text-primary-600" />
            <h2 className="font-semibold text-gray-900">Official DRIGHT Store & Starter Product</h2>
          </div>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl">
            First-party new-user product. It has no marketplace platform fee. Affiliate commission and included access are snapshotted when payment starts.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/dright/starter"
            target="_blank"
            className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 inline-flex items-center gap-2"
          >
            <ExternalLink className="w-4 h-4" /> Preview
          </Link>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Starter
          </button>
        </div>
      </div>

      {message && <div className="rounded-xl bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700">{message}</div>}

      <div className="grid sm:grid-cols-2 gap-4">
        <label className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">DRIGHT Store active</p>
            <p className="text-xs text-gray-500 mt-0.5">Master switch for the official store.</p>
          </div>
          <Toggle
            value={store.is_active}
            onChange={() => setSettings({ ...settings, store: { ...store, is_active: !store.is_active } })}
          />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">Store public</p>
            <p className="text-xs text-gray-500 mt-0.5">Allow guests to view the official store.</p>
          </div>
          <Toggle
            value={store.public_visible}
            onChange={() => setSettings({ ...settings, store: { ...store, public_visible: !store.public_visible } })}
          />
        </label>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Store name</label>
          <input
            value={store.name}
            onChange={(e) => setSettings({ ...settings, store: { ...store, name: e.target.value } })}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-primary-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Store tagline</label>
          <input
            value={store.tagline}
            onChange={(e) => setSettings({ ...settings, store: { ...store, tagline: e.target.value } })}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-primary-500"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Store description</label>
          <textarea
            rows={2}
            value={store.description}
            onChange={(e) => setSettings({ ...settings, store: { ...store, description: e.target.value } })}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-primary-500 resize-y"
          />
        </div>
      </div>

      <div className="border-t border-gray-100 pt-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <BadgeCheck className="w-5 h-5 text-emerald-600" />
              <h3 className="font-semibold text-gray-900">DRIGHT Starter Access</h3>
            </div>
            <p className="text-xs text-gray-500 mt-1">Category: {product.category} · guest-only is permanently enforced.</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Current price</p>
            <p className="font-black text-gray-900">{formatCurrencyValue(product.price, product.currency)}</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <label className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-4">
            <div>
              <p className="text-sm font-semibold text-gray-900">Product enabled</p>
              <p className="text-xs text-gray-500 mt-0.5">Disable checkout without deleting history.</p>
            </div>
            <Toggle
              value={product.is_enabled}
              onChange={() => setSettings({ ...settings, product: { ...product, is_enabled: !product.is_enabled } })}
            />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-4">
            <div>
              <p className="text-sm font-semibold text-gray-900">Public view</p>
              <p className="text-xs text-gray-500 mt-0.5">Show the product to guests.</p>
            </div>
            <Toggle
              value={product.public_visible}
              onChange={() => setSettings({ ...settings, product: { ...product, public_visible: !product.public_visible } })}
            />
          </label>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 mt-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Starter price ({product.currency})</label>
            <input
              type="number"
              min="0"
              step="1"
              value={product.price}
              onChange={(e) => setSettings({ ...settings, product: { ...product, price: Number(e.target.value || 0) } })}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Affiliate commission %</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={product.affiliate_commission_percent}
              onChange={(e) => setSettings({ ...settings, product: { ...product, affiliate_commission_percent: Number(e.target.value || 0) } })}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Included access days</label>
            <input
              type="number"
              min="0"
              max="730"
              value={product.included_trial_days}
              onChange={(e) => setSettings({ ...settings, product: { ...product, included_trial_days: Number(e.target.value || 0) } })}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-primary-500"
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Product title</label>
            <input
              value={product.title}
              onChange={(e) => setSettings({ ...settings, product: { ...product, title: e.target.value } })}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subtitle</label>
            <input
              value={product.subtitle}
              onChange={(e) => setSettings({ ...settings, product: { ...product, subtitle: e.target.value } })}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-primary-500"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Product description</label>
            <textarea
              rows={4}
              value={product.description}
              onChange={(e) => setSettings({ ...settings, product: { ...product, description: e.target.value } })}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-primary-500 resize-y"
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <label className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-4">
            <div>
              <p className="text-sm font-semibold text-gray-900">Official product badge</p>
              <p className="text-xs text-gray-500 mt-0.5">Clearly identifies first-party DRIGHT inventory.</p>
            </div>
            <Toggle
              value={product.official_badge_enabled}
              onChange={() => setSettings({ ...settings, product: { ...product, official_badge_enabled: !product.official_badge_enabled } })}
            />
          </label>

          <div className="rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">DRIGHT Official Rating</p>
                <p className="text-xs text-gray-500 mt-0.5">Separate from real customer reviews.</p>
              </div>
              <Toggle
                value={product.official_rating_enabled}
                onChange={() => setSettings({ ...settings, product: { ...product, official_rating_enabled: !product.official_rating_enabled } })}
              />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
              <input
                type="number"
                min="0"
                max="5"
                step="0.1"
                disabled={!product.official_rating_enabled}
                value={product.official_rating}
                onChange={(e) => setSettings({ ...settings, product: { ...product, official_rating: Number(e.target.value || 0) } })}
                className="w-24 px-3 py-2 rounded-lg border border-gray-200 disabled:bg-gray-50"
              />
              <span className="text-xs text-gray-500">/ 5</span>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-emerald-50 border border-emerald-100 p-4 flex gap-3">
          <WalletCards className="w-5 h-5 text-emerald-700 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-900">Financial behavior</p>
            <p className="text-xs text-emerald-800 mt-1">
              Marketplace platform fee is always zero for this first-party product. Verified affiliate commission is paid through the existing affiliate wallet/ledger; the remainder is recorded as DRIGHT operating revenue.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
