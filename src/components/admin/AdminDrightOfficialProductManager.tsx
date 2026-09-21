import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BadgeCheck, Eye, EyeOff, ImagePlus, Loader2, PackagePlus, Save, Star, Store, X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  createAdminDrightOfficialProduct,
  listAdminDrightOfficialProducts,
  updateAdminDrightOfficialProduct,
  uploadOfficialProductImages,
  type DrightOfficialProduct,
} from '../../lib/drightOfficialStore';
import MarketingMaterialsEditor from '../listing/MarketingMaterialsEditor';
import {
  persistListingMarketingMaterials,
  type MarketingMaterialDraft,
} from '../../lib/marketingMaterials';
import TaxonomyCategoryPicker from '../listing/TaxonomyCategoryPicker';
import DynamicListingFields from '../listing/DynamicListingFields';
import {
  fetchMarketplaceAttributes,
  fetchMarketplaceEngineSettings,
  upsertMarketplaceListingExtension,
  validateMarketplaceAttributes,
  type MarketplaceAttributeDefinition,
  type MarketplaceEngineSettings,
  type MarketplaceListingTypeCode,
} from '../../lib/listingEngine';
import { formatCurrencyValue } from '../../lib/currency';

type ProductType = 'PHYSICAL' | 'DIGITAL' | 'SERVICE' | 'COURSE';

const DEFAULT_FORM = {
  name: '',
  slug: '',
  subtitle: '',
  description: '',
  product_type: 'DIGITAL' as ProductType,
  category: 'General',
  price: '0',
  currency: 'NGN',
  affiliate_commission_percent: '0',
  stock_quantity: '0',
  tags: '',
  brand: '',
  condition: 'new',
  benefits: '',
  public_visible: true,
  is_enabled: true,
  is_featured: true,
  official_badge_enabled: true,
  official_rating_enabled: false,
  official_rating: '5',
};

