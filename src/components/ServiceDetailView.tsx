import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, Star, BadgeCheck, Clock, ChevronDown, ChevronUp,
  ShieldCheck, MessageSquare, Loader2, Check, AlertCircle,
  Copy, ExternalLink, Users, Award, ChevronRight,
} from 'lucide-react';
import { generateAffiliateLink, copyToClipboard } from '../lib/affiliate';
import { formatCurrency } from '../lib/currency';
import PortfolioSection, { type PortfolioItem } from './PortfolioSection';
import ProductReviews from './ProductReviews';
import ContactSeller from './ContactSeller';
import GuestCheckout from './GuestCheckout';

export interface ServiceTier {
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

export interface ServiceCustomization {
  id: string;
  option_name: string;
  option_type: string | null;
  description: string | null;
  additional_price: number;
  additional_days: number;
  is_required: boolean;
}

export interface ServiceProduct {
  id: string;
  name: string;
  description: string | null;
  uploaded_by: string;
  admin_task_percent: number;
  sales_team_task_percent: number;
  affiliate_commission_percent: number;
  has_dright_sales_team: boolean;
  average_rating: number;
  total_reviews: number;
  demo_video_url: string | null;
  is_free: boolean;
  price: number;
}

export interface SellerProfile {
  full_name: string | null;
  avatar_url: string | null;
  email: string;
  average_rating: number;
  total_reviews: number;
  is_verified: boolean;
}

interface ServiceDetailViewProps {
  product: ServiceProduct;
  productImages: string[];
  tiers: ServiceTier[];
  customizations: ServiceCustomization[];
  portfolioItems: PortfolioItem[];
  sellerProfile: SellerProfile | null;
  user: { id: string } | null;
  referralCode?: string | null;
  onCheckout: (tierId: string, customIds: string[], requirements: string) => void;
  checkoutLoading: boolean;
  checkoutResult: { success: boolean; message: string; orderId?: string } | null;
  onDismissResult: () => void;
}

const formatNaira = (amount: number) =>
  formatCurrency(Math.round(amount), 'NGN');

function getDeliveryDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ServiceDetailView({
  product,
  productImages,
  tiers,
  customizations,
  portfolioItems,
  sellerProfile,
  user,
  referralCode,
  onCheckout,
  checkoutLoading,
  checkoutResult,
  onDismissResult,
}: ServiceDetailViewProps) {
  const [selectedTierId, setSelectedTierId] = useState<string>(
    tiers.find(t => t.is_most_popular)?.id || tiers[0]?.id || ''
  );
  const [selectedCustomIds, setSelectedCustomIds] = useState<Set<string>>(new Set());
  const [showAddons, setShowAddons] = useState(false);
  const [showCompareTiers, setShowCompareTiers] = useState(false);
  const [showFullDesc, setShowFullDesc] = useState(false);
  const [requirements, setRequirements] = useState('');
  const [showRequirements, setShowRequirements] = useState(false);
  const [carouselIdx, setCarouselIdx] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (tiers.length > 0) {
      const popular = tiers.find(t => t.is_most_popular);
      setSelectedTierId(popular?.id || tiers[0].id);
    }
  }, [tiers]);

  const selectedTier = tiers.find(t => t.id === selectedTierId);
  const selectedCustomObjs = customizations.filter(c => selectedCustomIds.has(c.id));
  const extraDays = selectedCustomObjs.reduce((s, c) => s + c.additional_days, 0);
  const customPrice = selectedCustomObjs.reduce((s, c) => s + Number(c.additional_price), 0);
  const tierBasePrice = selectedTier ? Number(selectedTier.price) : 0;
  const adminTask = tierBasePrice * (product.admin_task_percent / 100);
  const totalPrice = tierBasePrice + customPrice + adminTask;
  const deliveryDays = (selectedTier?.delivery_days || 7) + extraDays;

  const toggleCustom = (id: string) => {
    setSelectedCustomIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleContinue = () => {
    if (!requirements.trim() && !showRequirements) {
      setShowRequirements(true);
      return;
    }
    onCheckout(selectedTierId, [...selectedCustomIds], requirements);
  };

  const handleCopyAffiliate = () => {
    const link = generateAffiliateLink(referralCode || '', product.id);
    copyToClipboard(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sellerInitials = (sellerProfile?.full_name || sellerProfile?.email || 'S')
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const isLongDesc = (product.description || '').length > 300;

  const tierLabels: Record<string, string> = {
    BASIC: 'Starter',
    STANDARD: 'Standard',
    ADVANCED: 'Advanced',
  };

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-white pb-36">
      {/* Back Nav */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-2">
        <Link to="/market" className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors">
          <ChevronLeft className="w-5 h-5" />
          <span className="text-sm">Back</span>
        </Link>
      </div>

      {/* Checkout result banner */}
      <AnimatePresence>
        {checkoutResult && (
          <motion.div
            initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
            className={`mx-4 mb-3 rounded-xl p-3 flex items-center gap-2 ${
              checkoutResult.success
                ? 'bg-green-500/20 border border-green-500/30 text-green-400'
                : 'bg-red-500/20 border border-red-500/30 text-red-400'
            }`}
          >
            {checkoutResult.success ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span className="text-sm font-medium flex-1">{checkoutResult.message}</span>
            {checkoutResult.success && checkoutResult.orderId && (
              <Link to="/my-orders" className="text-xs font-semibold underline">View Orders</Link>
            )}
            <button onClick={onDismissResult} className="p-1 hover:opacity-70"><AlertCircle className="w-3 h-3" /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero Image Carousel */}
      {productImages.length > 0 && (
        <div className="relative">
          <div className="overflow-hidden">
            <div
              className="flex transition-transform duration-300 ease-out"
              style={{ transform: `translateX(-${carouselIdx * 100}%)` }}
            >
              {productImages.map((img, idx) => (
                <img
                  key={idx}
                  src={img}
                  alt={`${product.name} ${idx + 1}`}
                  className="w-full aspect-video object-cover shrink-0"
                />
              ))}
            </div>
          </div>
          {productImages.length > 1 && (
            <>
              <button
                onClick={() => setCarouselIdx(i => Math.max(0, i - 1))}
                disabled={carouselIdx === 0}
                className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/50 rounded-full disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4 text-white" />
              </button>
              <button
                onClick={() => setCarouselIdx(i => Math.min(productImages.length - 1, i + 1))}
                disabled={carouselIdx === productImages.length - 1}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/50 rounded-full disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4 text-white" />
              </button>
              <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
                {productImages.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCarouselIdx(idx)}
                    className={`w-1.5 h-1.5 rounded-full transition-colors ${
                      carouselIdx === idx ? 'bg-white' : 'bg-white/40'
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className="px-4 pt-5 space-y-5">
        {/* Service Title */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-medium">
              SERVICE
            </span>
            {product.has_dright_sales_team && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-medium flex items-center gap-1">
                <Award className="w-3 h-3" />Managed by DRIGHT
              </span>
            )}
            {portfolioItems.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 font-medium">
                Portfolio Available
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-white leading-tight">{product.name}</h1>
        </div>

        {/* Seller Profile Card */}
        <div className="flex items-center gap-3 bg-[#252525] rounded-2xl p-4">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center text-white font-bold text-sm shrink-0 overflow-hidden">
            {sellerProfile?.avatar_url ? (
              <img src={sellerProfile.avatar_url} alt={sellerProfile.full_name || 'Seller'} className="w-full h-full object-cover" />
            ) : (
              <span>{sellerInitials}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="font-semibold text-white truncate">
                {sellerProfile?.full_name || sellerProfile?.email || 'Seller'}
              </p>
              {sellerProfile?.is_verified && (
                <BadgeCheck className="w-4 h-4 text-green-400 shrink-0" />
              )}
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
              <span className="text-sm font-medium text-yellow-400">
                {Number(sellerProfile?.average_rating || product.average_rating || 0).toFixed(1)}
              </span>
              <span className="text-sm text-gray-400">
                · {sellerProfile?.total_reviews || product.total_reviews || 0} reviews
              </span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Seller</p>
          </div>
        </div>

        {/* Portfolio Section */}
        {portfolioItems.length > 0 && (
          <div className="bg-[#252525] rounded-2xl p-4">
            <PortfolioSection items={portfolioItems} />
          </div>
        )}

        {/* "Let a pro handle it" promo card */}
        <div className="bg-gradient-to-br from-blue-900/60 to-blue-800/40 rounded-2xl p-4 border border-blue-700/30">
          <p className="font-bold text-white text-base mb-1">Let a pro handle the details</p>
          <p className="text-sm text-gray-300">
            Get this service delivered by {sellerProfile?.full_name || 'this seller'}, priced and ready to go.
          </p>
        </div>

        {/* Tier Selector */}
        {tiers.length > 0 && (
          <div className="bg-[#252525] rounded-2xl overflow-hidden">
            {/* Tier radio row */}
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <span className="font-bold text-white text-base">Select service tier</span>
                <button
                  onClick={() => setShowCompareTiers(v => !v)}
                  className="text-sm text-green-400 font-medium hover:text-green-300 transition-colors"
                >
                  Compare tiers
                </button>
              </div>

              <div className={`grid gap-3 ${tiers.length === 3 ? 'grid-cols-3' : tiers.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {tiers.map(tier => {
                  const isSelected = tier.id === selectedTierId;
                  const label = tierLabels[tier.tier_name] || tier.tier_name;
                  return (
                    <button
                      key={tier.id}
                      onClick={() => setSelectedTierId(tier.id)}
                      className="flex flex-col items-center gap-1 text-center"
                    >
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                        isSelected ? 'border-green-500 bg-green-500' : 'border-gray-500 bg-transparent'
                      }`}>
                        {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                      <span className={`text-sm font-medium transition-colors ${isSelected ? 'text-white' : 'text-gray-400'}`}>
                        {label}
                      </span>
                      <span className={`text-base font-bold transition-colors ${isSelected ? 'text-white' : 'text-gray-500'}`}>
                        {formatNaira(Number(tier.price))}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Divider */}
            <div className="h-px bg-gray-700" />

            {/* Selected tier details */}
            {selectedTier && (
              <div className="p-4 space-y-4">
                <div>
                  <h2 className="text-xl font-bold text-white">{selectedTier.title || tierLabels[selectedTier.tier_name] || selectedTier.tier_name}</h2>
                  {selectedTier.description && (
                    <p className="text-gray-300 text-sm mt-1 leading-relaxed">{selectedTier.description}</p>
                  )}
                </div>

                {/* Tier specs */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-300 text-sm">Delivery Time</span>
                    <span className="text-white font-medium text-sm">{deliveryDays} days</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-300 text-sm underline decoration-dotted cursor-help">Number of Revisions</span>
                    <span className="text-white font-medium text-sm">{selectedTier.revision_count}</span>
                  </div>
                  {selectedTier.word_count && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-300 text-sm underline decoration-dotted cursor-help">Number of Words</span>
                      <span className="text-white font-medium text-sm">{selectedTier.word_count.toLocaleString()}</span>
                    </div>
                  )}
                  {selectedTier.features && selectedTier.features.filter(f => f.trim()).length > 0 && (
                    <div className="pt-1 space-y-1.5">
                      {selectedTier.features.filter(f => f.trim()).map((feat, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                          <span className="text-gray-300 text-sm">{feat}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Optional add-ons */}
                {customizations.length > 0 && (
                  <div className="bg-[#1e1e1e] rounded-xl overflow-hidden">
                    <button
                      onClick={() => setShowAddons(v => !v)}
                      className="w-full flex items-center justify-between p-4"
                    >
                      <span className="text-white font-medium text-sm">
                        Optional add-ons ({customizations.length})
                      </span>
                      {showAddons
                        ? <ChevronUp className="w-4 h-4 text-gray-400" />
                        : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </button>
                    <AnimatePresence>
                      {showAddons && (
                        <motion.div
                          initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-4 space-y-2">
                            <p className="text-gray-500 text-xs mb-3">You can add these on the next page.</p>
                            {customizations.map(opt => (
                              <div key={opt.id} className="flex items-center justify-between">
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                  <button
                                    onClick={() => toggleCustom(opt.id)}
                                    className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                                      selectedCustomIds.has(opt.id)
                                        ? 'border-green-500 bg-green-500'
                                        : 'border-gray-600 bg-transparent'
                                    }`}
                                  >
                                    {selectedCustomIds.has(opt.id) && <Check className="w-3 h-3 text-white" />}
                                  </button>
                                  <span className="text-gray-200 text-sm truncate">{opt.option_name}</span>
                                </div>
                                <span className="text-white text-sm font-medium ml-2 shrink-0">
                                  +{formatNaira(Number(opt.additional_price))}
                                </span>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {/* Delivery info */}
                <div className="flex items-start gap-3 pt-2 border-t border-gray-700">
                  <Clock className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-white font-medium text-sm">
                      {deliveryDays} days delivery — {getDeliveryDate(deliveryDays)}
                    </p>
                    <p className="text-gray-400 text-xs mt-0.5">
                      Revisions may occur after this date.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tier Comparison Table */}
        <AnimatePresence>
          {showCompareTiers && tiers.length > 1 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              className="bg-[#252525] rounded-2xl overflow-hidden"
            >
              <div className="p-4">
                <h3 className="font-bold text-white mb-3">Service Tiers</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-700">
                        <th className="text-left py-2 text-gray-400 font-medium pr-4"></th>
                        {tiers.map(tier => (
                          <th key={tier.id} className="text-center py-2 text-gray-300 font-medium px-2">
                            {tierLabels[tier.tier_name] || tier.tier_name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      <tr>
                        <td className="py-2.5 text-gray-400 pr-4 whitespace-nowrap">Price</td>
                        {tiers.map(tier => (
                          <td key={tier.id} className="py-2.5 text-center text-white font-bold px-2">
                            {formatNaira(Number(tier.price))}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2.5 text-gray-400 pr-4 whitespace-nowrap">Delivery</td>
                        {tiers.map(tier => (
                          <td key={tier.id} className="py-2.5 text-center text-white px-2">
                            {tier.delivery_days}d
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2.5 text-gray-400 pr-4 whitespace-nowrap">Revisions</td>
                        {tiers.map(tier => (
                          <td key={tier.id} className="py-2.5 text-center text-white px-2">
                            {tier.revision_count}
                          </td>
                        ))}
                      </tr>
                      {tiers.some(t => t.word_count) && (
                        <tr>
                          <td className="py-2.5 text-gray-400 pr-4 whitespace-nowrap">Words</td>
                          {tiers.map(tier => (
                            <td key={tier.id} className="py-2.5 text-center text-white px-2">
                              {tier.word_count ? tier.word_count.toLocaleString() : '—'}
                            </td>
                          ))}
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* DRIGHT Payment Protection */}
        <div className="flex items-start gap-3 py-4 border-t border-b border-gray-800">
          <ShieldCheck className="w-7 h-7 text-green-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-white">DRIGHT Payment Protection</p>
            <p className="text-gray-400 text-sm mt-0.5">
              Fund the project upfront. {sellerProfile?.full_name || 'The seller'} gets paid once you are satisfied with the work.
            </p>
          </div>
        </div>

        {/* DRIGHT Sales Team Card */}
        {product.has_dright_sales_team && (
          <div className="bg-gradient-to-br from-blue-900/40 to-indigo-900/40 rounded-2xl p-4 border border-blue-700/30 space-y-3">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-400" />
              <p className="font-bold text-white">DRIGHT Sales Support</p>
              <span className="text-xs px-1.5 py-0.5 bg-blue-500/30 text-blue-300 rounded-full font-medium">Active</span>
            </div>
            <p className="text-gray-300 text-sm">Our sales team is available to assist with your inquiry for this service.</p>
            <div className="grid grid-cols-1 gap-2">
              <ContactSeller
                productId={product.id}
                sellerId={product.uploaded_by}
                sellerName={sellerProfile?.full_name || sellerProfile?.email}
                productName={product.name}
                customLabel="Chat Sales Team"
              />
              <button className="w-full py-2.5 border border-blue-500/40 text-blue-300 rounded-xl text-sm font-medium hover:bg-blue-500/10 transition-colors flex items-center justify-center gap-2">
                <ExternalLink className="w-4 h-4" />
                Request Custom Campaign
              </button>
            </div>
          </div>
        )}

        {/* Project Description */}
        {product.description && (
          <div className="space-y-2 py-4 border-t border-gray-800">
            <h2 className="text-xl font-bold text-white">Project details</h2>
            <p className={`text-gray-300 text-sm leading-relaxed whitespace-pre-wrap ${!showFullDesc && isLongDesc ? 'line-clamp-6' : ''}`}>
              {product.description}
            </p>
            {isLongDesc && (
              <button
                onClick={() => setShowFullDesc(v => !v)}
                className="text-green-400 text-sm font-medium hover:text-green-300 transition-colors"
              >
                {showFullDesc ? 'less' : 'more'}
              </button>
            )}
          </div>
        )}

        {/* Buyer Requirements */}
        <AnimatePresence>
          {showRequirements && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              className="space-y-2 pb-2"
            >
              <label className="block text-sm font-medium text-white flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-green-400" />
                Your Requirements <span className="text-red-400">*</span>
              </label>
              <textarea
                value={requirements}
                onChange={(e) => setRequirements(e.target.value)}
                placeholder="Describe what you need from this service..."
                rows={4}
                className="w-full px-4 py-3 bg-[#252525] border border-gray-700 focus:border-green-500 rounded-xl text-white text-sm outline-none resize-none placeholder:text-gray-500 transition-colors"
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Affiliate link */}
        <button
          onClick={handleCopyAffiliate}
          className={`w-full py-3 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 ${
            copied
              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
              : 'bg-[#252525] border border-gray-700 text-gray-300 hover:border-gray-500'
          }`}
        >
          {copied ? <><Check className="w-4 h-4" />Affiliate Link Copied!</> : <><Copy className="w-4 h-4" />Copy Affiliate Link</>}
        </button>

        {/* Reviews */}
        <div className="py-4 border-t border-gray-800">
          <ProductReviews productId={product.id} productName={product.name} darkMode />
        </div>
      </div>

      {/* Sticky Bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#1a1a1a] border-t border-gray-800 px-4 pb-safe pt-3 pb-4 space-y-2 z-40"
           style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
        {/* Price summary line */}
        {selectedTier && (
          <div className="flex justify-between items-center px-1 mb-1">
            <span className="text-gray-400 text-xs">
              {tierLabels[selectedTier.tier_name] || selectedTier.tier_name} tier
              {customPrice > 0 && ` + add-ons`}
            </span>
            <span className="text-white font-bold text-sm">{formatNaira(totalPrice)}</span>
          </div>
        )}

        {user ? (
          <button
            onClick={handleContinue}
            disabled={checkoutLoading}
            className="w-full py-4 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white rounded-2xl font-bold text-base transition-colors flex items-center justify-center gap-2 disabled:opacity-60 min-h-[56px]"
          >
            {checkoutLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              `Continue (${formatNaira(totalPrice)})`
            )}
          </button>
        ) : (
          <GuestCheckout
            productId={product.id}
            productName={product.name}
            productPrice={totalPrice}
            sellerId={product.uploaded_by}
            trigger={
              <button className="w-full py-4 bg-green-500 hover:bg-green-600 text-white rounded-2xl font-bold text-base transition-colors flex items-center justify-center gap-2 min-h-[56px]">
                Continue ({formatNaira(totalPrice)})
              </button>
            }
          />
        )}

        <ContactSeller
          productId={product.id}
          sellerId={product.uploaded_by}
          sellerName={sellerProfile?.full_name || sellerProfile?.email}
          productName={product.name}
          customLabel={`Message ${sellerProfile?.full_name?.split(' ')[0] || 'Seller'}`}
          outline
        />
      </div>
    </div>
  );
}
