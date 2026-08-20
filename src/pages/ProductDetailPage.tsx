import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package, Download, Check, Copy,
  AlertCircle, FileText,
  ChevronLeft, ShoppingBag, Award,
  ChevronDown, Edit2,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { generateAffiliateLink, copyToClipboard, getAffiliateCookie } from '../lib/affiliate';
import { calculateCheckoutPricing } from '../lib/pricing';
import ProductReviews from '../components/ProductReviews';
import AISellerInsights from '../components/AISellerInsights';
import AccessDownload from '../components/AccessDownload';
import ContactSeller from '../components/ContactSeller';
import GuestCheckout from '../components/GuestCheckout';
import PostPurchaseActions from '../components/PostPurchaseActions';
import SeoHead from '../components/SeoHead';
import NapFooter from '../components/NapFooter';
import ServiceDetailView from '../components/ServiceDetailView';
import type { PortfolioItem } from '../components/PortfolioSection';
import type { SellerProfile } from '../components/ServiceDetailView';
import ProductAIAssistant from '../components/marketplace/AIAssistant';
import ProductQA from '../components/marketplace/ProductQA';
import ProductSpecifications from '../components/marketplace/ProductSpecifications';
import SellerProfilePanel from '../components/marketplace/SellerProfilePanel';
import { useComparisonList, CompareButton, ComparisonBar, type ComparisonProduct } from '../components/marketplace/ProductComparison';
import PersonalizedRecommendations from '../components/marketplace/PersonalizedRecommendations';
import PromotionWizard from '../components/PromotionWizard';
import PremiumGallery from '../components/listing/PremiumGallery';
import ListingHeader from '../components/listing/ListingHeader';
import ActionPanel from '../components/listing/ActionPanel';
import TrustSection from '../components/listing/TrustSection';
import ModerationBanner from '../components/listing/ModerationBanner';
import RecentlyViewedStrip from '../components/listing/RecentlyViewedStrip';
import ShareBar from '../components/listing/ShareBar';
import MobileActionBar from '../components/listing/MobileActionBar';
import { trackListingEvent, trackUserActivity } from '../lib/marketplaceAnalytics';
import { trackProductView } from '../lib/analyticsService';
import { useRecentlyViewed } from '../lib/marketplaceHooks';
import { formatCurrency } from '../lib/currency';

interface ServiceTier {
  id: string;
  tier_name: string;
  tier_number: number;
  title: string;
  description: string | null;
  price: number;
  delivery_days: number;
  features: string[];
  word_count: number | null;
  revision_count: number;
  is_most_popular: boolean;
}

interface CustomizationOption {
  id: string;
  option_name: string;
  option_type: string | null;
  description: string | null;
  additional_price: number;
  additional_days: number;
  is_required: boolean;
}

interface DigitalDetails {
  delivery_type: string;
  download_file_url: string | null;
  access_link: string | null;
  file_format: string | null;
  download_limit: number | null;
  expiry_days: number;
  includes_bonus_materials: boolean;
}

interface RelatedProduct {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  category: string;
  is_free: boolean;
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  commission_rate: number;
  image_url: string | null;
  category: string;
  uploaded_by: string;
  created_at: string;
  is_free: boolean;
  product_type: string;
  demo_video_url: string | null;
  admin_task_percent: number;
  sales_team_task_percent: number;
  affiliate_commission_percent: number;
  sales_team_tier: string | null;
  stock_quantity: number | null;
  approval_status: string;
  is_hidden: boolean;
  is_active: boolean;
  total_reviews: number;
  average_rating: number;
  has_dright_sales_team: boolean;
  tags?: string[];
  total_sales?: number;
  view_count?: number;
}

