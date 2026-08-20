import { useState, useRef, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera,
  Package,
  DollarSign,
  Percent,
  Tag,
  FileText,
  Send,
  XCircle,
  CheckCircle,
  AlertCircle,
  Gift,
  ShieldAlert,
  Loader2,
  ChevronDown,
  Users,
  Info,
  ChevronLeft,
  ChevronRight,
  Download,
  Link2,
  Video,
  Plus,
  Trash2,
  Star,
  Sparkles,
  Layers,
  ImageIcon,
  ExternalLink,
  Award,
  Save,
  Cloud,
  CloudOff,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  fetchSystemConfig,
  calculatePricing,
  getTaskPercentForTier,
  ALL_TIERS,
  type SalesTeamTier,
  type SystemConfig,
} from '../lib/pricing';
import PostUploadConfirmation, { type UploadType } from '../components/PostUploadConfirmation';
import ProductOptimizationCard from '../components/ProductOptimizationCard';
import AIGenerateButton from '../components/ai/AIGenerateButton';
import AIImageAnalyzer from '../components/ai/AIImageAnalyzer';
import {
  saveDraft, generateDraftId,
  getLocalDrafts, markDraftPublished, removeLocalDraft,
  type DraftData,
} from '../lib/drafts';

type ProductType = 'DIGITAL' | 'SERVICE' | 'COURSE';

const CATEGORIES = [
  'General', 'Electronics', 'Fashion', 'Health & Beauty', 'Home & Garden',
  'Food & Beverage', 'Sports & Fitness', 'Books & Media', 'Toys & Games',
  'Software & Digital', 'Design', 'Consulting', 'Writing', 'Development',
  'Marketing', 'Education', 'Business', 'Jobs', 'Services',
];

const SERVICE_CATEGORIES = [
  'Writing', 'Design', 'Consulting', 'Development', 'Marketing',
  'Education', 'Business', 'Proofreading', 'Therapy', 'Other',
];

const FILE_FORMATS = ['PDF', 'ZIP', 'VIDEO', 'NOTION_TEMPLATE', 'AUDIO', 'IMAGE', 'DOCX', 'PSD', 'AI', 'OTHER'];

const DELIVERY_TYPES = [
  { value: 'INSTANT_DOWNLOAD', label: 'Instant Download', icon: Download },
  { value: 'LINK_ACCESS', label: 'Link Access', icon: Link2 },
  { value: 'EMAIL_DELIVERY', label: 'Email Delivery', icon: Send },
];

interface TierData {
  tier_name: 'BASIC' | 'STANDARD' | 'PREMIUM';
  tier_number: number;
  title: string;
  description: string;
  price: string;
  delivery_days: string;
  features: string[];
  word_count: string;
  revision_count: string;
  is_most_popular: boolean;
}

interface CustomizationData {
  option_name: string;
  option_type: string;
  additional_price: string;
  additional_days: string;
  description: string;
  is_required: boolean;
}

const initialTier = (name: 'BASIC' | 'STANDARD' | 'PREMIUM', num: number): TierData => ({
  tier_name: name,
  tier_number: num,
  title: '',
  description: '',
  price: '',
  delivery_days: '7',
  features: [''],
  word_count: '',
  revision_count: '1',
  is_most_popular: name === 'STANDARD',
});

const initialCustomization: CustomizationData = {
  option_name: '',
  option_type: 'EXTRA_FAST_DELIVERY',
  additional_price: '',
  additional_days: '',
  description: '',
  is_required: false,
};

interface FormData {
  name: string;
  description: string;
  price: string;
  category: string;
  stock: string;
}

const initialForm: FormData = {
  name: '', description: '', price: '', category: 'General', stock: '',
};

