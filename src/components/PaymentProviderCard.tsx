import { Check, Lock, Wrench, Star, Clock } from 'lucide-react';
import type { PaymentProvider } from '../lib/paymentProviders';
import { getProviderLogo } from '../lib/paymentProviders';

interface Props {
  provider: PaymentProvider;
  selected: boolean;
  onSelect: (slug: string) => void;
  subMethods?: string[];
  rating?: number;
  processingTime?: string;
}

const PROVIDER_COLORS: Record<string, string> = {
  paystack: 'from-emerald-500 to-emerald-600',
  google_pay: 'from-blue-500 to-blue-600',
  apple_pay: 'from-gray-700 to-gray-900',
  flutterwave: 'from-orange-500 to-orange-600',
  stripe: 'from-indigo-500 to-purple-600',
  wise: 'from-green-500 to-teal-600',
};

export default function PaymentProviderCard({
  provider, selected, onSelect, subMethods, rating, processingTime,
}: Props) {
  const isEnabled = provider.status === 'enabled';
  const isMaintenance = provider.status === 'maintenance';
  const isComingSoon = provider.status === 'coming_soon';

  const methods = subMethods || (provider as unknown as { sub_methods?: string[] }).sub_methods || [];
  const providerRating = rating ?? (provider as unknown as { rating?: number }).rating ?? 5;
  const procTime = processingTime || (provider as unknown as { processing_time?: string }).processing_time || 'Instant';
  const gradient = PROVIDER_COLORS[provider.slug] || 'from-gray-400 to-gray-500';

  return (
    <button
      type="button"
      disabled={!isEnabled}
      onClick={() => isEnabled && onSelect(provider.slug)}
      className={`relative w-full text-left rounded-2xl border-2 transition-all overflow-hidden ${
        selected
          ? 'border-primary-600 bg-primary-50/50 shadow-md'
          : isEnabled
            ? 'border-gray-200 hover:border-primary-300 bg-white hover:shadow-sm'
            : 'border-gray-100 bg-gray-50 cursor-not-allowed opacity-70'
      }`}
    >
      <div className="p-4">
        <div className="flex items-center gap-3">
          {/* Premium gradient logo block */}
          <div className={`relative w-14 h-14 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-2xl flex-shrink-0 shadow-sm`}>
            <span className="filter drop-shadow-sm">{getProviderLogo(provider.slug)}</span>
            {provider.is_recommended && isEnabled && (
              <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center">
                <Check className="w-2.5 h-2.5 text-white" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-gray-900 text-sm">{provider.name}</span>
              {provider.is_recommended && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                  <Star className="w-2.5 h-2.5 fill-emerald-600" />
                  Recommended
                </span>
              )}
              {isComingSoon && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-500 uppercase tracking-wide">
                  <Lock className="w-2.5 h-2.5" />
                  Coming Soon
                </span>
              )}
              {isMaintenance && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  <Wrench className="w-2.5 h-2.5" />
                  Maintenance
                </span>
              )}
            </div>

            <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{provider.description}</p>

            {/* Sub-methods + rating + processing time */}
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {isEnabled && methods.length > 0 && (
                <div className="flex items-center gap-1.5">
                  {methods.slice(0, 4).map((method: string) => (
                    <span key={method} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                      {method}
                    </span>
                  ))}
                </div>
              )}
              {isEnabled && (
                <>
                  <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
                    <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                    {Number(providerRating).toFixed(1)}
                  </span>
                  <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
                    <Clock className="w-2.5 h-2.5" />
                    {procTime}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Selected indicator */}
          <div className={`flex items-center justify-center w-6 h-6 rounded-full border-2 flex-shrink-0 transition-all ${
            selected ? 'border-primary-600 bg-primary-600' : isEnabled ? 'border-gray-300' : 'border-gray-200'
          }`}>
            {selected && <Check className="w-3.5 h-3.5 text-white" />}
          </div>
        </div>
      </div>

      {/* Bottom accent bar for enabled providers */}
      {isEnabled && (
        <div className={`h-0.5 bg-gradient-to-r ${gradient} ${selected ? 'opacity-100' : 'opacity-30'}`} />
      )}
    </button>
  );
}
