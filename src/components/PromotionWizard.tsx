import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Eye, MousePointerClick, ShoppingCart, MessageSquare,
  Briefcase, GraduationCap, Globe, MapPin, Tag, Heart, Users,
  Calendar, DollarSign, TrendingUp, Target, Check, ChevronRight,
  ChevronLeft, Sparkles, Loader2, Zap,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { usePricing, usePackages, useCreateCampaign } from '../lib/promotionHooks';
import {
  type CampaignGoal, type AudienceType, type PromotionPackage,
  calculateReach, calculateFromAudienceSize,
} from '../lib/promotionEngine';
import { formatCurrency } from '../lib/currency';

interface PromotionWizardProps {
  listingId: string;
  listingType: string;
  listingName: string;
  listingCategory: string;
  onClose: () => void;
  onCampaignCreated?: (campaignId: string) => void;
}

const GOALS: { value: CampaignGoal; label: string; icon: typeof Eye; description: string }[] = [
  { value: 'more_views', label: 'More Views', icon: Eye, description: 'Increase listing visibility' },
  { value: 'more_clicks', label: 'More Clicks', icon: MousePointerClick, description: 'Drive traffic to your listing' },
  { value: 'more_sales', label: 'More Sales', icon: ShoppingCart, description: 'Boost purchases' },
  { value: 'more_messages', label: 'More Messages', icon: MessageSquare, description: 'Get more buyer inquiries' },
  { value: 'more_job_applications', label: 'More Job Applications', icon: Briefcase, description: 'Attract candidates' },
  { value: 'more_course_enrollments', label: 'More Course Enrollments', icon: GraduationCap, description: 'Increase enrollments' },
];

const AUDIENCES: { value: AudienceType; label: string; icon: typeof Globe }[] = [
  { value: 'everyone', label: 'Everyone', icon: Globe },
  { value: 'country', label: 'Country', icon: MapPin },
  { value: 'state', label: 'State/Province', icon: MapPin },
  { value: 'city', label: 'City', icon: MapPin },
  { value: 'category', label: 'Category', icon: Tag },
  { value: 'interests', label: 'User Interests', icon: Heart },
  { value: 'followers', label: 'Existing Followers', icon: Users },
];

const DURATIONS = [1, 3, 7, 14, 30];