export default function UploadProductPage() {
  const { user, isAccountLocked, isAccountBanned } = useAuth();
  const location = useLocation();
  const [form, setForm] = useState<FormData>(initialForm);
  const [productType, setProductType] = useState<ProductType>('DIGITAL');
  const [step, setStep] = useState(1);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [uploadedItem, setUploadedItem] = useState<{ id: string; type: UploadType } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pricing & Sales Team state
  const [isFree, setIsFree] = useState(false);
  const [adminTaskAgreed, setAdminTaskAgreed] = useState(false);
  const [selectedTier, setSelectedTier] = useState<SalesTeamTier | null>(null);
  const [affiliateCommission, setAffiliateCommission] = useState('10');
  const [systemConfig, setSystemConfig] = useState<SystemConfig | null>(null);

  // Digital/Course state
  const [deliveryType, setDeliveryType] = useState('INSTANT_DOWNLOAD');
  const [downloadFileUrl, setDownloadFileUrl] = useState('');
  const [accessLink, setAccessLink] = useState('');
  const [fileFormat, setFileFormat] = useState('PDF');
  const [downloadLimit, setDownloadLimit] = useState('5');
  const [expiryDays, setExpiryDays] = useState('30');
  const [includesBonus, setIncludesBonus] = useState(false);
  const [demoVideoUrl, setDemoVideoUrl] = useState('');

  // DRIGHT Sales Team toggle (SERVICE only)
  const [hasDrightSalesTeam, setHasDrightSalesTeam] = useState(false);

  // Portfolio state (optional, SERVICE only)
  const portfolioFileInputRef = useRef<HTMLInputElement>(null);
  const [portfolioFiles, setPortfolioFiles] = useState<Array<{ file: File; type: 'IMAGE' | 'VIDEO' | 'PDF'; preview?: string }>>([]);
  const [portfolioLinks, setPortfolioLinks] = useState<Array<{ platform: string; url: string }>>([
  ]);
  const [showAddLink, setShowAddLink] = useState(false);
  const [newLinkPlatform, setNewLinkPlatform] = useState('Behance');
  const [newLinkUrl, setNewLinkUrl] = useState('');

  // Service state
  const [serviceCategory, setServiceCategory] = useState('Writing');
  const [serviceDeliveryDays, setServiceDeliveryDays] = useState('7');
  const [requiresConsultation, setRequiresConsultation] = useState(false);
  const [tiers, setTiers] = useState<TierData[]>([
    initialTier('BASIC', 1),
    initialTier('STANDARD', 2),
    initialTier('PREMIUM', 3),
  ]);
  const [customizations, setCustomizations] = useState<CustomizationData[]>([]);

  // Draft state
  const [draftId, setDraftId] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSyncStatus, setDraftSyncStatus] = useState<'idle' | 'synced' | 'offline' | 'syncing'>('idle');
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const autoPublishRef = useRef(false);

  useEffect(() => {
    fetchSystemConfig().then(setSystemConfig);
  }, []);

  // Load draft on mount if draftId passed via navigation state
  useEffect(() => {
    const navState = location.state as { draftId?: string; publish?: boolean } | null;
    if (navState?.draftId) {
      const localDrafts = getLocalDrafts();
      const draft = localDrafts.find(d => d.id === navState.draftId);
      if (draft) {
        setDraftId(draft.id);
        const d = draft.draft_data;
        setForm({ name: d.name, description: d.description, price: d.price, category: d.category, stock: d.stock });
        if (d.affiliateCommission) setAffiliateCommission(d.affiliateCommission);
        setProductType(d.productType as ProductType);
        setStep(d.step);
        setIsFree(d.isFree);
        setAdminTaskAgreed(d.adminTaskAgreed);
        setSelectedTier(d.selectedTier as SalesTeamTier | null);
        setAffiliateCommission(d.affiliateCommission);
        setDeliveryType(d.deliveryType);
        setDownloadFileUrl(d.downloadFileUrl);
        setAccessLink(d.accessLink);
        setFileFormat(d.fileFormat);
        setDownloadLimit(d.downloadLimit);
        setExpiryDays(d.expiryDays);
        setIncludesBonus(d.includesBonus);
        setDemoVideoUrl(d.demoVideoUrl);
        setServiceCategory(d.serviceCategory);
        setServiceDeliveryDays(d.serviceDeliveryDays);
        setRequiresConsultation(d.requiresConsultation);
        setHasDrightSalesTeam(d.hasDrightSalesTeam);
        setPortfolioLinks(d.portfolioLinks);
        if (d.imagePreviews && d.imagePreviews.length > 0) {
          setImagePreviews(d.imagePreviews);
        }
        if (navState.publish) {
          autoPublishRef.current = true;
        }
      }
    }
  }, [location.state]);

  const adminTaskPercent = systemConfig?.admin_task_percent ?? 15;
  const salesTeamTaskPercent = selectedTier && systemConfig
    ? getTaskPercentForTier(selectedTier, systemConfig) : 0;
  const basePrice = isFree ? 0 : (parseFloat(form.price) || 0);
  const affiliatePct = parseFloat(affiliateCommission) || 0;
  const pricing = calculatePricing(basePrice, affiliatePct, adminTaskPercent, salesTeamTaskPercent);

  const isDigitalType = productType === 'DIGITAL' || productType === 'COURSE';
  const isServiceType = productType === 'SERVICE';
  const totalSteps = isDigitalType ? 3 : isServiceType ? 3 : 2;

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const newFiles: File[] = [];
    const newPreviews: string[] = [];
    for (const file of Array.from(files)) {
      if (file.size > 8 * 1024 * 1024) { setError('Each image must be under 8MB'); return; }
      if (!file.type.startsWith('image/')) { setError('Please select image files only'); return; }
      newFiles.push(file);
      const reader = new FileReader();
      reader.onload = (ev) => {
        newPreviews.push(ev.target?.result as string);
        if (newPreviews.length === newFiles.length) {
          setImagePreviews(prev => [...prev, ...newPreviews]);
        }
      };
      reader.readAsDataURL(file);
    }
    setImageFiles(prev => [...prev, ...newFiles]);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = (idx: number) => {
    setImageFiles(prev => prev.filter((_, i) => i !== idx));
    setImagePreviews(prev => prev.filter((_, i) => i !== idx));
  };

  const clearImages = () => {
    setImageFiles([]);
    setImagePreviews([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePortfolioFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      if (file.size > 20 * 1024 * 1024) { setError('Portfolio files must be under 20MB'); return; }
      let type: 'IMAGE' | 'VIDEO' | 'PDF' = 'IMAGE';
      if (file.type.startsWith('video/')) type = 'VIDEO';
      else if (file.type === 'application/pdf') type = 'PDF';
      else if (!file.type.startsWith('image/')) { setError('Supported: images, videos, PDFs'); return; }

      const entry: { file: File; type: 'IMAGE' | 'VIDEO' | 'PDF'; preview?: string } = { file, type };
      if (type === 'IMAGE') {
        const reader = new FileReader();
        reader.onload = (ev) => {
          setPortfolioFiles(prev => [...prev, { ...entry, preview: ev.target?.result as string }]);
        };
        reader.readAsDataURL(file);
      } else {
        setPortfolioFiles(prev => [...prev, entry]);
      }
    }
    if (portfolioFileInputRef.current) portfolioFileInputRef.current.value = '';
  };

  const removePortfolioFile = (idx: number) => {
    setPortfolioFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const addPortfolioLink = () => {
    if (!newLinkUrl.trim()) return;
    setPortfolioLinks(prev => [...prev, { platform: newLinkPlatform, url: newLinkUrl.trim() }]);
    setNewLinkUrl('');
    setShowAddLink(false);
  };

  const removePortfolioLink = (idx: number) => {
    setPortfolioLinks(prev => prev.filter((_, i) => i !== idx));
  };

  const updateTier = (idx: number, patch: Partial<TierData>) => {
    setTiers(prev => prev.map((t, i) => i === idx ? { ...t, ...patch } : t));
  };

  const addCustomization = () => {
    setCustomizations(prev => [...prev, { ...initialCustomization }]);
  };

  const updateCustomization = (idx: number, patch: Partial<CustomizationData>) => {
    setCustomizations(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c));
  };

  const removeCustomization = (idx: number) => {
    setCustomizations(prev => prev.filter((_, i) => i !== idx));
  };

  const validateStep = (): boolean => {
    setError(null);
    if (step === 1) {
      if (!form.name.trim()) { setError('Product name is required'); return false; }
      if (imageFiles.length === 0) { setError('At least one product image is required'); return false; }
      if (isServiceType && !isFree) {
        // Service products use tiers for pricing, base price can be 0
      } else if (!isFree) {
        const price = parseFloat(form.price);
        if (isNaN(price) || price <= 0) { setError('Enter a valid price'); return false; }
      }
    }
    if (step === 2 && isServiceType) {
      for (const tier of tiers) {
        if (!tier.title.trim()) { setError(`Tier ${tier.tier_name} needs a title`); return false; }
        const tp = parseFloat(tier.price);
        if (isNaN(tp) || tp < 0) { setError(`Tier ${tier.tier_name} needs a valid price`); return false; }
      }
    }
    return true;
  };

  const nextStep = () => {
    if (!validateStep()) return;
    setStep(s => Math.min(s + 1, totalSteps));
  };

  const prevStep = () => setStep(s => Math.max(s - 1, 1));

  const handleSaveDraft = async () => {
    if (!user) return;
    setSavingDraft(true);
    setDraftSyncStatus('syncing');

    const id = draftId || generateDraftId();
    if (!draftId) setDraftId(id);

    const draftData: DraftData = {
      name: form.name, description: form.description, price: form.price,
      category: form.category, stock: form.stock,
      productType, step, isFree, adminTaskAgreed, selectedTier, affiliateCommission,
      deliveryType, downloadFileUrl, accessLink, fileFormat, downloadLimit, expiryDays,
      includesBonus, demoVideoUrl, serviceCategory, serviceDeliveryDays, requiresConsultation,
      hasDrightSalesTeam, tiers: tiers as unknown as Record<string, unknown>[], customizations: customizations as unknown as Record<string, unknown>[], portfolioLinks, imagePreviews,
    };

    const draftName = form.name || `Draft ${new Date().toLocaleDateString()}`;

    const { syncStatus, updated_at } = await saveDraft(id, draftName, draftData, user.id);
    setDraftSyncStatus(syncStatus);
    setDraftSavedAt(updated_at);
    setSavingDraft(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep()) return;

    const price = parseFloat(form.price);
    const commissionRate = parseFloat(affiliateCommission);

    if (!adminTaskAgreed && !isFree) {
      setError('You must agree to the Admin Task to upload a product'); return;
    }
    if (imageFiles.length === 0) {
      setError('At least one product image is required'); return;
    }
    if (isAccountLocked || isAccountBanned) {
      setError('Your account is restricted. You cannot upload products.'); return;
    }

    const stockNum = form.stock ? parseInt(form.stock) : null;
    if (stockNum !== null && (isNaN(stockNum) || stockNum < 0)) {
      setError('Stock quantity must be a non-negative number'); return;
    }

    setSubmitting(true);
    try {
      const imageUrls: string[] = [];
      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        const ext = file.name.split('.').pop();
        const path = `${user?.id}/${Date.now()}_${i}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from('product-images').upload(path, file, { upsert: false });
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(path);
        imageUrls.push(urlData.publicUrl);
      }
      const imageUrl = imageUrls[0] || null;

      const { data: productData, error: insertErr } = await supabase.from('products').insert({
        uploaded_by: user?.id,
        name: form.name.trim(),
        description: form.description.trim() || null,
        price: isFree ? 0 : (isServiceType ? 0 : price),
        commission_rate: isFree ? 0 : commissionRate,
        image_url: imageUrl,
        category: form.category,
        admin_task_percent: isFree ? 0 : adminTaskPercent,
        sales_team_task_percent: isFree ? 0 : salesTeamTaskPercent,
        affiliate_commission_percent: isFree ? 0 : (parseFloat(affiliateCommission) || 0),
        sales_team_tier: isFree ? null : selectedTier,
        is_free: isFree,
        stock_quantity: stockNum,
        initial_stock: stockNum,
        product_type: productType,
        demo_video_url: demoVideoUrl || null,
        has_dright_sales_team: isServiceType ? hasDrightSalesTeam : false,
      }).select('id').single();

      if (insertErr) throw insertErr;
      const productId = productData.id;

      // Insert all product images into product_images table
      if (imageUrls.length > 0) {
        const imageRows = imageUrls.map((url, idx) => ({
          product_id: productId,
          image_url: url,
          position: idx,
        }));
        const { error: imagesErr } = await supabase.from('product_images').insert(imageRows);
        if (imagesErr) console.error('Error saving product images:', imagesErr);
      }

      if (isDigitalType) {
        const { error: digitalErr } = await supabase.from('digital_product_details').insert({
          product_id: productId,
          delivery_type: deliveryType,
          download_file_url: downloadFileUrl || null,
          access_link: accessLink || null,
          file_format: fileFormat,
          download_limit: downloadLimit ? parseInt(downloadLimit) : null,
          expiry_days: parseInt(expiryDays) || 30,
          includes_bonus_materials: includesBonus,
        });
        if (digitalErr) throw digitalErr;
      }

      if (isServiceType) {
        const { error: svcErr } = await supabase.from('service_product_details').insert({
          product_id: productId,
          service_category: serviceCategory,
          delivery_time_days: parseInt(serviceDeliveryDays) || 7,
          requires_consultation: requiresConsultation,
          is_customizable: customizations.length > 0,
          revision_count: parseInt(tiers[0]?.revision_count || '1'),
        });
        if (svcErr) throw svcErr;

        for (const tier of tiers) {
          const cleanFeatures = tier.features.filter(f => f.trim());
          const { error: tierErr } = await supabase.from('service_tiers').insert({
            product_id: productId,
            tier_name: tier.tier_name,
            tier_number: tier.tier_number,
            title: tier.title.trim(),
            description: tier.description.trim() || null,
            price: parseFloat(tier.price) || 0,
            delivery_days: parseInt(tier.delivery_days) || 7,
            features: cleanFeatures,
            word_count: tier.word_count ? parseInt(tier.word_count) : null,
            revision_count: parseInt(tier.revision_count) || 1,
            is_most_popular: tier.is_most_popular,
            sort_order: tier.tier_number,
          });
          if (tierErr) throw tierErr;
        }

        for (const cust of customizations) {
          if (!cust.option_name.trim()) continue;
          const { error: custErr } = await supabase.from('customization_options').insert({
            product_id: productId,
            option_name: cust.option_name.trim(),
            option_type: cust.option_type,
            description: cust.description.trim() || null,
            additional_price: parseFloat(cust.additional_price) || 0,
            additional_days: parseInt(cust.additional_days) || 0,
            is_required: cust.is_required,
          });
          if (custErr) throw custErr;
        }
      }

      // Save portfolio items (SERVICE only, optional)
      if (isServiceType && (portfolioFiles.length > 0 || portfolioLinks.length > 0)) {
        let position = 0;
        for (const pf of portfolioFiles) {
          const ext = pf.file.name.split('.').pop();
          const storagePath = `${user?.id}/${productId}/${Date.now()}_${position}.${ext}`;
          const { error: pfErr } = await supabase.storage
            .from('seller-portfolio')
            .upload(storagePath, pf.file, { upsert: false });
          if (!pfErr) {
            const { data: urlData } = supabase.storage.from('seller-portfolio').getPublicUrl(storagePath);
            await supabase.from('portfolio_items').insert({
              product_id: productId,
              seller_id: user?.id,
              item_type: pf.type,
              file_url: urlData.publicUrl,
              position,
            });
            position++;
          }
        }
        for (const link of portfolioLinks) {
          await supabase.from('portfolio_items').insert({
            product_id: productId,
            seller_id: user?.id,
            item_type: 'LINK',
            external_url: link.url,
            link_platform: link.platform,
            position,
          });
          position++;
        }
        // Reset portfolio state
        setPortfolioFiles([]);
        setPortfolioLinks([]);
      }

      // Mark draft as published if this was a draft
      if (draftId) {
        await markDraftPublished(draftId);
        removeLocalDraft(draftId);
        setDraftId(null);
      }

      setSuccess(true);
      setUploadedItem({ id: productId, type: productType as UploadType });
      setForm(initialForm);
      clearImages();
      setStep(1);
      setProductType('DIGITAL');
      setHasDrightSalesTeam(false);
      setTimeout(() => setSuccess(false), 3500);
    } catch (err) {
      console.error('Upload error:', err);
      setError('Failed to upload product. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      {(isAccountLocked || isAccountBanned) && (
        <div className={`rounded-2xl p-4 mb-6 flex items-center gap-3 ${isAccountBanned ? 'bg-error-muted border border-error/20' : 'bg-warning-muted border border-warning/20'}`}>
          <ShieldAlert className={`w-5 h-5 ${isAccountBanned ? 'text-error' : 'text-warning'}`} />
          <p className={`text-sm font-medium ${isAccountBanned ? 'text-error' : 'text-warning'}`}>
            {isAccountBanned ? 'Your account is BANNED. Product uploads are disabled.' : 'Your account is LOCKED. Product uploads are temporarily disabled.'}
          </p>
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Post an Ad</h1>
        <p className="text-gray-500 mt-1">Add a product, service, or course to the marketplace</p>
      </div>

      <AnimatePresence>
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
            className="flex items-center gap-3 bg-success-muted border border-success/20 text-success rounded-2xl p-4 mb-6"
          >
            <CheckCircle className="w-5 h-5 shrink-0" />
            <span className="font-medium">Product uploaded! It's now pending admin approval.</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Step Indicator */}
      <div className="flex items-center gap-2 mb-6">
        {Array.from({ length: totalSteps }, (_, i) => (
          <div key={i} className="flex items-center flex-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
              step > i + 1 ? 'bg-success text-white' : step === i + 1 ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-500'
            }`}>
              {step > i + 1 ? <CheckCircle className="w-4 h-4" /> : i + 1}
            </div>
            {i < totalSteps - 1 && (
              <div className={`flex-1 h-1 rounded-full mx-2 ${step > i + 1 ? 'bg-success' : 'bg-gray-200'}`} />
            )}
          </div>
        ))}
      </div>

      <motion.form
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        onSubmit={handleSubmit} className="space-y-6"
      >
        {error && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 bg-error-muted text-error rounded-2xl p-4">
            <AlertCircle className="w-5 h-5 shrink-0" />{error}
          </motion.div>
        )}

        {/* STEP 1: Basic Info & Type */}
        {step === 1 && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
            {/* Product Type Selector */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Layers className="w-5 h-5 text-primary-600" />Product Type
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {([
                  { value: 'DIGITAL', label: 'Digital', icon: Download },
                  { value: 'SERVICE', label: 'Service', icon: Sparkles },
                  { value: 'COURSE', label: 'Course', icon: Video },
                ] as const).map(({ value, label, icon: Icon }) => (
                  <button key={value} type="button" onClick={() => setProductType(value)}
                    className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 min-h-[80px] ${
                      productType === value ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600 hover:border-primary-300'
                    }`}>
                    <Icon className="w-6 h-6" />
                    <span className="text-sm font-medium">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Image Upload */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Camera className="w-5 h-5 text-primary-600" />Product Images
                <span className="text-xs text-error font-normal ml-1">* At least 1 required</span>
              </h2>
              <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageSelect} className="hidden" />

              {imagePreviews.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                  {imagePreviews.map((preview, idx) => (
                    <div key={idx} className="relative group">
                      <img src={preview} alt={`Preview ${idx + 1}`} className="w-full h-28 object-cover rounded-xl border border-gray-200" />
                      <button type="button" onClick={() => removeImage(idx)}
                        className="absolute top-2 right-2 p-1.5 bg-white/90 backdrop-blur rounded-full shadow-sm hover:bg-white transition-colors">
                        <XCircle className="w-4 h-4 text-error" />
                      </button>
                      {idx === 0 && (
                        <span className="absolute bottom-2 left-2 text-xs font-medium px-1.5 py-0.5 bg-primary-600 text-white rounded">Main</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="w-full h-32 border-2 border-dashed border-gray-300 hover:border-primary-400 hover:bg-primary-50 rounded-xl flex flex-col items-center justify-center gap-2 transition-all">
                <div className="p-2.5 bg-primary-100 rounded-2xl"><Camera className="w-6 h-6 text-primary-600" /></div>
                <div className="text-center"><p className="font-medium text-gray-700">Tap to upload images</p><p className="text-sm text-gray-400 mt-0.5">JPG, PNG, WebP — max 8MB each</p></div>
              </button>
            </div>

            {/* Product Details */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2"><Package className="w-5 h-5 text-primary-600" />Product Details</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Product Name <span className="text-error">*</span></label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Wireless Noise-Cancelling Headphones" required
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all text-gray-900" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2"><FileText className="w-4 h-4" />Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Describe the product, its features, and what makes it great..." rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all text-gray-900 resize-none" />
                <div className="flex flex-wrap items-center gap-3 mt-1.5">
                  <AIGenerateButton type="description" productName={form.name} category={form.category} description={form.description} onApply={(v) => setForm({ ...form, description: v })} />
                  <AIGenerateButton type="title" productName={form.name} category={form.category} onApply={(v) => setForm({ ...form, name: v })} />
                  <AIGenerateButton type="category" productName={form.name} description={form.description} onApply={(v) => setForm({ ...form, category: v })} />
                  <AIImageAnalyzer userId={user!.id} onApplyTitle={(v: string) => setForm({ ...form, name: v })} onApplyDescription={(v: string) => setForm({ ...form, description: v })} onApplyCategory={(v: string) => setForm({ ...form, category: v })} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2"><Tag className="w-4 h-4" />Category</label>
                <div className="relative">
                  <button type="button" onClick={() => setShowCategories(!showCategories)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all text-gray-900 bg-white text-left flex items-center justify-between">
                    <span>{form.category}</span>
                    <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${showCategories ? 'rotate-180' : ''}`} />
                  </button>
                  <AnimatePresence>
                    {showCategories && (
                      <motion.div initial={{ opacity: 0, y: -8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.97 }}
                        className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-lg border border-gray-100 z-20 overflow-hidden max-h-60 overflow-y-auto">
                        {CATEGORIES.map((cat) => (
                          <button key={cat} type="button" onClick={() => { setForm({ ...form, category: cat }); setShowCategories(false); }}
                            className={`w-full text-left px-4 py-3 hover:bg-primary-50 transition-colors text-sm ${form.category === cat ? 'text-primary-600 font-semibold bg-primary-50' : 'text-gray-700'}`}>{cat}</button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
              {!isServiceType && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Product Price (USD) {isFree ? '' : <span className="text-error">*</span>}</label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input type="number" min="0" step="0.01" value={isFree ? '0' : form.price}
                        onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="0.00" disabled={isFree}
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all text-gray-900 disabled:bg-gray-100 disabled:text-gray-400" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Stock Quantity (optional)</label>
                    <div className="relative">
                      <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input type="number" min="0" step="1" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })}
                        placeholder="Leave empty = unlimited"
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all text-gray-900" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Free Product Toggle */}
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-success-muted to-green-50 rounded-xl border border-success/20">
              <div className="flex items-center gap-3">
                <Gift className="w-5 h-5 text-success" />
                <div><p className="text-sm font-semibold text-gray-900">Free Product</p><p className="text-xs text-gray-500">Price = $0. Sales still count toward weekly streaks.</p></div>
              </div>
              <button type="button" onClick={() => setIsFree(!isFree)}
                className={`relative w-12 h-7 rounded-full transition-colors ${isFree ? 'bg-success' : 'bg-gray-300'}`}>
                <span className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ${isFree ? 'translate-x-5' : ''}`} />
              </button>
            </div>

            {/* Portfolio Upload Section (SERVICE only, optional) */}
            {isServiceType && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                    <Award className="w-5 h-5 text-primary-600" />
                    Show Previous Work
                    <span className="text-xs font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Optional</span>
                  </h2>
                </div>
                <p className="text-sm text-gray-500">Upload images, videos, or PDFs of your previous work. Buyers with portfolio items get a "Portfolio Available" badge on their service listing.</p>

                {/* Hidden file input */}
                <input
                  ref={portfolioFileInputRef}
                  type="file"
                  accept="image/*,video/*,application/pdf"
                  multiple
                  onChange={handlePortfolioFileSelect}
                  className="hidden"
                />

                {/* Portfolio file previews */}
                {portfolioFiles.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {portfolioFiles.map((pf, idx) => (
                      <div key={idx} className="relative group rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                        {pf.type === 'IMAGE' && pf.preview ? (
                          <img src={pf.preview} alt="" className="w-full h-24 object-cover" />
                        ) : (
                          <div className={`w-full h-24 flex flex-col items-center justify-center gap-1 ${
                            pf.type === 'VIDEO' ? 'bg-red-50' : 'bg-orange-50'
                          }`}>
                            {pf.type === 'VIDEO' ? (
                              <Video className="w-8 h-8 text-red-400" />
                            ) : (
                              <FileText className="w-8 h-8 text-orange-400" />
                            )}
                            <span className="text-xs text-gray-500 px-1 truncate max-w-full">{pf.file.name}</span>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => removePortfolioFile(idx)}
                          className="absolute top-1 right-1 p-1 bg-white/90 rounded-full shadow hover:bg-white"
                        >
                          <XCircle className="w-4 h-4 text-error" />
                        </button>
                        <div className="absolute bottom-1 left-1">
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded text-white ${
                            pf.type === 'IMAGE' ? 'bg-blue-500' : pf.type === 'VIDEO' ? 'bg-red-500' : 'bg-orange-500'
                          }`}>{pf.type}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload area */}
                <button
                  type="button"
                  onClick={() => portfolioFileInputRef.current?.click()}
                  className="w-full h-24 border-2 border-dashed border-gray-300 hover:border-primary-400 hover:bg-primary-50 rounded-xl flex flex-col items-center justify-center gap-2 transition-all"
                >
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-gray-400" />
                    <Video className="w-5 h-5 text-gray-400" />
                    <FileText className="w-5 h-5 text-gray-400" />
                  </div>
                  <p className="text-sm text-gray-500">Upload images, videos, or PDFs (max 20MB each)</p>
                </button>

                {/* External Portfolio Links */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-700 flex items-center gap-2">
                      <ExternalLink className="w-4 h-4 text-gray-400" />External Portfolio Links
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowAddLink(v => !v)}
                      className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1 font-medium"
                    >
                      <Plus className="w-3.5 h-3.5" />Add Link
                    </button>
                  </div>

                  <AnimatePresence>
                    {showAddLink && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                        className="bg-gray-50 rounded-xl p-4 space-y-3 overflow-hidden"
                      >
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Platform</label>
                            <select
                              value={newLinkPlatform}
                              onChange={e => setNewLinkPlatform(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white outline-none focus:border-primary-500"
                            >
                              {['Behance', 'Dribbble', 'YouTube', 'TikTok', 'Instagram', 'Google Drive', 'Dropbox', 'Website', 'Upwork', 'Fiverr'].map(p => (
                                <option key={p} value={p}>{p}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">URL</label>
                            <input
                              type="url"
                              value={newLinkUrl}
                              onChange={e => setNewLinkUrl(e.target.value)}
                              placeholder="https://..."
                              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-primary-500"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button type="button" onClick={addPortfolioLink}
                            className="flex-1 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors">
                            Add Link
                          </button>
                          <button type="button" onClick={() => setShowAddLink(false)}
                            className="px-4 py-2 border border-gray-200 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                            Cancel
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {portfolioLinks.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {portfolioLinks.map((link, idx) => (
                        <div key={idx} className="flex items-center gap-2 px-3 py-1.5 bg-primary-50 rounded-xl border border-primary-200">
                          <span className="text-sm font-medium text-primary-700">{link.platform}</span>
                          <button type="button" onClick={() => removePortfolioLink(idx)} className="text-primary-400 hover:text-error">
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {portfolioFiles.length === 0 && portfolioLinks.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-2">
                      Portfolio is optional — you can publish your service without adding any work samples.
                    </p>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* STEP 2A: Digital/Course Details */}
        {step === 2 && isDigitalType && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                {productType === 'COURSE' ? <Video className="w-5 h-5 text-primary-600" /> : <Download className="w-5 h-5 text-primary-600" />}
                {productType === 'COURSE' ? 'Course Details' : 'Digital Product Details'}
              </h2>

              {/* Delivery Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Delivery Type</label>
                <div className="grid grid-cols-3 gap-3">
                  {DELIVERY_TYPES.map(dt => {
                    const Icon = dt.icon;
                    return (
                      <button key={dt.value} type="button" onClick={() => setDeliveryType(dt.value)}
                        className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                          deliveryType === dt.value ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600 hover:border-primary-300'
                        }`}>
                        <Icon className="w-5 h-5" /><span className="text-xs font-medium text-center">{dt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Demo Video URL */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2"><Video className="w-4 h-4" />Demo Video URL (optional)</label>
                <input type="url" value={demoVideoUrl} onChange={(e) => setDemoVideoUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=... or vimeo.com/..."
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all text-gray-900" />
                <div className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
                  <Video className="w-3 h-3" />
                  Supported: YouTube, Vimeo, TikTok, Twitter/X, Facebook, Twitch, Loom, Dailymotion, or direct .mp4/.webm links
                </div>
              </div>

              {/* File URL or Access Link */}
              {deliveryType === 'INSTANT_DOWNLOAD' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2"><Download className="w-4 h-4" />Download File URL (S3 key or storage path)</label>
                  <input type="text" value={downloadFileUrl} onChange={(e) => setDownloadFileUrl(e.target.value)}
                    placeholder="products/files/uuid-my-ebook.pdf"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all text-gray-900" />
                </div>
              )}
              {(deliveryType === 'LINK_ACCESS' || productType === 'COURSE') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2"><Link2 className="w-4 h-4" />Access Link (for course/membership)</label>
                  <input type="url" value={accessLink} onChange={(e) => setAccessLink(e.target.value)}
                    placeholder="https://learn-platform.com/course/..."
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all text-gray-900" />
                </div>
              )}

              {/* File Format + Download Limit + Expiry */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">File Format</label>
                  <select value={fileFormat} onChange={(e) => setFileFormat(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none bg-white">
                    {FILE_FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Download Limit</label>
                  <input type="number" min="1" value={downloadLimit} onChange={(e) => setDownloadLimit(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none text-gray-900" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Expiry (days)</label>
                  <input type="number" min="1" value={expiryDays} onChange={(e) => setExpiryDays(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none text-gray-900" />
                </div>
              </div>

              {/* Bonus Materials */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={includesBonus} onChange={(e) => setIncludesBonus(e.target.checked)}
                  className="w-5 h-5 rounded border-2 border-gray-300 text-primary-600 focus:ring-primary-500" />
                <div><p className="text-sm font-medium text-gray-900">Includes bonus materials</p><p className="text-xs text-gray-500">Extra templates, checklists, or supplementary files</p></div>
              </label>
            </div>
          </motion.div>
        )}

        {/* STEP 2B: Service Details */}
        {step === 2 && isServiceType && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
            {/* Service Config */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary-600" />
                Service Configuration
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Service Category
                  </label>
                  <select value={serviceCategory} onChange={(e) => setServiceCategory(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none bg-white">
                    {SERVICE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Default Delivery (days)</label>
                  <input type="number" min="1" value={serviceDeliveryDays} onChange={(e) => setServiceDeliveryDays(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none text-gray-900" />
                </div>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={requiresConsultation} onChange={(e) => setRequiresConsultation(e.target.checked)}
                  className="w-5 h-5 rounded border-2 border-gray-300 text-primary-600 focus:ring-primary-500" />
                <p className="text-sm font-medium text-gray-900">Requires consultation before purchase</p>
              </label>
            </div>

            {/* Tier Builder */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2"><Layers className="w-5 h-5 text-primary-600" />Service Tiers</h2>
              {tiers.map((tier, idx) => (
                <div key={idx} className={`rounded-xl border-2 p-4 transition-colors ${tier.is_most_popular ? 'border-primary-300 bg-primary-50/30' : 'border-gray-200'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-semibold text-gray-900 flex items-center gap-2">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${tier.is_most_popular ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-600'}`}>{tier.tier_number}</span>
                      {tier.tier_name}
                    </span>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={tier.is_most_popular} onChange={() => setTiers(prev => prev.map((t, i) => ({ ...t, is_most_popular: i === idx })))}
                        className="w-4 h-4 rounded border-2 border-gray-300 text-primary-600" />
                      <span className="text-xs text-gray-600 flex items-center gap-1"><Star className="w-3 h-3" />Most Popular</span>
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <input type="text" value={tier.title} onChange={(e) => updateTier(idx, { title: e.target.value })}
                      placeholder="Tier title (e.g. Basic Article)" className="px-3 py-2 rounded-lg border border-gray-200 focus:border-primary-500 outline-none text-sm text-gray-900" />
                    <input type="number" min="0" step="0.01" value={tier.price} onChange={(e) => updateTier(idx, { price: e.target.value })}
                      placeholder="Price $" className="px-3 py-2 rounded-lg border border-gray-200 focus:border-primary-500 outline-none text-sm text-gray-900" />
                    <input type="number" min="1" value={tier.delivery_days} onChange={(e) => updateTier(idx, { delivery_days: e.target.value })}
                      placeholder="Delivery days" className="px-3 py-2 rounded-lg border border-gray-200 focus:border-primary-500 outline-none text-sm text-gray-900" />
                    <input type="number" min="0" value={tier.revision_count} onChange={(e) => updateTier(idx, { revision_count: e.target.value })}
                      placeholder="Revisions" className="px-3 py-2 rounded-lg border border-gray-200 focus:border-primary-500 outline-none text-sm text-gray-900" />
                    {serviceCategory === 'Writing' || serviceCategory === 'Proofreading' ? (
                      <input type="number" min="0" value={tier.word_count} onChange={(e) => updateTier(idx, { word_count: e.target.value })}
                        placeholder="Word count" className="px-3 py-2 rounded-lg border border-gray-200 focus:border-primary-500 outline-none text-sm text-gray-900" />
                    ) : null}
                  </div>
                  <textarea value={tier.description} onChange={(e) => updateTier(idx, { description: e.target.value })}
                    placeholder="Tier description..." rows={1}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-primary-500 outline-none text-sm text-gray-900 resize-none mb-3" />
                  <div className="space-y-2">
                    {tier.features.map((feat, fi) => (
                      <div key={fi} className="flex items-center gap-2">
                        <input type="text" value={feat} onChange={(e) => {
                          const newFeatures = [...tier.features]; newFeatures[fi] = e.target.value; updateTier(idx, { features: newFeatures });
                        }} placeholder={`Feature ${fi + 1}`}
                          className="flex-1 px-3 py-2 rounded-lg border border-gray-200 focus:border-primary-500 outline-none text-sm text-gray-900" />
                        {tier.features.length > 1 && (
                          <button type="button" onClick={() => updateTier(idx, { features: tier.features.filter((_, i) => i !== fi) })}
                            className="p-1.5 text-gray-400 hover:text-error"><Trash2 className="w-4 h-4" /></button>
                        )}
                      </div>
                    ))}
                    <button type="button" onClick={() => updateTier(idx, { features: [...tier.features, ''] })}
                      className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"><Plus className="w-3 h-3" />Add feature</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Customization Options */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2"><Plus className="w-5 h-5 text-primary-600" />Customization Options</h2>
                <button type="button" onClick={addCustomization}
                  className="px-3 py-2 bg-primary-50 text-primary-700 rounded-lg text-sm font-medium hover:bg-primary-100 flex items-center gap-1">
                  <Plus className="w-4 h-4" />Add Option
                </button>
              </div>
              {customizations.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No customization options added. Buyers will see the base tiers only.</p>
              )}
              {customizations.map((cust, idx) => (
                <div key={idx} className="rounded-xl border border-gray-200 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">Option {idx + 1}</span>
                    <button type="button" onClick={() => removeCustomization(idx)} className="p-1.5 text-gray-400 hover:text-error"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="text" value={cust.option_name} onChange={(e) => updateCustomization(idx, { option_name: e.target.value })}
                      placeholder="Option name (e.g. Extra Fast Delivery)" className="px-3 py-2 rounded-lg border border-gray-200 focus:border-primary-500 outline-none text-sm text-gray-900" />
                    <select value={cust.option_type} onChange={(e) => updateCustomization(idx, { option_type: e.target.value })}
                      className="px-3 py-2 rounded-lg border border-gray-200 focus:border-primary-500 outline-none text-sm bg-white">
                      <option value="EXTRA_FAST_DELIVERY">Extra Fast Delivery</option>
                      <option value="ADDITIONAL_REVISIONS">Additional Revisions</option>
                      <option value="EXTRA_WORDS">Extra Words</option>
                      <option value="VIDEO_CALL">Video Call</option>
                      <option value="OTHER">Other</option>
                    </select>
                    <input type="number" min="0" step="0.01" value={cust.additional_price} onChange={(e) => updateCustomization(idx, { additional_price: e.target.value })}
                      placeholder="Additional price $" className="px-3 py-2 rounded-lg border border-gray-200 focus:border-primary-500 outline-none text-sm text-gray-900" />
                    <input type="number" min="0" value={cust.additional_days} onChange={(e) => updateCustomization(idx, { additional_days: e.target.value })}
                      placeholder="Additional days" className="px-3 py-2 rounded-lg border border-gray-200 focus:border-primary-500 outline-none text-sm text-gray-900" />
                  </div>
                  <input type="text" value={cust.description} onChange={(e) => updateCustomization(idx, { description: e.target.value })}
                    placeholder="Description (optional)" className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-primary-500 outline-none text-sm text-gray-900" />
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={cust.is_required} onChange={(e) => updateCustomization(idx, { is_required: e.target.checked })}
                      className="w-4 h-4 rounded border-2 border-gray-300 text-primary-600" />
                    <span className="text-xs text-gray-600">Required option</span>
                  </label>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* STEP 3: Pricing & Tasks */}
        {step === 3 && (isDigitalType || isServiceType) && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
            <ProductOptimizationCard productData={{
              name: form.name,
              description: form.description,
              price: parseFloat(form.price) || 0,
              is_free: isFree,
              category: form.category,
              tags: [],
              image_url: imagePreviews[0] || null,
              specifications: null,
              faqs: null,
              commission_rate: parseFloat(affiliateCommission) || 0,
            }} />
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2"><DollarSign className="w-5 h-5 text-primary-600" />Pricing & Commission</h2>

              {isFree && (
                <div className="bg-gradient-to-r from-success-muted to-green-50 rounded-xl p-4 flex items-center justify-between border border-success/20">
                  <div><p className="text-sm text-success font-medium">Free Product</p><p className="text-xs text-green-600 mt-0.5">No commission or task fees. Sales count toward weekly streaks.</p></div>
                  <span className="text-2xl font-bold text-success">FREE</span>
                </div>
              )}

              {!isFree && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2"><Percent className="w-4 h-4 text-gray-400" />Affiliate Commission (%) <span className="text-error">*</span></label>
                    <input type="number" min="0" max="100" step="0.5" value={affiliateCommission}
                      onChange={(e) => setAffiliateCommission(e.target.value)} placeholder="10" required
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all text-gray-900" />
                    <p className="text-xs text-gray-500 mt-1.5">Affiliate commission is calculated on the base price, not the added task amounts.</p>
                  </div>

                  {/* Admin Task Agreement */}
                  <div className={`border-2 rounded-2xl p-4 transition-colors ${adminTaskAgreed ? 'border-success bg-success-muted/30' : 'border-warning bg-warning/5'}`}>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input type="checkbox" checked={adminTaskAgreed} onChange={(e) => setAdminTaskAgreed(e.target.checked)}
                        className="mt-0.5 w-5 h-5 rounded border-2 border-gray-300 text-success focus:ring-success" />
                      <div><p className="text-sm font-medium text-gray-900">I agree to the {adminTaskPercent}% Admin Task per sale</p>
                        <p className="text-xs text-gray-500 mt-1">{adminTaskPercent}% added to product price for the buyer and deducted per sale to the Admin balance.</p></div>
                    </label>
                  </div>

                  {/* DRIGHT Sales Team Support (SERVICE only) */}
                  {isServiceType && (
                    <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
                      <div className="flex items-center gap-3">
                        <Award className="w-5 h-5 text-blue-500" />
                        <div>
                          <p className="text-sm font-semibold text-gray-900">Use DRIGHT Sales Team</p>
                          <p className="text-xs text-gray-500">DRIGHT staff will assist with customer inquiries for this service.</p>
                        </div>
                      </div>
                      <button type="button" onClick={() => setHasDrightSalesTeam(v => !v)}
                        className={`relative w-12 h-7 rounded-full transition-colors ${hasDrightSalesTeam ? 'bg-blue-500' : 'bg-gray-300'}`}>
                        <span className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ${hasDrightSalesTeam ? 'translate-x-5' : ''}`} />
                      </button>
                    </div>
                  )}

                  {/* Sales Team Tier */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700 flex items-center gap-2"><Users className="w-4 h-4 text-gray-400" />Sales Team Tier (Optional)</label>
                    <div className="relative">
                      <select value={selectedTier || ''} onChange={(e) => setSelectedTier((e.target.value as SalesTeamTier) || null)}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none appearance-none bg-white">
                        <option value="">No Sales Team</option>
                        {ALL_TIERS.map(tier => <option key={tier} value={tier}>{tier} ({systemConfig ? getTaskPercentForTier(tier, systemConfig) : '?'}% task)</option>)}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                    </div>
                    {selectedTier ? (
                      <div className="bg-blue-50 rounded-xl p-3 flex items-start gap-2"><Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-blue-700">{salesTeamTaskPercent}% task replaces the {adminTaskPercent}% admin task.</p></div>
                    ) : (
                      <div className="bg-amber-50 rounded-xl p-3 flex items-start gap-2"><Info className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-amber-700">Without a sales team, the default {adminTaskPercent}% admin task applies.</p></div>
                    )}
                  </div>

                  {/* Pricing Breakdown */}
                  {basePrice > 0 && (
                    <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
                      <p className="text-sm font-medium text-gray-700 flex items-center gap-2"><DollarSign className="w-4 h-4 text-gray-400" />Pricing Breakdown</p>
                      <div className="space-y-1 text-sm">
                        <PriceRow label="Base Price" value={pricing.basePrice} />
                        <PriceRow label={`Admin Task (${pricing.adminTaskPercent}%)`} value={pricing.adminTaskAmount} />
                        {pricing.salesTeamTaskPercent > 0 && <PriceRow label={`Sales Team Task (${pricing.salesTeamTaskPercent}%)`} value={pricing.salesTeamTaskAmount} />}
                        <PriceRow label={`Affiliate Commission (${pricing.affiliateCommissionPercent}%)`} value={pricing.affiliateCommissionAmount} muted />
                        <PriceRow label="Seller Earns" value={pricing.sellerEarnings} muted />
                        <div className="border-t border-gray-200 pt-2 mt-2">
                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-gray-900">Buyer Pays</span>
                            <span className="text-xl font-bold text-primary-600">${pricing.finalPrice.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}

        {/* Draft Save Button + Sync Status */}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={handleSaveDraft} disabled={savingDraft || !user}
            className="flex items-center gap-2 px-5 py-3.5 border-2 border-primary-200 text-primary-700 rounded-2xl font-medium hover:bg-primary-50 transition-colors disabled:opacity-50 min-h-[52px]">
            {savingDraft ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            Save Draft
          </button>
          {draftSyncStatus === 'synced' && draftSavedAt && (
            <span className="flex items-center gap-1.5 text-sm text-success">
              <Cloud className="w-4 h-4" /> Synced {new Date(draftSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {draftSyncStatus === 'offline' && (
            <span className="flex items-center gap-1.5 text-sm text-warning">
              <CloudOff className="w-4 h-4" /> Saved offline — will sync when online
            </span>
          )}
          {draftSyncStatus === 'syncing' && (
            <span className="flex items-center gap-1.5 text-sm text-primary-600">
              <RefreshCw className="w-4 h-4 animate-spin" /> Syncing...
            </span>
          )}
          {draftId && (
            <Link to="/drafts" className="text-sm text-primary-600 hover:underline ml-auto">
              View all drafts →
            </Link>
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="flex gap-3">
          {step > 1 && (
            <button type="button" onClick={prevStep}
              className="flex items-center gap-2 px-6 py-4 border border-gray-200 rounded-2xl font-medium text-gray-600 hover:bg-gray-50 transition-colors min-h-[56px]">
              <ChevronLeft className="w-5 h-5" />Back
            </button>
          )}
          {step < totalSteps ? (
            <button type="button" onClick={nextStep}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-primary-600 hover:bg-primary-700 text-white rounded-2xl font-semibold transition-colors min-h-[56px]">
              Next<ChevronRight className="w-5 h-5" />
            </button>
          ) : (
            <button type="submit" disabled={submitting || isAccountLocked || isAccountBanned}
              className="flex-1 py-4 bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white rounded-2xl font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed min-h-[56px] shadow-lg shadow-primary-600/20">
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Send className="w-5 h-5" />Upload to Marketplace</>}
            </button>
          )}
        </div>
      </motion.form>

      <PostUploadConfirmation
        uploadType={uploadedItem?.type || 'PRODUCT'}
        itemId={uploadedItem?.id || ''}
        visible={!!uploadedItem}
        onDismiss={() => setUploadedItem(null)}
      />
    </div>
  );
}

function PriceRow({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className={`flex justify-between ${muted ? 'text-gray-500' : 'text-gray-700'}`}>
      <span>{label}</span><span>${value.toFixed(2)}</span>
    </div>
  );
}
