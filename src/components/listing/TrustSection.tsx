import { Shield, Lock, RefreshCw, Users, BadgeCheck } from 'lucide-react';

interface TrustSectionProps {
  sellerVerified?: boolean;
}

export default function TrustSection({ sellerVerified }: TrustSectionProps) {
  const items = [
    sellerVerified && { icon: BadgeCheck, label: 'Verified Seller', desc: 'Identity confirmed by Dright' },
    { icon: Shield, label: 'Buyer Protection', desc: 'Safe purchases with dispute resolution' },
    { icon: Lock, label: 'Secure Payments', desc: 'Encrypted checkout process' },
    { icon: RefreshCw, label: 'Refund Policy', desc: 'Eligible for refunds per policy' },
    { icon: Users, label: 'Community Guidelines', desc: 'Follow marketplace standards' },
  ].filter(Boolean) as Array<{ icon: typeof Shield; label: string; desc: string }>;

  if (items.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
        <Shield className="w-4 h-4 text-success" />
        Safety & Trust
      </h3>
      <div className="space-y-3">
        {items.map((item, idx) => {
          const Icon = item.icon;
          return (
            <div key={idx} className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-success-muted flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-success" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{item.label}</p>
                <p className="text-xs text-gray-500">{item.desc}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
