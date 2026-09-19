import { Check, Lock, Wrench, Star, Clock } from 'lucide-react';
import type { PaymentProvider } from '../lib/paymentProviders';

interface Props {
  provider: PaymentProvider;
  selected: boolean;
  onSelect: (slug: string) => void;
  subMethods?: string[];
  rating?: number;
  processingTime?: string;
}

function ProviderBrandMark({ provider }: { provider: PaymentProvider }) {
  if (provider.logo && /^https?:\/\//i.test(provider.logo)) {
    return (
      <img
        src={provider.logo}
        alt=""
        className="h-8 max-w-[82px] object-contain"
        loading="lazy"
      />
    );
  }

  switch (provider.slug) {
    case 'paystack':
      return (
        <div className="flex items-center gap-2" aria-label="Paystack">
          <svg viewBox="0 0 42 42" className="w-8 h-8" aria-hidden="true">
            <rect x="4" y="5" width="31" height="6" rx="2" fill="#00C3F7" />
            <rect x="4" y="14" width="31" height="6" rx="2" fill="#00C3F7" />
            <rect x="4" y="23" width="23" height="6" rx="2" fill="#00C3F7" />
            <rect x="4" y="32" width="15" height="6" rx="2" fill="#00C3F7" />
          </svg>
          <span className="text-[15px] font-extrabold tracking-tight text-[#0B2545] dark:text-white">paystack</span>
        </div>
      );
    case 'flutterwave':
      return (
        <div className="flex items-center gap-2" aria-label="Flutterwave">
          <span className="w-8 h-8 rounded-full bg-[#F5A623] text-white flex items-center justify-center font-black text-lg">f</span>
          <span className="text-[15px] font-extrabold tracking-tight text-gray-900 dark:text-white">flutterwave</span>
        </div>
      );
    case 'google_pay':
      return (
        <div className="flex items-center gap-1.5" aria-label="Google Pay">
          <span className="text-[19px] font-black">
            <span className="text-[#4285F4]">G</span>
          </span>
          <span className="text-[17px] font-semibold text-gray-900 dark:text-white">Pay</span>
        </div>
      );
    case 'apple_pay':
      return (
        <div className="flex items-center gap-1" aria-label="Apple Pay">
          <span className="text-[22px] leading-none text-gray-950 dark:text-white"></span>
          <span className="text-[17px] font-semibold tracking-tight text-gray-950 dark:text-white">Pay</span>
        </div>
      );
    case 'stripe':
      return <span className="text-[20px] font-black tracking-tight text-[#635BFF]" aria-label="Stripe">stripe</span>;
    case 'wise':
      return <span className="text-[18px] font-black tracking-tight text-[#163300]" aria-label="Wise">WISE</span>;
    default:
      return <span className="text-[15px] font-bold text-gray-900 dark:text-white">{provider.name}</span>;
  }
}

export default function PaymentProviderCard({
  provider, selected, onSelect, subMethods, rating, processingTime,
}: Props) {
  const isEnabled = provider.status === 'enabled';
  const isMaintenance = provider.status === 'maintenance';
  const isComingSoon = provider.status === 'coming_soon';
  const methods = subMethods || provider.sub_methods || [];
  const providerRating = rating ?? provider.rating ?? 5;
  const procTime = processingTime || provider.processing_time || 'Instant';

  return (
    <button
      type="button"
      disabled={!isEnabled}
      onClick={() => isEnabled && onSelect(provider.slug)}
      aria-pressed={selected}
      className={`group relative w-full min-w-0 text-left rounded-xl border transition-all duration-200 ${selected
        ? 'border-primary-500 bg-primary-50/70 dark:bg-primary-950/20 ring-2 ring-primary-500/15 shadow-sm'
        : isEnabled
          ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-primary-300 dark:hover:border-primary-700'
          : 'border-gray-200/80 dark:border-gray-700/70 bg-gray-50/80 dark:bg-gray-800/50 opacity-65 cursor-not-allowed'
      }`}
    >
      <div className="flex items-center gap-3 px-3 py-3 sm:px-4 sm:py-3.5">
        <div className="w-[104px] sm:w-[124px] min-w-[104px] sm:min-w-[124px] flex items-center">
          <ProviderBrandMark provider={provider} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            {provider.badge && isEnabled && (
              <span className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                <Star className="w-2.5 h-2.5 fill-current" />
                {provider.badge}
              </span>
            )}
            {isComingSoon && (
              <span className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                <Lock className="w-2.5 h-2.5" /> Coming soon
              </span>
            )}
            {isMaintenance && (
              <span className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                <Wrench className="w-2.5 h-2.5" /> Maintenance
              </span>
            )}
          </div>

          <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-1">
            {provider.description}
          </p>

          {isEnabled && (
            <div className="flex items-center gap-2 mt-1.5 min-w-0 overflow-hidden">
              {methods.slice(0, 3).map((method) => (
                <span key={method} className="shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                  {method}
                </span>
              ))}
              <span className="hidden sm:inline-flex items-center gap-0.5 text-[9px] text-gray-400 shrink-0">
                <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" /> {Number(providerRating).toFixed(1)}
              </span>
              <span className="hidden sm:inline-flex items-center gap-0.5 text-[9px] text-gray-400 shrink-0">
                <Clock className="w-2.5 h-2.5" /> {procTime}
              </span>
            </div>
          )}
        </div>

        <div className={`w-6 h-6 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors ${selected
          ? 'border-primary-600 bg-primary-600'
          : isEnabled
            ? 'border-gray-300 dark:border-gray-600 group-hover:border-primary-400'
            : 'border-gray-300 dark:border-gray-700'
        }`}>
          {selected && <Check className="w-3.5 h-3.5 text-white" />}
        </div>
      </div>
    </button>
  );
}