export default function PromotionWizard({
  listingId, listingType, listingName, listingCategory, onClose, onCampaignCreated,
}: PromotionWizardProps) {
  const { user } = useAuth();
    const { pricing, loading: pricingLoading } = usePricing();
  const { packages, loading: packagesLoading } = usePackages();
  const { create, creating } = useCreateCampaign();

  const [step, setStep] = useState(1);
  const [goal, setGoal] = useState<CampaignGoal>('more_views');
  const [audience, setAudience] = useState<AudienceType>('everyone');
  const [audienceCountry, setAudienceCountry] = useState('');
  const [audienceCategory, setAudienceCategory] = useState(listingCategory);
  const [duration, setDuration] = useState(7);
  const [customDuration, setCustomDuration] = useState(false);
  const [customDays, setCustomDays] = useState(7);
  const [budget, setBudget] = useState(15);
  const [selectedPackage, setSelectedPackage] = useState<PromotionPackage | null>(null);
  const [useCustomBudget, setUseCustomBudget] = useState(false);
  const [targetAudienceSize, setTargetAudienceSize] = useState(2000);
  const [createdCampaignId, setCreatedCampaignId] = useState<string | null>(null);


  const actualDuration = customDuration ? customDays : duration;
  const actualBudget = selectedPackage && !useCustomBudget ? selectedPackage.price : budget;

  const estimate = useMemo(() => {
    if (!pricing) return { estimated_impressions: 0, estimated_clicks: 0, estimated_reach: 0, estimated_conversions: 0, total_cost: 0 };
    if (useCustomBudget) {
      return calculateReach(actualBudget, pricing);
    }
    return calculateReach(actualBudget, pricing);
  }, [pricing, actualBudget, actualDuration, useCustomBudget]);

  const audienceEstimate = useMemo(() => {
    if (!pricing) return null;
    return calculateFromAudienceSize(targetAudienceSize, pricing);
  }, [pricing, targetAudienceSize]);

  const handleCreate = async () => {
    if (!user || !pricing) return;
    const campaign = await create(user.id, {
      listing_id: listingId,
      listing_type: listingType,
      goal,
      audience_type: audience,
      audience_country: audience === 'country' ? audienceCountry : undefined,
      audience_category: audience === 'category' ? audienceCategory : undefined,
      budget: actualBudget,
      duration_days: actualDuration,
      package_id: selectedPackage?.id,
    }, pricing);
    if (campaign) {
      setCreatedCampaignId(campaign.id);
      onCampaignCreated?.(campaign.id);
    }
  };

  const steps = ['Goal', 'Audience', 'Duration', 'Budget', 'Review'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-blue-500 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900">Promote Listing</h2>
              <p className="text-xs text-gray-400 truncate max-w-[200px]">{listingName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center px-6 py-3 border-b border-gray-50">
          {steps.map((label, i) => (
            <div key={label} className="flex items-center flex-1">
              <div className={`flex items-center gap-2 ${step >= i + 1 ? 'text-primary-600' : 'text-gray-400'}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  step > i + 1 ? 'bg-primary-600 text-white' : step === i + 1 ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-400'
                }`}>
                  {step > i + 1 ? <Check className="w-4 h-4" /> : i + 1}
                </div>
                <span className="text-xs font-medium hidden sm:inline">{label}</span>
              </div>
              {i < steps.length - 1 && <div className={`flex-1 h-0.5 mx-2 rounded ${step > i + 1 ? 'bg-primary-500' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {pricingLoading || packagesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
            </div>
          ) : createdCampaignId ? (
            <div className="text-center py-8">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-16 h-16 rounded-full bg-success-muted mx-auto mb-4 flex items-center justify-center">
                <Check className="w-8 h-8 text-success" />
              </motion.div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Campaign Created!</h3>
              <p className="text-sm text-gray-500 mb-4">Your campaign has been created and is pending payment.</p>
              <p className="text-xs text-gray-400 mb-6">Campaign ID: {createdCampaignId.slice(0, 8)}</p>
              <button onClick={onClose} className="px-6 py-3 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 transition-colors">
                Done
              </button>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              {/* Step 1: Goal */}
              {step === 1 && (
                <motion.div key="goal" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <h3 className="font-semibold text-gray-900 mb-4">What do you want to achieve?</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {GOALS.map(g => (
                      <button
                        key={g.value}
                        onClick={() => setGoal(g.value)}
                        className={`p-4 rounded-2xl border-2 text-left transition-all ${
                          goal === g.value ? 'border-primary-500 bg-primary-50' : 'border-gray-100 hover:border-gray-200'
                        }`}
                      >
                        <g.icon className={`w-6 h-6 mb-2 ${goal === g.value ? 'text-primary-600' : 'text-gray-400'}`} />
                        <p className="font-medium text-sm text-gray-900">{g.label}</p>
                        <p className="text-xs text-gray-400">{g.description}</p>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Step 2: Audience */}
              {step === 2 && (
                <motion.div key="audience" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <h3 className="font-semibold text-gray-900 mb-4">Who should see your promotion?</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {AUDIENCES.map(a => (
                      <button
                        key={a.value}
                        onClick={() => setAudience(a.value)}
                        className={`p-3 rounded-2xl border-2 text-center transition-all ${
                          audience === a.value ? 'border-primary-500 bg-primary-50' : 'border-gray-100 hover:border-gray-200'
                        }`}
                      >
                        <a.icon className={`w-5 h-5 mx-auto mb-1 ${audience === a.value ? 'text-primary-600' : 'text-gray-400'}`} />
                        <span className="text-xs font-medium text-gray-700">{a.label}</span>
                      </button>
                    ))}
                  </div>
                  {audience === 'country' && (
                    <input type="text" placeholder="e.g. United States" value={audienceCountry} onChange={e => setAudienceCountry(e.target.value)} className="mt-4 w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary-500" />
                  )}
                  {audience === 'category' && (
                    <input type="text" placeholder="Category" value={audienceCategory} onChange={e => setAudienceCategory(e.target.value)} className="mt-4 w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary-500" />
                  )}
                  {audience === 'followers' && (
                    <p className="mt-4 text-sm text-gray-500 bg-blue-50 rounded-xl p-3">Your promotion will only be shown to users who already follow your store.</p>
                  )}
                </motion.div>
              )}

              {/* Step 3: Duration */}
              {step === 3 && (
                <motion.div key="duration" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <h3 className="font-semibold text-gray-900 mb-4">How long should it run?</h3>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                    {DURATIONS.map(d => (
                      <button
                        key={d}
                        onClick={() => { setDuration(d); setCustomDuration(false); }}
                        className={`p-4 rounded-2xl border-2 text-center transition-all ${
                          !customDuration && duration === d ? 'border-primary-500 bg-primary-50' : 'border-gray-100 hover:border-gray-200'
                        }`}
                      >
                        <Calendar className={`w-5 h-5 mx-auto mb-1 ${!customDuration && duration === d ? 'text-primary-600' : 'text-gray-400'}`} />
                        <span className="text-sm font-bold text-gray-900">{d}</span>
                        <span className="text-xs text-gray-400 block">{d === 1 ? 'Day' : 'Days'}</span>
                      </button>
                    ))}
                    <button
                      onClick={() => setCustomDuration(true)}
                      className={`p-4 rounded-2xl border-2 text-center transition-all ${
                        customDuration ? 'border-primary-500 bg-primary-50' : 'border-gray-100 hover:border-gray-200'
                      }`}
                    >
                      <Sparkles className={`w-5 h-5 mx-auto mb-1 ${customDuration ? 'text-primary-600' : 'text-gray-400'}`} />
                      <span className="text-sm font-bold text-gray-900">Custom</span>
                    </button>
                  </div>
                  {customDuration && (
                    <div className="mt-4">
                      <label className="text-sm text-gray-500 block mb-2">Custom duration (days)</label>
                      <input type="number" min={1} max={90} value={customDays} onChange={e => setCustomDays(Math.max(1, Math.min(90, Number(e.target.value))))} className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary-500" />
                    </div>
                  )}
                </motion.div>
              )}

              {/* Step 4: Budget */}
              {step === 4 && (
                <motion.div key="budget" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <div className="flex items-center gap-2 mb-4">
                    <button onClick={() => setUseCustomBudget(false)} className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${!useCustomBudget ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Packages</button>
                    <button onClick={() => setUseCustomBudget(true)} className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${useCustomBudget ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Custom Budget</button>
                  </div>

                  {!useCustomBudget ? (
                    <div className="space-y-3">
                      {packages.map(pkg => (
                        <button
                          key={pkg.id}
                          onClick={() => setSelectedPackage(pkg)}
                          className={`w-full p-4 rounded-2xl border-2 text-left transition-all ${
                            selectedPackage?.id === pkg.id ? 'border-primary-500 bg-primary-50' : 'border-gray-100 hover:border-gray-200'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-bold text-gray-900">{pkg.name}</p>
                              <p className="text-xs text-gray-400">{pkg.description}</p>
                            </div>
                            <span className="text-lg font-bold text-primary-600">{formatCurrency(pkg.price)}</span>
                          </div>
                          <div className="flex flex-wrap gap-2 mt-2">
                            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">{pkg.estimated_reach.toLocaleString()} reach</span>
                            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">{pkg.estimated_impressions.toLocaleString()} impressions</span>
                            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">{pkg.estimated_clicks.toLocaleString()} clicks</span>
                            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">{pkg.duration_days} days</span>
                            {pkg.bonus_impressions > 0 && <span className="text-xs text-success bg-success-muted px-2 py-1 rounded-full">+{pkg.bonus_impressions} bonus</span>}
                            {pkg.bonus_recommendation_exposure && <span className="text-xs text-primary-600 bg-primary-50 px-2 py-1 rounded-full">+Recommendation boost</span>}
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div>
                      <label className="text-sm text-gray-500 block mb-2">Budget ({pricing?.currency || 'USD'})</label>
                      <div className="flex items-center gap-3 mb-4">
                        <span className="text-2xl font-bold text-gray-400">{pricing?.currency === 'USD' ? '$' : ''}</span>
                        <input type="number" min={pricing?.daily_minimum_budget || 1} max={pricing?.maximum_campaign_budget || 5000} step={1} value={budget} onChange={e => setBudget(Math.max(pricing?.daily_minimum_budget || 1, Number(e.target.value)))} className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-lg font-bold focus:outline-none focus:border-primary-500" />
                      </div>

                      <div className="bg-gray-50 rounded-2xl p-4 mb-4">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Or target a specific audience size</p>
                        <div className="flex flex-wrap gap-2 mb-3">
                          {[500, 2500, 10000, 50000, 100000].map(size => (
                            <button key={size} onClick={() => setTargetAudienceSize(size)} className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${targetAudienceSize === size ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
                              {size.toLocaleString()}
                            </button>
                          ))}
                        </div>
                        {audienceEstimate && (
                          <div className="flex items-center gap-2 text-sm">
                            <Target className="w-4 h-4 text-primary-500" />
                            <span className="text-gray-600">Reach {targetAudienceSize.toLocaleString()} → Budget needed: <strong className="text-primary-600">{formatCurrency(audienceEstimate.budget_needed)}</strong></span>
                            <button onClick={() => setBudget(audienceEstimate.budget_needed)} className="text-xs text-primary-600 font-medium hover:underline">Use this</button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Live estimates */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                    <div className="bg-blue-50 rounded-xl p-3 text-center">
                      <Eye className="w-4 h-4 text-blue-500 mx-auto mb-1" />
                      <p className="text-xs text-gray-400">Impressions</p>
                      <p className="text-sm font-bold text-gray-900">{estimate.estimated_impressions.toLocaleString()}</p>
                    </div>
                    <div className="bg-purple-50 rounded-xl p-3 text-center">
                      <MousePointerClick className="w-4 h-4 text-purple-500 mx-auto mb-1" />
                      <p className="text-xs text-gray-400">Clicks</p>
                      <p className="text-sm font-bold text-gray-900">{estimate.estimated_clicks.toLocaleString()}</p>
                    </div>
                    <div className="bg-green-50 rounded-xl p-3 text-center">
                      <Users className="w-4 h-4 text-green-500 mx-auto mb-1" />
                      <p className="text-xs text-gray-400">Reach</p>
                      <p className="text-sm font-bold text-gray-900">{estimate.estimated_reach.toLocaleString()}</p>
                    </div>
                    <div className="bg-amber-50 rounded-xl p-3 text-center">
                      <ShoppingCart className="w-4 h-4 text-amber-500 mx-auto mb-1" />
                      <p className="text-xs text-gray-400">Conversions</p>
                      <p className="text-sm font-bold text-gray-900">{estimate.estimated_conversions.toLocaleString()}</p>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Step 5: Review */}
              {step === 5 && (
                <motion.div key="review" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <h3 className="font-semibold text-gray-900 mb-4">Review your campaign</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between py-2 border-b border-gray-50">
                      <span className="text-sm text-gray-500">Goal</span>
                      <span className="text-sm font-medium text-gray-900">{GOALS.find(g => g.value === goal)?.label}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-gray-50">
                      <span className="text-sm text-gray-500">Audience</span>
                      <span className="text-sm font-medium text-gray-900">{AUDIENCES.find(a => a.value === audience)?.label}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-gray-50">
                      <span className="text-sm text-gray-500">Duration</span>
                      <span className="text-sm font-medium text-gray-900">{actualDuration} days</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-gray-50">
                      <span className="text-sm text-gray-500">Budget</span>
                      <span className="text-sm font-bold text-primary-600">{formatCurrency(actualBudget)}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-gray-50">
                      <span className="text-sm text-gray-500">Est. Impressions</span>
                      <span className="text-sm font-medium text-gray-900">{estimate.estimated_impressions.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-gray-50">
                      <span className="text-sm text-gray-500">Est. Clicks</span>
                      <span className="text-sm font-medium text-gray-900">{estimate.estimated_clicks.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-gray-50">
                      <span className="text-sm text-gray-500">Est. Reach</span>
                      <span className="text-sm font-medium text-gray-900">{estimate.estimated_reach.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm text-gray-500">Est. Conversions</span>
                      <span className="text-sm font-medium text-gray-900">{estimate.estimated_conversions.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="bg-amber-50 rounded-xl p-3 mt-4 flex items-start gap-2">
                    <Zap className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-gray-600">Campaign will be created as pending. It activates automatically after payment is confirmed.</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>

        {/* Footer */}
        {!createdCampaignId && !pricingLoading && !packagesLoading && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
            <button
              onClick={() => step > 1 && setStep(step - 1)}
              disabled={step === 1 || creating}
              className="flex items-center gap-1 px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            {step < 5 ? (
              <button
                onClick={() => setStep(step + 1)}
                className="flex items-center gap-1 px-6 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 transition-colors"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex items-center gap-2 px-6 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
                {creating ? 'Creating...' : `Create Campaign · ${formatCurrency(actualBudget)}`}
              </button>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