export default function ProductDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user, profile } = useAuth();
  const [product, setProduct] = useState<Product | null>(null);
  const [productImages, setProductImages] = useState<string[]>([]);
  const [relatedProducts, setRelatedProducts] = useState<RelatedProduct[]>([]);
  const [digitalDetails, setDigitalDetails] = useState<DigitalDetails | null>(null);
  const [tiers, setTiers] = useState<ServiceTier[]>([]);
  const [customizations, setCustomizations] = useState<CustomizationOption[]>([]);
  const [sellerEmail, setSellerEmail] = useState<string>('');
  const [sellerProfile, setSellerProfile] = useState<SellerProfile | null>(null);
  const isOwner = user?.id === product?.uploaded_by;
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const [selectedCustomizations] = useState<Set<string>>(new Set());
  const [buyerRequirements] = useState('');
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutResult, setCheckoutResult] = useState<{ success: boolean; orderId?: string; message: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [showPromotionWizard, setShowPromotionWizard] = useState(false);
  const [hasPurchased, setHasPurchased] = useState(false);
  const [purchasedOrder, setPurchasedOrder] = useState<{ id: string; download_token: string | null } | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const { productIds: compareIds, toggleCompare } = useComparisonList();
  const { recordView } = useRecentlyViewed(user?.id);
  const recordViewRef = useRef<typeof recordView | null>(null);
  recordViewRef.current = recordView;

  useEffect(() => {
    if (!id) return;
    fetchProduct();
    // Track view: increment product view_count + log to listing_events
    trackProductView(id, product?.uploaded_by, 'direct');
    const refCode = getAffiliateCookie();
    const viewSource = refCode ? 'affiliate' as const : 'marketplace' as const;
    trackListingEvent({
      listing_id: id,
      listing_type: 'product',
      event_type: 'open',
      user_id: user?.id || null,
      metadata: { source: 'product_detail' },
      view_source: viewSource,
    });
    if (user?.id) {
      trackUserActivity(user.id, 'open', id, 'product');
    }
    // Record in browse history (recently_viewed) for logged-in users + localStorage
    recordViewRef.current?.(id);
  }, [id]);

  const fetchProduct = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: prod, error: prodErr } = await supabase
        .from('products').select('*').eq('id', id!).maybeSingle();
      if (prodErr || !prod) { setError('Product not found'); return; }
      setProduct(prod as Product);

      // Fetch product images from product_images table
      const { data: images } = await supabase
        .from('product_images')
        .select('image_url')
        .eq('product_id', id!)
        .order('position', { ascending: true });
      if (images && images.length > 0) {
        setProductImages(images.map((img: { image_url: string }) => img.image_url));
      } else if ((prod as Product).image_url) {
        setProductImages([(prod as Product).image_url!]);
      }

      // Fetch related products (same category, exclude current)
      const { data: related } = await supabase
        .from('products')
        .select('id, name, price, image_url, category, is_free')
        .eq('category', (prod as Product).category)
        .eq('approval_status', 'approved')
        .neq('id', id!)
        .limit(8);
      if (related) setRelatedProducts(related as RelatedProduct[]);

      // Fetch seller profile
      const { data: seller } = await supabase
        .from('users')
        .select('email, full_name, avatar_url, average_rating, total_reviews, account_status, store_title')
        .eq('id', prod.uploaded_by)
        .maybeSingle();
      if (seller) {
        setSellerEmail(seller.email);
        setSellerProfile({
          full_name: seller.full_name,
          avatar_url: seller.avatar_url,
          email: seller.email,
          average_rating: Number(seller.average_rating || 0),
          total_reviews: Number(seller.total_reviews || 0),
          is_verified: seller.account_status === 'ACTIVE',
        });
      }

      // Fetch portfolio items for SERVICE products
      if (prod.product_type === 'SERVICE') {
        const { data: portfolio } = await supabase
          .from('portfolio_items')
          .select('id, item_type, file_url, external_url, link_platform, title, description, position')
          .eq('product_id', id!)
          .eq('is_approved', true)
          .order('position', { ascending: true });
        if (portfolio) setPortfolioItems(portfolio as PortfolioItem[]);
      }

      if (prod.product_type === 'DIGITAL' || prod.product_type === 'COURSE') {
        const { data: dd } = await supabase
          .from('digital_product_details').select('*').eq('product_id', id!).maybeSingle();
        if (dd) setDigitalDetails(dd);
      }
      if (prod.product_type === 'SERVICE') {
        const { data: t } = await supabase
          .from('service_tiers').select('*').eq('product_id', id!).order('tier_number');
        if (t) {
          setTiers(t as ServiceTier[]);
          const popular = (t as ServiceTier[]).find(tier => tier.is_most_popular);
          if (popular) setSelectedTierId(popular.id);
          else if (t.length > 0) setSelectedTierId((t as ServiceTier[])[0].id);
        }
        const { data: co } = await supabase
          .from('customization_options').select('*').eq('product_id', id!);
        if (co) setCustomizations(co as CustomizationOption[]);
      }
      if (user) {
        const { data: existingOrder } = await supabase
          .from('orders')
          .select('id, download_token')
          .eq('product_id', id!)
          .eq('buyer_id', user.id)
          .eq('status', 'COMPLETED')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existingOrder) {
          setHasPurchased(true);
          setPurchasedOrder({ id: existingOrder.id, download_token: existingOrder.download_token });
        }
      }
    } catch (err) {
      console.error('Error fetching product:', err);
      setError('Failed to load product');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyAffiliateLink = () => {
    if (!product) return;
    const link = generateAffiliateLink(profile?.referral_code || '', product.id);
    copyToClipboard(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const incrementQty = () => {
    if (product?.stock_quantity !== null && product?.stock_quantity !== undefined) {
      setQuantity(prev => Math.min(prev + 1, product.stock_quantity!));
    } else {
      setQuantity(prev => prev + 1);
    }
  };

  const decrementQty = () => {
    setQuantity(prev => Math.max(1, prev - 1));
  };

  const selectedTier = tiers.find(t => t.id === selectedTierId);
  const selectedCustomizationObjs = customizations.filter(c => selectedCustomizations.has(c.id));
  const tierPrice = selectedTier ? Number(selectedTier.price) : 0;
  const extraDays = selectedCustomizationObjs.reduce((sum, c) => sum + c.additional_days, 0);

  const pricing = product ? calculateCheckoutPricing({
    productBasePrice: Number(product.price),
    productIsFree: product.is_free,
    isAdminUploaded: false,
    affiliateCommissionPercent: Number(product.affiliate_commission_percent || 0),
    adminTaskPercent: Number(product.admin_task_percent || 15),
    salesTeamTaskPercent: Number(product.sales_team_task_percent || 0),
    selectedTierPrice: tierPrice,
    customizationOptions: selectedCustomizationObjs.map(c => ({ additionalPrice: Number(c.additional_price) })),
  }) : null;

  const handleCheckout = async () => {
    if (!product || !user) return;
    if (product.product_type === 'SERVICE' && !buyerRequirements.trim()) {
      setError('Please describe your requirements before ordering'); return;
    }
    setCheckoutLoading(true);
    setError(null);
    try {
      const refCode = getAffiliateCookie();
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          buyer_id: user.id,
          product_id: product.id,
          selected_tier_id: selectedTierId,
          customization_option_ids: [...selectedCustomizations],
          buyer_requirements: buyerRequirements || undefined,
          ref_code: refCode || undefined,
          quantity,
        }),
      });
      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Checkout failed');
      }
      if (result.is_free_order) {
        setCheckoutResult({
          success: true,
          orderId: result.order_id,
          message: 'Free order completed! Check your downloads.',
        });
      } else {
        navigate(`/checkout/payment?order_id=${result.order_id}&product_id=${product.id}`);
      }
    } catch (err) {
      console.error('Checkout error:', err);
      setCheckoutResult({ success: false, message: err instanceof Error ? err.message : 'Checkout failed' });
    } finally {
      setCheckoutLoading(false);
    }
  };

  
  

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-gray-300 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center">
        <AlertCircle className="w-12 h-12 text-error mx-auto mb-4" />
        <p className="text-gray-900 dark:text-gray-100 font-semibold">{error || 'Product not found'}</p>
        <Link to="/market" className="mt-4 inline-flex items-center gap-2 text-primary-600 hover:text-primary-700">
          <ChevronLeft className="w-4 h-4" />Back to Market
        </Link>
      </div>
    );
  }

  const isDigital = product.product_type === 'DIGITAL' || product.product_type === 'COURSE';
  const isService = product.product_type === 'SERVICE';
  const isOutOfStock = product.stock_quantity === 0;

  // For SERVICE products, render the Upwork-style dark mobile layout
  if (isService) {
    const handleServiceCheckout = async (tierId: string, customIds: string[], reqs: string) => {
      setCheckoutLoading(true);
      setError(null);
      try {
        const refCode = getAffiliateCookie();
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/checkout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            buyer_id: user?.id,
            product_id: product.id,
            selected_tier_id: tierId || null,
            customization_option_ids: customIds,
            buyer_requirements: reqs || undefined,
            ref_code: refCode || undefined,
            quantity: 1,
          }),
        });
        const result = await response.json();
        if (!response.ok || result.error) throw new Error(result.error || 'Checkout failed');
        if (result.is_free_order) {
          setCheckoutResult({ success: true, orderId: result.order_id, message: 'Free order completed!' });
        } else {
          navigate(`/checkout/payment?order_id=${result.order_id}&product_id=${product.id}`);
        }
      } catch (err) {
        setCheckoutResult({ success: false, message: err instanceof Error ? err.message : 'Checkout failed' });
      } finally {
        setCheckoutLoading(false);
      }
    };

    return (
      <>
        <SeoHead
          title={product.name}
          description={(product.description || '').slice(0, 160) || `${product.name} — Service on Dright`}
          canonical={`/product/${product.id}`}
          ogType="product"
          keywords={[product.name, product.category, 'service', 'Dright']}
          breadcrumbs={[{ name: 'Home', url: '/welcome' }, { name: 'Marketplace', url: '/market' }, { name: product.name }]}
          product={{
            name: product.name,
            description: (product.description || '').slice(0, 300) || undefined,
            price: Number(product.price),
            availability: 'in_stock',
            brandName: 'Dright',
          }}
        />
        <ServiceDetailView
          product={{
            id: product.id,
            name: product.name,
            description: product.description,
            uploaded_by: product.uploaded_by,
            admin_task_percent: product.admin_task_percent,
            sales_team_task_percent: product.sales_team_task_percent,
            affiliate_commission_percent: product.affiliate_commission_percent,
            has_dright_sales_team: product.has_dright_sales_team || false,
            average_rating: product.average_rating,
            total_reviews: product.total_reviews,
            demo_video_url: product.demo_video_url,
            is_free: product.is_free,
            price: product.price,
          }}
          productImages={productImages}
          tiers={tiers}
          customizations={customizations}
          portfolioItems={portfolioItems}
          sellerProfile={sellerProfile}
          user={user}
          referralCode={profile?.referral_code}
          onCheckout={handleServiceCheckout}
          checkoutLoading={checkoutLoading}
          checkoutResult={checkoutResult}
          onDismissResult={() => setCheckoutResult(null)}
        />
      </>
    );
  }
  const description = product.description || '';
  const isLongDescription = description.length > 300;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <SeoHead
        title={product.name}
        description={description.slice(0, 160) || `${product.name} — ${product.category} on Dright`}
        canonical={`/product/${product.id}`}
        ogType="product"
        keywords={[product.name, product.category, 'digital product', 'buy online', 'Dright marketplace']}
        breadcrumbs={[{ name: 'Home', url: '/welcome' }, { name: 'Marketplace', url: '/market' }, { name: product.name }]}
        product={{
          name: product.name,
          description: description.slice(0, 300) || undefined,
          price: pricing?.finalPrice || Number(product.price),
          availability: isOutOfStock ? 'out_of_stock' : 'in_stock',
          brandName: 'Dright',
        }}
      />
      <div className="flex items-center justify-between mb-4">
        <Link to="/market" className="inline-flex items-center gap-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 text-sm">
          <ChevronLeft className="w-4 h-4" />Back to Market
        </Link>
        {user && product.uploaded_by === user.id && (
          <button
            onClick={() => setShowPromotionWizard(true)}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-gradient-to-r from-primary-500 to-blue-500 rounded-xl hover:from-primary-600 hover:to-blue-600 transition-colors"
          >
            <TrendingUp className="w-4 h-4" /> Promote
          </button>
        )}
        {user && product.uploaded_by === user.id && (
          <Link to={`/product/${product.id}/edit`}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-primary-600 border border-primary-200 rounded-xl hover:bg-primary-50 transition-colors">
            <Edit2 className="w-4 h-4" />Edit Product
          </Link>
        )}
      </div>

      <AnimatePresence>
        {checkoutResult && (
          <motion.div
            initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
            className={`rounded-2xl p-4 mb-6 flex items-center gap-3 ${
              checkoutResult.success ? 'bg-success-muted border border-success/20 text-success' : 'bg-error-muted border border-error/20 text-error'
            }`}
          >
            {checkoutResult.success ? <Check className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <span className="font-medium">{checkoutResult.message}</span>
            {checkoutResult.success && checkoutResult.orderId && (
              <Link to="/my-orders" className="ml-auto text-sm font-semibold underline">View Orders</Link>
            )}
            <button onClick={() => setCheckoutResult(null)} className="ml-2 text-gray-400 dark:text-gray-500 hover:text-gray-600">
              <AlertCircle className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Moderation Banner for Owner */}
      <ModerationBanner
        approvalStatus={product.approval_status || 'approved'}
        visible={!!isOwner && product.approval_status !== 'approved'}
      />

      <div className="grid md:grid-cols-12 gap-6 lg:gap-8">
        {/* Left: Premium Media Gallery */}
        <div className="md:col-span-5 lg:col-span-5 space-y-4">
          <PremiumGallery images={productImages} alt={product.name} videoUrl={product.demo_video_url} />

          {isDigital && digitalDetails && (
            <div className="flex flex-wrap gap-2">
              <Badge icon={Download} label={digitalDetails.delivery_type.replace(/_/g, ' ')} color="blue" />
              {digitalDetails.file_format && <Badge icon={FileText} label={digitalDetails.file_format} color="gray" />}
              {digitalDetails.includes_bonus_materials && <Badge icon={Award} label="Bonus Materials" color="green" />}
              {digitalDetails.download_limit && <Badge icon={Download} label={`${digitalDetails.download_limit} downloads`} color="purple" />}
            </div>
          )}

          {/* Share Bar */}
          <div className="hidden md:block">
            <ShareBar listingId={product.id} listingName={product.name} referralCode={profile?.referral_code || null} />
          </div>
        </div>

        {/* Right: Listing Info + Action Panel */}
        <div className="md:col-span-7 lg:col-span-7 space-y-5">
          <ListingHeader
            title={product.name}
            category={product.category}
            listingType={product.product_type}
            isFree={product.is_free}
            averageRating={Number(product.average_rating || 0)}
            totalReviews={product.total_reviews}
            sellerVerified={sellerProfile?.is_verified}
            sellerName={sellerEmail}
            sellerId={product.uploaded_by}
            viewCount={product.view_count}
            createdAt={product.created_at}
          />

          <div className="grid md:grid-cols-3 gap-4">
            {/* Action Panel (2 cols on desktop) */}
            <div className="md:col-span-2">
              {hasPurchased && isDigital && purchasedOrder ? (
                <AccessDownload
                  orderId={purchasedOrder.id}
                  downloadToken={purchasedOrder.download_token}
                  productName={product.name}
                  productType={product.product_type}
                  hasPurchased={true}
                />
              ) : (
                <ActionPanel
                  listingType={product.product_type}
                  price={Number(product.price)}
                  isFree={product.is_free}
                  finalPrice={pricing?.finalPrice}
                  stockQuantity={product.stock_quantity}
                  quantity={quantity}
                  onIncrement={incrementQty}
                  onDecrement={decrementQty}
                  onBuyNow={handleCheckout}
                  onAddToCart={handleCheckout}
                  onContactSeller={() => {}}
                  checkoutLoading={checkoutLoading}
                  isOutOfStock={isOutOfStock}
                  hasPurchased={hasPurchased && isDigital}
                  sellerId={product.uploaded_by}
                  isOwner={isOwner}
                />
              )}

              {/* Guest checkout fallback */}
              {!user && !hasPurchased && (
                <div className="mt-3">
                  <GuestCheckout
                    productId={product.id}
                    productName={product.name}
                    productPrice={pricing?.finalPrice || Number(product.price)}
                    sellerId={product.uploaded_by}
                    trigger={
                      <button className="w-full py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 text-gray-700 dark:text-gray-300 rounded-xl font-medium text-sm transition-colors flex items-center justify-center gap-2">
                        <ShoppingBag className="w-4 h-4" />Buy as Guest
                      </button>
                    }
                  />
                </div>
              )}

              {/* Contact Seller + Affiliate + Compare */}
              <div className="mt-3 space-y-2">
                <ContactSeller
                  sellerId={product.uploaded_by}
                  contextType="product_inquiry"
                  contextId={product.id}
                  contextData={{
                    title: product.name,
                    image_url: product.image_url || null,
                    price: pricing?.finalPrice || Number(product.price),
                    seller_name: sellerEmail || undefined,
                    availability: product.stock_quantity != null
                      ? product.stock_quantity > 0 ? `${product.stock_quantity} in stock` : 'Out of stock'
                      : 'Available',
                  }}
                  productId={product.id}
                  productName={product.name}
                  sellerName={sellerEmail || undefined}
                />
                <button onClick={handleCopyAffiliateLink}
                  className={`w-full py-2.5 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                    copied ? 'bg-success-muted text-success border border-success/20' : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-primary-300'
                  }`}>
                  {copied ? <><Check className="w-4 h-4" />Affiliate Link Copied!</> : <><Copy className="w-4 h-4" />Copy Affiliate Link</>}
                </button>
                <CompareButton productId={product.id} isInList={compareIds.includes(product.id)} onToggle={toggleCompare} />
              </div>
            </div>

            {/* Trust Section (1 col sidebar) */}
            <div className="md:col-span-1">
              <TrustSection sellerVerified={sellerProfile?.is_verified} />
            </div>
          </div>
        </div>
      </div>

      {/* Seller Profile Panel */}
      <div className="mt-6">
        <SellerProfilePanel sellerId={product.uploaded_by} onChat={() => {}} />
      </div>

      {/* Product Description */}
      {description && (
        <div className="mt-10 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Description</h2>
          <p className={`text-gray-600 dark:text-gray-400 whitespace-pre-wrap ${!showFullDescription && isLongDescription ? 'line-clamp-4' : ''}`}>
            {description}
          </p>
          {isLongDescription && (
            <button
              onClick={() => setShowFullDescription(!showFullDescription)}
              className="mt-2 text-primary-600 hover:text-primary-700 font-medium text-sm flex items-center gap-1"
            >
              {showFullDescription ? 'Show Less' : 'Read More'}
              <ChevronDown className={`w-4 h-4 transition-transform ${showFullDescription ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      )}

      {/* Dynamic Specifications */}
      <ProductSpecifications
        specifications={(product as Product & { specifications?: Record<string, string> | null }).specifications || null}
        productType={product.product_type}
      />

      {/* Legacy spec table for digital/service details */}
      {(isDigital || isService) && (
        <div className="mt-6 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Additional Details</h2>
          <div className="divide-y divide-gray-100">
            <SpecRow label="Type" value={product.product_type} />
            <SpecRow label="Category" value={product.category} />
            <SpecRow label="Price" value={product.is_free ? 'Free' : formatCurrency(Number(product.price))} />
            {product.stock_quantity !== null && <SpecRow label="Stock" value={`${product.stock_quantity} units`} />}
            {product.commission_rate > 0 && <SpecRow label="Commission Rate" value={`${product.commission_rate}%`} />}
            {isDigital && digitalDetails && (
              <>
                <SpecRow label="Delivery" value={digitalDetails.delivery_type.replace(/_/g, ' ')} />
                {digitalDetails.file_format && <SpecRow label="File Format" value={digitalDetails.file_format} />}
                <SpecRow label="Expiry" value={`${digitalDetails.expiry_days} days`} />
                {digitalDetails.download_limit && <SpecRow label="Download Limit" value={`${digitalDetails.download_limit}`} />}
                <SpecRow label="Bonus Materials" value={digitalDetails.includes_bonus_materials ? 'Yes' : 'No'} />
              </>
            )}
            {isService && selectedTier && (
              <>
                <SpecRow label="Delivery Time" value={`${selectedTier.delivery_days + extraDays} days`} />
                <SpecRow label="Revisions" value={`${selectedTier.revision_count}`} />
              </>
            )}
          </div>
        </div>
      )}

      {/* Post-Purchase Actions */}
      <div className="mt-6 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Actions</h2>
        <PostPurchaseActions
          productId={product.id}
          sellerId={product.uploaded_by}
          hasPurchased={!!purchasedOrder}
        />
      </div>

      {/* Reviews Section */}
      <div className="mt-10">
        <ProductReviews productId={product.id} productName={product.name} />
      </div>

      {/* AI Seller Insights - only visible to product owner */}
      {isOwner && (
        <div className="mt-10">
          <AISellerInsights product={{
            id: product.id,
            name: product.name,
            description: product.description || '',
            price: Number(product.price) || 0,
            image_url: product.image_url || null,
            category: product.category || 'Uncategorized',
            tags: product.tags || [],
            total_sales: Number(product.total_sales) || 0,
            view_count: Number(product.view_count) || 0,
            average_rating: Number(product.average_rating) || 0,
            total_reviews: Number(product.total_reviews) || 0,
            is_free: product.is_free || false,
          }} />
        </div>
      )}

      {/* Q&A Section */}
      <ProductQA productId={product.id} productName={product.name} sellerId={product.uploaded_by} />

      {/* Personalized Recommendations */}
      <PersonalizedRecommendations
        currentProductId={product.id}
        currentCategory={product.category}
        currentSellerId={product.uploaded_by}
        currentPrice={Number(product.price)}
      />

      {/* Related Products */}
      {relatedProducts.length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Related Products</h2>
          <div className="flex gap-4 overflow-x-auto pb-4 snap-x">
            {relatedProducts.map(rp => (
              <Link
                key={rp.id}
                to={`/product/${rp.id}`}
                className="shrink-0 w-48 snap-start group"
              >
                <div className="w-full h-36 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 mb-2">
                  {rp.image_url ? (
                    <img src={rp.image_url} alt={rp.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-8 h-8 text-gray-300" />
                    </div>
                  )}
                </div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate group-hover:text-primary-600 transition-colors">{rp.name}</p>
                <p className="text-sm font-bold text-primary-600">
                  {rp.is_free ? 'FREE' : formatCurrency(Number(rp.price))}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}
      {/* Recently Viewed */}
      <RecentlyViewedStrip />

      <NapFooter compact />

      {/* Mobile Action Bar */}
      <MobileActionBar
        listingType={product.product_type}
        price={Number(product.price)}
        isFree={product.is_free}
        finalPrice={pricing?.finalPrice}
        onBuyNow={handleCheckout}
        checkoutLoading={checkoutLoading}
        isOutOfStock={isOutOfStock}
        isOwner={isOwner}
      />

      {/* AI Assistant */}
      <ProductAIAssistant
        product={{
          id: product.id,
          name: product.name,
          description: product.description,
          category: product.category,
          product_type: product.product_type,
          price: Number(product.price),
          is_free: product.is_free,
          specifications: (product as Product & { specifications?: Record<string, string> | null }).specifications || null,
          stock_quantity: product.stock_quantity,
        }}
        onContactSeller={() => {}}
      />

      {/* Comparison Bar */}
      <ComparisonBar
        products={compareIds.includes(product.id) ? [{
          id: product.id,
          name: product.name,
          price: Number(product.price),
          is_free: product.is_free,
          image_url: product.image_url,
          category: product.category,
          product_type: product.product_type,
          average_rating: product.average_rating,
          total_reviews: product.total_reviews,
          total_sales: 0,
          seller_name: sellerEmail,
          store_name: null,
          seller_verified: false,
          specifications: (product as Product & { specifications?: Record<string, string> | null }).specifications || null,
          commission_rate: product.commission_rate,
          stock_quantity: product.stock_quantity,
        } as ComparisonProduct] : []}
        onRemove={toggleCompare}
        onClear={() => { if (compareIds.includes(product.id)) toggleCompare(product.id); }}
        onCompare={() => { window.location.href = '/compare'; }}
      />

      {showPromotionWizard && (
        <PromotionWizard
          listingId={product.id}
          listingType="product"
          listingName={product.name}
          listingCategory={product.category}
          onClose={() => setShowPromotionWizard(false)}
        />
      )}
    </div>
  );
}

function Badge({ icon: Icon, label, color }: { icon: typeof Download; label: string; color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    green: 'bg-success-muted text-success',
    gray: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
    purple: 'bg-purple-50 text-purple-600',
  };
  return (
    <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex items-center gap-1 ${colors[color] || colors.gray}`}>
      <Icon className="w-3 h-3" />{label}
    </span>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2.5 text-sm">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-gray-900 dark:text-gray-100 font-medium">{value}</span>
    </div>
  );
}
