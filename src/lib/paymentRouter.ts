import type { PaymentProvider } from './paymentProviders';
import { sortProvidersByCountry } from './countryDetection';

export type PaymentType = 'product_purchase' | 'wallet_funding' | 'subscription';

export interface RoutingInput {
  country: string;
  currency: string;
  paymentType: PaymentType;
  providers: PaymentProvider[];
}

export interface RoutingResult {
  provider: PaymentProvider | null;
  alternatives: PaymentProvider[];
  reason: string;
}

// Provider capability matrix — which providers support which payment types
const PROVIDER_CAPABILITIES: Record<string, PaymentType[]> = {
  paystack: ['product_purchase', 'wallet_funding', 'subscription'],
  flutterwave: ['product_purchase', 'wallet_funding', 'subscription'],
  stripe: ['product_purchase', 'wallet_funding', 'subscription'],
  google_pay: ['product_purchase', 'wallet_funding'],
  apple_pay: ['product_purchase', 'wallet_funding'],
  wise: [], // withdrawal-only
};

export function supportsPaymentType(slug: string, type: PaymentType): boolean {
  const caps = PROVIDER_CAPABILITIES[slug];
  return caps ? caps.includes(type) : true;
}

export function routePayment(input: RoutingInput): RoutingResult {
  const { country, currency, paymentType, providers } = input;

  // Sort by country priority
  const sorted = sortProvidersByCountry(providers, country);

  // Filter: must be enabled, support the currency, support the payment type
  const eligible = sorted.filter(
    (p) =>
      p.status === 'enabled' &&
      p.supported_currencies.includes(currency) &&
      supportsPaymentType(p.slug, paymentType)
  );

  if (eligible.length === 0) {
    // Fallback: any enabled provider that supports the payment type
    const fallback = sorted.filter(
      (p) => p.status === 'enabled' && supportsPaymentType(p.slug, paymentType)
    );
    if (fallback.length > 0) {
      return {
        provider: fallback[0],
        alternatives: fallback.slice(1),
        reason: `No provider supports ${currency} in ${country}. Using ${fallback[0].name} as fallback.`,
      };
    }
    return {
      provider: null,
      alternatives: [],
      reason: `No enabled payment provider available for ${paymentType} in ${country}.`,
    };
  }

  return {
    provider: eligible[0],
    alternatives: eligible.slice(1),
    reason: `Best provider for ${country}/${currency}: ${eligible[0].name}`,
  };
}

export function getRecommendedProvider(
  providers: PaymentProvider[],
  country: string,
  currency: string = 'NGN',
  paymentType: PaymentType = 'product_purchase'
): PaymentProvider | null {
  const result = routePayment({ country, currency, paymentType, providers });
  return result.provider;
}
