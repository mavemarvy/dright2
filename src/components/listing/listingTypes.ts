export type ListingType =
  | 'PRODUCT'
  | 'DIGITAL'
  | 'SERVICE'
  | 'COURSE'
  | 'JOB'
  | 'CAMPAIGN'
  | 'PHYSICAL';

export interface ListingTypeConfig {
  type: ListingType;
  label: string;
  icon: string;
  primaryActionLabel: string;
  secondaryActionLabel: string;
  saveLabel: string;
  hasPrice: boolean;
  hasGallery: boolean;
  hasSpecs: boolean;
  hasReviews: boolean;
  hasQA: boolean;
  hasSellerProfile: boolean;
  hasQuantity: boolean;
  hasTiers: boolean;
  priceLabel: string;
}

const CONFIGS: Record<ListingType, ListingTypeConfig> = {
  PRODUCT: {
    type: 'PRODUCT',
    label: 'Product',
    icon: 'Package',
    primaryActionLabel: 'Buy Now',
    secondaryActionLabel: 'Add to Cart',
    saveLabel: 'Save',
    hasPrice: true,
    hasGallery: true,
    hasSpecs: true,
    hasReviews: true,
    hasQA: true,
    hasSellerProfile: true,
    hasQuantity: true,
    hasTiers: false,
    priceLabel: 'Price',
  },
  DIGITAL: {
    type: 'DIGITAL',
    label: 'Digital Product',
    icon: 'Download',
    primaryActionLabel: 'Get Now',
    secondaryActionLabel: 'Add to Cart',
    saveLabel: 'Save',
    hasPrice: true,
    hasGallery: true,
    hasSpecs: true,
    hasReviews: true,
    hasQA: true,
    hasSellerProfile: true,
    hasQuantity: false,
    hasTiers: false,
    priceLabel: 'Price',
  },
  COURSE: {
    type: 'COURSE',
    label: 'Course',
    icon: 'GraduationCap',
    primaryActionLabel: 'Enroll Now',
    secondaryActionLabel: 'Add to Cart',
    saveLabel: 'Save',
    hasPrice: true,
    hasGallery: true,
    hasSpecs: true,
    hasReviews: true,
    hasQA: true,
    hasSellerProfile: true,
    hasQuantity: false,
    hasTiers: false,
    priceLabel: 'Price',
  },
  SERVICE: {
    type: 'SERVICE',
    label: 'Service',
    icon: 'Sparkles',
    primaryActionLabel: 'Hire Now',
    secondaryActionLabel: 'Contact Provider',
    saveLabel: 'Save',
    hasPrice: true,
    hasGallery: true,
    hasSpecs: true,
    hasReviews: true,
    hasQA: true,
    hasSellerProfile: true,
    hasQuantity: false,
    hasTiers: true,
    priceLabel: 'Starting at',
  },
  JOB: {
    type: 'JOB',
    label: 'Job',
    icon: 'Briefcase',
    primaryActionLabel: 'Apply Now',
    secondaryActionLabel: 'Save Job',
    saveLabel: 'Save Job',
    hasPrice: false,
    hasGallery: false,
    hasSpecs: true,
    hasReviews: false,
    hasQA: true,
    hasSellerProfile: true,
    hasQuantity: false,
    hasTiers: false,
    priceLabel: 'Salary',
  },
  CAMPAIGN: {
    type: 'CAMPAIGN',
    label: 'Campaign',
    icon: 'Megaphone',
    primaryActionLabel: 'Join Campaign',
    secondaryActionLabel: 'Sponsor',
    saveLabel: 'Save',
    hasPrice: true,
    hasGallery: true,
    hasSpecs: true,
    hasReviews: true,
    hasQA: true,
    hasSellerProfile: true,
    hasQuantity: false,
    hasTiers: false,
    priceLabel: 'Budget',
  },
  PHYSICAL: {
    type: 'PHYSICAL',
    label: 'Physical Product',
    icon: 'Package',
    primaryActionLabel: 'Buy Now',
    secondaryActionLabel: 'Add to Cart',
    saveLabel: 'Save',
    hasPrice: true,
    hasGallery: true,
    hasSpecs: true,
    hasReviews: true,
    hasQA: true,
    hasSellerProfile: true,
    hasQuantity: true,
    hasTiers: false,
    priceLabel: 'Price',
  },
};

export function getListingConfig(type: string): ListingTypeConfig {
  const normalized = type.toUpperCase() as ListingType;
  return CONFIGS[normalized] || CONFIGS.PRODUCT;
}

export function isJobType(type: string): boolean {
  return type.toUpperCase() === 'JOB';
}

export function isServiceType(type: string): boolean {
  return type.toUpperCase() === 'SERVICE';
}
