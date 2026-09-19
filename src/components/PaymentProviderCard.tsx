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

const PROVIDER_THEME: Record<string, { card: string; brand: string; accent: string }> = {
  paystack: {
    card: 'border-cyan-300 bg-cyan-50/90 dark:border-cyan-700 dark:bg-cyan-950/30',
    brand: 'bg-cyan-100 dark:bg-cyan-900/50',
    accent: 'ring-cyan-400/40 shadow-cyan-100 dark:shadow-cyan-950/30',
  },
  flutterwave: {
    card: 'border-orange-300 bg-orange-50/90 dark:border-orange-700 dark:bg-orange-950/30',
    brand: 'bg-orange-100 dark:bg-orange-900/50',
    accent: 'ring-orange-400/40 shadow-orange-100 dark:shadow-orange-950/30',
  },
  google_pay: {
    card: 'border-blue-300 bg-blue-50/90 dark:border-blue-700 dark:bg-blue-950/30',
    brand: 'bg-blue-100 dark:bg-blue-900/50',
    accent: 'ring-blue-400/40 shadow-blue-100 dark:shadow-blue-950/30',
  },
  apple_pay: {
    card: 'border-slate-400 bg-slate-100/95 dark:border-slate-600 dark:bg-slate-900/60',
    brand: 'bg-slate-200 dark:bg-black',
    accent: 'ring-slate-500/40 shadow-slate-200 dark:shadow-black/30',
  },
  stripe: {
    card: 'border-violet-300 bg-violet-50/90 dark:border-violet-700 dark:bg-violet-950/30',
    brand: 'bg-violet-100 dark:bg-violet-900/50',
    accent: 'ring-violet-400/40 shadow-violet-100 dark:shadow-violet-950/30',
  },
  wise: {
    card: 'border-lime-400 bg-lime-50/90 dark:border-lime-700 dark:bg-lime-950/30',
    brand: 'bg-lime-100 dark:bg-lime-900/50',
    accent: 'ring-lime-400/40 shadow-lime-100 dark:shadow-lime-950/30',
  },
};

