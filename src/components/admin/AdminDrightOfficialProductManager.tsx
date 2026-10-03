import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BadgeCheck, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Eye, EyeOff, ImagePlus, Loader2, PackagePlus, Save, Settings2, Star, Store, X,
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
  loadListingMarketingMaterials,
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
import { useCurrency } from '../../contexts/CurrencyContext';

type ProductType = 'PHYSICAL' | 'DIGITAL' | 'SERVICE' | 'COURSE';

type ProductEditDraft = {
  name: string;
  slug: string;
  subtitle: string;
  description: string;
  category: string;
  price: string;
  currency: string;
  affiliate_commission_percent: string;
  expiry_days: string;
  benefits: string;
  image_url: string | null;
  image_urls: string[];
  public_visible: boolean;
  is_enabled: boolean;
  is_featured: boolean;
  official_badge_enabled: boolean;
  official_rating_enabled: boolean;
  official_rating: string;
};

function editDraftFromProduct(product: DrightOfficialProduct): ProductEditDraft {
  const images = product.image_urls.length > 0
    ? product.image_urls
    : (product.image_url ? [product.image_url] : []);
  return {
    name: product.name,
    slug: product.slug,
    subtitle: product.subtitle || '',
    description: product.description || '',
    category: product.category,
    price: String(product.price),
    currency: product.currency,
    affiliate_commission_percent: String(product.affiliate_commission_percent),
    expiry_days: String(product.expiry_days ?? 365),
    benefits: product.benefits.join('\n'),
    image_url: images[0] || null,
    image_urls: images,
    public_visible: product.public_visible,
    is_enabled: product.is_enabled,
    is_featured: product.is_featured,
    official_badge_enabled: product.official_badge_enabled,
    official_rating_enabled: product.official_rating_enabled,
    official_rating: String(product.official_rating),
  };
}

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
  expiry_days: '365',
  stock_quantity: '0',
  tags: '',
  brand: '',
  condition: 'new',
  benefits: '',
  public_visible: false,
  is_enabled: true,
  is_featured: true,
  official_badge_enabled: true,
  official_rating_enabled: false,
  official_rating: '5',
};

