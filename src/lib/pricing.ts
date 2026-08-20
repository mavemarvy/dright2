import { supabase } from './supabase';

export type SalesTeamTier =
  | 'Mkt L3'
  | 'Mkt L4'
  | 'Mkt L5'
  | 'Adv A'
  | 'Adv B'
  | 'Adv C'
  | 'Adv Pro'
  | 'Adv Super'
  | 'Adv Partnership';

export type Duration = '1_week' | '2_weeks' | '1_month';

export interface SystemConfig {
  admin_task_percent: number;
  marketer_task_pcts: Record<string, number>;
  advertiser_task_pcts: Record<string, number>;
  marketer_sub_prices: Record<string, number>;
  advertiser_sub_prices: Record<string, number>;
  admin_cut_percent: number;
}

export interface PricingBreakdown {
  basePrice: number;
  adminTaskPercent: number;
  adminTaskAmount: number;
  salesTeamTaskPercent: number;
  salesTeamTaskAmount: number;
  affiliateCommissionPercent: number;
  affiliateCommissionAmount: number;
  sellerEarnings: number;
  finalPrice: number;
}

const DEFAULT_CONFIG: SystemConfig = {
  admin_task_percent: 15,
  marketer_task_pcts: { '3': 14, '4': 13, '5': 12 },
  advertiser_task_pcts: { A: 12, B: 11, C: 10, Pro: 9, Super: 8, Partnership: 7 },
  marketer_sub_prices: { '3': 4, '4': 6, '5': 10 },
  advertiser_sub_prices: { A: 15, B: 22, C: 30, Pro: 50, Super: 100, Partnership: 350 },
  admin_cut_percent: 5,
};

export async function fetchSystemConfig(): Promise<SystemConfig> {
  const { data, error } = await supabase
    .from('system_config')
    .select('*')
    .eq('singleton', true)
    .maybeSingle();

  if (error || !data) return DEFAULT_CONFIG;

  return {
    admin_task_percent: Number(data.admin_task_percent) || 15,
    marketer_task_pcts: data.marketer_task_pcts as Record<string, number>,
    advertiser_task_pcts: data.advertiser_task_pcts as Record<string, number>,
    marketer_sub_prices: data.marketer_sub_prices as Record<string, number>,
    advertiser_sub_prices: data.advertiser_sub_prices as Record<string, number>,
    admin_cut_percent: Number(data.admin_cut_percent) || 5,
  };
}

export function getTaskPercentForTier(
  tier: SalesTeamTier | null,
  config: SystemConfig
): number {
  if (!tier) return 0;

  if (tier.startsWith('Mkt')) {
    const level = tier.replace('Mkt L', '');
    return config.marketer_task_pcts[level] || 0;
  }

  if (tier.startsWith('Adv')) {
    const grade = tier.replace('Adv ', '');
    return config.advertiser_task_pcts[grade] || 0;
  }

  return 0;
}

export function calculatePricing(
  basePrice: number,
  affiliateCommissionPercent: number,
  adminTaskPercent: number,
  salesTeamTaskPercent: number,
  isFree: boolean = false
): PricingBreakdown {
  if (isFree || basePrice === 0) {
    return {
      basePrice: 0,
      adminTaskPercent: 0,
      adminTaskAmount: 0,
      salesTeamTaskPercent: 0,
      salesTeamTaskAmount: 0,
      affiliateCommissionPercent: 0,
      affiliateCommissionAmount: 0,
      sellerEarnings: 0,
      finalPrice: 0,
    };
  }
  // When a sales team is selected, their task % REPLACES the admin task % (not additive)
  const effectiveTaskPercent = salesTeamTaskPercent > 0 ? salesTeamTaskPercent : adminTaskPercent;
  const taskAmount = (basePrice * effectiveTaskPercent) / 100;
  const affiliateCommissionAmount = (basePrice * affiliateCommissionPercent) / 100;
  const sellerEarnings = basePrice - affiliateCommissionAmount;
  const finalPrice = basePrice + taskAmount;

  return {
    basePrice,
    adminTaskPercent: salesTeamTaskPercent > 0 ? 0 : adminTaskPercent,
    adminTaskAmount: salesTeamTaskPercent > 0 ? 0 : taskAmount,
    salesTeamTaskPercent,
    salesTeamTaskAmount: salesTeamTaskPercent > 0 ? taskAmount : 0,
    affiliateCommissionPercent,
    affiliateCommissionAmount,
    sellerEarnings,
    finalPrice,
  };
}

export function getSubscriptionBasePrice(
  tier: SalesTeamTier,
  config: SystemConfig
): number {
  if (tier.startsWith('Mkt')) {
    const level = tier.replace('Mkt L', '');
    return config.marketer_sub_prices[level] || 0;
  }

  if (tier.startsWith('Adv')) {
    const grade = tier.replace('Adv ', '');
    return config.advertiser_sub_prices[grade] || 0;
  }

  return 0;
}

export function getDurationMultiplier(duration: Duration): number {
  switch (duration) {
    case '1_week':
      return 1;
    case '2_weeks':
      return 2;
    case '1_month':
      return 4;
    default:
      return 1;
  }
}

