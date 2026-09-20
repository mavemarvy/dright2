export type MarketplaceCardSize = 'micro' | 'small' | 'medium' | 'large' | 'xlarge';

export const MARKETPLACE_CARD_SIZES: MarketplaceCardSize[] = [
  'micro',
  'small',
  'medium',
  'large',
  'xlarge',
];

export const MARKETPLACE_CARD_SIZE_LABELS: Record<MarketplaceCardSize, string> = {
  micro: 'Micro',
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
  xlarge: 'Extra Large',
};

// Medium intentionally matches the marketplace layout that existed before
// the size control was added.
export const MARKETPLACE_GRID_CLASSES: Record<MarketplaceCardSize, string> = {
  micro: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6',
  small: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
  medium: 'grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  large: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3',
  xlarge: 'grid-cols-1 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-2',
};

export const MARKETPLACE_IMAGE_HEIGHT_CLASSES: Record<MarketplaceCardSize, string> = {
  micro: 'h-32 sm:h-36',
  small: 'h-40 sm:h-44',
  medium: 'h-48',
  large: 'h-56',
  xlarge: 'h-64',
};

export const MARKETPLACE_LAYOUT_STORAGE_KEY = 'dright_marketplace_card_size';

export function isMarketplaceCardSize(value: unknown): value is MarketplaceCardSize {
  return typeof value === 'string' && MARKETPLACE_CARD_SIZES.includes(value as MarketplaceCardSize);
}