export default function AdminDrightOfficialProductManager() {
  const { user } = useAuth();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [products, setProducts] = useState<DrightOfficialProduct[]>([]);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [showCreate, setShowCreate] = useState(false);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [marketingMaterials, setMarketingMaterials] = useState<MarketingMaterialDraft[]>([]);
  const [engine, setEngine] = useState<MarketplaceEngineSettings | null>(null);
  const [taxonomyId, setTaxonomyId] = useState<string | null>(null);
  const [taxonomyPath, setTaxonomyPath] = useState<Array<{ id: string; name: string }>>([]);
  const [definitions, setDefinitions] = useState<MarketplaceAttributeDefinition[]>([]);
  const [attributes, setAttributes] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [items, settings] = await Promise.all([
        listAdminDrightOfficialProducts(),
        fetchMarketplaceEngineSettings(),
      ]);
      setProducts(items);
      setEngine(settings);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load official products.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    setTaxonomyId(null);
    setTaxonomyPath([]);
    setAttributes({});
    setDefinitions([]);
  }, [form.product_type]);

  useEffect(() => {
    if (!engine?.dynamic_forms_enabled) {
      setDefinitions([]);
      return;
    }
    void fetchMarketplaceAttributes(form.product_type, taxonomyId).then(setDefinitions);
  }, [engine?.dynamic_forms_enabled, form.product_type, taxonomyId]);

  const canCreate = useMemo(
    () => form.name.trim().length > 1 && form.description.trim().length > 5 && imageFiles.length > 0,
    [form.name, form.description, imageFiles.length],
  );

  const addImages = (files: FileList | null) => {
    if (!files?.length) return;
    const accepted = Array.from(files).filter((file) => file.type.startsWith('image/'));
    setImageFiles((prev) => [...prev, ...accepted]);
    accepted.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => setImagePreviews((prev) => [...prev, String(event.target?.result || '')]);
      reader.readAsDataURL(file);
    });
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const removeImage = (index: number) => {
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const create = async () => {
    if (!user?.id || saving || !canCreate) return;
    const validation = engine?.dynamic_forms_enabled
      ? validateMarketplaceAttributes(definitions, attributes)
      : null;
    if (validation) {
      setMessage(validation);
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const imageUrls = await uploadOfficialProductImages(user.id, imageFiles);
      const result = await createAdminDrightOfficialProduct({
        name: form.name.trim(),
        slug: form.slug.trim(),
        subtitle: form.subtitle.trim(),
        description: form.description.trim(),
        product_type: form.product_type,
        category: taxonomyPath[0]?.name || form.category,
        listing_taxonomy_category_id: taxonomyId,
        price: Number(form.price || 0),
        currency: form.currency.toUpperCase(),
        affiliate_commission_percent: Number(form.affiliate_commission_percent || 0),
        stock_quantity: Number(form.stock_quantity || 0),
        tags: form.tags.split(',').map((value) => value.trim()).filter(Boolean),
        brand: form.brand.trim() || null,
        condition: form.condition,
        specifications: attributes,
        public_visible: form.public_visible,
        is_enabled: form.is_enabled,
        is_featured: form.is_featured,
        official_badge_enabled: form.official_badge_enabled,
        official_rating_enabled: form.official_rating_enabled,
        official_rating: Number(form.official_rating || 0),
        benefits: form.benefits.split('\n').map((value) => value.trim()).filter(Boolean),
        image_url: imageUrls[0],
        image_urls: imageUrls,
      });

      if (engine && (engine.taxonomy_enabled || engine.dynamic_forms_enabled)) {
        const extension = await upsertMarketplaceListingExtension({
          entityType: 'product',
          entityId: result.marketplaceProductId,
          listingTypeCode: form.product_type as MarketplaceListingTypeCode,
          categoryId: taxonomyId,
          attributes: {
            legacy_category: taxonomyPath[0]?.name || form.category,
            ...attributes,
          },
          metadata: {
            source: 'admin_dright_official_store',
            first_party: true,
            official_product_id: result.officialProductId,
            taxonomy_path: taxonomyPath.map((node) => node.name),
            taxonomy_path_ids: taxonomyPath.map((node) => node.id),
          },
          sellerAffiliateCommission: Number(form.affiliate_commission_percent || 0),
        });
        if (extension.error) console.warn('Official product taxonomy sync failed:', extension.error);
      }

      if (marketingMaterials.length > 0) {
        try {
          await persistListingMarketingMaterials({
            kind: 'product',
            listingId: result.marketplaceProductId,
            ownerId: user.id,
            materials: marketingMaterials,
          });
        } catch (materialError) {
          console.warn('Official product created, but optional marketing materials failed:', materialError);
        }
      }

      setForm(DEFAULT_FORM);
      setImageFiles([]);
      setImagePreviews([]);
      setMarketingMaterials([]);
      setTaxonomyId(null);
      setTaxonomyPath([]);
      setAttributes({});
      setShowCreate(false);
      setMessage('Official DRIGHT product created and approved.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create official product.');
    } finally {
      setSaving(false);
    }
  };

  const toggleProduct = async (product: DrightOfficialProduct, key: 'public_visible' | 'is_enabled') => {
    setMessage(null);
    try {
      await updateAdminDrightOfficialProduct(product.id, { [key]: !product[key] });
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update official product.');
    }
  };

  if (loading) {
    return <div className="rounded-2xl bg-white border border-gray-100 p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary-600" /></div>;
  }

  return (
    <section className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5 md:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Store className="w-5 h-5 text-primary-600" />
            <h2 className="text-lg font-black text-gray-900">Official DRIGHT Store Listings</h2>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Create additional DRIGHT-owned marketplace listings. Official products are approved immediately and carry zero marketplace/Admin Task/Sales Team fees.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((value) => !value)}
          className="inline-flex items-center gap-2 rounded-xl bg-primary-600 text-white px-4 py-2.5 text-sm font-bold"
        >
          {showCreate ? <X className="w-4 h-4" /> : <PackagePlus className="w-4 h-4" />}
          {showCreate ? 'Close form' : 'Add official product'}
        </button>
      </div>

      {message && <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">{message}</div>}

      {showCreate && (
        <div className="rounded-2xl border border-primary-100 bg-primary-50/30 p-4 md:p-5 space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Product type">
              <select value={form.product_type} onChange={(e) => setForm({ ...form, product_type: e.target.value as ProductType })} className={inputClass}>
                <option value="DIGITAL">Digital product</option>
                <option value="PHYSICAL">Physical product</option>
                <option value="SERVICE">Service</option>
                <option value="COURSE">Course</option>
              </select>
            </Field>
            <Field label="Title">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="Official DRIGHT product title" />
            </Field>
            <Field label="Slug">
              <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className={inputClass} placeholder="auto-generated if blank" />
            </Field>
            <Field label="Subtitle">
              <input value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} className={inputClass} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Description">
                <textarea rows={5} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass} />
              </Field>
            </div>
          </div>

          {engine?.taxonomy_enabled ? (
            <TaxonomyCategoryPicker
              listingTypeCode={form.product_type}
              selectedCategoryId={taxonomyId}
              onChange={(id, path) => {
                setTaxonomyId(id);
                setTaxonomyPath(path);
                setAttributes({});
              }}
            />
          ) : (
            <Field label="Category">
              <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputClass} />
            </Field>
          )}

          {engine?.dynamic_forms_enabled && definitions.length > 0 && (
            <DynamicListingFields
              definitions={definitions}
              values={attributes}
              onChange={(key, value) => setAttributes((current) => ({ ...current, [key]: value }))}
            />
          )}

          <div>
            <div className="flex items-center justify-between gap-3 mb-2">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Product images</h3>
                <p className="text-xs text-gray-500">At least one image is required for an official listing.</p>
              </div>
              <button type="button" onClick={() => imageInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700">
                <ImagePlus className="w-4 h-4" /> Upload images
              </button>
            </div>
            <input ref={imageInputRef} type="file" multiple accept="image/*" className="hidden" onChange={(e) => addImages(e.target.files)} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {imagePreviews.map((src, index) => (
                <div key={src + index} className="relative aspect-square overflow-hidden rounded-xl border border-gray-200 bg-white">
                  <img src={src} alt="" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => removeImage(index)} className="absolute top-2 right-2 rounded-full bg-black/70 text-white p-1"><X className="w-3.5 h-3.5" /></button>
                  {index === 0 && <span className="absolute left-2 bottom-2 rounded-full bg-white/90 px-2 py-1 text-[10px] font-black">COVER</span>}
                </div>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Field label="Price">
              <input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Currency">
              <input maxLength={3} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) })} className={inputClass} />
            </Field>
            <Field label="Affiliate commission %">
              <input type="number" min="0" max="100" step="0.1" value={form.affiliate_commission_percent} onChange={(e) => setForm({ ...form, affiliate_commission_percent: e.target.value })} className={inputClass} />
            </Field>
            {form.product_type === 'PHYSICAL' && (
              <Field label="Stock">
                <input type="number" min="0" value={form.stock_quantity} onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })} className={inputClass} />
              </Field>
            )}
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Brand">
              <input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Condition">
              <select value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })} className={inputClass}>
                <option value="new">New</option>
                <option value="open-box">Open box</option>
                <option value="refurbished">Refurbished</option>
                <option value="used">Used</option>
              </select>
            </Field>
            <Field label="Tags">
              <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} className={inputClass} placeholder="comma, separated, tags" />
            </Field>
          </div>

          <Field label="Benefits / what buyers get">
            <textarea rows={4} value={form.benefits} onChange={(e) => setForm({ ...form, benefits: e.target.value })} className={inputClass} placeholder="One benefit per line" />
          </Field>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <ToggleCard label="Public" value={form.public_visible} onChange={() => setForm({ ...form, public_visible: !form.public_visible })} />
            <ToggleCard label="Enabled" value={form.is_enabled} onChange={() => setForm({ ...form, is_enabled: !form.is_enabled })} />
            <ToggleCard label="Featured" value={form.is_featured} onChange={() => setForm({ ...form, is_featured: !form.is_featured })} />
            <ToggleCard label="Official badge" value={form.official_badge_enabled} onChange={() => setForm({ ...form, official_badge_enabled: !form.official_badge_enabled })} />
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-wrap items-center gap-4">
            <ToggleCard label="Official rating" value={form.official_rating_enabled} onChange={() => setForm({ ...form, official_rating_enabled: !form.official_rating_enabled })} compact />
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
              <input type="number" min="0" max="5" step="0.1" disabled={!form.official_rating_enabled} value={form.official_rating} onChange={(e) => setForm({ ...form, official_rating: e.target.value })} className="w-24 rounded-lg border border-gray-200 px-2.5 py-2 text-sm disabled:bg-gray-50" />
              <span className="text-xs text-gray-500">Official platform rating, separate from reviews</span>
            </div>
          </div>

          <MarketingMaterialsEditor value={marketingMaterials} onChange={setMarketingMaterials} disabled={saving} />

          <button
            type="button"
            onClick={create}
            disabled={!canCreate || saving}
            className="w-full min-h-[52px] rounded-2xl bg-slate-950 text-white font-black inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            {saving ? 'Creating official product…' : 'Create & approve official product'}
          </button>
        </div>
      )}

      <div className="space-y-3">
        {products.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
            No additional official products yet. Starter Access remains managed above.
          </div>
        ) : products.map((product) => (
          <div key={product.id} className="rounded-2xl border border-gray-200 p-4 flex flex-col sm:flex-row gap-4">
            <div className="w-full sm:w-24 aspect-square rounded-xl overflow-hidden bg-gray-100 shrink-0">
              {product.image_url ? <img src={product.image_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Store className="w-6 h-6 text-gray-300" /></div>}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-black text-gray-900">{product.name}</h3>
                {product.official_badge_enabled && <BadgeCheck className="w-4 h-4 text-emerald-500" />}
                <span className="text-[10px] rounded-full bg-gray-100 text-gray-600 px-2 py-1">{product.product_type}</span>
              </div>
              <p className="text-xs text-gray-500 mt-1 line-clamp-2">{product.subtitle || product.description}</p>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-600">
                <span className="font-black text-gray-900">{formatCurrencyValue(product.price, product.currency)}</span>
                <span>{product.affiliate_commission_percent}% affiliate</span>
                {product.official_rating_enabled && <span>{product.official_rating.toFixed(1)} official rating</span>}
              </div>
            </div>
            <div className="flex sm:flex-col gap-2 shrink-0">
              <button type="button" onClick={() => toggleProduct(product, 'public_visible')} className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold inline-flex items-center gap-1.5">
                {product.public_visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                {product.public_visible ? 'Public' : 'Hidden'}
              </button>
              <button type="button" onClick={() => toggleProduct(product, 'is_enabled')} className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold">
                {product.is_enabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const inputClass = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-xs font-bold text-gray-600 mb-1.5">{label}</span>{children}</label>;
}

function ToggleCard({ label, value, onChange, compact = false }: { label: string; value: boolean; onChange: () => void; compact?: boolean }) {
  return (
    <button type="button" onClick={onChange} className={compact ? 'inline-flex items-center gap-2' : 'rounded-xl border border-gray-200 bg-white p-3 flex items-center justify-between gap-3'}>
      <span className="text-xs font-bold text-gray-700">{label}</span>
      <span className={'relative w-10 h-6 rounded-full transition-colors ' + (value ? 'bg-primary-600' : 'bg-gray-300')}>
        <span className={'absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ' + (value ? 'translate-x-4' : '')} />
      </span>
    </button>
  );
}