export function calculateSubscriptionTotal(
  tier: SalesTeamTier,
  duration: Duration,
  config: SystemConfig
): number {
  const basePrice = getSubscriptionBasePrice(tier, config);
  const multiplier = getDurationMultiplier(duration);
  return basePrice * multiplier;
}

export function getExpiryDate(duration: Duration): string {
  const now = new Date();
  switch (duration) {
    case '1_week':
      now.setDate(now.getDate() + 7);
      break;
    case '2_weeks':
      now.setDate(now.getDate() + 14);
      break;
    case '1_month':
      now.setMonth(now.getMonth() + 1);
      break;
  }
  return now.toISOString();
}

export const ALL_TIERS: SalesTeamTier[] = [
  'Mkt L3',
  'Mkt L4',
  'Mkt L5',
  'Adv A',
  'Adv B',
  'Adv C',
  'Adv Pro',
  'Adv Super',
  'Adv Partnership',
];

export const DURATIONS: { value: Duration; label: string }[] = [
  { value: '1_week', label: '1 Week' },
  { value: '2_weeks', label: '2 Weeks' },
  { value: '1_month', label: '1 Month' },
];

export const MARKETER_WEEKLY_TARGETS: Record<number, number> = {
  0: 10,
  1: 50,
  2: 200,
  3: 250,
  4: 350,
  5: 500,
};

export const MIN_MARKETER_LEVEL_FOR_SALES_TEAM = 3;

export const ADVERTISER_REQUIREMENTS: Record<
  string,
  { totalSales: number; weeklyTarget: number; downgradeTo: string }
> = {
  A: { totalSales: 2000, weeklyTarget: 500, downgradeTo: 'marketer' },
  B: { totalSales: 5000, weeklyTarget: 500, downgradeTo: 'A' },
  C: { totalSales: 10000, weeklyTarget: 600, downgradeTo: 'B' },
  Pro: { totalSales: 50000, weeklyTarget: 1000, downgradeTo: 'B' },
  Super: { totalSales: 50000, weeklyTarget: 1000, downgradeTo: 'Pro' },
  Partnership: { totalSales: 100000, weeklyTarget: 4000, downgradeTo: 'Super' },
};

// ============================================================
// CHECKOUT PRICING ENGINE
// Handles: base price + service tier + customization options + tasks
// ============================================================

export type ProductType = 'PHYSICAL' | 'DIGITAL' | 'SERVICE';

export interface CheckoutPricingInput {
  productBasePrice: number;
  productIsFree: boolean;
  isAdminUploaded: boolean;
  affiliateCommissionPercent: number;
  adminTaskPercent: number;
  salesTeamTaskPercent: number;
  selectedTierPrice?: number;
  customizationOptions?: Array<{ additionalPrice: number }>;
}

export interface CheckoutPricingBreakdown {
  basePrice: number;
  tierPrice: number;
  customizationPrice: number;
  subtotal: number;
  affiliateCommissionAmount: number;
  adminTaskAmount: number;
  salesTeamTaskAmount: number;
  finalPrice: number;
  sellerEarnings: number;
  isFreeOrder: boolean;
}

export function calculateCheckoutPricing(input: CheckoutPricingInput): CheckoutPricingBreakdown {
  const {
    productBasePrice,
    productIsFree,
    isAdminUploaded,
    affiliateCommissionPercent,
    adminTaskPercent,
    salesTeamTaskPercent,
    selectedTierPrice = 0,
    customizationOptions = [],
  } = input;

  if (productIsFree || productBasePrice === 0) {
    return {
      basePrice: 0,
      tierPrice: 0,
      customizationPrice: 0,
      subtotal: 0,
      affiliateCommissionAmount: 0,
      adminTaskAmount: 0,
      salesTeamTaskAmount: 0,
      finalPrice: 0,
      sellerEarnings: 0,
      isFreeOrder: true,
    };
  }

  const tierPrice = selectedTierPrice;
  const customizationPrice = customizationOptions.reduce(
    (sum, opt) => sum + opt.additionalPrice,
    0
  );
  const subtotal = productBasePrice + tierPrice + customizationPrice;

  if (isAdminUploaded) {
    return {
      basePrice: productBasePrice,
      tierPrice,
      customizationPrice,
      subtotal,
      affiliateCommissionAmount: 0,
      adminTaskAmount: 0,
      salesTeamTaskAmount: 0,
      finalPrice: subtotal,
      sellerEarnings: subtotal,
      isFreeOrder: subtotal === 0,
    };
  }

  const affiliateCommissionAmount = (productBasePrice * affiliateCommissionPercent) / 100;
  const effectiveTaskPercent = salesTeamTaskPercent > 0 ? salesTeamTaskPercent : adminTaskPercent;
  const taskAmount = (productBasePrice * effectiveTaskPercent) / 100;
  const finalPrice = subtotal + taskAmount;
  const sellerEarnings = productBasePrice - affiliateCommissionAmount;

  return {
    basePrice: productBasePrice,
    tierPrice,
    customizationPrice,
    subtotal,
    affiliateCommissionAmount,
    adminTaskAmount: salesTeamTaskPercent > 0 ? 0 : taskAmount,
    salesTeamTaskAmount: salesTeamTaskPercent > 0 ? taskAmount : 0,
    finalPrice,
    sellerEarnings,
    isFreeOrder: finalPrice === 0,
  };
}
