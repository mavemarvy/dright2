import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, LockKeyhole, ShoppingBag } from 'lucide-react';
import { canUsePlatformFeature, getMyPlatformAccess, type PlatformAccessStatus } from '../lib/platformAccess';

interface Props {
  featureKey: string;
  children: ReactNode;
  title?: string;
}

export default function PlatformFeatureGate({ featureKey, children, title }: Props) {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [status, setStatus] = useState<PlatformAccessStatus | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      canUsePlatformFeature(featureKey),
      getMyPlatformAccess(),
    ]).then(([canUse, access]) => {
      if (!active) return;
      setAllowed(canUse);
      setStatus(access);
    });
    return () => { active = false; };
  }, [featureKey]);

  if (allowed === null) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-primary-600" />
      </div>
    );
  }

  if (allowed) return <>{children}</>;

  const subscribeHref = status?.plan_id
    ? `/subscriptions/checkout?plan_id=${status.plan_id}`
    : '/subscriptions';

  return (
    <div className="max-w-xl mx-auto p-4 md:p-8">
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 md:p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-primary-50 flex items-center justify-center mx-auto mb-4">
          <LockKeyhole className="w-7 h-7 text-primary-600" />
        </div>
        <h1 className="text-xl font-bold text-gray-900">
          {title || 'DRIGHT Platform Subscription Required'}
        </h1>
        <p className="text-sm text-gray-500 mt-2">
          Your free professional-access period has ended for this feature. Subscribe monthly to continue using this role tool.
        </p>

        <div className="mt-5 rounded-2xl bg-emerald-50 border border-emerald-100 p-4 text-left">
          <div className="flex items-start gap-3">
            <ShoppingBag className="w-5 h-5 text-emerald-600 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-emerald-900">Buyer access remains free</p>
              <p className="text-xs text-emerald-700 mt-1">
                You can still browse the marketplace, buy items, manage purchases, and use buyer features without this subscription.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
          <Link
            to={subscribeHref}
            className="py-3 px-4 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-semibold"
          >
            View Platform Subscription
          </Link>
          <Link
            to="/market"
            className="py-3 px-4 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold"
          >
            Continue as Buyer
          </Link>
        </div>
      </div>
    </div>
  );
}