export default function AdminDrightOfficialProductManager() {
  const { user } = useAuth();
  const { supportedCurrencies } = useCurrency();
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
  const [pricingSavingId, setPricingSavingId] = useState<string | null>(null);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, { price: string; currency: string; commission: string }>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ProductEditDraft | null>(null);
  const [editMarketingMaterials, setEditMarketingMaterials] = useState<MarketingMaterialDraft[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [editUploading, setEditUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [items, settings] = await Promise.all([
        listAdminDrightOfficialProducts(),
        fetchMarketplaceEngineSettings(),
      ]);
      setProducts(items);
      setPriceDrafts(Object.fromEntries(items.map((item) => [
        item.id,
        { price: String(item.price), currency: item.currency, commission: String(item.affiliate_commission_percent) },
      ])));
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

  const moveCreateImage = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= imageFiles.length) return;
    setImageFiles((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setImagePreviews((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const setCreateCover = (index: number) => {
    if (index <= 0 || index >= imageFiles.length) return;
    setImageFiles((prev) => [prev[index], ...prev.filter((_, i) => i !== index)]);
    setImagePreviews((prev) => [prev[index], ...prev.filter((_, i) => i !== index)]);
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
        expiry_days: Number(form.expiry_days || 365),
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

  const savePricing = async (product: DrightOfficialProduct) => {
    const draft = priceDrafts[product.id];
    if (!draft) return;
    const price = Number(draft.price);
    const commission = Number(draft.commission);
    const currency = String(draft.currency || product.currency).toUpperCase();
    if (!Number.isFinite(price) || price < 0) {
      setMessage('Price must be 0 or greater.');
      return;
    }
    if (!/^[A-Z]{3}$/.test(currency)) {
      setMessage('Choose a valid product currency.');
      return;
    }
    if (!Number.isFinite(commission) || commission < 0 || commission > 100) {
      setMessage('Affiliate commission must be between 0% and 100%.');
      return;
    }
    setPricingSavingId(product.id);
    setMessage(null);
    try {
      await updateAdminDrightOfficialProduct(product.id, {
        price,
        currency,
        affiliate_commission_percent: commission,
      });
      setMessage(`${product.name} price, currency and affiliate commission updated.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update product pricing.');
    } finally {
      setPricingSavingId(null);
    }
  };

  const openFullEditor = async (product: DrightOfficialProduct) => {
    if (editingId === product.id) {
      setEditingId(null);
      setEditDraft(null);
      setEditMarketingMaterials([]);
      return;
    }
    setEditingId(product.id);
    setEditDraft(editDraftFromProduct(product));
    setEditMarketingMaterials([]);
    setMessage(null);
    try {
      setEditMarketingMaterials(await loadListingMarketingMaterials('product', product.marketplace_product_id));
    } catch {
      setEditMarketingMaterials([]);
    }
  };

  const uploadEditImages = async (files: FileList | null) => {
    if (!files?.length || !user?.id || !editDraft || editUploading) return;
    const accepted = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (accepted.length === 0) return;
    setEditUploading(true);
    setMessage(null);
    try {
      const urls = await uploadOfficialProductImages(user.id, accepted);
      const nextImages = [...editDraft.image_urls, ...urls];
      setEditDraft({
        ...editDraft,
        image_url: nextImages[0] || null,
        image_urls: nextImages,
      });
      setMessage('Images uploaded. Save full settings to publish the gallery.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to upload product images.');
    } finally {
      setEditUploading(false);
    }
  };

  const removeEditImage = (index: number) => {
    if (!editDraft) return;
    const nextImages = editDraft.image_urls.filter((_, i) => i !== index);
    setEditDraft({
      ...editDraft,
      image_url: nextImages[0] || null,
      image_urls: nextImages,
    });
  };

  const moveEditImage = (index: number, direction: -1 | 1) => {
    if (!editDraft) return;
    const target = index + direction;
    if (target < 0 || target >= editDraft.image_urls.length) return;
    const nextImages = [...editDraft.image_urls];
    [nextImages[index], nextImages[target]] = [nextImages[target], nextImages[index]];
    setEditDraft({
      ...editDraft,
      image_url: nextImages[0] || null,
      image_urls: nextImages,
    });
  };

  const setEditCover = (index: number) => {
    if (!editDraft || index <= 0 || index >= editDraft.image_urls.length) return;
    const selected = editDraft.image_urls[index];
    const nextImages = [selected, ...editDraft.image_urls.filter((_, i) => i !== index)];
    setEditDraft({
      ...editDraft,
      image_url: selected,
      image_urls: nextImages,
    });
  };

  const saveFullSettings = async (product: DrightOfficialProduct) => {
    if (!editDraft || editingId !== product.id || editSaving) return;
    const price = Number(editDraft.price);
    const commission = Number(editDraft.affiliate_commission_percent);
    const rating = Number(editDraft.official_rating);
    const currency = editDraft.currency.trim().toUpperCase();
    const expiryDays = Number(editDraft.expiry_days || 365);
    if (!editDraft.name.trim()) {
      setMessage('Product title is required.');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setMessage('Price must be 0 or greater.');
      return;
    }
    if (!Number.isFinite(commission) || commission < 0 || commission > 100) {
      setMessage('Affiliate commission must be between 0% and 100%.');
      return;
    }
    if (!/^[A-Z]{3}$/.test(currency)) {
      setMessage('Currency must be a 3-letter ISO code such as NGN, USD or GBP.');
      return;
    }
    if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
      setMessage('Official rating must be between 0 and 5.');
      return;
    }
    if (['DIGITAL', 'COURSE'].includes(product.product_type) && (!Number.isInteger(expiryDays) || expiryDays < 1 || expiryDays > 3650)) {
      setMessage('Access expiry must be between 1 and 3650 days.');
      return;
    }

    setEditSaving(true);
    setMessage(null);
    try {
      await updateAdminDrightOfficialProduct(product.id, {
        name: editDraft.name.trim(),
        slug: editDraft.slug.trim(),
        subtitle: editDraft.subtitle.trim(),
        description: editDraft.description.trim(),
        category: editDraft.category.trim() || 'General',
        price,
        currency,
        affiliate_commission_percent: commission,
        expiry_days: expiryDays,
        public_visible: editDraft.public_visible,
        is_enabled: editDraft.is_enabled,
        is_featured: editDraft.is_featured,
        official_badge_enabled: editDraft.official_badge_enabled,
        official_rating_enabled: editDraft.official_rating_enabled,
        official_rating: rating,
        benefits: editDraft.benefits.split('\n').map((value) => value.trim()).filter(Boolean),
        image_url: editDraft.image_urls[0] || null,
        image_urls: editDraft.image_urls,
      });
      if (user?.id) {
        await persistListingMarketingMaterials({
          kind: 'product',
          listingId: product.marketplace_product_id,
          ownerId: user.id,
          materials: editMarketingMaterials,
        });
      }
      setMessage(`${editDraft.name.trim()} settings and affiliate marketing materials saved.`);
      await load();
      setEditingId(null);
      setEditDraft(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save official product settings.');
    } finally {
      setEditSaving(false);
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
                <p className="text-xs text-gray-500">The first image is the cover. Add extra images for the swipeable product gallery, then reorder them before saving.</p>
              </div>
              <button type="button" onClick={() => imageInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700">
                <ImagePlus className="w-4 h-4" /> Add images
              </button>
            </div>
            <input ref={imageInputRef} type="file" multiple accept="image/*" className="hidden" onChange={(e) => addImages(e.target.files)} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {imagePreviews.map((src, index) => (
                <div key={src + index} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                  <div className="relative aspect-square overflow-hidden bg-gray-50">
                    <img src={src} alt="" className="w-full h-full object-contain" />
                    <button type="button" onClick={() => removeImage(index)} className="absolute top-2 right-2 rounded-full bg-black/70 text-white p-1"><X className="w-3.5 h-3.5" /></button>
                    {index === 0 && <span className="absolute left-2 top-2 rounded-full bg-emerald-600 text-white px-2 py-1 text-[10px] font-black">COVER</span>}
                  </div>
                  <div className="flex items-center justify-between gap-1 p-2">
                    <button type="button" disabled={index === 0} onClick={() => moveCreateImage(index, -1)} className="rounded-lg border border-gray-200 p-1.5 disabled:opacity-30" title="Move left"><ChevronLeft className="w-3.5 h-3.5" /></button>
                    {index > 0 ? (
                      <button type="button" onClick={() => setCreateCover(index)} className="text-[10px] font-black text-primary-700 px-1">Set cover</button>
                    ) : (
                      <span className="text-[10px] font-black text-emerald-700 px-1">Main image</span>
                    )}
                    <button type="button" disabled={index === imagePreviews.length - 1} onClick={() => moveCreateImage(index, 1)} className="rounded-lg border border-gray-200 p-1.5 disabled:opacity-30" title="Move right"><ChevronRight className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Field label="Price">
              <input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Product currency">
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className={inputClass}
              >
                {supportedCurrencies.map((currency) => (
                  <option key={currency.code} value={currency.code}>{currency.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Affiliate commission %">
              <input type="number" min="0" max="100" step="0.1" value={form.affiliate_commission_percent} onChange={(e) => setForm({ ...form, affiliate_commission_percent: e.target.value })} className={inputClass} />
            </Field>
            {form.product_type === 'PHYSICAL' ? (
              <Field label="Stock">
                <input type="number" min="0" value={form.stock_quantity} onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })} className={inputClass} />
              </Field>
            ) : ['DIGITAL', 'COURSE'].includes(form.product_type) ? (
              <Field label="Access expiry">
                <select value={form.expiry_days} onChange={(e) => setForm({ ...form, expiry_days: e.target.value })} className={inputClass}>
                  <option value="180">6 months (180 days)</option>
                  <option value="365">1 year (365 days)</option>
                  <option value="730">2 years (730 days)</option>
                </select>
              </Field>
            ) : null}
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

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
            <strong>Visibility:</strong> new Official DRIGHT products start in <strong>Admin only</strong> test mode. Turn on Public visibility only after you finish testing the product, checkout and buyer access.
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <ToggleCard label={form.public_visible ? 'Public visibility' : 'Admin only'} value={form.public_visible} onChange={() => setForm({ ...form, public_visible: !form.public_visible })} />
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
          <div key={product.id} className="rounded-2xl border border-gray-200 p-4 space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="w-full sm:w-24 aspect-square rounded-xl overflow-hidden bg-gray-100 shrink-0">
              {product.image_url ? <img src={product.image_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Store className="w-6 h-6 text-gray-300" /></div>}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-black text-gray-900">{product.name}</h3>
                {product.official_badge_enabled && <BadgeCheck className="w-4 h-4 text-emerald-500" />}
                <span className="text-[10px] rounded-full bg-gray-100 text-gray-600 px-2 py-1">{product.product_type}</span>
                <span className={`text-[10px] rounded-full px-2 py-1 font-black ${product.public_visible ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                  {product.public_visible ? 'PUBLIC' : 'ADMIN ONLY'}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1 line-clamp-2">{product.subtitle || product.description}</p>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-600">
                <span className="font-black text-gray-900">{formatCurrencyValue(product.price, product.currency)}</span>
                <span>{product.affiliate_commission_percent}% affiliate</span>
                {product.official_rating_enabled && <span>{product.official_rating.toFixed(1)} official rating</span>}
              </div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(120px,180px)_minmax(160px,220px)_minmax(120px,180px)_auto] gap-2 items-end">
                <Field label={`Price (${product.currency})`}>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={priceDrafts[product.id]?.price ?? String(product.price)}
                    onChange={(e) => setPriceDrafts((current) => ({
                      ...current,
                      [product.id]: {
                        price: e.target.value,
                        currency: current[product.id]?.currency ?? product.currency,
                        commission: current[product.id]?.commission ?? String(product.affiliate_commission_percent),
                      },
                    }))}
                    className={inputClass}
                  />
                </Field>
                <Field label="Currency">
                  <select
                    value={priceDrafts[product.id]?.currency ?? product.currency}
                    onChange={(e) => setPriceDrafts((current) => ({
                      ...current,
                      [product.id]: {
                        price: current[product.id]?.price ?? String(product.price),
                        currency: e.target.value,
                        commission: current[product.id]?.commission ?? String(product.affiliate_commission_percent),
                      },
                    }))}
                    className={inputClass}
                  >
                    {supportedCurrencies.map((currency) => (
                      <option key={currency.code} value={currency.code}>{currency.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Affiliate commission %">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={priceDrafts[product.id]?.commission ?? String(product.affiliate_commission_percent)}
                    onChange={(e) => setPriceDrafts((current) => ({
                      ...current,
                      [product.id]: {
                        price: current[product.id]?.price ?? String(product.price),
                        currency: current[product.id]?.currency ?? product.currency,
                        commission: e.target.value,
                      },
                    }))}
                    className={inputClass}
                  />
                </Field>
                <button
                  type="button"
                  onClick={() => void savePricing(product)}
                  disabled={pricingSavingId === product.id}
                  className="min-h-[42px] rounded-xl bg-slate-950 text-white px-4 py-2.5 text-xs font-black inline-flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {pricingSavingId === product.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save pricing
                </button>
              </div>
            </div>
            <div className="flex sm:flex-col gap-2 shrink-0">
              <button
                type="button"
                onClick={() => toggleProduct(product, 'public_visible')}
                className={`rounded-xl border px-3 py-2 text-xs font-black inline-flex items-center justify-center gap-1.5 ${product.public_visible ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}
                title={product.public_visible ? 'Visible to the public. Tap to switch to admin-only testing.' : 'Visible only to DRIGHT admins. Tap to publish publicly.'}
              >
                {product.public_visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                {product.public_visible ? 'Public' : 'Admin only'}
              </button>
              <button type="button" onClick={() => toggleProduct(product, 'is_enabled')} className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold">
                {product.is_enabled ? 'Enabled' : 'Disabled'}
              </button>
              <button
                type="button"
                onClick={() => void openFullEditor(product)}
                className="rounded-xl border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-black text-primary-700 inline-flex items-center justify-center gap-1.5"
              >
                <Settings2 className="w-4 h-4" />
                Manage
                {editingId === product.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>
            </div>

            {editingId === product.id && editDraft && (
              <div className="rounded-2xl border border-primary-100 bg-primary-50/30 p-4 md:p-5 space-y-5">
                <div>
                  <h4 className="font-black text-gray-900">Full product settings</h4>
                  <p className="text-xs text-gray-500 mt-1">
                    Same commercial controls as Starter: source currency, price, commission, presentation, gallery and visibility. Keep unfinished products in Admin only mode while you test them. Price 0 automatically becomes a free product.
                  </p>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Product title">
                    <input value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} className={inputClass} />
                  </Field>
                  <Field label="Slug">
                    <input value={editDraft.slug} onChange={(e) => setEditDraft({ ...editDraft, slug: e.target.value })} className={inputClass} />
                  </Field>
                  <Field label="Subtitle">
                    <input value={editDraft.subtitle} onChange={(e) => setEditDraft({ ...editDraft, subtitle: e.target.value })} className={inputClass} />
                  </Field>
                  <Field label="Category">
                    <input value={editDraft.category} onChange={(e) => setEditDraft({ ...editDraft, category: e.target.value })} className={inputClass} />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Description">
                      <textarea rows={5} value={editDraft.description} onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })} className={inputClass} />
                    </Field>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Field label="Price">
                    <input type="number" min="0" step="0.01" value={editDraft.price} onChange={(e) => setEditDraft({ ...editDraft, price: e.target.value })} className={inputClass} />
                  </Field>
                  <Field label="Product currency">
                    <select
                      value={editDraft.currency}
                      onChange={(e) => setEditDraft({ ...editDraft, currency: e.target.value })}
                      className={inputClass}
                    >
                      {supportedCurrencies.map((currency) => (
                        <option key={currency.code} value={currency.code}>{currency.label}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Affiliate commission %">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={editDraft.affiliate_commission_percent}
                      onChange={(e) => setEditDraft({ ...editDraft, affiliate_commission_percent: e.target.value })}
                      className={inputClass}
                    />
                  </Field>
                  {['DIGITAL', 'COURSE'].includes(product.product_type) && (
                    <Field label="Course / access expiry">
                      <div className="space-y-2">
                        <select value={['180','365','730'].includes(editDraft.expiry_days) ? editDraft.expiry_days : 'custom'} onChange={(e) => {
                          if (e.target.value !== 'custom') setEditDraft({ ...editDraft, expiry_days: e.target.value });
                        }} className={inputClass}>
                          <option value="180">6 months (180 days)</option>
                          <option value="365">1 year (365 days)</option>
                          <option value="730">2 years (730 days)</option>
                          <option value="custom">Custom days</option>
                        </select>
                        {!['180','365','730'].includes(editDraft.expiry_days) && (
                          <input type="number" min="1" max="3650" step="1" value={editDraft.expiry_days} onChange={(e) => setEditDraft({ ...editDraft, expiry_days: e.target.value })} className={inputClass} placeholder="Custom days" />
                        )}
                      </div>
                    </Field>
                  )}
                </div>

                <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-xs leading-5 text-blue-900">
                  <strong>Currency authority:</strong> this source currency is the real product price. Marketplace may convert it for a viewer, but checkout preserves this amount and only normalizes internally for DRIGHT ledger accounting.
                  {['DIGITAL', 'COURSE'].includes(product.product_type) && (
                    <div className="mt-1"><strong>Access expiry:</strong> buyer access starts from the completed purchase date and expires after {editDraft.expiry_days || '365'} days.</div>
                  )}
                </div>

                <Field label="Benefits / what buyers get">
                  <textarea
                    rows={5}
                    value={editDraft.benefits}
                    onChange={(e) => setEditDraft({ ...editDraft, benefits: e.target.value })}
                    className={inputClass}
                    placeholder="One benefit per line"
                  />
                </Field>

                <div className="rounded-2xl border border-gray-200 bg-white p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-gray-900">Product cover & gallery</p>
                      <p className="text-xs text-gray-500 mt-0.5">The first image is the cover. Use “Add extra images” to build the swipeable gallery; reorder or set any image as the cover.</p>
                    </div>
                    <label className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 cursor-pointer">
                      {editUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                      {editUploading ? 'Uploading…' : 'Add extra images'}
                      <input
                        type="file"
                        multiple
                        accept="image/*"
                        className="hidden"
                        disabled={editUploading}
                        onChange={(e) => void uploadEditImages(e.target.files)}
                      />
                    </label>
                  </div>
                  {editDraft.image_urls.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                      {editDraft.image_urls.map((url, index) => (
                        <div key={url + index} className="rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                          <div className="relative aspect-square overflow-hidden bg-gray-50">
                            <img src={url} alt="" className="w-full h-full object-contain" />
                            <button type="button" onClick={() => removeEditImage(index)} className="absolute top-2 right-2 rounded-full bg-black/70 text-white p-1">
                              <X className="w-3.5 h-3.5" />
                            </button>
                            {index === 0 && <span className="absolute left-2 top-2 rounded-full bg-emerald-600 text-white px-2 py-1 text-[10px] font-black">COVER</span>}
                          </div>
                          <div className="flex items-center justify-between gap-1 bg-white p-2">
                            <button type="button" disabled={index === 0} onClick={() => moveEditImage(index, -1)} className="rounded-lg border border-gray-200 p-1.5 disabled:opacity-30" title="Move left"><ChevronLeft className="w-3.5 h-3.5" /></button>
                            {index > 0 ? (
                              <button type="button" onClick={() => setEditCover(index)} className="text-[10px] font-black text-primary-700 px-1">Set cover</button>
                            ) : (
                              <span className="text-[10px] font-black text-emerald-700 px-1">Main image</span>
                            )}
                            <button type="button" disabled={index === editDraft.image_urls.length - 1} onClick={() => moveEditImage(index, 1)} className="rounded-lg border border-gray-200 p-1.5 disabled:opacity-30" title="Move right"><ChevronRight className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-dashed border-gray-200 p-5 text-center text-xs text-gray-500">
                      No product image. Upload at least one cover before publishing.
                    </div>
                  )}
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <ToggleCard label={editDraft.public_visible ? 'Public visibility' : 'Admin only'} value={editDraft.public_visible} onChange={() => setEditDraft({ ...editDraft, public_visible: !editDraft.public_visible })} />
                  <ToggleCard label="Enabled" value={editDraft.is_enabled} onChange={() => setEditDraft({ ...editDraft, is_enabled: !editDraft.is_enabled })} />
                  <ToggleCard label="Featured" value={editDraft.is_featured} onChange={() => setEditDraft({ ...editDraft, is_featured: !editDraft.is_featured })} />
                  <ToggleCard label="Official badge" value={editDraft.official_badge_enabled} onChange={() => setEditDraft({ ...editDraft, official_badge_enabled: !editDraft.official_badge_enabled })} />
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-wrap items-center gap-4">
                  <ToggleCard
                    label="Official rating"
                    value={editDraft.official_rating_enabled}
                    onChange={() => setEditDraft({ ...editDraft, official_rating_enabled: !editDraft.official_rating_enabled })}
                    compact
                  />
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                    <input
                      type="number"
                      min="0"
                      max="5"
                      step="0.1"
                      disabled={!editDraft.official_rating_enabled}
                      value={editDraft.official_rating}
                      onChange={(e) => setEditDraft({ ...editDraft, official_rating: e.target.value })}
                      className="w-24 rounded-lg border border-gray-200 px-2.5 py-2 text-sm disabled:bg-gray-50"
                    />
                    <span className="text-xs text-gray-500">Separate from customer reviews</span>
                  </div>
                </div>

                <MarketingMaterialsEditor
                  value={editMarketingMaterials}
                  onChange={setEditMarketingMaterials}
                  disabled={editSaving || editUploading}
                />

                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={() => void saveFullSettings(product)}
                    disabled={editSaving || editUploading}
                    className="flex-1 min-h-[50px] rounded-2xl bg-slate-950 text-white font-black inline-flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {editSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    {editSaving ? 'Saving…' : 'Save full product settings'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditingId(null); setEditDraft(null); setEditMarketingMaterials([]); }}
                    className="min-h-[50px] rounded-2xl border border-gray-200 bg-white px-5 font-bold text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
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