function ProviderBrandMark({ provider }: { provider: PaymentProvider }) {
  if (provider.logo && /^https?:\/\//i.test(provider.logo)) {
    return <img src={provider.logo} alt="" className="h-8 max-w-[86px] object-contain" loading="lazy" />;
  }

  switch (provider.slug) {
    case 'paystack':
      return (
        <div className="flex items-center gap-2" aria-label="Paystack">
          <svg viewBox="0 0 42 42" className="w-9 h-9 shrink-0" aria-hidden="true">
            <rect x="4" y="5" width="31" height="6" rx="2" fill="#00C3F7" />
            <rect x="4" y="14" width="31" height="6" rx="2" fill="#00C3F7" />
            <rect x="4" y="23" width="23" height="6" rx="2" fill="#00C3F7" />
            <rect x="4" y="32" width="15" height="6" rx="2" fill="#00C3F7" />
          </svg>
          <span className="text-[15px] font-black tracking-tight text-[#0B2545] dark:text-white">paystack</span>
        </div>
      );
    case 'flutterwave':
      return (
        <div className="flex items-center gap-2" aria-label="Flutterwave">
          <span className="w-9 h-9 rounded-full bg-[#F5A623] text-white flex items-center justify-center font-black text-xl shadow-sm">f</span>
          <span className="text-[15px] font-black tracking-tight text-[#2B1600] dark:text-orange-100">flutterwave</span>
        </div>
      );
    case 'google_pay':
      return (
        <div className="flex items-center gap-1.5" aria-label="Google Pay">
          <span className="text-[21px] font-black text-[#4285F4]">G</span>
          <span className="text-[18px] font-bold text-gray-900 dark:text-white">Pay</span>
        </div>
      );
    case 'apple_pay':
      return (
        <div className="flex items-center gap-1" aria-label="Apple Pay">
          <span className="text-[24px] leading-none text-black dark:text-white"></span>
          <span className="text-[18px] font-bold tracking-tight text-black dark:text-white">Pay</span>
        </div>
      );
    case 'stripe':
      return <span className="text-[21px] font-black tracking-tight text-[#635BFF]" aria-label="Stripe">stripe</span>;
    case 'wise':
      return <span className="text-[19px] font-black tracking-tight text-[#163300] dark:text-lime-100" aria-label="Wise">WISE</span>;
    default:
      return <span className="text-[15px] font-black text-gray-900 dark:text-white">{provider.name}</span>;
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
  const theme = PROVIDER_THEME[provider.slug] || {
    card: 'border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-800',
    brand: 'bg-gray-100 dark:bg-gray-700',
    accent: 'ring-primary-400/30 shadow-gray-100 dark:shadow-black/20',
  };

  return (
    <button
      type="button"
      disabled={!isEnabled}
      onClick={() => isEnabled && onSelect(provider.slug)}
      aria-pressed={selected}
      className={`group relative w-full min-w-0 text-left rounded-2xl border-2 transition-all duration-200 ${theme.card} ${selected ? `ring-3 shadow-lg ${theme.accent}` : 'shadow-sm'} ${isEnabled ? 'hover:-translate-y-0.5 hover:shadow-md' : 'cursor-not-allowed'}`}
    >
      <div className="flex items-center gap-3 px-3 py-3 sm:px-4 sm:py-3.5">
        <div className={`w-[112px] sm:w-[138px] min-w-[112px] sm:min-w-[138px] min-h-[54px] rounded-xl px-2.5 flex items-center ${theme.brand}`}>
          <ProviderBrandMark provider={provider} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            {provider.badge && isEnabled && (
              <span className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-black px-2 py-1 rounded-full bg-emerald-600 text-white shadow-sm">
                <Star className="w-2.5 h-2.5 fill-current" />
                {provider.badge}
              </span>
            )}
            {isComingSoon && (
              <span className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-black px-2 py-1 rounded-full bg-gray-800 text-white dark:bg-gray-100 dark:text-gray-900 shadow-sm">
                <Lock className="w-2.5 h-2.5" /> Coming soon
              </span>
            )}
            {isMaintenance && (
              <span className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-black px-2 py-1 rounded-full bg-amber-500 text-white shadow-sm">
                <Wrench className="w-2.5 h-2.5" /> Maintenance
              </span>
            )}
          </div>

          <p className="text-[11px] sm:text-xs font-medium text-gray-700 dark:text-gray-200 mt-1 line-clamp-1">
            {provider.description}
          </p>

          {isEnabled && (
            <div className="flex items-center gap-1.5 mt-2 min-w-0 overflow-hidden">
              {methods.slice(0, 3).map((method) => (
                <span key={method} className="shrink-0 text-[9px] font-bold px-2 py-1 rounded-md bg-white/85 dark:bg-gray-900/70 text-gray-700 dark:text-gray-200 border border-white/70 dark:border-gray-700">
                  {method}
                </span>
              ))}
              <span className="hidden sm:inline-flex items-center gap-0.5 text-[9px] font-semibold text-gray-500 dark:text-gray-300 shrink-0">
                <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" /> {Number(providerRating).toFixed(1)}
              </span>
              <span className="hidden sm:inline-flex items-center gap-0.5 text-[9px] font-semibold text-gray-500 dark:text-gray-300 shrink-0">
                <Clock className="w-2.5 h-2.5" /> {procTime}
              </span>
            </div>
          )}
        </div>

        <div className={`w-7 h-7 shrink-0 rounded-full border-2 flex items-center justify-center transition-all ${selected
          ? 'border-primary-600 bg-primary-600 shadow-md'
          : isEnabled
            ? 'border-gray-500 bg-white/80 dark:bg-gray-900/60 dark:border-gray-400 group-hover:border-primary-500'
            : 'border-gray-400 bg-white/60 dark:bg-gray-900/40 dark:border-gray-500'
        }`}>
          {selected && <Check className="w-4 h-4 text-white" />}
        </div>
      </div>
    </button>
  );
}
