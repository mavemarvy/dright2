import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BadgeCheck, Rocket, ShieldCheck, Store, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatDisplayCurrency } from '../../lib/currency';
import { DrightMark } from '../DrightBrand';

interface OfficialStorePayload {
  available: boolean;
  store?: {
    name: string;
    slug: string;
    tagline: string;
    description: string;
    logo_url: string | null;
    banner_url: string | null;
    official: boolean;
  };
  starter_available: boolean;
  starter_product?: {
    marketplace_product_id?: string | null;
    title: string;
    subtitle: string;
    category: string;
    price: number;
    currency: string;
    affiliate_commission_percent: number;
    included_trial_days: number;
    official_rating_enabled: boolean;
    official_rating: number;
  } | null;
}

export default function DrightOfficialStoreMarketplaceCard() {
  const [payload, setPayload] = useState<OfficialStorePayload | null>(null);

  useEffect(() => {
    let alive = true;
    void supabase.rpc('get_public_dright_official_store').then(({ data, error }) => {
      if (!alive) return;
      if (error || !data || typeof data !== 'object') {
        setPayload({ available: false, starter_available: false });
        return;
      }
      const row = data as Record<string, any>;
      const starter = row.starter_product && typeof row.starter_product === 'object'
        ? {
            ...row.starter_product,
            price: Number(row.starter_product.price ?? 0),
            affiliate_commission_percent: Number(row.starter_product.affiliate_commission_percent ?? 0),
            included_trial_days: Number(row.starter_product.included_trial_days ?? 0),
            official_rating: Number(row.starter_product.official_rating ?? 0),
          }
        : null;
      setPayload({
        available: row.available === true,
        store: row.store,
        starter_available: row.starter_available === true,
        starter_product: starter,
      });
    });
    return () => { alive = false; };
  }, []);

  if (!payload?.available || !payload.store) return null;

  const { store, starter_product: starter } = payload;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
      <div className="overflow-hidden rounded-3xl border border-blue-200/60 dark:border-blue-900/70 bg-gradient-to-br from-[#071b4a] via-[#0a2b72] to-[#0c1638] text-white shadow-lg">
        <div className="p-5 sm:p-6 lg:p-7">
          <div className="flex flex-col lg:flex-row lg:items-center gap-5">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="shrink-0 rounded-2xl bg-white/10 border border-white/10 p-2">
                <DrightMark size={52} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl sm:text-2xl font-black">{store.name} Official Store</h2>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 border border-emerald-300/20 px-2.5 py-1 text-[11px] font-bold text-emerald-200">
                    <BadgeCheck className="w-3.5 h-3.5" /> Official DRIGHT Store
                  </span>
                </div>
                <p className="mt-1.5 text-sm sm:text-base text-blue-100">{store.tagline}</p>
                <p className="mt-2 text-xs sm:text-sm text-blue-200/80 max-w-2xl line-clamp-2">{store.description}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-blue-100">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/8 px-2.5 py-1">
                    <ShieldCheck className="w-3.5 h-3.5" /> First-party products
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/8 px-2.5 py-1">
                    <Store className="w-3.5 h-3.5" /> Independent of sponsored-store visibility
                  </span>
                </div>
              </div>
            </div>

            {payload.starter_available && starter ? (
              <div className="rounded-2xl border border-white/10 bg-white/8 p-4 lg:min-w-[330px]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.14em] text-blue-200 font-bold">{starter.category}</p>
                    <p className="font-black mt-1">{starter.title}</p>
                    <p className="text-xs text-blue-200/80 mt-1 line-clamp-1">{starter.subtitle}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-black">{formatDisplayCurrency(starter.price, starter.currency)}</p>
                    <p className="text-[10px] text-emerald-200 font-semibold">{starter.affiliate_commission_percent}% affiliate</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-blue-100">
                  <Users className="w-3.5 h-3.5" />
                  {starter.included_trial_days} days included access
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Link to="/dright" className="min-h-[42px] inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 font-bold text-xs">
                    Visit Store
                  </Link>
                  <Link to="/dright/starter" className="min-h-[42px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-white text-slate-950 font-black text-xs">
                    <Rocket className="w-3.5 h-3.5" /> Starter Access
                  </Link>
                </div>
              </div>
            ) : (
              <Link to="/dright" className="min-h-[46px] inline-flex items-center justify-center gap-2 rounded-xl bg-white text-slate-950 font-black px-5">
                Visit Official Store <ArrowRight className="w-4 h-4" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
