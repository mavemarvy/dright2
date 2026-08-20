import type { ReferralTier, ReferralTierInfo } from './types';

const TIER_CONFIG = [
  { tier: 'bronze' as const, label: 'Bronze', icon: '🥉', min: 1, max: 5, reward: '5% bonus on all affiliate earnings' },
  { tier: 'silver' as const, label: 'Silver', icon: '🥈', min: 6, max: 15, reward: '10% bonus on all affiliate earnings + priority support' },
  { tier: 'gold' as const, label: 'Gold', icon: '🥇', min: 16, max: null, reward: '15% bonus on all affiliate earnings + VIP badge + early access' },
];

export function getReferralTier(referralCount: number): ReferralTierInfo {
  if (referralCount === 0) {
    return {
      tier: 'none' as ReferralTier,
      label: 'No Tier',
      icon: '⭐',
      minReferrals: 0,
      maxReferrals: 0,
      nextTierMin: 1,
      progress: 0,
      reward: 'Start referring to unlock Bronze tier rewards',
      commissionBonus: 0,
      color: 'gray',
      badge: '—',
    };
  }

  const config = TIER_CONFIG.find(t => referralCount >= t.min && (t.max === null || referralCount <= t.max)) || TIER_CONFIG[0];
  const tierIndex = TIER_CONFIG.indexOf(config);
  const nextTier = tierIndex < TIER_CONFIG.length - 1 ? TIER_CONFIG[tierIndex + 1] : null;

  let progress: number;
  if (config.max === null) {
    progress = 100;
  } else {
    const range = config.max - config.min + 1;
    const current = referralCount - config.min + 1;
    progress = Math.min(100, Math.round((current / range) * 100));
  }

  return {
    tier: config.tier,
    label: config.label,
    icon: config.icon,
    minReferrals: config.min,
    maxReferrals: config.max,
    nextTierMin: nextTier?.min ?? null,
    progress,
    reward: config.reward,
  };
}

export function getReferralsToNextTier(referralCount: number): number | null {
  const tier = getReferralTier(referralCount);
  if ((tier.nextTierMin ?? 0) === null) return null;
  return Math.max(0, (tier.nextTierMin ?? 0) - referralCount);
}
